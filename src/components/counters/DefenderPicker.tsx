'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadges } from '@/components/pokemon/TypeBadge';
import { Input } from '@/components/ui';
import { useT } from '@/i18n/client';
import { findDefenders } from '@/server/actions/simulation';
import type { DefenderOption } from '@/server/queries/counters';
import { cn } from '@/lib/cn';

/** Au-delà, la liste déroulante devient illisible et le rendu coûte cher. */
const MAX_SUGGESTIONS = 40;

export function DefenderPicker({
  selectedId,
  hrefFor,
}: {
  selectedId: string;
  /** Construite côté client : un composant serveur ne peut pas passer de fonction. */
  hrefFor: string;
}) {
  const { dict, locale } = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche côté serveur : la liste complète ne transite plus avec la page.
  const [matches, setMatches] = useState<DefenderOption[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void findDefenders(query).then((rows) => {
        if (!cancelled) setMatches(rows.slice(0, MAX_SUGGESTIONS));
      });
    }, query ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const select = (speciesId: string) => {
    setOpen(false);
    setQuery('');
    router.push(hrefFor.replace('__SPECIES__', speciesId));
  };

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // le clic sur une suggestion déclenche le blur avant le clic : on attend
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          placeholder={dict.counters.pick}
          className="pl-9"
        />
      </div>

      {open && matches.length ? (
        <div
          className="pop absolute left-0 top-full z-50 mt-2 max-h-[22rem] w-full overflow-y-auto rounded-2xl bg-[#171b25]/97 p-1.5 shadow-[0_30px_70px_-24px_rgba(0,0,0,1)] backdrop-blur"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((option) => {
            const form = locale === 'fr' ? (option.formFr ?? option.form) : option.form;
            return (
              <button
                key={option.speciesId}
                type="button"
                onClick={() => select(option.speciesId)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition',
                  option.speciesId === selectedId
                    ? 'bg-white/[0.09]'
                    : 'hover:bg-white/[0.06]',
                )}
              >
                <PokemonIcon file={option.iconFile} alt={option.nameEn} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {locale === 'fr' ? option.nameFr : option.nameEn}
                  {form ? (
                    <span className="ml-1.5 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-muted">
                      {form}
                    </span>
                  ) : null}
                </span>
                <TypeBadges types={option.types} locale={locale} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
