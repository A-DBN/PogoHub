import { CPMS, cpm } from './cpm';

export type BaseStats = { atk: number; def: number; hp: number };
export type IVs = { atk: number; def: number; hp: number };

export type StatLine = {
  level: number;
  ivs: IVs;
  atk: number; // arrondi à 0,1 comme PvPoke
  def: number;
  hp: number; // entier (plancher)
  cp: number;
  statProduct: number;
};

/** Formule de PC de Pokémon GO (identique à Pokemon.js de PvPoke). */
export function calcCP(base: BaseStats, ivs: IVs, level: number): number {
  const m = cpm(level);
  const cp = Math.floor(
    ((base.atk + ivs.atk) *
      Math.sqrt(base.def + ivs.def) *
      Math.sqrt(base.hp + ivs.hp) *
      m *
      m) /
      10,
  );
  return Math.max(10, cp);
}

export function calcStats(base: BaseStats, ivs: IVs, level: number): StatLine {
  const m = cpm(level);
  const atk = (base.atk + ivs.atk) * m;
  const def = (base.def + ivs.def) * m;
  const hp = Math.floor((base.hp + ivs.hp) * m);
  return {
    level,
    ivs,
    atk: Math.round(atk * 10) / 10,
    def: Math.round(def * 10) / 10,
    hp,
    cp: calcCP(base, ivs, level),
    statProduct: Math.round(atk * def * hp),
  };
}

/** Tous les niveaux possibles (1 → 55 par pas de 0,5). */
export function allLevels(maxLevel = 51): number[] {
  const out: number[] = [];
  for (let i = 0; i < CPMS.length; i++) {
    const lvl = 1 + i / 2;
    if (lvl > maxLevel) break;
    out.push(lvl);
  }
  return out;
}

/**
 * Meilleur combo niveau/IV sous une limite de PC : maximise le stat product,
 * c'est la définition du « rang 1 » chez PvPoke.
 * `cpLimit = null` → Master (pas de limite) : niveau max, IV parfaits.
 */
export function rank1(
  base: BaseStats,
  cpLimit: number | null,
  maxLevel = 51,
): StatLine {
  if (cpLimit === null) {
    return calcStats(base, { atk: 15, def: 15, hp: 15 }, maxLevel);
  }
  const levels = allLevels(maxLevel);
  let best: StatLine | null = null;
  for (let a = 0; a <= 15; a++) {
    for (let d = 0; d <= 15; d++) {
      for (let h = 0; h <= 15; h++) {
        const ivs = { atk: a, def: d, hp: h };
        // le PC croît avec le niveau : on prend le plus haut niveau qui tient
        let lo = 0;
        let hi = levels.length - 1;
        let pick = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (calcCP(base, ivs, levels[mid]) <= cpLimit) {
            pick = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (pick < 0) continue;
        const line = calcStats(base, ivs, levels[pick]);
        if (!best || line.statProduct > best.statProduct) best = line;
      }
    }
  }
  return best ?? calcStats(base, { atk: 15, def: 15, hp: 15 }, levels[0]);
}

/**
 * Niveau atteignant au mieux un PC visé, sans le dépasser.
 *
 * Le PC est une fonction en escalier du niveau : viser 1500 ne donne presque
 * jamais 1500 pile. On renvoie donc le niveau le plus haut qui reste sous la
 * cible, et le PC réellement obtenu — c'est ce que fait le jeu quand on
 * amplifie. Sous le PC du niveau 1, on retourne le niveau 1.
 */
export function levelForCp(
  base: BaseStats,
  ivs: IVs,
  targetCp: number,
  maxLevel = 51,
): { level: number; cp: number } {
  const levels = allLevels(maxLevel);
  let best = { level: levels[0], cp: calcCP(base, ivs, levels[0]) };
  for (const level of levels) {
    const cp = calcCP(base, ivs, level);
    if (cp > targetCp) break;
    best = { level, cp };
  }
  return best;
}

/** Nombre d'attaques rapides nécessaires pour charger une attaque chargée. */
export function moveCount(
  fast: { energyGain: number },
  charged: { energy: number },
): number {
  if (!fast?.energyGain) return 0;
  return Math.ceil(charged.energy / fast.energyGain);
}

const GENERATION_RANGES: Array<[number, number]> = [
  [1, 151],
  [152, 251],
  [252, 386],
  [387, 493],
  [494, 649],
  [650, 721],
  [722, 809],
  [810, 905],
  [906, 1025],
];

export function generationOf(dex: number): number {
  const index = GENERATION_RANGES.findIndex(([min, max]) => dex >= min && dex <= max);
  return index === -1 ? 0 : index + 1;
}

export const GENERATION_COUNT = GENERATION_RANGES.length;
