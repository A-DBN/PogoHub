'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Pin } from 'lucide-react';
import { Card, ColumnLabel, EmptyState, Section } from '@/components/ui';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { NewsFeed as Feed, NewsView } from '@/server/queries/news';
import { cn } from '@/lib/cn';

const DAY_MS = 1000 * 60 * 60 * 24;

/** Jours entiers entre aujourd'hui et une date, en ignorant l'heure. */
function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

type Dict = ReturnType<typeof useT>['dict'];

/** Repère temporel : ce qu'on veut savoir d'un coup d'œil sur une carte. */
function timing(item: NewsView, dict: Dict): string | null {
  if (item.startAt) {
    const days = daysUntil(item.startAt);
    if (days > 1) return interpolate(dict.news.startsIn, { days });
    if (days === 1) return dict.news.startsTomorrow;
    if (days === 0) return dict.news.startsToday;
  }
  if (item.endAt) {
    const days = daysUntil(item.endAt);
    if (days === 0) return dict.news.endsToday;
    if (days > 0) return interpolate(dict.news.endsIn, { days });
  }
  return item.startAt ? null : dict.news.ongoing;
}

function NewsCard({ item, locale, dict }: { item: NewsView; locale: Locale; dict: Dict }) {
  const typeLabel =
    dict.news.types[item.type as keyof typeof dict.news.types] ?? item.type;
  const when = timing(item, dict);

  const range = [item.startAt, item.endAt]
    .filter((date): date is string => Boolean(date))
    .map((date) =>
      new Date(date).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
    .join(' → ');

  const body = (
    <>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- visuels LeekDuck distants
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className="h-28 w-full rounded-xl object-cover"
        />
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {typeLabel}
        </span>
        {item.isPinned ? <Pin size={12} className="text-warn" /> : null}
        {when ? <span className="ml-auto text-[11px] font-semibold text-pve">{when}</span> : null}
      </div>

      <h3 className="mt-1.5 font-bold leading-tight">{item.title}</h3>

      {range ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          <CalendarDays size={12} />
          {range}
        </div>
      ) : null}

      {item.link ? (
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted transition group-hover:text-brand">
          <ExternalLink size={11} />
          {dict.news.originalPage}
        </span>
      ) : null}
    </>
  );

  const className = 'group flex flex-col p-3';

  return item.link ? (
    <a href={item.link} target="_blank" rel="noreferrer noopener">
      <Card className={className} hover>
        {body}
      </Card>
    </a>
  ) : (
    <Card className={className}>{body}</Card>
  );
}

export function NewsFeed({ feed, locale }: { feed: Feed; locale: Locale }) {
  const { dict } = useT();
  const [type, setType] = useState<string | 'all'>('all');

  const filter = useMemo(
    () => (list: NewsView[]) =>
      type === 'all' ? list : list.filter((item) => item.type === type),
    [type],
  );

  const groups = [
    { key: 'active', title: dict.news.active, items: filter(feed.active) },
    { key: 'upcoming', title: dict.news.upcoming, items: filter(feed.upcoming) },
    { key: 'past', title: dict.news.past, items: filter(feed.past) },
  ].filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1">
        {(['all', ...feed.types] as Array<string | 'all'>).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
              type === value
                ? 'bg-gradient-to-b from-brand to-[#5474f0] font-semibold text-white shadow-[0_10px_20px_-12px_rgba(108,140,255,1)]'
                : 'text-muted hover:bg-white/[0.06] hover:text-ink',
            )}
          >
            {value === 'all'
              ? dict.news.allTypes
              : (dict.news.types[value as keyof typeof dict.news.types] ?? value)}
          </button>
        ))}
      </div>

      {groups.length ? (
        groups.map((group) => (
          <Section key={group.key} title={group.title} hint={String(group.items.length)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((item) => (
                <NewsCard key={item.id} item={item} locale={locale} dict={dict} />
              ))}
            </div>
          </Section>
        ))
      ) : (
        <EmptyState>{dict.news.noNews}</EmptyState>
      )}

      <p className="mt-4 text-[11px] text-muted">
        <ColumnLabel>{dict.common.source}</ColumnLabel> LeekDuck
      </p>
    </div>
  );
}
