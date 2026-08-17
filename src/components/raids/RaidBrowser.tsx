'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, CloudSun, CalendarDays } from 'lucide-react';
import { useT } from '@/i18n/client';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadges, TypeBadge } from '@/components/pokemon/TypeBadge';
import { Input, ColumnLabel, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { RaidView } from '@/server/queries/raids';

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function RaidCard({ boss }: { boss: RaidView }) {
  const { dict, locale } = useT();
  const name = locale === 'fr' ? boss.nameFr : boss.nameEn;
  const form = locale === 'fr' ? (boss.formFr ?? boss.form) : boss.form;
  const kindLabel = dict.raids.kinds[boss.kind as keyof typeof dict.raids.kinds] ?? boss.tier;
  const weather = boss.weather.map(
    (key) => dict.raids.weatherNames[key.toLowerCase() as keyof typeof dict.raids.weatherNames] ?? key,
  );

  // sans espèce rattachée il n'y a pas de fiche à ouvrir : la carte reste inerte
  const Wrapper = ({ className, children }: { className: string; children: React.ReactNode }) =>
    boss.speciesId ? (
      <Link href={`/${locale}/raids/${boss.speciesId}`} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <Wrapper className="relative block overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-4 text-left shadow-[0_18px_40px_-28px_rgba(0,0,0,0.95)] transition hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <PokemonIcon file={boss.iconFile} alt={name} size={58} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-bold">{name}</h3>
            {form ? (
              <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                {form}
              </span>
            ) : null}
            {boss.isShadow ? (
              // le palier LeekDuck ne dit pas qu'un boss est obscur : le badge doit le crier
              <span className="rounded-md bg-gradient-to-b from-shadow-badge to-[#7c4dff] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_6px_14px_-6px_rgba(167,139,250,0.95)]">
                {dict.common.shadow}
              </span>
            ) : null}
            {boss.canBeShiny ? (
              <Sparkles size={14} className="shrink-0 text-warn" />
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {kindLabel}
            </span>
            <TypeBadges types={boss.types} locale={locale} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/[0.04] px-2.5 py-1.5">
          <ColumnLabel>{dict.raids.catchCp}</ColumnLabel>
          <div className="text-sm font-semibold">
            {boss.cp ? `${boss.cp.min} – ${boss.cp.max}` : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.04] px-2.5 py-1.5">
          <ColumnLabel>{dict.raids.boostedCp}</ColumnLabel>
          <div className="text-sm font-semibold text-pve">
            {boss.cpBoosted ? `${boss.cpBoosted.min} – ${boss.cpBoosted.max}` : '—'}
          </div>
        </div>
      </div>

      {boss.startAt ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <CalendarDays size={13} />
          {new Date(boss.startAt).toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
          {boss.endAt ? (
            <>
              {' · '}
              {new Date(boss.startAt).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' – '}
              {new Date(boss.endAt).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </>
          ) : null}
        </div>
      ) : null}

      {weather.length ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <CloudSun size={13} />
          {weather.join(', ')}
        </div>
      ) : null}

      <div className="mt-3">
        <ColumnLabel>{dict.raids.weaknesses}</ColumnLabel>
        <div className="mt-1 flex flex-wrap gap-1">
          {boss.weaknesses.slice(0, 6).map((type) => (
            <TypeBadge key={type} type={type} locale={locale} />
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

export function RaidBrowser({
  current,
  scheduled,
  catalog,
}: {
  current: RaidView[];
  scheduled: RaidView[];
  catalog: RaidView[];
}) {
  const { dict, locale } = useT();
  const [tab, setTab] = useState<'current' | 'scheduled' | 'catalog'>('current');
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<number | 'all'>('all');

  const source = tab === 'current' ? current : tab === 'scheduled' ? scheduled : catalog;

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return source.filter((boss) => {
      if (tier !== 'all' && boss.tierLevel !== tier) return false;
      if (!q) return true;
      return normalize(
        `${boss.nameFr} ${boss.nameEn} ${boss.form ?? ''} ${boss.formFr ?? ''}`,
      ).includes(q);
    });
  }, [source, query, tier]);

  const tiers = [...new Set(source.map((boss) => boss.tierLevel))].sort((a, b) => b - a);

  const Pill = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-gradient-to-b from-pve to-[#2f9fb2] font-semibold text-white shadow-[0_10px_20px_-12px_rgba(69,200,220,1)]'
          : 'text-muted hover:bg-white/[0.06] hover:text-ink',
      )}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex gap-1">
          <Pill active={tab === 'current'} onClick={() => setTab('current')}>
            {dict.raids.current}
            <span className="ml-1.5 rounded-full bg-black/25 px-1.5 text-[10px]">
              {current.length}
            </span>
          </Pill>
          <Pill active={tab === 'scheduled'} onClick={() => setTab('scheduled')}>
            {dict.raids.scheduled}
            <span className="ml-1.5 rounded-full bg-black/25 px-1.5 text-[10px]">
              {scheduled.length}
            </span>
          </Pill>
          <Pill active={tab === 'catalog'} onClick={() => setTab('catalog')}>
            {dict.raids.catalog}
            <span className="ml-1.5 rounded-full bg-black/25 px-1.5 text-[10px]">
              {catalog.length}
            </span>
          </Pill>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={dict.list.searchPlaceholder}
          className="max-w-[16rem] border-transparent bg-white/[0.05] focus:border-transparent focus:bg-white/[0.08]"
        />

        <div className="flex gap-1">
          <Pill active={tier === 'all'} onClick={() => setTier('all')}>
            {dict.common.all}
          </Pill>
          {tiers.map((level) => (
            <Pill key={level} active={tier === level} onClick={() => setTier(level)}>
              {level >= 6 ? 'Méga / Max' : `${level}★`}
            </Pill>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted">{visible.length}</span>
      </div>

      {visible.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((boss) => (
            <RaidCard key={`${boss.id}-${boss.name}`} boss={boss} />
          ))}
        </div>
      ) : (
        <EmptyState>
          {tab === 'current'
            ? dict.raids.noCurrent
            : tab === 'scheduled'
              ? dict.raids.noScheduled
              : dict.list.noResults}
        </EmptyState>
      )}
    </div>
  );
}
