import 'server-only';
import { prisma } from '@/server/db';
import { generationOf, GENERATION_COUNT } from '@/lib/pogo/stats';
import { getPublicTeamsOf, type TeamView } from './teams';

export type PlayerSummary = {
  username: string;
  avatarUrl: string | null;
  role: string;
  teamCount: number;
  shinyCount: number | null; // null si le Shiny Dex est privé
  joinedAt: string;
};

export type PlayerProfile = PlayerSummary & {
  bio: string | null;
  team: 'VALOR' | 'MYSTIC' | 'INSTINCT' | null;
  trainerLevel: number | null;
  /**
   * Absent tant que le joueur ne l'a pas rendu public : il permet de le
   * contacter dans le jeu, et une donnée indexée ne se retire plus.
   */
  friendCode: string | null;
  teams: TeamView[];
  /** Absent si le joueur garde son Shiny Dex privé. */
  shiny: {
    total: number;
    duplicates: number;
    byGeneration: Array<{ generation: number; caught: number }>;
    latest: Array<{
      speciesId: string; nameFr: string; nameEn: string;
      shinyIconFile: string | null; iconFile: string; count: number;
    }>;
  } | null;
};

/** Les joueurs sans pseudo n'ont pas de profil : l'URL est le pseudo. */
const HAS_PROFILE = { username: { not: null } } as const;

/**
 * Annuaire des joueurs. On classe par nombre d'équipes publiques : c'est ce qui
 * rend un profil intéressant à visiter, un compte vide n'apporte rien.
 */
export async function listPlayers(query: string, limit = 40): Promise<PlayerSummary[]> {
  const trimmed = query.trim();
  const users = await prisma.user.findMany({
    where: {
      ...HAS_PROFILE,
      ...(trimmed ? { username: { contains: trimmed, mode: 'insensitive' } } : {}),
    },
    select: {
      username: true, avatarUrl: true, role: true, createdAt: true, shinyPublic: true,
      _count: { select: { teams: { where: { isPublic: true } } } },
    },
    take: limit,
  });

  const shinyCounts = await prisma.collectionEntry.groupBy({
    by: ['userId'],
    where: { shinyCaught: true },
    _count: { pokemonId: true },
  });

  // groupBy renvoie des userId ; on refait le lien par pseudo en une passe
  const ids = await prisma.user.findMany({
    where: HAS_PROFILE,
    select: { id: true, username: true },
  });
  const nameById = new Map(ids.map((u) => [u.id, u.username]));
  const shinyByName = new Map<string, number>();
  for (const row of shinyCounts) {
    const name = nameById.get(row.userId);
    if (name) shinyByName.set(name, row._count.pokemonId);
  }

  return users
    .map((user) => ({
      username: user.username as string,
      avatarUrl: user.avatarUrl,
      role: user.role,
      teamCount: user._count.teams,
      shinyCount: user.shinyPublic ? (shinyByName.get(user.username as string) ?? 0) : null,
      joinedAt: user.createdAt.toISOString(),
    }))
    .sort((a, b) => b.teamCount - a.teamCount || a.username.localeCompare(b.username));
}

export async function getPlayerProfile(username: string): Promise<PlayerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, avatarUrl: true, bio: true, role: true,
      createdAt: true, shinyPublic: true,
      team: true, trainerLevel: true, friendCode: true, friendCodePublic: true,
      _count: { select: { teams: { where: { isPublic: true } } } },
    },
  });
  if (!user?.username) return null;

  const teams = await getPublicTeamsOf(user.username);

  let shiny: PlayerProfile['shiny'] = null;
  if (user.shinyPublic) {
    const entries = await prisma.collectionEntry.findMany({
      where: { userId: user.id, shinyCaught: true },
      orderBy: { caughtAt: 'desc' },
      select: {
        shinyCount: true, caughtAt: true,
        pokemon: {
          select: {
            dex: true, speciesId: true, nameFr: true, nameEn: true,
            iconFile: true, shinyIconFile: true,
          },
        },
      },
    });

    const perGeneration = new Map<number, number>();
    let duplicates = 0;
    for (const entry of entries) {
      const generation = generationOf(entry.pokemon.dex);
      perGeneration.set(generation, (perGeneration.get(generation) ?? 0) + 1);
      duplicates += Math.max(0, (entry.shinyCount || 1) - 1);
    }

    shiny = {
      total: entries.length,
      duplicates,
      byGeneration: Array.from({ length: GENERATION_COUNT }, (_, index) => ({
        generation: index + 1,
        caught: perGeneration.get(index + 1) ?? 0,
      })),
      latest: entries.slice(0, 24).map((entry) => ({
        speciesId: entry.pokemon.speciesId,
        nameFr: entry.pokemon.nameFr,
        nameEn: entry.pokemon.nameEn,
        iconFile: entry.pokemon.iconFile,
        shinyIconFile: entry.pokemon.shinyIconFile,
        count: entry.shinyCount || 1,
      })),
    };
  }

  return {
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    team: user.team,
    trainerLevel: user.trainerLevel,
    // le code n'est envoyé au client que s'il est public : le masquer à
    // l'affichage seulement laisserait la valeur dans la charge de la page
    friendCode: user.friendCodePublic ? user.friendCode : null,
    role: user.role,
    teamCount: user._count.teams,
    shinyCount: shiny?.total ?? null,
    joinedAt: user.createdAt.toISOString(),
    teams,
    shiny,
  };
}
