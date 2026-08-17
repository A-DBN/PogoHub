import 'server-only';
import { prisma } from '@/server/db';
import type { Locale } from '@/i18n/config';

export type LeagueCard = {
  id: string;
  key: string;
  nameFr: string;
  nameEn: string;
  cpLimit: number | null;
  tier: 'MAIN' | 'MINOR' | 'CUSTOM';
  color: string;
  rules: string[];
  teamCount: number;
  top: Array<{
    rank: number;
    nameFr: string;
    nameEn: string;
    iconFile: string;
    types: string[];
    /** Nulle pour une ligne ajoutée à la main, jamais simulée par PvPoke. */
    score: number | null;
  }>;
};

export async function getLeagueCards(
  locale: Locale,
  userId?: string,
): Promise<LeagueCard[]> {
  const leagues = await prisma.league.findMany({
    where: { isActive: true },
    orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
    include: {
      entries: {
        where: { category: 'OVERALL', rank: { lte: 5 } },
        orderBy: { rank: 'asc' },
        include: {
          pokemon: {
            select: { nameFr: true, nameEn: true, iconFile: true, types: true },
          },
        },
      },
      _count: userId ? { select: { teams: { where: { userId } } } } : { select: { teams: true } },
    },
  });

  return leagues.map((league) => ({
    id: league.id,
    key: league.key,
    nameFr: league.nameFr,
    nameEn: league.nameEn,
    cpLimit: league.cpLimit,
    tier: league.tier,
    color: league.color,
    rules: locale === 'fr' ? league.rulesFr : league.rulesEn,
    teamCount: league._count.teams,
    top: league.entries.map((entry) => ({
      rank: entry.rank,
      nameFr: entry.pokemon.nameFr,
      nameEn: entry.pokemon.nameEn,
      iconFile: entry.pokemon.iconFile,
      types: entry.pokemon.types,
      score: entry.score,
    })),
  }));
}

export async function getLeagueByKey(key: string) {
  return prisma.league.findUnique({ where: { key } });
}

export async function getActiveLeagues() {
  return prisma.league.findMany({
    where: { isActive: true },
    orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true, key: true, nameFr: true, nameEn: true, cpLimit: true,
      tier: true, color: true, rulesFr: true, rulesEn: true, filters: true,
    },
  });
}
