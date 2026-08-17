import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { getShinyDex } from '@/server/queries/shinydex';
import { ShinyGrid } from '@/components/shinydex/ShinyGrid';
import { PageHeader } from '@/components/ui';

export default async function ShinyDexPage({ params }: PageProps<'/[locale]/shinydex'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  const { generations, totals } = await getShinyDex(user?.id);

  return (
    <div>
      <PageHeader
        title={dict.shinydex.title}
        subtitle={
          user
            ? dict.shinydex.subtitle
            : `${dict.shinydex.subtitle} — ${dict.errors.unauthorized}`
        }
      />
      <ShinyGrid
        generations={generations}
        totals={totals}
        isLoggedIn={Boolean(user)}
        isAdmin={user?.role === 'ADMIN'}
        loginHref={`/${locale}/login`}
      />
    </div>
  );
}
