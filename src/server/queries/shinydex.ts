import 'server-only';
import { prisma } from '@/server/db';
import { GENERATION_COUNT } from '@/lib/pogo/stats';
import { isOfferedForTrade } from '@/lib/pogo/trade';

export type ShinyEntry = {
  id: string;
  dex: number;
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  iconFile: string;
  shinyIconFile: string | null;
  released: boolean;
  sources: string[];
  caught: boolean;
  count: number;
  /** Proposé à l'échange : `true`/`false` explicites, `null` = règle du compte. */
  forTrade: boolean | null;
  /** Résultat de la règle : ce que la liste d'échange affichera réellement. */
  offered: boolean;
};

export type ShinyGeneration = {
  generation: number;
  entries: ShinyEntry[];
  releasedCount: number;
  caughtCount: number;
};

export async function getShinyDex(userId?: string) {
  const [pokemon, collection, prefs] = await Promise.all([
    prisma.pokemon.findMany({
      // les Méga-Évolutions n'ont pas de chromatique propre à capturer
      where: {
        isShadow: false,
        shinyIconFile: { not: null },
        NOT: { tags: { has: 'mega' } },
      },
      orderBy: [{ dex: 'asc' }, { form: { sort: 'asc', nulls: 'first' } }],
      select: {
        id: true, dex: true, speciesId: true, nameFr: true, nameEn: true,
        form: true, formFr: true, iconFile: true, shinyIconFile: true,
        generation: true, shiny: { select: { isReleased: true, sources: true } },
      },
    }),
    userId
      ? prisma.collectionEntry.findMany({
          where: { userId, shinyCaught: true },
          select: { pokemonId: true, shinyCount: true, forTrade: true },
        })
      : Promise.resolve([]),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { autoTradeFrom: true } })
      : Promise.resolve(null),
  ]);

  const caught = new Map(collection.map((entry) => [entry.pokemonId, entry.shinyCount || 1]));
  const tradeFlags = new Map(collection.map((entry) => [entry.pokemonId, entry.forTrade]));

  const generations: ShinyGeneration[] = Array.from(
    { length: GENERATION_COUNT },
    (_, index) => ({ generation: index + 1, entries: [], releasedCount: 0, caughtCount: 0 }),
  );

  for (const p of pokemon) {
    const bucket = generations[p.generation - 1];
    if (!bucket) continue;
    const entry: ShinyEntry = {
      id: p.id,
      dex: p.dex,
      speciesId: p.speciesId,
      nameFr: p.nameFr,
      nameEn: p.nameEn,
      form: p.form,
      formFr: p.formFr,
      iconFile: p.iconFile,
      shinyIconFile: p.shinyIconFile,
      released: p.shiny?.isReleased ?? false,
      sources: p.shiny?.sources ?? [],
      caught: caught.has(p.id),
      count: caught.get(p.id) ?? 0,
      forTrade: tradeFlags.get(p.id) ?? null,
      offered: isOfferedForTrade(
        tradeFlags.get(p.id) ?? null,
        caught.get(p.id) ?? 0,
        prefs?.autoTradeFrom,
      ),
    };
    bucket.entries.push(entry);
    if (entry.released) bucket.releasedCount++;
    if (entry.caught) bucket.caughtCount++;
  }

  const totals = generations.reduce(
    (acc, generation) => ({
      released: acc.released + generation.releasedCount,
      caught: acc.caught + generation.caughtCount,
      duplicates:
        acc.duplicates +
        generation.entries.reduce((sum, e) => sum + Math.max(0, e.count - 1), 0),
    }),
    { released: 0, caught: 0, duplicates: 0 },
  );

  return { generations: generations.filter((g) => g.entries.length > 0), totals };
}
