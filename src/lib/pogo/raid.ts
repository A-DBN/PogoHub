/**
 * Maths des combats PvE (raids, combats Dynamax) : PC de capture, PC boostés
 * par la météo et classement des meilleurs attaquants.
 *
 * Formule de dégâts Pokémon GO :
 *   dégâts = ⌊0,5 × puissance × (Attaque / Défense) × STAB × efficacité⌋ + 1
 */
import { calcCP, calcStats, type BaseStats } from './stats';
import { cpm } from './cpm';
import { effectivenessAgainst, type PokemonType } from './types';

export const STAB = 1.2;
export const CATCH_LEVEL = 20;
export const CATCH_LEVEL_BOOSTED = 25;
export const CATCH_IV_MIN = 10;
/** Les raids obscurs descendent à 6 : vérifié contre les fourchettes LeekDuck. */
export const CATCH_IV_MIN_SHADOW = 6;

/** Statistiques du boss selon le palier (valeurs officielles du jeu). */
export const RAID_TIERS: Record<number, { hp: number; cpm: number; label: string }> = {
  1: { hp: 600, cpm: 0.61, label: '1 étoile' },
  2: { hp: 1800, cpm: 0.67, label: '2 étoiles' },
  3: { hp: 3600, cpm: 0.73, label: '3 étoiles' },
  4: { hp: 9000, cpm: 0.79, label: '4 étoiles' },
  5: { hp: 15000, cpm: 0.79, label: '5 étoiles' },
  6: { hp: 22500, cpm: 0.79, label: 'Méga / Dynamax' },
};

/** Nombre maximum de dresseurs dans un salon (règles du jeu). */
export const RAID_MAX_PARTY = 20;
export const MAX_BATTLE_MAX_PARTY = 4;

/** Durée du combat en secondes, par palier (chronomètre du jeu). */
export const RAID_DURATION: Record<number, number> = {
  1: 180, 2: 180, 3: 180, 4: 300, 5: 300, 6: 300,
};

/** Niveau maximum d'amplification : le seul qui intéresse une fois capturé. */
export const MAX_LEVEL = 50;

/**
 * Niveaux d'attaquants proposés. 40 est la référence des sites de contres,
 * 50 le plafond, et les paliers bas servent aux comptes qui montent encore.
 */
export const CP_ATTACKER_LEVELS = [20, 25, 30, 35, 40, 45, 50] as const;

export function tierLevelFromLabel(label: string): number {
  const stars = /(\d)-Star/i.exec(label)?.[1];
  if (stars) return Number(stars);
  if (/mega|primal/i.test(label)) return 6;
  if (/max|dynamax|gigantamax/i.test(label)) return 6;
  if (/elite/i.test(label)) return 5;
  return 5;
}

/** Fourchette de PC à la capture (niveau 20, IV 10-15 ; niveau 25 si météo boostée). */
export function catchCpRange(base: BaseStats, boosted = false, shadow = false) {
  const level = boosted ? CATCH_LEVEL_BOOSTED : CATCH_LEVEL;
  const floor = shadow ? CATCH_IV_MIN_SHADOW : CATCH_IV_MIN;
  const min = calcCP(base, { atk: floor, def: floor, hp: floor }, level);
  const max = calcCP(base, { atk: 15, def: 15, hp: 15 }, level);
  return { level, min, max };
}

/** 10/10/10 sur 15/15/15 → 67 % ; 6/6/6 pour un raid obscur → 40 %. */
export const ivPercent = (iv: number) => Math.round((iv / 15) * 100);

/**
 * PC une fois amplifié au maximum, aux trois IV qui parlent au joueur.
 * Un raid garantit le plancher (`floorIv`), pas un spécimen sauvage : d'où le
 * 0 % qui n'a de sens que pour une capture dans la nature.
 */
export type MaxedCp = {
  level: number;
  floorIv: number;
  /** 0/0/0 : seulement atteignable dans la nature. */
  zero: number;
  /** Plancher garanti en raid. */
  floor: number;
  perfect: number;
};

