import { notFound } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getMetaList } from '@/server/queries/meta';
import { getActiveLeagues } from '@/server/queries/leagues';
import { MetaListEditor } from '@/components/meta/MetaListEditor';
import { PageHeader } from '@/components/ui';
import { PillLink } from '@/components/ui/PillLink';
import { LeagueSwitcher } from '@/components/meta/LeagueSwitcher';
import { CATEGORIES } from '@/server/ingest/meta';
import { getCurrentUser, hasRole } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { requiredApprovals } from '@/lib/pogo/proposals';

export default async function ListPage({
  params,
  searchParams,
}: PageProps<'/[locale]/list'>) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const leagues = await getActiveLeagues();
  const leagueKey = typeof query.league === 'string' ? query.league : (leagues[0]?.key ?? 'great');
  const category = (typeof query.category === 'string' ? query.category : 'OVERALL').toUpperCase();
  const validCategory = CATEGORIES.some((c) => c.key === category) ? category : 'OVERALL';

  const data = await getMetaList(leagueKey, validCategory as never);
  if (!data) notFound();

  // Le mode édition n'est proposé qu'aux contributeurs ; le seuil affiché suit
  // la taille de l'équipe de relecture, auteur exclu.
  const user = await getCurrentUser();
  const reviewers = user
    ? await prisma.user.count({
        where: { role: { in: ['CONTRIBUTOR', 'ADMIN'] }, id: { not: user.id } },
      })
    : 0;

  const href = (nextLeague: string, nextCategory: string) =>
    `/${locale}/list?league=${nextLeague}&category=${nextCategory}`;

  return (
    <div>
      <PageHeader
        title={`${dict.list.title} — ${locale === 'fr' ? data.league.nameFr : data.league.nameEn}`}
        subtitle={
          data.updatedAt
            ? `${dict.list.lastUpdate} ${new Date(data.updatedAt).toLocaleDateString(locale)} · PvPoke`
            : dict.list.subtitle
        }
      />

      <LeagueSwitcher
        leagues={leagues.map((league) => ({
          key: league.key,
          nameFr: league.nameFr,
          nameEn: league.nameEn,
          cpLimit: league.cpLimit,
          tier: league.tier,
          color: league.color,
        }))}
        currentKey={leagueKey}
        basePath={`/${locale}/list`}
        category={validCategory}
      />

      <div className="mb-5 flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <PillLink
            key={cat.key}
            href={href(leagueKey, cat.key)}
            active={cat.key === validCategory}
          >
            {dict.list.categories[cat.key]}
          </PillLink>
        ))}
      </div>

      <MetaListEditor
        rows={data.rows}
        moves={data.moves}
        species={data.species}
        leagueKey={leagueKey}
        category={validCategory}
        canEdit={hasRole(user, 'CONTRIBUTOR')}
        approvalsRequired={requiredApprovals(reviewers)}
      />
    </div>
  );
}
