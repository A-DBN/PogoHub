import { redirect } from 'next/navigation';
import { isLocale, DEFAULT_LOCALE } from '@/i18n';

/** /fr et /en renvoient sur le tableau de bord. */
export default async function LocaleIndex({ params }: PageProps<'/[locale]'>) {
  const { locale: raw } = await params;
  redirect(`/${isLocale(raw) ? raw : DEFAULT_LOCALE}/dashboard`);
}
