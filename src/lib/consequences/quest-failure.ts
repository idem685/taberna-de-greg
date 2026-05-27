// ==========================================
// TABERNA DEL VIEJO GREG - Quest Failure
// ==========================================
// Failed quests don't just disappear.
// People remember when you let them down.
// The dragon you didn't slay? It burned the village.
// The person you didn't save? They're dead.
// Consequences are tangible and permanent.

import {
  type FailedQuest,
  type QuestFailureConsequence,
  type ConsequenceSeverity,
  type ConsequenceState,
  generateConsequenceId,
} from './types';

// --- Quest Failure Consequence Templates ---

const CONSEQUENCE_TEMPLATES: Record<string, QuestFailureConsequence[]> = {
  rescue_mission: [
    { type: 'social', description: 'La persona que debías rescatar murió o sufrió irreversiblemente', severity: 'severe', mechanicEffect: 'Hostilidad de aliados del rescatado, reputación -15' },
    { type: 'reputation', description: 'Tu nombre se asocia con el fracaso', severity: 'moderate', mechanicEffect: 'Reputación heroica -10, facciones dudan de contratarte' },
  ],
  escort_mission: [
    { type: 'social', description: 'El escoltado fue capturado o muerto', severity: 'severe', mechanicEffect: 'Deuda con la familia, enemistad de la facción' },
    { type: 'economic', description: 'No recibiste el pago, y debes compensación', severity: 'moderate', mechanicEffect: 'Deuda de 50% del pago prometido' },
  ],
  hunt_mission: [
    { type: 'political', description: 'La bestia sigue atacando, ahora peor', severity: 'moderate', mechanicEffect: 'Región más peligrosa, precios aumentan' },
    { type: 'reputation', description: 'Los cazadores te consideran incompetente', severity: 'minor', mechanicEffect: 'Desventaja en Persuasión con cazadores' },
  ],
  diplomatic_mission: [
    { type: 'political', description: 'Las negociaciones colapsaron, tensión aumenta', severity: 'severe', mechanicEffect: 'Facciones más hostiles, conflicto activo' },
    { type: 'supernatural', description: 'El fracaso ofendió a una deidad de la paz', severity: 'moderate', mechanicEffect: 'Desventaja en salvaciones de Carisma' },
  ],
  defense_mission: [
    { type: 'political', description: 'El lugar fue destruido o conquistado', severity: 'critical', mechanicEffect: 'Territorio perdido, facción enemiga avanza' },
    { type: 'social', description: 'Los supervivientes te culpan', severity: 'severe', mechanicEffect: 'Hostilidad de los supervivientes' },
    { type: 'economic', description: 'Pérdida de recursos de la zona', severity: 'moderate', mechanicEffect: 'Escasez en la región' },
  ],
  default: [
    { type: 'reputation', description: 'Tu fracaso es conocido', severity: 'moderate', mechanicEffect: 'Reputación general -5' },
    { type: 'social', description: 'Quienes confiaron en ti están decepcionados', severity: 'minor', mechanicEffect: 'Reacción más fría de PNJs afectados' },
  ],
};

// --- Fail a Quest Permanently ---

export function failQuest(
  state: ConsequenceState,
  questId: string,
  questName: string,
  failureReason: string,
  currentTurn: number,
  severity: ConsequenceSeverity,
  questType?: string,
  affectedParties?: string[],
  widelyKnown?: boolean
): ConsequenceState {
  // Get consequences from template
  const template = questType ? CONSEQUENCE_TEMPLATES[questType] : undefined;
  const consequences = template ?? CONSEQUENCE_TEMPLATES.default;

  // Scale consequences by severity
  const scaledConsequences: QuestFailureConsequence[] = consequences.map(c => ({
    ...c,
    severity: severityGTE(c.severity, severity) ? c.severity : severity,
  }));

  const failedQuest: FailedQuest = {
    questId,
    questName,
    failureReason,
    failedTurn: currentTurn,
    consequences: scaledConsequences,
    reattemptable: false, // Failed quests are PERMANENTLY failed
    affectedParties: affectedParties ?? [],
    widelyKnown: widelyKnown ?? (severity === 'critical' || severity === 'catastrophic'),
    reputationImpact: calculateReputationImpact(severity),
  };

  return {
    ...state,
    failedQuests: [...state.failedQuests, failedQuest],
    updatedAt: Date.now(),
  };
}

// --- Check if a quest has been failed ---

export function isQuestFailed(state: ConsequenceState, questId: string): boolean {
  return state.failedQuests.some(fq => fq.questId === questId);
}

// --- Get all failed quests ---

export function getFailedQuests(state: ConsequenceState): FailedQuest[] {
  return state.failedQuests;
}

// --- Get consequences for a specific failed quest ---

export function getQuestConsequences(state: ConsequenceState, questId: string): QuestFailureConsequence[] {
  const failed = state.failedQuests.find(fq => fq.questId === questId);
  return failed?.consequences ?? [];
}

// --- Get total reputation impact from all failures ---

export function getTotalFailureReputationImpact(state: ConsequenceState): number {
  return state.failedQuests.reduce((sum, fq) => sum + fq.reputationImpact, 0);
}

// --- Check if the player can accept a quest from a given faction ---

export function canAcceptQuestFromFaction(state: ConsequenceState, faction: string): {
  canAccept: boolean;
  reason?: string;
} {
  // Check if there are widely-known failures with this faction
  const publicFailures = state.failedQuests.filter(
    fq => fq.widelyKnown && fq.affectedParties.includes(faction)
  );

  if (publicFailures.length >= 3) {
    return {
      canAccept: false,
      reason: `${faction} ya no confía en ti tras múltiples fracasos públicos.`,
    };
  }

  if (publicFailures.length >= 1) {
    const worstFailure = publicFailures.reduce((worst, fq) =>
      (fq.reputationImpact > worst.reputationImpact ? fq : worst), publicFailures[0]
    );

    if (worstFailure.reputationImpact >= 20) {
      return {
        canAccept: false,
        reason: `${faction} te considera poco confiable tras tu fracaso con "${worstFailure.questName}".`,
      };
    }
  }

  return { canAccept: true };
}

// --- Helpers ---

function calculateReputationImpact(severity: ConsequenceSeverity): number {
  const impactMap: Record<ConsequenceSeverity, number> = {
    minor: 3,
    moderate: 8,
    severe: 15,
    critical: 25,
    catastrophic: 40,
  };
  return impactMap[severity];
}

// Import SEVERITY_ORDER for comparison
import { SEVERITY_ORDER } from './types';

function severityGTE(a: ConsequenceSeverity, b: ConsequenceSeverity): boolean {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b];
}
