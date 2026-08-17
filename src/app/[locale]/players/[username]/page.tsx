import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock, ShieldCheck, Sparkles, Swords, Users, Wrench } from 'lucide-react';
import { getDictionary, isLocale, DEFAULT_LOCALE, interpolate } from '@/i18n';
import { getPlayerProfile } from '@/server/queries/players';
import { getTradeList } from '@/server/queries/trades';
import { getCurrentUser } from '@/server/auth/session';
import { TradeListPanel } from '@/components/trades/TradeListPanel';
import { PlayerAvatar } from '@/components/players/PlayerAvatar';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { Card, ColumnLabel, EmptyState, Section } from '@/components/ui';
import { TEAM_COLORS, formatFriendCode } from '@/lib/pogo/trainer';
import { cn } from '@/lib/cn';

export default async function PlayerProfilePage({
  params,
}: PageProps<'/[locale]/players/[username]'>) {
  const { locale: raw, username } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const profile = await getPlayerProfile(decodeURIComponent(username));
  if (!profile) notFound();

  const [me, tradeList] = await Promise.all([
    getCurrentUser(),
    getTradeList(profile.username),
  ]);

  const joined = new Date(profile.joinedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <PlayerAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={76} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">{profile.username}</h1>
            {/* Rôle affiché seulement s'il dit quelque chose : « Utilisateur »
                sur chaque fiche n'apprendrait rien à personne. */}
            {profile.role === 'ADMIN' || profile.role === 'CONTRIBUTOR' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
                  'text-[11px] font-bold uppercase tracking-wide',
                  profile.role === 'ADMIN'
                    ? 'bg-warn/15 text-warn'
                    : 'bg-brand/15 text-brand',
                )}
              >
                {profile.role === 'ADMIN' ? <ShieldCheck size={12} /> : <Wrench size={12} />}
                {dict.admin.roles[profile.role as 'ADMIN' | 'CONTRIBUTOR']}
              </span>
            ) : null}
            {profile.team ? (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                style={{
                  // couleurs du jeu, pas de la charte : elles ne suivent pas le thème
                  backgroundColor: `${TEAM_COLORS[profile.team]}22`,
                  color: TEAM_COLORS[profile.team],
                }}
              >
                {dict.settings.teams[profile.team]}
              </span>
            ) : null}
            {profile.trainerLevel ? (
              <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-semibold">
                {dict.settings.trainerLevel} {profile.trainerLevel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {dict.players.joined} {joined}
          </p>
          {profile.friendCode ? (
            <p className="mt-1 font-mono text-sm tracking-wider">
              <span className="mr-2 text-xs font-sans text-muted">
                {dict.settings.friendCode}
              </span>
              {formatFriendCode(profile.friendCode)}
            </p>
          ) : null}
          {profile.bio ? <p className="mt-2 max-w-xl text-sm">{profile.bio}</p> : null}
        </div>
      </div>

      <div className="mb-9 flex flex-wrap gap-3">
        <Card className="flex items-center gap-3 px-5 py-3">
          <Users size={16} className="text-brand" />
          <div>
            <ColumnLabel>{dict.players.teamCount}</ColumnLabel>
            <div className="text-xl font-bold">{profile.teamCount}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 px-5 py-3">
          {profile.shiny ? (
            <Sparkles size={16} className="text-warn" />
          ) : (
            <Lock size={16} className="text-muted" />
          )}
          <div>
            <ColumnLabel>{dict.players.shinyCount}</ColumnLabel>
            <div className="text-xl font-bold">
              {profile.shiny ? (
                <>
                  {profile.shiny.total}
                  {profile.shiny.duplicates ? (
                    <span className="ml-2 text-xs font-medium text-muted">
                      +{profile.shiny.duplicates} {dict.players.duplicates}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm font-medium text-muted">
                  {dict.players.shinyPrivate}
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {tradeList ? (
        <Section title={dict.trades.list} hint={String(tradeList.entries.length)}>
          <TradeListPanel
            list={tradeList}
            canRequest={Boolean(me) && me?.username !== profile.username}
          />
        </Section>
      ) : null}

      <Section title={dict.players.publicTeams}>
        {profile.teams.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.teams.map((team) => (
              <div key={team.id} className="relative">
                {/* Se mesurer à la compo sans la resaisir : elle arrive en
                    équipe B, avec sa ligue. Hors du <Link>, sinon le clic
                    ouvrirait la fiche au lieu de la simulation. */}
                <Link
                  href={`/${locale}/simulation?vs=${team.id}`}
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-brand/25 hover:text-ink"
                  title={dict.simulation.title}
                >
                  <Swords size={12} />
                  {dict.simulation.title}
                </Link>
                <Link href={`/${locale}/teams/${team.id}`}>
                <Card accent={team.color} className="p-4" hover>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: team.color }}
                      aria-hidden
                    />
                    <span className="truncate font-bold">{team.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {team.league
                      ? locale === 'fr'
                        ? team.league.nameFr
                        : team.league.nameEn
                      : dict.teams.noLeague}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {team.members.map((member) => (
                      <PokemonIcon
                        key={member.id}
                        file={
                          member.isShiny ? member.pokemon.shinyIconFile : member.pokemon.iconFile
                        }
                        alt={member.pokemon.nameEn}
                        size={42}
                      />
                    ))}
                  </div>
                </Card>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>{dict.teams.noPublicTeams}</EmptyState>
        )}
      </Section>

      {profile.shiny ? (
        <>
          <Section title={dict.players.latestShiny}>
            <Card className="flex flex-wrap gap-2 p-4">
              {profile.shiny.latest.map((entry) => (
                <span key={entry.speciesId} className="relative" title={
                  locale === 'fr' ? entry.nameFr : entry.nameEn
                }>
                  <PokemonIcon
                    file={entry.shinyIconFile ?? entry.iconFile}
                    alt={entry.nameEn}
                    size={52}
                  />
                  {entry.count > 1 ? (
                    <span className="absolute -right-1 bottom-0 rounded-full bg-black/70 px-1.5 text-[10px] font-bold">
                      ×{entry.count}
                    </span>
                  ) : null}
                </span>
              ))}
            </Card>
          </Section>

          <Section title={dict.players.byGeneration}>
            <Card className="flex flex-wrap gap-2 p-4">
              {profile.shiny.byGeneration.map((row) => (
                <div
                  key={row.generation}
                  className="min-w-[4.5rem] rounded-xl bg-white/[0.04] px-3 py-2 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    {interpolate(dict.shinydex.generation, { n: row.generation })}
                  </div>
                  <div className="text-lg font-bold">{row.caught}</div>
                </div>
              ))}
            </Card>
          </Section>
        </>
      ) : null}
    </div>
  );
}
