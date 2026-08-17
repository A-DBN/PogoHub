'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { createSession, destroySession, requireUser } from './session';
import { hashRecoveryPicks } from '@/server/actions/recovery';

export type AuthState = { error?: string; ok?: boolean };

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_-]+$/);

function dictOf(formData: FormData) {
  const locale = String(formData.get('locale') ?? DEFAULT_LOCALE);
  return {
    dict: getDictionary(locale),
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
  };
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { dict, locale } = dictOf(formData);
  const email = emailSchema.safeParse(formData.get('email'));
  const password = passwordSchema.safeParse(formData.get('password'));
  const confirm = String(formData.get('passwordConfirm') ?? '');

  if (!email.success) return { error: dict.auth.invalidEmail };
  if (!password.success) return { error: dict.auth.passwordTooShort };
  if (password.data !== confirm) return { error: dict.auth.passwordMismatch };

  const existing = await prisma.user.findUnique({ where: { email: email.data } });
  if (existing) return { error: dict.auth.emailTaken };

  // Trois Pokémon : sans envoi d'e-mail, c'est le seul chemin de retour vers le
  // compte. On refuse l'inscription plutôt que de créer un compte irrécupérable.
  const recoveryHash = await hashRecoveryPicks(formData.getAll('recovery').map(String));
  if (!recoveryHash) return { error: dict.recovery.errors.INVALID_PICKS };

  const isFirstUser = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      email: email.data,
      passwordHash: await bcrypt.hash(password.data, 10),
      locale,
      recoveryHash,
      role: isFirstUser ? 'ADMIN' : 'USER', // le premier compte administre l'instance
    },
    select: { id: true },
  });

  await createSession(user.id);
  redirect(`/${locale}/welcome`);
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { dict, locale } = dictOf(formData);
  const email = emailSchema.safeParse(formData.get('email'));
  const password = String(formData.get('password') ?? '');

  if (!email.success || password.length === 0) {
    return { error: dict.auth.invalidCredentials };
  }

  const user = await prisma.user.findUnique({
    where: { email: email.data },
    select: { id: true, passwordHash: true, username: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: dict.auth.invalidCredentials };
  }

  await createSession(user.id);
  redirect(user.username ? `/${locale}/dashboard` : `/${locale}/welcome`);
}

export async function setUsernameAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { dict, locale } = dictOf(formData);
  const user = await requireUser();
  const username = usernameSchema.safeParse(formData.get('username'));
  if (!username.success) return { error: dict.auth.invalidUsername };

  const taken = await prisma.user.findFirst({
    where: { username: { equals: username.data, mode: 'insensitive' }, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) return { error: dict.auth.usernameTaken };

  await prisma.user.update({
    where: { id: user.id },
    data: { username: username.data },
  });
  redirect(`/${locale}/dashboard`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? DEFAULT_LOCALE);
  await destroySession();
  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/login`);
}
