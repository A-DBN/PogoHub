import { notFound } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { getTeam, typeCoverage, uncoveredTypes } from '@/server/queries/teams';
import { getTeamInsights } from '@/server/queries/team-insights';
import { TeamDetail } from '@/components/teams/TeamDetail';

export default async function TeamPage({ params }: PageProps<'/[locale]/teams/[id]'>) {
  const { locale: raw, id } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  const team = await getTeam(id, user?.id ?? null);
  if (!team) notFound();

  const coverage = typeCoverage(team.members);
  const insights = await getTeamInsights(team);

  return (
    <TeamDetail
      team={team}
      insights={insights}
      coverage={coverage}
      uncovered={uncoveredTypes(coverage)}
      locale={locale}
      dict={dict}
      isOwner={Boolean(user && team.owner === user.username)}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
    />
  );
}
