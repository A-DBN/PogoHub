'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { useT } from '@/i18n/client';
import { PillLink } from '@/components/ui/PillLink';
import { cn } from '@/lib/cn';

export type SwitcherLeague = {
  key: string;
  nameFr: string;
  nameEn: string;
  cpLimit: number | null;
  tier: 'MAIN' | 'MINOR' | 'CUSTOM';
  color: string;
};

/**
 * Les 3 ligues principales restent visibles ; les coupes secondaires sont
 * regroupées dans un menu par limite de PC pour ne pas encombrer la page.
 */
export function LeagueSwitcher({
  leagues,
  currentKey,
  basePath,
  category,
}: {
  leagues: SwitcherLeague[];
  currentKey: string;
  /** ex. "/fr/list" — les fonctions ne peuvent pas traverser la frontière serveur/client */
  basePath: string;
  category: string;
}) {
  const hrefFor = (leagueKey: string) =>
    `${basePath}?league=${encodeURIComponent(leagueKey)}&category=${encodeURIComponent(category)}`;

  const { dict, locale, name } = useT();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const main = leagues.filter((league) => league.tier === 'MAIN');
  const minor = leagues.filter((league) => league.tier !== 'MAIN');
  const activeMinor = minor.find((league) => league.key === currentKey);

  const groupLabel = (cpLimit: number | null) =>
    cpLimit === null
      ? locale === 'fr'
        ? 'Sans limite de PC'
        : 'No CP limit'
      : `${dict.dashboard.cpMax} ${cpLimit}`;

  const groups = [...new Set(minor.map((league) => league.cpLimit))]
    .sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
    .map((cpLimit) => ({
      cpLimit,
      label: groupLabel(cpLimit),
      items: minor.filter((league) => league.cpLimit === cpLimit),
    }));

  return (
    <div ref={wrapper} className="relative mb-2 flex flex-wrap items-center gap-1">
      {main.map((league) => (
        <PillLink
          key={league.key}
          href={hrefFor(league.key)}
          active={league.key === currentKey}
          color={league.color}
        >
          {name(league)}
        </PillLink>
      ))}

      <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />

      {activeMinor ? (
        <PillLink href={hrefFor(activeMinor.key)} active color={activeMinor.color}>
          {name(activeMinor)}
        </PillLink>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition duration-150',
          open || activeMinor
            ? 'bg-white/[0.08] text-ink'
            : 'text-muted hover:bg-white/[0.06] hover:text-ink',
        )}
      >
        <Trophy size={14} />
        {locale === 'fr' ? 'Coupes' : 'Cups'}
        <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{minor.length}</span>
        <ChevronDown size={14} className={cn('transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="pop absolute left-0 top-full z-50 mt-2 w-[min(38rem,90vw)] rounded-2xl bg-[#171b25]/97 p-3 shadow-[0_30px_70px_-24px_rgba(0,0,0,1)] backdrop-blur">
          {groups.map((group) => (
            <div key={group.label} className="mb-2.5 last:mb-0">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {group.items.map((league) => (
                  <Link
                    key={league.key}
                    href={hrefFor(league.key)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm transition',
                      league.key === currentKey
                        ? 'font-semibold text-white'
                        : 'text-muted hover:bg-white/[0.07] hover:text-ink',
                    )}
                    style={
                      league.key === currentKey
                        ? {
                            background: `linear-gradient(180deg, ${league.color}, ${league.color}cc)`,
                            boxShadow: `0 10px 20px -12px ${league.color}`,
                          }
                        : undefined
                    }
                  >
                    {name(league)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
