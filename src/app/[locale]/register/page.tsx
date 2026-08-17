import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/AuthForms';
import { registerAction } from '@/server/auth/actions';
import { getCurrentUser } from '@/server/auth/session';

export default async function RegisterPage({ params }: PageProps<'/[locale]/register'>) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (user) redirect(`/${locale}/dashboard`);
  return <RegisterForm action={registerAction} />;
}
