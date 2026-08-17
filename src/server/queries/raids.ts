import 'server-only';
import { prisma } from '@/server/db';
import {
  catchCpRange, catchCp, maxedCp, tierLevelFromLabel, RAID_TIERS, RAID_DURATION,
  RAID_MAX_PARTY, MAX_BATTLE_MAX_PARTY,
  type CatchCp, type MaxedCp,
} from '@/lib/pogo/raid';
import { defensiveProfile } from '@/lib/pogo/types';
import { getCounters, toPveMoves, type CountersReport } from './counters';

export type RaidView = {
  id: string;
  name: string;
  nameFr: string;
  nameEn: string;
  speciesId: string | null;
  form: string | null;
  formFr: string | null;
  isShadow: boolean;
  kind: string;
  tier: string;
  tierLevel: number;
  iconFile: string | null;
  types: string[];
  canBeShiny: boolean;
  cp: { min: number; max: number } | null;
  cpBoosted: { min: number; max: number } | null;
  weather: string[];
  weaknesses: string[];
  isCurrent: boolean;
  /** Fenêtre de l'événement, en ISO — seuls les combats Dynamax en portent une. */
  startAt: string | null;
  endAt: string | null;
};

const toView = (
  row: {
    id: string;
    externalName: string;
    kind: string;
    tier: string;
    tierLevel: number;
    canBeShiny: boolean;
    types: string[];
    cpMin: number | null;
    cpMax: number | null;
    cpBoostedMin: number | null;
    cpBoostedMax: number | null;
    boostedWeather: string[];
    isCurrent: boolean;
    startAt: Date | null;
    endAt: Date | null;
    pokemon: {
      speciesId: string; nameFr: string; nameEn: string; iconFile: string;
      form: string | null; formFr: string | null; isShadow: boolean;
      types: string[]; baseAtk: number; baseDef: number; baseHp: number;
    } | null;
  },
): RaidView => {
  const types = row.types.length ? row.types : (row.pokemon?.types ?? []);
  const base = row.pokemon
    ? { atk: row.pokemon.baseAtk, def: row.pokemon.baseDef, hp: row.pokemon.baseHp }
    : null;
  const shadow = row.pokemon?.isShadow ?? false;
  const normal = row.cpMin != null && row.cpMax != null
    ? { min: row.cpMin, max: row.cpMax }
    : base
      ? (({ min, max }) => ({ min, max }))(catchCpRange(base, false, shadow))
      : null;
  const boosted = row.cpBoostedMin != null && row.cpBoostedMax != null
    ? { min: row.cpBoostedMin, max: row.cpBoostedMax }
    : base
      ? (({ min, max }) => ({ min, max }))(catchCpRange(base, true, shadow))
      : null;

  return {
    id: row.id,
    name: row.externalName,
    nameFr: row.pokemon?.nameFr ?? row.externalName,
    nameEn: row.pokemon?.nameEn ?? row.externalName,
    speciesId: row.pokemon?.speciesId ?? null,
    form: row.pokemon?.form ?? null,
    formFr: row.pokemon?.formFr ?? null,
    // le palier LeekDuck ne distingue pas les raids obscurs : l'espèce fait foi
    isShadow: row.pokemon?.isShadow ?? row.kind === 'SHADOW_RAID',
    kind: row.kind,
    tier: row.tier,
    tierLevel: row.tierLevel,
    iconFile: row.pokemon?.iconFile ?? null,
    types,
    canBeShiny: row.canBeShiny,
    cp: normal,
    cpBoosted: boosted,
    weather: row.boostedWeather,
    weaknesses: defensiveProfile(types)
      .filter((entry) => entry.multiplier > 1)
      .map((entry) => entry.type),
    // la fenêtre prime sur le drapeau, figé à l'ingestion
    isCurrent: row.startAt
      ? row.startAt <= new Date() && (!row.endAt || row.endAt >= new Date())
      : row.isCurrent,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
  };
};

const SELECT = {
  id: true, externalName: true, kind: true, tier: true, tierLevel: true,
  canBeShiny: true, types: true, cpMin: true, cpMax: true, cpBoostedMin: true,
  cpBoostedMax: true, boostedWeather: true, isCurrent: true,
  startAt: true, endAt: true,
  pokemon: {
    select: {
      speciesId: true, nameFr: true, nameEn: true, iconFile: true, types: true,
      form: true, formFr: true, isShadow: true,
      baseAtk: true, baseDef: true, baseHp: true,
    },
  },
} as const;

