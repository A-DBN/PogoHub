import 'server-only';
import { prisma } from '@/server/db';
import { calcStats, rank1 } from '@/lib/pogo/stats';
import { loadEvolutionIndex, evolutionLine, type EvolutionNode } from './evolution';
import type { MetaCategory } from '@/generated/prisma/enums';

export type MoveView = {
  moveId: string;
  nameFr: string;
  nameEn: string;
  type: string;
  isElite: boolean;
  count?: number;
  usage?: number;
};

export type MetaRow = {
  id: string;
  rank: number;
  /** Nulle pour une ligne ajoutée à la main : PvPoke ne l'a pas simulée. */
  score: number | null;
  speciesId: string;
  nameFr: string;
  nameEn: string;
  formFr: string | null;
  form: string | null;
  isShadow: boolean;
  dex: number;
  iconFile: string;
  types: string[];
  level: number;
  ivs: [number, number, number];
  cp: number;
  atk: number;
  def: number;
  hp: number;
  statProduct: number;
  /** Stats de base : sans elles, l'éditeur ne peut pas recalculer le PC. */
  base: [number, number, number];
  // Références, pas objets : les noms d'attaques et d'espèces vivent dans les
  // dictionnaires renvoyés à côté. Répétés ligne par ligne, ils pesaient à eux
  // seuls la majeure partie des 2,5 Mo de la page.
  fast: MoveRef | null;
  charged: MoveRef[];
  altFast: MoveRef[];
  altCharged: MoveRef[];
  /** speciesId de la lignée, résolus via `species`. */
  evolution: string[];
};

/** Attaque référencée : identifiant + ce qui dépend de la ligne. */
export type MoveRef = {
  id: string;
  /** attaque exclusive pour cette espèce */
  elite?: boolean;
  /** part d'usage en % (alternatives seulement) */
  pct?: number;
  /** nombre d'attaques rapides pour charger celle-ci */
  count?: number;
};

/** Espèce citée dans une lignée. `current` dépend de la ligne, pas de l'espèce. */
export type SpeciesRef = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  iconFile: string;
};

export type MetaDictionaries = {
  moves: Record<string, { nameFr: string; nameEn: string; type: string }>;
  species: Record<string, SpeciesRef>;
};

type MoveUses = {
  fastMoves?: Array<{ moveId: string; uses: number }>;
  chargedMoves?: Array<{ moveId: string; uses: number }>;
};

/** Le survol n'en montre que cinq : inutile d'envoyer le reste. */
const ALTERNATIVES_SHOWN = 5;

const ivKey = (cpLimit: number | null) =>
  cpLimit == null ? 'cp10000' : `cp${cpLimit}`;

