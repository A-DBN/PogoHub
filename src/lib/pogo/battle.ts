/**
 * Moteur de combat JcJ (GO Battle League).
 *
 * Rien à voir avec `raid.ts` : le JcJ tourne par **tours de 0,5 s**, l'énergie
 * et la puissance des attaques y ont leurs propres valeurs (colonnes JcJ de
 * `Move`), et il s'y ajoute les boucliers et les modificateurs de stats.
 *
 * Portée du modèle : il simule fidèlement le déroulé mécanique d'un 1v1
 * (dégâts, énergie, boucliers, buffs, priorité au plus fort en Attaque). Il ne
 * simule **pas** la psychologie : pas d'appât, pas d'anticipation de bouclier,
 * pas de switch. Les deux camps jouent la même stratégie simple, ce qui rend le
 * résultat reproductible et lisible, mais un peu plus favorable aux Pokémon
 * dont l'attaque chargée est bon marché.
 */
import { calcStats, type BaseStats, type IVs } from './stats';
import { effectivenessAgainst, type PokemonType } from './types';

/** Un tour de JcJ dure une demi-seconde. */
export const TURN_SECONDS = 0.5;
/** Multiplicateur de dégâts propre au JcJ. */
export const PVP_BONUS = 1.3;
export const STAB = 1.2;
/** Au-delà, le combat est déclaré nul : le chrono réel est de 240 s. */
export const MAX_TURNS = 480;

/** Multiplicateurs par palier de buff, de −4 à +4 (valeurs du jeu). */
const STAGE_MULTIPLIERS = [0.5, 0.5714286, 0.6666667, 0.8, 1, 1.25, 1.5, 1.75, 2];
const stageMultiplier = (stage: number) =>
  STAGE_MULTIPLIERS[Math.max(-4, Math.min(4, stage)) + 4];

export type BattleMove = {
  moveId: string;
  nameFr: string;
  nameEn: string;
  type: string;
  power: number;
  /** Coût pour une chargée, gain pour une rapide. */
  energy: number;
  energyGain: number;
  turns: number;
  /** `[attaque, défense]` en paliers, avec une probabilité et une cible. */
  buffs?: { buffs: [number, number]; chance: number; target: 'self' | 'opponent' } | null;
};

export type Combatant = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  types: string[];
  base: BaseStats;
  ivs: IVs;
  level: number;
  isShadow: boolean;
  fast: BattleMove;
  charged: BattleMove[];
};

/** Bonus d'attaque et malus de défense d'un Pokémon obscur. */
const SHADOW_ATTACK = 1.2;
const SHADOW_DEFENSE = 0.8333333;

export type ResolvedStats = { atk: number; def: number; hp: number; cp: number };

export function resolveStats(combatant: Combatant): ResolvedStats {
  const line = calcStats(combatant.base, combatant.ivs, combatant.level);
  return {
    atk: line.atk * (combatant.isShadow ? SHADOW_ATTACK : 1),
    def: line.def * (combatant.isShadow ? SHADOW_DEFENSE : 1),
    hp: line.hp,
    cp: line.cp,
  };
}

/** Dégâts d'une attaque en JcJ. */
export function damageOf(
  move: BattleMove,
  attackerTypes: readonly string[],
  attack: number,
  defenderTypes: readonly string[],
  defense: number,
): number {
  const stab = attackerTypes.includes(move.type) ? STAB : 1;
  const effectiveness = effectivenessAgainst(move.type as PokemonType, defenderTypes);
  return (
    Math.floor(0.5 * move.power * (attack / defense) * stab * effectiveness * PVP_BONUS) + 1
  );
}

type Side = {
  combatant: Combatant;
  stats: ResolvedStats;
  hp: number;
  energy: number;
  shields: number;
  atkStage: number;
  defStage: number;
  cooldown: number;
  /** Dégâts infligés, pour départager un match nul au temps. */
  dealt: number;
};

const makeSide = (combatant: Combatant, shields: number): Side => {
  const stats = resolveStats(combatant);
  return {
    combatant,
    stats,
    hp: stats.hp,
    energy: 0,
    shields,
    atkStage: 0,
    defStage: 0,
    cooldown: combatant.fast.turns,
    dealt: 0,
  };
};

const attackOf = (side: Side) => side.stats.atk * stageMultiplier(side.atkStage);
const defenseOf = (side: Side) => side.stats.def * stageMultiplier(side.defStage);

