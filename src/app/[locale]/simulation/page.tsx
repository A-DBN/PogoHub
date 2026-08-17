import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { getTeam, getUserTeams } from '@/server/queries/teams';
import { getActiveLeagues } from '@/server/queries/leagues';
import { SimulationBoard } from '@/components/simulation/SimulationBoard';
import { PageHeader } from '@/components/ui';

export default async function SimulationPage({
  params,
  searchParams,
}: PageProps<'/[locale]/simulation'>) {
  const { locale: raw } = await params;
  // `?vs=<équipe>` : arrivée depuis le profil d'un joueur, pour se mesurer à
  // une de ses compos sans la resaisir. `getTeam` fait respecter la visibilité.
  const { vs } = await searchParams;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  const [leagues, myTeams, opponent] = await Promise.all([
    getActiveLeagues(),
    // charger une compo enregistrée évite de resaisir six Pokémon
    user ? getUserTeams(user.id) : Promise.resolve([]),
    typeof vs === 'string' ? getTeam(vs, user?.id ?? null) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader title={dict.simulation.title} subtitle={dict.simulation.subtitle} />
      <SimulationBoard
        leagues={leagues.map((l: { key: string; nameFr: string; nameEn: string }) => ({ key: l.key, nameFr: l.nameFr, nameEn: l.nameEn }))}
        myTeams={myTeams}
        opponent={opponent}
      />
    </div>
  );
}
