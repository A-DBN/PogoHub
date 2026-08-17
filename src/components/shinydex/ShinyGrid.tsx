'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Copy, Lock, Minus, Plus, Repeat, Sparkles } from 'lucide-react';
import { useT } from '@/i18n/client';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { Input, ColumnLabel, Button } from '@/components/ui';
import { setShinyCount, setShinyReleased } from '@/server/actions/collection';
import { setForTrade } from '@/server/actions/trades';
import { LazySection } from '@/components/ui/LazySection';
import { cn } from '@/lib/cn';
import type { ShinyGeneration } from '@/server/queries/shinydex';

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Filter = 'all' | 'caught' | 'missing';

export function ShinyGrid({
  generations,
  totals,
  isLoggedIn,
  isAdmin,
  loginHref,
}: {
  generations: ShinyGeneration[];
  totals: { released: number; caught: number; duplicates?: number };
  isLoggedIn: boolean;
  isAdmin: boolean;
  loginHref: string;
}) {
  const { dict, locale, t } = useT();
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      generations.flatMap((g) =>
        g.entries.filter((e) => e.caught).map((e) => [e.id, e.count || 1]),
      ),
    ),
  );
  /**
   * Proposé à l'échange, tel qu'affiché. On stocke le résultat de la règle, pas
   * la colonne : c'est ce que l'utilisateur voit, et c'est donc ce que le clic
   * doit inverser.
   */
  const [offered, setOffered] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      generations.flatMap((g) => g.entries.filter((e) => e.offered).map((e) => [e.id, true])),
    ),
  );

  const toggleTrade = (id: string) => {
    const next = !offered[id];
    setOffered((current) => ({ ...current, [id]: next }));
    void setForTrade(id, next).then((result) => {
      // rejet du serveur : on remet l'affichage dans l'état vrai
      if (!result.ok) setOffered((current) => ({ ...current, [id]: !next }));
    });
  };

  const [released, setReleased] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(generations.flatMap((g) => g.entries.map((e) => [e.id, e.released]))),
  );
  const [generationFilter, setGenerationFilter] = useState<number | 'all'>('all');
  const [askLogin, setAskLogin] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState<
    { id: string; name: string; release: boolean } | null
  >(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showUnreleased, setShowUnreleased] = useState(false);
  const [, startTransition] = useTransition();

  const caughtTotal = useMemo(
    () => Object.values(counts).filter((value) => value > 0).length,
    [counts],
  );
  const duplicatesTotal = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + Math.max(0, value - 1), 0),
    [counts],
  );

  /** delta = +1 / -1 ; sans delta on bascule capturé / non capturé. */
  const change = (id: string, delta?: number) => {
    if (!isLoggedIn) {
      setAskLogin(true);
      return;
    }
    if (!released[id]) {
      // chromatique pas encore sorti : seul un admin peut le débloquer,
      // et jamais sans confirmation (évite le mauvais clic)
      if (!isAdmin) return;
      setConfirmRelease({ id, name: nameOf(id), release: true });
      return;
    }
    const current = counts[id] ?? 0;
    const next =
      delta === undefined ? (current > 0 ? 0 : 1) : Math.max(0, current + delta);
    setCounts((state) => ({ ...state, [id]: next }));
    startTransition(async () => {
      const result = await setShinyCount(id, next);
      if (!result.ok) setCounts((state) => ({ ...state, [id]: current }));
    });
  };

  const nameOf = (id: string) => {
    for (const group of generations) {
      const entry = group.entries.find((item) => item.id === id);
      if (entry) return locale === 'fr' ? entry.nameFr : entry.nameEn;
    }
    return '';
  };

  /** Admin : (dé)verrouille un chromatique après confirmation. */
  const applyRelease = () => {
    if (!confirmRelease) return;
    const { id, release } = confirmRelease;
    setReleased((state) => ({ ...state, [id]: release }));
    setConfirmRelease(null);
    startTransition(async () => {
      await setShinyReleased(id, release);
    });
  };

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return generations
      .map((generation) => ({
        ...generation,
        entries: generation.entries.filter((entry) => {
          if (!showUnreleased && !released[entry.id]) return false;
          if (filter === 'caught' && !counts[entry.id]) return false;
          if (filter === 'missing' && counts[entry.id]) return false;
          if (!q) return true;
          return (
            normalize(entry.nameFr).includes(q) ||
            normalize(entry.nameEn).includes(q) ||
            String(entry.dex) === q
          );
        }),
      }))
      .filter((group) => group.entries.length > 0)
      .filter((group) => generationFilter === 'all' || group.generation === generationFilter);
  }, [generations, query, filter, showUnreleased, counts, released, generationFilter]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white/[0.05] px-4 py-2">
          <Sparkles size={16} className="text-warn" />
          <span className="text-lg font-bold">{caughtTotal}</span>
          <span className="text-sm text-muted">/ {totals.released}</span>
          <span className="ml-1 text-xs text-muted">{dict.shinydex.caught}</span>
        </div>

        <div
          className="flex items-center gap-2 rounded-2xl bg-white/[0.05] px-4 py-2"
          title={locale === 'fr' ? 'Exemplaires en double (échangeables)' : 'Duplicates (tradeable)'}
        >
          <Copy size={15} className="text-brand" />
          <span className="text-lg font-bold">{duplicatesTotal}</span>
          <span className="text-xs text-muted">
            {locale === 'fr' ? 'doublons' : 'duplicates'}
          </span>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={dict.list.searchPlaceholder}
          className="max-w-[16rem] border-transparent bg-white/[0.05] focus:border-transparent focus:bg-white/[0.08]"
        />

        <div className="flex gap-1">
          {(
            [
              ['all', dict.shinydex.filterAll],
              ['caught', dict.shinydex.filterCaught],
              ['missing', dict.shinydex.filterMissing],
            ] as Array<[Filter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                filter === key
                  ? 'bg-gradient-to-b from-brand to-[#5474f0] font-semibold text-white shadow-[0_10px_20px_-12px_rgba(108,140,255,1)]'
                  : 'text-muted hover:bg-white/[0.06] hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowUnreleased((value) => !value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm transition',
            showUnreleased
              ? 'bg-white/[0.1] text-ink'
              : 'text-muted hover:bg-white/[0.06] hover:text-ink',
          )}
        >
          {dict.shinydex.showUnreleased}
        </button>

      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        {(['all', ...generations.map((g) => g.generation)] as Array<number | 'all'>).map(
          (value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setGenerationFilter(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                generationFilter === value
                  ? 'bg-gradient-to-b from-brand to-[#5474f0] font-semibold text-white shadow-[0_10px_20px_-12px_rgba(108,140,255,1)]'
                  : 'text-muted hover:bg-white/[0.06] hover:text-ink',
              )}
            >
              {value === 'all' ? dict.common.all : `G${value}`}
            </button>
          ),
        )}
      </div>

      {confirmRelease ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setConfirmRelease(null)}
        >
          <div
            className="pop w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1c212c] to-[#141821] p-6 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Lock size={24} className="mx-auto mb-3 text-warn" />
            <h2 className="mb-1.5 text-lg font-bold">
              {confirmRelease.release
                ? locale === 'fr'
                  ? `Rendre ${confirmRelease.name} disponible ?`
                  : `Make ${confirmRelease.name} available?`
                : locale === 'fr'
                  ? `Reverrouiller ${confirmRelease.name} ?`
                  : `Lock ${confirmRelease.name} again?`}
            </h2>
            <p className="mb-5 text-sm text-muted">
              {confirmRelease.release
                ? locale === 'fr'
                  ? 'Action d’administration : le chromatique deviendra capturable pour tous les joueurs.'
                  : 'Admin action: this shiny becomes catchable for every player.'
                : locale === 'fr'
                  ? 'Le chromatique redeviendra non disponible pour tous les joueurs.'
                  : 'This shiny becomes unavailable again for every player.'}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => setConfirmRelease(null)}>{dict.common.cancel}</Button>
              <button
                type="button"
                onClick={applyRelease}
                className="rounded-xl bg-gradient-to-b from-brand to-[#5474f0] px-4 py-2 text-sm font-semibold text-white"
              >
                {dict.common.yes}
              </button>
            </div>
            {confirmRelease.release ? null : (
              <p className="mt-4 text-[11px] text-muted">
                {locale === 'fr'
                  ? 'Astuce : Maj + clic sur une case débloquée pour la reverrouiller.'
                  : 'Tip: Shift + click an unlocked entry to lock it again.'}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {askLogin ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setAskLogin(false)}
        >
          <div
            className="pop w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1c212c] to-[#141821] p-6 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Sparkles size={26} className="mx-auto mb-3 text-warn" />
            <h2 className="mb-1.5 text-lg font-bold">
              {locale === 'fr'
                ? 'Connectez-vous pour suivre vos chromatiques'
                : 'Log in to track your shinies'}
            </h2>
            <p className="mb-5 text-sm text-muted">
              {locale === 'fr'
                ? 'Votre Shiny Dex et vos doublons sont enregistrés sur votre compte.'
                : 'Your Shiny Dex and duplicates are saved to your account.'}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => setAskLogin(false)}>{dict.common.close}</Button>
              <Link
                href={loginHref}
                className="rounded-xl bg-gradient-to-b from-brand to-[#5474f0] px-4 py-2 text-sm font-semibold text-white"
              >
                {dict.nav.login}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {visible.map((generation, index) => {
        const generationCaught = generation.entries.filter((entry) => counts[entry.id]).length;
        return (
          // Le Dex fait un millier de tuiles interactives : les monter toutes
          // au chargement était le plus gros coût de la page. `LazySection` ne
          // crée une génération qu'à son approche, `content-visibility` évite
          // la mise en page de ce qui est monté mais hors écran.
          <LazySection
            key={generation.generation}
            // les deux premières sections sont rendues par le serveur : le haut
            // de page ne doit pas attendre l'hydratation pour s'afficher
            eager={index < 2}
            className="mb-8 [content-visibility:auto] [contain-intrinsic-size:auto_420px]"
          >
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
                {t(dict.shinydex.generation, { n: generation.generation })}
              </h2>
              <span className="rule flex-1" />
              <ColumnLabel>
                {generationCaught} / {generation.entries.length}
              </ColumnLabel>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.2rem,1fr))] gap-1.5">
              {generation.entries.map((entry) => {
                const owned = counts[entry.id] ?? 0;
                const isCaught = owned > 0;
                const isReleased = released[entry.id];
                const locked = !isReleased && !isAdmin;
                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={locked ? -1 : 0}
                    aria-disabled={locked}
                    onClick={(event) => {
                      if (isAdmin && event.shiftKey && isReleased) {
                        setConfirmRelease({
                          id: entry.id,
                          name: locale === 'fr' ? entry.nameFr : entry.nameEn,
                          release: false,
                        });
                        return;
                      }
                      if (!locked) change(entry.id);
                    }}
                    onKeyDown={(event) => {
                      if (!locked && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        change(entry.id);
                      }
                    }}
                    title={
                      isReleased
                        ? `${entry.nameFr} · ${entry.nameEn}${
                            entry.sources.length
                              ? ` — ${dict.shinydex.obtainable} ${entry.sources
                                  .map((source) => dict.shinydex.sources[source as never] ?? source)
                                  .join(', ')}`
                              : ''
                          }`
                        : `${entry.nameFr} — ${dict.shinydex.unreleased}`
                    }
                    className={cn(
                      'group relative flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 transition duration-150',
                      isCaught
                        ? 'bg-gradient-to-b from-warn/25 to-warn/5 shadow-[0_10px_22px_-14px_rgba(232,179,74,0.9)]'
                        : 'bg-white/[0.03] hover:bg-white/[0.07]',
                      locked && 'cursor-not-allowed',
                      !isReleased && 'opacity-45',
                    )}
                  >
                    <PokemonIcon
                      file={entry.shinyIconFile ?? entry.iconFile}
                      alt={entry.nameEn}
                      size={52}
                      dim={!isCaught}
                      className="transition duration-150 group-hover:scale-105"
                    />
                    <span
                      className={cn(
                        'w-full truncate text-center text-[11px] leading-tight',
                        isCaught ? 'font-semibold text-ink' : 'text-muted',
                      )}
                    >
                      {locale === 'fr' ? entry.nameFr : entry.nameEn}
                    </span>
                    {entry.form ? (
                      <span className="w-full truncate text-center text-[9px] text-muted/80">
                        {locale === 'fr' ? (entry.formFr ?? entry.form) : entry.form}
                      </span>
                    ) : null}

                    {isCaught ? (
                      <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-warn text-black">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : null}

                    {/* Proposer à l'échange. `stopPropagation` : la case entière
                        incrémente le compteur, ce bouton ne doit pas le faire. */}
                    {isCaught && isLoggedIn ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleTrade(entry.id);
                        }}
                        title={
                          offered[entry.id]
                            ? dict.trades.unmarkForTrade
                            : dict.trades.markForTrade
                        }
                        aria-pressed={Boolean(offered[entry.id])}
                        className={cn(
                          'absolute left-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full transition',
                          offered[entry.id]
                            ? 'bg-brand text-white'
                            : 'bg-black/50 text-muted opacity-0 group-hover:opacity-100',
                        )}
                      >
                        <Repeat size={10} strokeWidth={3} />
                      </button>
                    ) : null}

                    {!isReleased ? (
                      <span
                        className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-muted"
                        title={
                          isAdmin
                            ? locale === 'fr'
                              ? 'Pas encore disponible — cliquez pour le débloquer'
                              : 'Not released yet — click to unlock'
                            : dict.shinydex.unreleased
                        }
                      >
                        <Lock size={10} />
                      </span>
                    ) : null}

                    {isCaught ? (
                      <span
                        className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-black/45 px-1 py-0.5"
                        title={locale === 'fr' ? 'Exemplaires possédés' : 'Copies owned'}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            change(entry.id, -1);
                          }}
                          className="grid h-5 w-5 place-items-center rounded-full text-muted transition hover:bg-white/15 hover:text-white"
                          aria-label="-1"
                        >
                          <Minus size={12} strokeWidth={3} />
                        </button>
                        <span
                          className={cn(
                            'min-w-5 text-center text-[11px] font-bold tabular-nums',
                            owned > 1 ? 'text-brand' : 'text-ink',
                          )}
                        >
                          {owned}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            change(entry.id, 1);
                          }}
                          className="grid h-5 w-5 place-items-center rounded-full text-muted transition hover:bg-white/15 hover:text-white"
                          aria-label="+1"
                        >
                          <Plus size={12} strokeWidth={3} />
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          </LazySection>
        );
      })}
    </div>
  );
}