/**
 * Choix de l'attaque chargée : la plus rentable en dégâts par énergie parmi
 * celles que l'on peut payer, sauf si une autre met K.O. immédiatement.
 */
function pickCharged(attacker: Side, defender: Side): BattleMove | null {
  const affordable = attacker.combatant.charged.filter((move) => attacker.energy >= move.energy);
  if (!affordable.length) return null;

  const withDamage = affordable.map((move) => ({
    move,
    damage: damageOf(
      move,
      attacker.combatant.types,
      attackOf(attacker),
      defender.combatant.types,
      defenseOf(defender),
    ),
  }));

  // un K.O. immédiat prime sur toute considération de rendement
  const lethal = withDamage.filter((entry) => defender.shields === 0 && entry.damage >= defender.hp);
  if (lethal.length) {
    return lethal.sort((a, b) => a.move.energy - b.move.energy)[0].move;
  }

  return pickWithBait(withDamage, defender.shields > 0);
}

/**
 * Appât de bouclier.
 *
 * Tant que l'adversaire a un bouclier, on envoie la chargée la moins chère : il
 * la bloquera, et la grosse passera ensuite. Sans ce comportement, les Pokémon
 * qui vivent de l'appât (Mimiqui, Altaria, Coudlangue…) perdent des duels
 * qu'ils gagnent en jeu — c'était la source de la quasi-totalité des écarts
 * avec les matchups PvPoke.
 */
function pickWithBait<T extends { move: BattleMove; damage: number }>(
  options: T[],
  opponentHasShield: boolean,
): BattleMove {
  if (opponentHasShield && options.length > 1) {
    const cheapest = [...options].sort((a, b) => a.move.energy - b.move.energy)[0];
    const strongest = [...options].sort((a, b) => b.damage - a.damage)[0];
    // n'appâter que si la seconde frappe vaut nettement plus cher que l'appât
    if (cheapest.move.energy < strongest.move.energy) return cheapest.move;
  }
  return [...options].sort((a, b) => b.damage / b.move.energy - a.damage / a.move.energy)[0].move;
}

function applyBuffs(move: BattleMove, attacker: Side, defender: Side) {
  const buff = move.buffs;
  if (!buff || !buff.buffs) return;
  // le modèle est déterministe : on applique l'espérance plutôt qu'un tirage,
  // sinon deux simulations identiques ne donnent pas le même résultat
  if (buff.chance < 1) return;
  const [atk, def] = buff.buffs;
  const target = buff.target === 'self' ? attacker : defender;
  target.atkStage = Math.max(-4, Math.min(4, target.atkStage + atk));
  target.defStage = Math.max(-4, Math.min(4, target.defStage + def));
}

/** Une chargée passe : bouclier consommé, ou dégâts complets. */
function throwCharged(move: BattleMove, attacker: Side, defender: Side) {
  attacker.energy -= move.energy;
  if (defender.shields > 0) {
    defender.shields -= 1;
    defender.hp -= 1; // un bouclier laisse toujours passer 1 point
    attacker.dealt += 1;
  } else {
    const damage = damageOf(
      move,
      attacker.combatant.types,
      attackOf(attacker),
      defender.combatant.types,
      defenseOf(defender),
    );
    defender.hp -= damage;
    attacker.dealt += damage;
  }
  applyBuffs(move, attacker, defender);
}

export type BattleResult = {
  winner: 'a' | 'b' | 'draw';
  hpA: number;
  hpB: number;
  shieldsA: number;
  shieldsB: number;
  turns: number;
  /** Score de 0 à 1000 façon PvPoke : part des PV conservés de chaque côté. */
  ratingA: number;
  ratingB: number;
};

