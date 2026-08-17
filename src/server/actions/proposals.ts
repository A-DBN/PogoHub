'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { getCurrentUser, hasRole } from '@/server/auth/session';
import {
  requiredApprovals,
  requiredRejections,
  withoutDuplicateCharged,
} from '@/lib/pogo/proposals';
import { calcStats, rank1 } from '@/lib/pogo/stats';
import type { MetaDictionaries, MetaRow } from '@/server/queries/meta';

export type ProposalResult =
  | { ok: true; status?: string; id?: string }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'OWN_VOTE' | 'CLOSED' | 'EMPTY';
      /**
       * Ce qui cloche exactement, en clair. Sans lui, un refus « INVALID » laisse
       * le contributeur devant un bouton qui ne réagit pas.
       */
      detail?: string;
    };

const changeSchema = z
  .object({
    speciesId: z.string().min(1),
    /** UPDATE couvre aussi le réordonnancement : l'ordre, c'est le rang. */
    kind: z.enum(['UPDATE', 'ADD', 'REMOVE']).default('UPDATE'),
    rank: z.number().int().min(1).max(2000).nullable().default(null),
    score: z.number().min(0).max(100).nullable().default(null),
    /** `[rapide, chargée 1, chargée 2]`. */
    moveset: z.array(z.string()).max(3).nullable().default(null),
    /** `[niveau, atk, def, pv]` : spread rang 1 corrigé à la main. */
    ivs: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().default(null),
  })
  .superRefine((change, ctx) => {
    // Un Pokémon ne porte pas deux fois la même chargée. L'interface l'empêche
    // déjà, mais rien ne garantit que la charge vienne de l'interface.
    const charged = (change.moveset ?? []).slice(1).filter(Boolean);
    if (new Set(charged).size !== charged.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['moveset'],
        message: `deux fois la même attaque chargée sur ${change.speciesId}`,
      });
    }
  });

const changesetSchema = z.object({
  leagueKey: z.string().min(1),
  category: z.enum(['OVERALL', 'LEADS', 'CLOSERS', 'SWITCHES', 'CHARGERS', 'ATTACKERS']),
  reason: z.string().trim().min(10).max(1000),
  changes: z.array(changeSchema).min(1).max(200),
});

export type ChangesetInput = z.input<typeof changesetSchema>;

/** Ligne prête pour la base ; typée à part, l'inférence de `flatMap` s'y perd. */
type ChangeRow = {
  pokemonId: string;
  kind: 'UPDATE' | 'ADD' | 'REMOVE';
  rank: number | null;
  score: number | null;
  moveset?: object;
  ivs?: object;
  beforeRank: number | null;
  beforeScore: number | null;
  beforeMoveset?: object;
  beforeIvs?: object;
};

/**
 * Envoie en une fois toutes les corrections faites sur la liste.
 *
 * L'état actuel de chaque ligne est figé dans `before*` au dépôt : c'est lui qui
 * sert de récapitulatif aux relecteurs, et il resterait juste même si une
 * ingestion PvPoke passait avant la validation.
 */
