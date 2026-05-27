// ==========================================
// TABERNA DEL VIEJO GREG - Consequences System
// ==========================================
// Orchestrator that integrates all consequence subsystems:
//   - RiskResolver: evaluates severity based on context
//   - Wounds: lasting injuries with mechanical penalties
//   - Hostility: cumulative NPC/faction hostility
//   - Exhaustion: D&D 5e exhaustion levels
//   - Economic Scarcity: debts, bans, price inflation
//   - Permadeath: optional permanent death
//   - Quest Failure: permanently failed quests
//   - Irreversible Loss: things gone forever
//
// This module is the SINGLE ENTRY POINT for the consequences system.
// The GameEngine and Store call this, never the subsystems directly.

// Re-export everything for convenience
export * from './types';
export { RiskResolver, woundTypeFromDamageType, randomWoundLocation, calculateWoundHealing, calculateWealthRating } from './risk-resolver';
export { createWound, advanceWoundHealing, isWoundHealed, addWound, removeHealedWounds, healAllWoundsOneStep, getActiveWounds, getWoundPenalties } from './wounds';
export { createHostility, addOrUpdateHostility, redeemHostility, getActiveHostilities, getHostilityTowards, getNemeses, getEnemies, createReputationLoss } from './reputation';
export { addExhaustion, removeExhaustion, isExhaustionDeath, getExhaustionEffectsDescription, getExhaustionSpeedPenalty, getExhaustionMaxHpPenalty, hasExhaustionDisadvantageChecks, hasExhaustionDisadvantageAttacksSaves, EXHAUSTION_EFFECTS } from './exhaustion';
export { incurDebt, processDebtInterest, payDebt, addMerchantBan, liftMerchantBan, addScarceRegion, addStolenGood, updateWealthRating, getTotalDebt, getEffectiveCurrency, getRegionMultiplier, isItemAvailable, currencyToCopper } from './exhaustion';
export { setPermadeathEnabled, configureResurrection, processDeath, resurrectCharacter, isPermanentlyDead, canCharacterAct, recordLoss, getPermanentLosses, getLossesByCategory, hasLostPermanently } from './permadeath';
export { failQuest, isQuestFailed, getFailedQuests, getQuestConsequences, getTotalFailureReputationImpact, canAcceptQuestFromFaction } from './quest-failure';

import {
  type ConsequenceState,
  type RiskEvaluationResult,
  type RiskContext,
  type ConsequenceSeverity,
  type LastingWound,
  type WoundType,
  type WoundLocation,
  createDefaultConsequenceState,
} from './types';
import { RiskResolver, woundTypeFromDamageType, randomWoundLocation } from './risk-resolver';
import { createWound, addWound, healAllWoundsOneStep, getActiveWounds, getWoundPenalties } from './wounds';
import { addOrUpdateHostility, getActiveHostilities } from './reputation';
import { addExhaustion, isExhaustionDeath, removeExhaustion } from './exhaustion';
import { processDeath, canCharacterAct, recordLoss, isPermanentlyDead } from './permadeath';
import { failQuest } from './quest-failure';
import type { Intention, IntentionResolution, GameState, Character } from '@/lib/game-types';

// ============================================================
// MAIN CONSEQUENCE PROCESSOR
// ============================================================

export interface ConsequenceProcessingResult {
  /** Updated consequence state */
  consequenceState: ConsequenceState;
  /** All consequences that were applied */
  appliedConsequences: RiskEvaluationResult[];
  /** Wounds created this turn */
  newWounds: LastingWound[];
  /** Whether the character died this turn */
  characterDied: boolean;
  /** Whether the character can continue acting */
  canAct: boolean;
  /** Combined narrative text for all consequences */
  narrativeText: string;
  /** Combined mechanical effects description */
  mechanicalEffectsText: string;
  /** Whether any consequence escalated the risk level */
  riskEscalated: boolean;
}

/**
 * Process ALL consequences for a turn after intention resolution.
 *
 * This is called AFTER the GameEngine resolves intentions and BEFORE
 * the final state is committed to the store.
 *
 * ALGORITHM:
 * 1. Evaluate each intention resolution for risk triggers
 * 2. Apply consequences based on RiskResolver evaluation
 * 3. Create wounds, hostility, exhaustion, etc. as needed
 * 4. Check for death conditions
 * 5. Return updated state + narrative
 */
