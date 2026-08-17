'use client';

import { useState, useTransition } from 'react';
import { Check, Repeat } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { useT } from '@/i18n/client';
import { requestTrade } from '@/server/actions/trades';
import type { TradeListView } from '@/server/queries/trades';
import { cn } from '@/lib/cn';

/**
 * Liste d'échange d'un joueur, sur son profil public.
 *
 * On ne montre le bouton qu'aux visiteurs connectés qui ne sont pas chez eux :
 * proposer un échange avec soi-même n'a pas de sens, et le serveur le refuse
 * de toute façon.
 */
export function TradeListPanel({
  list,
  canRequest,
}: {
  list: TradeListView;
  canRequest: boolean;
}) {
  const { dict, locale } = useT();
  const [asked, setAsked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = (pokemonId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await requestTrade(list.username, pokemonId);
      if (result.ok) setAsked((current) => [...current, pokemonId]);
      else setError(dict.trades.errors[result.error] ?? result.error);
    });
  };

  if (!list.entries.length) return <EmptyState>{dict.trades.emptyList}</EmptyState>;

  return (
    <Card className="p-4">
      {list.note ? <p className="mb-3 text-sm text-muted">{list.note}</p> : null}
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {list.entries.map((entry) => {
          const name = locale === 'fr' ? entry.nameFr : entry.nameEn;
          const done = asked.includes(entry.pokemonId);
          return (
            <div key={entry.pokemonId} className="relative">
              <div className="rounded-xl bg-white/[0.04] p-1.5 text-center">
                <PokemonIcon
                  file={entry.shinyIconFile ?? entry.iconFile}
                  alt={name}
                  size={52}
                />
                {entry.count > 1 ? (
                  <span className="absolute right-0 top-0 rounded-full bg-black/70 px-1.5 text-[10px] font-bold">
                    ×{entry.count}
                  </span>
                ) : null}
                <div className="mt-0.5 max-w-[5.5rem] truncate text-[10px] text-muted">{name}</div>

                {canRequest && list.open ? (
                  <button
                    type="button"
                    disabled={pending || done}
                    onClick={() => ask(entry.pokemonId)}
                    title={done ? dict.trades.requested : dict.trades.request}
                    className={cn(
                      'mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg',
                      'px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-60',
                      done
                        ? 'bg-success/15 text-success'
                        : 'bg-white/[0.07] text-muted hover:bg-brand/25 hover:text-ink',
                    )}
                  >
                    {done ? <Check size={11} /> : <Repeat size={11} />}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
