import { describe, expect, it } from 'vitest';
import { lockRemaining, normalizeRecoveryPicks, recoveryKey } from './recovery';

describe('normalizeRecoveryPicks', () => {
  it('trie la sélection : l’ordre n’a pas à être mémorisé', () => {
    expect(normalizeRecoveryPicks(['pikachu', 'altaria', 'zacian'])).toEqual([
      'altaria',
      'pikachu',
      'zacian',
    ]);
  });

  it('donne la même clé quel que soit l’ordre de saisie', () => {
    const key = recoveryKey(['pikachu', 'altaria', 'zacian']);
    expect(recoveryKey(['zacian', 'pikachu', 'altaria'])).toBe(key);
    expect(recoveryKey(['altaria', 'zacian', 'pikachu'])).toBe(key);
  });

  it('refuse une espèce répétée : ce ne serait pas un secret', () => {
    expect(normalizeRecoveryPicks(['pikachu', 'pikachu', 'zacian'])).toBeNull();
  });

  it('exige exactement trois choix', () => {
    expect(normalizeRecoveryPicks(['pikachu', 'zacian'])).toBeNull();
    expect(normalizeRecoveryPicks(['a', 'b', 'c', 'd'])).toBeNull();
    expect(normalizeRecoveryPicks([])).toBeNull();
  });

  it('traite un emplacement vide comme manquant', () => {
    expect(normalizeRecoveryPicks(['pikachu', '', 'zacian'])).toBeNull();
    expect(normalizeRecoveryPicks(['pikachu', '   ', 'zacian'])).toBeNull();
    expect(normalizeRecoveryPicks(['pikachu', null, 'zacian'])).toBeNull();
  });

  it('ignore les espaces autour d’un nom', () => {
    expect(normalizeRecoveryPicks([' pikachu ', 'altaria', 'zacian'])).toEqual([
      'altaria',
      'pikachu',
      'zacian',
    ]);
  });

  it('rend null hors d’un tableau', () => {
    expect(normalizeRecoveryPicks(null)).toBeNull();
    expect(recoveryKey(undefined)).toBeNull();
  });
});

describe('lockRemaining', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('rend 0 sans verrou', () => {
    expect(lockRemaining(null, now)).toBe(0);
  });

  it('rend 0 quand le verrou est expiré', () => {
    expect(lockRemaining(new Date('2026-08-17T11:30:00Z'), now)).toBe(0);
  });

  it('arrondit au-dessus : « 1 minute » vaut mieux que « 0 » quand il reste 10 s', () => {
    expect(lockRemaining(new Date('2026-08-17T12:00:10Z'), now)).toBe(1);
    expect(lockRemaining(new Date('2026-08-17T12:42:00Z'), now)).toBe(42);
  });
});
