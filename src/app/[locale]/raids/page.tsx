import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getRaids } from '@/server/queries/raids';
import { RaidBrowser } from '@/components/raids/RaidBrowser';
import { PageHeader } from '@/components/ui';

export default async function RaidsPage({ params }: PageProps<'/[locale]/raids'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const { current, scheduled, catalog } = await getRaids();

  return (
    <div>
      <PageHeader title={dict.raids.title} subtitle={dict.raids.subtitle} />
      <RaidBrowser current={current} scheduled={scheduled} catalog={catalog} />
    </div>
  );
}
