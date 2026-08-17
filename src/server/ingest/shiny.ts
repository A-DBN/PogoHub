/**
 * Disponibilité des chromatiques : pogoapi donne la liste des shiny sortis et
 * la façon de les obtenir ; les sprites PokeMiners servent de catalogue visuel.
 */
import { prisma } from '@/server/db';
import { SOURCES, fetchJson } from './sources';
import type { ShinyApiEntry } from './pvpoke-types';

export type ShinyIngestResult = {
  released: number;
  withSprite: number;
  keptManual: number;
};

export async function ingestShiny(): Promise<ShinyIngestResult> {
  const api = await fetchJson<Record<string, ShinyApiEntry>>(SOURCES.shiny);
  const releasedDex = new Map<number, string[]>();

  for (const entry of Object.values(api)) {
    const sources: string[] = [];
    if (entry.found_wild) sources.push('wild');
    if (entry.found_raid) sources.push('raid');
    if (entry.found_egg) sources.push('egg');
    if (entry.found_research) sources.push('research');
    if (entry.found_evolution) sources.push('evolution');
    if (entry.found_photobomb) sources.push('photobomb');
    releasedDex.set(entry.id, sources);
  }

  const pokemon = await prisma.pokemon.findMany({
    where: { isShadow: false, shinyIconFile: { not: null } },
    select: { id: true, dex: true, shiny: { select: { isReleased: true } } },
  });

  let kept = 0;
  for (const p of pokemon) {
    const sources = releasedDex.get(p.dex);
    // pogoapi a du retard sur le jeu : une sortie déjà validée (souvent par un
    // admin) n'est jamais annulée par l'ingestion, on ne fait qu'ajouter.
    const alreadyReleased = p.shiny?.isReleased ?? false;
    if (alreadyReleased && !sources) {
      kept++;
      continue;
    }
    const data = { isReleased: Boolean(sources) || alreadyReleased, sources: sources ?? [] };
    await prisma.shinyRelease.upsert({
      where: { pokemonId: p.id },
      create: { pokemonId: p.id, ...data },
      update: data,
    });
  }

  return { released: releasedDex.size, withSprite: pokemon.length, keptManual: kept };
}