export async function getRaids() {
  const now = new Date();
  // `isCurrent` est figé à l'ingestion : pour tout ce qui porte des dates
  // (combats Dynamax, événements), c'est la fenêtre qui fait foi au moment
  // de la lecture, sinon un boss reste « à venir » le jour même.
  const liveNow = {
    OR: [
      { isCurrent: true, startAt: null },
      { startAt: { lte: now }, endAt: { gte: now } },
    ],
  };

  const [current, scheduled, history, legendaries] = await Promise.all([
    prisma.raidBoss.findMany({
      where: liveNow,
      orderBy: [{ tierLevel: 'desc' }, { externalName: 'asc' }],
      select: SELECT,
    }),
    // combats Dynamax annoncés mais pas encore ouverts : ils ont leur place
    // sur une page qui s'appelle « Raids & Dynamax »
    prisma.raidBoss.findMany({
      where: { startAt: { gt: now } },
      orderBy: [{ startAt: 'asc' }],
      select: SELECT,
    }),
    prisma.raidBoss.findMany({
      where: { isCurrent: false, startAt: null },
      orderBy: [{ tierLevel: 'desc' }, { externalName: 'asc' }],
      select: SELECT,
    }),
    // catalogue : les espèces qui apparaissent habituellement en raid
    prisma.pokemon.findMany({
      where: {
        released: true,
        isShadow: false,
        OR: [
          { tags: { hasSome: ['legendary', 'mythical', 'ultrabeast'] } },
        ],
      },
      orderBy: { dex: 'asc' },
      select: {
        id: true, speciesId: true, nameFr: true, nameEn: true, iconFile: true,
        form: true, formFr: true, types: true, baseAtk: true, baseDef: true, baseHp: true,
      },
    }),
  ]);

  const currentIds = new Set(current.map((row) => row.pokemon?.speciesId));

  const catalog: RaidView[] = legendaries.map((p) => {
    const normal = catchCpRange({ atk: p.baseAtk, def: p.baseDef, hp: p.baseHp });
    const boosted = catchCpRange({ atk: p.baseAtk, def: p.baseDef, hp: p.baseHp }, true);
    return {
      id: p.id,
      name: p.nameEn,
      nameFr: p.nameFr,
      nameEn: p.nameEn,
      speciesId: p.speciesId,
      form: p.form,
      formFr: p.formFr,
      isShadow: false, // le catalogue ne liste que les espèces normales
      kind: 'RAID',
      tier: '5-Star Raids',
      tierLevel: 5,
      iconFile: p.iconFile,
      types: p.types,
      canBeShiny: false,
      cp: { min: normal.min, max: normal.max },
      cpBoosted: { min: boosted.min, max: boosted.max },
      weather: [],
      weaknesses: defensiveProfile(p.types)
        .filter((entry) => entry.multiplier > 1)
        .map((entry) => entry.type),
      isCurrent: currentIds.has(p.speciesId),
      startAt: null,
      endAt: null,
    };
  });

  return {
    current: current.map(toView),
    scheduled: scheduled.map(toView),
    past: history.map(toView),
    catalog,
    tiers: RAID_TIERS,
  };
}

export type BossMove = {
  moveId: string;
  nameFr: string;
  nameEn: string;
  type: string;
  kind: string;
  power: number;
  isElite: boolean;
};

/** Une apparence de l'espèce : forme donnée, en normal et en chromatique. */
export type SpeciesForm = {
  speciesId: string;
  form: string | null;
  formFr: string | null;
  isShadow: boolean;
  iconFile: string;
  shinyIconFile: string | null;
};

export type RaidBossDetail = {
  boss: RaidView;
  /** Toutes les apparences du même numéro de Pokédex. */
  forms: SpeciesForm[];
  /** Palier retenu pour le calcul (PV et modificateur de stats du boss). */
  tier: { level: number; hp: number; label: string; durationSeconds: number };
  maxedCp: MaxedCp;
  catchCp: CatchCp;
  /** Multiplicateurs de type, faiblesses puis résistances. */
  defense: Array<{ type: string; multiplier: number }>;
  moves: BossMove[];
} & CountersReport;

/**
 * Fiche complète d'un boss, désigné par son `speciesId` : identifiant stable et
 * lisible, partagé par les boss en cours et par le catalogue.
 */
