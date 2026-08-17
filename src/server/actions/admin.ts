'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { getCurrentUser, hasRole } from '@/server/auth/session';
import { runIngest, type IngestKind } from '@/server/ingest';
import { invalidateCounterCandidates } from '@/server/queries/counters';

export type AdminResult =
  | { ok: true; message?: string }
  | { ok: false; error: 'FORBIDDEN' | 'INVALID' | 'FAILED'; message?: string };

const roleSchema = z.enum(['USER', 'CONTRIBUTOR', 'ADMIN']);

const INGEST_KINDS = [
  'pokemon', 'pvemoves', 'sprites', 'leagues', 'meta', 'news', 'shiny', 'raids',
] as const;

/** Change le rôle d'un compte. */
export async function setUserRole(userId: string, role: string): Promise<AdminResult> {
  const me = await getCurrentUser();
  if (!hasRole(me, 'ADMIN')) return { ok: false, error: 'FORBIDDEN' };

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: 'INVALID' };

  // Un administrateur ne peut pas se rétrograder lui-même : on se retrouverait
  // sans personne pour rendre le rôle, et le bootstrap ne joue qu'à la création
  // du tout premier compte.
  if (me && userId === me.id && parsed.data !== 'ADMIN') {
    return { ok: false, error: 'INVALID', message: 'SELF_DEMOTE' };
  }

  await prisma.user.update({ where: { id: userId }, data: { role: parsed.data } });
  revalidatePath('/[locale]/admin', 'page');
  return { ok: true };
}

/**
 * Lance une étape d'ingestion depuis l'interface.
 *
 * Les étapes lourdes (`meta`, `sprites`) prennent des minutes : l'action rend la
 * main quand c'est fini, l'appelant doit prévoir l'attente.
 */
export async function triggerIngest(kind: string): Promise<AdminResult> {
  const me = await getCurrentUser();
  if (!hasRole(me, 'ADMIN')) return { ok: false, error: 'FORBIDDEN' };
  if (!INGEST_KINDS.includes(kind as never)) return { ok: false, error: 'INVALID' };

  try {
    await runIngest([kind as IngestKind]);
    // le vivier de contres est mis en cache par processus : il devient périmé
    invalidateCounterCandidates();
    revalidatePath('/[locale]/admin', 'page');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: 'FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
