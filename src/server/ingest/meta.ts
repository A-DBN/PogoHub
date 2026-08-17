/**
 * Ingestion des classements PvPoke (la « liste » méta).
 * Les lignes marquées `isOverride` (édition contributeur) ne sont jamais écrasées.
 */
import { prisma } from '@/server/db';
import { SOURCES, fetchJson } from './sources';
import type { RankingEntry } from './pvpoke-types';
import type { MetaCategory } from '@/generated/prisma/enums';

export const CATEGORIES: Array<{ key: MetaCategory; path: string }> = [
  { key: 'OVERALL', path: 'overall' },
  { key: 'LEADS', path: 'leads' },
  { key: 'CLOSERS', path: 'closers' },
  { key: 'SWITCHES', path: 'switches' },
  { key: 'CHARGERS', path: 'chargers' },
  { key: 'ATTACKERS', path: 'attackers' },
];

export type MetaIngestResult = {
  leagues: number;
  entries: number;
  skippedOverrides: number;
  missing: string[];
  deactivated: string[];
};

const cpFor = (cpLimit: number | null) => (cpLimit == null ? 10000 : cpLimit);

export async function ingestMeta(options?: {
  leagueKeys?: string[];
  categories?: MetaCategory[];
  limit?: number;
}): Promise<MetaIngestResult> {
  const categories = options?.categories?.length
    ? CATEGORIES.filter((c) => options.categories!.includes(c.key))
    : CATEGORIES;

  const scope = options?.leagueKeys?.length ? { key: { in: options.leagueKeys } } : {};
  let leagues = await prisma.league.findMany({
    where: { isActive: true, ...scope },
    orderBy: { sortOrder: 'asc' },
  });

  /*
   * Aucune ligue active : on repart de toutes les ligues standard.
   *
   * Sans ce rattrapage, une base où tout a été masqué — c'était le cas d'une
   * base neuve avant correction de `ingestLeagues` — reste bloquée sans
   * classement, et rien dans l'application ne permet d'en sortir. Les ligues
   * qui reçoivent des entrées sont rallumées en fin de course.
   */
  const recovering = leagues.length === 0;
  if (recovering) {
    leagues = await prisma.league.findMany({
      where: { tier: { not: 'CUSTOM' }, ...scope },
      orderBy: { sortOrder: 'asc' },
    });
  }

  const pokemonIds = new Map(
    (await prisma.pokemon.findMany({ select: { id: true, speciesId: true } })).map((p) => [
      p.speciesId,
      p.id,
    ]),
  );

  let entries = 0;
  let skippedOverrides = 0;
  const missing: string[] = [];

  for (const league of leagues) {
    const snapshot = await prisma.metaSnapshot.create({
      data: { leagueId: league.id, source: 'PVPOKE' },
    });
    await prisma.metaSnapshot.updateMany({
      where: { leagueId: league.id, id: { not: snapshot.id } },
      data: { isCurrent: false },
    });

    for (const category of categories) {
      const url = SOURCES.rankings(league.cup, category.path, cpFor(league.cpLimit));
      let ranking: RankingEntry[];
      try {
        ranking = await fetchJson<RankingEntry[]>(url);
      } catch {
        missing.push(`${league.key}/${category.path}`);
        continue;
      }

      const rows = options?.limit ? ranking.slice(0, options.limit) : ranking;

      // les lignes éditées à la main sont conservées telles quelles
      const overrides = new Set(
        (
          await prisma.metaEntry.findMany({
            where: { leagueId: league.id, category: category.key, isOverride: true },
            select: { pokemonId: true },
          })
        ).map((e) => e.pokemonId),
      );
      skippedOverrides += overrides.size;

      await prisma.metaEntry.deleteMany({
        where: { leagueId: league.id, category: category.key, isOverride: false },
      });

      const data = rows
        .map((entry, index) => {
          const pokemonId = pokemonIds.get(entry.speciesId);
          if (!pokemonId || overrides.has(pokemonId)) return null;
          return {
            leagueId: league.id,
            category: category.key,
            pokemonId,
            rank: index + 1,
            score: entry.score,
            rating: entry.rating ?? null,
            moveset: entry.moveset ?? [],
            moveUses: entry.moves ?? undefined,
            matchups: entry.matchups ?? undefined,
            counters: entry.counters ?? undefined,
            scores: entry.scores ?? undefined,
            source: 'PVPOKE' as const,
            snapshotId: snapshot.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (data.length) {
        await prisma.metaEntry.createMany({ data, skipDuplicates: true });
        entries += data.length;
      }
    }
  }

  // une ligue sans aucun classement (ex. championshipseries, custom) est masquée
  const empty = await prisma.league.findMany({
    where: { tier: { not: 'CUSTOM' }, entries: { none: {} } },
    select: { id: true, key: true },
  });
  if (empty.length) {
    await prisma.league.updateMany({
      where: { id: { in: empty.map((l) => l.id) } },
      data: { isActive: false },
    });
  }

  /*
   * En rattrapage seulement, on rallume ce qui a effectivement un classement.
   *
   * Hors de ce cas on n'y touche pas : une ligue masquée à la main par un
   * administrateur ne doit pas se rallumer à chaque import.
   */
  if (recovering) {
    const filled = await prisma.league.findMany({
      where: { tier: { not: 'CUSTOM' }, entries: { some: {} } },
      select: { id: true },
    });
    if (filled.length) {
      await prisma.league.updateMany({
        where: { id: { in: filled.map((l) => l.id) } },
        data: { isActive: true },
      });
    }
  }

  return {
    leagues: leagues.length,
    entries,
    skippedOverrides,
    missing,
    deactivated: empty.map((l) => l.key),
  };
}
