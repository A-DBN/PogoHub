'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import {
  can,
  counterDelta,
  isOfferedForTrade,
  nextStatus,
  type TradeAction,
  type TradeRole,
  type TradeState,
  type TradeStatus,
} from '@/lib/pogo/trade';

export type TradeResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      error:
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'NO_FRIEND_CODE'
        | 'PEER_NO_FRIEND_CODE'
        | 'NOT_FOR_TRADE'
        | 'SELF'
        | 'DUPLICATE'
        | 'INVALID';
    };

/**
 * Fixe le sort d'un chromatique : proposé (`true`), retiré (`false`), ou rendu
 * à la règle automatique du compte (`null`).
 */
export async function setForTrade(
  pokemonId: string,
  forTrade: boolean | null,
): Promise<TradeResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'UNAUTHORIZED' };

  // On ne propose que ce qu'on possède : la case ne doit pas créer l'entrée.
  const entry = await prisma.collectionEntry.findUnique({
    where: { userId_pokemonId: { userId: me.id, pokemonId } },
    select: { shinyCaught: true },
  });
  if (!entry?.shinyCaught) return { ok: false, error: 'NOT_FOR_TRADE' };

  await prisma.collectionEntry.update({
    where: { userId_pokemonId: { userId: me.id, pokemonId } },
    data: { forTrade },
  });
  revalidatePath('/[locale]/shinydex', 'page');
  revalidatePath('/[locale]/players/[username]', 'page');
  return { ok: true };
}

/**
 * Ouvre un échange en désignant un chromatique dans la liste de quelqu'un.
 *
 * Les deux joueurs doivent avoir renseigné leur code ami : sans lui, ils ne
 * peuvent pas se trouver dans le jeu, et l'échange resterait lettre morte.
 */
export async function requestTrade(
  ownerUsername: string,
  wantedPokemonId: string,
): Promise<TradeResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'UNAUTHORIZED' };

  const [mine, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id }, select: { friendCode: true } }),
    prisma.user.findUnique({
      where: { username: ownerUsername },
      select: { id: true, friendCode: true, tradeOpen: true },
    }),
  ]);
  if (!owner) return { ok: false, error: 'NOT_FOUND' };
  if (owner.id === me.id) return { ok: false, error: 'SELF' };
  if (!mine?.friendCode) return { ok: false, error: 'NO_FRIEND_CODE' };
  if (!owner.friendCode) return { ok: false, error: 'PEER_NO_FRIEND_CODE' };
  if (!owner.tradeOpen) return { ok: false, error: 'FORBIDDEN' };

  if (!(await isOffered(owner.id, wantedPokemonId))) {
    return { ok: false, error: 'NOT_FOR_TRADE' };
  }

  // Deux demandes ouvertes sur la même bête encombreraient les deux boîtes.
  const already = await prisma.trade.findFirst({
    where: {
      requesterId: me.id,
      ownerId: owner.id,
      wantedPokemonId,
      status: { in: ['REQUESTED', 'PROPOSED', 'ACCEPTED'] },
    },
    select: { id: true },
  });
  if (already) return { ok: false, error: 'DUPLICATE' };

  const trade = await prisma.trade.create({
    data: { requesterId: me.id, ownerId: owner.id, wantedPokemonId },
    select: { id: true },
  });
  revalidatePath('/[locale]/trades', 'page');
  return { ok: true, id: trade.id };
}

/**
 * Ce chromatique est-il réellement proposé par ce joueur ?
 *
 * La colonne ne suffit pas : `null` renvoie à la règle du compte. Le serveur
 * refait donc le calcul, il ne se fie pas à ce que l'écran affichait.
 */
async function isOffered(userId: string, pokemonId: string): Promise<boolean> {
  const [entry, user] = await Promise.all([
    prisma.collectionEntry.findUnique({
      where: { userId_pokemonId: { userId, pokemonId } },
      select: { forTrade: true, shinyCaught: true, shinyCount: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { autoTradeFrom: true } }),
  ]);
  if (!entry?.shinyCaught) return false;
  return isOfferedForTrade(entry.forTrade, entry.shinyCount, user?.autoTradeFrom);
}

type Loaded = {
  id: string;
  requesterId: string;
  ownerId: string;
  wantedPokemonId: string;
  offeredPokemonId: string | null;
  state: TradeState;
  role: TradeRole;
};

async function load(tradeId: string, userId: string): Promise<Loaded | null> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    select: {
      id: true, requesterId: true, ownerId: true, status: true,
      wantedPokemonId: true, offeredPokemonId: true,
      requesterDone: true, ownerDone: true,
    },
  });
  if (!trade) return null;
  if (trade.requesterId !== userId && trade.ownerId !== userId) return null;

  return {
    id: trade.id,
    requesterId: trade.requesterId,
    ownerId: trade.ownerId,
    wantedPokemonId: trade.wantedPokemonId,
    offeredPokemonId: trade.offeredPokemonId,
    state: {
      status: trade.status as TradeStatus,
      requesterDone: trade.requesterDone,
      ownerDone: trade.ownerDone,
    },
    role: trade.requesterId === userId ? 'requester' : 'owner',
  };
}

