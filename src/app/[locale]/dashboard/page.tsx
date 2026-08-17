import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { getLeagueCards } from '@/server/queries/leagues';
import { LeagueCard } from '@/components/leagues/LeagueCard';
import { PageHeader, EmptyState } from '@/components/ui';

export default async function DashboardPage({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const user = await getCurrentUser();
  const leagues = await getLeagueCards(locale, user?.id);

  const main = leagues.filter((l) => l.tier === 'MAIN');
  const minor = leagues.filter((l) => l.tier !== 'MAIN');

  return (
    <div>
      <PageHeader title={dict.dashboard.title} subtitle={dict.dashboard.subtitle} />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.dashboard.mainLeagues}
        </h2>
        {main.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {main.map((league) => (
              <LeagueCard key={league.id} league={league} variant="main" />
            ))}
          </div>
        ) : (
          <EmptyState>{dict.common.empty}</EmptyState>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.dashboard.minorLeagues}
        </h2>
        {minor.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {minor.map((league) => (
              <LeagueCard key={league.id} league={league} variant="minor" />
            ))}
          </div>
        ) : (
          <EmptyState>{dict.common.empty}</EmptyState>
        )}
      </section>
    </div>
  );
}
