import 'server-only';
import { prisma } from '@/server/db';
import { calcStats } from '@/lib/pogo/stats';
import { defensiveProfile, effectivenessAgainst, TYPES, type PokemonType } from '@/lib/pogo/types';

const MEMBER_SELECT = {
  id: true, slot: true, isShadow: true, isShiny: true,
  level: true, ivAtk: true, ivDef: true, ivHp: true,
  fastMoveId: true, charged1Id: true, charged2Id: true,
  pokemon: {
    select: {
      id: true, speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
      // `dex` et `tags` servent aux filtres de coupe : l'éditeur juge
      // l'éligibilité sur place, il lui faut de quoi le faire
      types: true, dex: true, tags: true, iconFile: true, shinyIconFile: true,
      shadowEligible: true, baseAtk: true, baseDef: true, baseHp: true,
    },
  },
} as const;

const TEAM_SELECT = {
  id: true, name: true, color: true, notes: true, isPublic: true, shareSlug: true,
  createdAt: true, updatedAt: true,
  league: { select: { key: true, nameFr: true, nameEn: true, cpLimit: true, color: true } },
  user: { select: { username: true } },
  members: { orderBy: { slot: 'asc' }, select: MEMBER_SELECT },
} as const;

export type TeamMemberView = {
  id: string;
  slot: number;
  isShadow: boolean;
  isShiny: boolean;
  level: number;
  ivs: { atk: number; def: number; hp: number };
  pokemon: {
    id: string; speciesId: string; nameFr: string; nameEn: string;
    form: string | null; formFr: string | null;
    types: string[]; dex: number; tags: string[];
    iconFile: string; shinyIconFile: string | null;
    shadowEligible: boolean;
    baseAtk: number; baseDef: number; baseHp: number;
  };
  stats: { atk: number; def: number; hp: number; cp: number; statProduct: number };
  moves: {
    fast: MoveView | null;
    charged: MoveView[];
  };
};

export type MoveView = {
  moveId: string; nameFr: string; nameEn: string; type: string; kind: string;
};

export type TeamView = {
  id: string;
  name: string;
  color: string;
  notes: string | null;
  isPublic: boolean;
  shareSlug: string;
  owner: string | null;
  league: { key: string; nameFr: string; nameEn: string; cpLimit: number | null; color: string } | null;
  members: TeamMemberView[];
  updatedAt: string;
};

type RawTeam = Awaited<ReturnType<typeof loadTeams>>[number];

function loadTeams(where: object) {
  return prisma.team.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: TEAM_SELECT,
  });
}

/** Les identifiants d'attaques sont stockés à plat : une passe suffit à tout résoudre. */
async function moveIndex(teams: RawTeam[]): Promise<Map<string, MoveView>> {
  const ids = new Set<string>();
  for (const team of teams) {
    for (const member of team.members) {
      for (const id of [member.fastMoveId, member.charged1Id, member.charged2Id]) {
        if (id) ids.add(id);
      }
    }
  }
  if (!ids.size) return new Map();
  const moves = await prisma.move.findMany({
    where: { moveId: { in: [...ids] } },
    select: { moveId: true, nameFr: true, nameEn: true, type: true, kind: true },
  });
  return new Map(moves.map((move) => [move.moveId, move]));
}

function toView(team: RawTeam, moves: Map<string, MoveView>): TeamView {
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    notes: team.notes,
    isPublic: team.isPublic,
    shareSlug: team.shareSlug,
    owner: team.user.username,
    league: team.league,
    updatedAt: team.updatedAt.toISOString(),
    members: team.members.map((member) => {
      const base = {
        atk: member.pokemon.baseAtk,
        def: member.pokemon.baseDef,
        hp: member.pokemon.baseHp,
      };
      const ivs = { atk: member.ivAtk, def: member.ivDef, hp: member.ivHp };
      const line = calcStats(base, ivs, member.level);
      return {
        id: member.id,
        slot: member.slot,
        isShadow: member.isShadow,
        isShiny: member.isShiny,
        level: member.level,
        ivs,
        pokemon: member.pokemon,
        stats: {
          atk: line.atk, def: line.def, hp: line.hp,
          cp: line.cp, statProduct: line.statProduct,
        },
        moves: {
          fast: member.fastMoveId ? (moves.get(member.fastMoveId) ?? null) : null,
          charged: [member.charged1Id, member.charged2Id]
            .filter((id): id is string => Boolean(id))
            .map((id) => moves.get(id))
            .filter((move): move is MoveView => Boolean(move)),
        },
      };
    }),
  };
}

export async function getUserTeams(userId: string): Promise<TeamView[]> {
  const teams = await loadTeams({ userId });
  const moves = await moveIndex(teams);
  return teams.map((team) => toView(team, moves));
}

/** Équipes publiques d'un joueur, pour `/teams/u/[username]`. */
export async function getPublicTeamsOf(username: string): Promise<TeamView[]> {
  const teams = await loadTeams({ isPublic: true, user: { username } });
  const moves = await moveIndex(teams);
  return teams.map((team) => toView(team, moves));
}

/**
 * Une équipe par son identifiant. Une équipe privée n'est visible que par son
 * auteur ; le lien de partage (`shareSlug`) contourne cette règle par nature.
 */
