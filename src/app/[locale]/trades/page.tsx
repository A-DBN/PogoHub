import { redirect } from 'next/navigation';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser } from '@/server/auth/session';
import { getMyTrades, getTradeList } from '@/server/queries/trades';
import { TradeBoard } from '@/components/trades/TradeBoard';
import { PageHeader } from '@/components/ui';

export default async function TradesPage({ params }: PageProps<'/[locale]/trades'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const me = await getCurrentUser();
  if (!me) redirect(`/${locale}/login`);

  const trades = await getMyTrades(me.id);

  /**
   * Quand c'est à moi de choisir, je pioche dans la liste **du demandeur**, pas
   * dans la mienne : c'est lui qui donne. D'où une liste par échange.
   */
  const needChoice = trades.filter((trade) => trade.role === 'owner' && trade.status === 'REQUESTED');
  const lists = await Promise.all(
    needChoice.map((trade) =>
      trade.peer.username ? getTradeList(trade.peer.username) : Promise.resolve(null),
    ),
  );
  const myOffers = Object.fromEntries(
    needChoice.map((trade, index) => [trade.id, lists[index]?.entries ?? []]),
  );

  return (
    <div>
      <PageHeader title={dict.trades.title} subtitle={dict.trades.subtitle} />
      <TradeBoard trades={trades} myOffers={myOffers} />
    </div>
  );
}
