/** Actualités et événements Pokémon GO (LeekDuck via ScrapedDuck). */
import { prisma } from '@/server/db';
import { SOURCES, fetchJson } from './sources';
import type { ScrapedDuckEvent } from './pvpoke-types';

export type NewsIngestResult = { fetched: number; upserted: number };

/** Traductions des catégories d'événements pour l'affichage FR. */
export const EVENT_TYPE_FR: Record<string, string> = {
  'community-day': 'Journée Communauté',
  'pokemon-spotlight-hour': 'Heure Vedette',
  'raid-hour': 'Heure de Raid',
  'raid-day': 'Journée de Raid',
  'raid-battles': 'Raids',
  'research-breakthrough': 'Percée de Recherche',
  'timed-research': 'Étude Chronométrée',
  'field-research': 'Étude de Terrain',
  'go-battle-league': 'GO Battle League',
  event: 'Événement',
  'live-event': 'Événement en présentiel',
  'pokemon-go-fest': 'GO Fest',
  'ticketed-event': 'Événement payant',
  update: 'Mise à jour',
  season: 'Saison',
  'elite-raids': 'Raids d’Élite',
  'max-battles': 'Combats Dynamax',
  'wild-area': 'Zone Sauvage',
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function ingestNews(): Promise<NewsIngestResult> {
  const events = await fetchJson<ScrapedDuckEvent[]>(SOURCES.news);
  let upserted = 0;

  for (const event of events) {
    const data = {
      source: 'LEEKDUCK' as const,
      type: event.eventType,
      titleEn: event.name,
      titleFr: null,
      image: event.image ?? null,
      link: event.link ?? null,
      startAt: parseDate(event.start),
      endAt: parseDate(event.end),
      payload: (event.extraData ?? undefined) as object | undefined,
    };
    await prisma.newsItem.upsert({
      where: { externalId: event.eventID },
      create: { externalId: event.eventID, ...data },
      update: data,
    });
    upserted++;
  }

  return { fetched: events.length, upserted };
}

export type NewsBucket = 'ACTIVE' | 'UPCOMING' | 'PAST';

export function bucketOf(
  item: { startAt: Date | null; endAt: Date | null },
  now = new Date(),
): NewsBucket {
  const { startAt, endAt } = item;
  if (startAt && startAt > now) return 'UPCOMING';
  if (endAt && endAt < now) return 'PAST';
  return 'ACTIVE';
}
