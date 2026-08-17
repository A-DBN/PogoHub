import 'server-only';
import { prisma } from '@/server/db';

export type NewsView = {
  id: string;
  type: string;
  title: string;
  image: string | null;
  link: string | null;
  startAt: string | null;
  endAt: string | null;
  isPinned: boolean;
};

export type NewsFeed = {
  active: NewsView[];
  upcoming: NewsView[];
  past: NewsView[];
  /** Types présents, pour les filtres. */
  types: string[];
};

const toView = (row: {
  id: string; type: string; titleEn: string; titleFr: string | null;
  image: string | null; link: string | null;
  startAt: Date | null; endAt: Date | null; isPinned: boolean;
}, locale: string): NewsView => ({
  id: row.id,
  type: row.type,
  // LeekDuck ne publie qu'en anglais : le titre français n'existe que s'il a
  // été saisi à la main côté contributeur.
  title: (locale === 'fr' ? row.titleFr : null) ?? row.titleEn,
  image: row.image,
  link: row.link,
  startAt: row.startAt?.toISOString() ?? null,
  endAt: row.endAt?.toISOString() ?? null,
  isPinned: row.isPinned,
});

/**
 * Le fil d'actualités, découpé selon le moment présent.
 *
 * Un événement sans date compte comme « en cours » : ce sont les annonces de
 * fond, elles n'ont pas de fin et doivent rester visibles.
 */
export async function getNews(locale: string): Promise<NewsFeed> {
  const now = new Date();
  const rows = await prisma.newsItem.findMany({
    where: { isHidden: false },
    orderBy: [{ isPinned: 'desc' }, { startAt: 'asc' }],
    select: {
      id: true, type: true, titleEn: true, titleFr: true, image: true, link: true,
      startAt: true, endAt: true, isPinned: true,
    },
  });

  const active: NewsView[] = [];
  const upcoming: NewsView[] = [];
  const past: NewsView[] = [];

  for (const row of rows) {
    const view = toView(row, locale);
    if (row.endAt && row.endAt < now) past.push(view);
    else if (row.startAt && row.startAt > now) upcoming.push(view);
    else active.push(view);
  }

  // les passés se lisent du plus récent au plus ancien
  past.reverse();

  return {
    active,
    upcoming,
    past,
    types: [...new Set(rows.map((row) => row.type))].sort(),
  };
}
