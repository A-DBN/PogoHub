import { notFound } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getRaidBossDetail } from '@/server/queries/raids';
import { BossSheet } from '@/components/raids/BossSheet';

export default async function RaidBossPage({
  params,
}: PageProps<'/[locale]/raids/[species]'>) {
  const { locale: raw, species } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const detail = await getRaidBossDetail(species);
  if (!detail) notFound();

  return <BossSheet detail={detail} locale={locale} dict={getDictionary(locale)} />;
}
