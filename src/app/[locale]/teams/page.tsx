import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getUserTeams } from '@/server/queries/teams';
import { getActiveLeagues } from '@/server/queries/leagues';
import { TeamList } from '@/components/teams/TeamList';
import { EmptyState, PageHeader } from '@/components/ui';

export default async function TeamsPage({ params }: PageProps<'/[locale]/teams'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title={dict.teams.title} subtitle={dict.teams.subtitle} />
        <EmptyState>{dict.teams.loginToCreate}</EmptyState>
      </div>
    );
  }

  // Le catalogue de l'éditeur est volumineux : on ne le charge que pour un
  // visiteur connecté, seul à pouvoir ouvrir la modale de création.
  const [teams, leagues, preferences] = await Promise.all([
    getUserTeams(user.id),
    getActiveLeagues(),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { teamsPublicByDefault: true },
    }),
  ]);

  return (
    <div>
      <PageHeader title={dict.teams.mine} subtitle={dict.teams.subtitle} />
      <TeamList
        teams={teams}
        // `cpLimit` et `filters` voyagent avec : l'éditeur juge l'éligibilité
        // sur place, à chaque frappe, sans aller-retour au serveur
        leagues={leagues.map((l) => ({
          key: l.key,
          nameFr: l.nameFr,
          nameEn: l.nameEn,
          cpLimit: l.cpLimit,
          filters: l.filters,
        }))}
        canEdit
        publicByDefault={preferences?.teamsPublicByDefault ?? false}
      />
    </div>
  );
}
