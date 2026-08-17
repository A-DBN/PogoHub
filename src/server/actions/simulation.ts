'use server';

import { z } from 'zod';
import { prisma } from '@/server/db';
import { searchDefenders } from '@/server/queries/counters';
import { rank1, calcStats } from '@/lib/pogo/stats';
import { checkEligibility, type LeagueFilters } from '@/lib/pogo/eligibility';
import {
  sweepScenarios, simulateTeams,
  type BattleMove, type Combatant, type ScenarioSweep, type TeamSimulation,
} from '@/lib/pogo/battle';

const slotSchema = z.object({
  pokemonId: z.string().min(1),
  fastMoveId: z.string().nullable().default(null),
  charged1Id: z.string().nullable().default(null),
  charged2Id: z.string().nullable().default(null),
  isShadow: z.boolean().default(false),
  // Niveau et IV réels quand ils viennent d'une équipe enregistrée. Absents,
  // on optimise au rang 1 de la ligue — un Pokémon choisi à la main est alors
  // éligible par construction.
  level: z.number().min(1).max(51).nullable().default(null),
  ivAtk: z.number().int().min(0).max(15).nullable().default(null),
  ivDef: z.number().int().min(0).max(15).nullable().default(null),
  ivHp: z.number().int().min(0).max(15).nullable().default(null),
});

const inputSchema = z.object({
  leagueKey: z.string().min(1),
  teamA: z.array(slotSchema).min(1).max(3),
  teamB: z.array(slotSchema).min(1).max(3),
});

export type SimulationSlot = z.input<typeof slotSchema>;
export type SimulationInput = z.input<typeof inputSchema>;

export type SimulationReport = {
  sweep: ScenarioSweep;
  matchups: TeamSimulation;
  teamA: Array<{ speciesId: string; nameFr: string; nameEn: string; iconFile: string; cp: number }>;
  teamB: Array<{ speciesId: string; nameFr: string; nameEn: string; iconFile: string; cp: number }>;
};

export type SimulationResult =
  | { ok: true; report: SimulationReport }
  | { ok: false; error: 'INVALID' | 'INCOMPLETE' }
  /** Au moins un Pokémon ne respecte pas les règles de la ligue. */
  | { ok: false; error: 'INELIGIBLE'; offenders: SlotPreview[] };

const toBattleMove = (move: {
  moveId: string; nameFr: string; nameEn: string; type: string;
  power: number; energy: number; energyGain: number; turns: number; buffs: unknown;
}): BattleMove => ({
  moveId: move.moveId,
  nameFr: move.nameFr,
  nameEn: move.nameEn,
  type: move.type,
  power: move.power,
  energy: move.energy,
  energyGain: move.energyGain,
  turns: move.turns,
  buffs: move.buffs as BattleMove['buffs'],
});

/** Recherche de défenseurs pour la page Contres. */
export async function findDefenders(query: string) {
  return searchDefenders(query);
}

export type SlotPreview = {
  pokemonId: string;
  level: number;
  cp: number;
  /** IV retenus : ceux saisis, ou ceux du rang 1 de la ligue. */
  ivs: { atk: number; def: number; hp: number };
  /** Faux si la ligue exclut cette espèce ou si le PC dépasse le plafond. */
  eligible: boolean;
  /** Clés de motif : `cp`, `type`, `species`, `tag:<tag>`. */
  reasons: string[];
};

/**
 * Ce que la simulation utilisera réellement pour chaque emplacement.
 *
 * Indispensable à afficher : sous une limite de PC, un Zacian est ramené au
 * niveau 11 avec 91 PV et perd contre un Herbizarre. Le résultat est juste,
 * mais incompréhensible tant qu'on ne voit pas le niveau retenu.
 */
export async function previewSlots(
  slots: SimulationSlot[],
  leagueKey: string,
): Promise<SlotPreview[]> {
  if (!slots.length) return [];
  const parsed = z.array(slotSchema).safeParse(slots);
  if (!parsed.success) return [];

  const [league, pokemon] = await Promise.all([
    prisma.league.findUnique({
      where: { key: leagueKey },
      select: { cpLimit: true, filters: true },
    }),
    prisma.pokemon.findMany({
      where: { id: { in: parsed.data.map((slot) => slot.pokemonId) } },
      select: {
        id: true, speciesId: true, dex: true, types: true, tags: true,
        baseAtk: true, baseDef: true, baseHp: true,
      },
    }),
  ]);
  if (!league) return [];
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  const filters = (league.filters ?? null) as LeagueFilters | null;

  // renvoyé dans l'ordre des emplacements : deux slots peuvent partager une
  // espèce avec des niveaux différents
  return parsed.data.map((slot) => {
    const p = byId.get(slot.pokemonId);
    if (!p) {
      return {
        pokemonId: slot.pokemonId, level: 0, cp: 0,
        ivs: { atk: 15, def: 15, hp: 15 }, eligible: false, reasons: ['species'],
      };
    }
    const base = { atk: p.baseAtk, def: p.baseDef, hp: p.baseHp };
    const line = statsFor(base, slot, league.cpLimit);
    const check = checkEligibility(
      { speciesId: p.speciesId, dex: p.dex, types: p.types, tags: p.tags, cp: line.cp },
      { cpLimit: league.cpLimit, filters },
    );
    return {
      pokemonId: slot.pokemonId,
      level: line.level,
      cp: line.cp,
      ivs: line.ivs,
      eligible: check.eligible,
      reasons: check.reasons,
    };
  });
}

