// ==========================================
// TABERNA DEL VIEJO GREG - Intention Resolver
// ==========================================
// The LLM proposes INTENTIONS. This module resolves each intention
// through D&D 5e rules via the GameEngine. The LLM has NO authority
// to directly modify HP, XP, gold, items, stats, or any game state.
//
// PIPELINE:
// 1. Player acts → LLM proposes intention
// 2. GameEngine resolves intention (dice rolls, rule calculations)
// 3. GameEngine updates state with real results
// 4. Final narrative reflects engine-calculated outcomes

import {
  type GameState,
  type Intention,
  type IntentionResolution,
  type DiceRoll,
  type SkillKey,
  type AbilityScore,
  type NPC,
  type Item,
  type Currency,
} from '@/lib/game-types';
import { GameEngine, type EngineResult, type EngineSideEffect } from './engine';
import { rollDice, rollD20, resolveSkillCheck as resolveSkillCheckCore, resolveSavingThrow as resolveSavingThrowCore, type CheckResult } from './checks';
import { applyDamage, applyHealing, applyTemporaryHp, clampHp } from './combat';
import { sanitizeCurrency } from './economy';

// --- Intention Resolution Result ---

export interface IntentionsResolutionResult {
  state: GameState;
  resolutions: IntentionResolution[];
  allSideEffects: EngineSideEffect[];
  /** Combined dice rolls from all resolutions */
  allDiceRolls: DiceRoll[];
  /** Summary of what happened for narrative adjustment */
  resolutionSummary: string;
}

// --- Individual Intention Resolvers ---

/**
 * Resolve a combat_attack intention.
 * The LLM proposes the attack but the ENGINE rolls dice and calculates damage.
 * If the LLM suggests damageRoll, the engine rolls it. Otherwise, it estimates
 * damage based on the character's weapon and level.
 */
