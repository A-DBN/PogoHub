import { describe, expect, it } from 'vitest';
import {
  MAX_APPROVALS,
  MIN_APPROVALS,
  insertAtPosition,
  moveInOrder,
  orderPositions,
  requiredApprovals,
  withoutDuplicateCharged,
} from './proposals';

describe('requiredApprovals', () => {
  it('n’autorise jamais une validation unique, même à deux contributeurs', () => {
    for (const reviewers of [0, 1, 2, 3, 4]) {
      expect(requiredApprovals(reviewers)).toBeGreaterThanOrEqual(MIN_APPROVALS);
    }
  });

  it('suit le quart des relecteurs entre les deux bornes', () => {
    expect(requiredApprovals(12)).toBe(3);
    expect(requiredApprovals(16)).toBe(4);
  });

  it('plafonne pour qu’une correction reste possible dans une grande communauté', () => {
    expect(requiredApprovals(100)).toBe(MAX_APPROVALS);
    expect(requiredApprovals(10000)).toBe(MAX_APPROVALS);
  });

  it('ne décroît jamais quand la communauté grandit', () => {
    let previous = 0;
    for (let reviewers = 0; reviewers < 200; reviewers++) {
      const value = requiredApprovals(reviewers);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("ordre de la liste méta", () => {
  const base = ['a', 'b', 'c', 'd', 'e'];

  it('numérote 1..N dans l’ordre du tableau', () => {
    expect(orderPositions(base)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it('referme le trou laissé par un retrait', () => {
    // « b » reste affiché barré, mais ne consomme plus de position
    expect(orderPositions(base, ['b'])).toEqual({ a: 1, c: 2, d: 3, e: 4 });
  });

  it('échange deux voisines sans jamais dupliquer un numéro', () => {
    const moved = moveInOrder(base, 'd', -1);
    expect(moved).toEqual(['a', 'b', 'd', 'c', 'e']);
    const places = orderPositions(moved);
    expect(places.d).toBe(3);
    expect(places.c).toBe(4);
    expect(Object.values(places).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('enjambe une ligne retirée au lieu de s’y arrêter', () => {
    // « c » est barré : monter « d » doit le franchir et le laisser où il est.
    // Seul l'ordre visible compte — a, d, b, e.
    const moved = moveInOrder(base, 'd', -1, ['c']);
    expect(moved).toEqual(['a', 'd', 'c', 'b', 'e']);
    expect(orderPositions(moved, ['c'])).toEqual({ a: 1, d: 2, b: 3, e: 4 });
  });

  it('ne bouge pas aux extrémités', () => {
    expect(moveInOrder(base, 'a', -1)).toEqual(base);
    expect(moveInOrder(base, 'e', 1)).toEqual(base);
  });

  it('insère une nouvelle ligne à la position demandée', () => {
    const next = insertAtPosition(base, 'neuf', 2);
    expect(next).toEqual(['a', 'neuf', 'b', 'c', 'd', 'e']);
    expect(orderPositions(next).neuf).toBe(2);
  });

  it('ne laisse pas de trou quand on retire le 2 puis on insère au 2', () => {
    // le bug d’origine : le 3 disparaissait de la numérotation
    const next = insertAtPosition(base, 'neuf', 2, ['b']);
    const places = orderPositions(next, ['b']);
    expect(places).toEqual({ a: 1, neuf: 2, c: 3, d: 4, e: 5 });
  });

  it('déplace une ligne déjà présente sans la dupliquer', () => {
    const next = insertAtPosition(base, 'e', 1);
    expect(next).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(next.filter((id) => id === 'e')).toHaveLength(1);
  });

  it('renvoie en fin de liste au-delà de la dernière position', () => {
    expect(insertAtPosition(base, 'neuf', 99)).toEqual([...base, 'neuf']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const order = [...base];
    moveInOrder(order, 'd', -1);
    insertAtPosition(order, 'neuf', 2);
    expect(order).toEqual(base);
  });
});

describe('withoutDuplicateCharged', () => {
  it('écarte la chargée répétée en gardant la première', () => {
    expect(withoutDuplicateCharged(['PECK', 'SKY_ATTACK', 'SKY_ATTACK'])).toEqual([
      'PECK',
      'SKY_ATTACK',
    ]);
  });

  it('laisse intact un jeu valide', () => {
    const moveset = ['PECK', 'SKY_ATTACK', 'DRAGON_PULSE'];
    expect(withoutDuplicateCharged(moveset)).toEqual(moveset);
  });

  it('ne confond pas la rapide avec une chargée de même nom', () => {
    // seules les chargées sont dédoublonnées : la rapide reste en tête
    expect(withoutDuplicateCharged(['X', 'X', 'Y'])).toEqual(['X', 'X', 'Y']);
  });

  it('écarte les emplacements vides', () => {
    expect(withoutDuplicateCharged(['PECK', '', 'DRAGON_PULSE'])).toEqual([
      'PECK',
      'DRAGON_PULSE',
    ]);
  });

  it('renvoie null si ce n’est pas une liste', () => {
    expect(withoutDuplicateCharged(null)).toBeNull();
    expect(withoutDuplicateCharged({ fast: 'PECK' })).toBeNull();
  });
});
