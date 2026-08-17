/**
 * Déroulé d'un échange de chromatiques.
 *
 * L'échange a lieu **dans le jeu** ; le site sert à s'accorder puis à
 * enregistrer qu'il a eu lieu. Chaque étape n'ouvre donc que peu d'actions, et
 * jamais les mêmes aux deux joueurs — c'est ce que décrit ce module, une seule
 * fois, pour que l'interface et le serveur ne puissent pas diverger.
 */

export type TradeStatus =
  | 'REQUESTED'
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED';

/** Le demandeur ouvre l'échange ; le propriétaire est celui qu'on sollicite. */
export type TradeRole = 'requester' | 'owner';

export type TradeAction =
  /** Le propriétaire désigne ce qu'il veut en retour. */
  | 'choose'
  /** Le demandeur valide la contrepartie proposée. */
  | 'accept'
  | 'decline'
  | 'cancel'
  /** « C'est fait en jeu » — il en faut deux pour clore. */
  | 'done';

export type TradeState = {
  status: TradeStatus;
  requesterDone: boolean;
  ownerDone: boolean;
};

/** Un échange clos ne rouvre pas : plus aucune action n'est possible. */
export const CLOSED: TradeStatus[] = ['COMPLETED', 'DECLINED', 'CANCELLED'];

export function isClosed(status: TradeStatus): boolean {
  return CLOSED.includes(status);
}

/**
 * Ce que ce joueur peut faire, ici et maintenant.
 *
 * Chacun peut annuler tant que rien n'est conclu : personne ne reste prisonnier
 * d'un échange que l'autre n'honore pas.
 */
export function allowedActions(state: TradeState, role: TradeRole): TradeAction[] {
  if (isClosed(state.status)) return [];

  switch (state.status) {
    case 'REQUESTED':
      // au sollicité de dire ce qu'il veut ; le demandeur peut se rétracter
      return role === 'owner' ? ['choose', 'decline'] : ['cancel'];

    case 'PROPOSED':
      // la contrepartie est sur la table : au demandeur de trancher
      return role === 'requester' ? ['accept', 'decline'] : ['cancel'];

    case 'ACCEPTED': {
      const alreadyDone = role === 'requester' ? state.requesterDone : state.ownerDone;
      return alreadyDone ? ['cancel'] : ['done', 'cancel'];
    }

    default:
      return [];
  }
}

export function can(state: TradeState, role: TradeRole, action: TradeAction): boolean {
  return allowedActions(state, role).includes(action);
}

/**
 * L'échange est-il consommé ? Il faut les deux confirmations : personne ne
 * clôt seul un échange qui engage les compteurs de l'autre.
 */
export function isSettled(state: TradeState): boolean {
  return state.requesterDone && state.ownerDone;
}

/** Statut après une action, sans la valider — `can` s'en charge en amont. */
export function nextStatus(state: TradeState, role: TradeRole, action: TradeAction): TradeStatus {
  switch (action) {
    case 'choose':
      return 'PROPOSED';
    case 'accept':
      return 'ACCEPTED';
    case 'decline':
      return 'DECLINED';
    case 'cancel':
      return 'CANCELLED';
    case 'done': {
      const after = {
        ...state,
        requesterDone: state.requesterDone || role === 'requester',
        ownerDone: state.ownerDone || role === 'owner',
      };
      return isSettled(after) ? 'COMPLETED' : state.status;
    }
    default:
      return state.status;
  }
}

/**
 * Effet d'un échange sur les compteurs d'un joueur : il cède un exemplaire de
 * ce qu'il donne, il en gagne un de ce qu'il reçoit.
 */
export function counterDelta(given: string, received: string): Record<string, number> {
  if (given === received) return {}; // échanger la même espèce ne change rien
  return { [given]: -1, [received]: 1 };
}

/** Plancher de la règle automatique : un doublon, c'est deux exemplaires. */
export const AUTO_TRADE_MIN = 2;

/**
 * Ce chromatique est-il proposé à l'échange ?
 *
 * Le choix explicite prime toujours sur la règle : marquer « jamais » doit
 * tenir même quand on accumule les doublons, sinon le réglage automatique
 * reprendrait la main sur une décision délibérée.
 */
export function isOfferedForTrade(
  forTrade: boolean | null | undefined,
  shinyCount: number,
  autoTradeFrom: number | null | undefined,
): boolean {
  if (forTrade != null) return forTrade;
  if (autoTradeFrom == null) return false;
  return shinyCount >= Math.max(AUTO_TRADE_MIN, autoTradeFrom);
}

/**
 * À qui de jouer — `null` si l'échange est clos.
 *
 * Un même statut ne dit pas la même chose aux deux joueurs : `REQUESTED`
 * signifie « à vous de choisir » pour le sollicité et « on attend sa réponse »
 * pour le demandeur. Afficher le statut brut des deux côtés induit en erreur.
 */
export function waitingOn(state: TradeState, role: TradeRole): 'you' | 'peer' | null {
  if (isClosed(state.status)) return null;
  if (state.status === 'REQUESTED') return role === 'owner' ? 'you' : 'peer';
  if (state.status === 'PROPOSED') return role === 'requester' ? 'you' : 'peer';

  // Accordé : chacun confirme pour son compte, indépendamment de l'autre.
  const mine = role === 'requester' ? state.requesterDone : state.ownerDone;
  return mine ? 'peer' : 'you';
}
