/**
 * Boss de raid actuels (LeekDuck) + combats Dynamax repérés dans les événements.
 * Le catalogue complet (« tous ») est calculé à la volée depuis les Pokémon.
 */
import { prisma } from '@/server/db';
import { tierLevelFromLabel } from '@/lib/pogo/raid';
import { SOURCES, fetchJson } from './sources';
import { parseSpeciesLabel } from './species-name';
import type { ScrapedDuckEvent } from './pvpoke-types';
import type { RaidKind } from '@/generated/prisma/enums';

type ScrapedRaid = {
  name: string;
  tier: string;
  canBeShiny?: boolean;
  types?: Array<{ name: string }>;
  combatPower?: {
    normal?: { min: number; max: number };
    boosted?: { min: number; max: number };
  };
  boostedWeather?: Array<{ name: string }>;
  image?: string;
};

export type RaidIngestResult = {
  current: number;
  maxBattles: number;
  /** Libellés sans aucun Pokémon en base. */
  unmatched: string[];
  /** Libellés rattachés à l'espèce mais pas à la forme demandée. */
  approximate: string[];
  /** Événements Max dont LeekDuck n'annonce pas encore l'espèce. */
  pending: string[];
};

const kindFor = (tier: string): RaidKind => {
  if (/mega/i.test(tier)) return 'MEGA_RAID';
  if (/shadow/i.test(tier)) return 'SHADOW_RAID';
  if (/elite/i.test(tier)) return 'ELITE_RAID';
  if (/gigantamax/i.test(tier)) return 'GIGANTAMAX';
  if (/dynamax|max battle/i.test(tier)) return 'MAX_BATTLE';
  return 'RAID';
};

/** "Dynamax Magikarp during Max Monday" → "Magikarp" */
function extractSpeciesName(label: string): string {
  return label
    .replace(/^(dynamax|gigantamax)\s+/i, '')
    .replace(/\s+during.*$/i, '')
    .replace(/\s+Max (Battle|Monday).*$/i, '')
    .trim();
}

/**
 * Espèces d'un événement Max. `extraData.spawns` est la source fiable quand
 * LeekDuck la remplit ; sinon on retombe sur le titre, qui ne porte l'espèce que
 * s'il en reste quelque chose une fois l'habillage retiré (« Max Battle Day »
 * n'annonce encore aucun boss et ne doit pas compter comme une erreur).
 */
function maxBattleSpecies(event: ScrapedDuckEvent): string[] {
  const spawns = (event.extraData as { spawns?: Array<{ name?: string }> } | undefined)?.spawns;
  const fromSpawns = spawns?.map((s) => s.name?.trim()).filter((n): n is string => Boolean(n));
  if (fromSpawns?.length) return [...new Set(fromSpawns)];

  const fromTitle = extractSpeciesName(event.name);
  return fromTitle && fromTitle !== event.name.trim() ? [event.name] : [];
}

type Resolved = { id: string; types: string[]; exact: boolean } | null;

/**
 * Retrouve le Pokémon désigné par un libellé LeekDuck.
 * Les formes sont essayées de la plus précise à la plus large ; si aucune ne
 * correspond on retombe sur l'espèce sans forme (« Mega Garchomp » → Garchomp)
 * en marquant `exact: false`, pour que le rapport d'ingestion signale le trou.
 */
async function resolvePokemon(label: string): Promise<Resolved> {
  const { baseName, forms, shadow } = parseSpeciesLabel(label);
  const byName = {
    isShadow: shadow,
    OR: [
      { nameEn: { equals: baseName, mode: 'insensitive' as const } },
      { nameFr: { equals: baseName, mode: 'insensitive' as const } },
    ],
  };

  for (const form of forms) {
    const hit = await prisma.pokemon.findFirst({
      where: { ...byName, form: { equals: form, mode: 'insensitive' } },
      select: { id: true, types: true },
    });
    if (hit) return { ...hit, exact: true };
  }

  const fallback = await prisma.pokemon.findFirst({
    where: forms.length ? { ...byName, form: null } : byName,
    orderBy: { form: { sort: 'asc', nulls: 'first' } },
    select: { id: true, types: true },
  });
  return fallback ? { ...fallback, exact: forms.length === 0 } : null;
}

