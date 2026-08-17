/** Profil de dresseur : code ami, équipe, niveau. */

export const FRIEND_CODE_DIGITS = 12;
/** Le jeu affiche le code par groupes de quatre. */
const GROUP = 4;

export const TRAINER_LEVEL_MIN = 1;
/**
 * Plafond du niveau de dresseur, relevé de 50 à 80 par le jeu.
 * À ne pas confondre avec le niveau d'un **Pokémon**, qui plafonne toujours à
 * 50 (51 avec la Meilleure Amitié) et vient de la table de CPM.
 */
export const TRAINER_LEVEL_MAX = 80;

export type TrainerTeamKey = 'VALOR' | 'MYSTIC' | 'INSTINCT';

/**
 * Couleurs officielles des trois équipes. En dur plutôt qu'en jeton de thème :
 * ce sont les couleurs du jeu, elles ne suivent pas la charte du site.
 */
export const TEAM_COLORS: Record<TrainerTeamKey, string> = {
  VALOR: '#ee3f37',
  MYSTIC: '#3f7fe0',
  INSTINCT: '#f2c118',
};

export const TRAINER_TEAMS: TrainerTeamKey[] = ['VALOR', 'MYSTIC', 'INSTINCT'];

/**
 * Ramène une saisie à douze chiffres, ou `null` si ce n'en est pas un.
 *
 * On accepte espaces, tirets et points : les joueurs recopient leur code depuis
 * le jeu, qui l'affiche par groupes de quatre. Le stockage, lui, reste nu — la
 * mise en forme appartient à l'affichage.
 */
export function normalizeFriendCode(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = input.replace(/[\s.\-]/g, '');
  if (!/^\d+$/.test(digits) || digits.length !== FRIEND_CODE_DIGITS) return null;
  return digits;
}

/** Met en forme pour l'affichage : `1234 5678 9012`. */
export function formatFriendCode(code: string | null | undefined): string {
  if (!code) return '';
  return (code.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []).join(' ');
}

/** Borne le niveau de dresseur, ou `null` si la saisie n'a pas de sens. */
export function normalizeTrainerLevel(input: number | string | null | undefined): number | null {
  if (input == null || input === '') return null;
  const value = typeof input === 'string' ? Number(input) : input;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < TRAINER_LEVEL_MIN || rounded > TRAINER_LEVEL_MAX) return null;
  return rounded;
}
