'use client';

import { useMemo, useState } from 'react';
import { MetaTable, type Spread } from './MetaTable';
import { MetaEditBar, type PendingEdits } from './MetaEditBar';
import { insertAtPosition, moveInOrder, orderPositions } from '@/lib/pogo/proposals';
import type { MetaDictionaries, MetaRow } from '@/server/queries/meta';

/**
 * Assemble la liste méta et son mode contributeur.
 *
 * Toutes les corrections vivent ici, en mémoire, jusqu'à l'envoi : on peut
 * modifier une valeur, retirer une ligne, la déplacer ou en ajouter une, puis
 * envoyer **le lot entier** en relecture. Rien n'est écrit avant validation par
 * les pairs.
 */
export function MetaListEditor({
  rows,
  moves,
  species,
  leagueKey,
  category,
  canEdit,
  approvalsRequired,
}: {
  rows: MetaRow[];
  leagueKey: string;
  category: string;
  /** Faux pour un simple visiteur : la barre n'apparaît pas. */
  canEdit: boolean;
  approvalsRequired: number;
} & MetaDictionaries) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<PendingEdits>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<MetaRow[]>([]);
  /** Attaques des lignes ajoutées : absentes du dictionnaire de la page. */
  const [extraMoves, setExtraMoves] = useState<MetaDictionaries['moves']>({});
  /**
   * L'ordre voulu, `null` tant qu'on n'y a pas touché.
   *
   * C'est **lui** qui fait foi, pas un rang stocké ligne par ligne : le rang
   * n'est plus qu'une sortie, dérivée de la position, et ne peut donc plus
   * contredire l'ordre affiché.
   */
  const [order, setOrder] = useState<string[] | null>(null);

  const baseOrder = useMemo(() => rows.map((row) => row.speciesId), [rows]);
  const currentOrder = order ?? baseOrder;

  const reset = () => {
    setEdits({});
    setRemoved([]);
    setAdded([]);
    setExtraMoves({});
    setOrder(null);
  };

  const addAt = (row: MetaRow, rank: number, moves: MetaDictionaries['moves']) => {
    setExtraMoves((current) => ({ ...current, ...moves }));
    setAdded((current) => [...current, row]);
    setOrder((current) =>
      insertAtPosition(current ?? baseOrder, row.speciesId, rank, removed),
    );
  };

  /** Saisir un rang, c'est demander une position : la ligne s'y déplace. */
  const onEdit = (speciesId: string, field: 'rank', value: number | null) => {
    if (field !== 'rank' || value == null) return;
    setOrder((current) => insertAtPosition(current ?? baseOrder, speciesId, value, removed));
  };

  const onEditMoves = (speciesId: string, moveset: string[]) =>
    setEdits((current) => ({
      ...current,
      [speciesId]: { ...current[speciesId], moveset },
    }));

  const onEditSpread = (speciesId: string, ivs: Spread) =>
    setEdits((current) => ({
      ...current,
      [speciesId]: { ...current[speciesId], ivs },
    }));

  const onRemove = (speciesId: string) =>
    setRemoved((current) =>
      current.includes(speciesId)
        ? current.filter((id) => id !== speciesId)
        : [...current, speciesId],
    );

  const onMove = (speciesId: string, direction: -1 | 1) =>
    setOrder((current) => moveInOrder(current ?? baseOrder, speciesId, direction, removed));

  /** Rang d'origine de chaque ligne : ce à quoi la position finale se compare. */
  const originalRanks = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.speciesId, row.rank])),
    [rows],
  );

  /** La liste telle qu'elle sera après le lot, numérotée 1..N. */
  const { visible, positions } = useMemo(() => {
    if (!editing) return { visible: rows, positions: {} as Record<string, number> };

    const byId = new Map<string, MetaRow>();
    for (const row of [...rows, ...added]) byId.set(row.speciesId, row);

    const positions = orderPositions(currentOrder, removed);
    const list = currentOrder.flatMap((speciesId) => {
      const row = byId.get(speciesId);
      if (!row) return [];
      // une ligne retirée garde son ancien numéro, barré
      return [{ ...row, rank: positions[speciesId] ?? row.rank }];
    });
    return { visible: list, positions };
  }, [editing, rows, added, currentOrder, removed]);

  /** Lignes dont la position a bougé : elles partent avec un rang explicite. */
  const moved = useMemo(
    () =>
      Object.keys(positions).filter(
        (speciesId) =>
          originalRanks[speciesId] !== undefined &&
          positions[speciesId] !== originalRanks[speciesId],
      ),
    [positions, originalRanks],
  );

  return (
    <div>
      {canEdit ? (
        <MetaEditBar
          editing={editing}
          edits={edits}
          removed={removed}
          added={added}
          onToggle={() => setEditing((value) => !value)}
          onReset={reset}
          onAdd={addAt}
          positions={positions}
          moved={moved}
          leagueKey={leagueKey}
          category={category}
          approvalsRequired={approvalsRequired}
        />
      ) : null}

      <MetaTable
        rows={visible}
        moves={{ ...moves, ...extraMoves }}
        species={species}
        editing={editing}
        edits={edits}
        removed={removed}
        added={added.map((row) => row.speciesId)}
        originalRanks={originalRanks}
        onEdit={onEdit}
        onEditMoves={onEditMoves}
        onEditSpread={onEditSpread}
        onRemove={onRemove}
        onMove={onMove}
      />
    </div>
  );
}
