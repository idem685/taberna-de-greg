// ==========================================
// TABERNA DEL VIEJO GREG - Exhaustion & Economic Scarcity
// ==========================================
// The body has limits. The purse has a bottom.
// No rest means exhaustion. No gold means desperation.
// Both compound over time if ignored.

import {
  type ExhaustionLevel,
  type ExhaustionCause,
  type EconomicState,
  type PlayerDebt,
  type ScarceRegion,
  type MerchantBan,
  type StolenGood,
  type ConsequenceSeverity,
  type ConsequenceState,
  generateConsequenceId,
} from './types';

// ============================================================
// EXHAUSTION
// ============================================================

/** D&D 5e exhaustion level effects */
export const EXHAUSTION_EFFECTS: Record<number, {
  description: string;
  mechanical: string;
}> = {
  0: { description: 'Sin efectos', mechanical: '' },
  1: {
    description: 'Desventaja en tiradas de habilidad',
    mechanical: 'disadvantage_ability_checks',
  },
  2: {
    description: 'Velocidad reducida a la mitad',
    mechanical: 'speed_halved',
  },
  3: {
    description: 'Desventaja en tiradas de ataque y salvación',
    mechanical: 'disadvantage_attacks_saves',
  },
  4: {
    description: 'PV máximos reducidos a la mitad',
    mechanical: 'max_hp_halved',
  },
  5: {
    description: 'Velocidad reducida a 0',
    mechanical: 'speed_zero',
  },
  6: {
    description: 'MUERTE',
    mechanical: 'death',
  },
};

/** Add exhaustion level(s) */
export function addExhaustion(
  state: ConsequenceState,
  levels: number,
  source: string,
  severity: ConsequenceSeverity,
  currentTurn: number
): ConsequenceState {
  const currentLevel = state.exhaustion.level;
  const newLevel = Math.min(6, currentLevel + levels);

  const cause: ExhaustionCause = {
    source,
    turn: currentTurn,
    severity,
  };

  return {
    ...state,
    exhaustion: {
      level: newLevel,
      causes: [...state.exhaustion.causes, cause],
      atDeathDoor: newLevel >= 5,
    },
    updatedAt: Date.now(),
  };
}

/** Remove exhaustion level(s) — only through long rest or restoration */
export function removeExhaustion(
  state: ConsequenceState,
  levels: number
): ConsequenceState {
  const newLevel = Math.max(0, state.exhaustion.level - levels);
  return {
    ...state,
    exhaustion: {
      ...state.exhaustion,
      level: newLevel,
      atDeathDoor: newLevel >= 5,
    },
    updatedAt: Date.now(),
  };
}

/** Check if exhaustion causes death (level 6) */
export function isExhaustionDeath(state: ConsequenceState): boolean {
  return state.exhaustion.level >= 6;
}

/** Get exhaustion effects description for current level */
export function getExhaustionEffectsDescription(level: number): string {
  const effects: string[] = [];
  for (let i = 1; i <= level && i <= 6; i++) {
    effects.push(`Nivel ${i}: ${EXHAUSTION_EFFECTS[i].description}`);
  }
  return effects.join('\n');
}

/** Calculate speed penalty from exhaustion */
export function getExhaustionSpeedPenalty(baseSpeed: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 5) return 0;
  if (exhaustionLevel >= 2) return Math.floor(baseSpeed / 2);
  return baseSpeed;
}

/** Calculate max HP penalty from exhaustion */
export function getExhaustionMaxHpPenalty(maxHp: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 4) return Math.floor(maxHp / 2);
  return maxHp;
}

/** Whether the character has disadvantage on ability checks */
export function hasExhaustionDisadvantageChecks(exhaustionLevel: number): boolean {
  return exhaustionLevel >= 1;
}

/** Whether the character has disadvantage on attack rolls and saving throws */
export function hasExhaustionDisadvantageAttacksSaves(exhaustionLevel: number): boolean {
  return exhaustionLevel >= 3;
}

// ============================================================
// ECONOMIC SCARCITY
// ============================================================

/** Calculate total copper from Currency object */
export function currencyToCopper(gold: number, silver: number, copper: number): number {
  return (gold * 100) + (silver * 10) + copper;
}

/** Add a debt to the player */
export function incurDebt(
  state: ConsequenceState,
  creditorId: string,
  creditorName: string,
  amount: number, // in copper
  interestRate: number, // e.g., 0.05 for 5%
  currentTurn: number,
  defaultConsequence: string
): ConsequenceState {
  const debt: PlayerDebt = {
    creditorId,
    creditorName,
    amount,
    interestRate,
    sinceTurn: currentTurn,
    collectorsActive: false,
    defaultConsequence,
  };

  return {
    ...state,
    economy: {
      ...state.economy,
      debts: [...state.economy.debts, debt],
    },
    updatedAt: Date.now(),
  };
}

/** Process debt interest per turn */
export function processDebtInterest(state: ConsequenceState, currentTurn: number): ConsequenceState {
  const updatedDebts = state.economy.debts.map(debt => {
    if (debt.collectorsActive) return debt; // Already active

    const turnsSinceDebt = currentTurn - debt.sinceTurn;
    const interestAccrued = Math.floor(debt.amount * debt.interestRate * turnsSinceDebt);
    const totalDebt = debt.amount + interestAccrued;

    // Activate collectors after 5 turns of unpaid debt
    const collectorsActive = turnsSinceDebt >= 5;

    return {
      ...debt,
      amount: totalDebt,
      collectorsActive,
    };
  });

  return {
    ...state,
    economy: {
      ...state.economy,
      debts: updatedDebts,
    },
    updatedAt: Date.now(),
  };
}