export async function ingestRaids(): Promise<RaidIngestResult> {
  const unmatched: string[] = [];
  const approximate: string[] = [];
  const pending: string[] = [];

  // --- raids en cours -------------------------------------------------------
  const raids = await fetchJson<ScrapedRaid[]>(SOURCES.raids);
  await prisma.raidBoss.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

  for (const raid of raids) {
    const pokemon = await resolvePokemon(raid.name);
    if (!pokemon) unmatched.push(raid.name);
    else if (!pokemon.exact) approximate.push(raid.name);
    const kind = kindFor(raid.tier);
    const data = {
      pokemonId: pokemon?.id ?? null,
      kind,
      tierLevel: tierLevelFromLabel(raid.tier),
      isCurrent: true,
      canBeShiny: Boolean(raid.canBeShiny),
      types: raid.types?.map((t) => t.name) ?? pokemon?.types ?? [],
      cpMin: raid.combatPower?.normal?.min ?? null,
      cpMax: raid.combatPower?.normal?.max ?? null,
      cpBoostedMin: raid.combatPower?.boosted?.min ?? null,
      cpBoostedMax: raid.combatPower?.boosted?.max ?? null,
      boostedWeather: raid.boostedWeather?.map((w) => w.name) ?? [],
      image: raid.image ?? null,
    };
    await prisma.raidBoss.upsert({
      where: {
        externalName_kind_tier: { externalName: raid.name, kind, tier: raid.tier },
      },
      create: { externalName: raid.name, tier: raid.tier, ...data },
      update: data,
    });
  }

  // --- combats Dynamax annoncés dans les événements -------------------------
  const events = await fetchJson<ScrapedDuckEvent[]>(SOURCES.news);
  const maxEvents = events.filter((e) => /max-battles|max-mondays|gigantamax/.test(e.eventType));
  let maxBattles = 0;

  for (const event of maxEvents) {
    const species = maxBattleSpecies(event);
    if (!species.length) {
      pending.push(event.name);
      continue;
    }
    const start = event.start ? new Date(event.start) : null;
    const end = event.end ? new Date(event.end) : null;
    const now = new Date();

    // Les combats Dynamax ont leurs propres paliers de difficulté, absents du
    // flux. Les Max Mondays sont la difficulté d'entrée (1★) ; à défaut d'autre
    // information on reste au milieu plutôt que de tout compter comme un Méga.
    const maxTierLevel = /max-mondays/.test(event.eventType) ? 1 : 3;

    for (const label of species) {
      const gigantamax = /gigantamax/i.test(`${event.name} ${label}`);
      const name = extractSpeciesName(label);
      const pokemon = await resolvePokemon(name);
      if (!pokemon) {
        unmatched.push(`${event.name} → ${name}`);
        continue;
      }
      if (!pokemon.exact) approximate.push(`${event.name} → ${name}`);
      const kind: RaidKind = gigantamax ? 'GIGANTAMAX' : 'MAX_BATTLE';
      const tier = gigantamax ? 'Gigantamax' : 'Max Battle';
      const data = {
        pokemonId: pokemon.id,
        kind,
        tierLevel: gigantamax ? 6 : maxTierLevel,
        isCurrent: (!start || start <= now) && (!end || end >= now),
        canBeShiny: false,
        types: pokemon.types,
        boostedWeather: [] as string[],
        image: event.image ?? null,
        startAt: start,
        endAt: end,
        sourceEventId: event.eventID,
      };
      await prisma.raidBoss.upsert({
        where: { externalName_kind_tier: { externalName: name, kind, tier } },
        create: { externalName: name, tier, ...data },
        update: data,
      });
      maxBattles++;
    }
  }

  return { current: raids.length, maxBattles, unmatched, approximate, pending };
}