export async function getMetaList(
  leagueKey: string,
  category: MetaCategory = 'OVERALL',
  limit = 500,
) {
  const league = await prisma.league.findUnique({ where: { key: leagueKey } });
  if (!league) return null;

  const [entries, moves, snapshot, evoIndex] = await Promise.all([
    prisma.metaEntry.findMany({
      where: { leagueId: league.id, category },
      orderBy: { rank: 'asc' },
      take: limit,
      include: {
        pokemon: {
          select: {
            speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
            isShadow: true, dex: true, iconFile: true, types: true, defaultIvs: true,
            baseAtk: true, baseDef: true, baseHp: true, eliteMoves: true,
          },
        },
      },
    }),
    prisma.move.findMany({
      select: { moveId: true, nameFr: true, nameEn: true, type: true, energy: true, energyGain: true },
    }),
    prisma.metaSnapshot.findFirst({
      where: { leagueId: league.id, isCurrent: true },
      orderBy: { takenAt: 'desc' },
    }),
    loadEvolutionIndex(),
  ]);

  const moveMap = new Map(moves.map((m) => [m.moveId, m]));
  // On n'envoie au client que les attaques et espèces réellement citées.
  const usedMoves = new Set<string>();
  const usedSpecies = new Set<string>();

  const rows: MetaRow[] = entries.map((entry) => {
    const p = entry.pokemon;
    const base = { atk: p.baseAtk, def: p.baseDef, hp: p.baseHp };
    const elite = new Set(p.eliteMoves);

    // Un spread corrigé à la main prime sur le calcul PvPoke.
    const override = (entry.ivs ?? null) as number[] | null;
    const spreads = (p.defaultIvs ?? null) as Record<string, number[]> | null;
    const spread = override ?? spreads?.[ivKey(league.cpLimit)];
    const line = spread
      ? calcStats(base, { atk: spread[1], def: spread[2], hp: spread[3] }, spread[0])
      : rank1(base, league.cpLimit);

    const moveset = (entry.moveset ?? []) as string[];
    const uses = (entry.moveUses ?? {}) as MoveUses;

    const toView = (moveId: string, usage?: number, fastGain?: number): MoveRef | null => {
      const move = moveMap.get(moveId);
      if (!move) return null;
      usedMoves.add(moveId);
      return {
        id: moveId,
        elite: elite.has(moveId) || undefined,
        pct: usage,
        count:
          fastGain && move.energy
            ? Math.ceil(move.energy / Math.max(1, fastGain))
            : undefined,
      };
    };

    const fastMove = moveset[0] ? moveMap.get(moveset[0]) : undefined;
    const gain = fastMove?.energyGain ?? 0;

    const percent = (list: Array<{ moveId: string; uses: number }> = []) => {
      const total = list.reduce((sum, m) => sum + m.uses, 0) || 1;
      return [...list]
        .sort((a, b) => b.uses - a.uses)
        .map((m) => ({ moveId: m.moveId, pct: Math.round((m.uses / total) * 100) }));
    };

    return {
      id: entry.id,
      rank: entry.rank,
      score: entry.score,
      speciesId: p.speciesId,
      nameFr: p.nameFr,
      nameEn: p.nameEn,
      form: p.form,
      formFr: p.formFr,
      isShadow: p.isShadow,
      dex: p.dex,
      iconFile: p.iconFile,
      types: p.types,
      level: line.level,
      ivs: [line.ivs.atk, line.ivs.def, line.ivs.hp] as [number, number, number],
      cp: line.cp,
      atk: line.atk,
      def: line.def,
      hp: line.hp,
      statProduct: line.statProduct,
      base: [p.baseAtk, p.baseDef, p.baseHp],
      fast: moveset[0] ? toView(moveset[0]) : null,
      charged: moveset
        .slice(1)
        .map((id) => toView(id, undefined, gain))
        .filter((m): m is MoveRef => m !== null),
      // seules les cinq premières alternatives sont affichées au survol :
      // en envoyer trente par ligne ne servait à rien
      altFast: percent(uses.fastMoves)
        .slice(0, ALTERNATIVES_SHOWN)
        .map((m) => toView(m.moveId, m.pct))
        .filter((m): m is MoveRef => m !== null),
      altCharged: percent(uses.chargedMoves)
        .slice(0, ALTERNATIVES_SHOWN)
        .map((m) => toView(m.moveId, m.pct, gain))
        .filter((m): m is MoveRef => m !== null),
      evolution: evolutionLine(evoIndex, p.speciesId).map((node) => {
        usedSpecies.add(node.speciesId);
        return node.speciesId;
      }),
    };
  });

  const dictionaries: MetaDictionaries = {
    moves: Object.fromEntries(
      [...usedMoves].flatMap((id) => {
        const move = moveMap.get(id);
        return move
          ? [[id, { nameFr: move.nameFr, nameEn: move.nameEn, type: move.type }] as const]
          : [];
      }),
    ),
    species: Object.fromEntries(
      [...usedSpecies].flatMap((id) => {
        const node = evoIndex.get(id);
        if (!node) return [];
        // `parentSpeciesId` et `evolutionIds` ne servent qu'au calcul serveur
        const { speciesId, nameFr, nameEn, form, formFr, iconFile } = node;
        return [[id, { speciesId, nameFr, nameEn, form, formFr, iconFile }] as const];
      }),
    ),
  };

  return {
    league: {
      key: league.key,
      nameFr: league.nameFr,
      nameEn: league.nameEn,
      cpLimit: league.cpLimit,
      color: league.color,
      rulesFr: league.rulesFr,
      rulesEn: league.rulesEn,
    },
    updatedAt: snapshot?.takenAt ?? null,
    rows,
    ...dictionaries,
  };
}
