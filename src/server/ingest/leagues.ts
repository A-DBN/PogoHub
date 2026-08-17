/**
 * Ingestion des ligues : les 3 ligues principales sont définies ici (elles ne
 * changent jamais), les coupes/ligues mineures viennent des `formats` + `cups`
 * du game master PvPoke, règles lisibles incluses.
 */
import { prisma } from '@/server/db';
import { describeFilters, type LeagueFilters } from '@/lib/pogo/eligibility';
import { SOURCES, fetchJson } from './sources';
import type { GameMaster, GmCup, GmFormat } from './pvpoke-types';

export type LeagueIngestResult = {
  created: number;
  updated: number;
  total: number;
  hidden: string[];
};

type LeagueSeed = {
  key: string;
  cup: string;
  nameEn: string;
  nameFr: string;
  cpLimit: number | null;
  tier: 'MAIN' | 'MINOR';
  color: string;
  icon: string;
  sortOrder: number;
  rulesEn?: string[];
  rulesFr?: string[];
};

export const MAIN_LEAGUES: LeagueSeed[] = [
  {
    key: 'great', cup: 'all', nameEn: 'Great League', nameFr: 'Super Ligue',
    cpLimit: 1500, tier: 'MAIN', color: '#4d90d5', icon: 'great', sortOrder: 1,
    rulesEn: ['Pokémon must be at or below 1500 CP.', 'Mega Evolutions are not allowed.'],
    rulesFr: ['Les Pokémon doivent être à 1500 PC ou moins.', 'Les Méga-Évolutions sont interdites.'],
  },
  {
    key: 'ultra', cup: 'all', nameEn: 'Ultra League', nameFr: 'Hyper Ligue',
    cpLimit: 2500, tier: 'MAIN', color: '#eab516', icon: 'ultra', sortOrder: 2,
    rulesEn: ['Pokémon must be at or below 2500 CP.', 'Mega Evolutions are not allowed.'],
    rulesFr: ['Les Pokémon doivent être à 2500 PC ou moins.', 'Les Méga-Évolutions sont interdites.'],
  },
  {
    key: 'master', cup: 'all', nameEn: 'Master League', nameFr: 'Ligue Master',
    cpLimit: null, tier: 'MAIN', color: '#b567ce', icon: 'master', sortOrder: 3,
    rulesEn: ['No CP limit.', 'Mega Evolutions are not allowed.'],
    rulesFr: ['Pas de limite de PC.', 'Les Méga-Évolutions sont interdites.'],
  },
];

/** Titres français des coupes récurrentes (les autres gardent le titre PvPoke). */
const CUP_FR: Record<string, string> = {
  little: 'Petite Ligue', remix: 'Super Ligue Remix', retro: 'Coupe Rétro',
  premier: 'Coupe Premier', mega: 'Ligue Master Méga', fantasy: 'Coupe Fantaisie',
  catch: 'Coupe Capture', evolution: 'Coupe Évolution', scroll: 'Coupe du Parchemin',
  sunshine: 'Coupe Ensoleillée', summer: 'Coupe d’Été', weather: 'Coupe Météo',
  spellcraft: 'Coupe des Sortilèges', cosy: 'Coupe Cocooning', classic: 'Ligue Classique',
  bayou: 'Coupe du Bayou', equinox: 'Coupe Équinoxe', bastille: 'Coupe Bastille',
  chrysalis: 'Coupe Chrysalide', ligaultra: 'Liga Ultra', tsuki: 'Coupe Tsuki',
  copadiluvio: 'Copa Dilúvio', coupedusillage: 'Coupe du Sillage',
};

const cpToLimit = (cp: number): number | null => (cp >= 10000 ? null : cp);

export async function ingestLeagues(gameMaster?: GameMaster): Promise<LeagueIngestResult> {
  const gm = gameMaster ?? (await fetchJson<GameMaster>(SOURCES.gamemaster));
  const cups = new Map<string, GmCup>(gm.cups.map((c) => [c.name, c]));

  const seeds: LeagueSeed[] = [...MAIN_LEAGUES];

  // Petite Ligue : présente dans les formats mais sans règles détaillées
  const formats: GmFormat[] = [
    { title: 'Little Cup', cup: 'little', cp: 500 },
    ...gm.formats.filter((f) => f.cup !== 'all'),
  ];

  let order = 10;
  for (const format of formats) {
    if (seeds.some((s) => s.key === format.cup)) continue;
    seeds.push({
      key: format.cup,
      cup: format.cup,
      nameEn: format.title,
      nameFr: CUP_FR[format.cup] ?? format.title,
      cpLimit: cpToLimit(format.cp),
      tier: 'MINOR',
      color: '#5b9cff',
      icon: 'cup',
      sortOrder: order++,
      rulesEn: format.rules,
    });
  }

  let created = 0;
  let updated = 0;

  for (const seed of seeds) {
    const cup = cups.get(seed.cup);
    const filters: LeagueFilters | null = cup
      ? { include: cup.include ?? [], exclude: cup.exclude ?? [] }
      : null;

    const rulesEn = seed.rulesEn?.length
      ? seed.rulesEn
      : describeFilters(filters, seed.cpLimit, 'en');
    const rulesFr = seed.rulesFr?.length
      ? seed.rulesFr
      : describeFilters(filters, seed.cpLimit, 'fr');

    const data = {
      cup: seed.cup,
      nameEn: seed.nameEn,
      nameFr: seed.nameFr,
      cpLimit: seed.cpLimit,
      tier: seed.tier,
      color: seed.color,
      icon: seed.icon,
      rulesEn,
      rulesFr,
      filters: filters ?? undefined,
      sortOrder: seed.sortOrder,
    };

    const existing = await prisma.league.findUnique({ where: { key: seed.key } });
    if (existing) {
      // on ne réécrit pas une ligue personnalisée par un admin
      if (existing.tier !== 'CUSTOM') {
        // `isActive` n'est pas réécrit : une ligue masquée le reste
        await prisma.league.update({ where: { key: seed.key }, data });
        updated++;
      }
    } else {
      await prisma.league.create({ data: { key: seed.key, ...data, isActive: true } });
      created++;
    }
  }

  // une ligue sans aucun classement (championshipseries, custom…) reste masquée
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

  return { created, updated, total: seeds.length, hidden: empty.map((l) => l.key) };
}
