import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  can,
  counterDelta,
  isClosed,
  isOfferedForTrade,
  isSettled,
  nextStatus,
  waitingOn,
  type TradeState,
  type TradeStatus,
} from './trade';

const state = (status: TradeStatus, requesterDone = false, ownerDone = false): TradeState => ({
  status,
  requesterDone,
  ownerDone,
});

describe('allowedActions', () => {
  it('laisse le sollicité choisir sa contrepartie, pas le demandeur', () => {
    expect(allowedActions(state('REQUESTED'), 'owner')).toContain('choose');
    expect(allowedActions(state('REQUESTED'), 'requester')).not.toContain('choose');
  });

  it('laisse le demandeur valider, pas le propriétaire', () => {
    expect(allowedActions(state('PROPOSED'), 'requester')).toContain('accept');
    expect(allowedActions(state('PROPOSED'), 'owner')).not.toContain('accept');
  });

  it('permet à chacun d’annuler tant que rien n’est conclu', () => {
    for (const status of ['REQUESTED', 'PROPOSED', 'ACCEPTED'] as TradeStatus[]) {
      const actions = [
        ...allowedActions(state(status), 'requester'),
        ...allowedActions(state(status), 'owner'),
      ];
      expect(actions).toContain('cancel');
    }
  });

  it('n’ouvre « fait » qu’une fois l’échange accordé', () => {
    expect(allowedActions(state('ACCEPTED'), 'requester')).toContain('done');
    expect(allowedActions(state('PROPOSED'), 'requester')).not.toContain('done');
    expect(allowedActions(state('REQUESTED'), 'owner')).not.toContain('done');
  });

  it('ne propose plus « fait » à qui l’a déjà marqué', () => {
    expect(allowedActions(state('ACCEPTED', true, false), 'requester')).not.toContain('done');
    expect(allowedActions(state('ACCEPTED', true, false), 'owner')).toContain('done');
  });

  it('ne rouvre jamais un échange clos', () => {
    for (const status of ['COMPLETED', 'DECLINED', 'CANCELLED'] as TradeStatus[]) {
      expect(isClosed(status)).toBe(true);
      expect(allowedActions(state(status), 'requester')).toEqual([]);
      expect(allowedActions(state(status), 'owner')).toEqual([]);
    }
  });
});

describe('nextStatus', () => {
  it('suit le déroulé attendu jusqu’à la conclusion', () => {
    expect(nextStatus(state('REQUESTED'), 'owner', 'choose')).toBe('PROPOSED');
    expect(nextStatus(state('PROPOSED'), 'requester', 'accept')).toBe('ACCEPTED');
  });

  it('attend les deux confirmations avant de clore', () => {
    const afterFirst = nextStatus(state('ACCEPTED'), 'requester', 'done');
    expect(afterFirst).toBe('ACCEPTED');

    const afterSecond = nextStatus(state('ACCEPTED', true, false), 'owner', 'done');
    expect(afterSecond).toBe('COMPLETED');
  });

  it('ne clôt pas si le même joueur confirme deux fois', () => {
    expect(nextStatus(state('ACCEPTED', true, false), 'requester', 'done')).toBe('ACCEPTED');
  });

  it('refuse et annule mènent à des états distincts', () => {
    expect(nextStatus(state('PROPOSED'), 'requester', 'decline')).toBe('DECLINED');
    expect(nextStatus(state('PROPOSED'), 'owner', 'cancel')).toBe('CANCELLED');
  });
});

describe('can', () => {
  it('reflète exactement allowedActions', () => {
    expect(can(state('ACCEPTED'), 'owner', 'done')).toBe(true);
    expect(can(state('COMPLETED'), 'owner', 'done')).toBe(false);
    expect(can(state('REQUESTED'), 'requester', 'choose')).toBe(false);
  });
});

describe('isSettled', () => {
  it('exige les deux confirmations', () => {
    expect(isSettled(state('ACCEPTED', true, true))).toBe(true);
    expect(isSettled(state('ACCEPTED', true, false))).toBe(false);
    expect(isSettled(state('ACCEPTED', false, true))).toBe(false);
  });
});

describe('counterDelta', () => {
  it('retire ce qui est donné, ajoute ce qui est reçu', () => {
    expect(counterDelta('pikachu', 'altaria')).toEqual({ pikachu: -1, altaria: 1 });
  });

  it('ne touche à rien quand les deux côtés donnent la même espèce', () => {
    expect(counterDelta('pikachu', 'pikachu')).toEqual({});
  });
});

describe('isOfferedForTrade', () => {
  it('respecte un choix explicite, quelle que soit la règle', () => {
    expect(isOfferedForTrade(true, 1, null)).toBe(true);
    expect(isOfferedForTrade(false, 99, 2)).toBe(false);
  });

  it('applique la règle en l’absence de choix', () => {
    expect(isOfferedForTrade(null, 3, 2)).toBe(true);
    expect(isOfferedForTrade(null, 1, 2)).toBe(false);
  });

  it('ne propose rien quand la règle est désactivée', () => {
    expect(isOfferedForTrade(null, 50, null)).toBe(false);
  });

  it('ne descend pas sous deux exemplaires : un unique n’est pas un doublon', () => {
    expect(isOfferedForTrade(null, 1, 1)).toBe(false);
    expect(isOfferedForTrade(null, 2, 1)).toBe(true);
  });
});

describe('waitingOn', () => {
  it('désigne le sollicité tant qu’il n’a pas choisi', () => {
    expect(waitingOn(state('REQUESTED'), 'owner')).toBe('you');
    expect(waitingOn(state('REQUESTED'), 'requester')).toBe('peer');
  });

  it('désigne le demandeur une fois la contrepartie proposée', () => {
    expect(waitingOn(state('PROPOSED'), 'requester')).toBe('you');
    expect(waitingOn(state('PROPOSED'), 'owner')).toBe('peer');
  });

  it('attend chacun séparément une fois l’échange accordé', () => {
    expect(waitingOn(state('ACCEPTED'), 'requester')).toBe('you');
    expect(waitingOn(state('ACCEPTED'), 'owner')).toBe('you');
    // celui qui a confirmé n'attend plus que l'autre
    expect(waitingOn(state('ACCEPTED', true, false), 'requester')).toBe('peer');
    expect(waitingOn(state('ACCEPTED', true, false), 'owner')).toBe('you');
  });

  it('n’attend plus personne sur un échange clos', () => {
    for (const status of ['COMPLETED', 'DECLINED', 'CANCELLED'] as TradeStatus[]) {
      expect(waitingOn(state(status), 'requester')).toBeNull();
      expect(waitingOn(state(status), 'owner')).toBeNull();
    }
  });
});
