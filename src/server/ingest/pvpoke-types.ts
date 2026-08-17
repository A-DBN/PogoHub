/** Formes des données PvPoke consommées par l'ingestion. */

export type GmPokemon = {
  dex: number;
  speciesName: string;
  speciesId: string;
  baseStats: { atk: number; def: number; hp: number };
  types: string[];
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  tags?: string[];
  defaultIVs?: Record<string, [number, number, number, number]>;
  buddyDistance?: number;
  thirdMoveCost?: number;
  thirdMoveStardust?: number;
  family?: { id: string; parent?: string; evolutions?: string[] };
  released?: boolean;
};

export type GmMove = {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown?: number;
  buffs?: number[];
  buffTarget?: string;
  buffApplyChance?: string | number;
};

export type GmFormat = {
  title: string;
  cup: string;
  cp: number;
  meta?: string;
  rules?: string[];
  showCup?: boolean;
  hideRankings?: boolean;
};

export type GmCup = {
  name: string;
  title: string;
  include?: Array<{ filterType: string; values?: string[]; name?: string }>;
  exclude?: Array<{ filterType: string; values?: string[]; name?: string }>;
  league?: number;
};

export type GameMaster = {
  timestamp?: string;
  pokemon: GmPokemon[];
  moves: GmMove[];
  formats: GmFormat[];
  cups: GmCup[];
  shadowPokemon?: string[];
};

export type RankingEntry = {
  speciesId: string;
  speciesName: string;
  rating?: number;
  score: number;
  scores?: number[];
  moveset: string[];
  moves?: {
    fastMoves?: Array<{ moveId: string; uses: number }>;
    chargedMoves?: Array<{ moveId: string; uses: number }>;
  };
  matchups?: Array<{ opponent: string; rating: number; opRating?: number }>;
  counters?: Array<{ opponent: string; rating: number; opRating?: number }>;
  stats?: { product: number; atk: number; def: number; hp: number };
};

export type ScrapedDuckEvent = {
  eventID: string;
  name: string;
  eventType: string;
  heading?: string;
  link?: string;
  image?: string;
  start?: string | null;
  end?: string | null;
  extraData?: unknown;
};

export type ShinyApiEntry = {
  id: number;
  name: string;
  found_wild?: boolean;
  found_raid?: boolean;
  found_egg?: boolean;
  found_research?: boolean;
  found_evolution?: boolean;
  found_photobomb?: boolean;
};
