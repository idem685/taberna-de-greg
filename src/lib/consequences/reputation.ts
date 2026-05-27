// ==========================================
// TABERNA DEL VIEJO GREG - Hostility & Reputation Consequences
// ==========================================
// NPCs don't forgive and forget easily.
// Cumulative hostility spreads through networks.
// A betrayal today means an enemy tomorrow — and their friends too.

import {
  type HostilityRecord,
  type HostilityCause,
  type ConsequenceSeverity,
  type ConsequenceState,
  type IrreversibleLoss,
  generateConsequenceId,
} from './types';

// --- Hostility Level Thresholds ---

const HOSTILITY_THRESHOLDS = {
  wary: 10,
  hostile: 25,
  vengeful: 50,
  enemy: 75,
  nemesis: 90,
} as const;

type HostilityAttitude = HostilityRecord['attitude'];

function hostilityToAttitude(level: number): HostilityAttitude {
  if (level >= HOSTILITY_THRESHOLDS.nemesis) return 'nemesis';
  if (level >= HOSTILITY_THRESHOLDS.enemy) return 'enemy';
  if (level >= HOSTILITY_THRESHOLDS.vengeful) return 'vengeful';
  if (level >= HOSTILITY_THRESHOLDS.hostile) return 'hostile';
  return 'wary';
}

// --- Create Hostility Record ---

export function createHostility(
  targetId: string,
  targetName: string,
  initialLevel: number,
  cause: string,
  currentTurn: number,
  witnessed: boolean,
  witnesses: string[],
  severity: ConsequenceSeverity
): HostilityRecord {
  const level = Math.min(100, initialLevel);
  const attitude = hostilityToAttitude(level);

  // High severity hostility spreads to allies
  const spreadsToAllies = severity !== 'minor' && level >= HOSTILITY_THRESHOLDS.hostile;
  const redeemable = severity !== 'catastrophic' && level < HOSTILITY_THRESHOLDS.nemesis;

  const causeEntry: HostilityCause = {
    action: cause,
    turn: currentTurn,
    hostilityAdded: level,
    witnessed,
    witnesses,
  };

  const redemptionConditions: string[] = [];
  if (redeemable) {
    if (level >= HOSTILITY_THRESHOLDS.vengeful) {
      redemptionConditions.push('Misión de redención peligrosa');
      redemptionConditions.push('Compensación económica significativa');
      redemptionConditions.push('Juramento mágico de no repetir');
    } else if (level >= HOSTILITY_THRESHOLDS.hostile) {
      redemptionConditions.push('Compensación económica');
      redemptionConditions.push('Favor significativo');
    } else {
      redemptionConditions.push('Disculpas sinceras');
      redemptionConditions.push('Pequeña compensación');
    }
  }

  return {
    targetId,
    targetName,
    hostilityLevel: level,
    causes: [causeEntry],
    attitude,
    spreadsToAllies,
    influencedTargets: [],
    redeemable,
    redemptionConditions,
  };
}

// --- Update Existing Hostility ---

export function addHostilityCause(
  record: HostilityRecord,
  addedLevel: number,
  cause: string,
  currentTurn: number,
  witnessed: boolean,
  witnesses: string[]
): HostilityRecord {
  const newLevel = Math.min(100, record.hostilityLevel + addedLevel);
  const newAttitude = hostilityToAttitude(newLevel);
  const newCause: HostilityCause = {
    action: cause,
    turn: currentTurn,
    hostilityAdded: addedLevel,
    witnessed,
    witnesses,
  };

  // Once hostility passes vengeful, it's no longer redeemable without extreme measures
  const redeemable = newLevel < HOSTILITY_THRESHOLDS.nemesis;

  // Update redemption conditions
  const redemptionConditions = redeemable
    ? newLevel >= HOSTILITY_THRESHOLDS.vengeful
      ? ['Sacrificio personal extremo', 'Misión imposible de redención', 'Juramento mágico vinculante']
      : newLevel >= HOSTILITY_THRESHOLDS.hostile
        ? ['Misión peligrosa de redención', 'Compensación mayor', 'Juramento de fidelidad']
        : ['Compensación económica', 'Favor significativo']
    : [];

  return {
    ...record,
    hostilityLevel: newLevel,
    attitude: newAttitude,
    causes: [...record.causes, newCause],
    spreadsToAllies: newLevel >= HOSTILITY_THRESHOLDS.hostile,
    redeemable,
    redemptionConditions,
  };
}

