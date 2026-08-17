'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth/session';
import { normalizeFriendCode, normalizeTrainerLevel } from '@/lib/pogo/trainer';
import { isLocale } from '@/i18n';

/** Seuils proposés par l'interface. Deux est le plancher : voir `AUTO_TRADE_MIN`. */
const AUTO_THRESHOLDS = [2, 3, 4, 5];
import { LOCALE_COOKIE } from '@/i18n/config';

export type ProfileResult =
  | { ok: true }
  | {
      ok: false;
      /** Le champ fautif : le formulaire s'en sert pour signaler la bonne ligne. */
      field?: 'username' | 'avatarUrl' | 'bio' | 'friendCode' | 'trainerLevel' | 'password';
      error: string;
    };

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_-]+$/);

/**
 * Seules `http(s)` sont acceptées : une `javascript:` ou une `data:` finirait
 * dans un attribut `src` de la fiche publique.
 */
const avatarSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'protocole non autorisé');

export type ProfileInput = {
  username: string;
  avatarUrl: string;
  bio: string;
  team: string;
  trainerLevel: string;
  friendCode: string;
  friendCodePublic: boolean;
  shinyPublic: boolean;
  teamsPublicByDefault: boolean;
  locale: string;
  tradeOpen: boolean;
  autoTradeFrom: string;
  tradeNote: string;
};

export async function updateProfile(input: ProfileInput): Promise<ProfileResult> {
  const me = await requireUser();

  const username = usernameSchema.safeParse(input.username);
  if (!username.success) return { ok: false, field: 'username', error: 'INVALID_USERNAME' };

  // Le pseudo est unique : on le vérifie avant d'écrire, sinon la contrainte
  // remonte en exception que le formulaire ne saurait pas expliquer.
  const taken = await prisma.user.findFirst({
    where: { username: username.data, id: { not: me.id } },
    select: { id: true },
  });
  if (taken) return { ok: false, field: 'username', error: 'USERNAME_TAKEN' };

  const avatar = input.avatarUrl.trim();
  if (avatar && !avatarSchema.safeParse(avatar).success) {
    return { ok: false, field: 'avatarUrl', error: 'INVALID_AVATAR' };
  }

  const friendCode = input.friendCode.trim()
    ? normalizeFriendCode(input.friendCode)
    : null;
  if (input.friendCode.trim() && friendCode == null) {
    return { ok: false, field: 'friendCode', error: 'INVALID_FRIEND_CODE' };
  }

  const trainerLevel = input.trainerLevel.trim()
    ? normalizeTrainerLevel(input.trainerLevel)
    : null;
  if (input.trainerLevel.trim() && trainerLevel == null) {
    return { ok: false, field: 'trainerLevel', error: 'INVALID_LEVEL' };
  }

  const team = ['VALOR', 'MYSTIC', 'INSTINCT'].includes(input.team)
    ? (input.team as 'VALOR' | 'MYSTIC' | 'INSTINCT')
    : null;

  await prisma.user.update({
    where: { id: me.id },
    data: {
      username: username.data,
      avatarUrl: avatar || null,
      bio: input.bio.trim().slice(0, 500) || null,
      team,
      trainerLevel,
      friendCode,
      friendCodePublic: input.friendCodePublic,
      shinyPublic: input.shinyPublic,
      teamsPublicByDefault: input.teamsPublicByDefault,
      locale: isLocale(input.locale) ? input.locale : undefined,
      tradeOpen: input.tradeOpen,
      // hors de la plage attendue, on retombe sur « jamais » plutôt que
      // d'inscrire un seuil que l'interface ne sait pas réafficher
      autoTradeFrom: AUTO_THRESHOLDS.includes(Number(input.autoTradeFrom))
        ? Number(input.autoTradeFrom)
        : null,
      tradeNote: input.tradeNote.trim().slice(0, 200) || null,
    },
  });

  // Le routage de langue se fait sur un cookie : sans cette ligne, le réglage
  // serait enregistré sans jamais changer la langue affichée.
  if (isLocale(input.locale)) {
    (await cookies()).set(LOCALE_COOKIE, input.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath('/[locale]/settings', 'page');
  revalidatePath('/[locale]/players/[username]', 'page');
  return { ok: true };
}

export async function changePassword(
  current: string,
  next: string,
  confirm: string,
): Promise<ProfileResult> {
  const me = await requireUser();

  if (next.length < 8) return { ok: false, field: 'password', error: 'TOO_SHORT' };
  if (next !== confirm) return { ok: false, field: 'password', error: 'MISMATCH' };

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false, error: 'FORBIDDEN' };

  // On redemande le mot de passe courant : sans cela, une session volée suffit
  // à verrouiller le compte de son propriétaire.
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { ok: false, field: 'password', error: 'WRONG_PASSWORD' };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return { ok: true };
}
