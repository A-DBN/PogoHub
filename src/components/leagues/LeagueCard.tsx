'use client';

import Link from 'next/link';
import { Info, ChevronRight } from 'lucide-react';
import { useT } from '@/i18n/client';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadges } from '@/components/pokemon/TypeBadge';
import { Card, ColumnLabel } from '@/components/ui';
import { HoverCard } from '@/components/ui/HoverCard';
import type { LeagueCard as LeagueCardData } from '@/server/queries/leagues';
import { cn } from '@/lib/cn';

function Rules({ league, title }: { league: LeagueCardData; title: string }) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: league.color }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </span>
      </div>
      <ul className="space-y-1.5">
        {league.rules.length ? (
          league.rules.map((rule) => (
            <li key={rule} className="flex gap-2 leading-snug">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted" />
              {rule}
            </li>
          ))
        ) : (
          <li className="text-muted">—</li>
        )}
      </ul>
    </>
  );
}

export function LeagueCard({
  league,
  variant = 'main',
}: {
  league: LeagueCardData;
  variant?: 'main' | 'minor';
}) {
  const { dict, locale, t, name } = useT();
  const isMain = variant === 'main';

  return (
    <Card hover accent={league.color} className={cn('flex flex-col', isMain ? 'p-5' : 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('truncate font-bold', isMain ? 'text-xl' : 'text-[15px]')}>
            {name(league)}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {league.cpLimit === null
              ? dict.dashboard.noCpLimit
              : `${dict.dashboard.cpMax} ${league.cpLimit}`}
          </p>
        </div>

        <HoverCard
          align="end"
          content={<Rules league={league} title={dict.dashboard.restrictions} />}
          className="shrink-0 cursor-help text-muted transition hover:text-brand"
        >
          <Info size={17} aria-label={dict.dashboard.restrictions} />
        </HoverCard>
      </div>

      {isMain && league.top.length ? (
        <div className="mt-4">
          <div className="mb-1.5 grid grid-cols-[1.4rem_1.9rem_1fr_auto_2.6rem] items-center gap-2 px-1">
            <ColumnLabel className="text-right">#</ColumnLabel>
            <ColumnLabel />
            <ColumnLabel>Pokémon</ColumnLabel>
            <ColumnLabel>{dict.common.types}</ColumnLabel>
            <ColumnLabel className="text-right">{dict.common.score}</ColumnLabel>
          </div>
          <ul className="space-y-0.5">
            {league.top.map((entry) => (
              <li
                key={entry.rank}
                className="grid grid-cols-[1.4rem_1.9rem_1fr_auto_2.6rem] items-center gap-2 rounded-lg px-1 py-1 text-sm transition hover:bg-white/[0.05]"
              >
                <span className="text-right text-xs text-muted">{entry.rank}</span>
                <PokemonIcon file={entry.iconFile} alt={name(entry)} size={28} />
                <span className="min-w-0 truncate">{name(entry)}</span>
                <TypeBadges types={entry.types} locale={locale} />
                <span className="text-right text-xs font-semibold text-muted">
                  {entry.score?.toFixed(1) ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2 pt-3 text-xs text-muted">
        <span className="rounded-lg bg-white/[0.05] px-2 py-1">
          {t(dict.dashboard.yourTeams, { count: league.teamCount })}
        </span>
        <Link
          href={`/${locale}/list?league=${league.key}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-brand transition hover:bg-brand/10"
        >
          {dict.dashboard.seeList}
          <ChevronRight size={14} />
        </Link>
      </div>
    </Card>
  );
}
