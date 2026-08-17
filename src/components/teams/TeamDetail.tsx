import Link from 'next/link';
import { ArrowLeft, Globe, Lock, Sparkles } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadge, TypeBadges } from '@/components/pokemon/TypeBadge';
import { Card, ColumnLabel, Section } from '@/components/ui';
import { ShareLink } from './ShareLink';
import { interpolate, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { TeamView, TypeCoverage } from '@/server/queries/teams';
import type { MemberInsight, OpponentView } from '@/server/queries/team-insights';
import { cn } from '@/lib/cn';

/**
 * Duels de référence d'un membre, d'après la simulation PvPoke.
 *
 * La note est sur 1000 : au-dessus de 500 le duel est gagné. On l'affiche telle
 * quelle plutôt qu'en « victoire / défaite » — 505 et 900 ne se jouent pas de la
 * même façon, et la nuance disparaîtrait.
 */
function Matchups({
  label,
  tone,
  entries,
  locale,
}: {
  label: string;
  tone: 'success' | 'danger';
  entries: OpponentView[];
  locale: Locale;
}) {
  if (!entries.length) return null;
  return (
    <div className="mt-2">
      <ColumnLabel>{label}</ColumnLabel>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <span
            key={entry.speciesId}
            title={`${locale === 'fr' ? entry.nameFr : entry.nameEn} — ${entry.rating}/1000`}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg py-0.5 pl-0.5 pr-1.5',
              tone === 'success' ? 'bg-success/12' : 'bg-danger/12',
            )}
          >
            <PokemonIcon
              file={entry.iconFile}
              alt={locale === 'fr' ? entry.nameFr : entry.nameEn}
              size={24}
            />
            <span
              className={cn(
                'text-[10px] font-bold tabular-nums',
                tone === 'success' ? 'text-success' : 'text-danger',
              )}
            >
              {entry.rating}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Une ligne de couverture : le type, et combien de membres sont concernés. */
function CoverageRow({
  entries,
  locale,
  empty,
}: {
  entries: Array<{ type: string; count: number }>;
  locale: Locale;
  empty: string;
}) {
  if (!entries.length) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span key={entry.type} className="inline-flex items-center gap-1">
          <TypeBadge type={entry.type} locale={locale} />
          <span className="text-[11px] font-semibold text-muted">×{entry.count}</span>
        </span>
      ))}
    </div>
  );
}

