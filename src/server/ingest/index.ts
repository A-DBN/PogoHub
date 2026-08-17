/** Orchestration des ingestions + journalisation dans IngestRun. */
import { prisma } from '@/server/db';
import { SOURCES, fetchJson } from './sources';
import { ingestPokemon } from './pokemon';
import { ingestLeagues } from './leagues';
import { ingestMeta } from './meta';
import { ingestNews } from './news';
import { ingestShiny } from './shiny';
import { ingestRaids } from './raids';
import { ingestPveMoves } from './pve-moves';
import { ingestSprites } from './sprites';
import type { GameMaster } from './pvpoke-types';

export type IngestKind =
  | 'pokemon' | 'leagues' | 'meta' | 'news' | 'shiny' | 'raids' | 'pvemoves' | 'sprites';

async function track<T extends object>(
  kind: IngestKind,
  source: string,
  job: () => Promise<T>,
): Promise<T> {
  const run = await prisma.ingestRun.create({ data: { kind, source } });
  try {
    const counts = await job();
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, counts: counts as object },
    });
    return counts;
  } catch (error) {
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function runIngest(
  kinds: IngestKind[] = ['pokemon', 'pvemoves', 'leagues', 'meta', 'shiny', 'news', 'raids'],
  options?: { metaLimit?: number; leagueKeys?: string[] },
) {
  const results: Record<string, unknown> = {};
  let gameMaster: GameMaster | undefined;

  const needsGameMaster = kinds.includes('pokemon') || kinds.includes('leagues');
  if (needsGameMaster) gameMaster = await fetchJson<GameMaster>(SOURCES.gamemaster);

  if (kinds.includes('pokemon')) {
    results.pokemon = await track('pokemon', 'pvpoke', () => ingestPokemon(gameMaster));
  }
  // après « pokemon » : complète les attaques déjà créées avec leurs stats JcE
  if (kinds.includes('pvemoves')) {
    results.pvemoves = await track('pvemoves', 'pokeminers', () => ingestPveMoves());
  }
  // après « pokemon » : rapatrie les sprites désormais référencés
  if (kinds.includes('sprites')) {
    results.sprites = await track('sprites', 'pokeminers', () => ingestSprites());
  }
  if (kinds.includes('leagues')) {
    results.leagues = await track('leagues', 'pvpoke', () => ingestLeagues(gameMaster));
  }
  if (kinds.includes('meta')) {
    results.meta = await track('meta', 'pvpoke', () =>
      ingestMeta({ limit: options?.metaLimit, leagueKeys: options?.leagueKeys }),
    );
  }
  if (kinds.includes('shiny')) {
    results.shiny = await track('shiny', 'pogoapi', () => ingestShiny());
  }
  if (kinds.includes('news')) {
    results.news = await track('news', 'leekduck', () => ingestNews());
  }
  if (kinds.includes('raids')) {
    results.raids = await track('raids', 'leekduck', () => ingestRaids());
  }
  return results;
}

export {
  ingestPokemon, ingestLeagues, ingestMeta, ingestNews, ingestShiny, ingestRaids, ingestPveMoves, ingestSprites,
};