/** Le propriétaire désigne ce qu'il veut, pris dans la liste du demandeur. */
export async function chooseCounterpart(
  tradeId: string,
  offeredPokemonId: string,
): Promise<TradeResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'UNAUTHORIZED' };

  const trade = await load(tradeId, me.id);
  if (!trade) return { ok: false, error: 'NOT_FOUND' };
  if (!can(trade.state, trade.role, 'choose')) return { ok: false, error: 'FORBIDDEN' };

  if (!(await isOffered(trade.requesterId, offeredPokemonId))) {
    return { ok: false, error: 'NOT_FOR_TRADE' };
  }

  await prisma.trade.update({
    where: { id: tradeId },
    data: { offeredPokemonId, status: nextStatus(trade.state, trade.role, 'choose') },
  });
  revalidatePath('/[locale]/trades', 'page');
  return { ok: true };
}

/**
 * Applique une action simple : valider, refuser, annuler, ou confirmer que
 * l'échange a bien eu lieu en jeu.
 *
 * La dernière confirmation clôt l'échange **et** déplace les compteurs, dans
 * une seule transaction : deux clics simultanés ne peuvent pas compter deux fois.
 */
export async function actOnTrade(tradeId: string, action: TradeAction): Promise<TradeResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'UNAUTHORIZED' };
  if (action === 'choose') return { ok: false, error: 'INVALID' };

  const trade = await load(tradeId, me.id);
  if (!trade) return { ok: false, error: 'NOT_FOUND' };
  if (!can(trade.state, trade.role, action)) return { ok: false, error: 'FORBIDDEN' };

  const status = nextStatus(trade.state, trade.role, action);
  const done =
    action === 'done'
      ? {
          requesterDone: trade.state.requesterDone || trade.role === 'requester',
          ownerDone: trade.state.ownerDone || trade.role === 'owner',
        }
      : {};

  await prisma.$transaction(async (tx) => {
    const updated = await tx.trade.updateMany({
      // le statut d'origine est dans le `where` : si quelqu'un a agi entre
      // temps, la mise à jour ne touche rien et les compteurs ne bougent pas
      where: { id: tradeId, status: trade.state.status },
      data: { ...done, status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    });
    if (!updated.count || status !== 'COMPLETED' || !trade.offeredPokemonId) return;

    // Chacun cède ce qu'il donne et reçoit ce qu'il prend.
    const moves: Array<{ userId: string; given: string; received: string }> = [
      { userId: trade.requesterId, given: trade.offeredPokemonId, received: trade.wantedPokemonId },
      { userId: trade.ownerId, given: trade.wantedPokemonId, received: trade.offeredPokemonId },
    ];

    for (const move of moves) {
      for (const [pokemonId, delta] of Object.entries(
        counterDelta(move.given, move.received),
      )) {
        await tx.collectionEntry.upsert({
          where: { userId_pokemonId: { userId: move.userId, pokemonId } },
          // un chromatique reçu entre au Dex même s'il n'y était pas
          create: {
            userId: move.userId,
            pokemonId,
            owned: true,
            shinyCaught: delta > 0,
            shinyCount: Math.max(0, delta),
            caughtAt: delta > 0 ? new Date() : null,
          },
          update: {
            shinyCount: { increment: delta },
            ...(delta > 0 ? { shinyCaught: true } : {}),
          },
        });
      }
    }

    // Un compteur ne descend pas sous zéro : le Dex ne prétend pas savoir mieux
    // que le jeu combien d'exemplaires restent.
    await tx.collectionEntry.updateMany({
      where: { userId: { in: [trade.requesterId, trade.ownerId] }, shinyCount: { lt: 0 } },
      data: { shinyCount: 0 },
    });
  });

  revalidatePath('/[locale]/trades', 'page');
  revalidatePath('/[locale]/shinydex', 'page');
  return { ok: true };
}
