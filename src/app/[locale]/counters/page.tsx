import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCountersFor } from '@/server/queries/counters';
import { RAID_TIERS, CP_ATTACKER_LEVELS } from '@/lib/pogo/raid';
import { DefenderPicker } from '@/components/counters/DefenderPicker';
import { CountersTable } from '@/components/raids/CountersTable';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadges } from '@/components/pokemon/TypeBadge';
import { Card, ColumnLabel, EmptyState, PageHeader, Section } from '@/components/ui';
import { PillLink } from '@/components/ui/PillLink';

const DEFAULT_SPECIES = 'rayquaza';
const DEFAULT_LEVEL = 40;
const DEFAULT_TIER = 5;

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default async function CountersPage({
  params,
  searchParams,
}: PageProps<'/[locale]/counters'>) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const species =
    typeof query.species === 'string' && query.species ? query.species : DEFAULT_SPECIES;
  // paramètres d'URL : on ne fait confiance qu'aux valeurs que l'on propose
  const requestedLevel = asNumber(query.level, DEFAULT_LEVEL);
  const level = (CP_ATTACKER_LEVELS as readonly number[]).includes(requestedLevel)
    ? requestedLevel
    : DEFAULT_LEVEL;
  const requestedTier = asNumber(query.tier, DEFAULT_TIER);
  const tier = RAID_TIERS[requestedTier] ? requestedTier : DEFAULT_TIER;

  const report = await getCountersFor(species, { attackerLevel: level, tierLevel: tier });

  // Les composants serveur ne passent pas de fonctions aux composants client :
  // on envoie un gabarit d'URL que le client complète.
  const href = (next: { species?: string; level?: number; tier?: number }) =>
    `/${locale}/counters?species=${next.species ?? species}` +
    `&level=${next.level ?? level}&tier=${next.tier ?? tier}`;

  const defenderForm = report
    ? locale === 'fr'
      ? (report.defender.formFr ?? report.defender.form)
      : report.defender.form
    : null;

  return (
    <div>
      <PageHeader title={dict.counters.title} subtitle={dict.counters.subtitle} />

      <div className="mb-6 flex flex-wrap items-start gap-x-8 gap-y-5">
        <div>
          <ColumnLabel>{dict.counters.defender}</ColumnLabel>
          <div className="mt-1.5">
            <DefenderPicker
              selectedId={species}
              hrefFor={href({ species: '__SPECIES__' })}
            />
          </div>
        </div>

        <div>
          <ColumnLabel>{dict.counters.attackerLevel}</ColumnLabel>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {CP_ATTACKER_LEVELS.map((value) => (
              <PillLink key={value} href={href({ level: value })} active={value === level}>
                {value}
              </PillLink>
            ))}
          </div>
        </div>

        <div>
          <ColumnLabel>{dict.counters.tier}</ColumnLabel>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.keys(RAID_TIERS).map(Number).map((value) => (
              <PillLink key={value} href={href({ tier: value })} active={value === tier}>
                {value >= 6 ? 'Méga' : `${value}★`}
              </PillLink>
            ))}
          </div>
        </div>
      </div>

      {report ? (
        <>
          <Card className="mb-6 flex flex-wrap items-center gap-4 px-5 py-4">
            <PokemonIcon file={report.defender.iconFile} alt={report.defender.nameEn} size={64} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">
                  {locale === 'fr' ? report.defender.nameFr : report.defender.nameEn}
                </h2>
                {defenderForm ? (
                  <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-xs font-medium text-muted">
                    {defenderForm}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5">
                <TypeBadges types={report.defender.types} locale={locale} />
              </div>
            </div>
            <p className="ml-auto max-w-[24rem] text-[11px] leading-snug text-muted">
              {dict.counters.hint}
            </p>
          </Card>

          <Section
            title={dict.counters.results}
            hint={`${dict.counters.attackerLevel} ${level} · ${RAID_TIERS[tier].label}`}
          >
            <CountersTable counters={report.counters} locale={locale} dict={dict} />
          </Section>
        </>
      ) : (
        <EmptyState>{dict.counters.notFound}</EmptyState>
      )}
    </div>
  );
}
