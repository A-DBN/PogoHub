import { describe, expect, it } from 'vitest';
import { catchCpRange, ivPercent } from './raid';

/**
 * Fourchettes publiées par LeekDuck pour les boss du 17/08/2026 : la formule de
 * PC de capture est recoupée colonne par colonne contre une source extérieure.
 * Les 17 boss du jour concordent ; on en garde un par cas de figure.
 */
const GROUDON = { atk: 270, def: 228, hp: 205 };
const SNORLAX = { atk: 190, def: 169, hp: 330 };
const GARCHOMP = { atk: 261, def: 193, hp: 239 };

describe('catchCpRange', () => {
  it('reproduit un raid classique (plancher IV 10)', () => {
    expect(catchCpRange(GROUDON)).toMatchObject({ min: 2260, max: 2351 });
    expect(catchCpRange(GROUDON, true)).toMatchObject({ min: 2825, max: 2939 });
  });

  it('descend au plancher IV 6 pour un raid obscur', () => {
    expect(catchCpRange(SNORLAX, false, true)).toMatchObject({ min: 1696, max: 1843 });
    expect(catchCpRange(SNORLAX, true, true)).toMatchObject({ min: 2120, max: 2304 });
  });

  it('utilise l’espèce de base pour un raid Méga : on ne capture pas la Méga', () => {
    expect(catchCpRange(GARCHOMP)).toMatchObject({ min: 2174, max: 2264 });
  });
});

describe('ivPercent', () => {
  it('traduit le plancher d’IV en pourcentage affichable', () => {
    expect(ivPercent(10)).toBe(67);
    expect(ivPercent(6)).toBe(40);
    expect(ivPercent(15)).toBe(100);
  });
});
