'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play, CircleCheck, CircleX } from 'lucide-react';
import { Card, ColumnLabel } from '@/components/ui';
import { useT } from '@/i18n/client';
import type { Locale } from '@/i18n/config';
import { triggerIngest } from '@/server/actions/admin';
import type { IngestRunView } from '@/server/queries/admin';
import { cn } from '@/lib/cn';

/** Étapes lançables, dans l'ordre où elles se tiennent. */
const STEPS = [
  'pokemon', 'pvemoves', 'sprites', 'leagues', 'meta', 'news', 'shiny', 'raids',
] as const;

/** Ces étapes prennent des minutes : on prévient avant le clic. */
const HEAVY = new Set(['pokemon', 'meta', 'sprites']);

export function IngestPanel({
  runs,
  lastSuccess,
  locale,
}: {
  runs: IngestRunView[];
  lastSuccess: Record<string, string>;
  locale: Locale;
}) {
  const { dict } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launch = (kind: string) => {
    setBusy(kind);
    setError(null);
    startTransition(async () => {
      const result = await triggerIngest(kind);
      if (!result.ok) setError(result.message ?? result.error);
      setBusy(null);
      router.refresh();
    });
  };

  const when = (iso: string | undefined) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : null;

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => {
          const success = when(lastSuccess[step]);
          return (
            <Card key={step} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{step}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {dict.admin.lastSuccess} : {success ?? dict.admin.never}
                  </div>
                  {HEAVY.has(step) ? (
                    <div className="mt-0.5 text-[10px] text-warn">{dict.admin.heavyStep}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => launch(step)}
                  className="shrink-0 rounded-lg bg-white/[0.06] p-1.5 transition hover:bg-white/[0.12] disabled:opacity-40"
                  title={dict.admin.run}
                  aria-label={`${dict.admin.run} ${step}`}
                >
                  <Play size={13} />
                </button>
              </div>
              {busy === step ? (
                <div className="mt-1.5 text-[11px] text-pve">{dict.admin.running}</div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-6">
        <ColumnLabel>{dict.admin.lastRuns}</ColumnLabel>
        <Card className="mt-2 overflow-x-auto p-1">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2"><ColumnLabel>{dict.admin.step}</ColumnLabel></th>
                <th className="px-3 py-2"><ColumnLabel>{dict.admin.status}</ColumnLabel></th>
                <th className="px-3 py-2"><ColumnLabel>{dict.common.updatedAt}</ColumnLabel></th>
                <th className="px-3 py-2 text-right"><ColumnLabel>{dict.admin.duration}</ColumnLabel></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="odd:bg-white/[0.02]">
                  <td className="px-3 py-1.5 font-medium">{run.kind}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs',
                        run.ok ? 'text-success' : 'text-danger',
                      )}
                      // l'erreur complète au survol : elle est souvent longue
                      title={run.error ?? undefined}
                    >
                      {run.ok ? <CircleCheck size={13} /> : <CircleX size={13} />}
                      {run.ok ? dict.admin.okLabel : dict.admin.failed}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">{when(run.startedAt)}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted">
                    {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)} s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