export function processConsequences(
  consequenceState: ConsequenceState,
  gameState: GameState,
  resolutions: IntentionResolution[]
): ConsequenceProcessingResult {
  let cState = consequenceState;
  const appliedConsequences: RiskEvaluationResult[] = [];
  const newWounds: LastingWound[] = [];
  const narrativeParts: string[] = [];
  const mechanicalParts: string[] = [];
  let characterDied = false;
  let riskEscalated = false;

  const character = gameState.character;
  if (!character) {
    return {
      consequenceState: cState,
      appliedConsequences: [],
      newWounds: [],
      characterDied: false,
      canAct: true,
      narrativeText: '',
      mechanicalEffectsText: '',
      riskEscalated: false,
    };
  }

  // Build risk context from current game state
  const riskContext: RiskContext = {
    characterLevel: character.level,
    hpPercentage: Math.round((character.currentHp / character.maxHp) * 100),
    activeWoundCount: getActiveWounds(cState).length,
    exhaustionLevel: cState.exhaustion.level,
    hostileCount: getActiveHostilities(cState).length,
    failedQuestCount: cState.failedQuests.length,
    wealthRating: cState.economy.playerWealthRating,
    recentBadDecisions: countRecentBadDecisions(cState),
    locationDanger: estimateLocationDanger(gameState.narrative.location),
    isAlone: gameState.relations.filter(n => n.alive && n.reputation !== 'hostile').length === 0,
    permadeathEnabled: cState.permadeath.enabled,
    currentTurn: gameState.narrative.turn,
  };

  // Process each resolution
  for (const resolution of resolutions) {
    const intent = resolution.intention;

    // --- COMBAT CONSEQUENCES ---
    if (intent.type === 'combat_attack' || intent.type === 'combat_defend') {
      // Check for HP threshold consequences
      const combatResults = RiskResolver.evaluateCombatResult(
        character.currentHp + (intent.damageToPlayer ?? 0), // HP before this damage
        character.currentHp,
        character.maxHp,
        intent.type === 'combat_attack' && resolution.diceRolls.some(r => r.result >= 20),
        resolution.diceRolls.some(r => r.result === 1 && r.type.includes('1d20')),
        riskContext,
        cState
      );

      for (const result of combatResults) {
        appliedConsequences.push(result);
        cState = applyEvaluatedConsequence(cState, result, gameState);
        narrativeParts.push(result.narrativeAddition);
        mechanicalParts.push(result.consequence.mechanicEffect);

        // Create wound if applicable
        if (result.consequenceType.startsWith('wound_')) {
          const wound = createWoundFromResult(result, character, gameState);
          if (wound) {
            cState = addWound(cState, wound);
            newWounds.push(wound);
          }
        }

        // Apply exhaustion
        if (result.consequenceType === 'exhaustion_increase' || result.consequenceType === 'exhaustion_minor') {
          const levels = result.severity === 'severe' || result.severity === 'critical' ? 2 : 1;
          cState = addExhaustion(cState, levels, result.consequence.trigger, result.severity, gameState.narrative.turn);

          // Check exhaustion death
          if (isExhaustionDeath(cState)) {
            characterDied = true;
          }
        }

        if (result.escalates) riskEscalated = true;
      }
    }

    // --- SOCIAL CONSEQUENCES ---
    if (intent.type === 'npc_reaction' && (intent.reputationDelta ?? 0) < -5) {
      const trigger = (intent.reputationDelta ?? 0) < -20 ? 'betrayed_ally' :
                       (intent.reputationDelta ?? 0) < -10 ? 'insulted_important_npc' :
                       'lied_caught';
      const result = RiskResolver.evaluateSocialEvent(trigger, riskContext, cState);
      if (result) {
        appliedConsequences.push(result);
        cState = applyEvaluatedConsequence(cState, result, gameState);
        narrativeParts.push(result.narrativeAddition);
        mechanicalParts.push(result.consequence.mechanicEffect);

        // Create hostility
        if (result.consequenceType.startsWith('hostility_')) {
          cState = addOrUpdateHostility(
            cState,
            intent.npcId ?? 'unknown',
            intent.target ?? 'unknown',
            Math.abs(intent.reputationDelta ?? 0),
            intent.description,
            gameState.narrative.turn,
            true,
            [],
            result.severity
          );
        }

        if (result.escalates) riskEscalated = true;
      }
    }

    // --- ENVIRONMENTAL CONSEQUENCES ---
    if (intent.type === 'environment_effect' && !resolution.success) {
      const trigger = intent.description.toLowerCase().includes('trampa') ? 'trap_hit' :
                      intent.description.toLowerCase().includes('veneno') ? 'poison_exposure' :
                      intent.description.toLowerCase().includes('caída') ? 'fell_from_height' :
                      'trap_hit';
      const result = RiskResolver.evaluate(trigger, riskContext, cState);
      if (result) {
        appliedConsequences.push(result);
        cState = applyEvaluatedConsequence(cState, result, gameState);
        narrativeParts.push(result.narrativeAddition);
        mechanicalParts.push(result.consequence.mechanicEffect);

        if (result.consequenceType.startsWith('wound_')) {
          const wound = createWoundFromResult(result, character, gameState);
          if (wound) {
            cState = addWound(cState, wound);
            newWounds.push(wound);
          }
        }

        if (result.escalates) riskEscalated = true;
      }
    }

    // --- DEATH EVENT ---
    if (intent.type === 'death_event') {
      // If the player character is the one dying
      if (character.currentHp <= 0 && character.deathSaves.failures >= 3) {
        const deathResult = processDeath(cState, gameState.narrative.turn);
        cState = deathResult.state;
        if (deathResult.isPermanentlyDead) {
          characterDied = true;
        }
        narrativeParts.push(deathResult.narrative);
      }
    }
  }

  // --- EXHAUSTION CHECK: No rest for too long ---
  const turnsSinceLastConsequence = gameState.narrative.turn - cState.lastConsequenceTurn;
  if (turnsSinceLastConsequence >= 5 && cState.exhaustion.level < 6) {
    const trigger = turnsSinceLastConsequence >= 5 ? 'no_rest_5_turns' : 'no_rest_3_turns';
    const result = RiskResolver.evaluate(trigger, riskContext, cState);
    if (result) {
      appliedConsequences.push(result);
      cState = addExhaustion(cState, 1, 'Sin descanso prolongado', result.severity, gameState.narrative.turn);
      narrativeParts.push(result.narrativeAddition);
      if (isExhaustionDeath(cState)) characterDied = true;
    }
  }

  // --- DEATH CHECK ---
  if (character.currentHp <= 0 && cState.permadeath.enabled && characterDied) {
    // Already processed above
  } else if (character.currentHp <= 0 && !cState.permadeath.enabled) {
    // Not permadeath, but near-death effects
    cState = {
      ...cState,
      permadeath: {
        ...cState.permadeath,
        status: 'dying',
        nearDeathEffects: [...cState.permadeath.nearDeathEffects, {
          id: `nde_${Date.now()}`,
          experience: 'Visión del más allá',
          effect: 'Desventaja en salvaciones de Sabiduría por 5 turnos',
          turn: gameState.narrative.turn,
          fadesOverTime: true,
          turnsUntilFade: 5,
        }],
      },
    };
  }

  const canAct = canCharacterAct(cState) && !isPermanentlyDead(cState);

  return {
    consequenceState: cState,
    appliedConsequences,
    newWounds,
    characterDied,
    canAct,
    narrativeText: narrativeParts.join('\n'),
    mechanicalEffectsText: mechanicalParts.join('\n'),
    riskEscalated,
  };
}

