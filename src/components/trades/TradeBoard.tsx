'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button, Card, ColumnLabel, EmptyState, Section } from '@/components/ui';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { useT } from '@/i18n/client';
import { formatFriendCode } from '@/lib/pogo/trainer';
import { allowedActions, isClosed, waitingOn, type TradeAction } from '@/lib/pogo/trade';
import { actOnTrade, chooseCounterpart } from '@/server/actions/trades';
import type { TradeSpecies, TradeView } from '@/server/queries/trades';
import { cn } from '@/lib/cn';

/** Un chromatique dans un échange : sprite chromatique, nom, exemplaires. */
function Species({ species, label }: { species: TradeSpecies | null; label: string }) {
  const { dict, locale } = useT();
  return (
    <div className="min-w-[7rem]">
      <ColumnLabel>{label}</ColumnLabel>
      {species ? (
        <div className="mt-0.5 flex items-center gap-1.5">
          <PokemonIcon
            file={species.shinyIconFile ?? species.iconFile}
            alt={locale === 'fr' ? species.nameFr : species.nameEn}
            size={38}
          />
          <span className="truncate text-sm font-semibold">
            {locale === 'fr' ? species.nameFr : species.nameEn}
          </span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted">{dict.trades.pending}</div>
      )}
    </div>
  );
}

export function TradeBoard({
  trades,
  myOffers,
}: {
  trades: TradeView[];
  /** Ma propre liste : elle sert à répondre quand c'est à moi de choisir. */
  myOffers: Record<string, TradeSpecies[]>;
}) {
  const { dict, locale } = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (id: string, action: TradeAction) => {
    setError(null);
    startTransition(async () => {
      const result = await actOnTrade(id, action);
      if (!result.ok) {
        setError(dict.trades.errors[result.error] ?? result.error);
      }
    });
  };

  const choose = (id: string, pokemonId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await chooseCounterpart(id, pokemonId);
      if (!result.ok) setError(dict.trades.errors[result.error] ?? result.error);
    });
  };

  const ongoing = trades.filter((trade) => !isClosed(trade.status));
  const closed = trades.filter((trade) => isClosed(trade.status));

  const renderTrade = (trade: TradeView) => {
    // Les boutons proposés viennent de la même fonction que le contrôle
    // serveur : l'écran ne peut pas offrir une action que l'action refusera.
    const allowed = allowedActions(
      {
        status: trade.status,
        requesterDone: trade.role === 'requester' ? trade.me.done : trade.peer.done,
        ownerDone: trade.role === 'owner' ? trade.me.done : trade.peer.done,
      },
      trade.role,
    );

    // Le demandeur reçoit `wanted` ; vu par le propriétaire, c'est l'inverse.
    const receives = trade.role === 'requester' ? trade.wanted : trade.offered;
    const gives = trade.role === 'requester' ? trade.offered : trade.wanted;
    const canChoose = allowed.includes('choose');

    /**
     * Le badge dit à qui de jouer, pas le statut brut.
     *
     * « À vous de choisir » s'affichait des deux côtés d'un `REQUESTED` : celui
     * qui attendait croyait que la balle était dans son camp.
     */
    const turn = waitingOn(
      {
        status: trade.status,
        requesterDone: trade.role === 'requester' ? trade.me.done : trade.peer.done,
        ownerDone: trade.role === 'owner' ? trade.me.done : trade.peer.done,
      },
      trade.role,
    );
    const badge =
      turn === 'you'
        ? dict.trades.waitingYou
        : turn === 'peer'
          ? dict.trades.waitingOther
          : dict.trades.statuses[trade.status];

    return (
      <Card key={trade.id} className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              trade.status === 'COMPLETED'
                ? 'bg-success/15 text-success'
                : isClosed(trade.status)
                  ? 'bg-white/[0.07] text-muted'
                  : // ce qui attend l'autre reste discret ; ce qui m'attend ressort
                    turn === 'you'
                    ? 'bg-brand/20 text-brand'
                    : 'bg-white/[0.07] text-muted',
            )}
          >
            {badge}
          </span>
          <span className="text-sm font-semibold">{trade.peer.username}</span>
          {trade.peer.friendCode ? (
            <span className="font-mono text-xs tracking-wider text-muted">
              {formatFriendCode(trade.peer.friendCode)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Species species={receives} label={dict.trades.youGet} />
          <ArrowRight size={16} className="text-muted" />
          <Species species={gives} label={dict.trades.youGive} />
        </div>

        {trade.status === 'ACCEPTED' ? (
          <p className="mt-2 text-[11px] text-muted">{dict.trades.tradeInGame}</p>
        ) : null}
        {canChoose ? (
          <div className="mt-3">
            <ColumnLabel>{dict.trades.choosePrompt}</ColumnLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(myOffers[trade.id] ?? []).map((species) => (
                <button
                  key={species.pokemonId}
                  type="button"
                  disabled={pending}
                  onClick={() => choose(trade.id, species.pokemonId)}
                  title={locale === 'fr' ? species.nameFr : species.nameEn}
                  className="rounded-lg bg-white/[0.05] p-1 transition hover:bg-brand/25 disabled:opacity-50"
                >
                  <PokemonIcon
                    file={species.shinyIconFile ?? species.iconFile}
                    alt={locale === 'fr' ? species.nameFr : species.nameEn}
                    size={34}
                  />
                </button>
              ))}
              {!(myOffers[trade.id] ?? []).length ? (
                <span className="text-xs text-muted">{dict.trades.emptyList}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {allowed.includes('accept') ? (
            <Button type="button" onClick={() => act(trade.id, 'accept')} disabled={pending}>
              <Check size={14} />
              {dict.trades.accept}
            </Button>
          ) : null}
          {allowed.includes('done') ? (
            <Button type="button" onClick={() => act(trade.id, 'done')} disabled={pending}>
              <Check size={14} />
              {dict.trades.done}
            </Button>
          ) : null}
          {allowed.includes('decline') ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => act(trade.id, 'decline')}
              disabled={pending}
            >
              <X size={14} />
              {dict.trades.decline}
            </Button>
          ) : null}
          {allowed.includes('cancel') ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => act(trade.id, 'cancel')}
              disabled={pending}
            >
              {dict.trades.cancel}
            </Button>
          ) : null}
        </div>
      </Card>
    );
  };

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <Section title={dict.trades.ongoing} hint={String(ongoing.length)}>
        {ongoing.length ? (
          <div className="grid gap-3 lg:grid-cols-2">{ongoing.map(renderTrade)}</div>
        ) : (
          <EmptyState>{dict.trades.noTrades}</EmptyState>
        )}
      </Section>

      {closed.length ? (
        <Section title={dict.trades.closed} hint={String(closed.length)}>
          <div className="grid gap-3 lg:grid-cols-2">{closed.map(renderTrade)}</div>
        </Section>
      ) : null}
    </div>
  );
}
