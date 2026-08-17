import { redirect } from 'next/navigation';
import { UsernameForm } from '@/components/auth/AuthForms';
import { setUsernameAction } from '@/server/auth/actions';
import { getCurrentUser } from '@/server/auth/session';

export default async function WelcomePage({ params }: PageProps<'/[locale]/welcome'>) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.username) redirect(`/${locale}/dashboard`);
  return <UsernameForm action={setUsernameAction} />;
}