// ============================================================
// PROCESS REST — Heal wounds and reduce exhaustion
// ============================================================

export function processRestConsequences(
  consequenceState: ConsequenceState,
  isLongRest: boolean
): ConsequenceState {
  let cState = consequenceState;

  // Heal wounds
  cState = healAllWoundsOneStep(cState, isLongRest);

  // Long rest reduces exhaustion by 1 level
  if (isLongRest && cState.exhaustion.level > 0) {
    cState = removeExhaustion(cState, 1);
  }

  return cState;
}

// ============================================================
// GET COMBINED PENALTIES — For GameEngine to apply
// ============================================================

export interface CombinedPenalties {
  /** Wound penalties */
  woundPenalties: ReturnType<typeof getWoundPenalties>;
  /** Exhaustion level */
  exhaustionLevel: number;
  /** Whether character has disadvantage on ability checks */
  exhaustionDisadvantageChecks: boolean;
  /** Whether character has disadvantage on attacks and saves */
  exhaustionDisadvantageAttacksSaves: boolean;
  /** Speed multiplier from exhaustion */
  exhaustionSpeedMultiplier: number;
  /** Max HP multiplier from exhaustion */
  exhaustionMaxHpMultiplier: number;
  /** Total max HP reduction from wounds */
  woundMaxHpReduction: number;
  /** Total AC penalty from wounds */
  woundAcPenalty: number;
  /** Total attack roll penalty */
  totalAttackPenalty: number;
  /** Can the character act? */
  canAct: boolean;
}