export function maxedCp(base: BaseStats, shadow = false): MaxedCp {
  const floorIv = shadow ? CATCH_IV_MIN_SHADOW : CATCH_IV_MIN;
  const at = (iv: number) => calcCP(base, { atk: iv, def: iv, hp: iv }, MAX_LEVEL);
  return {
    level: MAX_LEVEL,
    floorIv,
    zero: at(0),
    floor: at(floorIv),
    perfect: at(15),
  };
}

/** Les quatre PC de capture : plancher / parfait, avec et sans météo. */
export type CatchCp = {
  floorIv: number;
  normal: { floor: number; perfect: number; level: number };
  boosted: { floor: number; perfect: number; level: number };
};

export function catchCp(base: BaseStats, shadow = false): CatchCp {
  const floorIv = shadow ? CATCH_IV_MIN_SHADOW : CATCH_IV_MIN;
  const at = (level: number) => ({
    level,
    floor: calcCP(base, { atk: floorIv, def: floorIv, hp: floorIv }, level),
    perfect: calcCP(base, { atk: 15, def: 15, hp: 15 }, level),
  });
  return { floorIv, normal: at(CATCH_LEVEL), boosted: at(CATCH_LEVEL_BOOSTED) };
}

/**
 * Attaque vue par le moteur JcE. `power` et `durationMs` viennent du
 * GAME_MASTER (colonnes `pve*` de `Move`), pas du modèle par tours du JcJ.
 * `energy` est signée comme dans le jeu : positive pour une rapide (gain),
 * négative pour une chargée (coût).
 */
export type CounterMove = {
  moveId: string;
  nameFr: string;
  nameEn: string;
  type: string;
  power: number;
  energy: number;
  durationMs: number;
  isElite?: boolean;
};

export type CounterCandidate = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  /** Indispensable à l'affichage : trois formes de Kyurem partagent un nom. */
  form: string | null;
  formFr: string | null;
  types: string[];
  base: BaseStats;
  iconFile: string;
  /** Les Pokémon obscurs frappent plus fort et encaissent moins bien. */
  isShadow?: boolean;
  fastMoves: CounterMove[];
  chargedMoves: CounterMove[];
};

export type CounterResult = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  iconFile: string;
  types: string[];
  isShadow: boolean;
  fast: CounterMove;
  charged: CounterMove;
  dps: number;
  /** dégâts totaux infligés avant KO */
  tdo: number;
  /** compromis DPS / survie, métrique de classement */
  rating: number;
};

/** Bonus d'attaque et malus de défense d'un Pokémon obscur (valeurs du jeu). */
const SHADOW_ATTACK = 1.2;
const SHADOW_DEFENSE = 0.8333333;

function moveDamage(
  power: number,
  moveType: string,
  attackerTypes: readonly string[],
  attack: number,
  defenderTypes: readonly string[],
  defense: number,
) {
  const stab = attackerTypes.includes(moveType) ? STAB : 1;
  const eff = effectivenessAgainst(moveType as PokemonType, defenderTypes);
  return Math.floor(0.5 * power * (attack / defense) * stab * eff) + 1;
}

/**
 * Attaque de repli quand on ne connaît pas le movepool du boss : une attaque
 * neutre de puissance moyenne, toutes les deux secondes.
 */
const BOSS_REFERENCE_POWER = 25;
const BOSS_REFERENCE_INTERVAL = 2;

/**
 * Dégâts par seconde encaissés par un attaquant.
 * Avec le movepool du boss on moyenne le cycle « rapide + chargée » de chacun de
 * ses jeux d'attaques : un boss n'en a qu'un en combat, mais il est tiré au sort,
 * et la moyenne est ce qui rapproche l'estimation de la réalité d'un groupe.
 */