export function simulateBattle(
  a: Combatant,
  b: Combatant,
  options?: { shieldsA?: number; shieldsB?: number },
): BattleResult {
  const sideA = makeSide(a, options?.shieldsA ?? 1);
  const sideB = makeSide(b, options?.shieldsB ?? 1);

  let turn = 0;
  while (turn < MAX_TURNS && sideA.hp > 0 && sideB.hp > 0) {
    turn++;
    sideA.cooldown--;
    sideB.cooldown--;

    // 1) les attaques rapides qui se terminent ce tour
    const resolved: Side[] = [];
    for (const [attacker, defender] of [
      [sideA, sideB],
      [sideB, sideA],
    ] as const) {
      if (attacker.cooldown > 0) continue;
      const damage = damageOf(
        attacker.combatant.fast,
        attacker.combatant.types,
        attackOf(attacker),
        defender.combatant.types,
        defenseOf(defender),
      );
      defender.hp -= damage;
      attacker.dealt += damage;
      attacker.energy = Math.min(100, attacker.energy + attacker.combatant.fast.energyGain);
      attacker.cooldown = attacker.combatant.fast.turns;
      resolved.push(attacker);
    }

    if (sideA.hp <= 0 || sideB.hp <= 0) break;

    // 2) les chargées, jouables dans la foulée d'une rapide.
    // À égalité, c'est la meilleure Attaque qui passe en premier (CMP).
    const throwers = resolved
      .map((side) => {
        const defender = side === sideA ? sideB : sideA;
        const move = pickCharged(side, defender);
        return move ? { side, defender, move } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((x, y) => attackOf(y.side) - attackOf(x.side));

    // CMP parfaitement à égalité : le jeu tranche au hasard. Un simulateur
    // déterministe ne peut pas trancher sans avantager arbitrairement le camp
    // passé en premier — or c'est lui dont on affiche le taux de victoire. On
    // résout donc les deux chargées simultanément.
    const tie =
      throwers.length === 2 && attackOf(throwers[0].side) === attackOf(throwers[1].side);

    if (tie) {
      for (const { side, defender, move } of throwers) throwCharged(move, side, defender);
    } else {
      for (const { side, defender, move } of throwers) {
        if (side.hp <= 0) continue; // mis K.O. par la chargée adverse résolue avant
        throwCharged(move, side, defender);
      }
    }
  }

  const ratio = (side: Side) => Math.max(0, side.hp) / side.stats.hp;
  const winner = sideA.hp <= 0 && sideB.hp <= 0
    ? 'draw'
    : sideB.hp <= 0
      ? 'a'
      : sideA.hp <= 0
        ? 'b'
        : ratio(sideA) === ratio(sideB)
          ? 'draw'
          : ratio(sideA) > ratio(sideB)
            ? 'a'
            : 'b';

  return {
    winner,
    hpA: Math.max(0, sideA.hp),
    hpB: Math.max(0, sideB.hp),
    shieldsA: sideA.shields,
    shieldsB: sideB.shields,
    turns: turn,
    ratingA: Math.round(ratio(sideA) * 1000),
    ratingB: Math.round(ratio(sideB) * 1000),
  };
}

// ---------------------------------------------------------------- combat 3v3

/** Chronomètre d'un combat GBL : 240 s. */
export const BATTLE_TURNS = 480;
/** Après un changement volontaire, on est bloqué 60 s. */
export const SWITCH_COOLDOWN_TURNS = 120;
/** Chaque joueur dispose de deux boucliers pour toute la partie. */
export const SHIELDS_PER_PLAYER = 2;

/** Quand dépenser un bouclier. */
export type ShieldPolicy = 'early' | 'late';
/** Rester coûte que coûte, ou sortir d'un mauvais duel quand c'est possible. */
export type SwitchPolicy = 'stay' | 'reactive';

export type Strategy = { shields: ShieldPolicy; switching: SwitchPolicy };

export const STRATEGIES: Strategy[] = [
  { shields: 'early', switching: 'stay' },
  { shields: 'early', switching: 'reactive' },
  { shields: 'late', switching: 'stay' },
  { shields: 'late', switching: 'reactive' },
];

type MemberState = {
  combatant: Combatant;
  stats: ResolvedStats;
  hp: number;
  energy: number;
  atkStage: number;
  defStage: number;
  cooldown: number;
};

type TeamState = {
  members: MemberState[];
  active: number;
  shields: number;
  switchCooldown: number;
  strategy: Strategy;
};

const makeMember = (combatant: Combatant): MemberState => {
  const stats = resolveStats(combatant);
  return {
    combatant, stats, hp: stats.hp, energy: 0,
    atkStage: 0, defStage: 0, cooldown: combatant.fast.turns,
  };
};

const makeTeam = (team: Combatant[], lead: number, strategy: Strategy): TeamState => ({
  members: team.map(makeMember),
  active: lead,
  shields: SHIELDS_PER_PLAYER,
  switchCooldown: 0,
  strategy,
});

const activeOf = (team: TeamState) => team.members[team.active];
const alive = (team: TeamState) => team.members.filter((member) => member.hp > 0);
const teamAttack = (member: MemberState) => member.stats.atk * stageMultiplier(member.atkStage);
const teamDefense = (member: MemberState) => member.stats.def * stageMultiplier(member.defStage);

/**
 * Note d'un duel, du point de vue de `mine` : positive si l'échange lui est
 * favorable. Sert à décider d'un changement, pas à afficher un résultat.
 */
function matchupScore(mine: MemberState, theirs: MemberState): number {
  const myDamage = damageOf(
    mine.combatant.fast, mine.combatant.types, teamAttack(mine),
    theirs.combatant.types, teamDefense(theirs),
  ) / mine.combatant.fast.turns;
  const theirDamage = damageOf(
    theirs.combatant.fast, theirs.combatant.types, teamAttack(theirs),
    mine.combatant.types, teamDefense(mine),
  ) / theirs.combatant.fast.turns;

  // combien de tours chacun tient face à l'autre
  const myTurns = mine.hp / Math.max(0.01, theirDamage);
  const theirTurns = theirs.hp / Math.max(0.01, myDamage);
  return myTurns - theirTurns;
}

/** Meilleur remplaçant disponible face au Pokémon adverse actif. */
function bestSwitch(team: TeamState, opponent: MemberState): number | null {
  const candidates = team.members
    .map((member, index) => ({ member, index }))
    .filter(({ member, index }) => member.hp > 0 && index !== team.active);
  if (!candidates.length) return null;

  const ranked = candidates
    .map((entry) => ({ ...entry, score: matchupScore(entry.member, opponent) }))
    .sort((x, y) => y.score - x.score);
  return ranked[0].index;
}

/** Un bouclier vaut-il d'être dépensé sur cette attaque ? */
function shouldShield(team: TeamState, incoming: number, target: MemberState): boolean {
  if (team.shields <= 0) return false;
  // toujours bloquer un coup fatal : perdre un Pokémon coûte plus qu'un bouclier
  if (incoming >= target.hp) return true;
  return team.strategy.shields === 'early'
    ? true
    : incoming >= target.hp * 0.5; // « late » : on garde le bouclier pour les gros coups
}

export type TeamBattleResult = {
  winner: 'a' | 'b' | 'draw';
  /** Pokémon encore debout de chaque côté. */
  remainingA: number;
  remainingB: number;
  turns: number;
  switchesA: number;
  switchesB: number;
};

/**
 * Combat 3v3 complet : boucliers partagés, chronomètre de changement,
 * remplacement forcé au K.O. et changements volontaires selon la stratégie.
 */
export function simulateTeamBattle(
  teamA: Combatant[],
  teamB: Combatant[],
  options: {
    leadA: number;
    leadB: number;
    strategyA: Strategy;
    strategyB: Strategy;
  },
): TeamBattleResult {
  const a = makeTeam(teamA, options.leadA, options.strategyA);
  const b = makeTeam(teamB, options.leadB, options.strategyB);
  let switchesA = 0;
  let switchesB = 0;
  let turn = 0;

  /** Décision de changement, prise sur l'état d'avant le tour (voir plus bas). */
  const planSwitch = (team: TeamState, opponent: TeamState): number | null => {
    if (team.strategy.switching !== 'reactive' || team.switchCooldown > 0) return null;
    const current = activeOf(team);
    const foe = activeOf(opponent);
    const currentScore = matchupScore(current, foe);
    if (currentScore >= 0) return null;
    const target = bestSwitch(team, foe);
    if (target === null) return null;
    return matchupScore(team.members[target], foe) > currentScore ? target : null;
  };

  const applySwitch = (team: TeamState, target: number) => {
    const current = activeOf(team);
    // les modificateurs de stats sautent quand on sort
    current.atkStage = 0;
    current.defStage = 0;
    team.active = target;
    team.switchCooldown = SWITCH_COOLDOWN_TURNS;
    activeOf(team).cooldown = activeOf(team).combatant.fast.turns;
  };

  while (turn < BATTLE_TURNS && alive(a).length && alive(b).length) {
    turn++;
    a.switchCooldown = Math.max(0, a.switchCooldown - 1);
    b.switchCooldown = Math.max(0, b.switchCooldown - 1);

    // Changements volontaires : on sort d'un duel perdu pour encaisser moins.
    // Les deux décisions se prennent sur le même état, sinon celui qui décide
    // en premier voit déjà le changement de l'autre — et gagne un avantage
    // systématique, visible sur un miroir A contre A.
    const planA = planSwitch(a, b);
    const planB = planSwitch(b, a);
    if (planA !== null) {
      applySwitch(a, planA);
      switchesA++;
    }
    if (planB !== null) {
      applySwitch(b, planB);
      switchesB++;
    }

    const actA = activeOf(a);
    const actB = activeOf(b);
    actA.cooldown--;
    actB.cooldown--;

    // 1) attaques rapides
    const resolved: Array<[TeamState, TeamState]> = [];
    for (const [team, foe] of [
      [a, b],
      [b, a],
    ] as const) {
      const attacker = activeOf(team);
      const defender = activeOf(foe);
      if (attacker.cooldown > 0) continue;
      const damage = damageOf(
        attacker.combatant.fast, attacker.combatant.types, teamAttack(attacker),
        defender.combatant.types, teamDefense(defender),
      );
      defender.hp -= damage;
      attacker.energy = Math.min(100, attacker.energy + attacker.combatant.fast.energyGain);
      attacker.cooldown = attacker.combatant.fast.turns;
      resolved.push([team, foe]);
    }

    // 2) attaques chargées, avec décision de bouclier côté défenseur
    const throws = resolved
      .map(([team, foe]) => {
        const attacker = activeOf(team);
        const defender = activeOf(foe);
        if (attacker.hp <= 0) return null;
        const affordable = attacker.combatant.charged.filter((m) => attacker.energy >= m.energy);
        if (!affordable.length) return null;
        const scored = affordable.map((move) => ({
          move,
          damage: damageOf(
            move, attacker.combatant.types, teamAttack(attacker),
            defender.combatant.types, teamDefense(defender),
          ),
        }));
        const chosen = pickWithBait(scored, foe.shields > 0);
        const best = scored.find((entry) => entry.move === chosen)!;
        return { team, foe, attacker, defender, ...best };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((x, y) => teamAttack(y.attacker) - teamAttack(x.attacker));

    // même égalité de CMP qu'en 1v1 : à Attaque identique, on résout les deux
    // chargées plutôt que d'avantager le camp trié en premier
    const cmpTie =
      throws.length === 2 && teamAttack(throws[0].attacker) === teamAttack(throws[1].attacker);

    for (const { foe, attacker, defender, move, damage } of throws) {
      if (!cmpTie && attacker.hp <= 0) continue;
      attacker.energy -= move.energy;
      if (shouldShield(foe, damage, defender)) {
        foe.shields -= 1;
        defender.hp -= 1;
      } else {
        defender.hp -= damage;
      }
      const buff = move.buffs;
      if (buff?.buffs && buff.chance >= 1) {
        const [atk, def] = buff.buffs;
        const target = buff.target === 'self' ? attacker : defender;
        target.atkStage = Math.max(-4, Math.min(4, target.atkStage + atk));
        target.defStage = Math.max(-4, Math.min(4, target.defStage + def));
      }
    }

    // 3) Remplacements forcés : un K.O. offre un changement gratuit.
    // Choisis sur l'état d'avant, là encore : sinon le camp remplacé en second
    // choisit en connaissant déjà le remplaçant adverse.
    const replacementA = activeOf(a).hp <= 0 ? bestSwitch(a, activeOf(b)) : null;
    const replacementB = activeOf(b).hp <= 0 ? bestSwitch(b, activeOf(a)) : null;
    for (const [team, next] of [
      [a, replacementA],
      [b, replacementB],
    ] as const) {
      if (next === null) continue;
      team.active = next;
      team.switchCooldown = 0;
      activeOf(team).cooldown = activeOf(team).combatant.fast.turns;
    }
  }

  const remainingA = alive(a).length;
  const remainingB = alive(b).length;
  const healthOf = (team: TeamState) =>
    team.members.reduce((sum, m) => sum + Math.max(0, m.hp) / m.stats.hp, 0);

  const winner =
    remainingA === remainingB
      ? healthOf(a) === healthOf(b)
        ? 'draw'
        : healthOf(a) > healthOf(b)
          ? 'a'
          : 'b'
      : remainingA > remainingB
        ? 'a'
        : 'b';

  return { winner, remainingA, remainingB, turns: turn, switchesA, switchesB };
}

export type ScenarioSweep = {
  /** Part de scénarios remportés par l'équipe A. */
  winRate: number;
  battles: number;
  /** Détail par couple de leads, pour repérer d'où viennent les défaites. */
  byLead: Array<{ leadA: number; leadB: number; winRate: number }>;
  /** Taux de victoire selon la stratégie adoptée par A. */
  byStrategy: Array<{ strategy: Strategy; winRate: number }>;
};

/**
 * Balaie tous les scénarios : chaque couple de leads (3×3) croisé avec chaque
 * couple de stratégies (4×4), soit 144 combats. On ne sait pas quel lead
 * l'adversaire choisira ni comment il jouera ses boucliers — la moyenne sur
 * l'ensemble dit si une compo tient globalement, pas seulement sur un scénario
 * favorable.
 */
export function sweepScenarios(teamA: Combatant[], teamB: Combatant[]): ScenarioSweep {
  const byLead: ScenarioSweep['byLead'] = [];
  const strategyTally = STRATEGIES.map((strategy) => ({ strategy, wins: 0, total: 0 }));
  let wins = 0;
  let total = 0;

  for (let leadA = 0; leadA < teamA.length; leadA++) {
    for (let leadB = 0; leadB < teamB.length; leadB++) {
      let leadWins = 0;
      let leadTotal = 0;
      for (const [indexA, strategyA] of STRATEGIES.entries()) {
        for (const strategyB of STRATEGIES) {
          const result = simulateTeamBattle(teamA, teamB, {
            leadA, leadB, strategyA, strategyB,
          });
          const won = result.winner === 'a' ? 1 : result.winner === 'draw' ? 0.5 : 0;
          leadWins += won;
          leadTotal++;
          strategyTally[indexA].wins += won;
          strategyTally[indexA].total++;
        }
      }
      byLead.push({ leadA, leadB, winRate: leadWins / leadTotal });
      wins += leadWins;
      total += leadTotal;
    }
  }

  return {
    winRate: total ? wins / total : 0,
    battles: total,
    byLead,
    byStrategy: strategyTally.map((entry) => ({
      strategy: entry.strategy,
      winRate: entry.total ? entry.wins / entry.total : 0,
    })),
  };
}

/** Scénarios de boucliers passés en revue pour juger un affrontement. */
export const SHIELD_SCENARIOS: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
];

export type MatchupResult = {
  a: string;
  b: string;
  /** Part de scénarios gagnés par A, de 0 à 1. */
  winRate: number;
  scenarios: Array<{ shields: [number, number]; winner: 'a' | 'b' | 'draw'; ratingA: number }>;
};

export type TeamSimulation = {
  matchups: MatchupResult[];
  /** Part d'affrontements remportés par l'équipe A. */
  winRate: number;
  /** Membres de A classés par nombre d'affrontements gagnés. */
  bestOfA: Array<{ speciesId: string; wins: number; total: number }>;
  worstOfA: Array<{ speciesId: string; wins: number; total: number }>;
};

/**
 * Matrice des 3×3 affrontements, chacun rejoué sur les scénarios de boucliers.
 *
 * On ne simule pas l'ordre de passage ni les changements : en GBL il dépend du
 * joueur. La matrice dit quels duels une compo gagne, ce qui est la question
 * qu'on se pose en construisant une équipe.
 */
export function simulateTeams(teamA: Combatant[], teamB: Combatant[]): TeamSimulation {
  const matchups: MatchupResult[] = [];
  const tally = new Map<string, { wins: number; total: number }>();

  for (const a of teamA) {
    for (const b of teamB) {
      const scenarios = SHIELD_SCENARIOS.map(([shieldsA, shieldsB]) => {
        const result = simulateBattle(a, b, { shieldsA, shieldsB });
        return {
          shields: [shieldsA, shieldsB] as [number, number],
          winner: result.winner,
          ratingA: result.ratingA,
        };
      });

      const wins = scenarios.filter((s) => s.winner === 'a').length;
      matchups.push({
        a: a.speciesId,
        b: b.speciesId,
        winRate: wins / scenarios.length,
        scenarios,
      });

      const entry = tally.get(a.speciesId) ?? { wins: 0, total: 0 };
      entry.wins += wins;
      entry.total += scenarios.length;
      tally.set(a.speciesId, entry);
    }
  }

  const ranked = [...tally.entries()]
    .map(([speciesId, entry]) => ({ speciesId, ...entry }))
    .sort((x, y) => y.wins / y.total - x.wins / x.total);

  const totalWins = ranked.reduce((sum, entry) => sum + entry.wins, 0);
  const totalRuns = ranked.reduce((sum, entry) => sum + entry.total, 0) || 1;

  return {
    matchups,
    winRate: totalWins / totalRuns,
    bestOfA: ranked.slice(0, 3),
    worstOfA: [...ranked].reverse().slice(0, 3),
  };
}
