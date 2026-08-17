import 'server-only';
import { prisma } from '@/server/db';
import {
  bestCounters, recommendedPlayers,
  type CounterCandidate, type CounterMove, type CounterResult, type PlayerEstimate,
} from '@/lib/pogo/raid';

/**
 * Vivier d'attaquants : tout ce qui est sorti en jeu et possède des statistiques
 * JcE. Les formes obscures sont incluses, ce sont souvent les meilleurs contres.
 */
const CANDIDATE_WHERE = { released: true } as const;

const MOVE_SELECT = {
  isElite: true,
  move: {
    select: {
      moveId: true, nameFr: true, nameEn: true, type: true, kind: true,
      pvePower: true, pveEnergy: true, pveDurationMs: true,
    },
  },
} as const;

type MoveRow = {
  isElite: boolean;
  move: {
    moveId: string; nameFr: string; nameEn: string; type: string; kind: string;
    pvePower: number | null; pveEnergy: number | null; pveDurationMs: number | null;
  };
};

/**
 * Attaques inutilisables pour un classement JcE.
 *
 * Puissance Cachée : PvPoke en liste les 18 types pour tout Pokémon qui
 * l'apprend, alors qu'en jeu le type est tiré au sort et ne se change pas.
 * Les garder revient à offrir une couverture parfaite à chaque apprenant — c'est
 * ce qui faisait remonter des attaquants que personne ne joue. Les autres sites
 * de référence l'excluent pour la même raison.
 */
const EXCLUDED_FROM_PVE = /^HIDDEN_POWER/;

/** Ne garde que les attaques dont on connaît les statistiques JcE. */
function toCounterMoves(rows: MoveRow[], kind: 'FAST' | 'CHARGED'): CounterMove[] {
  return rows
    .filter(
      (row) =>
        row.move.kind === kind &&
        row.move.pveDurationMs != null &&
        !EXCLUDED_FROM_PVE.test(row.move.moveId),
    )
    .map((row) => ({
      moveId: row.move.moveId,
      nameFr: row.move.nameFr,
      nameEn: row.move.nameEn,
      type: row.move.type,
      power: row.move.pvePower ?? 0,
      energy: row.move.pveEnergy ?? 0,
      durationMs: row.move.pveDurationMs as number,
      isElite: row.isElite,
    }));
}

/**
 * Charge le vivier une fois par processus : ~1 700 Pokémon et 11 000 entrées de
 * movepool, immuables entre deux ingestions, pour un classement instantané.
 */
let candidateCache: Promise<CounterCandidate[]> | null = null;

export function invalidateCounterCandidates() {
  candidateCache = null;
}

export function loadCounterCandidates(): Promise<CounterCandidate[]> {
  candidateCache ??= (async () => {
    const rows = await prisma.pokemon.findMany({
      where: CANDIDATE_WHERE,
      select: {
        speciesId: true, nameFr: true, nameEn: true, types: true, iconFile: true,
        form: true, formFr: true,
        isShadow: true, baseAtk: true, baseDef: true, baseHp: true,
        moves: { select: MOVE_SELECT },
      },
    });
    return rows
      .map((row) => ({
        speciesId: row.speciesId,
        nameFr: row.nameFr,
        nameEn: row.nameEn,
        form: row.form,
        formFr: row.formFr,
        types: row.types,
        iconFile: row.iconFile,
        isShadow: row.isShadow,
        base: { atk: row.baseAtk, def: row.baseDef, hp: row.baseHp },
        fastMoves: toCounterMoves(row.moves, 'FAST'),
        chargedMoves: toCounterMoves(row.moves, 'CHARGED'),
      }))
      .filter((c) => c.fastMoves.length && c.chargedMoves.length);
  })();
  return candidateCache;
}

export type CountersReport = {
  counters: CounterResult[];
  players: PlayerEstimate | null;
};

export async function getCounters(
  boss: {
    types: string[];
    base: { atk: number; def: number; hp: number };
    tierLevel: number;
    fastMoves?: CounterMove[];
    chargedMoves?: CounterMove[];
  },
  options?: { attackerLevel?: number; limit?: number; maxParty?: number },
): Promise<CountersReport> {
  const candidates = await loadCounterCandidates();
  const counters = bestCounters(boss, candidates, options);
  return {
    counters,
    players: recommendedPlayers(boss.tierLevel, counters, { maxParty: options?.maxParty }),
  };
}

/** Convertit un movepool chargé en base en attaques JcE utilisables par le moteur. */
export function toPveMoves(rows: MoveRow[]) {
  return {
    fastMoves: toCounterMoves(rows, 'FAST'),
    chargedMoves: toCounterMoves(rows, 'CHARGED'),
  };
}

/** Entrée du sélecteur de défenseur : juste de quoi chercher et afficher. */
export type DefenderOption = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  iconFile: string;
  types: string[];
};

/**
 * Défenseurs proposés : les espèces sorties, hors formes obscures — on contre
 * une espèce, et sa version obscure a les mêmes types et le même movepool.
 *
 * Renvoyé par tranche filtrée : la liste complète pesait ~270 Ko de payload à
 * chaque chargement de la page, pour un menu qu'on n'ouvre pas toujours.
 */
export async function searchDefenders(query: string): Promise<DefenderOption[]> {
  const trimmed = query.trim();
  return prisma.pokemon.findMany({
    where: {
      released: true,
      isShadow: false,
      ...(trimmed
        ? {
            OR: [
              { nameFr: { contains: trimmed, mode: 'insensitive' } },
              { nameEn: { contains: trimmed, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ dex: 'asc' }, { form: { sort: 'asc', nulls: 'first' } }],
    take: 60,
    select: {
      speciesId: true, nameFr: true, nameEn: true,
      form: true, formFr: true, iconFile: true, types: true,
    },
  });
}

export type DefenderReport = CountersReport & {
  defender: {
    speciesId: string;
    nameFr: string;
    nameEn: string;
    form: string | null;
    formFr: string | null;
    iconFile: string;
    types: string[];
  };
};

/**
 * Contres d'un Pokémon quelconque, au palier et au niveau d'attaquants demandés.
 * Le palier fixe les PV et le multiplicateur de stats du défenseur : contrer un
 * boss 5★ et contrer un 3★ ne donnent pas le même classement.
 */
export async function getCountersFor(
  speciesId: string,
  options: { attackerLevel: number; tierLevel: number },
): Promise<DefenderReport | null> {
  const defender = await prisma.pokemon.findUnique({
    where: { speciesId },
    select: {
      speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
      iconFile: true, types: true, baseAtk: true, baseDef: true, baseHp: true,
      moves: { select: MOVE_SELECT },
    },
  });
  if (!defender) return null;

  const report = await getCounters(
    {
      types: defender.types,
      base: { atk: defender.baseAtk, def: defender.baseDef, hp: defender.baseHp },
      tierLevel: options.tierLevel,
      ...toPveMoves(defender.moves),
    },
    { attackerLevel: options.attackerLevel, limit: 20 },
  );

  return {
    ...report,
    defender: {
      speciesId: defender.speciesId,
      nameFr: defender.nameFr,
      nameEn: defender.nameEn,
      form: defender.form,
      formFr: defender.formFr,
      iconFile: defender.iconFile,
      types: defender.types,
    },
  };
}