/**
 * Stats retenues pour un emplacement : celles saisies si elles existent,
 * sinon le rang 1 de la ligue.
 */
function statsFor(
  base: { atk: number; def: number; hp: number },
  slot: z.output<typeof slotSchema>,
  cpLimit: number | null,
) {
  if (slot.level != null && slot.ivAtk != null && slot.ivDef != null && slot.ivHp != null) {
    return calcStats(base, { atk: slot.ivAtk, def: slot.ivDef, hp: slot.ivHp }, slot.level);
  }
  return rank1(base, cpLimit);
}

/**
 * Monte les combattants puis balaie les scénarios.
 *
 * Les IV et le niveau sont ceux du **rang 1** de la ligue : c'est la référence
 * quand on compare des compositions, et cela évite de faire saisir six spreads.
 */
export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID' };
  const { leagueKey, teamA, teamB } = parsed.data;

  const league = await prisma.league.findUnique({
    where: { key: leagueKey },
    select: { cpLimit: true, filters: true },
  });
  if (!league) return { ok: false, error: 'INVALID' };

  // Les règles de ligue s'appliquent ici aussi : l'interface grise le bouton,
  // mais une action serveur reste appelable directement.
  const previews = await previewSlots([...teamA, ...teamB], leagueKey);
  const offenders = previews.filter((preview) => !preview.eligible);
  if (offenders.length) return { ok: false, error: 'INELIGIBLE', offenders };

  const slots = [...teamA, ...teamB];
  const [pokemon, moves] = await Promise.all([
    prisma.pokemon.findMany({
      where: { id: { in: slots.map((slot) => slot.pokemonId) } },
      select: {
        id: true, speciesId: true, nameFr: true, nameEn: true, types: true,
        iconFile: true, baseAtk: true, baseDef: true, baseHp: true,
      },
    }),
    prisma.move.findMany({
      where: {
        moveId: {
          in: slots.flatMap((slot) =>
            [slot.fastMoveId, slot.charged1Id, slot.charged2Id].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        },
      },
      select: {
        moveId: true, nameFr: true, nameEn: true, type: true,
        power: true, energy: true, energyGain: true, turns: true, buffs: true,
      },
    }),
  ]);

  const pokemonById = new Map(pokemon.map((p) => [p.id, p]));
  const moveById = new Map(moves.map((m) => [m.moveId, m]));

  const build = (slot: (typeof slots)[number]): Combatant | null => {
    const p = pokemonById.get(slot.pokemonId);
    const fast = slot.fastMoveId ? moveById.get(slot.fastMoveId) : null;
    // sans attaque rapide il n'y a pas de combat à simuler
    if (!p || !fast) return null;
    const base = { atk: p.baseAtk, def: p.baseDef, hp: p.baseHp };
    const line = statsFor(base, slot, league.cpLimit);
    const charged = [slot.charged1Id, slot.charged2Id]
      .map((id) => (id ? moveById.get(id) : null))
      .filter((move): move is NonNullable<typeof move> => Boolean(move))
      .map(toBattleMove);
    if (!charged.length) return null;
    return {
      speciesId: p.speciesId,
      nameFr: p.nameFr,
      nameEn: p.nameEn,
      types: p.types,
      base,
      ivs: line.ivs,
      level: line.level,
      isShadow: slot.isShadow,
      fast: toBattleMove(fast),
      charged,
    };
  };

  const builtA = teamA.map(build);
  const builtB = teamB.map(build);
  if (builtA.some((c) => !c) || builtB.some((c) => !c)) {
    return { ok: false, error: 'INCOMPLETE' };
  }
  const combatantsA = builtA as Combatant[];
  const combatantsB = builtB as Combatant[];

  const summarise = (list: Combatant[]) =>
    list.map((combatant) => {
      const p = pokemon.find((row) => row.speciesId === combatant.speciesId)!;
      return {
        speciesId: combatant.speciesId,
        nameFr: combatant.nameFr,
        nameEn: combatant.nameEn,
        iconFile: p.iconFile,
        cp: calcStats(combatant.base, combatant.ivs, combatant.level).cp,
      };
    });

  return {
    ok: true,
    report: {
      sweep: sweepScenarios(combatantsA, combatantsB),
      matchups: simulateTeams(combatantsA, combatantsB),
      teamA: summarise(combatantsA),
      teamB: summarise(combatantsB),
    },
  };
}
