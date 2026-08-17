'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useT } from '@/i18n/client';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadges } from '@/components/pokemon/TypeBadge';
import { TYPES, TYPE_INFO } from '@/lib/pogo/types';
import { calcStats } from '@/lib/pogo/stats';
import { Input, ColumnLabel } from '@/components/ui';
import { HoverCard } from '@/components/ui/HoverCard';
import { Dropdown } from '@/components/ui/Dropdown';
import { cn } from '@/lib/cn';
import type { MetaDictionaries, MetaRow, MoveRef, MoveView } from '@/server/queries/meta';

/**
 * Les lignes ne transportent que des identifiants ; noms et types viennent des
 * dictionnaires envoyés une seule fois. On reconstruit la vue au rendu.
 */
function resolveMove(ref: MoveRef, moves: MetaDictionaries['moves']): MoveView | null {
  const move = moves[ref.id];
  if (!move) return null;
  return {
    moveId: ref.id,
    nameFr: move.nameFr,
    nameEn: move.nameEn,
    type: move.type,
    isElite: Boolean(ref.elite),
    usage: ref.pct,
    count: ref.count,
  };
}

const resolveMoves = (refs: MoveRef[], moves: MetaDictionaries['moves']): MoveView[] =>
  refs.map((ref) => resolveMove(ref, moves)).filter((move): move is MoveView => move !== null);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’\-.\s]/g, '');

const typeColor = (type: string) => TYPE_INFO[type as keyof typeof TYPE_INFO]?.color;

function MoveChip({ move, locale }: { move: MoveView; locale: 'fr' | 'en' }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: typeColor(move.type) }} />
      {locale === 'fr' ? move.nameFr : move.nameEn}
      {move.isElite ? <span className="text-warn">★</span> : null}
      {move.count ? (
        <span className="rounded-md bg-white/[0.07] px-1 text-[10px] text-muted">
          {move.count}
        </span>
      ) : null}
    </span>
  );
}

function Alternatives({
  title,
  moves,
  current,
  locale,
}: {
  title: string;
  moves: MoveView[];
  current?: string;
  locale: 'fr' | 'en';
}) {
  return (
    <>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </div>
      <div className="space-y-1">
        {moves.slice(0, 5).map((move) => (
          <div
            key={move.moveId}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg px-1.5 py-1',
              move.moveId === current && 'bg-brand/15 text-brand',
            )}
          >
            <MoveChip move={move} locale={locale} />
            <span className="text-muted">{move.usage ?? 0} %</span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Cellule modifiable en place. Elle se souvient de la valeur d'origine pour
 * signaler visuellement ce qui a bougé — c'est ce que le contributeur relira
 * avant d'envoyer son lot.
 */
function EditableCell({
  value,
  original,
  step = 1,
  onChange,
}: {
  value: number;
  original: number;
  step?: number;
  onChange: (value: number | null) => void;
}) {
  const dirty = value !== original;
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === '' ? null : Number(next));
      }}
      title={dirty ? String(original) : undefined}
      className={cn(
        'w-16 rounded-lg px-1.5 py-0.5 text-right outline-none transition',
        dirty
          ? 'bg-warn/20 font-bold text-warn'
          : 'bg-white/[0.05] hover:bg-white/[0.09]',
      )}
    />
  );
}

/** Retirer, monter, descendre : les gestes d'édition d'une ligne. */
function RowActions({
  removed,
  added,
  onRemove,
  onUp,
  onDown,
}: {
  removed: boolean;
  added: boolean;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const button = 'rounded p-1 text-muted transition hover:bg-white/[0.09] hover:text-ink';
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" onClick={onUp} className={button} aria-label="↑" title="↑">
        <ChevronUp size={13} />
      </button>
      <button type="button" onClick={onDown} className={button} aria-label="↓" title="↓">
        <ChevronDown size={13} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className={cn(button, removed && 'text-warn')}
        aria-label="×"
        // une ligne ajoutée se retire vraiment, une ligne existante se marque
        title={added ? '×' : '×'}
      >
        <Trash2 size={13} />
      </button>
    </span>
  );
}

/**
 * Choix d'une attaque en mode édition.
 *
 * Les options viennent des alternatives PvPoke de la ligne — celles déjà
 * affichées au survol. L'attaque en place y figure toujours, même si elle n'est
 * pas dans la liste d'usage.
 */
