import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadge } from '@/components/pokemon/TypeBadge';
import { Card, ColumnLabel } from '@/components/ui';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { CounterResult } from '@/lib/pogo/raid';

/**
 * Classement d'attaquants, partagé par la fiche de boss et la page Contres.
 * La forme est affichée séparément du nom : trois Kyurem s'appellent « Kyurem ».
 */
export function CountersTable({
  counters,
  locale,
  dict,
}: {
  counters: CounterResult[];
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <Card className="overflow-x-auto p-1">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="text-left">
            <th className="px-3 py-2"><ColumnLabel>#</ColumnLabel></th>
            <th className="px-3 py-2"><ColumnLabel>Pokémon</ColumnLabel></th>
            <th className="px-3 py-2"><ColumnLabel>{dict.raids.fastMove}</ColumnLabel></th>
            <th className="px-3 py-2"><ColumnLabel>{dict.raids.chargedMove}</ColumnLabel></th>
            <th className="px-3 py-2 text-right"><ColumnLabel>{dict.raids.dps}</ColumnLabel></th>
            <th className="px-3 py-2 text-right"><ColumnLabel>{dict.raids.tdo}</ColumnLabel></th>
          </tr>
        </thead>
        <tbody>
          {counters.map((counter, index) => {
            const form = locale === 'fr' ? (counter.formFr ?? counter.form) : counter.form;
            return (
              <tr key={counter.speciesId} className="odd:bg-white/[0.02]">
                <td className="px-3 py-1.5 text-xs text-muted">{index + 1}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PokemonIcon file={counter.iconFile} alt={counter.nameEn} size={32} />
                    <span className="font-semibold">
                      {locale === 'fr' ? counter.nameFr : counter.nameEn}
                    </span>
                    {form ? (
                      <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-muted">
                        {form}
                      </span>
                    ) : null}
                    {counter.isShadow ? (
                      <span className="rounded-md bg-gradient-to-b from-shadow-badge to-[#7c4dff] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        {dict.common.shadow}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <TypeBadge type={counter.fast.type} locale={locale} />
                    {locale === 'fr' ? counter.fast.nameFr : counter.fast.nameEn}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <TypeBadge type={counter.charged.type} locale={locale} />
                    {locale === 'fr' ? counter.charged.nameFr : counter.charged.nameEn}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-pve">
                  {counter.dps.toFixed(1)}
                </td>
                <td className="px-3 py-1.5 text-right text-muted">{counter.tdo}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
