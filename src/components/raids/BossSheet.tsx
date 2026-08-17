import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Users } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadge, TypeBadges } from '@/components/pokemon/TypeBadge';
import { Card, ColumnLabel, Section } from '@/components/ui';
import { CountersTable } from './CountersTable';
import { ivPercent } from '@/lib/pogo/raid';
import { interpolate, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { RaidBossDetail, SpeciesForm } from '@/server/queries/raids';
import { cn } from '@/lib/cn';

/** « ×1,6 » plutôt que « 1.6 » : c'est un multiplicateur, pas un score. */
const multiplierLabel = (value: number, locale: Locale) =>
  `×${value.toLocaleString(locale, { maximumFractionDigits: 3 })}`;

/** Une donnée de la ligne d'information : intitulé discret, valeur en avant. */
function InfoItem({
  label,
  value,
  accent = false,
  hint,
  icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  /** Explication de la valeur, au survol : elle n'a pas sa place en pleine page. */
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={hint}>
      {icon}
      <div className="min-w-0">
        <ColumnLabel>{label}</ColumnLabel>
        <div className={cn('text-sm font-bold', accent && 'text-pve')}>{value}</div>
      </div>
    </div>
  );
}

type Variant = {
  key: string;
  label: string;
  file: string | null;
  shiny: boolean;
  /** Chromatique connu mais absent des assets : pas encore sorti en jeu. */
  missing?: boolean;
};

/** Développe chaque forme en deux apparences : normale et chromatique. */
function variantsOf(forms: SpeciesForm[], locale: Locale, dict: Dictionary): Variant[] {
  return forms.flatMap((form) => {
    const label = form.form
      ? (locale === 'fr' ? (form.formFr ?? form.form) : form.form)
      : dict.raids.formBase;
    return [
      { key: form.speciesId, label, file: form.iconFile, shiny: false },
      {
        key: `${form.speciesId}-shiny`,
        label,
        // shinyIconFile est déjà le nom du fichier chromatique : pas de dérivation
        file: form.shinyIconFile,
        shiny: true,
        missing: !form.shinyIconFile,
      },
    ];
  });
}

/** Une apparence par carré : un seul sprite, donc une seule taille de rendu. */
function VariantTile({ variant, dict }: { variant: Variant; dict: Dictionary }) {
  return (
    <Card
      className={cn(
        'flex aspect-square flex-col items-center justify-center gap-2 p-4',
        variant.missing && 'opacity-45',
      )}
      hover={!variant.missing}
      title={variant.missing ? dict.raids.shinyMissing : undefined}
    >
      {variant.missing ? (
        <span className="grid h-[92px] w-[92px] place-items-center text-muted">
          <Sparkles size={30} className="opacity-40" />
        </span>
      ) : (
        <PokemonIcon
          file={variant.file}
          alt={variant.shiny ? `${variant.label} ✨` : variant.label}
          size={92}
        />
      )}
      <span className="flex items-center gap-1 text-center text-sm font-semibold leading-tight">
        {variant.shiny ? (
          <Sparkles size={13} className="shrink-0 text-warn" />
        ) : null}
        {variant.label}
      </span>
    </Card>
  );
}

/**
 * Trois paliers plutôt qu'une fourchette : « il en faut 3 » et « viens à 6 »
 * répondent à deux questions différentes, et c'est la seconde qui sert à monter
 * un groupe.
 */
function PlayersInfo({
  players,
  dict,
}: {
  players: NonNullable<RaidBossDetail['players']>;
  dict: Dictionary;
}) {
  const steps = [
    {
      label: dict.raids.playersMin,
      value:
        players.soloSeconds != null
          ? dict.raids.playersOne
          : String(players.min),
      accent: false,
    },
    { label: dict.raids.playersRecommended, value: String(players.recommended), accent: true },
    {
      label: dict.raids.playersComfortable,
      value: interpolate(dict.raids.playersFrom, { count: players.comfortable }),
      accent: false,
    },
  ];

  return (
    <Card className="px-5 py-3" title={dict.raids.playersHint}>
      <div className="flex items-center gap-2">
        <Users size={14} className="shrink-0 text-pve" />
        <ColumnLabel>{dict.raids.players}</ColumnLabel>
      </div>
      {/* chiffre au-dessus de son intitulé : en ligne, on ne sait plus lequel va avec quoi */}
      <div className="mt-2 flex gap-1.5">
        {steps.map((step) => (
          <div
            key={step.label}
            className={cn(
              'flex min-w-[5.5rem] flex-col items-center rounded-xl px-3 py-2',
              step.accent ? 'bg-pve/15' : 'bg-white/[0.04]',
            )}
          >
            <span
              className={cn(
                'text-2xl font-bold leading-none',
                step.accent && 'text-pve',
              )}
            >
              {step.value}
            </span>
            <span className="mt-1.5 text-[10px] uppercase tracking-wide text-muted">
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BossSheet({
  detail,
  locale,
  dict,
}: {
  detail: RaidBossDetail;
  locale: Locale;
  dict: Dictionary;
}) {
  const { boss, tier, forms, maxedCp, catchCp, defense, moves, counters } = detail;
  const name = locale === 'fr' ? boss.nameFr : boss.nameEn;
  const form = locale === 'fr' ? (boss.formFr ?? boss.form) : boss.form;
  // « PC 67 % » en raid classique, « PC 40 % » pour un raid obscur
  const floorPercent = ivPercent(catchCp.floorIv);
  const floorLabel = interpolate(dict.raids.cpFloor, { percent: floorPercent });
  // Le 0 % n'existe qu'amplifié depuis la nature : un raid garantit le plancher.
  const cpTableRows = [
    { label: dict.raids.cpRowCatch, ...catchCp.normal, zero: null as number | null },
    { label: dict.raids.cpRowBoosted, ...catchCp.boosted, zero: null as number | null },
    { label: dict.raids.cpRowMaxed, ...maxedCp },
  ];
  const weaknesses = defense.filter((entry) => entry.multiplier > 1);
  const resistances = defense.filter((entry) => entry.multiplier < 1).reverse();

  return (
    <div>
      <Link
        href={`/${locale}/raids`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} />
        {dict.raids.backToList}
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <PokemonIcon file={boss.iconFile} alt={name} size={84} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">{name}</h1>
            {form ? (
              <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-xs font-medium text-muted">
                {form}
              </span>
            ) : null}
            {boss.isShadow ? (
              <span className="rounded-md bg-gradient-to-b from-shadow-badge to-[#7c4dff] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_6px_14px_-6px_rgba(167,139,250,0.95)]">
                {dict.common.shadow}
              </span>
            ) : null}
            {boss.canBeShiny ? <Sparkles size={16} className="text-warn" /> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {dict.raids.kinds[boss.kind as keyof typeof dict.raids.kinds] ?? boss.tier}
            </span>
            <TypeBadges types={boss.types} locale={locale} />
          </div>
        </div>
      </div>

      {/* largeur au contenu : ces chiffres n'ont pas à barrer la page */}
      <div className="mb-9 flex flex-wrap items-stretch gap-3">
        <Card className="flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-3">
          <InfoItem label={dict.raids.tier} value={tier.label} />
          <InfoItem label={dict.raids.bossHp} value={tier.hp.toLocaleString(locale)} />
          <InfoItem label={dict.raids.duration} value={`${tier.durationSeconds} s`} />
        </Card>
        {detail.players ? <PlayersInfo players={detail.players} dict={dict} /> : null}
      </div>

      <Section title={dict.raids.forms}>
        {/* carrés à largeur fixe : quatre apparences ne doivent pas s'étaler sur la page */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,10rem))] gap-3">
          {variantsOf(forms, locale, dict).map((variant) => (
            <VariantTile key={variant.key} variant={variant} dict={dict} />
          ))}
        </div>
      </Section>

      <Section title={dict.raids.catchCp}>
        <Card className="overflow-x-auto p-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2" />
                <th className="px-4 py-2 text-right">
                  <ColumnLabel>{dict.raids.cpZero}</ColumnLabel>
                </th>
                <th className="px-4 py-2 text-right">
                  <ColumnLabel>{floorLabel}</ColumnLabel>
                </th>
                <th className="px-4 py-2 text-right">
                  <ColumnLabel>{dict.raids.cpPerfect}</ColumnLabel>
                </th>
              </tr>
            </thead>
            <tbody>
              {cpTableRows.map((row) => (
                <tr key={row.label} className="odd:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 text-[11px] text-muted">
                      {dict.raids.level} {row.level}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">
                    {row.zero ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{row.floor}</td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-pve">
                    {row.perfect}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-[11px] text-muted">
          {interpolate(dict.raids.cpNote, { percent: floorPercent })}
        </p>
      </Section>

      <Section title={dict.raids.bestCounters} hint={`${dict.raids.attackerLevel} 40`}>
        <CountersTable counters={counters} locale={locale} dict={dict} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={dict.raids.typeChart}>
          <Card className="p-4">
            <ColumnLabel>{dict.raids.superEffective}</ColumnLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {weaknesses.map((entry) => (
                <span key={entry.type} className="inline-flex items-center gap-1">
                  <TypeBadge type={entry.type} locale={locale} />
                  <span className="text-[11px] text-muted">
                    {multiplierLabel(entry.multiplier, locale)}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-4">
              <ColumnLabel>{dict.raids.notVeryEffective}</ColumnLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resistances.map((entry) => (
                  <span key={entry.type} className="inline-flex items-center gap-1">
                    <TypeBadge type={entry.type} locale={locale} />
                    <span className="text-[11px] text-muted">
                      {multiplierLabel(entry.multiplier, locale)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </Section>

        <Section title={dict.raids.bossMoves}>
          <Card className="p-4">
            <div className="flex flex-col gap-1.5">
              {moves.map((move) => (
                <div key={move.moveId} className="flex items-center gap-2 text-sm">
                  <TypeBadge type={move.type} locale={locale} />
                  <span className="flex-1 truncate">
                    {locale === 'fr' ? move.nameFr : move.nameEn}
                  </span>
                  <span className="text-xs text-muted">
                    {move.kind === 'FAST' ? dict.raids.fastMove : dict.raids.chargedMove}
                  </span>
                  <span className="w-10 text-right text-xs font-semibold">{move.power}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>
    </div>
  );
}
