'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { useT } from '@/i18n/client';
import { findPokemon } from '@/server/actions/teams';
import { RECOVERY_PICKS } from '@/lib/pogo/recovery';
import { cn } from '@/lib/cn';

export type PickedSpecies = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  iconFile: string;
};

/** Le temps de frappe : on ne part pas en requête à chaque touche. */
const DEBOUNCE_MS = 200;

/**
 * Choix des trois Pokémon de récupération.
 *
 * Sert à l'inscription, au profil et à la page de réinitialisation : le même
 * composant des deux côtés garantit que ce qui est saisi pour récupérer un
 * compte a exactement la forme de ce qui a été enregistré.
 */
export function RecoveryPicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedSpecies[];
  onChange: (picks: PickedSpecies[]) => void;
  disabled?: boolean;
}) {
  const { dict, locale } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedSpecies[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const full = value.length >= RECOVERY_PICKS;
  const name = (pick: PickedSpecies) => (locale === 'fr' ? pick.nameFr : pick.nameEn);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = query.trim();
    if (trimmed.length < 2 || full) {
      setResults([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const rows = await findPokemon(trimmed);
      // une espèce déjà retenue ne se propose plus : trois fois la même ne
      // serait pas un secret, et le serveur la refuserait
      const chosen = new Set(value.map((pick) => pick.speciesId));
      setResults(
        rows
          .filter((row) => !chosen.has(row.speciesId))
          .slice(0, 8)
          .map((row) => ({
            speciesId: row.speciesId,
            nameFr: row.nameFr,
            nameEn: row.nameEn,
            iconFile: row.iconFile,
          })),
      );
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, value, full]);

  const add = (pick: PickedSpecies) => {
    if (full) return;
    onChange([...value, pick]);
    setQuery('');
    setResults([]);
  };

  const remove = (speciesId: string) =>
    onChange(value.filter((pick) => pick.speciesId !== speciesId));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: RECOVERY_PICKS }, (_, slot) => {
          const pick = value[slot];
          return (
            <div
              key={slot}
              className={cn(
                'flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-lg px-2 py-1.5',
                pick ? 'bg-white/[0.07]' : 'border border-dashed border-white/[0.12]',
              )}
            >
              {pick ? (
                <>
                  <PokemonIcon file={pick.iconFile} alt={name(pick)} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm">{name(pick)}</span>
                  {disabled ? null : (
                    <button
                      type="button"
                      onClick={() => remove(pick.speciesId)}
                      className="rounded p-0.5 text-muted transition hover:text-danger"
                      aria-label={dict.common.delete}
                    >
                      <X size={14} />
                    </button>
                  )}
                </>
              ) : (
                <span className="px-1 py-1 text-xs text-muted">
                  {dict.recovery.slot} {slot + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {full || disabled ? null : (
        <div className="relative">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.teams.pickPokemon}
            autoComplete="off"
          />
          {results.length ? (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-[#161a22] p-1 shadow-2xl">
              {results.map((row) => (
                <li key={row.speciesId}>
                  <button
                    type="button"
                    onClick={() => add(row)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-white/[0.08]"
                  >
                    <PokemonIcon file={row.iconFile} alt={name(row)} size={24} />
                    {name(row)}
                  </button>
                </li>
              ))}
            </ul>
          ) : searching && query.trim().length >= 2 ? (
            <span className="mt-1 block text-[11px] text-muted">{dict.common.loading}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