function MoveSelect({
  value,
  options,
  current,
  locale,
  allowEmpty = false,
  onChange,
}: {
  value: string;
  options: MoveView[];
  current: MoveView | null;
  locale: 'fr' | 'en';
  allowEmpty?: boolean;
  onChange: (moveId: string) => void;
}) {
  const all = current && !options.some((move) => move.moveId === current.moveId)
    ? [current, ...options]
    : options;

  // Pas de <select> natif : le système rend sa liste lui-même (gris sur blanc,
  // hors charte) et rien n'est stylable.
  return (
    <div className="w-40">
      <Dropdown
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          ...(allowEmpty ? [{ value: '', label: '—' }] : []),
          ...all.map((move) => ({
            value: move.moveId,
            label: locale === 'fr' ? move.nameFr : move.nameEn,
            leading: (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: typeColor(move.type) }}
              />
            ),
          })),
        ]}
      />
    </div>
  );
}

/** `[niveau, atk, def, pv]` — même forme que `Pokemon.defaultIvs`. */
export type Spread = [number, number, number, number];

/**
 * Niveau et IV du spread « rang 1 », modifiables.
 * Un contributeur peut ne pas être d'accord avec le spread calculé par PvPoke.
 */
function SpreadEditor({
  spread,
  original,
  levelLabel,
  onChange,
}: {
  spread: Spread;
  original: Spread;
  levelLabel: string;
  onChange: (next: Spread) => void;
}) {
  const set = (index: number, value: number) => {
    const next = [...spread] as Spread;
    next[index] = value;
    onChange(next);
  };
  const dirty = spread.some((value, index) => value !== original[index]);

  return (
    <div className={cn('flex items-center gap-1', dirty && 'text-warn')}>
      <span className="text-[10px] text-muted">{levelLabel}</span>
      <input
        type="number"
        min={1}
        max={51}
        step={0.5}
        value={spread[0]}
        onChange={(event) => set(0, Number(event.target.value))}
        className="w-12 rounded bg-white/[0.06] px-1 py-0.5 text-right text-xs outline-none"
      />
      {[1, 2, 3].map((index) => (
        <input
          key={index}
          type="number"
          min={0}
          max={15}
          value={spread[index]}
          onChange={(event) => set(index, Number(event.target.value))}
          className="w-10 rounded bg-white/[0.06] px-1 py-0.5 text-right text-xs outline-none"
        />
      ))}
    </div>
  );
}

/**
 * Le PC ne se saisit pas directement : il découle du niveau et des IV. On
 * l'affiche recalculé, et on ajuste le niveau par pas de 0,5 pour l'approcher.
 */
function CpEditor({
  spread,
  base,
  onChange,
}: {
  spread: Spread;
  base: [number, number, number];
  onChange: (next: Spread) => void;
}) {
  const bump = (delta: number) => {
    const next = [...spread] as Spread;
    next[0] = Math.max(1, Math.min(51, next[0] + delta));
    onChange(next);
  };

  /* Le PC se recalcule à chaque cran. Afficher la valeur venue du serveur
     donnait un niveau qui bougeait au-dessus d'un PC immobile. */
  const cp = calcStats(
    { atk: base[0], def: base[1], hp: base[2] },
    { atk: spread[1], def: spread[2], hp: spread[3] },
    spread[0],
  ).cp;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => bump(-0.5)}
        className="rounded bg-white/[0.06] px-1 text-xs transition hover:bg-white/[0.12]"
        aria-label="-"
      >
        −
      </button>
      <span className="w-12 text-right">{cp}</span>
      <button
        type="button"
        onClick={() => bump(0.5)}
        className="rounded bg-white/[0.06] px-1 text-xs transition hover:bg-white/[0.12]"
        aria-label="+"
      >
        +
      </button>
    </span>
  );
}

type SortKey = 'rank' | 'score' | 'cp' | 'statProduct' | 'name' | 'dex';

const PAGE_SIZE = 60;

