'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth/session';
import {
  MAX_RECOVERY_ATTEMPTS,
  RECOVERY_LOCK_MINUTES,
  lockRemaining,
  recoveryKey,
} from '@/lib/pogo/recovery';

export type RecoveryResult =
  | { ok: true }
  | { ok: false; error: string; minutes?: number };

const emailSchema = z.string().trim().toLowerCase().email();

/** Hache une sélection pour la stocker. Exporté pour l'inscription. */
export async function hashRecoveryPicks(picks: string[]): Promise<string | null> {
  const key = recoveryKey(picks);
  return key ? bcrypt.hash(key, 10) : null;
}

/**
 * Réinitialise un mot de passe à partir des trois Pokémon choisis.
 *
 * Toutes les issues d'échec renvoient le **même** message : dire « adresse
 * inconnue » transformerait le formulaire en annuaire des comptes inscrits.
 * Seul le verrouillage se distingue, puisqu'il faut bien expliquer l'attente.
 */
export async function resetPasswordWithPicks(input: {
  email: string;
  picks: string[];
  password: string;
  confirm: string;
}): Promise<RecoveryResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, error: 'INVALID' };
  if (input.password.length < 8) return { ok: false, error: 'TOO_SHORT' };
  if (input.password !== input.confirm) return { ok: false, error: 'MISMATCH' };

  const key = recoveryKey(input.picks);
  if (!key) return { ok: false, error: 'INVALID_PICKS' };

  const user = await prisma.user.findUnique({
    where: { email: email.data },
    select: {
      id: true, recoveryHash: true, recoveryAttempts: true, recoveryLockedUntil: true,
    },
  });

  // Compte inconnu ou sans Pokémon de secours : même réponse qu'un mauvais trio.
  if (!user?.recoveryHash) return { ok: false, error: 'NO_MATCH' };

  const waiting = lockRemaining(user.recoveryLockedUntil);
  if (waiting > 0) return { ok: false, error: 'LOCKED', minutes: waiting };

  if (!(await bcrypt.compare(key, user.recoveryHash))) {
    const attempts = user.recoveryAttempts + 1;
    const locked = attempts >= MAX_RECOVERY_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        recoveryAttempts: locked ? 0 : attempts,
        recoveryLockedUntil: locked
          ? new Date(Date.now() + RECOVERY_LOCK_MINUTES * 60_000)
          : null,
      },
    });
    return locked
      ? { ok: false, error: 'LOCKED', minutes: RECOVERY_LOCK_MINUTES }
      : { ok: false, error: 'NO_MATCH' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.password, 10),
      recoveryAttempts: 0,
      recoveryLockedUntil: null,
    },
  });
  return { ok: true };
}

/**
 * Change ses Pokémon de secours depuis « Mon profil ».
 *
 * Le mot de passe courant est redemandé : sans lui, une session laissée ouverte
 * suffirait à remplacer le secret de récupération, donc à s'emparer du compte.
 */
export async function updateRecoveryPicks(
  password: string,
  picks: string[],
): Promise<RecoveryResult> {
  const me = await requireUser();

  const hash = await hashRecoveryPicks(picks);
  if (!hash) return { ok: false, error: 'INVALID_PICKS' };

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return { ok: false, error: 'WRONG_PASSWORD' };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { recoveryHash: hash, recoveryAttempts: 0, recoveryLockedUntil: null },
  });
  return { ok: true };
}
