import { describe, expect, it } from 'vitest';
import { calcCP, levelForCp } from './stats';

/** Herbizarre : base 151/143/155. */
const IVYSAUR = { atk: 151, def: 143, hp: 155 };
const PERFECT = { atk: 15, def: 15, hp: 15 };

describe('levelForCp', () => {
  it('ne dépasse jamais le PC visé', () => {
    for (const target of [500, 1500, 2500, 4000]) {
      const found = levelForCp(IVYSAUR, PERFECT, target);
      expect(found.cp).toBeLessThanOrEqual(target);
      expect(calcCP(IVYSAUR, PERFECT, found.level)).toBe(found.cp);
    }
  });

  it('rend le niveau le plus haut qui tient sous la cible', () => {
    const found = levelForCp(IVYSAUR, PERFECT, 1500);
    // un demi-niveau de plus doit franchir le plafond
    expect(calcCP(IVYSAUR, PERFECT, found.level + 0.5)).toBeGreaterThan(1500);
  });

  it('retombe sur le niveau 1 quand la cible est sous le minimum', () => {
    expect(levelForCp(IVYSAUR, PERFECT, 1).level).toBe(1);
  });
});