export async function getTeam(
  idOrSlug: string,
  viewerId: string | null,
): Promise<TeamView | null> {
  const teams = await loadTeams({ OR: [{ id: idOrSlug }, { shareSlug: idOrSlug }] });
  const team = teams[0];
  if (!team) return null;

  const raw = await prisma.team.findFirst({
    where: { OR: [{ id: idOrSlug }, { shareSlug: idOrSlug }] },
    select: { userId: true, shareSlug: true, isPublic: true },
  });
  const viaShareLink = raw?.shareSlug === idOrSlug;
  const allowed = raw?.isPublic || viaShareLink || (viewerId && raw?.userId === viewerId);
  if (!allowed) return null;

  const moves = await moveIndex([team]);
  return toView(team, moves);
}

export type TypeCoverage = {
  /** Types que l'équipe frappe en super efficace, et par combien de membres. */
  offense: Array<{ type: string; count: number }>;
  /** Types dont l'équipe encaisse mal les attaques. */
  weakness: Array<{ type: string; count: number }>;
  /** Types contre lesquels l'équipe résiste. */
  resistance: Array<{ type: string; count: number }>;
};

/**
 * Couverture de types d'une équipe.
 *
 * L'offensive se lit sur les **types d'attaques choisies**, pas sur les types
 * des Pokémon : une équipe peut être mono-type et couvrir large grâce à son
 * movepool. La défense, elle, ne dépend que des types des Pokémon.
 */
export function typeCoverage(members: TeamMemberView[]): TypeCoverage {
  const offense = new Map<string, number>();
  const weakness = new Map<string, number>();
  const resistance = new Map<string, number>();

  for (const member of members) {
    const moveTypes = new Set(
      [member.moves.fast, ...member.moves.charged]
        .filter((move): move is MoveView => Boolean(move))
        .map((move) => move.type),
    );
    for (const target of TYPES) {
      const covered = [...moveTypes].some(
        (moveType) => effectivenessAgainst(moveType as PokemonType, [target]) > 1,
      );
      if (covered) offense.set(target, (offense.get(target) ?? 0) + 1);
    }

    for (const entry of defensiveProfile(member.pokemon.types)) {
      if (entry.multiplier > 1) weakness.set(entry.type, (weakness.get(entry.type) ?? 0) + 1);
      else if (entry.multiplier < 1) {
        resistance.set(entry.type, (resistance.get(entry.type) ?? 0) + 1);
      }
    }
  }

  const sorted = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return {
    offense: sorted(offense),
    weakness: sorted(weakness),
    resistance: sorted(resistance),
  };
}

export type TeamPokemonOption = {
  id: string;
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  types: string[];
  /** `dex` et `tags` servent aux filtres de coupe, pas à l'affichage. */
  dex: number;
  tags: string[];
  iconFile: string;
  shinyIconFile: string | null;
  shadowEligible: boolean;
  baseAtk: number;
  baseDef: number;
  baseHp: number;
};

/** Ce qu'affiche une liste de résultats : au-delà, c'est illisible. */
const SEARCH_LIMIT = 60;

/**
 * Recherche d'espèces pour les sélecteurs.
 *
 * Le catalogue complet (1 000 espèces) pesait 329 Ko de payload sur les pages
 * Équipes et Simulation, à chaque chargement, pour une modale qui ne s'ouvre pas
 * toujours. On ne renvoie donc qu'une tranche filtrée, à la demande.
 * Les formes obscures ne sont pas listées — « obscur » est une case à cocher sur
 * l'emplacement, comme en jeu, pas une espèce à part.
 */
export async function searchTeamPokemon(query: string): Promise<TeamPokemonOption[]> {
  const trimmed = query.trim();
  return prisma.pokemon.findMany({
    where: {
      released: true,
      isShadow: false,
      ...(trimmed
        ? {
            OR: [
              { nameFr: { contains: trimmed, mode: 'insensitive' } },
              { nameEn: { contains: trimmed, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ dex: 'asc' }, { form: { sort: 'asc', nulls: 'first' } }],
    take: SEARCH_LIMIT,
    select: {
      id: true, speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
      types: true, dex: true, tags: true, iconFile: true, shinyIconFile: true,
      shadowEligible: true, baseAtk: true, baseDef: true, baseHp: true,
    },
  });
}

export type SpeciesMoves = { fast: MoveView[]; charged: MoveView[] };

/** Movepool JcJ d'une espèce, chargé à la demande par l'éditeur d'équipe. */
export async function getSpeciesMoves(pokemonId: string): Promise<SpeciesMoves> {
  const rows = await prisma.pokemonMove.findMany({
    where: { pokemonId },
    select: {
      move: { select: { moveId: true, nameFr: true, nameEn: true, type: true, kind: true } },
    },
  });
  const moves = rows.map((row) => row.move);
  return {
    fast: moves.filter((move) => move.kind === 'FAST'),
    charged: moves.filter((move) => move.kind === 'CHARGED'),
  };
}

/** Types qu'aucune attaque de l'équipe ne frappe en super efficace. */
export function uncoveredTypes(coverage: TypeCoverage): string[] {
  const covered = new Set(coverage.offense.map((entry) => entry.type));
  return TYPES.filter((type) => !covered.has(type));
}
