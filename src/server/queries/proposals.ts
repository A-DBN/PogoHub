import 'server-only';
import { prisma } from '@/server/db';
import { calcStats, rank1 } from '@/lib/pogo/stats';

export type ProposalVoteView = {
  userId: string;
  username: string | null;
  value: 'APPROVE' | 'REJECT';
  comment: string | null;
};

/** Attaque résolue : le récapitulatif montre des noms, pas des identifiants. */
export type MoveName = { moveId: string; nameFr: string; nameEn: string; type: string };

/** Ligne de stats telle qu'elle apparaîtra dans le classement. */
export type SpreadView = {
  level: number;
  ivs: [number, number, number];
  cp: number;
  atk: number;
  def: number;
  hp: number;
};

/** Une ligne du récapitulatif : avant → après, champ par champ. */
export type ChangeView = {
  kind: 'UPDATE' | 'ADD' | 'REMOVE';
  speciesId: string;
  nameFr: string;
  nameEn: string;
  formFr: string | null;
  form: string | null;
  iconFile: string;
  types: string[];
  rank: { before: number | null; after: number | null };
  score: { before: number | null; after: number | null };
  moveset: { before: MoveName[] | null; after: MoveName[] | null };
  /**
   * Stats effectives. Un ajout n'a pas d'« avant » : c'est l'« après » qui dit
   * au relecteur ce qu'il valide réellement, sans quoi la ligne n'affichait
   * qu'un nom.
   */
  spread: { before: SpreadView | null; after: SpreadView | null };
};

export type ProposalView = {
  id: string;
  status: string;
  leagueKey: string;
  leagueNameFr: string;
  leagueNameEn: string;
  category: string;
  reason: string;
  author: string | null;
  authorId: string;
  createdAt: string;
  changes: ChangeView[];
  votes: ProposalVoteView[];
  approvals: number;
  rejections: number;
};

const asMoveset = (value: unknown): string[] | null =>
  Array.isArray(value) ? (value as string[]) : null;

const asSpread = (value: unknown): number[] | null =>
  Array.isArray(value) && value.length === 4 ? (value as number[]) : null;

/**
 * Lots en attente d'abord, puis les tranchés. On ne remonte pas tout
 * l'historique : au-delà, il faudra une page dédiée.
 */
export async function getProposals(limit = 30): Promise<ProposalView[]> {
  const rows = await prisma.metaProposal.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true, status: true, category: true, reason: true, createdAt: true, authorId: true,
      league: { select: { key: true, nameFr: true, nameEn: true, cpLimit: true } },
      author: { select: { username: true } },
      changes: {
        select: {
          kind: true, rank: true, score: true, moveset: true, ivs: true,
          beforeRank: true, beforeScore: true, beforeMoveset: true, beforeIvs: true,
          pokemon: {
            select: {
              speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
              iconFile: true, types: true, baseAtk: true, baseDef: true, baseHp: true,
              defaultIvs: true,
            },
          },
        },
      },
      votes: {
        select: { userId: true, value: true, comment: true, user: { select: { username: true } } },
      },
    },
  });

  // Les attaques sont stockées par identifiant : on les résout en un seul
  // aller-retour, sinon le récapitulatif affiche « AIR_SLASH » au relecteur.
  const moveIds = new Set<string>();
  for (const row of rows) {
    for (const change of row.changes) {
      for (const id of [...(asMoveset(change.moveset) ?? []), ...(asMoveset(change.beforeMoveset) ?? [])]) {
        moveIds.add(id);
      }
    }
  }
  const moves = moveIds.size
    ? await prisma.move.findMany({
        where: { moveId: { in: [...moveIds] } },
        select: { moveId: true, nameFr: true, nameEn: true, type: true },
      })
    : [];
  const moveById = new Map(moves.map((move) => [move.moveId, move]));

  const named = (ids: string[] | null): MoveName[] | null =>
    ids?.map(
      (moveId) =>
        moveById.get(moveId) ?? { moveId, nameFr: moveId, nameEn: moveId, type: 'normal' },
    ) ?? null;

  return rows.map((row) => ({
    id: row.id,
    leagueKey: row.league.key,
    leagueNameFr: row.league.nameFr,
    leagueNameEn: row.league.nameEn,
    status: row.status,
    category: row.category,
    reason: row.reason,
    author: row.author.username,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    changes: row.changes.map((change) => {
      const p = change.pokemon;
      const base = { atk: p.baseAtk, def: p.baseDef, hp: p.baseHp };
      const cpLimit = row.league.cpLimit;

      /**
       * Sans spread explicite, la ligne prendra celui que le classement
       * calcule : c'est donc lui qu'il faut montrer, pas une case vide.
       */
      const view = (raw: number[] | null, fallback: boolean): SpreadView | null => {
        if (!raw && !fallback) return null;
        const line = raw
          ? calcStats(base, { atk: raw[1], def: raw[2], hp: raw[3] }, raw[0])
          : rank1(base, cpLimit);
        return {
          level: line.level,
          ivs: [line.ivs.atk, line.ivs.def, line.ivs.hp],
          cp: line.cp,
          atk: Math.round(line.atk * 10) / 10,
          def: Math.round(line.def * 10) / 10,
          hp: line.hp,
        };
      };

      return {
        kind: change.kind,
        speciesId: p.speciesId,
        nameFr: p.nameFr,
        nameEn: p.nameEn,
        form: p.form,
        formFr: p.formFr,
        iconFile: p.iconFile,
        types: p.types,
        rank: { before: change.beforeRank, after: change.rank },
        score: { before: change.beforeScore, after: change.score },
        moveset: {
          before: named(asMoveset(change.beforeMoveset)),
          after: named(asMoveset(change.moveset)),
        },
        spread: {
          before: view(asSpread(change.beforeIvs), change.kind !== 'ADD'),
          after: view(asSpread(change.ivs), change.kind === 'ADD'),
        },
      };
    }),
    votes: row.votes.map((vote) => ({
      userId: vote.userId,
      username: vote.user.username,
      value: vote.value,
      comment: vote.comment,
    })),
    approvals: row.votes.filter((vote) => vote.value === 'APPROVE').length,
    rejections: row.votes.filter((vote) => vote.value === 'REJECT').length,
  }));
}
