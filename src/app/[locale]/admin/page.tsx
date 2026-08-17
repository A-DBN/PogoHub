import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser, hasRole } from '@/server/auth/session';
import { getAdminOverview } from '@/server/queries/admin';
import { IngestPanel } from '@/components/admin/IngestPanel';
import { UserTable } from '@/components/admin/UserTable';
import { Card, ColumnLabel, EmptyState, PageHeader, Section } from '@/components/ui';

export default async function AdminPage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  // La barre latérale masque déjà l'entrée, mais une URL se tape à la main.
  const user = await getCurrentUser();
  if (!hasRole(user, 'ADMIN')) {
    return (
      <div>
        <PageHeader title={dict.admin.title} />
        <EmptyState>{dict.admin.forbidden}</EmptyState>
      </div>
    );
  }

  const overview = await getAdminOverview();

  const tiles: Array<[string, number]> = [
    ['Pokémon', overview.counts.pokemon],
    [dict.common.moves, overview.counts.moves],
    [dict.common.leagues, overview.counts.leagues],
    [dict.nav.list, overview.counts.metaEntries],
    [dict.nav.news, overview.counts.news],
    [dict.nav.teams, overview.counts.teams],
    [dict.admin.users, overview.counts.users],
  ];

  return (
    <div>
      <PageHeader title={dict.admin.title} />

      <Section title={dict.admin.database}>
        <div className="flex flex-wrap gap-2">
          {tiles.map(([label, value]) => (
            <Card key={label} className="min-w-[8rem] px-4 py-3">
              <ColumnLabel>{label}</ColumnLabel>
              <div className="text-xl font-bold">{value.toLocaleString(locale)}</div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={dict.admin.steps}>
        <IngestPanel runs={overview.runs} lastSuccess={overview.lastSuccess} locale={locale} />
      </Section>

      <Section title={dict.admin.users}>
        <UserTable users={overview.users} currentUserId={user!.id} locale={locale} />
      </Section>
    </div>
  );
}