export async function getRaidBossDetail(
  speciesId: string,
  options?: { attackerLevel?: number },
): Promise<RaidBossDetail | null> {
  const pokemon = await prisma.pokemon.findUnique({
    where: { speciesId },
    select: {
      ...SELECT.pokemon.select,
      dex: true,
      moves: {
        select: {
          isElite: true,
          move: {
            select: {
              moveId: true, nameFr: true, nameEn: true, type: true, kind: true,
              pvePower: true, pveEnergy: true, pveDurationMs: true,
            },
          },
        },
      },
    },
  });
  if (!pokemon) return null;

  // un boss en cours porte son palier réel ; sinon on suppose un 5★
  const row = await prisma.raidBoss.findFirst({
    where: { pokemon: { speciesId } },
    orderBy: [{ isCurrent: 'desc' }, { updatedAt: 'desc' }],
    select: SELECT,
  });

  const base = { atk: pokemon.baseAtk, def: pokemon.baseDef, hp: pokemon.baseHp };
  const tierLevel = row?.tierLevel ?? 5;
  const tier = RAID_TIERS[tierLevel] ?? RAID_TIERS[5];

  // On ne capture jamais la forme Méga ou Primo : la récompense est l'espèce de
  // base, c'est aussi ce que publie LeekDuck. Le tableau de PC doit donc la viser.
  const isTemporaryForm = /^(mega|primal)/i.test(pokemon.form ?? '');
  const catchSpecies = isTemporaryForm
    ? await prisma.pokemon.findFirst({
        where: { dex: pokemon.dex, form: null, isShadow: false },
        select: { baseAtk: true, baseDef: true, baseHp: true },
      })
    : null;
  const catchBase = catchSpecies
    ? { atk: catchSpecies.baseAtk, def: catchSpecies.baseDef, hp: catchSpecies.baseHp }
    : base;

  const boss: RaidView = row
    ? toView(row)
    : {
        id: speciesId,
        name: pokemon.nameEn,
        nameFr: pokemon.nameFr,
        nameEn: pokemon.nameEn,
        speciesId,
        form: pokemon.form,
        formFr: pokemon.formFr,
        isShadow: pokemon.isShadow,
        kind: 'RAID',
        tier: '5-Star Raids',
        tierLevel,
        iconFile: pokemon.iconFile,
        types: pokemon.types,
        canBeShiny: false,
        cp: (({ min, max }) => ({ min, max }))(
          catchCpRange(catchBase, false, pokemon.isShadow),
        ),
        cpBoosted: (({ min, max }) => ({ min, max }))(
          catchCpRange(catchBase, true, pokemon.isShadow),
        ),
        weather: [],
        weaknesses: defensiveProfile(pokemon.types)
          .filter((entry) => entry.multiplier > 1)
          .map((entry) => entry.type),
        isCurrent: false,
        startAt: null,
        endAt: null,
      };

  // Toutes les apparences du Pokédex : base, Méga/Primo, formes régionales…
  // Les entrées obscures partagent le sprite de leur forme, on ne les double pas.
  const forms = await prisma.pokemon.findMany({
    where: { dex: pokemon.dex, isShadow: false },
    orderBy: [{ form: { sort: 'asc', nulls: 'first' } }],
    select: {
      speciesId: true, form: true, formFr: true, isShadow: true,
      iconFile: true, shinyIconFile: true,
    },
  });

  const isMaxBattle = row?.kind === 'MAX_BATTLE' || row?.kind === 'GIGANTAMAX';
  const report = await getCounters(
    { types: pokemon.types, base, tierLevel, ...toPveMoves(pokemon.moves) },
    {
      attackerLevel: options?.attackerLevel,
      limit: 12,
      maxParty: isMaxBattle ? MAX_BATTLE_MAX_PARTY : RAID_MAX_PARTY,
    },
  );

  return {
    boss,
    tier: {
      level: tierLevel,
      hp: tier.hp,
      label: tier.label,
      durationSeconds: RAID_DURATION[tierLevel] ?? 300,
    },
    forms,
    maxedCp: maxedCp(catchBase, pokemon.isShadow),
    catchCp: catchCp(catchBase, pokemon.isShadow),
    defense: defensiveProfile(pokemon.types).filter((entry) => entry.multiplier !== 1),
    moves: pokemon.moves
      .filter((row) => row.move.pveDurationMs != null)
      .map((row) => ({
        moveId: row.move.moveId,
        nameFr: row.move.nameFr,
        nameEn: row.move.nameEn,
        type: row.move.type,
        kind: row.move.kind,
        power: row.move.pvePower ?? 0,
        isElite: row.isElite,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || b.power - a.power),
    ...report,
  };
}

export { tierLevelFromLabel };
