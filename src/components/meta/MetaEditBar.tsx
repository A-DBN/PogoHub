'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Send, X } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { searchMetaCandidates, submitChangeset } from '@/server/actions/proposals';
import type { MetaDictionaries, MetaRow } from '@/server/queries/meta';

type MoveDict = MetaDictionaries['moves'];
import { cn } from '@/lib/cn';

export type PendingEdits = Record<
  string,
  { rank?: number; score?: number; moveset?: string[]; ivs?: [number, number, number, number] }
>;

/**
 * Barre d'édition de la liste méta, réservée aux contributeurs.
 *
 * Les corrections se font directement dans le tableau ; celle-ci compte ce qui
 * a bougé et envoie **tout le lot en une fois** pour relecture. C'est le lot
 * entier que les pairs valident, pas chaque ligne isolément.
 */
/**
 * Ajout d'un Pokémon au classement, avec recherche et position d'insertion.
 *
 * La ligne complète est construite par le serveur : une ligne fabriquée
 * partiellement côté client faisait planter le tableau, qui attend `types`,
 * `charged`, `evolution`… Seuls les Pokémon **absents** du classement sont
 * proposés, un doublon serait refusé de toute façon.
 */
function AddRow({
  leagueKey,
  category,
  onAdd,
}: {
  leagueKey: string;
  category: string;
  onAdd: (row: MetaRow, rank: number, moves: MoveDict) => void;
}) {
  const { dict, locale } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MetaRow[]>([]);
  const [moveDict, setMoveDict] = useState<MoveDict>({});
  const anchorRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [picked, setPicked] = useState<MetaRow | null>(null);
  const [rank, setRank] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchMetaCandidates(query, leagueKey, category).then((result) => {
        if (cancelled) return;
        setResults(result.rows);
        setMoveDict(result.moves);
        const rect = anchorRef.current?.getBoundingClientRect();
        if (rect) setBox({ top: rect.bottom + 6, left: rect.left, width: 260 });
        setOpen(true);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, leagueKey, category, picked]);

  const confirm = () => {
    if (!picked) return;
    const position = Number(rank);
    onAdd(picked, Number.isFinite(position) && position > 0 ? position : 999, moveDict);
    setPicked(null);
    setQuery('');
    setRank('');
  };

  return (
    <div ref={anchorRef} className="relative flex items-center gap-1">
      <Input
        value={picked ? (locale === 'fr' ? picked.nameFr : picked.nameEn) : query}
        onChange={(event) => {
          setPicked(null);
          setQuery(event.target.value);
        }}
        placeholder={dict.admin.addRow}
        className="w-48"
      />

      {picked ? (
        <>
          <Input
            type="number"
            min={1}
            value={rank}
            onChange={(event) => setRank(event.target.value)}
            placeholder={dict.admin.insertAt}
            title={dict.admin.insertAtHelp}
            className="w-20"
          />
          <button
            type="button"
            onClick={confirm}
            className="rounded-lg bg-white/[0.06] p-2 transition hover:bg-white/[0.12]"
            aria-label={dict.common.add}
          >
            <Plus size={15} />
          </button>
        </>
      ) : null}

      {/* Rendu en portail : la carte parente est en `overflow-hidden`, une liste
          absolue y serait rognée et passerait sous le tableau. */}
      {open && results.length > 0 && !picked && box
        ? createPortal(
            <div
              className="pop fixed z-[120] max-h-64 overflow-y-auto rounded-xl bg-[#171b25]/97 p-1 shadow-[0_30px_70px_-24px_rgba(0,0,0,1)] backdrop-blur"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
              {results.map((row) => (
                <button
                  key={row.speciesId}
                  type="button"
                  onClick={() => {
                    setPicked(row);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-white/[0.06]"
                >
                  <PokemonIcon file={row.iconFile} alt={row.nameEn} size={24} />
                  <span className="min-w-0 flex-1 truncate">
                    {locale === 'fr' ? row.nameFr : row.nameEn}
                    {row.form ? (
                      <span className="ml-1 text-[10px] text-muted">
                        {locale === 'fr' ? (row.formFr ?? row.form) : row.form}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MetaEditBar({
  editing,
  edits,
  removed,
  added,
  onToggle,
  onReset,
  onAdd,
  positions,
  moved,
  leagueKey,
  category,
  approvalsRequired,
}: {
  editing: boolean;
  edits: PendingEdits;
  removed: string[];
  added: MetaRow[];
  onToggle: () => void;
  onReset: () => void;
  onAdd: (row: MetaRow, rank: number, moves: MoveDict) => void;
  /** Rang final de chaque ligne, numéroté depuis l'ordre affiché. */
  positions: Record<string, number>;
  /** Lignes dont la position diffère de leur rang d'origine. */
  moved: string[];
  leagueKey: string;
  category: string;
  approvalsRequired: number;
}) {
  const { dict } = useT();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * Lignes à envoyer en modification : celles dont on a changé le contenu **et**
   * celles qu'un déplacement a décalées.
   *
   * Une ligne retirée ne compte que comme retrait ; une ligne ajoutée ne compte
   * que comme ajout, ses corrections étant déjà repliées dans la charge « ADD ».
   * Sans ce second filtre, choisir les attaques d'une ligne ajoutée l'envoyait
   * deux fois, et la contrainte d'unicité du lot remontait en erreur serveur.
   */
  const updated = useMemo(() => {
    const isNew = new Set(added.map((row) => row.speciesId));
    return [...new Set([...Object.keys(edits), ...moved])].filter(
      (speciesId) => !removed.includes(speciesId) && !isNew.has(speciesId),
    );
  }, [edits, moved, removed, added]);

  const count = updated.length + removed.length + added.length;

  /** Ce que le serveur exige aussi : autant le dire avant l'aller-retour. */
  const REASON_MIN = 10;

  const submit = () => {
    setError(null);
    if (reason.trim().length < REASON_MIN) {
      setError(interpolate(dict.admin.reasonTooShort, { min: REASON_MIN }));
      return;
    }
    startTransition(async () => {
      const result = await submitChangeset({
        leagueKey,
        category: category as never,
        reason: reason.trim(),
        changes: [
          ...updated.map((speciesId) => {
            const change = edits[speciesId] ?? {};
            return {
              speciesId,
              kind: 'UPDATE' as const,
              // Déplacer une ligne en décale d'autres : chacune part avec sa
              // position finale, sinon deux lignes viseraient le même rang et
              // la renumérotation du serveur serait arbitraire.
              rank: moved.includes(speciesId) ? (positions[speciesId] ?? null) : null,
              score: change.score ?? null,
              // une chargée vide ne part pas au serveur
              moveset: change.moveset ? change.moveset.filter(Boolean) : null,
              ivs: change.ivs ?? null,
            };
          }),
          ...removed.map((speciesId) => ({
            speciesId,
            kind: 'REMOVE' as const,
            rank: null,
            score: null,
            moveset: null,
            ivs: null,
          })),
          ...added.map((row) => ({
            speciesId: row.speciesId,
            kind: 'ADD' as const,
            rank: positions[row.speciesId] ?? Math.ceil(row.rank),
            score: edits[row.speciesId]?.score ?? row.score,
            // Sans choix explicite, la ligne part avec le jeu d'attaques proposé
            // par défaut : envoyer `null` la faisait entrer au classement sans
            // aucune attaque.
            moveset:
              edits[row.speciesId]?.moveset?.filter(Boolean) ??
              [row.fast?.id, ...row.charged.map((move) => move.id)].filter(
                (id): id is string => Boolean(id),
              ),
            ivs: edits[row.speciesId]?.ivs ?? null,
          })),
        ],
      });
      if (!result.ok) {
        // Chaque refus dit *pourquoi* : « INVALID » seul laissait le contributeur
        // devant un bouton qui ne fait rien.
        const messages: Record<string, string> = {
          EMPTY: dict.admin.noChanges,
          NOT_FOUND: dict.admin.leagueMissing,
          FORBIDDEN: dict.admin.forbiddenContributor,
        };
        setError(
          messages[result.error] ??
            (result.detail
              ? interpolate(dict.admin.rejected, { detail: result.detail })
              : dict.admin.forbidden),
        );
        return;
      }
      setSent(true);
      setReason('');
      onReset();
      router.refresh();
      setTimeout(() => setSent(false), 4000);
    });
  };

  if (!editing) {
    return (
      <div className="mb-4">
        <Button type="button" variant="ghost" onClick={onToggle}>
          <Pencil size={15} />
          {dict.admin.editList}
        </Button>
        {sent ? (
          <span className="ml-3 text-sm text-success">{dict.admin.changesetSent}</span>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={cn('mb-4 p-4', count > 0 && 'ring-1 ring-warn/40')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">
          {interpolate(dict.admin.pendingChanges, { count })}
        </span>

        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={dict.admin.reasonHelp}
          className="min-w-[18rem] flex-1"
          maxLength={1000}
        />

        <AddRow leagueKey={leagueKey} category={category} onAdd={onAdd} />

        <Button type="button" onClick={submit} disabled={pending || count === 0}>
          <Send size={15} />
          {pending ? dict.teams.saving : dict.admin.submitChanges}
        </Button>

        <button
          type="button"
          onClick={() => {
            onReset();
            onToggle();
          }}
          className="rounded-lg p-2 text-muted transition hover:bg-white/[0.06] hover:text-ink"
          aria-label={dict.common.cancel}
        >
          <X size={16} />
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <p className="mt-2 text-[11px] leading-snug text-muted">
        {interpolate(dict.admin.howItWorks, { needed: approvalsRequired })}
      </p>
    </Card>
  );
}
