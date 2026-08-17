/**
 * Résolution des sprites Pokémon GO : on liste une fois l'arborescence des
 * assets PokeMiners puis on choisit le fichier exact pour chaque espèce/forme.
 * Logique validée sur les 440 premières entrées du classement CP 1500 (440/440).
 */
import { SOURCES, fetchJson } from './sources';

const ASSET_DIR = 'Images/Pokemon - 256x256/Addressable Assets/';

/** Forme PvPoke → suffixes de fichier possibles. */
export const FORM_SUFFIX: Record<string, string[]> = {
  Alolan: ['ALOLA'], Galarian: ['GALARIAN', 'GALARIAN_STANDARD'], Hisuian: ['HISUIAN', 'HISUI'],
  Paldean: ['PALDEA'], Altered: ['ALTERED'], Origin: ['ORIGIN'], Average: ['AVERAGE'],
  Large: ['LARGE'], Small: ['SMALL'], Super: ['SUPER'], Female: ['FEMALE'], Male: ['MALE'],
  'Full Belly': ['FULL_BELLY'], Hangry: ['HANGRY'], Incarnate: ['INCARNATE'],
  Therian: ['THERIAN'], Rainy: ['RAINY'], Snowy: ['SNOWY'], Sunny: ['SUNNY'],
  Shield: ['SHIELD'], Blade: ['BLADE'], Busted: ['BUSTED'], Disguised: ['DISGUISED'],
  'Single Strike': ['SINGLE_STRIKE'], 'Rapid Strike': ['RAPID_STRIKE'],
  Standard: ['STANDARD'], Zen: ['ZEN'],
  Midday: ['MIDDAY'], Midnight: ['MIDNIGHT'], Dusk: ['DUSK'], Baile: ['BAILE'],
  'Pom-Pom': ['POMPOM'], "Pa'u": ['PAU'], Sensu: ['SENSU'], Heat: ['HEAT'], Wash: ['WASH'],
  Frost: ['FROST'], Fan: ['FAN'], Mow: ['MOW'], Overcast: ['OVERCAST'],
  Curly: ['CURLY'], Droopy: ['DROOPY'], Stretchy: ['STRETCHY'], Defense: ['DEFENSE'],
  Attack: ['ATTACK'], Speed: ['SPEED'], Land: ['LAND'], Sky: ['SKY'],

  // Zygarde : PvPoke écrit « 10% Forme », les assets « TEN_PERCENT »
  '10% Forme': ['TEN_PERCENT'],
  '50% Forme': ['FIFTY_PERCENT'],
  'Complete Forme': ['COMPLETE'],

  // Cheniti partage les noms de forme de Cheniselle (413), pas les fichiers
  Plant: ['BURMY_PLANT', 'WORMADAM_PLANT', 'PLANT'],
  Sandy: ['BURMY_SANDY', 'WORMADAM_SANDY', 'SANDY'],
  Trash: ['BURMY_TRASH', 'WORMADAM_TRASH', 'TRASH'],

  // Ceriflor : la forme « Sunshine » a un fichier « SUNNY »
  Sunshine: ['SUNSHINE', 'SUNNY'],

  // Tauros de Paldea : la région est dans le nom de fichier
  Aqua: ['PALDEA_AQUA', 'AQUA'],
  Blaze: ['PALDEA_BLAZE', 'BLAZE'],
  Combat: ['PALDEA_COMBAT', 'COMBAT'],

  // Mewtwo Armuré : fichier « fA »
  Armored: ['A', 'ARMORED'],

  // Pikachu costumés. « Libre » et « Shaymin Scarf » n'ont pas d'asset : ils
  // retombent sur le Pikachu de base, ce qui est sans conséquence — ces formes
  // ne diffèrent que par l'apparence.
  Flying: ['FLYING_01', 'FLYING'],
  '5th Anniversary': ['FLYING_5TH_ANNIV'],
};

/** Espèces sans sprite « neutre » : variante à utiliser par défaut. */
export const DEFAULT_VARIANT: Record<number, string> = {
  778: 'DISGUISED', 671: 'RED', 423: 'WEST_SEA', 327: '00', 931: 'GREEN', 676: 'NATURAL',
  925: 'FAMILY_OF_THREE', 413: 'WORMADAM_PLANT', 681: 'SHIELD', 892: 'SINGLE_STRIKE',
  642: 'INCARNATE', 641: 'INCARNATE', 645: 'INCARNATE', 550: 'RED_STRIPED', 978: 'CURLY',
  876: 'MALE', 555: 'STANDARD', 479: '',
  646: 'NORMAL', // Kyurem sans forme
  649: 'NORMAL', // Genesect sans module
  746: 'SOLO', // Froussardine solitaire
  849: 'AMPED', // Salarsen aigu
  412: 'BURMY_PLANT', // Cheniti
};

export type IconIndex = {
  files: Set<string>;
  shiny: Set<string>;
  byDex: Map<number, string[]>;
};

type GitTree = { tree: Array<{ path: string }>; truncated?: boolean };

export async function loadIconIndex(): Promise<IconIndex> {
  const tree = await fetchJson<GitTree>(SOURCES.assetTree);
  const files = new Set<string>();
  const shiny = new Set<string>();
  const byDex = new Map<number, string[]>();
  for (const node of tree.tree) {
    if (!node.path.startsWith(ASSET_DIR) || !node.path.endsWith('.icon.png')) continue;
    const file = node.path.slice(ASSET_DIR.length);
    if (file.includes('/')) continue;
    if (file.endsWith('.s.icon.png')) {
      shiny.add(file);
      continue;
    }
    files.add(file);
    const dex = Number(/^pm(\d+)\./.exec(file)?.[1]);
    if (Number.isFinite(dex)) {
      const list = byDex.get(dex) ?? [];
      list.push(file);
      byDex.set(dex, list);
    }
  }
  return { files, shiny, byDex };
}

export function resolveIcon(
  index: IconIndex,
  dex: number,
  form: string | null,
): { file: string; exact: boolean } {
  const candidates: string[] = [];
  if (form) {
    const suffixes = FORM_SUFFIX[form] ?? [form.toUpperCase().replace(/[^A-Z0-9]/g, '_')];
    candidates.push(...suffixes.map((s) => `pm${dex}.f${s}.icon.png`));
  } else if (dex in DEFAULT_VARIANT) {
    const v = DEFAULT_VARIANT[dex];
    candidates.push(v ? `pm${dex}.f${v}.icon.png` : `pm${dex}.f.icon.png`);
  }
  const plain = `pm${dex}.icon.png`;
  candidates.push(plain, `pm${dex}.f.icon.png`);

  for (const candidate of candidates) {
    if (index.files.has(candidate)) {
      return { file: candidate, exact: !(form && candidate === plain) };
    }
  }

  // Dernier recours : la première forme par ordre alphabétique. C'est un choix
  // arbitraire — Zygarde 10 % héritait ainsi du sprite de la forme Parfaite —
  // donc `exact: false` doit rester visible dans le rapport d'ingestion.
  const fallback = (index.byDex.get(dex) ?? []).sort()[0];
  return { file: fallback ?? '', exact: false };
}

/** Fichier chromatique correspondant, s'il existe dans les assets. */
export function shinyFile(index: IconIndex, file: string): string | null {
  if (!file) return null;
  const candidate = file.replace(/\.icon\.png$/, '.s.icon.png');
  return index.shiny.has(candidate) ? candidate : null;
}
