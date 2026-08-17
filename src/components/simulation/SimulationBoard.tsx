'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Search, Swords, Trash2 } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { TypeBadge, TypeBadges } from '@/components/pokemon/TypeBadge';
import { Button, Card, ColumnLabel, Input, Label, Section } from '@/components/ui';
import { Dropdown, type DropdownOption } from '@/components/ui/Dropdown';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { createTeam, fetchSpeciesMoves, findPokemon } from '@/server/actions/teams';
import {
  previewSlots, runSimulation,
  type SimulationReport, type SimulationSlot, type SlotPreview,
} from '@/server/actions/simulation';
import type { SpeciesMoves, TeamPokemonOption, TeamView } from '@/server/queries/teams';
import { calcCP, levelForCp } from '@/lib/pogo/stats';
import { cn } from '@/lib/cn';

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Slot = SimulationSlot | null;
type TeamSide = 'A' | 'B';

const EMPTY: Slot[] = [null, null, null];

export function SimulationBoard({
  leagues,
  myTeams,
  opponent = null,
}: {
  leagues: Array<{ key: string; nameFr: string; nameEn: string }>;
  myTeams: TeamView[];
  /** Équipe à affronter, arrivée par `?vs=` depuis le profil d'un joueur. */
  opponent?: TeamView | null;
}) {
  const { dict, locale } = useT();
  const [pending, startTransition] = useTransition();

  const [leagueKey, setLeagueKey] = useState(leagues[0]?.key ?? 'great');
  const [teamA, setTeamA] = useState<Slot[]>(EMPTY);
  const [teamB, setTeamB] = useState<Slot[]>(EMPTY);
  const [picking, setPicking] = useState<{ side: TeamSide; index: number } | null>(null);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Niveau et PC réellement simulés : sous une limite de PC, une espèce très
  // statuée descend très bas en niveau, et le résultat paraît absurde tant
  // qu'on ne l'affiche pas.
  const [previews, setPreviews] = useState<Record<string, SlotPreview>>({});
  const keyOf = (side: TeamSide, index: number) => `${side}${index}`;
  /**
   * Emplacements venus d'une équipe enregistrée : ils gardent leurs stats
   * réelles quand on change de ligue, là où un Pokémon ajouté à la main est
   * réoptimisé au rang 1 de la nouvelle ligue.
   */
  const [fromTeam, setFromTeam] = useState<Record<string, boolean>>({});
  /** Camp dont on enregistre la composition, `null` si la modale est fermée. */
  const [saving, setSaving] = useState<TeamSide | null>(null);

  // Espèces connues du plateau : celles des équipes enregistrées, plus celles
  // ramenées par la recherche. Le catalogue complet ne transite plus.
  const [known, setKnown] = useState<Record<string, TeamPokemonOption>>(() =>
    Object.fromEntries(
      myTeams.flatMap((team) => team.members.map((member) => [member.pokemon.id, member.pokemon])),
    ),
  );
  const byId = useMemo(() => new Map(Object.entries(known)), [known]);

  const [movepools, setMovepools] = useState<Record<string, SpeciesMoves>>({});
  const loadMoves = useCallback(async (pokemonId: string) => {
    const moves = await fetchSpeciesMoves(pokemonId);
    setMovepools((current) => ({ ...current, [pokemonId]: moves }));
    return moves;
  }, []);

  useEffect(() => {
    for (const slot of [...teamA, ...teamB]) {
      if (slot && !movepools[slot.pokemonId]) void loadMoves(slot.pokemonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage et à chaque ajout
  }, [teamA, teamB, loadMoves]);

  // recalculé aussi au changement de ligue : le plafond de PC en dépend
  useEffect(() => {
    const entries: Array<{ key: string; slot: SimulationSlot }> = [];
    for (const [side, team] of [['A', teamA], ['B', teamB]] as const) {
      team.forEach((slot, index) => {
        if (slot) entries.push({ key: `${side}${index}`, slot });
      });
    }
    if (!entries.length) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    void previewSlots(entries.map((entry) => entry.slot), leagueKey).then((rows) => {
      if (cancelled) return;
      setPreviews(Object.fromEntries(rows.map((row, index) => [entries[index].key, row])));

      // Un emplacement sans stats saisies reçoit celles du rang 1 : les champs
      // deviennent renseignés donc modifiables, sans changer ce qui est simulé.
      const seeds = new Map<string, SlotPreview>();
      rows.forEach((row, index) => {
        if (entries[index].slot.level == null) seeds.set(entries[index].key, row);
      });
      if (!seeds.size) return;
      const applySeed = (side: TeamSide) => (current: Slot[]) =>
        current.map((slot, index) => {
          const seed = seeds.get(`${side}${index}`);
          return slot && seed
            ? {
                ...slot,
                level: seed.level,
                ivAtk: seed.ivs.atk,
                ivDef: seed.ivs.def,
                ivHp: seed.ivs.hp,
              }
            : slot;
        });
      setTeamA(applySeed('A'));
      setTeamB(applySeed('B'));
    });
    return () => {
      cancelled = true;
    };
  }, [teamA, teamB, leagueKey]);

  // Changer de ligue réoptimise ce qui a été ajouté à la main : on remet les
  // stats à zéro, l'aperçu les repeuplera au rang 1 de la nouvelle ligue.
  useEffect(() => {
    const clear = (side: TeamSide) => (current: Slot[]) =>
      current.map((slot, index) =>
        slot && !fromTeam[`${side}${index}`]
          ? { ...slot, level: null, ivAtk: null, ivDef: null, ivHp: null }
          : slot,
      );
    setTeamA(clear('A'));
    setTeamB(clear('B'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement au changement de ligue
  }, [leagueKey]);

  /** Une composition illégale ne doit pas pouvoir être lancée. */
  const offenders = Object.entries(previews).filter(([, preview]) => !preview.eligible);
  const blocked = offenders.length > 0;

  const setSlot = (side: TeamSide, index: number, next: Slot) => {
    const update = (current: Slot[]) => current.map((slot, i) => (i === index ? next : slot));
    if (side === 'A') setTeamA(update);
    else setTeamB(update);
  };

  /** Charge une équipe enregistrée dans un des deux camps. */
  const loadTeam = (side: TeamSide, team: TeamView) => {
    const slots: Slot[] = [null, null, null];
    for (const member of team.members) {
      slots[member.slot] = {
        pokemonId: member.pokemon.id,
        fastMoveId: member.moves.fast?.moveId ?? null,
        charged1Id: member.moves.charged[0]?.moveId ?? null,
        charged2Id: member.moves.charged[1]?.moveId ?? null,
        isShadow: member.isShadow,
        // niveau et IV réels de l'équipe : c'est eux qui décident du PC,
        // donc de l'éligibilité dans la ligue choisie
        level: member.level,
        ivAtk: member.ivs.atk,
        ivDef: member.ivs.def,
        ivHp: member.ivs.hp,
      };
    }
    if (side === 'A') setTeamA(slots);
    else setTeamB(slots);
    setFromTeam((current) => ({
      ...current,
      ...Object.fromEntries(slots.map((slot, index) => [`${side}${index}`, slot !== null])),
    }));
  };

  /**
   * Compo d'un autre joueur passée en `?vs=` : elle atterrit en équipe B.
   *
   * On adopte aussi sa ligue quand elle en a une — l'affronter en Master alors
   * qu'elle est bâtie pour la Super Ligue ne dirait rien de juste.
   */
  useEffect(() => {
    if (!opponent) return;
    loadTeam('B', opponent);
    if (opponent.league) setLeagueKey(opponent.league.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'arrivée
  }, [opponent]);

  const run = () => {
    const filled = (team: Slot[]) => team.filter((slot): slot is SimulationSlot => slot !== null);
    const a = filled(teamA);
    const b = filled(teamB);
    if (!a.length || !b.length) {
      setError(dict.simulation.incomplete);
      return;
    }
    if (blocked) {
      setError(dict.simulation.blocked);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runSimulation({ leagueKey, teamA: a, teamB: b });
      if (!result.ok) {
        setError(
          result.error === 'INELIGIBLE' ? dict.simulation.blocked : dict.simulation.incomplete,
        );
        setReport(null);
        return;
      }
      setReport(result.report);
    });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[12rem]">
          <Label>{dict.simulation.pickLeague}</Label>
          <Dropdown
            value={leagueKey}
            onChange={setLeagueKey}
            options={leagues.map((league) => ({
              value: league.key,
              label: locale === 'fr' ? league.nameFr : league.nameEn,
            }))}
          />
        </div>
        <Button onClick={run} disabled={pending || blocked} type="button">
          <Swords size={15} />
          {pending ? dict.simulation.running : dict.simulation.run}
        </Button>
        {blocked ? (
          <p className="text-sm text-danger">{dict.simulation.blocked}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['A', 'B'] as const).map((side) => (
          <TeamColumn
            key={side}
            side={side}
            title={side === 'A' ? dict.simulation.teamA : dict.simulation.teamB}
            slots={side === 'A' ? teamA : teamB}
            byId={byId}
            movepools={movepools}
            previews={previews}
            keyOf={keyOf}
            myTeams={myTeams}
            locale={locale}
            onPick={(index) => setPicking({ side, index })}
            onChange={(index, next) => setSlot(side, index, next)}
            onLoadTeam={(team) => loadTeam(side, team)}
            onSaveTeam={() => setSaving(side)}
          />
        ))}
      </div>

      {saving ? (
        <SaveTeamDialog
          slots={saving === 'A' ? teamA : teamB}
          leagueKey={leagueKey}
          onClose={() => setSaving(null)}
        />
      ) : null}

      {report ? <Report report={report} locale={locale} /> : null}

      {picking ? (
        <PokemonPicker
          locale={locale}
          onClose={() => setPicking(null)}
          onSelect={(option) => {
            setKnown((current) => ({ ...current, [option.id]: option }));
            const { side, index } = picking;
            setFromTeam((current) => ({ ...current, [`${side}${index}`]: false }));
            setSlot(side, index, {
              pokemonId: option.id,
              fastMoveId: null,
              charged1Id: null,
              charged2Id: null,
              isShadow: false,
            });
            setPicking(null);
            void loadMoves(option.id).then((loaded) => {
              const fill = (current: Slot[]) =>
                current.map((slot, i) =>
                  i === index && slot?.pokemonId === option.id
                    ? {
                        ...slot,
                        fastMoveId: loaded.fast[0]?.moveId ?? null,
                        charged1Id: loaded.charged[0]?.moveId ?? null,
                        charged2Id: loaded.charged[1]?.moveId ?? null,
                      }
                    : slot,
                );
              if (side === 'A') setTeamA(fill);
              else setTeamB(fill);
            });
          }}
        />
      ) : null}
    </div>
  );
}

function moveOptions(moves: SpeciesMoves['fast'], locale: Locale, emptyLabel?: string) {
  const list: DropdownOption[] = moves.map((move) => ({
    value: move.moveId,
    label: locale === 'fr' ? move.nameFr : move.nameEn,
    leading: <TypeBadge type={move.type} locale={locale} className="shrink-0" />,
  }));
  return emptyLabel ? [{ value: '', label: emptyLabel }, ...list] : list;
}

function TeamColumn({
  side,
  title,
  slots,
  byId,
  movepools,
  previews,
  keyOf,
  myTeams,
  locale,
  onPick,
  onChange,
  onLoadTeam,
  onSaveTeam,
}: {
  side: TeamSide;
  title: string;
  slots: Slot[];
  byId: Map<string, TeamPokemonOption>;
  movepools: Record<string, SpeciesMoves>;
  previews: Record<string, SlotPreview>;
  keyOf: (side: TeamSide, index: number) => string;
  myTeams: TeamView[];
  locale: Locale;
  onPick: (index: number) => void;
  onChange: (index: number, next: Slot) => void;
  onLoadTeam: (team: TeamView) => void;
  onSaveTeam: () => void;
}) {
  const { dict } = useT();

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {slots.some((slot) => slot !== null) ? (
            <button
              type="button"
              onClick={onSaveTeam}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.11]"
            >
              <Save size={13} />
              {dict.simulation.saveTeam}
            </button>
          ) : null}
        {myTeams.length ? (
          <div className="min-w-[11rem]">
            <Dropdown
              size="sm"
              value=""
              placeholder={dict.simulation.loadTeam}
              onChange={(id) => {
                const team = myTeams.find((entry) => entry.id === id);
                if (team) onLoadTeam(team);
              }}
              options={myTeams.map((team) => ({ value: team.id, label: team.name }))}
            />
          </div>
        ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {slots.map((slot, index) => {
          const option = slot ? byId.get(slot.pokemonId) : undefined;
          const moves = slot ? movepools[slot.pokemonId] : undefined;
          const preview = slot ? previews[keyOf(side, index)] : undefined;

          if (!slot || !option) {
            return (
              <button
                key={`${side}-${index}`}
                type="button"
                onClick={() => onPick(index)}
                className="flex min-h-[8rem] flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.03] p-3 text-xs text-muted transition hover:bg-white/[0.06] hover:text-ink"
              >
                {interpolate(dict.teams.slot, { n: index + 1 })}
                <span>{dict.teams.addPokemon}</span>
              </button>
            );
          }

          return (
            <div key={`${side}-${index}`} className="rounded-2xl bg-white/[0.04] p-2.5">
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => onPick(index)} className="shrink-0">
                  <PokemonIcon file={option.iconFile} alt={option.nameEn} size={36} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">
                    {locale === 'fr' ? option.nameFr : option.nameEn}
                  </div>
                  {preview ? (
                    <div
                      className={cn(
                        'text-[10px] font-semibold',
                        preview.eligible ? 'text-muted' : 'text-danger',
                      )}
                      // le motif exact vaut mieux qu'un simple « non éligible »
                      title={
                        preview.eligible
                          ? undefined
                          : preview.reasons.includes('cp')
                            ? dict.simulation.overCp
                            : dict.teams.ineligible
                      }
                    >
                      {dict.common.level} {preview.level} · {preview.cp} {dict.common.cp}
                      {preview.eligible ? '' : ' ⚠'}
                    </div>
                  ) : null}
                  <TypeBadges types={option.types} locale={locale} className="mt-0.5" />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(index, null)}
                  className="rounded-lg p-1 text-muted transition hover:text-danger"
                  aria-label={dict.teams.remove}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <SlotStats
                slot={slot}
                option={option}
                preview={preview}
                onChange={(next) => onChange(index, next)}
              />

              {option.shadowEligible ? (
                <label className="mt-1.5 flex items-center gap-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={slot.isShadow ?? false}
                    onChange={(event) =>
                      onChange(index, { ...slot, isShadow: event.target.checked })
                    }
                  />
                  <span className="text-muted">{dict.common.shadow}</span>
                </label>
              ) : null}

              <div className="mt-2">
                <Dropdown
                  size="sm"
                  value={slot.fastMoveId ?? ''}
                  placeholder={dict.common.fastMove}
                  onChange={(value) => onChange(index, { ...slot, fastMoveId: value || null })}
                  options={moveOptions(moves?.fast ?? [], locale)}
                />
              </div>
              {(['charged1Id', 'charged2Id'] as const).map((key) => (
                <div key={key} className="mt-1">
                  <Dropdown
                    size="sm"
                    value={slot[key] ?? ''}
                    placeholder={dict.common.chargedMoves}
                    onChange={(value) => onChange(index, { ...slot, [key]: value || null })}
                    options={moveOptions(moves?.charged ?? [], locale, dict.common.none)}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * PC et IV d'un emplacement, éditables sans passer par une équipe enregistrée.
 * On saisit un PC — c'est ainsi qu'on lit un Pokémon en jeu — et on retient le
 * niveau le plus haut qui tient dessous.
 */
function SlotStats({
  slot,
  option,
  preview,
  onChange,
}: {
  slot: SimulationSlot;
  option: TeamPokemonOption;
  preview: SlotPreview | undefined;
  onChange: (next: SimulationSlot) => void;
}) {
  const { dict } = useT();
  const base = { atk: option.baseAtk, def: option.baseDef, hp: option.baseHp };
  const ivs = {
    atk: slot.ivAtk ?? preview?.ivs.atk ?? 15,
    def: slot.ivDef ?? preview?.ivs.def ?? 15,
    hp: slot.ivHp ?? preview?.ivs.hp ?? 15,
  };
  const level = slot.level ?? preview?.level ?? 40;
  const currentCp = calcCP(base, ivs, level);
  const [cpDraft, setCpDraft] = useState(String(currentCp));
  useEffect(() => setCpDraft(String(currentCp)), [currentCp]);

  const applyCp = (value: string) => {
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) {
      setCpDraft(String(currentCp));
      return;
    }
    const found = levelForCp(base, ivs, target);
    onChange({ ...slot, level: found.level, ivAtk: ivs.atk, ivDef: ivs.def, ivHp: ivs.hp });
  };

  const setIv = (key: 'ivAtk' | 'ivDef' | 'ivHp', value: number) =>
    onChange({
      ...slot,
      level,
      ivAtk: ivs.atk,
      ivDef: ivs.def,
      ivHp: ivs.hp,
      [key]: Math.max(0, Math.min(15, Math.round(value))),
    });

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <label className="flex items-center gap-1">
          <span className="text-muted">{dict.common.cp}</span>
          <input
            type="number"
            min={10}
            max={9999}
            step={10}
            value={cpDraft}
            onChange={(event) => setCpDraft(event.target.value)}
            onBlur={() => applyCp(cpDraft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyCp(cpDraft);
            }}
            className="w-16 rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-right outline-none"
          />
        </label>
        <span className="whitespace-nowrap text-muted">
          {dict.common.levelShort} {level}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted">{dict.teams.ivs}</span>
        {(['ivAtk', 'ivDef', 'ivHp'] as const).map((key) => (
          <input
            key={key}
            type="number"
            min={0}
            max={15}
            value={key === 'ivAtk' ? ivs.atk : key === 'ivDef' ? ivs.def : ivs.hp}
            onChange={(event) => setIv(key, Number(event.target.value))}
            className="w-11 rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-right outline-none"
          />
        ))}
      </div>
    </>
  );
}

/**
 * Enregistre la composition courante comme équipe.
 *
 * On reprend le niveau et les IV affichés : ce qu'on a simulé doit être ce
 * qu'on retrouve dans l'équipe, sinon l'aller-retour ne veut rien dire.
 */
function SaveTeamDialog({
  slots,
  leagueKey,
  onClose,
}: {
  slots: Slot[];
  leagueKey: string;
  onClose: () => void;
}) {
  const { dict } = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) {
      setError(dict.common.required);
      return;
    }
    const members = slots.flatMap((slot, index) =>
      slot
        ? [{
            slot: index,
            pokemonId: slot.pokemonId,
            isShadow: slot.isShadow ?? false,
            isShiny: false,
            level: slot.level ?? 40,
            ivAtk: slot.ivAtk ?? 15,
            ivDef: slot.ivDef ?? 15,
            ivHp: slot.ivHp ?? 15,
            fastMoveId: slot.fastMoveId ?? null,
            charged1Id: slot.charged1Id ?? null,
            charged2Id: slot.charged2Id ?? null,
          }]
        : [],
    );
    startTransition(async () => {
      const result = await createTeam({
        name: name.trim(),
        color: '#5b9cff',
        leagueKey,
        notes: null,
        isPublic: false,
        members,
      });
      if (!result.ok) {
        setError(
          result.error === 'UNAUTHORIZED' ? dict.teams.loginToCreate : dict.common.empty,
        );
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="pop w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1c212c] to-[#141821] p-5 shadow-[0_40px_80px_-30px_rgba(0,0,0,1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold">{dict.simulation.saveTeam}</h2>
        <Label>{dict.teams.name}</Label>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          maxLength={60}
        />
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            {dict.common.cancel}
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? dict.teams.saving : dict.common.save}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Barre de taux de victoire : verte au-dessus de 50 %, rouge en dessous. */
function WinBar({ rate }: { rate: number }) {
  const percent = Math.round(rate * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${percent}%`,
            background: percent >= 50 ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums">{percent} %</span>
    </div>
  );
}

function Report({ report, locale }: { report: SimulationReport; locale: Locale }) {
  const { dict } = useT();
  const { sweep, matchups, teamA, teamB } = report;
  const nameOf = (list: typeof teamA, speciesId: string) => {
    const entry = list.find((row) => row.speciesId === speciesId);
    return entry ? (locale === 'fr' ? entry.nameFr : entry.nameEn) : speciesId;
  };
  const strategyLabel = (strategy: { shields: string; switching: string }) =>
    `${strategy.shields === 'early' ? dict.simulation.shieldEarly : dict.simulation.shieldLate} · ` +
    `${strategy.switching === 'stay' ? dict.simulation.switchStay : dict.simulation.switchReactive}`;

  return (
    <div className="mt-8">
      <Card className="mb-6 p-5">
        <ColumnLabel>{dict.simulation.winRate}</ColumnLabel>
        <div className="mt-1 text-4xl font-extrabold">
          {Math.round(sweep.winRate * 100)} %
        </div>
        <p className="mt-1 text-xs text-muted">
          {interpolate(dict.simulation.battles, { n: sweep.battles })} · {dict.simulation.hint}
        </p>
        <p className="mt-2 text-[11px] leading-snug text-muted">{dict.simulation.limits}</p>
      </Card>

      <Section title={dict.simulation.byLead}>
        <Card className="overflow-x-auto p-1">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2"><ColumnLabel>{dict.simulation.lead} A</ColumnLabel></th>
                <th className="px-3 py-2"><ColumnLabel>{dict.simulation.lead} B</ColumnLabel></th>
                <th className="px-3 py-2"><ColumnLabel>{dict.simulation.winRate}</ColumnLabel></th>
              </tr>
            </thead>
            <tbody>
              {sweep.byLead.map((row) => (
                <tr key={`${row.leadA}-${row.leadB}`} className="odd:bg-white/[0.02]">
                  <td className="px-3 py-1.5">
                    {locale === 'fr' ? teamA[row.leadA]?.nameFr : teamA[row.leadA]?.nameEn}
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {locale === 'fr' ? teamB[row.leadB]?.nameFr : teamB[row.leadB]?.nameEn}
                  </td>
                  <td className="px-3 py-1.5"><WinBar rate={row.winRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={dict.simulation.byStrategy}>
          <Card className="flex flex-col gap-2 p-4">
            {sweep.byStrategy.map((row) => (
              <div key={strategyLabel(row.strategy)}>
                <div className="mb-1 text-xs text-muted">{strategyLabel(row.strategy)}</div>
                <WinBar rate={row.winRate} />
              </div>
            ))}
          </Card>
        </Section>

        <Section title={dict.simulation.matchups}>
          <Card className="flex flex-col gap-1.5 p-4">
            {matchups.matchups.map((row) => (
              <div key={`${row.a}-${row.b}`} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate font-medium">{nameOf(teamA, row.a)}</span>
                <span className="text-muted">vs</span>
                <span className="w-24 truncate text-muted">{nameOf(teamB, row.b)}</span>
                <span className="flex-1">
                  <WinBar rate={row.winRate} />
                </span>
              </div>
            ))}
          </Card>
        </Section>
      </div>
    </div>
  );
}

const MAX_RESULTS = 60;

function PokemonPicker({
  locale,
  onSelect,
  onClose,
}: {
  locale: Locale;
  onSelect: (option: TeamPokemonOption) => void;
  onClose: () => void;
}) {
  const { dict } = useT();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TeamPokemonOption[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
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
            onChange={(event) => setQuery(event.target.value)}
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
