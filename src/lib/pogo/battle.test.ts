import { describe, expect, it } from 'vitest';
import {
  damageOf, simulateBattle, simulateTeamBattle, sweepScenarios,
  type BattleMove, type Combatant,
} from './battle';

const move = (partial: Partial<BattleMove> & Pick<BattleMove, 'moveId' | 'type'>): BattleMove => ({
  nameFr: partial.moveId,
  nameEn: partial.moveId,
  power: 0,
  energy: 0,
  energyGain: 0,
  turns: 1,
  buffs: null,
  ...partial,
});

describe('damageOf', () => {
  /**
   * Formule JcJ : ⌊0,5 × puissance × Atk/Déf × STAB × efficacité × 1,3⌋ + 1.
   * Vérifiée à la main pour éviter qu'une refonte ne change les constantes
   * sans qu'on s'en aperçoive.
   */
  it('applique le multiplicateur JcJ de 1,3', () => {
    const attack = 100;
    const defense = 100;
    // 0,5 × 100 × 1 × 1 × 1 × 1,3 = 65 → +1
    expect(damageOf(move({ moveId: 'X', type: 'normal', power: 100 }), ['water'], attack, ['normal'], defense))
      .toBe(66);
  });

  it('cumule STAB et efficacité', () => {
    // 0,5 × 100 × 1 × 1,2 × 1,6 × 1,3 = 124,8 → 124 + 1
    expect(damageOf(move({ moveId: 'X', type: 'water', power: 100 }), ['water'], 100, ['fire'], 100))
      .toBe(125);
  });

  it('inflige au moins 1 point même sans puissance', () => {
    expect(damageOf(move({ moveId: 'X', type: 'normal', power: 0 }), [], 100, ['normal'], 100)).toBe(1);
  });
});

const dummy = (overrides: Partial<Combatant>): Combatant => ({
  speciesId: 'test',
  nameFr: 'Test',
  nameEn: 'Test',
  types: ['normal'],
  base: { atk: 150, def: 150, hp: 150 },
  ivs: { atk: 15, def: 15, hp: 15 },
  level: 40,
  isShadow: false,
  fast: move({ moveId: 'FAST', type: 'normal', power: 5, energyGain: 5, turns: 2 }),
  charged: [move({ moveId: 'CHARGED', type: 'normal', power: 90, energy: 50 })],
  ...overrides,
});

describe('simulateBattle', () => {
  it('donne la victoire au Pokémon nettement supérieur', () => {
    const strong = dummy({ speciesId: 'strong', base: { atk: 250, def: 200, hp: 200 } });
    const weak = dummy({ speciesId: 'weak', base: { atk: 80, def: 80, hp: 80 } });
    expect(simulateBattle(strong, weak, { shieldsA: 0, shieldsB: 0 }).winner).toBe('a');
  });

  it('est symétrique : deux Pokémon identiques font match nul', () => {
    const result = simulateBattle(dummy({}), dummy({}), { shieldsA: 1, shieldsB: 1 });
    expect(result.winner).toBe('draw');
    expect(result.hpA).toBe(result.hpB);
  });

  it('consomme les boucliers, qui ne laissent passer qu’un point', () => {
    const attacker = dummy({ speciesId: 'a' });
    const defender = dummy({ speciesId: 'b' });
    const shielded = simulateBattle(attacker, defender, { shieldsA: 0, shieldsB: 2 });
    const naked = simulateBattle(attacker, defender, { shieldsA: 0, shieldsB: 0 });
    // à armes égales, deux boucliers d'avance suffisent à renverser le duel
    expect(shielded.hpB).toBeGreaterThan(naked.hpB);
    expect(shielded.shieldsB).toBeLessThan(2);
  });

  it('avantage un obscur à l’attaque et le pénalise en défense', () => {
    const normal = dummy({ speciesId: 'n' });
    const shadow = dummy({ speciesId: 's', isShadow: true });
    const result = simulateBattle(shadow, normal, { shieldsA: 0, shieldsB: 0 });
    // il frappe plus fort mais encaisse moins bien : le duel se joue vite
    expect(result.turns).toBeLessThan(simulateBattle(normal, normal, {
      shieldsA: 0, shieldsB: 0,
    }).turns);
  });

  it('se termine toujours, même entre deux murs', () => {
    const wall = dummy({ base: { atk: 50, def: 300, hp: 300 } });
    const result = simulateBattle(wall, wall, { shieldsA: 2, shieldsB: 2 });
    expect(result.turns).toBeLessThanOrEqual(480);
  });
});

describe('simulateTeamBattle / sweepScenarios', () => {
  const team = (ids: string[]): Combatant[] =>
    ids.map((speciesId, index) =>
      dummy({
        speciesId,
        base: { atk: 140 + index * 20, def: 160 - index * 10, hp: 150 + index * 15 },
        types: [['water'], ['steel'], ['fighting']][index] ?? ['normal'],
        fast: move({
          moveId: `FAST_${index}`,
          type: [['water'], ['steel'], ['fighting']][index]?.[0] ?? 'normal',
          power: 4 + index,
          energyGain: 4 + index,
          turns: 2,
        }),
      }),
    );

  /**
   * Le contrôle qui compte : une équipe opposée à elle-même doit tomber à 50 %.
   * Toute asymétrie du moteur — ordre des changements, égalité de priorité de
   * chargée — gonfle le taux de victoire de l'équipe A et fausse tout le reste.
   */
  it('donne exactement 50 % sur un miroir', () => {
    const roster = team(['a', 'b', 'c']);
    expect(sweepScenarios(roster, roster).winRate).toBe(0.5);
  });

  it('balaie les 144 scénarios (3 leads × 3 leads × 4 stratégies × 4)', () => {
    const roster = team(['a', 'b', 'c']);
    const sweep = sweepScenarios(roster, roster);
    expect(sweep.battles).toBe(144);
    expect(sweep.byLead).toHaveLength(9);
    expect(sweep.byStrategy).toHaveLength(4);
  });

  it('respecte le chronomètre du combat', () => {
    const roster = team(['a', 'b', 'c']);
    const result = simulateTeamBattle(roster, roster, {
      leadA: 0,
      leadB: 0,
      strategyA: { shields: 'late', switching: 'stay' },
      strategyB: { shields: 'late', switching: 'stay' },
    });
    expect(result.turns).toBeLessThanOrEqual(480);
  });

  it('remplace un Pokémon mis K.O. au lieu de perdre sur-le-champ', () => {
    const strong = team(['x', 'y', 'z']).map((c) => ({
      ...c,
      base: { atk: 260, def: 200, hp: 200 },
    }));
    const frail = team(['p', 'q', 'r']).map((c) => ({
      ...c,
      base: { atk: 70, def: 70, hp: 70 },
    }));
    const result = simulateTeamBattle(strong, frail, {
      leadA: 0,
      leadB: 0,
      strategyA: { shields: 'late', switching: 'stay' },
      strategyB: { shields: 'late', switching: 'stay' },
    });
    expect(result.winner).toBe('a');
    expect(result.remainingB).toBe(0);
  });
});
