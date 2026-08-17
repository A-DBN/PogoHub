'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, Trash2 } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadge, TypeBadges } from '@/components/pokemon/TypeBadge';
import { Button, Input, Label } from '@/components/ui';
import { Dropdown, type DropdownOption } from '@/components/ui/Dropdown';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import type { Locale } from '@/i18n/config';
import {
  createTeam, fetchSpeciesMoves, findPokemon, updateTeam, type TeamInput,
} from '@/server/actions/teams';
import type {
  MoveView, SpeciesMoves, TeamPokemonOption, TeamView,
} from '@/server/queries/teams';
import { calcCP, levelForCp } from '@/lib/pogo/stats';
import { checkEligibility, type LeagueFilters } from '@/lib/pogo/eligibility';
import { cn } from '@/lib/cn';

type MoveOption = MoveView;

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const COLORS = ['#5b9cff', '#a06cff', '#ff8a5b', '#45c8dc', '#35c98a', '#e8b34a', '#ff7a7a'];
const SLOTS = [0, 1, 2] as const;

/** Un emplacement en cours d'édition ; `null` tant qu'aucune espèce n'est choisie. */
type SlotDraft = {
  pokemonId: string;
  isShadow: boolean;
  isShiny: boolean;
  level: number;
  ivAtk: number;
  ivDef: number;
  ivHp: number;
  fastMoveId: string | null;
  charged1Id: string | null;
  charged2Id: string | null;
};

function draftFromTeam(team: TeamView | null): Array<SlotDraft | null> {
  const slots: Array<SlotDraft | null> = [null, null, null];
  for (const member of team?.members ?? []) {
    slots[member.slot] = {
      pokemonId: member.pokemon.id,
      isShadow: member.isShadow,
      isShiny: member.isShiny,
      level: member.level,
      ivAtk: member.ivs.atk,
      ivDef: member.ivs.def,
      ivHp: member.ivs.hp,
      fastMoveId: member.moves.fast?.moveId ?? null,
      charged1Id: member.moves.charged[0]?.moveId ?? null,
      charged2Id: member.moves.charged[1]?.moveId ?? null,
    };
  }
  return slots;
}