export function MetaTable({
  rows,
  moves,
  species,
  editing,
  edits,
  removed,
  added,
  onEdit,
  onEditMoves,
  onEditSpread,
  onRemove,
  onMove,
  originalRanks,
}: {
  rows: MetaRow[];
  /** Mode contributeur : les cellules Rang et Score deviennent modifiables. */
  editing?: boolean;
  edits?: Record<string, { rank?: number; score?: number; moveset?: string[]; ivs?: Spread }>;
  /** Lignes marquées pour retrait : barrées, pas encore supprimées. */
  removed?: string[];
  /** Lignes ajoutées dans le lot en cours. */
  added?: string[];
  /** Rang d'origine, auquel la position affichée se compare pour se signaler. */
  originalRanks?: Record<string, number>;
  onEdit?: (speciesId: string, field: 'rank', value: number | null) => void;
  onEditMoves?: (speciesId: string, moveset: string[]) => void;
  onEditSpread?: (speciesId: string, spread: Spread) => void;
  onRemove?: (speciesId: string) => void;
  onMove?: (speciesId: string, direction: -1 | 1) => void;
} & MetaDictionaries) {
  const { dict, locale } = useT();
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });
  // 500 lignes d'un coup, c'est 1,3 Mo de DOM et un navigateur qui rame : on
  // n'en rend qu'une tranche, le filtre continuant de porter sur tout le jeu.
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const nameOf = (ref: MoveRef | null | undefined) => {
      const move = ref ? moves[ref.id] : null;
      return move ? `${move.nameFr} ${move.nameEn}` : '';
    };
    const list = rows.filter((row) => {
      if (types.length && !row.types.some((t) => types.includes(t))) return false;
      if (!q) return true;
      return normalize(
        [
          row.nameFr, row.nameEn, nameOf(row.fast),
          ...row.charged.map((m) => nameOf(m)),
        ].join(' '),
      ).includes(q);
    });

    return [...list].sort((a, b) => {
      if (sort.key === 'name') {
        const compare =
          locale === 'fr' ? a.nameFr.localeCompare(b.nameFr, 'fr') : a.nameEn.localeCompare(b.nameEn);
        return compare * sort.dir;
      }
      // une ligne sans note reste en bas quel que soit le sens du tri :
      // la comparer par NaN rendrait l'ordre imprévisible
      const left = a[sort.key] as number | null;
      const right = b[sort.key] as number | null;
      if (left == null || right == null) {
        return left == null ? (right == null ? 0 : 1) : -1;
      }
      return (left - right) * sort.dir;
    });
  }, [rows, moves, query, types, sort, locale]);

  const Th = ({
    sortKey,
    children,
    align = 'right',
    className,
  }: {
    sortKey?: SortKey;
    children?: React.ReactNode;
    align?: 'left' | 'right';
    className?: string;
  }) => (
    <th
      onClick={
        sortKey
          ? () =>
              setSort((s) => ({
                key: sortKey,
                dir: s.key === sortKey ? ((s.dir * -1) as 1 | -1) : sortKey === 'name' ? 1 : -1,
              }))
          : undefined
      }
      className={cn(
        'whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted',
        align === 'left' ? 'text-left' : 'text-right',
        sortKey && 'cursor-pointer select-none transition hover:text-ink',
        className,
      )}
    >
      {children}
      {sortKey && sort.key === sortKey ? (
        <span className="ml-1 text-brand">{sort.dir > 0 ? '▲' : '▼'}</span>
      ) : null}
    </th>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={dict.list.searchPlaceholder}
          className="max-w-xs border-transparent bg-white/[0.05] focus:border-transparent focus:bg-white/[0.08]"
        />
        <div className="flex flex-wrap gap-1">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                setTypes((current) =>
                  current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
                )
              }
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold text-white transition duration-150',
                !types.includes(type) && 'opacity-40 saturate-[0.7] hover:opacity-75',
              )}
              style={{
                background: `linear-gradient(180deg, ${TYPE_INFO[type].color}, ${TYPE_INFO[type].color}cc)`,
                boxShadow: types.includes(type)
                  ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px -10px ${TYPE_INFO[type].color}`
                  : undefined,
              }}
            >
              {locale === 'fr' ? TYPE_INFO[type].fr : TYPE_INFO[type].en}
            </button>
          ))}
          {types.length ? (
            <button
              type="button"
              onClick={() => setTypes([])}
              className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-muted transition hover:bg-white/[0.1] hover:text-ink"
            >
              ✕
            </button>
          ) : null}
        </div>
        <span className="ml-auto text-xs text-muted">{filtered.length}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.015] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_22px_48px_-30px_rgba(0,0,0,1)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-white/[0.03]">
              {editing ? <Th /> : null}
              <Th sortKey="rank">#</Th>
              <Th />
              <Th sortKey="name" align="left">
                Pokémon
              </Th>
              <Th sortKey="dex">Dex</Th>
              <Th align="left">{dict.common.types}</Th>
              <Th align="left">{dict.list.bestIv}</Th>
              <Th sortKey="cp">{dict.common.cp}</Th>
              <Th sortKey="score">{dict.common.score}</Th>
              <Th align="left">{dict.common.fastMove}</Th>
              <Th align="left">{dict.common.chargedMoves}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((row, index) => {
              const fastMove = row.fast ? resolveMove(row.fast, moves) : null;
              return (
              <tr
                key={row.id}
                data-removed={removed?.includes(row.speciesId) ? '' : undefined}
                className={cn(
                  'transition-colors hover:bg-white/[0.055]',
                  index % 2 === 1 && 'bg-white/[0.018]',
                  removed?.includes(row.speciesId) && 'opacity-40 line-through',
                  added?.includes(row.speciesId) && 'bg-success/[0.08]',
                )}
              >
                {editing ? (
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <RowActions
                      removed={Boolean(removed?.includes(row.speciesId))}
                      added={Boolean(added?.includes(row.speciesId))}
                      onRemove={() => onRemove?.(row.speciesId)}
                      onUp={() => onMove?.(row.speciesId, -1)}
                      onDown={() => onMove?.(row.speciesId, 1)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-1.5 text-right text-xs text-muted">
                  {editing ? (
                    /* `row.rank` est déjà la position finale : afficher la
                       valeur saisie à la place faisait diverger les deux et
                       montrait deux fois le même numéro après un déplacement. */
                    <EditableCell
                      value={row.rank}
                      original={originalRanks?.[row.speciesId] ?? row.rank}
                      onChange={(value) => onEdit?.(row.speciesId, 'rank', value)}
                    />
                  ) : (
                    row.rank
                  )}
                </td>
                <td className="py-1.5 pl-1">
                  <HoverCard
                    align="start"
                    cardClassName="w-auto max-w-none"
                    content={
                      <>
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {dict.teams.evolutionLine}
                        </div>
                        {row.evolution.length > 1 ? (
                          <div className="flex items-center gap-1.5">
                            {row.evolution.map((speciesId, position) => {
                              const node = species[speciesId];
                              if (!node) return null;
                              // le membre courant de la lignée dépend de la ligne
                              const current = speciesId === row.speciesId.replace(/_shadow$/, '');
                              return (
                              <span key={speciesId} className="flex items-center gap-1.5">
                                {position > 0 ? (
                                  <span className="text-muted">→</span>
                                ) : null}
                                <span className="flex w-20 flex-col items-center gap-0.5">
                                  <PokemonIcon file={node.iconFile} alt={node.nameEn} size={44} />
                                  <span
                                    className={cn(
                                      'text-center text-[11px] leading-tight',
                                      current ? 'font-bold text-brand' : 'text-muted',
                                    )}
                                  >
                                    {locale === 'fr' ? node.nameFr : node.nameEn}
                                    {node.form ? (
                                      <span className="block text-[10px] opacity-70">
                                        {locale === 'fr' ? (node.formFr ?? node.form) : node.form}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted">
                            {locale === 'fr' ? 'Aucune évolution' : 'No evolution'}
                          </p>
                        )}
                        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/[0.07] pt-2 text-center">
                          {[
                            [dict.common.attack, row.atk],
                            [dict.common.defense, row.def],
                            [dict.common.hp, row.hp],
                            [dict.common.statProduct, (row.statProduct / 1000).toFixed(0) + 'k'],
                          ].map(([label, value]) => (
                            <span key={String(label)}>
                              <span className="block text-[10px] uppercase tracking-wide text-muted">
                                {label}
                              </span>
                              <span className="font-semibold">{value}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    }
                  >
                    <PokemonIcon file={row.iconFile} alt={row.nameEn} size={38} className="cursor-help" />
                  </HoverCard>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold">
                      {locale === 'fr' ? row.nameFr : row.nameEn}
                      {row.form ? (
                        <span className="ml-1.5 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {locale === 'fr' ? (row.formFr ?? row.form) : row.form}
                        </span>
                      ) : null}
                      {row.isShadow ? (
                        <span className="ml-1.5 rounded-md bg-shadow-badge px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {dict.common.shadow.toUpperCase()}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted">
                      {locale === 'fr' ? row.nameEn : row.nameFr}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-muted">{row.dex}</td>
                <td className="px-3 py-1.5">
                  <TypeBadges types={row.types} locale={locale} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {editing ? (
                    <SpreadEditor
                      spread={edits?.[row.speciesId]?.ivs ?? [row.level, ...row.ivs]}
                      original={[row.level, ...row.ivs] as Spread}
                      levelLabel={dict.common.levelShort}
                      onChange={(next) => onEditSpread?.(row.speciesId, next)}
                    />
                  ) : (
                    <>
                      <ColumnLabel>
                        {dict.list.rank1} · {dict.common.level} {row.level}
                      </ColumnLabel>
                      <div className="font-semibold tracking-wide">
                        {row.ivs[0]} / {row.ivs[1]} / {row.ivs[2]}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {editing ? (
                    <CpEditor
                      spread={edits?.[row.speciesId]?.ivs ?? [row.level, ...row.ivs]}
                      base={row.base}
                      onChange={(next) => onEditSpread?.(row.speciesId, next)}
                    />
                  ) : (
                    row.cp
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {/* le score vient de la simulation PvPoke : on le montre, on ne
                      le saisit pas — et une ligne ajoutée à la main n'en a pas */}
                  {row.score == null ? (
                    <span className="text-muted" title={dict.common.scoreUnranked}>
                      —
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/[0.08]">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-2"
                          style={{ width: `${Math.min(100, row.score)}%` }}
                        />
                      </span>
                      {row.score.toFixed(1)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {editing ? (
                    <MoveSelect
                      value={edits?.[row.speciesId]?.moveset?.[0] ?? row.fast?.id ?? ''}
                      options={resolveMoves(row.altFast, moves)}
                      current={fastMove}
                      locale={locale}
                      onChange={(moveId) => {
                        const currentSet = edits?.[row.speciesId]?.moveset ?? [
                          row.fast?.id ?? '',
                          row.charged[0]?.id ?? '',
                          row.charged[1]?.id ?? '',
                        ];
                        onEditMoves?.(row.speciesId, [moveId, currentSet[1], currentSet[2]]);
                      }}
                    />
                  ) : fastMove ? (
                    <HoverCard
                      content={
                        <Alternatives
                          title={dict.list.alternatives}
                          moves={resolveMoves(row.altFast, moves)}
                          current={fastMove.moveId}
                          locale={locale}
                        />
                      }
                      className="cursor-help"
                    >
                      <MoveChip move={fastMove} locale={locale} />
                    </HoverCard>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    {editing
                      ? [0, 1].map((slot) => {
                          const currentSet = edits?.[row.speciesId]?.moveset ?? [
                            row.fast?.id ?? '',
                            row.charged[0]?.id ?? '',
                            row.charged[1]?.id ?? '',
                          ];
                          // L'attaque retenue dans l'autre emplacement sort de la
                          // liste : un Pokémon ne peut pas porter deux fois la
                          // même chargée. On la garde si elle est déjà le choix
                          // de cet emplacement, sinon la case s'afficherait vide.
                          const mine = currentSet[slot + 1] ?? '';
                          const other = currentSet[slot === 0 ? 2 : 1] ?? '';
                          return (
                            <MoveSelect
                              key={slot}
                              value={mine}
                              options={resolveMoves(row.altCharged, moves).filter(
                                (move) => move.moveId !== other || move.moveId === mine,
                              )}
                              current={resolveMoves(row.charged, moves)[slot] ?? null}
                              locale={locale}
                              allowEmpty
                              onChange={(moveId) => {
                                const next = [...currentSet];
                                next[slot + 1] = moveId;
                                onEditMoves?.(row.speciesId, next);
                              }}
                            />
                          );
                        })
                      : null}
                    {!editing && resolveMoves(row.charged, moves).map((move) => (
                      <HoverCard
                        key={move.moveId}
                        content={
                          <Alternatives
                            title={dict.list.alternatives}
                            moves={resolveMoves(row.altCharged, moves)}
                            current={move.moveId}
                            locale={locale}
                          />
                        }
                        className="cursor-help"
                      >
                        <MoveChip move={move} locale={locale} />
                      </HoverCard>
                    ))}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">{dict.list.noResults}</p>
        ) : null}
      </div>

      {shown < filtered.length ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((current) => current + PAGE_SIZE)}
            className="rounded-full bg-white/[0.06] px-5 py-2 text-sm font-semibold transition hover:bg-white/[0.11]"
          >
            {dict.list.showMore} ({filtered.length - shown})
          </button>
        </div>
      ) : null}
    </div>
  );
}
