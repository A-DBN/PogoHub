/**
 * Noms français officiels : les fichiers i18n de PokeMiners sont des tableaux
 * plats clé/valeur alternées. En appariant la même clé dans les fichiers anglais
 * et français on obtient les noms d'espèces (`pokemon_name_0463`) et d'attaques
 * (`move_name_0013`) sans dépendre d'aucune traduction maison.
 */
import { SOURCES, fetchJson } from './sources';
import type { GmMove } from './pvpoke-types';

type I18nFile = { data: string[] };

export function pairs(data: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i + 1 < data.length; i += 2) map.set(data[i], data[i + 1]);
  return map;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Attaques absentes des textes du jeu (nouveautés) — noms officiels FR. */
const MOVE_FR_EXTRA: Record<string, string> = {
  beakblast: 'Bec Canon',
  chillingwater: 'Douche Froide',
  gigatonhammer: 'Marteau Gigatonne',
  plasmafists: 'Poing Plasma',
  vcreate: 'Coup Victoire',
  naturesmadness: 'Colère de la Nature',
  dive: 'Plongée',
  drumbeating: 'Tambour Battant',
  glaiverush: 'Assaut Glaive',
  mindblown: 'Explositête',
  pyroball: 'Ballon Brûlant',
  secretsword: 'Lame Ointe',
  snipeshot: 'Tir Précis',
  springtidestormspeculative: 'Tempête Printemps',
  hydropumpblastoise: 'Hydrocanon',
  watergunfastblastoise: 'Pistolet à O',
};

/** Formes PvPoke → libellé français. */
export const FORM_FR: Record<string, string> = {
  Alolan: 'd’Alola', Galarian: 'de Galar', Hisuian: 'de Hisui', Paldean: 'de Paldea',
  Altered: 'Forme Alternative', Origin: 'Forme Originelle', Average: 'Taille Normale',
  Large: 'Taille Maxi', Small: 'Taille Mini', Super: 'Taille Ultra', Female: 'Femelle',
  Male: 'Mâle', 'Full Belly': 'Rassasié', Hangry: 'Affamé', Incarnate: 'Forme Avatar',
  Therian: 'Forme Totémique', Rainy: 'Eau de Pluie', Snowy: 'Blizzard', Sunny: 'Solaire',
  Shield: 'Forme Parade', Blade: 'Forme Assaut', Busted: 'Forme Démasquée',
  Disguised: 'Forme Déguisée', 'Single Strike': 'Style Poing Final',
  'Rapid Strike': 'Style Mille Poings', Trash: 'Cape Déchet', Plant: 'Cape Plante',
  Sandy: 'Cape Sable', Standard: 'Forme Normale', Zen: 'Mode Transe', Midday: 'Forme Diurne',
  Midnight: 'Forme Nocturne', Dusk: 'Forme Crépusculaire', Baile: 'Style Flamenco',
  'Pom-Pom': 'Style Pom-Pom', "Pa'u": 'Style Hula', Sensu: 'Style Buyō', Heat: 'Forme Chaleur',
  Wash: 'Forme Lavage', Frost: 'Forme Froid', Fan: 'Forme Hélice', Mow: 'Forme Tonte',
  Overcast: 'Forme Normale', Sunshine: 'Forme Radieuse', Curly: 'Forme Frisée',
  Droopy: 'Forme Molle', Stretchy: 'Forme Raide', Defense: 'Forme Défense',
  Attack: 'Forme Attaque', Speed: 'Forme Vitesse', Land: 'Forme Terrestre',
  Sky: 'Forme Céleste', Shadow: 'Obscur',
};

const TYPE_FR: Record<string, string> = {
  bug: 'Insecte', dark: 'Ténèbres', dragon: 'Dragon', electric: 'Électrik', fairy: 'Fée',
  fighting: 'Combat', fire: 'Feu', flying: 'Vol', ghost: 'Spectre', grass: 'Plante',
  ground: 'Sol', ice: 'Glace', normal: 'Normal', poison: 'Poison', psychic: 'Psy',
  rock: 'Roche', steel: 'Acier', water: 'Eau',
};

export type GameText = {
  /** numéro du Pokédex → nom français */
  speciesFr: Map<number, string>;
  /** moveId → nom français */
  moveFr: Map<string, string>;
  /** attaques restées en anglais (diagnostic) */
  missingMoves: string[];
};

export async function loadGameText(moves: GmMove[]): Promise<GameText> {
  const [en, fr] = await Promise.all([
    fetchJson<I18nFile>(SOURCES.i18nEnglish),
    fetchJson<I18nFile>(SOURCES.i18nFrench),
  ]);
  const EN = pairs(en.data);
  const FR = pairs(fr.data);

  const speciesFr = new Map<number, string>();
  for (const [key, value] of FR) {
    const m = /^pokemon_name_(\d{4})$/.exec(key);
    if (m) speciesFr.set(Number(m[1]), value);
  }

  // index anglais normalisé → français, à partir des clés move_name_XXXX
  const byEnglish = new Map<string, string>();
  for (const [key, value] of EN) {
    if (key.startsWith('move_name_') && FR.has(key)) {
      const norm = normalize(value);
      if (!byEnglish.has(norm)) byEnglish.set(norm, FR.get(key)!);
    }
  }
  for (const [k, v] of Object.entries(MOVE_FR_EXTRA)) byEnglish.set(k, v);

  const moveFr = new Map<string, string>();
  const missingMoves: string[] = [];
  for (const move of moves) {
    const withQualifier = /^(.+?)\s*\(([^)]+)\)$/.exec(move.name);
    if (withQualifier) {
      const head = byEnglish.get(normalize(withQualifier[1]));
      if (head) {
        const qualifier = TYPE_FR[withQualifier[2].toLowerCase()] ?? withQualifier[2];
        moveFr.set(move.moveId, `${head} (${qualifier})`);
        continue;
      }
    }
    const direct = byEnglish.get(normalize(move.name));
    if (direct) moveFr.set(move.moveId, direct);
    else {
      moveFr.set(move.moveId, move.name);
      missingMoves.push(move.name);
    }
  }

  return { speciesFr, moveFr, missingMoves };
}

/** "Ninetales (Alolan) (Shadow)" → { base, form, shadow } */
export function splitSpeciesName(speciesName: string) {
  const quals = [...speciesName.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  return {
    base: speciesName.replace(/\s*\([^)]*\)/g, '').trim(),
    form: quals.find((q) => q !== 'Shadow') ?? null,
    shadow: quals.includes('Shadow'),
  };
}
