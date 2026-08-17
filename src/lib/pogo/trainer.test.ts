import { describe, expect, it } from 'vitest';
import {
  TRAINER_LEVEL_MAX,
  formatFriendCode,
  normalizeFriendCode,
  normalizeTrainerLevel,
} from './trainer';

describe('normalizeFriendCode', () => {
  it('accepte les séparateurs que le jeu affiche', () => {
    for (const input of ['1234 5678 9012', '1234-5678-9012', '1234.5678.9012', '123456789012']) {
      expect(normalizeFriendCode(input)).toBe('123456789012');
    }
  });

  it('refuse un compte de chiffres incorrect', () => {
    expect(normalizeFriendCode('12345678901')).toBeNull();
    expect(normalizeFriendCode('1234567890123')).toBeNull();
  });

  it('refuse ce qui n’est pas numérique', () => {
    expect(normalizeFriendCode('1234 5678 90ab')).toBeNull();
    expect(normalizeFriendCode('mon code')).toBeNull();
  });

  it('traite l’absence de code comme absente, pas comme une erreur', () => {
    expect(normalizeFriendCode(null)).toBeNull();
    expect(normalizeFriendCode(undefined)).toBeNull();
  });
});

describe('formatFriendCode', () => {
  it('regroupe par quatre', () => {
    expect(formatFriendCode('123456789012')).toBe('1234 5678 9012');
  });

  it('rend une chaîne vide sans code', () => {
    expect(formatFriendCode(null)).toBe('');
    expect(formatFriendCode('')).toBe('');
  });

  it('fait l’aller-retour avec la normalisation', () => {
    expect(normalizeFriendCode(formatFriendCode('123456789012'))).toBe('123456789012');
  });
});

describe('normalizeTrainerLevel', () => {
  it('accepte les bornes du jeu', () => {
    expect(normalizeTrainerLevel(1)).toBe(1);
    expect(normalizeTrainerLevel(TRAINER_LEVEL_MAX)).toBe(TRAINER_LEVEL_MAX);
  });

  it('accepte au-delà de l’ancien plafond de 50', () => {
    expect(normalizeTrainerLevel(51)).toBe(51);
    expect(normalizeTrainerLevel(80)).toBe(80);
  });

  it('refuse hors bornes plutôt que de rogner en silence', () => {
    expect(normalizeTrainerLevel(0)).toBeNull();
    expect(normalizeTrainerLevel(TRAINER_LEVEL_MAX + 1)).toBeNull();
  });

  it('accepte une saisie texte, comme celle d’un formulaire', () => {
    expect(normalizeTrainerLevel('42')).toBe(42);
    expect(normalizeTrainerLevel('')).toBeNull();
    expect(normalizeTrainerLevel('quarante')).toBeNull();
  });
});
