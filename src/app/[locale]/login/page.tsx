import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/AuthForms';
import { loginAction } from '@/server/auth/actions';
import { getCurrentUser } from '@/server/auth/session';

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (user) redirect(`/${locale}/dashboard`);
  return <LoginForm action={loginAction} />;
}