/** Pay off a debt (partially or fully) */
export function payDebt(
  state: ConsequenceState,
  creditorId: string,
  amount: number // in copper
): { state: ConsequenceState; remaining: number } {
  const debt = state.economy.debts.find(d => d.creditorId === creditorId);
  if (!debt) return { state, remaining: amount };

  const remaining = debt.amount - amount;

  if (remaining <= 0) {
    // Debt fully paid
    return {
      state: {
        ...state,
        economy: {
          ...state.economy,
          debts: state.economy.debts.filter(d => d.creditorId !== creditorId),
        },
        updatedAt: Date.now(),
      },
      remaining: Math.abs(remaining),
    };
  }

  // Partial payment
  return {
    state: {
      ...state,
      economy: {
        ...state.economy,
        debts: state.economy.debts.map(d =>
          d.creditorId === creditorId ? { ...d, amount: remaining, collectorsActive: false } : d
        ),
      },
      updatedAt: Date.now(),
    },
    remaining: 0,
  };
}

/** Add a merchant ban */
export function addMerchantBan(
  state: ConsequenceState,
  merchantId: string,
  merchantName: string,
  reason: string,
  canBeLifted: boolean,
  liftCost: number
): ConsequenceState {
  const ban: MerchantBan = {
    merchantId,
    merchantName,
    reason,
    canBeLifted,
    liftCost,
  };

  return {
    ...state,
    economy: {
      ...state.economy,
      merchantBans: [...state.economy.merchantBans, ban],
    },
    updatedAt: Date.now(),
  };
}

/** Lift a merchant ban (pay the cost) */
export function liftMerchantBan(
  state: ConsequenceState,
  merchantId: string
): ConsequenceState {
  return {
    ...state,
    economy: {
      ...state.economy,
      merchantBans: state.economy.merchantBans.filter(b => b.merchantId !== merchantId),
    },
    updatedAt: Date.now(),
  };
}

/** Add a scarce region */
export function addScarceRegion(
  state: ConsequenceState,
  region: string,
  multiplier: number,
  scarceItems: string[],
  reason: string,
  currentTurn: number
): ConsequenceState {
  const scarce: ScarceRegion = {
    region,
    multiplier,
    scarceItems,
    reason,
    sinceTurn: currentTurn,
  };

  // Replace existing scarcity for same region
  const existing = state.economy.scarceRegions.findIndex(s => s.region === region);
  const newScarceRegions = existing >= 0
    ? state.economy.scarceRegions.map((s, i) => i === existing ? scarce : s)
    : [...state.economy.scarceRegions, scarce];

  return {
    ...state,
    economy: {
      ...state.economy,
      scarceRegions: newScarceRegions,
    },
    updatedAt: Date.now(),
  };
}

/** Mark an item as stolen */
export function addStolenGood(
  state: ConsequenceState,
  itemId: string,
  itemName: string,
  originalOwner: string,
  fenceable: boolean,
  valueReduction: number
): ConsequenceState {
  const stolen: StolenGood = {
    itemId,
    itemName,
    originalOwner,
    fenceable,
    valueReduction,
  };

  return {
    ...state,
    economy: {
      ...state.economy,
      stolenGoods: [...state.economy.stolenGoods, stolen],
    },
    updatedAt: Date.now(),
  };
}

/** Update wealth rating based on total assets */
export function updateWealthRating(state: ConsequenceState, totalCopper: number): ConsequenceState {
  let rating: EconomicState['playerWealthRating'] = 'modest';
  if (totalCopper >= 50000) rating = 'rich';
  else if (totalCopper >= 20000) rating = 'wealthy';
  else if (totalCopper >= 8000) rating = 'comfortable';
  else if (totalCopper >= 2000) rating = 'modest';
  else if (totalCopper >= 500) rating = 'poor';
  else rating = 'destitute';

  return {
    ...state,
    economy: {
      ...state.economy,
      playerWealthRating: rating,
    },
    updatedAt: Date.now(),
  };
}

/** Get total debt in copper */
export function getTotalDebt(state: ConsequenceState): number {
  return state.economy.debts.reduce((sum, d) => sum + d.amount, 0);
}

/** Check if player can afford something after debts */
export function getEffectiveCurrency(state: ConsequenceState, gold: number, silver: number, copper: number): number {
  const totalCopper = currencyToCopper(gold, silver, copper);
  const totalDebt = getTotalDebt(state);
  return Math.max(0, totalCopper - totalDebt);
}

/** Get price multiplier for a region */
export function getRegionMultiplier(state: ConsequenceState, region: string): number {
  const scarce = state.economy.scarceRegions.find(s => s.region === region);
  return scarce?.multiplier ?? state.economy.regionalMultiplier;
}

/** Check if an item is available in a region */
export function isItemAvailable(state: ConsequenceState, region: string, itemCategory: string): boolean {
  const scarce = state.economy.scarceRegions.find(s => s.region === region);
  if (!scarce) return true;
  return !scarce.scarceItems.includes(itemCategory);
}
