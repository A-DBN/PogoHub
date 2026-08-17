import 'server-only';
import { prisma } from '@/server/db';
import { isOfferedForTrade, type TradeStatus } from '@/lib/pogo/trade';

export type TradeSpecies = {
  pokemonId: string;
  speciesId: string;
  nameFr: string;
  nameEn: string;
  iconFile: string;
  shinyIconFile: string | null;
  /** Exemplaires possédés : deux, c'est un doublon cessible. */
  count: number;
};

export type TradeListView = {
  username: string;
  note: string | null;
  open: boolean;
  hasFriendCode: boolean;
  entries: TradeSpecies[];
};

/**
 * Liste d'échange d'un joueur.
 *
 * Elle n'est pas stockée telle quelle : `forTrade` peut valoir `null`, auquel
 * cas la règle du compte décide. On applique donc `isOfferedForTrade` ici, à la
 * lecture, pour que la liste suive les compteurs sans rien avoir à réécrire.
 */
export async function getTradeList(username: string): Promise<TradeListView | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, tradeNote: true, tradeOpen: true,
      friendCode: true, friendCodePublic: true, autoTradeFrom: true,
    },
  });
  if (!user?.username) return null;

  const rows = await prisma.collectionEntry.findMany({
    where: { userId: user.id, shinyCaught: true },
    select: {
      forTrade: true, shinyCount: true,
      pokemon: {
        select: {
          id: true, speciesId: true, nameFr: true, nameEn: true,
          iconFile: true, shinyIconFile: true, dex: true,
        },
      },
    },
    orderBy: { pokemon: { dex: 'asc' } },
  });

  return {
    username: user.username,
    note: user.tradeNote,
    open: user.tradeOpen,
    // le code lui-même n'est pas renvoyé ici : seul compte le fait qu'il existe
    hasFriendCode: Boolean(user.friendCode),
    entries: rows
      .filter((row) => isOfferedForTrade(row.forTrade, row.shinyCount, user.autoTradeFrom))
      .map((row) => ({
        pokemonId: row.pokemon.id,
        speciesId: row.pokemon.speciesId,
        nameFr: row.pokemon.nameFr,
        nameEn: row.pokemon.nameEn,
        iconFile: row.pokemon.iconFile,
        shinyIconFile: row.pokemon.shinyIconFile,
        count: row.shinyCount || 1,
      })),
  };
}

export type TradePartyView = {
  username: string | null;
  /** Visible seulement une fois l'échange accordé : il sert alors à se trouver. */
  friendCode: string | null;
  done: boolean;
};

export type TradeView = {
  id: string;
  status: TradeStatus;
  /** Rôle de la personne qui regarde, pas une propriété de l'échange. */
  role: 'requester' | 'owner';
  me: TradePartyView;
  peer: TradePartyView;
  /** Ce que le demandeur reçoit. */
  wanted: TradeSpecies;
  /** Ce que le propriétaire reçoit ; nul tant qu'il n'a pas choisi. */
  offered: TradeSpecies | null;
  createdAt: string;
};

const SPECIES_SELECT = {
  id: true, speciesId: true, nameFr: true, nameEn: true,
  iconFile: true, shinyIconFile: true,
} as const;

type RawSpecies = {
  id: string; speciesId: string; nameFr: string; nameEn: string;
  iconFile: string; shinyIconFile: string | null;
};

const toSpecies = (row: RawSpecies): TradeSpecies => ({
  pokemonId: row.id,
  speciesId: row.speciesId,
  nameFr: row.nameFr,
  nameEn: row.nameEn,
  iconFile: row.iconFile,
  shinyIconFile: row.shinyIconFile,
  count: 1,
});

/**
 * Les échanges d'un joueur, des deux côtés.
 *
 * Le code ami du partenaire n'est joint qu'une fois l'échange **accordé** :
 * avant, une simple demande suffirait à l'extraire d'un profil qui le garde
 * privé.
 */
export async function getMyTrades(userId: string): Promise<TradeView[]> {
  const rows = await prisma.trade.findMany({
    where: { OR: [{ requesterId: userId }, { ownerId: userId }] },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 50,
    select: {
      id: true, status: true, createdAt: true,
      requesterId: true, requesterDone: true, ownerDone: true,
      requester: { select: { username: true, friendCode: true } },
      owner: { select: { username: true, friendCode: true } },
      wanted: { select: SPECIES_SELECT },
      offered: { select: SPECIES_SELECT },
    },
  });

  return rows.map((row) => {
    const role = row.requesterId === userId ? 'requester' : 'owner';
    const settled = row.status === 'ACCEPTED' || row.status === 'COMPLETED';
    const mine = role === 'requester' ? row.requester : row.owner;
    const theirs = role === 'requester' ? row.owner : row.requester;

    return {
      id: row.id,
      status: row.status as TradeStatus,
      role,
      me: {
        username: mine.username,
        friendCode: null,
        done: role === 'requester' ? row.requesterDone : row.ownerDone,
      },
      peer: {
        username: theirs.username,
        friendCode: settled ? theirs.friendCode : null,
        done: role === 'requester' ? row.ownerDone : row.requesterDone,
      },
      wanted: toSpecies(row.wanted),
      offered: row.offered ? toSpecies(row.offered) : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
