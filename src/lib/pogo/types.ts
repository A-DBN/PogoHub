/** Les 18 types, leurs couleurs et leurs noms FR/EN, plus la table d'efficacité GO. */

export const TYPES = [
  'bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'flying',
  'ghost', 'grass', 'ground', 'ice', 'normal', 'poison', 'psychic', 'rock',
  'steel', 'water',
] as const;

export type PokemonType = (typeof TYPES)[number];

export const TYPE_INFO: Record<PokemonType, { fr: string; en: string; color: string }> = {
  bug: { fr: 'Insecte', en: 'Bug', color: '#8fbf2f' },
  dark: { fr: 'Ténèbres', en: 'Dark', color: '#5a5366' },
  dragon: { fr: 'Dragon', en: 'Dragon', color: '#0f6ac0' },
  electric: { fr: 'Électrik', en: 'Electric', color: '#eab516' },
  fairy: { fr: 'Fée', en: 'Fairy', color: '#ef6fb4' },
  fighting: { fr: 'Combat', en: 'Fighting', color: '#d3425f' },
  fire: { fr: 'Feu', en: 'Fire', color: '#ff9d55' },
  flying: { fr: 'Vol', en: 'Flying', color: '#7d9bde' },
  ghost: { fr: 'Spectre', en: 'Ghost', color: '#5f6dbc' },
  grass: { fr: 'Plante', en: 'Grass', color: '#63bc5a' },
  ground: { fr: 'Sol', en: 'Ground', color: '#d97845' },
  ice: { fr: 'Glace', en: 'Ice', color: '#4bc7d6' },
  normal: { fr: 'Normal', en: 'Normal', color: '#9099a1' },
  poison: { fr: 'Poison', en: 'Poison', color: '#b567ce' },
  psychic: { fr: 'Psy', en: 'Psychic', color: '#fa7179' },
  rock: { fr: 'Roche', en: 'Rock', color: '#c9b788' },
  steel: { fr: 'Acier', en: 'Steel', color: '#5595a2' },
  water: { fr: 'Eau', en: 'Water', color: '#4d90d5' },
};

/** Multiplicateurs Pokémon GO (pas d'immunité : double résistance à la place). */
export const SUPER_EFFECTIVE = 1.6;
export const NOT_VERY_EFFECTIVE = 0.625;
export const DOUBLE_RESISTED = 0.390625;

const SE: Record<PokemonType, PokemonType[]> = {
  normal: [],
  fire: ['grass', 'ice', 'bug', 'steel'],
  water: ['fire', 'ground', 'rock'],
  electric: ['water', 'flying'],
  grass: ['water', 'ground', 'rock'],
  ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
  poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'],
  flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'],
  bug: ['grass', 'psychic', 'dark'],
  rock: ['fire', 'ice', 'flying', 'bug'],
  ghost: ['psychic', 'ghost'],
  dragon: ['dragon'],
  dark: ['psychic', 'ghost'],
  steel: ['ice', 'rock', 'fairy'],
  fairy: ['fighting', 'dragon', 'dark'],
};

const NVE: Record<PokemonType, PokemonType[]> = {
  normal: ['rock', 'steel'],
  fire: ['fire', 'water', 'rock', 'dragon'],
  water: ['water', 'grass', 'dragon'],
  electric: ['electric', 'grass', 'dragon'],
  grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  ice: ['fire', 'water', 'ice', 'steel'],
  fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'],
  ground: ['grass', 'bug'],
  flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel'],
  bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'],
  ghost: ['dark'],
  dragon: ['steel'],
  dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'],
  fairy: ['fire', 'poison', 'steel'],
};

/** Types « immunisés » dans les autres jeux → double résistance dans GO. */
const IMMUNE: Record<PokemonType, PokemonType[]> = {
  normal: ['ghost'],
  fighting: ['ghost'],
  poison: ['steel'],
  ground: ['flying'],
  psychic: ['dark'],
  ghost: ['normal'],
  dragon: ['fairy'],
  electric: ['ground'],
  fire: [], water: [], grass: [], ice: [], flying: [], bug: [], rock: [],
  dark: [], steel: [], fairy: [],
};

/** Multiplicateur d'une attaque de type `attacker` contre un défenseur mono-type. */
export function effectiveness(attacker: PokemonType, defender: PokemonType): number {
  if (IMMUNE[attacker]?.includes(defender)) return DOUBLE_RESISTED;
  if (SE[attacker]?.includes(defender)) return SUPER_EFFECTIVE;
  if (NVE[attacker]?.includes(defender)) return NOT_VERY_EFFECTIVE;
  return 1;
}

/** Multiplicateur contre un défenseur (1 ou 2 types). */
export function effectivenessAgainst(
  attacker: PokemonType,
  defenderTypes: readonly string[],
): number {
  return defenderTypes
    .filter((t): t is PokemonType => TYPES.includes(t as PokemonType))
    .reduce((acc, t) => acc * effectiveness(attacker, t), 1);
}

/** Faiblesses / résistances d'un Pokémon, triées du pire au meilleur. */
export function defensiveProfile(defenderTypes: readonly string[]) {
  return TYPES.map((attacker) => ({
    type: attacker,
    multiplier: effectivenessAgainst(attacker, defenderTypes),
  })).sort((a, b) => b.multiplier - a.multiplier);
}

export function isType(value: string): value is PokemonType {
  return TYPES.includes(value as PokemonType);
}
