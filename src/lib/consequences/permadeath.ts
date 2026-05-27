// ==========================================
// TABERNA DEL VIEJO GREG - Permadeath & Irreversible Loss
// ==========================================
// Death is final. Losses are real.
// When the dice say you die, you die.
// When you lose something precious, it's gone.
// No plot armor. No narrative saves.
// The world is harsh, and so are we.

import {
  type PermadeathState,
  type ResurrectionCost,
  type NearDeathEffect,
  type IrreversibleLoss,
  type ConsequenceSeverity,
  type ConsequenceState,
  generateConsequenceId,
} from './types';

// ============================================================
// PERMADEATH
// ============================================================

/** Enable or disable permadeath for the game */
export function setPermadeathEnabled(state: ConsequenceState, enabled: boolean): ConsequenceState {
  return {
    ...state,
    permadeath: {
      ...state.permadeath,
      enabled,
    },
    updatedAt: Date.now(),
  };
}

/** Configure resurrection settings */
export function configureResurrection(
  state: ConsequenceState,
  maxAttempts: number
): ConsequenceState {
  return {
    ...state,
    permadeath: {
      ...state.permadeath,
      maxResurrectionAttempts: maxAttempts,
    },
    updatedAt: Date.now(),
  };
}

/** Character has died — process the death */
export function processDeath(state: ConsequenceState, currentTurn: number): {
  state: ConsequenceState;
  isPermanentlyDead: boolean;
  canResurrect: boolean;
  resurrectionCosts: ResurrectionCost[];
  narrative: string;
} {
  const pd = state.permadeath;

  // If permadeath is disabled, character is just "dying" (unconscious)
  if (!pd.enabled) {
    return {
      state: {
        ...state,
        permadeath: {
          ...pd,
          status: 'dying',
          nearDeathEffects: [...pd.nearDeathEffects, {
            id: generateConsequenceId(),
            experience: 'Visión del más allá — la muerte te rozó',
            effect: 'Desventaja en salvaciones de Sabiduría por 5 turnos',
            turn: currentTurn,
            fadesOverTime: true,
            turnsUntilFade: 5,
          }],
        },
        updatedAt: Date.now(),
      },
      isPermanentlyDead: false,
      canResurrect: false,
      resurrectionCosts: [],
      narrative: 'La muerte te rozó, pero no te llevó. Quedas inconsciente al borde del abismo.',
    };
  }

  // Permadeath is enabled
  const newDeathCount = pd.deathCount + 1;
  const canResurrect = pd.resurrectionAttempts < pd.maxResurrectionAttempts;
  const isPermanentlyDead = !canResurrect;

  // Calculate resurrection costs (each resurrection is more expensive)
  const resurrectionCosts = calculateResurrectionCosts(newDeathCount);

  // Near-death effect (even if resurrected, you don't come back the same)
  const nearDeathEffect: NearDeathEffect = {
    id: generateConsequenceId(),
    experience: `Muerte #${newDeathCount}: ${isPermanentlyDead ? 'El último viaje' : 'El velo se rasga'}`,
    effect: isPermanentlyDead
      ? 'MUERTE PERMANENTE'
      : `-1 nivel, -2 puntuación de característica permanente, marca de la muerte`,
    turn: currentTurn,
    fadesOverTime: false,
    turnsUntilFade: 0,
  };

  if (isPermanentlyDead) {
    return {
      state: {
        ...state,
        permadeath: {
          ...pd,
          deathCount: newDeathCount,
          status: 'dead',
          isPermanentlyDead: true,
          epitaph: 'Cayó en combate. Su historia termina aquí.',
          nearDeathEffects: [...pd.nearDeathEffects, nearDeathEffect],
        },
        updatedAt: Date.now(),
      },
      isPermanentlyDead: true,
      canResurrect: false,
      resurrectionCosts: [],
      narrative: 'La muerte te reclama. No hay vuelta atrás. Tu historia termina aquí, entre sombras y silencio. El mundo seguirá sin ti.',
    };
  }

  return {
    state: {
      ...state,
      permadeath: {
        ...pd,
        deathCount: newDeathCount,
        status: 'dying',
        nearDeathEffects: [...pd.nearDeathEffects, nearDeathEffect],
      },
      updatedAt: Date.now(),
    },
    isPermanentlyDead: false,
    canResurrect: true,
    resurrectionCosts,
    narrative: 'La muerte te envuelve en su manto helado... pero algo te retiene. Un juramento incumplido, una promesa rota, o quizás simple terquedad. Puedes regresar, pero no será gratis.',
  };
}

/** Resurrect the character (pay the costs) */
export function resurrectCharacter(
  state: ConsequenceState,
  paidCosts: ResurrectionCost[]
): {
  state: ConsequenceState;
  success: boolean;
  remainingCosts: ResurrectionCost[];
  narrative: string;
} {
  const pd = state.permadeath;

  if (pd.resurrectionAttempts >= pd.maxResurrectionAttempts) {
    return {
      state,
      success: false,
      remainingCosts: [],
      narrative: 'No hay vuelta atrás. La muerte es permanente.',
    };
  }

  // Mark costs as paid
  const updatedCosts = pd.resurrectionCosts.map(cost => {
    const paid = paidCosts.find(p => p.type === cost.type);
    return paid ? { ...cost, paid: true } : cost;
  });

  const unpaidCosts = updatedCosts.filter(c => !c.paid);

  // All costs must be paid for resurrection to complete
  const allPaid = unpaidCosts.length === 0;

  if (!allPaid) {
    return {
      state: {
        ...state,
        permadeath: {
          ...pd,
          resurrectionCosts: updatedCosts,
        },
        updatedAt: Date.now(),
      },
      success: false,
      remainingCosts: unpaidCosts,
      narrative: 'La resurrección requiere un precio. Aún no lo has pagado completo.',
    };
  }

  return {
    state: {
      ...state,
      permadeath: {
        ...pd,
        status: 'ressurrected',
        resurrectionAttempts: pd.resurrectionAttempts + 1,
        resurrectionCosts: updatedCosts,
      },
      updatedAt: Date.now(),
    },
    success: true,
    remainingCosts: [],
    narrative: 'Regresas del más allá. El frío de la muerte aún palpita en tus huesos. No eres el mismo — algo se quedó en el otro lado.',
  };
}

