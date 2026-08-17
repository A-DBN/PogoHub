'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Input, Label } from '@/components/ui';
import { LogoMark } from '@/components/layout/Logo';
import type { AuthState } from '@/server/auth/actions';
import { RecoveryPicker, type PickedSpecies } from './RecoveryPicker';
import { RECOVERY_PICKS } from '@/lib/pogo/recovery';

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

/** Décor : une Poké Ball stylisée, dessinée en CSS (aucune image externe). */
function Pokeball({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <span className="relative block h-full w-full rounded-full bg-gradient-to-b from-[#ff5f5f] via-[#ff5f5f] to-white shadow-inner">
        <span className="absolute inset-x-0 top-1/2 h-[10%] -translate-y-1/2 bg-[#0b0d12]/80" />
        <span className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#0b0d12]/80 bg-white" />
      </span>
    </span>
  );
}

function Shell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { dict } = useT();
  return (
    <div className="relative mx-auto flex min-h-[78dvh] w-full max-w-md items-center">
      {/* halos colorés en fond */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #6c8cff, transparent 65%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ff5f5f, transparent 65%)' }}
      />

      <div className="relative w-full overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-7 shadow-[0_40px_80px_-40px_rgba(0,0,0,1)] backdrop-blur-xl">
        <Pokeball className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 opacity-[0.09]" />

        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={36} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                {dict.app.name}
              </div>
              <h1 className="text-xl font-bold">{title}</h1>
            </div>
          </div>
          {subtitle ? (
            <p className="-mt-3 mb-5 text-sm text-muted">{subtitle}</p>
          ) : null}
          {children}
          {footer ? (
            <>
              <div className="rule my-5" />
              {footer}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-4 flex items-start gap-2 rounded-xl bg-danger/12 px-3 py-2.5 text-sm text-danger">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

function Submit({
  label,
  pending,
  disabled,
}: {
  label: string;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-2 w-full rounded-2xl bg-gradient-to-r from-brand via-[#7b7bff] to-brand-2 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_32px_-16px_rgba(108,140,255,1)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}

export function LoginForm({ action }: { action: Action }) {
  const { dict, locale } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <Shell
      title={dict.auth.loginTitle}
      subtitle={dict.app.tagline}
      footer={
        <div className="text-center text-sm text-muted">
          {dict.auth.noAccount}
          <Link
            href={`/${locale}/register`}
            className="ml-2 inline-block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 font-semibold text-ink transition hover:border-brand/60 hover:text-brand"
          >
            {dict.auth.registerTitle}
          </Link>
        </div>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <ErrorBox message={state.error} />
        <div>
          <Label htmlFor="email">{dict.auth.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">{dict.auth.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Submit label={dict.auth.submitLogin} pending={pending} />
        <Link
          href={`/${locale}/forgot`}
          className="text-center text-xs text-muted transition hover:text-ink"
        >
          {dict.recovery.forgot}
        </Link>
      </form>
    </Shell>
  );
}

export function RegisterForm({ action }: { action: Action }) {
  const { dict, locale } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const [picks, setPicks] = useState<PickedSpecies[]>([]);

  return (
    <Shell
      title={dict.auth.registerTitle}
      subtitle={dict.app.tagline}
      footer={
        <div className="text-center text-sm text-muted">
          {dict.auth.hasAccount}{' '}
          <Link href={`/${locale}/login`} className="font-semibold text-brand hover:underline">
            {dict.auth.loginTitle}
          </Link>
        </div>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <ErrorBox message={state.error} />
        <div>
          <Label htmlFor="email">{dict.auth.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="password">{dict.auth.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="passwordConfirm">{dict.auth.passwordConfirm}</Label>
            <Input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>

        {/* Trois Pokémon : le seul moyen de récupérer le compte, il n'y a pas
            d'envoi d'e-mail. Les identifiants partent en champs cachés. */}
        <div>
          <Label>{dict.recovery.legend}</Label>
          <p className="mb-2 text-[11px] text-muted">{dict.recovery.help}</p>
          <RecoveryPicker value={picks} onChange={setPicks} />
          {picks.map((pick) => (
            <input key={pick.speciesId} type="hidden" name="recovery" value={pick.speciesId} />
          ))}
        </div>

        <Submit
          label={dict.auth.submitRegister}
          pending={pending}
          disabled={picks.length < RECOVERY_PICKS}
        />
      </form>
    </Shell>
  );
}

export function UsernameForm({ action }: { action: Action }) {
  const { dict, locale } = useT();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <Shell title={dict.auth.chooseUsername} subtitle={dict.auth.usernameHelp}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <ErrorBox message={state.error} />
        <div>
          <Label htmlFor="username">{dict.auth.username}</Label>
          <Input
            id="username"
            name="username"
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_-]+"
            required
            autoFocus
          />
        </div>
        <Submit label={dict.common.save} pending={pending} />
      </form>
    </Shell>
  );
}