export function TeamEditor({
  leagues,
  team,
  onClose,
  publicByDefault = false,
}: {
  leagues: Array<{
    key: string;
    nameFr: string;
    nameEn: string;
    cpLimit: number | null;
    filters: unknown;
  }>;
  /** `null` → création. */
  team: TeamView | null;
  onClose: () => void;
  /** Préférence du compte, appliquée aux nouvelles équipes seulement. */
  publicByDefault?: boolean;
}) {
  const { dict, locale } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team?.color ?? COLORS[0]);
  const [leagueKey, setLeagueKey] = useState(team?.league?.key ?? '');
  // Une équipe existante garde sa visibilité ; une nouvelle suit la préférence
  // du compte, réglable dans « Mon profil ».
  const [isPublic, setIsPublic] = useState(team?.isPublic ?? publicByDefault);
  const [notes, setNotes] = useState(team?.notes ?? '');
  const [slots, setSlots] = useState(() => draftFromTeam(team));
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Registre des espèces connues de la modale : les membres déjà en place, plus
  // celles ramenées par la recherche. Le catalogue complet n'est plus embarqué.
  const [known, setKnown] = useState<Record<string, TeamPokemonOption>>(() =>
    Object.fromEntries(
      (team?.members ?? []).map((member) => [
        member.pokemon.id,
        { ...member.pokemon, shinyIconFile: member.pokemon.shinyIconFile },
      ]),
    ),
  );
  const byId = useMemo(() => new Map(Object.entries(known)), [known]);
  const remember = useCallback((option: TeamPokemonOption) => {
    setKnown((current) => ({ ...current, [option.id]: option }));
  }, []);

  // Movepools chargés à la demande : les embarquer pour toutes les espèces
  // pesait 1,2 Mo sur la page Équipes.
  const [movepools, setMovepools] = useState<Record<string, SpeciesMoves>>({});
  const loadMoves = useCallback(async (pokemonId: string) => {
    const moves = await fetchSpeciesMoves(pokemonId);
    setMovepools((current) => ({ ...current, [pokemonId]: moves }));
    return moves;
  }, []);

  // à l'édition, les espèces déjà en place ont besoin de leur movepool
  useEffect(() => {
    for (const slot of slots) {
      if (slot && !movepools[slot.pokemonId]) void loadMoves(slot.pokemonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage et à chaque ajout
  }, [slots, loadMoves]);

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.key === leagueKey) ?? null,
    [leagues, leagueKey],
  );

  const setSlot = (index: number, next: SlotDraft | null) =>
    setSlots((current) => current.map((slot, i) => (i === index ? next : slot)));

  const submit = () => {
    if (!name.trim()) {
      setError(dict.common.required);
      return;
    }
    const input: TeamInput = {
      name: name.trim(),
      color,
      leagueKey: leagueKey || null,
      notes: notes.trim() || null,
      isPublic,
      members: slots.flatMap((slot, index) =>
        slot ? [{ ...slot, slot: index }] : [],
      ),
    };
    startTransition(async () => {
      const result = team ? await updateTeam(team.id, input) : await createTeam(input);
      if (!result.ok) {
        setError(result.error === 'UNAUTHORIZED' ? dict.teams.loginToCreate : dict.common.empty);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-gradient-to-b from-[#1c212c] to-[#141821] p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{team ? dict.teams.edit : dict.teams.create}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-white/[0.06] hover:text-ink"
            aria-label={dict.common.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{dict.teams.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>{dict.common.league}</Label>
            <Dropdown
              value={leagueKey}
              onChange={setLeagueKey}
              options={[
                { value: '', label: dict.teams.noLeague },
                ...leagues.map((league) => ({
                  value: league.key,
                  label: locale === 'fr' ? league.nameFr : league.nameEn,
                })),
              ]}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <Label>{dict.teams.color}</Label>
            <div className="flex gap-1.5">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={value}
                  className={cn(
                    'h-7 w-7 rounded-full transition',
                    color === value && 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#1c212c]',
                  )}
                  style={{ background: value }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>{dict.teams.visibility}</Label>
            <div className="flex gap-1">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setIsPublic(value)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                    isPublic === value
                      ? 'bg-gradient-to-b from-brand to-[#5474f0] font-semibold text-white'
                      : 'text-muted hover:bg-white/[0.06] hover:text-ink',
                  )}
                >
                  {value ? dict.common.public : dict.common.private}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Label>{dict.teams.members}</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {SLOTS.map((index) => (
              <SlotCard
                key={index}
                index={index}
                draft={slots[index]}
                option={slots[index] ? byId.get(slots[index]!.pokemonId) : undefined}
                moves={slots[index] ? movepools[slots[index]!.pokemonId] : undefined}
                league={selectedLeague}
                onPick={() => setPicking(index)}
                onChange={(next) => setSlot(index, next)}
              />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Label>{dict.teams.notes}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            {dict.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending} type="button">
            {pending ? dict.teams.saving : dict.common.save}
          </Button>
        </div>
      </div>

      {picking !== null ? (
        <PokemonPicker
          onClose={() => setPicking(null)}
          onSelect={(option) => {
            remember(option);
            const slot = picking;
            setSlot(slot, {
              pokemonId: option.id,
              isShadow: false,
              isShiny: false,
              level: 50,
              ivAtk: 15,
              ivDef: 15,
              ivHp: 15,
              fastMoveId: null,
              charged1Id: null,
              charged2Id: null,
            });
            setPicking(null);
            // les attaques par défaut arrivent avec le movepool
            void loadMoves(option.id).then((loaded) => {
              setSlots((current) =>
                current.map((entry, index) =>
                  index === slot && entry?.pokemonId === option.id
                    ? {
                        ...entry,
                        fastMoveId: loaded.fast[0]?.moveId ?? null,
                        charged1Id: loaded.charged[0]?.moveId ?? null,
                        charged2Id: loaded.charged[1]?.moveId ?? null,
                      }
                    : entry,
                ),
              );
            });
          }}
        />
      ) : null}
    </div>
  );
}

function SlotCard({
  index,
  draft,
  option,
  moves,
  league,
  onPick,
  onChange,
}: {
  index: number;
  draft: SlotDraft | null;
  option: TeamPokemonOption | undefined;
  /** `undefined` tant que le movepool n'est pas revenu du serveur. */
  moves: SpeciesMoves | undefined;
  /** Ligue retenue, ou `null` : sans elle il n'y a rien à faire respecter. */
  league: { cpLimit: number | null; filters: unknown } | null;
  onPick: () => void;
  onChange: (next: SlotDraft | null) => void;
}) {
  const { dict, locale } = useT();

  // Le joueur raisonne en PC, pas en niveau : on saisit un PC et on retient le
  // niveau le plus haut qui tient dessous. Les IV entrent dans le calcul, donc
  // le PC obtenu tombe rarement pile sur la valeur demandée.
  const base = option
    ? { atk: option.baseAtk, def: option.baseDef, hp: option.baseHp }
    : null;
  const ivs = draft
    ? { atk: draft.ivAtk, def: draft.ivDef, hp: draft.ivHp }
    : { atk: 15, def: 15, hp: 15 };
  const currentCp = base && draft ? calcCP(base, ivs, draft.level) : 0;
  const [cpDraft, setCpDraft] = useState(String(currentCp));
  useEffect(() => setCpDraft(String(currentCp)), [currentCp]);

  const applyCp = (value: string) => {
    if (!base || !draft) return;
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) {
      setCpDraft(String(currentCp));
      return;
    }
    const found = levelForCp(base, ivs, target);
    onChange({ ...draft, level: found.level });
    setCpDraft(String(found.cp));
  };
  const cpHint = interpolate(dict.teams.cpHint, { cp: currentCp, level: draft?.level ?? 0 });

  if (!draft || !option) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-[9rem] flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.03] p-4 text-sm text-muted transition hover:bg-white/[0.06] hover:text-ink"
      >
        <span className="text-xs uppercase tracking-wide">
          {interpolate(dict.teams.slot, { n: index + 1 })}
        </span>
        {dict.teams.addPokemon}
      </button>
    );
  }

  const form = locale === 'fr' ? (option.formFr ?? option.form) : option.form;

  /**
   * Éligibilité recalculée à chaque frappe, sur place.
   *
   * Le PC change à mesure qu'on saisit ; passer par le serveur ferait clignoter
   * l'avertissement avec un tour de retard. Les données nécessaires (`dex`,
   * `tags`, filtres de la ligue) voyagent donc avec la page.
   */
  const check = league
    ? checkEligibility(
        {
          speciesId: option.speciesId,
          dex: option.dex,
          types: option.types,
          tags: option.tags,
          cp: currentCp,
        },
        { cpLimit: league.cpLimit, filters: (league.filters ?? null) as LeagueFilters | null },
      )
    : null;
  const ineligible = check ? !check.eligible : false;

  return (
    <div
      className={cn(
        'rounded-2xl p-3 transition',
        // signalé, jamais bloqué : on n'efface pas le travail de quelqu'un
        // parce qu'il change de ligue en cours de composition
        ineligible ? 'bg-danger/10 ring-1 ring-danger/40' : 'bg-white/[0.04]',
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onPick} className="shrink-0" title={dict.teams.pickPokemon}>
          {/* le sprite suit la case « chromatique » : on voit ce qu'on compose */}
          <PokemonIcon
            file={draft.isShiny ? (option.shinyIconFile ?? option.iconFile) : option.iconFile}
            alt={option.nameEn}
            size={40}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {locale === 'fr' ? option.nameFr : option.nameEn}
          </div>
          {form ? <div className="truncate text-[10px] text-muted">{form}</div> : null}
          <TypeBadges types={option.types} locale={locale} className="mt-1" />
          {ineligible ? (
            <div className="mt-1 text-[10px] font-semibold text-danger">
              {dict.teams.ineligible}
              {check?.reasons.includes('cp') && league?.cpLimit != null
                ? ` — ${dict.dashboard.cpMax} ${league.cpLimit}`
                : ''}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-lg p-1 text-muted transition hover:bg-white/[0.06] hover:text-danger"
          aria-label={dict.teams.remove}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* deux rangées : dans une carte au tiers de la largeur, PC + niveau +
          les deux cases ne tiennent pas sur une ligne et débordent à droite */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <label className="flex items-center gap-1" title={cpHint}>
          <span className="text-muted">{dict.common.cp}</span>
          <input
            type="number"
            min={10}
            max={9999}
            step={10}
            value={cpDraft}
            onChange={(e) => setCpDraft(e.target.value)}
            onBlur={() => applyCp(cpDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCp(cpDraft);
            }}
            className="w-16 rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-right outline-none"
          />
        </label>
        <span className="whitespace-nowrap text-muted">
          {dict.common.levelShort} {draft.level}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {option.shadowEligible ? (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={draft.isShadow}
              onChange={(e) => onChange({ ...draft, isShadow: e.target.checked })}
            />
            <span className="text-muted">{dict.common.shadow}</span>
          </label>
        ) : null}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={draft.isShiny}
            onChange={(e) => onChange({ ...draft, isShiny: e.target.checked })}
          />
          <span className="text-muted">✨</span>
        </label>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted">{dict.teams.ivs}</span>
        {(['ivAtk', 'ivDef', 'ivHp'] as const).map((key) => (
          <input
            key={key}
            type="number"
            min={0}
            max={15}
            value={draft[key]}
            onChange={(e) => onChange({ ...draft, [key]: Number(e.target.value) })}
            className="w-11 rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-right outline-none"
          />
        ))}
      </div>

      <div className="mt-2">
        <Dropdown
          size="sm"
          value={draft.fastMoveId ?? ''}
          onChange={(value) => onChange({ ...draft, fastMoveId: value || null })}
          placeholder={dict.common.fastMove}
          options={moveOptions(moves?.fast ?? [], locale)}
        />
      </div>

      {(['charged1Id', 'charged2Id'] as const).map((key) => (
        <div key={key} className="mt-1">
          <Dropdown
            size="sm"
            value={draft[key] ?? ''}
            onChange={(value) => onChange({ ...draft, [key]: value || null })}
            placeholder={dict.common.chargedMoves}
            // une chargée peut être laissée vide, d'où l'entrée « Aucune »
            options={moveOptions(moves?.charged ?? [], locale, dict.common.none)}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Options d'attaque, badge de type compris. Le libellé du champ n'est **pas**
 * une option : le placeholder s'affiche quand rien n'est choisi, alors qu'une
 * ligne « Attaque rapide » dans la liste se lit comme un choix possible.
 * `emptyLabel` n'est fourni que là où vider l'emplacement a un sens.
 */
function moveOptions(
  moves: MoveOption[],
  locale: Locale,
  emptyLabel?: string,
): DropdownOption[] {
  const options = moves.map((move) => ({
    value: move.moveId,
    label: locale === 'fr' ? move.nameFr : move.nameEn,
    leading: <TypeBadge type={move.type} locale={locale} className="shrink-0" />,
  }));
  return emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options;
}

const MAX_RESULTS = 60;

function PokemonPicker({
  onSelect,
  onClose,
}: {
  onSelect: (option: TeamPokemonOption) => void;
  onClose: () => void;
}) {
  const { dict, locale } = useT();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TeamPokemonOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Recherche côté serveur, débattue : le catalogue complet ne transite plus.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void findPokemon(query).then((rows) => {
        if (cancelled) return;
        setMatches(rows);
        setLoading(false);
      });
    }, query ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="pop flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl bg-gradient-to-b from-[#1c212c] to-[#141821] p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mb-3">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dict.teams.pickPokemon}
            className="pl-9"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !matches.length ? (
            <p className="p-4 text-center text-sm text-muted">{dict.common.loading}</p>
          ) : null}
          {matches.map((option) => {
            const form = locale === 'fr' ? (option.formFr ?? option.form) : option.form;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.06]"
              >
                <PokemonIcon file={option.iconFile} alt={option.nameEn} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {locale === 'fr' ? option.nameFr : option.nameEn}
                  {form ? (
                    <span className="ml-1.5 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-muted">
                      {form}
                    </span>
                  ) : null}
                </span>
                <TypeBadges types={option.types} locale={locale} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
