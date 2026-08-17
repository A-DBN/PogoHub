/**
 * Sources de données externes.
 *
 * - PvPoke (MIT) : gamemaster + classements par coupe/catégorie.
 * - PokeMiners : sprites Pokémon GO + textes officiels FR/EN.
 * - ScrapedDuck (LeekDuck) : événements et actualités avec visuels.
 * - pogoapi : liste des chromatiques disponibles en jeu.
 *
 * gobattlelog.com n'expose aucune API publique et redirige /meta vers / tant
 * qu'on n'est pas connecté (FirebaseUI) : l'adaptateur reste désactivé par
 * défaut et n'est utilisable qu'avec son propre cookie de session.
 */

const PVPOKE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data';
const POKEMINERS =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master';

export const SOURCES = {
  gamemaster: `${PVPOKE}/gamemaster.json`,
  rankings: (cup: string, category: string, cp: number) =>
    `${PVPOKE}/rankings/${cup}/${category}/rankings-${cp}.json`,
  i18nEnglish: `${POKEMINERS}/Texts/Latest%20APK/JSON/i18n_english.json`,
  i18nFrench: `${POKEMINERS}/Texts/Latest%20APK/JSON/i18n_french.json`,
  assetTree:
    'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master?recursive=1',
  news: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json',
  raids: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json',
  shiny: 'https://pogoapi.net/api/v1/shiny_pokemon.json',
  // GAME_MASTER complet : seule source des statistiques JcE des attaques
  // (puissance, durée, fenêtre de dégâts), absentes du gamemaster PvPoke.
  gameMasterFull:
    'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
} as const;

export const ATTRIBUTIONS = [
  { name: 'PvPoke', url: 'https://pvpoke.com', note: 'classements et game master (MIT)' },
  { name: 'PokeMiners', url: 'https://github.com/PokeMiners', note: 'sprites et textes du jeu' },
  { name: 'LeekDuck', url: 'https://leekduck.com', note: 'événements (via ScrapedDuck)' },
  { name: 'pogoapi.net', url: 'https://pogoapi.net', note: 'chromatiques disponibles' },
  { name: 'GO Battle Log', url: 'https://gobattlelog.com', note: 'statistiques de ladder (liens)' },
];

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': 'pogo-pvp-hub', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}
