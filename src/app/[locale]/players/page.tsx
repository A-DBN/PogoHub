import Link from 'next/link';
import { Sparkles, Users } from 'lucide-react';
import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { listPlayers } from '@/server/queries/players';
import { PlayerAvatar } from '@/components/players/PlayerAvatar';
import { PlayerSearch } from '@/components/players/PlayerSearch';
import { Card, EmptyState, PageHeader } from '@/components/ui';

export default async function PlayersPage({
  params,
  searchParams,
}: PageProps<'/[locale]/players'>) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const search = typeof query.q === 'string' ? query.q : '';
  const players = await listPlayers(search);

  return (
    <div>
      <PageHeader title={dict.players.title} subtitle={dict.players.subtitle} />

      <div className="mb-6">
        <PlayerSearch locale={locale} initial={search} />
      </div>

      {players.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((player) => (
            <Link key={player.username} href={`/${locale}/players/${player.username}`}>
              <Card className="flex items-center gap-3 p-4" hover>
                <PlayerAvatar username={player.username} avatarUrl={player.avatarUrl} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{player.username}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} />
                      {player.teamCount}
                    </span>
                    {player.shinyCount !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles size={12} className="text-warn" />
                        {player.shinyCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState>{dict.players.noResults}</EmptyState>
      )}
    </div>
  );
}
