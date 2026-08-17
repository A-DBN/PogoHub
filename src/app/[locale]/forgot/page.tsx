import { redirect } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { PageHeader } from '@/components/ui';

export default async function ForgotPasswordPage({ params }: PageProps<'/[locale]/forgot'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  // Déjà connecté : le mot de passe se change dans « Mon profil », sans passer
  // par les Pokémon de secours.
  const user = await getCurrentUser();
  if (user) redirect(`/${locale}/settings`);

  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader title={dict.recovery.title} subtitle={dict.recovery.subtitle} />
      <ForgotPasswordForm />
    </div>
  );
}