export function TeamDetail({
  team,
  insights,
  coverage,
  uncovered,
  locale,
  dict,
  isOwner,
  appUrl,
}: {
  team: TeamView;
  /** Lignée et duels par membre ; vide si l'équipe n'a pas de ligue. */
  insights: MemberInsight[];
  coverage: TypeCoverage;
  uncovered: string[];
  locale: Locale;
  dict: Dictionary;
  isOwner: boolean;
  appUrl: string;
}) {
  return (
    <div>
      <Link
        href={`/${locale}/teams`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} />
        {dict.teams.title}
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span
          className="h-8 w-8 rounded-full"
          style={{ background: team.color }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold tracking-tight">{team.name}</h1>
        <span className="text-muted" title={team.isPublic ? dict.common.public : dict.common.private}>
          {team.isPublic ? <Globe size={16} /> : <Lock size={16} />}
        </span>
        {team.league ? (
          <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-xs font-medium text-muted">
            {locale === 'fr' ? team.league.nameFr : team.league.nameEn}
          </span>
        ) : null}
        {team.owner && !isOwner ? (
          <Link
            href={`/${locale}/teams/u/${encodeURIComponent(team.owner)}`}
            className="text-xs text-muted transition hover:text-brand"
          >
            {interpolate(dict.teams.byUser, { user: team.owner })}
          </Link>
        ) : null}
      </div>

      {team.notes ? <p className="mb-6 max-w-2xl text-sm text-muted">{team.notes}</p> : null}

      <Section title={dict.teams.members}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {team.members.map((member) => {
            const form =
              locale === 'fr'
                ? (member.pokemon.formFr ?? member.pokemon.form)
                : member.pokemon.form;
            const insight = insights.find((row) => row.memberId === member.id);
            return (
              <Card key={member.id} className="p-4">
                <div className="flex items-start gap-3">
                  <PokemonIcon
                    file={member.isShiny ? member.pokemon.shinyIconFile : member.pokemon.iconFile}
                    alt={member.pokemon.nameEn}
                    size={56}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-bold">
                        {locale === 'fr' ? member.pokemon.nameFr : member.pokemon.nameEn}
                      </span>
                      {form ? (
                        <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-muted">
                          {form}
                        </span>
                      ) : null}
                      {member.isShadow ? (
                        <span className="rounded-md bg-gradient-to-b from-shadow-badge to-[#7c4dff] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                          {dict.common.shadow}
                        </span>
                      ) : null}
                      {member.isShiny ? <Sparkles size={13} className="text-warn" /> : null}
                    </div>
                    <div className="mt-1">
                      <TypeBadges types={member.pokemon.types} locale={locale} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                  {[
                    { label: dict.common.cp, value: member.stats.cp },
                    { label: dict.common.attack, value: Math.round(member.stats.atk) },
                    { label: dict.common.defense, value: Math.round(member.stats.def) },
                    { label: dict.common.hp, value: member.stats.hp },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-white/[0.04] px-1 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-muted">
                        {stat.label}
                      </div>
                      <div className="text-sm font-bold">{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 text-[11px] text-muted">
                  {dict.common.level} {member.level} · {dict.teams.ivs} {member.ivs.atk}/
                  {member.ivs.def}/{member.ivs.hp}
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  {member.moves.fast ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <TypeBadge type={member.moves.fast.type} locale={locale} />
                      {locale === 'fr' ? member.moves.fast.nameFr : member.moves.fast.nameEn}
                    </div>
                  ) : null}
                  {member.moves.charged.map((move) => (
                    <div key={move.moveId} className="flex items-center gap-1.5 text-xs">
                      <TypeBadge type={move.type} locale={locale} />
                      {locale === 'fr' ? move.nameFr : move.nameEn}
                    </div>
                  ))}
                </div>

                {insight ? (
                  <>
                    {/* Une lignée d'un seul maillon n'apprend rien : on la tait. */}
                    {insight.evolution.length > 1 ? (
                      <div className="mt-3 border-t border-white/[0.06] pt-2">
                        <ColumnLabel>{dict.teams.evolutionLine}</ColumnLabel>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {insight.evolution.map((node) => (
                            <PokemonIcon
                              key={node.speciesId}
                              file={node.iconFile}
                              alt={locale === 'fr' ? node.nameFr : node.nameEn}
                              size={30}
                              className={cn(!node.current && 'opacity-45')}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <Matchups
                      label={dict.teams.bestAgainst}
                      tone="success"
                      entries={insight.bestAgainst}
                      locale={locale}
                    />
                    <Matchups
                      label={dict.teams.weakTo}
                      tone="danger"
                      entries={insight.strugglesAgainst}
                      locale={locale}
                    />
                  </>
                ) : null}
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title={dict.teams.coverage}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="p-4">
            <ColumnLabel>{dict.teams.offense}</ColumnLabel>
            <div className="mt-2">
              <CoverageRow entries={coverage.offense} locale={locale} empty={dict.common.none} />
            </div>
            {uncovered.length ? (
              <div className="mt-4">
                <ColumnLabel>{dict.teams.uncovered}</ColumnLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uncovered.map((type) => (
                    <TypeBadge key={type} type={type} locale={locale} className="opacity-45" />
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <ColumnLabel>{dict.teams.defense}</ColumnLabel>
            <div className="mt-2">
              <CoverageRow entries={coverage.weakness} locale={locale} empty={dict.common.none} />
            </div>
          </Card>

          <Card className="p-4">
            <ColumnLabel>{dict.teams.resistances}</ColumnLabel>
            <div className="mt-2">
              <CoverageRow
                entries={coverage.resistance}
                locale={locale}
                empty={dict.common.none}
              />
            </div>
          </Card>
        </div>
      </Section>

      {isOwner ? (
        <Section title={dict.teams.shareLink}>
          <ShareLink url={`${appUrl}/${locale}/teams/${team.shareSlug}`} />
        </Section>
      ) : null}
    </div>
  );
}