export function getCombinedPenalties(state: ConsequenceState): CombinedPenalties {
  const woundPenalties = getWoundPenalties(state);
  const exLevel = state.exhaustion.level;

  return {
    woundPenalties,
    exhaustionLevel: exLevel,
    exhaustionDisadvantageChecks: exLevel >= 1,
    exhaustionDisadvantageAttacksSaves: exLevel >= 3,
    exhaustionSpeedMultiplier: exLevel >= 5 ? 0 : exLevel >= 2 ? 0.5 : 1.0,
    exhaustionMaxHpMultiplier: exLevel >= 4 ? 0.5 : 1.0,
    woundMaxHpReduction: woundPenalties.maxHpReduction,
    woundAcPenalty: woundPenalties.acPenalty,
    totalAttackPenalty: woundPenalties.attackRollPenalty + (exLevel >= 3 ? 0 : 0), // Disadvantage, not penalty
    canAct: canCharacterAct(state) && !isPermanentlyDead(state),
  };
}

// ============================================================
// HELPERS
// ============================================================

function applyEvaluatedConsequence(
  state: ConsequenceState,
  result: RiskEvaluationResult,
  _gameState: GameState
): ConsequenceState {
  return {
    ...state,
    ...result.stateMutations,
    consequenceLog: [...state.consequenceLog, result.consequence],
    updatedAt: Date.now(),
  };
}

function createWoundFromResult(
  result: RiskEvaluationResult,
  _character: Character,
  gameState: GameState
): LastingWound | null {
  if (!result.consequenceType.startsWith('wound_')) return null;

  // Determine wound type from the consequence type
  let woundType: WoundType = 'slash';
  if (result.consequenceType === 'wound_poison') woundType = 'poison';
  else if (result.consequenceType === 'wound_aggravation') woundType = 'slash';
  else if (result.severity === 'catastrophic') woundType = 'dismemberment';

  const location = randomWoundLocation();

  return createWound(
    woundType,
    location,
    result.severity,
    result.consequence.trigger,
    gameState.narrative.turn
  );
}

function countRecentBadDecisions(state: ConsequenceState): number {
  // Count consequences from the last 10 turns
  const recentTurnThreshold = Math.max(0, state.lastConsequenceTurn - 10);
  return state.consequenceLog.filter(c => c.turn >= recentTurnThreshold && c.active).length;
}

function estimateLocationDanger(location: string): number {
  // Simple heuristic based on location name keywords
  const lower = location.toLowerCase();
  if (lower.includes('mazmorra') || lower.includes('calabozo') || lower.includes('abismo')) return 9;
  if (lower.includes('cueva') || lower.includes('ruina') || lower.includes('cripta')) return 7;
  if (lower.includes('bosque') || lower.includes('pantano') || lower.includes('montaña')) return 5;
  if (lower.includes('camino') || lower.includes('carretera') || lower.includes('pradera')) return 3;
  if (lower.includes('taberna') || lower.includes('ciudad') || lower.includes('pueblo')) return 1;
  return 4; // Default moderate
}

// Re-import types used in function signatures
import type { WoundType as WoundTypeImport } from './types';
