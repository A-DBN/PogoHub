/**
 * Récupération de compte par trois Pokémon.
 *
 * Le secret n'est pas la suite saisie mais **l'ensemble** : on trie avant de
 * hacher, pour que l'ordre n'ait pas à être mémorisé. On perd un facteur 6 sur
 * le nombre de combinaisons — négligeable devant le vrai risque, qui est que les
 * gens choisissent leurs favoris. C'est la limitation des tentatives qui protège
 * le compte, pas la taille théorique de l'espace de recherche.
 */

export const RECOVERY_PICKS = 3;

/** Au-delà, le compte se verrouille : trois choix se devinent, un mot de passe non. */
export const MAX_RECOVERY_ATTEMPTS = 5;
export const RECOVERY_LOCK_MINUTES = 60;

/**
 * Valide et met en forme canonique une sélection.
 *
 * Rend `null` si le compte n'y est pas, si une espèce est répétée, ou si une
 * entrée est vide — trois fois le même Pokémon ne serait pas un secret.
 */
export function normalizeRecoveryPicks(
  picks: Array<string | null | undefined> | null | undefined,
): string[] | null {
  if (!Array.isArray(picks)) return null;

  const cleaned = picks.map((pick) => (pick ?? '').trim()).filter(Boolean);
  if (cleaned.length !== RECOVERY_PICKS) return null;
  if (new Set(cleaned).size !== RECOVERY_PICKS) return null;

  return [...cleaned].sort();
}

/** Chaîne à hacher. `null` si la sélection n'est pas valide. */
export function recoveryKey(
  picks: Array<string | null | undefined> | null | undefined,
): string | null {
  const normalized = normalizeRecoveryPicks(picks);
  return normalized ? normalized.join('|') : null;
}

/** Minutes restantes avant de pouvoir réessayer, 0 si le compte est ouvert. */
export function lockRemaining(lockedUntil: Date | null, now: Date = new Date()): number {
  if (!lockedUntil) return 0;
  const minutes = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000);
  return minutes > 0 ? minutes : 0;
}
