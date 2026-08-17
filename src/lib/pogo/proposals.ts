/**
 * Règles de validation des propositions de correction méta.
 *
 * Dans un module à part, et non dans `actions/proposals.ts` : un fichier
 * `'use server'` ne peut exporter que des fonctions asynchrones. Y laisser une
 * constante fait perdre **tous** les exports du module, et l'erreur qui remonte
 * (« has no exports at all ») ne dit pas pourquoi.
 */

/** Part des relecteurs disponibles qu'il faut convaincre. */
/*
 * Ordre de la liste méta en cours d'édition.
 *
 * L'ordre est un **tableau d'identifiants**, pas une suite de rangs à rapiécer.
 * Stocker le rang ligne par ligne a produit deux bugs de suite : un retrait
 * suivi d'une insertion laissait un trou dans la numérotation, et un
 * déplacement affichait deux fois le même numéro parce que la valeur saisie et
 * la position calculée divergeaient. Ici le rang n'existe plus qu'en sortie,
 * dérivé de la position — il ne peut donc plus contredire l'ordre.
 *
 * Une ligne retirée reste dans l'ordre : l'éditeur l'affiche barrée, mais elle
 * ne consomme aucune position.
 */

/** Numérote 1..N les lignes encore présentes, dans l'ordre donné. */
export function orderPositions(order: string[], removed: string[] = []): Record<string, number> {
  const gone = new Set(removed);
  const positions: Record<string, number> = {};
  let position = 0;
  for (const speciesId of order) {
    if (gone.has(speciesId)) continue;
    positions[speciesId] = ++position;
  }
  return positions;
}

/** Déplace une ligne d'un cran, en enjambant les lignes retirées. */
export function moveInOrder(
  order: string[],
  speciesId: string,
  direction: -1 | 1,
  removed: string[] = [],
): string[] {
  const gone = new Set(removed);
  const index = order.indexOf(speciesId);
  if (index < 0) return order;

  let target = index + direction;
  while (target >= 0 && target < order.length && gone.has(order[target])) target += direction;
  if (target < 0 || target >= order.length) return order;

  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Place une ligne à la position visible demandée — qu'elle soit nouvelle ou
 * déjà présente. Au-delà de la dernière position, elle va en fin de liste.
 */
export function insertAtPosition(
  order: string[],
  speciesId: string,
  position: number,
  removed: string[] = [],
): string[] {
  const gone = new Set(removed);
  const without = order.filter((id) => id !== speciesId);

  let seen = 0;
  for (let index = 0; index < without.length; index++) {
    if (gone.has(without[index])) continue;
    seen++;
    if (seen === position) {
      without.splice(index, 0, speciesId);
      return without;
    }
  }
  without.push(speciesId);
  return without;
}

/**
 * Écarte une chargée répétée d'un jeu d'attaques `[rapide, chargée, chargée]`.
 *
 * Un Pokémon ne porte pas deux fois la même chargée. Refuser le lot à l'envoi
 * ne suffit pas : ceux déposés avant que la règle n'existe en portent encore, et
 * leur validation écrirait le doublon dans le classement.
 */
export function withoutDuplicateCharged(moveset: unknown): string[] | null {
  if (!Array.isArray(moveset)) return null;
  const [fast, ...charged] = moveset as string[];
  return [fast, ...new Set(charged.filter(Boolean))];
}

export const APPROVAL_RATIO = 0.25;

/**
 * Jamais une seule voix : à deux contributeurs, un quorum proportionnel
 * reviendrait à laisser une personne réécrire la méta seule — exactement ce
 * que la relecture doit empêcher.
 */
export const MIN_APPROVALS = 2;

/**
 * Plafond : passé un certain nombre de contributeurs, exiger un quart de tout
 * le monde rendrait toute correction impossible à faire passer.
 */
export const MAX_APPROVALS = 5;

/**
 * Validations requises, **en plus de l'auteur**, selon le nombre de relecteurs
 * possibles (contributeurs et administrateurs, auteur exclu).
 *
 * Ni purement fixe ni purement proportionnel : un seuil fixe ne veut plus rien
 * dire quand la communauté grandit, un seuil en pourcentage tombe à une voix
 * quand elle est minuscule.
 */
export function requiredApprovals(reviewers: number): number {
  const proportional = Math.ceil(Math.max(0, reviewers) * APPROVAL_RATIO);
  return Math.min(MAX_APPROVALS, Math.max(MIN_APPROVALS, proportional));
}

/** Symétrique : autant de refus et la proposition est close. */
export const requiredRejections = requiredApprovals;