function resolveCombatAttack(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character to attack with', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const diceRolls: DiceRoll[] = [];
  const sideEffects: string[] = [];

  // 1. Attack roll (d20 + proficiency + ability modifier)
  // Use the character's weapon to determine attack bonus
  const weapon = state.inventory.equipment.weapon;
  const abilityMod = weapon?.damageType === 'finesse'
    ? Math.max(
        Math.floor((state.character.abilityScores.strength - 10) / 2),
        Math.floor((state.character.abilityScores.dexterity - 10) / 2)
      )
    : Math.floor((state.character.abilityScores.strength - 10) / 2);
  const attackBonus = state.character.proficiencyBonus + abilityMod;

  const attackRoll = rollD20(attackBonus);
  diceRolls.push({
    type: `1d20+${attackBonus}`,
    result: attackRoll.total,
    breakdown: attackRoll.breakdown,
    purpose: `Ataque contra ${intention.target || 'enemigo'}`,
  });

  // Determine if hit (we don't know target AC, so the LLM's narrative + DC suggestion guides us)
  // The engine trusts the attack roll vs a reasonable AC estimate
  // If the LLM provided a DC, use that as the target AC
  const targetAC = intention.dc ?? 12; // Default AC 12 if not specified
  const isHit = attackRoll.isCrit || (!attackRoll.isFumble && attackRoll.total >= targetAC);

  let damageDealt = 0;
  let resultText = '';

  if (isHit) {
    // 2. Damage roll — ENGINE rolls the dice, not the LLM
    const damageExpression = intention.damageRoll || weapon?.damage || '1d6';
    const damageResult = rollDice(damageExpression);
    damageDealt = damageResult.total;

    // Add ability modifier to weapon damage
    if (weapon) {
      damageDealt += Math.max(0, abilityMod);
    }

    // Critical hit: double the dice
    if (attackRoll.isCrit) {
      const critDamage = rollDice(damageExpression);
      damageDealt += critDamage.total;
      sideEffects.push('¡Golpe crítico!');
    }

    diceRolls.push({
      type: damageExpression,
      result: damageDealt,
      breakdown: damageResult.breakdown,
      purpose: `Daño ${intention.damageType || weapon?.damageType || 'físico'}`,
    });

    resultText = `Ataque exitoso contra ${intention.target || 'enemigo'}: ${damageDealt} puntos de daño${attackRoll.isCrit ? ' (¡CRÍTICO!)' : ''}`;

    // If monster was defeated, update bestiary
    if (intention.monsterDefeatedId) {
      sideEffects.push(`${intention.target || 'Enemigo'} derrotado`);
    }
  } else {
    resultText = attackRoll.isFumble
      ? `¡Fallo crítico! Tu ataque falla completamente contra ${intention.target || 'el enemigo'}`
      : `Ataque fallido contra ${intention.target || 'enemigo'} (${attackRoll.total} vs CA ${targetAC})`;
  }

  // 3. Handle damage TO the player from enemy counterattack
  let playerDamageResult: EngineResult | null = null;
  if (intention.damageToPlayer && intention.damageToPlayer > 0) {
    // The LLM suggests how much damage the enemy deals, but the ENGINE
    // validates it's reasonable (capped at character max HP + temp HP)
    const rawDamage = Math.min(
      intention.damageToPlayer,
      state.character.currentHp + state.character.temporaryHp + 10 // Allow slight overkill
    );
    const newChar = applyDamage(state.character, rawDamage);
    playerDamageResult = { state: { ...state, character: clampHp(newChar), updatedAt: Date.now() }, success: true };

    diceRolls.push({
      type: `${intention.damageToPlayer} dmg`,
      result: rawDamage,
      breakdown: `${intention.target || 'Enemigo'} contraataca: ${rawDamage} daño`,
      purpose: `Contraataque de ${intention.target || 'enemigo'}`,
    });

    sideEffects.push(`-${rawDamage} PV`);
    resultText += ` | Recibes ${rawDamage} puntos de daño`;

    if (clampHp(newChar).currentHp === 0) {
      sideEffects.push('¡Has caído en combate!');
    }
  }

  // 4. Handle healing to player
  let healResult: EngineResult | null = null;
  if (intention.healingToPlayer && intention.healingToPlayer > 0) {
    // Engine caps healing at maxHp
    const newChar = applyHealing(state.character, intention.healingToPlayer);
    healResult = { state: { ...state, character: newChar, updatedAt: Date.now() }, success: true };
    sideEffects.push(`+${Math.min(intention.healingToPlayer, state.character.maxHp - state.character.currentHp)} PV`);
  }

  // 5. Handle temp HP
  let tempHpResult: EngineResult | null = null;
  if (intention.temporaryHpGained && intention.temporaryHpGained > 0) {
    const newChar = applyTemporaryHp(state.character, intention.temporaryHpGained);
    tempHpResult = { state: { ...state, character: newChar, updatedAt: Date.now() }, success: true };
    sideEffects.push(`+${intention.temporaryHpGained} PV temporales`);
  }

  // Compose final state
  let finalState = state;
  if (playerDamageResult) finalState = playerDamageResult.state;
  if (healResult) finalState = { ...finalState, character: healResult.state.character };
  if (tempHpResult) finalState = { ...finalState, character: tempHpResult.state.character };

  // Apply/remove status effects
  if (intention.statusesApplied) {
    for (const effect of intention.statusesApplied) {
      const r = GameEngine.applyStatusEffect(finalState, effect);
      finalState = r.state;
    }
  }

  // Handle XP reward
  if (intention.xpReward && intention.xpReward > 0) {
    const xpResult = GameEngine.grantXP(finalState, intention.xpReward);
    finalState = xpResult.state;
    sideEffects.push(`+${intention.xpReward} XP`);
    if (xpResult.sideEffects) {
      for (const se of xpResult.sideEffects) {
        if (se.type === 'toast') sideEffects.push(se.payload);
      }
    }
  }

  // Handle monster defeat
  if (intention.monsterDefeatedId) {
    const defeatResult = GameEngine.incrementDefeat(finalState, intention.monsterDefeatedId);
    if (defeatResult.success) finalState = defeatResult.state;
  }

  // Handle new monster discovery
  if (intention.newMonster) {
    const discoverResult = GameEngine.discoverMonster(finalState, intention.newMonster);
    finalState = discoverResult.state;
  }

  return {
    result: {
      intention,
      success: isHit,
      resultText,
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a combat_defend intention.
 * The player takes a defensive stance. Engine may grant temporary AC bonus
 * and resolve any incoming damage.
 */
function resolveCombatDefend(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const diceRolls: DiceRoll[] = [];
  const sideEffects: string[] = [];
  let finalState = state;

  // Defensive stance: if enemy attacks, resolve with a saving throw
  if (intention.savingThrowAbility) {
    const saveResult = GameEngine.resolveSavingThrow(state, intention.savingThrowAbility, intention.dc ?? 13);
    diceRolls.push({
      type: `1d20+${saveResult.total - saveResult.natural}`,
      result: saveResult.total,
      breakdown: saveResult.breakdown,
      purpose: `Salvación de ${intention.savingThrowAbility}`,
    });

    if (!saveResult.success && intention.damageToPlayer) {
      const newChar = applyDamage(finalState.character!, intention.damageToPlayer);
      finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
      sideEffects.push(`-${intention.damageToPlayer} PV`);
    }

    return {
      result: {
        intention,
        success: saveResult.success,
        resultText: saveResult.success
          ? `Defensa exitosa (${saveResult.total} vs DC ${intention.dc ?? 13})`
          : `Defensa fallida (${saveResult.total} vs DC ${intention.dc ?? 13})`,
        diceRolls,
        sideEffects,
      },
      stateUpdates: { state: finalState, success: true },
    };
  }

  // Simple defend: reduce incoming damage
  if (intention.damageToPlayer && intention.damageToPlayer > 0) {
    // Defensive stance halves damage (D&D 5e style)
    const reducedDamage = Math.floor(intention.damageToPlayer / 2);
    const newChar = applyDamage(finalState.character!, reducedDamage);
    finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
    sideEffects.push(`-${reducedDamage} PV (reducido por defensa)`);
  }

  return {
    result: {
      intention,
      success: true,
      resultText: 'Adoptas una postura defensiva',
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a skill_check intention.
 * The LLM proposes the skill and DC. The ENGINE rolls the d20 and determines success.
 */
function resolveSkillCheck(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const skillKey = (intention.skill || 'perception') as SkillKey;
  const dc = intention.dc ?? 12;

  // Engine rolls the check — the LLM NEVER decides the result
  const checkResult = GameEngine.resolveSkillCheck(state, skillKey, dc);

  const diceRolls: DiceRoll[] = [{
    type: `1d20+${checkResult.total - checkResult.natural}`,
    result: checkResult.total,
    breakdown: checkResult.breakdown,
    purpose: `Tirada de ${intention.skill || 'percepción'} (DC ${dc})`,
  }];

  const sideEffects: string[] = [];
  if (checkResult.isCrit) sideEffects.push('¡20 natural!');
  if (checkResult.isFumble) sideEffects.push('¡1 natural!');

  // Skill check consequences: success/failure may grant or deny things
  let finalState = state;

  // On success with XP reward
  if (checkResult.success && intention.xpReward) {
    const xpResult = GameEngine.grantXP(finalState, intention.xpReward);
    finalState = xpResult.state;
    sideEffects.push(`+${intention.xpReward} XP`);
  }

  // On failure, damage from trap/environment
  if (!checkResult.success && intention.damageToPlayer) {
    const newChar = applyDamage(finalState.character!, intention.damageToPlayer);
    finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
    sideEffects.push(`-${intention.damageToPlayer} PV (consecuencia del fallo)`);
  }

  // Status effects from check
  if (checkResult.success && intention.statusesRemoved) {
    for (const effect of intention.statusesRemoved) {
      const char = finalState.character!;
      finalState = {
        ...finalState,
        character: {
          ...char,
          conditions: char.conditions.filter(c => c !== effect),
        },
        updatedAt: Date.now(),
      };
    }
  }
  if (!checkResult.success && intention.statusesApplied) {
    for (const effect of intention.statusesApplied) {
      const r = GameEngine.applyStatusEffect(finalState, effect);
      finalState = r.state;
    }
  }

  return {
    result: {
      intention,
      success: checkResult.success,
      resultText: checkResult.success
        ? `Tirada de ${intention.skill || 'percepción'} exitosa: ${checkResult.total} vs DC ${dc}${checkResult.isCrit ? ' (¡CRÍTICO!)' : ''}`
        : `Tirada de ${intention.skill || 'percepción'} fallida: ${checkResult.total} vs DC ${dc}${checkResult.isFumble ? ' (¡PIFIA!)' : ''}`,
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve an npc_reaction intention.
 * The LLM suggests a reputation change. The ENGINE clamps it and updates the NPC.
 */
function resolveNPCReaction(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  const sideEffects: string[] = [];
  let finalState = state;

  // Add new NPC if provided
  if (intention.newNPC) {
    const addResult = GameEngine.addNPC(finalState, intention.newNPC);
    if (addResult.success) {
      finalState = addResult.state;
      sideEffects.push(`Nuevo PNJ: ${intention.newNPC.name}`);
    }
  }

  // Update existing NPC reputation
  if (intention.npcId && intention.reputationDelta !== undefined) {
    // Engine clamps reputation to -100..100
    const updateResult = GameEngine.updateNPCReaction(finalState, intention.npcId, intention.reputationDelta);
    if (updateResult.success) {
      finalState = updateResult.state;
      sideEffects.push(`Reputación con ${intention.npcId}: ${intention.reputationDelta >= 0 ? '+' : ''}${intention.reputationDelta}`);
    }
  }

  // Add NPC dialogue to interaction history
  if (intention.npcId && intention.dialogueText) {
    const npc = finalState.relations.find(n => n.id === intention.npcId || n.name === intention.npcId);
    if (npc) {
      const updateResult = GameEngine.updateNPC(finalState, npc.id, {
        lastInteraction: intention.dialogueText,
        interactionHistory: [...npc.interactionHistory, intention.dialogueText].slice(-20),
      });
      if (updateResult.success) finalState = updateResult.state;
    }
  }

  return {
    result: {
      intention,
      success: true,
      resultText: intention.dialogueText || `Reacción de PNJ registrada`,
      diceRolls: [],
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a quest_progress intention.
 * The LLM proposes quest changes. The ENGINE validates and applies them.
 */
function resolveQuestProgress(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  const sideEffects: string[] = [];
  const diceRolls: DiceRoll[] = [];
  let finalState = state;

  // Add new quest
  if (intention.newQuest) {
    const addResult = GameEngine.addQuest(finalState, intention.newQuest);
    if (addResult.success) {
      finalState = addResult.state;
      sideEffects.push(`Nueva misión: ${intention.newQuest.name}`);
    }
  }

  // Update existing quest
  if (intention.questId && intention.questUpdates) {
    const updateResult = GameEngine.updateQuest(finalState, intention.questId, intention.questUpdates);
    if (updateResult.success) {
      finalState = updateResult.state;
      sideEffects.push(`Misión actualizada: ${intention.questId}`);
    }
  }

  // Complete quest — ENGINE handles all reward logic
  if (intention.questId && intention.completeQuest) {
    const completeResult = GameEngine.completeQuest(finalState, intention.questId);
    if (completeResult.success) {
      finalState = completeResult.state;
      sideEffects.push(`¡Misión completada!`);
      if (completeResult.sideEffects) {
        for (const se of completeResult.sideEffects) {
          if (se.type === 'toast' || se.type === 'log') sideEffects.push(se.payload);
        }
      }
    }
  }

  // XP reward from quest progress (not completion — that's handled above)
  if (intention.xpReward && intention.xpReward > 0 && !intention.completeQuest) {
    const xpResult = GameEngine.grantXP(finalState, intention.xpReward);
    finalState = xpResult.state;
    sideEffects.push(`+${intention.xpReward} XP`);
  }

  return {
    result: {
      intention,
      success: true,
      resultText: sideEffects.join(' | ') || 'Progreso de misión registrado',
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a time_advance intention.
 * The LLM proposes time changes. The ENGINE advances time.
 */
function resolveTimeAdvance(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  let finalState = state;

  // Advance time
  if (intention.daysAdvance && intention.daysAdvance > 0) {
    const result = GameEngine.advanceTime(finalState);
    finalState = result.state;
    // Multiple days
    for (let i = 1; i < intention.daysAdvance; i++) {
      const r = GameEngine.advanceTime(finalState);
      finalState = r.state;
    }
  } else {
    // Single turn advance
    const result = GameEngine.advanceTime(finalState);
    finalState = result.state;
  }

  // Update location
  if (intention.location) {
    const result = GameEngine.updateNarrative(finalState, {
      location: intention.location,
      ...(intention.timeOfDay ? { timeOfDay: intention.timeOfDay } : {}),
    });
    finalState = result.state;
  } else if (intention.timeOfDay) {
    const result = GameEngine.updateNarrative(finalState, {
      timeOfDay: intention.timeOfDay,
    });
    finalState = result.state;
  }

  return {
    result: {
      intention,
      success: true,
      resultText: intention.location
        ? `Viajas a ${intention.location}`
        : intention.daysAdvance
        ? `Avanzan ${intention.daysAdvance} días`
        : 'El tiempo avanza',
      diceRolls: [],
      sideEffects: [],
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a loot_attempt intention.
 * The LLM suggests items and currency. The ENGINE validates weight,
 * sanitizes items, and adds to inventory.
 */
function resolveLootAttempt(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const sideEffects: string[] = [];
  const diceRolls: DiceRoll[] = [];
  let finalState = state;

  // Add items — ENGINE validates weight and sanitizes
  if (intention.lootItems && intention.lootItems.length > 0) {
    for (const rawItem of intention.lootItems) {
      const addResult = GameEngine.addItem(finalState, rawItem);
      if (addResult.success) {
        finalState = addResult.state;
        sideEffects.push(`+${rawItem.name || 'Objeto'}`);
      } else {
        sideEffects.push(`No se pudo obtener ${rawItem.name || 'objeto'}: ${addResult.message || 'inventario lleno'}`);
      }
    }
  }

  // Add currency — ENGINE sanitizes
  if (intention.lootCurrency) {
    const currencyResult = GameEngine.updateCurrency(finalState, intention.lootCurrency);
    finalState = currencyResult.state;
    const c = intention.lootCurrency;
    if (c.gold || c.silver || c.copper) {
      sideEffects.push(`+${c.gold || 0}o ${c.silver || 0}p ${c.copper || 0}c`);
    }
  }

  // XP from discovery
  if (intention.xpReward && intention.xpReward > 0) {
    const xpResult = GameEngine.grantXP(finalState, intention.xpReward);
    finalState = xpResult.state;
    sideEffects.push(`+${intention.xpReward} XP`);
  }

  return {
    result: {
      intention,
      success: true,
      resultText: sideEffects.join(' | ') || 'Buscaste pero no encontraste nada',
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve an escape_attempt intention.
 * The ENGINE rolls a check to determine if escape succeeds.
 */
function resolveEscapeAttempt(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const dc = intention.dc ?? 12;
  // Use acrobatics or athletics for escape, whichever is better
  const acroBonus = state.character.skills.find(s => s.key === 'acrobatics')?.proficient
    ? state.character.proficiencyBonus + Math.floor((state.character.abilityScores.dexterity - 10) / 2)
    : Math.floor((state.character.abilityScores.dexterity - 10) / 2);
  const athleBonus = state.character.skills.find(s => s.key === 'athletics')?.proficient
    ? state.character.proficiencyBonus + Math.floor((state.character.abilityScores.strength - 10) / 2)
    : Math.floor((state.character.abilityScores.strength - 10) / 2);

  const bestSkill = acroBonus >= athleBonus ? 'acrobatics' : 'athletics';
  const checkResult = GameEngine.resolveSkillCheck(state, bestSkill as SkillKey, dc);

  const diceRolls: DiceRoll[] = [{
    type: `1d20+${checkResult.total - checkResult.natural}`,
    result: checkResult.total,
    breakdown: checkResult.breakdown,
    purpose: `Intento de escape (${bestSkill})`,
  }];

  const sideEffects: string[] = [];
  let finalState = state;

  if (!checkResult.success && intention.damageToPlayer) {
    const newChar = applyDamage(finalState.character!, intention.damageToPlayer);
    finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
    sideEffects.push(`-${intention.damageToPlayer} PV (daño al fallar escape)`);
  }

  return {
    result: {
      intention,
      success: checkResult.success,
      resultText: checkResult.success
        ? `¡Escape exitoso! (${checkResult.total} vs DC ${dc})`
        : `Escape fallido (${checkResult.total} vs DC ${dc})`,
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a dialogue_trigger intention.
 * Records NPC dialogue. No mechanical changes.
 */
function resolveDialogueTrigger(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  let finalState = state;

  // Update NPC interaction history
  if (intention.npcId) {
    const npc = finalState.relations.find(n => n.id === intention.npcId || n.name === intention.npcId);
    if (npc && intention.dialogueText) {
      const updateResult = GameEngine.updateNPC(finalState, npc.id, {
        lastInteraction: intention.dialogueText,
        interactionHistory: [...npc.interactionHistory, intention.dialogueText].slice(-20),
      });
      if (updateResult.success) finalState = updateResult.state;
    }
  }

  // Add new NPC if this is a first meeting
  if (intention.newNPC) {
    const addResult = GameEngine.addNPC(finalState, intention.newNPC);
    if (addResult.success) finalState = addResult.state;
  }

  return {
    result: {
      intention,
      success: true,
      resultText: intention.dialogueText || 'Diálogo registrado',
      diceRolls: [],
      sideEffects: [],
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve an environment_effect intention.
 * Handles traps, weather, poison, etc.
 */
function resolveEnvironmentEffect(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const diceRolls: DiceRoll[] = [];
  const sideEffects: string[] = [];
  let finalState = state;

  // Saving throw to avoid effect
  if (intention.savingThrowAbility) {
    const saveResult = GameEngine.resolveSavingThrow(state, intention.savingThrowAbility, intention.dc ?? 12);
    diceRolls.push({
      type: `1d20+${saveResult.total - saveResult.natural}`,
      result: saveResult.total,
      breakdown: saveResult.breakdown,
      purpose: `Salvación de ${intention.savingThrowAbility} (efecto ambiental)`,
    });

    if (!saveResult.success) {
      // Apply damage on failed save
      if (intention.damageToPlayer) {
        const newChar = applyDamage(finalState.character!, intention.damageToPlayer);
        finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
        sideEffects.push(`-${intention.damageToPlayer} PV`);
      }
      // Apply status effects
      if (intention.statusesApplied) {
        for (const effect of intention.statusesApplied) {
          const r = GameEngine.applyStatusEffect(finalState, effect);
          finalState = r.state;
          sideEffects.push(`Estado: ${effect}`);
        }
      }
    } else {
      // Half damage on successful save (D&D 5e convention)
      if (intention.damageToPlayer) {
        const halfDamage = Math.floor(intention.damageToPlayer / 2);
        const newChar = applyDamage(finalState.character!, halfDamage);
        finalState = { ...finalState, character: clampHp(newChar), updatedAt: Date.now() };
        sideEffects.push(`-${halfDamage} PV (mitad por salvación exitosa)`);
      }
    }

    return {
      result: {
        intention,
        success: saveResult.success,
        resultText: saveResult.success
          ? `Salvación exitosa contra efecto ambiental (${saveResult.total} vs DC ${intention.dc ?? 12})`
          : `Salvación fallida contra efecto ambiental (${saveResult.total} vs DC ${intention.dc ?? 12})`,
        diceRolls,
        sideEffects,
      },
      stateUpdates: { state: finalState, success: true },
    };
  }

  // No saving throw — effect applies directly (e.g., weather change)
  if (intention.statusesApplied) {
    for (const effect of intention.statusesApplied) {
      const r = GameEngine.applyStatusEffect(finalState, effect);
      finalState = r.state;
    }
  }

  return {
    result: {
      intention,
      success: true,
      resultText: `Efecto ambiental: ${intention.description}`,
      diceRolls,
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

/**
 * Resolve a rest_attempt intention.
 * The ENGINE handles HP restoration according to D&D 5e rules.
 */
function resolveRestAttempt(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  if (!state.character) {
    return {
      result: { intention, success: false, resultText: 'No character', diceRolls: [], sideEffects: [] },
      stateUpdates: null,
    };
  }

  const isLongRest = intention.description.toLowerCase().includes('largo') ||
    intention.description.toLowerCase().includes('long');
  const restResult = GameEngine.restCharacter(state, isLongRest);

  return {
    result: {
      intention,
      success: true,
      resultText: isLongRest
        ? 'Descanso largo completado — Vida y recursos restaurados'
        : 'Descanso corto completado — Dados de golpe gastados',
      diceRolls: [],
      sideEffects: isLongRest
        ? ['PV restaurados al máximo', 'Tiradas de muerte reiniciadas']
        : ['Dados de golpe recuperados'],
    },
    stateUpdates: { state: restResult.state, success: true },
  };
}

/**
 * Resolve a death_event intention.
 * The ENGINE records the death in the Book of Dead.
 */
function resolveDeathEvent(
  state: GameState,
  intention: Intention
): { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null } {
  let finalState = state;
  const sideEffects: string[] = [];

  if (intention.deathEntry) {
    const addResult = GameEngine.addDeathEntry(finalState, intention.deathEntry);
    if (addResult.success) {
      finalState = addResult.state;
      sideEffects.push(`${intention.deathEntry.name} ha muerto: ${intention.deathEntry.causeOfDeath}`);
    }
  }

  // If the player character died
  if (state.character && state.character.currentHp <= 0 && state.character.deathSaves.failures >= 3) {
    sideEffects.push('¡Tu personaje ha caído!');
  }

  return {
    result: {
      intention,
      success: true,
      resultText: sideEffects.join(' | ') || 'Evento de muerte registrado',
      diceRolls: [],
      sideEffects,
    },
    stateUpdates: { state: finalState, success: true },
  };
}

// ==========================================
// MAIN RESOLVER — resolveIntentions()
// ==========================================

/**
 * Resolve ALL intentions from an AI DM response.
 * This is the entry point for the new pipeline:
 *   LLM returns { narrative, intentions }
 *   → resolveIntentions() processes each intention through GameEngine
 *   → returns updated state + resolutions + dice rolls
 *
 * The LLM NEVER directly modifies game state. Only this function does.
 */
export function resolveIntentions(
  state: GameState,
  intentions: Intention[]
): IntentionsResolutionResult {
  let currentState = state;
  const allResolutions: IntentionResolution[] = [];
  const allDiceRolls: DiceRoll[] = [];
  const allSideEffects: EngineSideEffect[] = [];
  const summaryParts: string[] = [];

  for (const intention of intentions) {
    let resolutionPair: { result: IntentionResolution; stateUpdates: Partial<EngineResult> | null };

    switch (intention.type) {
      case 'combat_attack':
        resolutionPair = resolveCombatAttack(currentState, intention);
        break;
      case 'combat_defend':
        resolutionPair = resolveCombatDefend(currentState, intention);
        break;
      case 'skill_check':
        resolutionPair = resolveSkillCheck(currentState, intention);
        break;
      case 'npc_reaction':
        resolutionPair = resolveNPCReaction(currentState, intention);
        break;
      case 'quest_progress':
        resolutionPair = resolveQuestProgress(currentState, intention);
        break;
      case 'time_advance':
        resolutionPair = resolveTimeAdvance(currentState, intention);
        break;
      case 'loot_attempt':
        resolutionPair = resolveLootAttempt(currentState, intention);
        break;
      case 'escape_attempt':
        resolutionPair = resolveEscapeAttempt(currentState, intention);
        break;
      case 'dialogue_trigger':
        resolutionPair = resolveDialogueTrigger(currentState, intention);
        break;
      case 'environment_effect':
        resolutionPair = resolveEnvironmentEffect(currentState, intention);
        break;
      case 'rest_attempt':
        resolutionPair = resolveRestAttempt(currentState, intention);
        break;
      case 'death_event':
        resolutionPair = resolveDeathEvent(currentState, intention);
        break;
      default:
        // Unknown intention type — log but don't crash
        resolutionPair = {
          result: {
            intention,
            success: false,
            resultText: `Tipo de intención desconocido: ${intention.type}`,
            diceRolls: [],
            sideEffects: [],
          },
          stateUpdates: null,
        };
    }

    allResolutions.push(resolutionPair.result);
    allDiceRolls.push(...resolutionPair.result.diceRolls);

    // Apply state updates from this resolution
    if (resolutionPair.stateUpdates?.state) {
      currentState = resolutionPair.stateUpdates.state;
    }

    // Collect side effects
    for (const se of resolutionPair.result.sideEffects) {
      allSideEffects.push({ type: 'log', payload: se });
    }

    // Build summary
    summaryParts.push(resolutionPair.result.resultText);
  }

  // Always advance the turn counter by 1 when intentions are processed
  const turnResult = GameEngine.advanceTime(currentState);
  currentState = turnResult.state;

  return {
    state: currentState,
    resolutions: allResolutions,
    allSideEffects,
    allDiceRolls,
    resolutionSummary: summaryParts.join('\n'),
  };
}
