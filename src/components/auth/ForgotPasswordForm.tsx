'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Check } from 'lucide-react';
import { Input, Label } from '@/components/ui';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { RecoveryPicker, type PickedSpecies } from './RecoveryPicker';
import { RECOVERY_PICKS } from '@/lib/pogo/recovery';
import { resetPasswordWithPicks, type RecoveryResult } from '@/server/actions/recovery';

export function ForgotPasswordForm() {
  const { dict, locale } = useT();
  const [email, setEmail] = useState('');
  const [picks, setPicks] = useState<PickedSpecies[]>([]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      setResult(
        await resetPasswordWithPicks({
          email,
          picks: picks.map((pick) => pick.speciesId),
          password,
          confirm,
        }),
      );
    });
  };

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-xl bg-success/12 px-3 py-2.5 text-sm text-success">
          <Check size={16} className="mt-0.5 shrink-0" />
          {dict.recovery.done}
        </p>
        <Link
          href={`/${locale}/login`}
          className="w-full rounded-2xl bg-gradient-to-r from-brand via-[#7b7bff] to-brand-2 px-4 py-3 text-center text-sm font-bold text-white transition hover:brightness-110"
        >
          {dict.auth.submitLogin}
        </Link>
      </div>
    );
  }

  const message =
    result && !result.ok
      ? interpolate(
          dict.recovery.errors[result.error as keyof typeof dict.recovery.errors] ??
            result.error,
          { minutes: String(result.minutes ?? '') },
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <p className="flex items-start gap-2 rounded-xl bg-danger/12 px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {message}
        </p>
      ) : null}

      <div>
        <Label htmlFor="email">{dict.recovery.email}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <Label>{dict.recovery.legend}</Label>
        <p className="mb-2 text-[11px] text-muted">{dict.recovery.helpReset}</p>
        <RecoveryPicker value={picks} onChange={setPicks} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="password">{dict.recovery.newPassword}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confirm">{dict.recovery.confirmPassword}</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending || picks.length < RECOVERY_PICKS || !email || !password}
        className="mt-2 w-full rounded-2xl bg-gradient-to-r from-brand via-[#7b7bff] to-brand-2 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_32px_-16px_rgba(108,140,255,1)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? '…' : dict.recovery.submit}
      </button>
    </div>
  );
}
