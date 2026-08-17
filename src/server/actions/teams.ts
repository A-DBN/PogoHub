'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import {
  getSpeciesMoves, searchTeamPokemon,
  type SpeciesMoves, type TeamPokemonOption,
} from '@/server/queries/teams';

/** Un membre vaut pour un emplacement ; une équipe en compte au plus trois. */
const memberSchema = z.object({
  slot: z.number().int().min(0).max(2),
  pokemonId: z.string().min(1),
  isShadow: z.boolean().default(false),
  isShiny: z.boolean().default(false),
  level: z.number().min(1).max(51),
  ivAtk: z.number().int().min(0).max(15),
  ivDef: z.number().int().min(0).max(15),
  ivHp: z.number().int().min(0).max(15),
  fastMoveId: z.string().nullable().default(null),
  charged1Id: z.string().nullable().default(null),
  charged2Id: z.string().nullable().default(null),
});

const teamSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#5b9cff'),
  leagueKey: z.string().nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
  isPublic: z.boolean().default(false),
  members: z.array(memberSchema).max(3),
});

export type TeamInput = z.input<typeof teamSchema>;

export type TeamActionResult =
  | { ok: true; id: string }
  | { ok: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'INVALID'; message?: string };

async function leagueIdFor(key: string | null): Promise<string | null> {
  if (!key) return null;
  const league = await prisma.league.findUnique({ where: { key }, select: { id: true } });
  return league?.id ?? null;
}

export async function createTeam(input: TeamInput): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID', message: parsed.error.issues[0]?.message };
  }
  const data = parsed.data;

  const team = await prisma.team.create({
    data: {
      userId: user.id,
      name: data.name,
      color: data.color,
      notes: data.notes,
      isPublic: data.isPublic,
      leagueId: await leagueIdFor(data.leagueKey),
      members: { create: data.members },
    },
    select: { id: true },
  });

  revalidatePath('/[locale]/teams', 'page');
  return { ok: true, id: team.id };
}

export async function updateTeam(id: string, input: TeamInput): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const owned = await prisma.team.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: 'NOT_FOUND' };

  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID', message: parsed.error.issues[0]?.message };
  }
  const data = parsed.data;

  // Les emplacements sont remplacés en bloc : plus simple et plus sûr qu'un
  // diff, et une équipe ne compte que trois membres.
  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId: id } }),
    prisma.team.update({
      where: { id },
      data: {
        name: data.name,
        color: data.color,
        notes: data.notes,
        isPublic: data.isPublic,
        leagueId: await leagueIdFor(data.leagueKey),
        members: { create: data.members },
      },
    }),
  ]);

  revalidatePath('/[locale]/teams', 'page');
  revalidatePath('/[locale]/teams/[id]', 'page');
  return { ok: true, id };
}

export async function deleteTeam(id: string): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const { count } = await prisma.team.deleteMany({ where: { id, userId: user.id } });
  if (!count) return { ok: false, error: 'NOT_FOUND' };

  revalidatePath('/[locale]/teams', 'page');
  return { ok: true, id };
}

/** Duplique une équipe que l'on peut voir, dans son propre compte. */
export async function duplicateTeam(id: string): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const source = await prisma.team.findFirst({
    where: { id, OR: [{ userId: user.id }, { isPublic: true }] },
    select: {
      name: true, color: true, notes: true, leagueId: true,
      members: {
        select: {
          slot: true, pokemonId: true, isShadow: true, isShiny: true, level: true,
          ivAtk: true, ivDef: true, ivHp: true,
          fastMoveId: true, charged1Id: true, charged2Id: true,
        },
      },
    },
  });
  if (!source) return { ok: false, error: 'NOT_FOUND' };

  const copy = await prisma.team.create({
    data: {
      userId: user.id,
      name: `${source.name} (copie)`,
      color: source.color,
      notes: source.notes,
      leagueId: source.leagueId,
      isPublic: false, // une copie repart toujours privée
      members: { create: source.members },
    },
    select: { id: true },
  });

  revalidatePath('/[locale]/teams', 'page');
  return { ok: true, id: copy.id };
}

/**
 * Movepool d'une espèce, pour l'éditeur. Exposé en action serveur pour éviter
 * d'embarquer les attaques des 1 000 espèces dans la page.
 */
export async function fetchSpeciesMoves(pokemonId: string): Promise<SpeciesMoves> {
  return getSpeciesMoves(pokemonId);
}

/** Recherche d'espèces pour les sélecteurs, appelée à l'ouverture d'une modale. */
export async function findPokemon(query: string): Promise<TeamPokemonOption[]> {
  return searchTeamPokemon(query);
}

export async function setTeamVisibility(
  id: string,
  isPublic: boolean,
): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const { count } = await prisma.team.updateMany({
    where: { id, userId: user.id },
    data: { isPublic },
  });
  if (!count) return { ok: false, error: 'NOT_FOUND' };

  revalidatePath('/[locale]/teams', 'page');
  revalidatePath('/[locale]/teams/[id]', 'page');
  return { ok: true, id };
}