export async function submitChangeset(input: ChangesetInput): Promise<ProposalResult> {
  try {
    return await runChangeset(input);
  } catch (error) {
    // Une exception ici remontait en 500 et le contributeur voyait un bouton
    // sans effet : on la rend visible plutôt que de la laisser au journal.
    return {
      ok: false,
      error: 'INVALID',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runChangeset(input: ChangesetInput): Promise<ProposalResult> {
  const user = await getCurrentUser();
  if (!hasRole(user, 'CONTRIBUTOR')) return { ok: false, error: 'FORBIDDEN' };

  const parsed = changesetSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: 'INVALID',
      detail: `${first.path.join('.') || 'changeset'} : ${first.message}`,
    };
  }
  const data = parsed.data;

  const league = await prisma.league.findUnique({
    where: { key: data.leagueKey },
    select: { id: true },
  });
  if (!league) return { ok: false, error: 'NOT_FOUND' };

  const pokemon = await prisma.pokemon.findMany({
    where: { speciesId: { in: data.changes.map((change) => change.speciesId) } },
    select: { id: true, speciesId: true },
  });
  const idBySpecies = new Map(pokemon.map((row) => [row.speciesId, row.id]));

  const entries = await prisma.metaEntry.findMany({
    where: {
      leagueId: league.id,
      category: data.category,
      pokemonId: { in: [...idBySpecies.values()] },
    },
    select: { pokemonId: true, rank: true, score: true, moveset: true, ivs: true },
  });
  const entryByPokemon = new Map(entries.map((entry) => [entry.pokemonId, entry]));

  // On ne garde que ce qui change réellement : rouvrir une ligne sans la
  // modifier ne doit pas encombrer le récapitulatif des relecteurs.
  const rows: ChangeRow[] = data.changes.flatMap((change): ChangeRow[] => {
    const pokemonId = idBySpecies.get(change.speciesId);
    if (!pokemonId) return [];
    const before = entryByPokemon.get(pokemonId);

    // Retrait : rien à comparer, seul l'état d'avant compte pour le récapitulatif.
    if (change.kind === 'REMOVE') {
      if (!before) return [];
      return [{
        pokemonId,
        kind: 'REMOVE',
        rank: null, score: null, moveset: undefined,
        beforeRank: before.rank,
        beforeScore: before.score,
        beforeMoveset: (before.moveset as object | null) ?? undefined,
        beforeIvs: (before.ivs as object | null) ?? undefined,
      }];
    }

    // Ajout : l'espèce ne doit pas déjà figurer dans ce classement.
    if (change.kind === 'ADD') {
      if (before) return [];
      return [{
        pokemonId,
        kind: 'ADD',
        rank: change.rank,
        score: change.score,
        moveset: change.moveset ?? undefined,
        ivs: change.ivs ?? undefined,
        beforeRank: null, beforeScore: null, beforeMoveset: undefined,
      }];
    }

    const rankChanged = change.rank != null && change.rank !== before?.rank;
    const scoreChanged = change.score != null && change.score !== before?.score;
    const movesetChanged =
      change.moveset != null &&
      JSON.stringify(change.moveset) !== JSON.stringify(before?.moveset ?? null);
    const ivsChanged =
      change.ivs != null &&
      JSON.stringify(change.ivs) !== JSON.stringify(before?.ivs ?? null);
    if (!rankChanged && !scoreChanged && !movesetChanged && !ivsChanged) return [];
    return [
      {
        pokemonId,
        kind: 'UPDATE',
        rank: rankChanged ? change.rank : null,
        score: scoreChanged ? change.score : null,
        moveset: movesetChanged ? (change.moveset ?? undefined) : undefined,
        ivs: ivsChanged ? (change.ivs ?? undefined) : undefined,
        beforeRank: before?.rank ?? null,
        beforeScore: before?.score ?? null,
        beforeMoveset: (before?.moveset as object | null) ?? undefined,
        beforeIvs: (before?.ivs as object | null) ?? undefined,
      },
    ];
  });

  if (!rows.length) return { ok: false, error: 'EMPTY' };

  // Un lot ne peut porter qu'une ligne par Pokémon : la table l'impose, et sans
  // ce repli la contrainte remontait en 500 que le client n'affichait pas.
  // Retirer ou ajouter prime sur modifier — les deux décrivent la ligne entière.
  const weight = { REMOVE: 2, ADD: 2, UPDATE: 1 } as const;
  const byPokemon = new Map<string, ChangeRow>();
  for (const row of rows) {
    const kept = byPokemon.get(row.pokemonId);
    if (!kept || weight[row.kind] > weight[kept.kind]) byPokemon.set(row.pokemonId, row);
  }
  const deduped = [...byPokemon.values()];

  const proposal = await prisma.metaProposal.create({
    data: {
      leagueId: league.id,
      category: data.category,
      reason: data.reason,
      authorId: user!.id,
      changes: { create: deduped },
    },
    select: { id: true },
  });

  revalidatePath('/[locale]/meta-admin', 'page');
  return { ok: true, id: proposal.id };
}

/**
 * Vote d'un pair sur un lot. Au seuil atteint, toutes les corrections sont
 * appliquées **et** une nouvelle version du classement est créée, dans une seule
 * transaction : deux votes simultanés ne peuvent pas produire deux versions.
 */
export async function voteProposal(
  proposalId: string,
  value: 'APPROVE' | 'REJECT',
  comment?: string,
): Promise<ProposalResult> {
  const user = await getCurrentUser();
  if (!hasRole(user, 'CONTRIBUTOR')) return { ok: false, error: 'FORBIDDEN' };

  const proposal = await prisma.metaProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true, status: true, authorId: true, leagueId: true, category: true, reason: true,
      changes: {
        select: {
          pokemonId: true, kind: true, rank: true, score: true, moveset: true, ivs: true,
        },
      },
    },
  });
  if (!proposal) return { ok: false, error: 'NOT_FOUND' };
  if (proposal.status !== 'PENDING') return { ok: false, error: 'CLOSED' };
  // on ne valide pas son propre lot : c'est tout l'intérêt de la relecture
  if (proposal.authorId === user!.id) return { ok: false, error: 'OWN_VOTE' };

  await prisma.metaProposalVote.upsert({
    where: { proposalId_userId: { proposalId, userId: user!.id } },
    create: { proposalId, userId: user!.id, value, comment: comment || null },
    update: { value, comment: comment || null },
  });

  const votes = await prisma.metaProposalVote.findMany({
    where: { proposalId },
    select: { value: true },
  });
  const approvals = votes.filter((vote) => vote.value === 'APPROVE').length;
  const rejections = votes.filter((vote) => vote.value === 'REJECT').length;

  // Le seuil suit la taille de l'équipe de relecture, auteur exclu : il ne peut
  // pas se valider lui-même, il ne compte donc pas parmi les relecteurs.
  const reviewers = await prisma.user.count({
    where: { role: { in: ['CONTRIBUTOR', 'ADMIN'] }, id: { not: proposal.authorId } },
  });

  let status: string = 'PENDING';

  if (approvals >= requiredApprovals(reviewers)) {
    await prisma.$transaction(async (tx) => {
      // la version précédente cesse d'être courante
      await tx.metaSnapshot.updateMany({
        where: { leagueId: proposal.leagueId, isCurrent: true },
        data: { isCurrent: false },
      });
      const snapshot = await tx.metaSnapshot.create({
        data: {
          leagueId: proposal.leagueId,
          source: 'MANUAL',
          isCurrent: true,
          notes: proposal.reason,
        },
        select: { id: true },
      });

      // Retraits, puis modifications, puis ajouts : un ajout décale les rangs
      // suivants, il doit donc passer après ceux qui portent un rang explicite.
      const order = { REMOVE: 0, UPDATE: 1, ADD: 2 } as const;
      const ordered = [...proposal.changes].sort((a, b) => order[a.kind] - order[b.kind]);

      for (const change of ordered) {
        const key = {
          leagueId_category_pokemonId: {
            leagueId: proposal.leagueId,
            category: proposal.category,
            pokemonId: change.pokemonId,
          },
        };

        if (change.kind === 'REMOVE') {
          await tx.metaEntry.deleteMany({
            where: {
              leagueId: proposal.leagueId,
              category: proposal.category,
              pokemonId: change.pokemonId,
            },
          });
          continue;
        }

        // marque l'entrée comme éditée à la main : l'ingestion la respecte
        const edited = {
          isOverride: true,
          source: 'MANUAL' as const,
          editedById: proposal.authorId,
          snapshotId: snapshot.id,
        };

        if (change.kind === 'ADD') {
          // On libère la place avant d'insérer : deux lignes au même rang
          // rendraient la renumérotation qui suit arbitraire.
          if (change.rank != null) {
            await tx.metaEntry.updateMany({
              where: {
                leagueId: proposal.leagueId,
                category: proposal.category,
                rank: { gte: change.rank },
              },
              data: { rank: { increment: 1 } },
            });
          }
          await tx.metaEntry.create({
            data: {
              leagueId: proposal.leagueId,
              category: proposal.category,
              pokemonId: change.pokemonId,
              rank: change.rank ?? 999,
              // pas de note : la ligne n'a pas été simulée par PvPoke
              score: change.score,
              moveset: withoutDuplicateCharged(change.moveset) ?? [],
              ...(change.ivs ? { ivs: change.ivs } : {}),
              ...edited,
            },
          });
          continue;
        }

        await tx.metaEntry.update({
          where: key,
          data: {
            ...(change.rank != null ? { rank: change.rank } : {}),
            ...(change.score != null ? { score: change.score } : {}),
            ...(change.moveset
              ? { moveset: withoutDuplicateCharged(change.moveset) ?? [] }
              : {}),
            ...(change.ivs ? { ivs: change.ivs } : {}),
            ...edited,
          },
        });
      }

      // Le rang est un ordre : après un retrait ou une insertion on le
      // renumérote 1..N, sinon la liste garde des trous là où une ligne a
      // disparu. Seules les lignes réellement déplacées sont écrites.
      const remaining = await tx.metaEntry.findMany({
        where: { leagueId: proposal.leagueId, category: proposal.category },
        orderBy: { rank: 'asc' },
        select: { id: true, rank: true },
      });
      for (const [index, entry] of remaining.entries()) {
        if (entry.rank === index + 1) continue;
        await tx.metaEntry.update({ where: { id: entry.id }, data: { rank: index + 1 } });
      }

      await tx.metaProposal.update({
        where: { id: proposalId },
        data: {
          status: 'APPLIED',
          decidedAt: new Date(),
          appliedAt: new Date(),
          snapshotId: snapshot.id,
        },
      });
    });
    status = 'APPLIED';
  } else if (rejections >= requiredRejections(reviewers)) {
    await prisma.metaProposal.update({
      where: { id: proposalId },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    status = 'REJECTED';
  }

  revalidatePath('/[locale]/meta-admin', 'page');
  revalidatePath('/[locale]/list', 'page');
  return { ok: true, status };
}

/**
 * Recherche un Pokémon absent du classement, pour l'ajouter à un lot.
 *
 * La ligne est construite ici, complète : une ligne fabriquée à moitié côté
 * client faisait planter le tableau, qui attend `types`, `charged`, `evolution`…
 * Les stats sont celles du rang 1 de la ligue, comme pour les autres lignes.
 */
export async function searchMetaCandidates(
  query: string,
  leagueKey: string,
  category: string,
): Promise<{ rows: MetaRow[]; moves: MetaDictionaries['moves'] }> {
  const empty = { rows: [], moves: {} };
  const trimmed = query.trim();
  if (trimmed.length < 2) return empty;

  const league = await prisma.league.findUnique({
    where: { key: leagueKey },
    select: { id: true, cpLimit: true },
  });
  if (!league) return empty;

  // On cherche d'abord les Pokémon, puis on écarte ceux déjà classés. L'inverse
  // — charger les 500 entrées du classement pour un `notIn` — coûtait plusieurs
  // secondes avant d'afficher la moindre suggestion.
  const rows = await prisma.pokemon.findMany({
    where: {
      released: true,
      OR: [
        { nameFr: { contains: trimmed, mode: 'insensitive' } },
        { nameEn: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ dex: 'asc' }],
    take: 20,
    select: {
      id: true, speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
      isShadow: true, dex: true, iconFile: true, types: true,
      baseAtk: true, baseDef: true, baseHp: true, defaultIvs: true,
      // movepool JcJ : sans lui, la ligne ajoutée n'offre aucune attaque à choisir
      moves: {
        select: {
          move: { select: { moveId: true, nameFr: true, nameEn: true, type: true, kind: true } },
        },
      },
    },
  });

  const alreadyRanked = new Set(
    (
      await prisma.metaEntry.findMany({
        where: {
          leagueId: league.id,
          category: category as never,
          pokemonId: { in: rows.map((row) => row.id) },
        },
        select: { pokemonId: true },
      })
    ).map((entry) => entry.pokemonId),
  );

  // Les noms d'attaques voyagent à part, comme pour la liste : la ligne ne
  // porte que des identifiants.
  const moveDictionary: MetaDictionaries['moves'] = {};

  const built = rows.flatMap((row) => {
    if (alreadyRanked.has(row.id)) return [];
    const base = { atk: row.baseAtk, def: row.baseDef, hp: row.baseHp };
    const spreads = (row.defaultIvs ?? null) as Record<string, number[]> | null;
    const key = league.cpLimit == null ? 'cp10000' : `cp${league.cpLimit}`;
    const spread = spreads?.[key];
    const line = spread
      ? calcStats(base, { atk: spread[1], def: spread[2], hp: spread[3] }, spread[0])
      : rank1(base, league.cpLimit);

    const movepool = row.moves.map((entry) => entry.move);
    for (const move of movepool) {
      moveDictionary[move.moveId] = {
        nameFr: move.nameFr, nameEn: move.nameEn, type: move.type,
      };
    }
    const fast = movepool.filter((move) => move.kind === 'FAST').map((move) => move.moveId);
    const charged = movepool.filter((move) => move.kind === 'CHARGED').map((move) => move.moveId);

    return [{
      id: `new-${row.speciesId}`,
      rank: 0, // remplacé par la position choisie
      score: null, // affiché « — » : hors classement PvPoke
      speciesId: row.speciesId,
      nameFr: row.nameFr,
      nameEn: row.nameEn,
      form: row.form,
      formFr: row.formFr,
      isShadow: row.isShadow,
      dex: row.dex,
      iconFile: row.iconFile,
      types: row.types,
      level: line.level,
      ivs: [line.ivs.atk, line.ivs.def, line.ivs.hp] as [number, number, number],
      cp: line.cp,
      atk: line.atk,
      def: line.def,
      hp: line.hp,
      statProduct: line.statProduct,
      base: [row.baseAtk, row.baseDef, row.baseHp] as [number, number, number],
      fast: fast[0] ? { id: fast[0] } : null,
      charged: charged.slice(0, 2).map((id) => ({ id })),
      // tout le movepool sert d'alternatives : il n'y a pas d'usage PvPoke
      // pour un Pokémon absent du classement
      altFast: fast.map((id) => ({ id })),
      altCharged: charged.map((id) => ({ id })),
      evolution: [],
    } satisfies MetaRow];
  });

  return { rows: built, moves: moveDictionary };
}

/** L'auteur retire son lot tant qu'il n'est pas tranché. */
export async function withdrawProposal(proposalId: string): Promise<ProposalResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'FORBIDDEN' };

  const { count } = await prisma.metaProposal.updateMany({
    where: { id: proposalId, authorId: user.id, status: 'PENDING' },
    data: { status: 'WITHDRAWN', decidedAt: new Date() },
  });
  if (!count) return { ok: false, error: 'NOT_FOUND' };

  revalidatePath('/[locale]/meta-admin', 'page');
  return { ok: true, status: 'WITHDRAWN' };
}