// --- Reduce Hostility (Redemption) ---

export function reduceHostility(
  record: HostilityRecord,
  reduction: number,
  reason: string
): HostilityRecord {
  if (!record.redeemable) return record;

  const newLevel = Math.max(0, record.hostilityLevel - reduction);
  const newAttitude = hostilityToAttitude(newLevel);

  return {
    ...record,
    hostilityLevel: newLevel,
    attitude: newAttitude,
    causes: [...record.causes, {
      action: `REDENCIÓN: ${reason}`,
      turn: 0,
      hostilityAdded: -reduction,
      witnessed: false,
      witnesses: [],
    }],
  };
}

// --- Spread Hostility to Allies ---

export function spreadHostilityToAllies(
  record: HostilityRecord,
  allyIds: string[],
  spreadLevel: number
): HostilityRecord {
  if (!record.spreadsToAllies) return record;

  return {
    ...record,
    influencedTargets: [...new Set([...record.influencedTargets, ...allyIds])],
  };
}

// --- State Operations ---

export function addOrUpdateHostility(
  state: ConsequenceState,
  targetId: string,
  targetName: string,
  addedLevel: number,
  cause: string,
  currentTurn: number,
  witnessed: boolean,
  witnesses: string[],
  severity: ConsequenceSeverity
): ConsequenceState {
  const existing = state.hostilities.find(h => h.targetId === targetId);

  if (existing) {
    const updated = addHostilityCause(existing, addedLevel, cause, currentTurn, witnessed, witnesses);
    return {
      ...state,
      hostilities: state.hostilities.map(h => h.targetId === targetId ? updated : h),
      updatedAt: Date.now(),
    };
  }

  const newRecord = createHostility(targetId, targetName, addedLevel, cause, currentTurn, witnessed, witnesses, severity);
  return {
    ...state,
    hostilities: [...state.hostilities, newRecord],
    updatedAt: Date.now(),
  };
}

export function redeemHostility(
  state: ConsequenceState,
  targetId: string,
  reduction: number,
  reason: string
): ConsequenceState {
  return {
    ...state,
    hostilities: state.hostilities.map(h =>
      h.targetId === targetId ? reduceHostility(h, reduction, reason) : h
    ),
    updatedAt: Date.now(),
  };
}

export function getActiveHostilities(state: ConsequenceState): HostilityRecord[] {
  return state.hostilities.filter(h => h.hostilityLevel > 0);
}

export function getHostilityTowards(state: ConsequenceState, targetId: string): HostilityRecord | undefined {
  return state.hostilities.find(h => h.targetId === targetId);
}

export function getNemeses(state: ConsequenceState): HostilityRecord[] {
  return state.hostilities.filter(h => h.attitude === 'nemesis');
}

export function getEnemies(state: ConsequenceState): HostilityRecord[] {
  return state.hostilities.filter(h => h.attitude === 'enemy' || h.attitude === 'nemesis');
}

// --- Reputation Loss as Irreversible ---

export function createReputationLoss(
  sphere: string,
  deed: string,
  severity: ConsequenceSeverity,
  currentTurn: number
): IrreversibleLoss {
  const descriptions: Record<ConsequenceSeverity, string> = {
    minor: `Tu reputación en ${sphere} empeora levemente`,
    moderate: `Tu reputación en ${sphere} sufre un golpe notable`,
    severe: `Tu reputación en ${sphere} queda manchada permanentemente`,
    critical: `Tu nombre es sinónimo de deshonra en ${sphere}`,
    catastrophic: `Eres proscrito en los círculos de ${sphere} — no hay vuelta atrás`,
  };

  return {
    id: generateConsequenceId(),
    lostThing: `Reputación en ${sphere}`,
    category: 'relationship',
    cause: deed,
    lostTurn: currentTurn,
    permanent: SEVERITY_ORDER[severity] >= SEVERITY_ORDER['severe'],
    restorationCondition: severity !== 'catastrophic' ? 'Actos heroicos extremos + tiempo (10+ turnos)' : undefined,
    narrative: descriptions[severity],
    severity,
  };
}

// Import for SEVERITY_ORDER
import { SEVERITY_ORDER } from './types';