function incomingDps(
  boss: { types: string[]; fastMoves?: CounterMove[]; chargedMoves?: CounterMove[] },
  bossAttack: number,
  attackerTypes: readonly string[],
  attackerDefense: number,
): number {
  const fasts = (boss.fastMoves ?? []).filter((m) => m.durationMs && m.energy > 0);
  const chargeds = (boss.chargedMoves ?? []).filter((m) => m.durationMs && m.energy !== 0);

  if (!fasts.length || !chargeds.length) {
    return (
      moveDamage(
        BOSS_REFERENCE_POWER, boss.types[0] ?? 'normal', boss.types,
        bossAttack, attackerTypes, attackerDefense,
      ) / BOSS_REFERENCE_INTERVAL
    );
  }

  let total = 0;
  let count = 0;
  for (const fast of fasts) {
    const fastDamage = moveDamage(
      fast.power, fast.type, boss.types, bossAttack, attackerTypes, attackerDefense,
    );
    for (const charged of chargeds) {
      const chargedDamage = moveDamage(
        charged.power, charged.type, boss.types, bossAttack, attackerTypes, attackerDefense,
      );
      const perCharge = Math.ceil(Math.abs(charged.energy) / fast.energy);
      const cycleTime = perCharge * (fast.durationMs / 1000) + charged.durationMs / 1000;
      total += (perCharge * fastDamage + chargedDamage) / cycleTime;
      count++;
    }
  }
  return total / count;
}

/**
 * Classe les meilleurs attaquants contre un boss, au modèle JcE : cycle
 * « n attaques rapides + une chargée », durées d'animation réelles.
 * Attaquants supposés au niveau `attackerLevel` avec des IV 15/15/15.
 */
export function bestCounters(
  boss: {
    types: string[];
    base: BaseStats;
    tierLevel: number;
    /** Movepool du boss : affine les dégâts encaissés, donc le TDO. */
    fastMoves?: CounterMove[];
    chargedMoves?: CounterMove[];
  },
  candidates: CounterCandidate[],
  options?: { attackerLevel?: number; limit?: number },
): CounterResult[] {
  const level = options?.attackerLevel ?? 40;
  const limit = options?.limit ?? 12;
  const tier = RAID_TIERS[boss.tierLevel] ?? RAID_TIERS[5];
  const bossDefense = (boss.base.def + 15) * tier.cpm;
  const bossAttack = (boss.base.atk + 15) * tier.cpm;

  const results: CounterResult[] = [];

  for (const candidate of candidates) {
    const stats = calcStats(candidate.base, { atk: 15, def: 15, hp: 15 }, level);
    const shadow = Boolean(candidate.isShadow);
    const attack = (candidate.base.atk + 15) * cpm(level) * (shadow ? SHADOW_ATTACK : 1);
    const defense = stats.def * (shadow ? SHADOW_DEFENSE : 1);

    const incoming = incomingDps(boss, bossAttack, candidate.types, defense);
    const survival = stats.hp / Math.max(1, incoming);

    let best: CounterResult | null = null;
    for (const fast of candidate.fastMoves) {
      if (!fast.durationMs || fast.energy <= 0) continue;
      const fastDamage = moveDamage(
        fast.power, fast.type, candidate.types, attack, boss.types, bossDefense,
      );
      const fastTime = fast.durationMs / 1000;
      for (const charged of candidate.chargedMoves) {
        if (!charged.durationMs) continue;
        const cost = Math.abs(charged.energy);
        if (!cost) continue;
        const chargedDamage = moveDamage(
          charged.power, charged.type, candidate.types, attack, boss.types, bossDefense,
        );
        const fastPerCharge = Math.ceil(cost / fast.energy);
        const cycleTime = fastPerCharge * fastTime + charged.durationMs / 1000;
        const cycleDamage = fastPerCharge * fastDamage + chargedDamage;
        const dps = cycleDamage / cycleTime;
        const tdo = dps * survival;
        // métrique GamePress DPS³ × TDO, écrite normalisée pour rester lisible :
        // même classement, mais une note du même ordre de grandeur que le DPS
        const rating = Math.pow(dps, 0.75) * Math.pow(tdo, 0.25);
        if (!best || rating > best.rating) {
          best = {
            speciesId: candidate.speciesId,
            nameFr: candidate.nameFr,
            nameEn: candidate.nameEn,
            form: candidate.form,
            formFr: candidate.formFr,
            iconFile: candidate.iconFile,
            types: candidate.types,
            isShadow: shadow,
            fast,
            charged,
            dps: Math.round(dps * 100) / 100,
            tdo: Math.round(tdo),
            rating: Math.round(rating * 100) / 100,
          };
        }
      }
    }
    if (best) results.push(best);
  }

  return results.sort((a, b) => b.rating - a.rating).slice(0, limit);
}