/** Calculate resurrection costs based on death count */
function calculateResurrectionCosts(deathCount: number): ResurrectionCost[] {
  const costs: ResurrectionCost[] = [];

  // Level loss (increases with each death)
  costs.push({
    type: 'level_loss',
    description: `Pérdida de ${deathCount} nivel(es)`,
    value: deathCount,
    paid: false,
  });

  // Ability score loss
  const abilityLoss = Math.min(deathCount, 4);
  costs.push({
    type: 'ability_loss',
    description: `-${abilityLoss} a una puntuación de característica (Constitución preferida)`,
    value: abilityLoss,
    paid: false,
  });

  // Gold cost
  const goldCost = 100 * deathCount;
  costs.push({
    type: 'debt',
    description: `Deuda de ${goldCost} monedas de oro por los servicios de resurrección`,
    value: goldCost * 100, // Store in copper
    paid: false,
  });

  // Quest obligation
  if (deathCount >= 2) {
    costs.push({
      type: 'quest',
      description: 'Misión impuesta por la deidad que te devolvió: cumplir o morir definitivamente',
      value: 'geas_quest',
      paid: false,
    });
  }

  // Curse
  if (deathCount >= 3) {
    costs.push({
      type: 'curse',
      description: 'Maldición de la muerte: tu toque drena vida de los vivos',
      value: 'death_touch_curse',
      paid: false,
    });
  }

  return costs;
}

/** Check if character is permanently dead */
export function isPermanentlyDead(state: ConsequenceState): boolean {
  return state.permadeath.isPermanentlyDead;
}

/** Check if character can act (not dead/dying) */
export function canCharacterAct(state: ConsequenceState): boolean {
  const status = state.permadeath.status;
  return status === 'alive' || status === 'ressurrected';
}

// ============================================================
// IRREVERSIBLE LOSS
// ============================================================

/** Record an irreversible loss */
export function recordLoss(
  state: ConsequenceState,
  lostThing: string,
  category: IrreversibleLoss['category'],
  cause: string,
  currentTurn: number,
  severity: ConsequenceSeverity,
  permanent: boolean,
  restorationCondition?: string
): ConsequenceState {
  const loss: IrreversibleLoss = {
    id: generateConsequenceId(),
    lostThing,
    category,
    cause,
    lostTurn: currentTurn,
    permanent,
    restorationCondition,
    narrative: generateLossNarrative(lostThing, category, severity, permanent),
    severity,
  };

  return {
    ...state,
    irreversibleLosses: [...state.irreversibleLosses, loss],
    updatedAt: Date.now(),
  };
}

/** Generate narrative for a loss */
function generateLossNarrative(
  lostThing: string,
  category: IrreversibleLoss['category'],
  severity: ConsequenceSeverity,
  permanent: boolean
): string {
  const categoryDescriptions: Record<string, string> = {
    item: `Has perdido: ${lostThing}. ${permanent ? 'No lo recuperarás.' : 'Quizás puedas reemplazarlo con el tiempo.'}`,
    ability: `Tu ${lostThing} ya no es lo que era. ${permanent ? 'El daño es permanente.' : 'Con descanso y esfuerzo, podría mejorar.'}`,
    relationship: `${lostThing} se ha apartado de ti. ${permanent ? 'No hay reconciliación posible.' : 'Tal vez, con tiempo y amends...'}`,
    opportunity: `La oportunidad de ${lostThing} se ha esfumado. ${permanent ? 'No volverá a presentarse.' : 'El mundo sigue girando.'}`,
    territory: `Has perdido ${lostThing}. ${permanent ? 'El territorio ya no es tuyo.' : 'Conquistarlo de nuevo costará sangre.'}`,
    knowledge: `El conocimiento de ${lostThing} se ha perdido. ${permanent ? 'Nadie lo recuerda ya.' : 'Quizás alguien más lo sepa.'}`,
    time: `${lostThing}. El tiempo perdido no se recupera.`,
  };

  return categoryDescriptions[category] ?? `Has perdido: ${lostThing}. ${permanent ? 'Permanentemente.' : 'Temporalmente.'}`;
}

/** Get all permanent losses */
export function getPermanentLosses(state: ConsequenceState): IrreversibleLoss[] {
  return state.irreversibleLosses.filter(l => l.permanent);
}

/** Get all losses by category */
export function getLossesByCategory(state: ConsequenceState, category: IrreversibleLoss['category']): IrreversibleLoss[] {
  return state.irreversibleLosses.filter(l => l.category === category);
}

/** Check if something has been permanently lost */
export function hasLostPermanently(state: ConsequenceState, thing: string): boolean {
  return state.irreversibleLosses.some(l => l.lostThing === thing && l.permanent);
}
