import { redirect } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/ui';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { formatFriendCode } from '@/lib/pogo/trainer';

export default async function SettingsPage({ params }: PageProps<'/[locale]/settings'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const me = await getCurrentUser();
  if (!me) redirect(`/${locale}/login`);

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      username: true, avatarUrl: true, bio: true, team: true, trainerLevel: true,
      friendCode: true, friendCodePublic: true, shinyPublic: true,
      teamsPublicByDefault: true, locale: true,
      // on ne renvoie pas l'empreinte, seulement le fait qu'elle existe
      recoveryHash: true,
      tradeOpen: true, autoTradeFrom: true, tradeNote: true,
    },
  });
  if (!user) redirect(`/${locale}/login`);

  return (
    <div>
      <PageHeader title={dict.settings.title} subtitle={dict.settings.subtitle} />
      <SettingsForm
        hasRecovery={user.recoveryHash !== null}
        initial={{
          username: user.username ?? '',
          avatarUrl: user.avatarUrl ?? '',
          bio: user.bio ?? '',
          team: user.team ?? '',
          trainerLevel: user.trainerLevel?.toString() ?? '',
          // présenté par groupes de quatre, comme dans le jeu
          friendCode: formatFriendCode(user.friendCode),
          friendCodePublic: user.friendCodePublic,
          shinyPublic: user.shinyPublic,
          teamsPublicByDefault: user.teamsPublicByDefault,
          locale: user.locale,
          tradeOpen: user.tradeOpen,
          autoTradeFrom: user.autoTradeFrom?.toString() ?? '',
          tradeNote: user.tradeNote ?? '',
        }}
      />
    </div>
  );
}