/**
 * Une équipe réaliste n'aligne pas six fois le meilleur contre : on prend la
 * moyenne des `TEAM_SIZE` premiers du classement comme DPS d'un joueur.
 */
const TEAM_SIZE = 6;

/**
 * Part du DPS théorique du meilleur contre qu'un joueur délivre réellement.
 *
 * Le facteur couvre d'un coup l'uptime (esquives, KO, retours au lobby) et la
 * qualité du roster. Trois profils, calés sur les retours de terrain d'un
 * Groudon 5★ (minimum 3-4, conseillé 6-7, tranquille à partir de 8) et
 * recoupés sur Rayquaza 5★ (minimum 2, comme pokemongohub) :
 */
const THROUGHPUT = {
  /** Meilleurs contres au niveau demandé, joués proprement. */
  optimal: 0.9,
  /** Lobby ordinaire : niveaux et types hétérogènes, KO fréquents. */
  typical: 0.34,
  /** Marge confortable : on termine largement avant le chronomètre. */
  comfortable: 0.27,
} as const;

export type PlayerEstimate = {
  /** Plancher théorique : que des meilleurs contres, joués parfaitement. */
  min: number;
  /** Ce qu'il faut viser avec un groupe ordinaire. */
  recommended: number;
  /** À partir de là, le raid passe sans y penser. */
  comfortable: number;
  /** Secondes pour venir à bout du boss en solo, `null` si hors chronomètre. */
  soloSeconds: number | null;
  /** DPS moyen retenu pour un joueur. */
  teamDps: number;
};

/**
 * Nombre de joueurs, déduit des PV du boss (`RAID_TIERS`) et du DPS moyen des
 * meilleurs contres, plutôt que d'un barème inventé.
 */
export function recommendedPlayers(
  tierLevel: number,
  counters: CounterResult[],
  options?: { maxParty?: number },
): PlayerEstimate | null {
  const top = counters.slice(0, TEAM_SIZE);
  if (!top.length) return null;

  const tier = RAID_TIERS[tierLevel] ?? RAID_TIERS[5];
  const duration = RAID_DURATION[tierLevel] ?? 300;
  const teamDps = top.reduce((sum, c) => sum + c.dps, 0) / top.length;
  // conseiller 8 joueurs sur un combat qui en accepte 4 n'aide personne
  const cap = options?.maxParty ?? RAID_MAX_PARTY;

  const playersFor = (throughput: number) =>
    Math.min(cap, Math.max(1, Math.ceil(tier.hp / (teamDps * duration * throughput))));

  const min = playersFor(THROUGHPUT.optimal);
  const soloSeconds = tier.hp / (teamDps * THROUGHPUT.optimal);

  return {
    min,
    // les paliers ne peuvent que monter, même sur un boss trivial
    recommended: Math.max(min, playersFor(THROUGHPUT.typical)),
    comfortable: Math.min(cap, Math.max(min + 1, playersFor(THROUGHPUT.comfortable))),
    soloSeconds: soloSeconds <= duration ? Math.round(soloSeconds) : null,
    teamDps: Math.round(teamDps * 10) / 10,
  };
}
