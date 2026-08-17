'use server';

import { prisma } from '@/server/db';
import { getCurrentUser, hasRole } from '@/server/auth/session';

export type ToggleResult = {
  ok: boolean;
  caught?: boolean;
  count?: number;
  error?: 'UNAUTHORIZED';
};

/** Marque / démarque un chromatique comme capturé. */
export async function toggleShinyCaught(
  pokemonId: string,
  caught: boolean,
): Promise<ToggleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  await prisma.collectionEntry.upsert({
    where: { userId_pokemonId: { userId: user.id, pokemonId } },
    create: {
      userId: user.id,
      pokemonId,
      shinyCaught: caught,
      shinyCount: caught ? 1 : 0,
      caughtAt: caught ? new Date() : null,
    },
    update: {
      shinyCaught: caught,
      shinyCount: caught ? 1 : 0,
      caughtAt: caught ? new Date() : null,
    },
  });

  return { ok: true, caught, count: caught ? 1 : 0 };
}

/** Nombre d'exemplaires possédés (0 = non capturé). Sert aux futurs échanges. */
export async function setShinyCount(
  pokemonId: string,
  count: number,
): Promise<ToggleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const safe = Math.max(0, Math.min(999, Math.round(count)));
  const caught = safe > 0;

  await prisma.collectionEntry.upsert({
    where: { userId_pokemonId: { userId: user.id, pokemonId } },
    create: {
      userId: user.id,
      pokemonId,
      shinyCaught: caught,
      shinyCount: safe,
      caughtAt: caught ? new Date() : null,
    },
    update: {
      shinyCaught: caught,
      shinyCount: safe,
      caughtAt: caught ? new Date() : null,
    },
  });

  return { ok: true, caught, count: safe };
}

/** Admin : rend un chromatique disponible (ou non) quand il sort en jeu. */
export async function setShinyReleased(
  pokemonId: string,
  isReleased: boolean,
): Promise<ToggleResult> {
  const user = await getCurrentUser();
  if (!hasRole(user, 'ADMIN')) return { ok: false, error: 'UNAUTHORIZED' };

  await prisma.shinyRelease.upsert({
    where: { pokemonId },
    create: { pokemonId, isReleased, sources: [] },
    update: { isReleased },
  });
  return { ok: true };
}
