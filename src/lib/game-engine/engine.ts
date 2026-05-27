// ==========================================
// TABERNA DEL VIEJO GREG - Authoritative Game Engine
// ==========================================
// The GameEngine class is the SINGLE ENTRY POINT for all game state mutations.
// No component, store action, or API route should modify game state without
// going through this class.
//
// ARCHITECTURE:
// - GameEngine is stateless: it takes a GameState and returns a new GameState.
// - All methods are pure functions that don't mutate the input.
// - The Zustand store wraps GameEngine methods and handles persistence.
// - API routes use GameEngine for server-side validation.
// - UI components NEVER call GameEngine directly — only through store actions.
//
// SAVE COMPATIBILITY:
// - GameEngine does NOT change the GameState shape.
// - Existing saves will load without migration.
// - New fields default gracefully if missing.

import {
  type GameState,
  type Character,
  type Item,
  type Currency,
  type Quest,
  type NPC,
  type Monster,
  type DeathEntry,
  type ChatMessage,
  type StateUpdates,
  type Equipment,
  type SkillKey,
  type AbilityScore,
  type Skill,
  type Intention,
  type IntentionResolution,
  type DiceRoll,
  SKILL_MAP,
  getModifier,
  HIT_DIE_AVERAGE,
  transformKeysDeep,
  transformAIResponse,
} from '@/lib/game-types';

import { type CheckResult, resolveSkillCheck, resolveSavingThrow } from './checks';
import {
  applyDamage,
  applyHealing,
  applyTemporaryHp,
  applyStatusEffect,
  removeCondition,
  clampHp,
  resolveDeathSave,
  resolveCombat,
  type CombatResult,
  type DeathSaveResult,
} from './combat';
import {
  levelUp,
  grantXP,
  longRest as performLongRest,
  shortRest as performShortRest,
  canLevelUp,
  calculateProficiencyBonus,
  calculateXPToNext,
  type LevelUpResult,
  type GrantXPResult,
} from './progression';
import {
  addItem,
  removeItem,
  equipItem as engineEquipItem,
  unequipItem as engineUnequipItem,
  consumeItem as engineConsumeItem,
  sanitizeItem,
  calculateAC,
  calculateWeight,
  createEmptyInventory,
  type AddItemResult,
} from './inventory';
import {
  sanitizeCurrency,
  parseCoinString,
  updateCurrency as engineUpdateCurrency,
  grantLoot,
  type LootResult,
} from './economy';
import {
  advanceTime,
  advanceTurn,
  advanceDays,
  updateLocation,
  updateNarrative,
  type TimeOfDay,
} from './world-time';
import { createDefaultConsequenceState } from '@/lib/consequences/types';
import { resolveIntentions as resolveIntentionsImpl, type IntentionsResolutionResult } from './intention-resolver';

// --- GameEngine Result ---

export interface EngineResult<T = GameState> {
  state: T;
  success: boolean;
  message?: string;
  sideEffects?: EngineSideEffect[];
}

export interface EngineSideEffect {
  type: 'toast' | 'log' | 'narrative' | 'death';
  payload: string;
}

// ==========================================
// GAME ENGINE CLASS
// ==========================================

export class GameEngine {
  // ==========================================
  // CHARACTER
  // ==========================================

  /**
   * Set the character after creation. Validates and clamps all fields.
   */
  static setCharacter(state: GameState, character: Character): EngineResult {
    // Safe character with all required fields
    const safeChar: Character = {
      name: character?.name || 'Aventurero',
      race: character?.race || 'Humano',
      class: character?.class || 'Guerrero',
      subclass: character?.subclass || '',
      level: character?.level ?? 1,
      currentHp: character?.currentHp ?? character?.maxHp ?? 10,
      maxHp: character?.maxHp ?? 10,
      temporaryHp: character?.temporaryHp ?? 0,
      experience: character?.experience ?? 0,
      experienceToNext: character?.experienceToNext ?? 300,
      armorClass: character?.armorClass ?? 10,
      initiative: character?.initiative ?? 0,
      speed: character?.speed ?? 30,
      proficiencyBonus: character?.proficiencyBonus ?? 2,
      abilityScores: character?.abilityScores ?? {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
      },
      savingThrows: character?.savingThrows ?? {
        strength: false, dexterity: false, constitution: false,
        intelligence: false, wisdom: false, charisma: false,
      },
      skills: character?.skills ?? Object.entries(SKILL_MAP).map(([key, val]) => ({
        key: key as SkillKey,
        name: val.name,
        ability: val.ability,
        proficient: false,
        expertise: false,
      })),
      hitDice: character?.hitDice ?? '1d8',
      hitDiceRemaining: character?.hitDiceRemaining ?? 1,
      deathSaves: character?.deathSaves ?? { successes: 0, failures: 0 },
      conditions: character?.conditions ?? [],
      backstory: character?.backstory || '',
    };

    const strength = safeChar.abilityScores.strength;
    const newInventory = createEmptyInventory(strength);
    // Preserve existing items
    newInventory.items = state.inventory.items;

    return {
      state: {
        ...state,
        character: clampHp(safeChar),
        inventory: newInventory,
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update character fields partially. Clamps HP after update.
   */
  static updateCharacter(state: GameState, updates: Partial<Character>): EngineResult {
    if (!state.character) {
      return { state, success: false, message: 'No character to update' };
    }

    const updatedChar = clampHp({ ...state.character, ...updates });
    return {
      state: {
        ...state,
        character: updatedChar,
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // PROGRESSION
  // ==========================================

  /**
   * Grant XP and auto-level-up if threshold is reached.
   */
  static grantXP(state: GameState, amount: number): EngineResult {
    if (!state.character) return { state, success: false, message: 'No character' };

    const result = grantXP(state.character, amount);
    const sideEffects: EngineSideEffect[] = [
      { type: 'log', payload: `+${amount} XP` },
    ];

    if (result.didLevelUp) {
      sideEffects.push({
        type: 'toast',
        payload: `¡Has subido a nivel ${result.character.level}! (+${result.levelsGained} nivel${result.levelsGained > 1 ? 'es' : ''})`,
      });
    }

    return {
      state: {
        ...state,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects,
    };
  }

  /**
   * Force a level-up (e.g., from UI button). Only works if character has enough XP.
   */
  static levelUp(state: GameState, abilityImprovements?: Partial<Record<string, number>>): EngineResult {
    if (!state.character) return { state, success: false, message: 'No character' };
    if (!canLevelUp(state.character)) {
      return { state, success: false, message: 'Not enough XP to level up' };
    }

    const result = levelUp(state.character, abilityImprovements);

    return {
      state: {
        ...state,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects: [
        { type: 'toast', payload: `¡Has subido a nivel ${result.character.level}! (+${result.hpGained} HP)` },
      ],
    };
  }

  /**
   * Perform a rest (short or long).
   */
  static restCharacter(state: GameState, longRest: boolean): EngineResult {
    if (!state.character) return { state, success: false, message: 'No character' };

    const updatedChar = longRest
      ? performLongRest(state.character)
      : performShortRest(state.character);

    return {
      state: {
        ...state,
        character: clampHp(updatedChar),
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects: [
        { type: 'toast', payload: longRest ? 'Descanso largo completado — Vida restaurada' : 'Descanso corto completado — Dados de golpe gastados' },
      ],
    };
  }

  // ==========================================
  // COMBAT
  // ==========================================

  /**
   * Resolve combat: apply damage, healing, and status effects in one pass.
   */
  static resolveCombat(state: GameState, params: {
    damageTaken?: number;
    healingReceived?: number;
    temporaryHpGained?: number;
    statusesApplied?: string[];
    statusesRemoved?: string[];
  }): EngineResult {
    if (!state.character) return { state, success: false, message: 'No character' };

    const result = resolveCombat({
      character: state.character,
      ...params,
    });

    const sideEffects: EngineSideEffect[] = [];
    if (params.damageTaken && params.damageTaken > 0) {
      sideEffects.push({ type: 'log', payload: `-${params.damageTaken} HP` });
    }
    if (result.characterDied) {
      sideEffects.push({ type: 'death', payload: `${state.character.name} ha caído en combate` });
    }

    return {
      state: {
        ...state,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects,
    };
  }

  /**
   * Process a death saving throw.
   */
  static resolveDeathSave(state: GameState): EngineResult & { deathResult?: DeathSaveResult } {
    if (!state.character) return { state, success: false, message: 'No character' };

    const result = resolveDeathSave(state.character);
    const sideEffects: EngineSideEffect[] = [];

    if (result.stabilized) {
      sideEffects.push({ type: 'toast', payload: '¡Te has estabilizado!' });
    }
    if (result.died) {
      sideEffects.push({ type: 'death', payload: `${state.character.name} ha muerto` });
    }

    return {
      state: {
        ...state,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects,
      deathResult: result,
    };
  }

  /**
   * Apply a status effect to the character.
   */
  static applyStatusEffect(state: GameState, effect: string): EngineResult {
    if (!state.character) return { state, success: false, message: 'No character' };

    return {
      state: {
        ...state,
        character: applyStatusEffect(state.character, effect),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // SKILL CHECKS
  // ==========================================

  /**
   * Resolve a skill check. Does NOT mutate state — returns the result for the caller.
   */
  static resolveSkillCheck(
    state: GameState,
    skillKey: SkillKey,
    dc: number
  ): CheckResult {
    if (!state.character) {
      return { success: false, total: 0, dc, natural: 0, isCrit: false, isFumble: false, breakdown: 'No character' };
    }
    return resolveSkillCheck(state.character, skillKey, dc);
  }

  /**
   * Resolve a saving throw. Does NOT mutate state — returns the result for the caller.
   */
  static resolveSavingThrow(
    state: GameState,
    ability: AbilityScore,
    dc: number
  ): CheckResult {
    if (!state.character) {
      return { success: false, total: 0, dc, natural: 0, isCrit: false, isFumble: false, breakdown: 'No character' };
    }
    return resolveSavingThrow(state.character, ability, dc);
  }

  // ==========================================
  // INVENTORY
  // ==========================================

  /**
   * Add an item to inventory with weight enforcement and sanitization.
   */
  static addItem(state: GameState, rawItem: Partial<Item> & { id?: string }): EngineResult {
    const result = addItem(state.inventory, rawItem);

    if (!result.added) {
      return { state, success: false, message: result.reason };
    }

    return {
      state: {
        ...state,
        inventory: result.inventory,
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Remove an item from inventory (unequips automatically).
   */
  static removeItem(state: GameState, itemId: string): EngineResult {
    return {
      state: {
        ...state,
        inventory: removeItem(state.inventory, itemId),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Equip an item. Updates equipment slots and recalculates AC.
   */
  static equipItem(state: GameState, itemId: string): EngineResult {
    const result = engineEquipItem(state.inventory, state.character, itemId);

    return {
      state: {
        ...state,
        inventory: result.inventory,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Unequip an item from a slot. Recalculates AC.
   */
  static unequipItem(state: GameState, slot: keyof Equipment): EngineResult {
    const result = engineUnequipItem(state.inventory, state.character, slot);

    return {
      state: {
        ...state,
        inventory: result.inventory,
        character: result.character,
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Consume an item (potion, food, scroll, etc.).
   */
  static consumeItem(state: GameState, itemId: string): EngineResult {
    const result = engineConsumeItem(state.inventory, itemId);

    if (!result.consumed) {
      return { state, success: false, message: `Item ${result.itemName} is not consumable` };
    }

    return {
      state: {
        ...state,
        inventory: result.inventory,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects: result.effect
        ? [{ type: 'log', payload: `Used ${result.itemName}: ${result.effect}` }]
        : [],
    };
  }

  // ==========================================
  // ECONOMY
  // ==========================================

  /**
   * Update currency by adding partial amounts. Sanitizes result.
   */
  static updateCurrency(state: GameState, updates: Partial<Currency>): EngineResult {
    return {
      state: {
        ...state,
        inventory: {
          ...state.inventory,
          currency: engineUpdateCurrency(state.inventory.currency, updates),
        },
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Set currency to exact values. Sanitizes result.
   */
  static setCurrency(state: GameState, updates: Partial<Currency>): EngineResult {
    return {
      state: {
        ...state,
        inventory: {
          ...state.inventory,
          currency: sanitizeCurrency({
            gold: updates.gold ?? state.inventory.currency.gold,
            silver: updates.silver ?? state.inventory.currency.silver,
            copper: updates.copper ?? state.inventory.currency.copper,
          }),
        },
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // QUESTS
  // ==========================================

  /**
   * Complete a quest: award XP, coins, items, and auto-level-up.
   * This is the ONLY way to complete quests — all reward logic is centralized.
   */
  static completeQuest(state: GameState, questId: string): EngineResult {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest || !state.character) {
      return { state, success: false, message: 'Quest not found or no character' };
    }

    // Grant loot (XP + coins + items)
    const loot = grantLoot(quest);

    // Grant XP (with auto-level-up)
    let char = { ...state.character };
    const xpResult = grantXP(char, loot.xp);
    char = xpResult.character;

    // Apply coin reward
    let currency = engineUpdateCurrency(state.inventory.currency, loot.currency);

    // Add item rewards to inventory
    let inventory = { ...state.inventory, currency };
    for (const item of loot.items) {
      const addResult = addItem(inventory, item);
      if (addResult.added) {
        inventory = addResult.inventory;
      }
    }

    // Mark quest as completed
    const quests = state.quests.map((q) =>
      q.id === questId ? { ...q, status: 'completed' as const } : q
    );

    const sideEffects: EngineSideEffect[] = [
      { type: 'log', payload: `Quest completed: ${quest.name}` },
      { type: 'toast', payload: `¡Misión completada: ${quest.name}! +${loot.xp} XP` },
    ];
    if (xpResult.didLevelUp) {
      sideEffects.push({
        type: 'toast',
        payload: `¡Has subido a nivel ${xpResult.character.level}!`,
      });
    }

    return {
      state: {
        ...state,
        character: char,
        inventory,
        quests,
        updatedAt: Date.now(),
      },
      success: true,
      sideEffects,
    };
  }

  // ==========================================
  // RELATIONS / NPC
  // ==========================================

  /**
   * Update an NPC's reaction/reputation.
   * Clamps reputation score to -100..100 range.
   */
  static updateNPCReaction(
    state: GameState,
    npcId: string,
    reputationDelta: number
  ): EngineResult {
    const npc = state.relations.find((n) => n.id === npcId);
    if (!npc) return { state, success: false, message: 'NPC not found' };

    const newScore = Math.max(-100, Math.min(100, npc.reputationScore + reputationDelta));

    // Determine reputation label based on score
    let reputation = npc.reputation as NPC['reputation'];
    if (newScore >= 75) reputation = 'allied';
    else if (newScore >= 25) reputation = 'friendly';
    else if (newScore >= -25) reputation = 'neutral';
    else if (newScore >= -75) reputation = 'unfriendly';
    else reputation = 'hostile';

    return {
      state: {
        ...state,
        relations: state.relations.map((n) =>
          n.id === npcId ? { ...n, reputationScore: newScore, reputation } : n
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // NARRATIVE / WORLD TIME
  // ==========================================

  /**
   * Advance the turn counter by 1.
   */
  static advanceTime(state: GameState): EngineResult {
    return {
      state: {
        ...state,
        narrative: advanceTurn(state.narrative),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Advance time by a full period (Mañana→Tarde, etc.).
   */
  static advanceWorldTime(state: GameState): EngineResult {
    return {
      state: {
        ...state,
        narrative: advanceTime(state.narrative),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update narrative state partially.
   */
  static updateNarrative(state: GameState, updates: Partial<GameState['narrative']>): EngineResult {
    return {
      state: {
        ...state,
        narrative: updateNarrative(state.narrative, updates),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // INTENTION RESOLUTION (New Pipeline)
  // ==========================================

  /**
   * Resolve AI intentions through the authoritative GameEngine.
   * The LLM proposes intentions; the engine determines actual outcomes.
   *
   * PIPELINE:
   * 1. Player acts → LLM proposes intention
   * 2. GameEngine resolves intention (dice, rules, calculations)
   * 3. Engine updates state with real results
   * 4. Narrative reflects engine-calculated outcomes
   */
  static resolveIntentions(
    state: GameState,
    intentions: Intention[]
  ): EngineResult & {
    resolutions: IntentionResolution[];
    allDiceRolls: DiceRoll[];
    resolutionSummary: string;
  } {
    // Delegate to the intention-resolver module
    const result = resolveIntentionsImpl(state, intentions);

    return {
      state: result.state,
      success: true,
      sideEffects: result.allSideEffects,
      resolutions: result.resolutions,
      allDiceRolls: result.allDiceRolls,
      resolutionSummary: result.resolutionSummary,
    };
  }

  // ==========================================
  // AI STATE UPDATES (Legacy — kept for migration)
  // ==========================================

  /**
   * Apply structured AI state updates from the DM.
   * This is the ONLY method that should be called when the AI sends state_updates.
   * Routes each update through the appropriate GameEngine method.
   */
  static applyStateUpdates(state: GameState, updates: StateUpdates): EngineResult {
    let currentState = { ...state };
    const allSideEffects: EngineSideEffect[] = [];

    // Character updates
    if (updates.character && currentState.character) {
      const result = GameEngine.updateCharacter(currentState, updates.character);
      currentState = result.state;
      if (result.sideEffects) allSideEffects.push(...result.sideEffects);
    }

    // Inventory updates
    if (updates.inventory) {
      if (updates.inventory.addItems) {
        for (const item of updates.inventory.addItems) {
          const result = GameEngine.addItem(currentState, item);
          currentState = result.state;
          if (result.sideEffects) allSideEffects.push(...result.sideEffects);
        }
      }
      if (updates.inventory.removeItems) {
        for (const itemId of updates.inventory.removeItems) {
          const result = GameEngine.removeItem(currentState, itemId);
          currentState = result.state;
        }
      }
      if (updates.inventory.equipItem) {
        const result = GameEngine.equipItem(currentState, updates.inventory.equipItem);
        currentState = result.state;
      }
      if (updates.inventory.unequipItem) {
        const item = currentState.inventory.items.find(
          (i) => i.id === updates.inventory!.unequipItem
        );
        if (item?.equipSlot) {
          const result = GameEngine.unequipItem(currentState, item.equipSlot);
          currentState = result.state;
        }
      }
      if (updates.inventory.currency) {
        const result = GameEngine.updateCurrency(currentState, updates.inventory.currency);
        currentState = result.state;
      }
      if (updates.inventory.consumeItem) {
        const result = GameEngine.consumeItem(currentState, updates.inventory.consumeItem);
        currentState = result.state;
      }
    }

    // Quest updates (routed through GameEngine methods)
    if (updates.quests) {
      if (updates.quests.addQuest) {
        const result = GameEngine.addQuest(currentState, updates.quests.addQuest);
        currentState = result.state;
      }
      if (updates.quests.updateQuest) {
        const result = GameEngine.updateQuest(currentState, updates.quests.updateQuest.id, updates.quests.updateQuest.updates);
        currentState = result.state;
      }
      if (updates.quests.completeQuest) {
        const result = GameEngine.completeQuest(currentState, updates.quests.completeQuest);
        currentState = result.state;
        if (result.sideEffects) allSideEffects.push(...result.sideEffects);
      }
    }

    // Relations updates (routed through GameEngine methods)
    if (updates.relations) {
      if (updates.relations.addNPC) {
        const result = GameEngine.addNPC(currentState, updates.relations.addNPC);
        currentState = result.state;
      }
      if (updates.relations.updateNPC) {
        const result = GameEngine.updateNPC(currentState, updates.relations.updateNPC.id, updates.relations.updateNPC.updates);
        currentState = result.state;
      }
    }

    // Bestiary updates (routed through GameEngine methods)
    if (updates.bestiary) {
      if (updates.bestiary.discoverMonster) {
        const result = GameEngine.discoverMonster(currentState, updates.bestiary.discoverMonster);
        currentState = result.state;
      }
      if (updates.bestiary.updateMonster) {
        const result = GameEngine.updateMonster(currentState, updates.bestiary.updateMonster.id, updates.bestiary.updateMonster.updates);
        currentState = result.state;
      }
      if (updates.bestiary.incrementDefeat) {
        const result = GameEngine.incrementDefeat(currentState, updates.bestiary.incrementDefeat);
        currentState = result.state;
      }
    }

    // Book of Dead updates (routed through GameEngine methods)
    if (updates.bookOfDead) {
      if (updates.bookOfDead.addEntry) {
        const result = GameEngine.addDeathEntry(currentState, updates.bookOfDead.addEntry);
        currentState = result.state;
      }
      if (updates.bookOfDead.updateEntry) {
        const result = GameEngine.updateDeathEntry(currentState, updates.bookOfDead.updateEntry.id, updates.bookOfDead.updateEntry.updates);
        currentState = result.state;
      }
    }

    // Narrative updates (routed through GameEngine method)
    if (updates.narrative) {
      const result = GameEngine.updateNarrative(currentState, updates.narrative);
      currentState = result.state;
    }

    return {
      state: currentState,
      success: true,
      sideEffects: allSideEffects,
    };
  }

  // ==========================================
  // SAVE/LOAD VALIDATION
  // ==========================================

  /**
   * Validate and sanitize an imported GameState.
   * Ensures backward compatibility with older save formats.
   */
  static validateAndSanitizeSave(raw: unknown): EngineResult {
    const gameState = raw as GameState;

    // Basic validation
    if (!gameState.id || !gameState.character) {
      return { state: gameState, success: false, message: 'Invalid save: missing id or character' };
    }

    const char = gameState.character;
    if (typeof char.name !== 'string' || typeof char.level !== 'number' ||
        typeof char.currentHp !== 'number' || typeof char.maxHp !== 'number' ||
        !char.abilityScores || typeof char.abilityScores.strength !== 'number') {
      return { state: gameState, success: false, message: 'Invalid character structure' };
    }

    if (!gameState.inventory || !Array.isArray(gameState.inventory.items)) {
      return { state: gameState, success: false, message: 'Invalid inventory structure' };
    }

    // Sanitize the state
    const sanitizedState: GameState = {
      ...gameState,
      character: gameState.character ? clampHp(gameState.character) : null,
      inventory: {
        ...gameState.inventory,
        currency: sanitizeCurrency(gameState.inventory.currency),
        items: gameState.inventory.items || [],
        equipment: gameState.inventory.equipment || { weapon: null, armor: null, shield: null, accessory: null },
        maxWeight: gameState.inventory.maxWeight || (gameState.character?.abilityScores?.strength ?? 10) * 15,
      },
      quests: gameState.quests || [],
      relations: gameState.relations || [],
      bestiary: gameState.bestiary || [],
      bookOfDead: gameState.bookOfDead || [],
      chatHistory: gameState.chatHistory || [],
      narrative: gameState.narrative || { location: 'Taberna del Viejo Greg', timeOfDay: 'Noche', day: 1, turn: 0 },
      consequenceState: gameState.consequenceState ?? createDefaultConsequenceState(),
      updatedAt: Date.now(),
    };

    return { state: sanitizedState, success: true };
  }

  // ==========================================
  // UTILITY / READ-ONLY QUERIES
  // ==========================================

  /**
   * Check if the character can level up.
   */
  static canLevelUp(state: GameState): boolean {
    return state.character ? canLevelUp(state.character) : false;
  }

  /**
   * Get the current inventory weight.
   */
  static getInventoryWeight(state: GameState): number {
    return calculateWeight(state.inventory.items);
  }

  /**
   * Get a summary of the current game state for AI context building.
   */
  static getContextSummary(state: GameState): string {
    const char = state.character;
    const narrative = state.narrative;
    const inventory = state.inventory;

    let context = `=== ESTADO ACTUAL DEL JUEGO ===\n`;

    context += `Ubicación: ${narrative.location}\n`;
    context += `Hora: ${narrative.timeOfDay} | Día: ${narrative.day} | Turno: ${narrative.turn}\n\n`;

    if (char) {
      context += `=== PERSONAJE ===\n`;
      context += `Nombre: ${char.name} | Raza: ${char.race} | Clase: ${char.class}\n`;
      context += `Nivel: ${char.level} | HP: ${char.currentHp}/${char.maxHp} | CA: ${char.armorClass}\n`;
      context += `XP: ${char.experience}/${char.experienceToNext}\n`;
      context += `FUE: ${char.abilityScores.strength} DES: ${char.abilityScores.dexterity} CON: ${char.abilityScores.constitution}\n`;
      context += `INT: ${char.abilityScores.intelligence} SAB: ${char.abilityScores.wisdom} CAR: ${char.abilityScores.charisma}\n`;
      if (char.conditions.length > 0) {
        context += `Condiciones: ${char.conditions.join(', ')}\n`;
      }
      context += `\n`;
    }

    if (inventory.items.length > 0) {
      context += `=== INVENTARIO ===\n`;
      context += `Oro: ${inventory.currency.gold} | Plata: ${inventory.currency.silver} | Cobre: ${inventory.currency.copper}\n`;
      const equip = inventory.equipment;
      context += `Equipado: Arma: ${equip.weapon?.name || 'Ninguna'} | Armadura: ${equip.armor?.name || 'Ninguna'} | Escudo: ${equip.shield?.name || 'Ninguno'}\n`;
      const maxItems = 30;
      const displayItems = inventory.items.slice(0, maxItems);
      context += `Objetos: ${displayItems.map((i) => `${i.name}(${i.quantity || 1})`).join(', ')}`;
      if (inventory.items.length > maxItems) {
        context += ` ... y ${inventory.items.length - maxItems} más`;
      }
      context += `\n\n`;
    }

    const activeQuests = state.quests.filter(q => q.status !== 'completed');
    if (activeQuests.length > 0) {
      context += `=== MISIONES ACTIVAS ===\n`;
      for (const q of activeQuests) {
        context += `[${q.status}] ${q.name}: ${q.description}${q.followed ? ' ★SIGUIENDO' : ''}\n`;
      }
      context += `\n`;
    }

    if (state.relations.length > 0) {
      context += `=== PNJs CONOCIDOS ===\n`;
      for (const npc of state.relations) {
        context += `${npc.name} (${npc.race}) - ${npc.location} - Reputación: ${npc.reputation} (${npc.reputationScore})${!npc.alive ? ' [MUERTO]' : ''}\n`;
      }
      context += `\n`;
    }

    if (state.bestiary.length > 0) {
      context += `=== BESTIARIO ===\n`;
      for (const m of state.bestiary) {
        context += `${m.name} (Nv.${m.level}) - Derrotas: ${m.defeatCount}\n`;
      }
      context += `\n`;
    }

    if (state.bookOfDead.length > 0) {
      context += `=== LIBRO DE MUERTES ===\n`;
      for (const d of state.bookOfDead) {
        context += `${d.name} - Causa: ${d.causeOfDeath}${!d.confirmed ? ' [NO CONFIRMADO]' : ''}\n`;
      }
      context += `\n`;
    }

    context += `=== FIN DEL ESTADO ===`;

    return context;
  }

  // ==========================================
  // FACTORY FUNCTIONS
  // ==========================================

  /**
   * Generate a unique ID for game entities.
   */
  static generateId(): string {
    return crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Create an empty character with all fields properly initialized.
   */
  static createEmptyCharacter(): Character {
    return {
      name: '',
      race: '',
      class: '',
      subclass: '',
      level: 1,
      currentHp: 10,
      maxHp: 10,
      temporaryHp: 0,
      experience: 0,
      experienceToNext: 300,
      armorClass: 10,
      initiative: 0,
      speed: 30,
      proficiencyBonus: 2,
      abilityScores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
      },
      savingThrows: {
        strength: false, dexterity: false, constitution: false,
        intelligence: false, wisdom: false, charisma: false,
      },
      skills: Object.entries(SKILL_MAP).map(([key, val]) => ({
        key: key as SkillKey,
        name: val.name,
        ability: val.ability,
        proficient: false,
        expertise: false,
      })),
      hitDice: '1d8',
      hitDiceRemaining: 1,
      deathSaves: { successes: 0, failures: 0 },
      conditions: [],
      backstory: '',
    };
  }

  /**
   * Create a default game state with all collections empty.
   */
  static createDefaultGameState(id?: string): GameState {
    return {
      id: id || GameEngine.generateId(),
      name: 'Nueva Partida',
      character: null,
      inventory: createEmptyInventory(),
      quests: [],
      relations: [],
      bestiary: [],
      bookOfDead: [],
      chatHistory: [],
      narrative: {
        location: 'Taberna del Viejo Greg',
        timeOfDay: 'Noche',
        day: 1,
        turn: 0,
      },
      consequenceState: createDefaultConsequenceState(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
  }

  // ==========================================
  // QUESTS (Authoritative)
  // ==========================================

  /**
   * Add a quest to the game. Validates and assigns an ID if missing.
   */
  static addQuest(state: GameState, quest: Quest): EngineResult {
    const safeQuest: Quest = {
      ...quest,
      id: quest.id || GameEngine.generateId(),
      status: quest.status || 'active',
      followed: quest.followed ?? false,
      objectives: quest.objectives || [],
      completedObjectives: quest.completedObjectives || [],
      itemRewards: quest.itemRewards || [],
    };

    return {
      state: {
        ...state,
        quests: [...state.quests, safeQuest],
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update a quest partially. Validates the quest exists.
   */
  static updateQuest(state: GameState, questId: string, updates: Partial<Quest>): EngineResult {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) {
      return { state, success: false, message: 'Quest not found' };
    }

    return {
      state: {
        ...state,
        quests: state.quests.map((q) =>
          q.id === questId ? { ...q, ...updates } : q
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Toggle the "followed" status of a quest.
   */
  static followQuest(state: GameState, questId: string): EngineResult {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) {
      return { state, success: false, message: 'Quest not found' };
    }

    return {
      state: {
        ...state,
        quests: state.quests.map((q) => ({
          ...q,
          followed: q.id === questId ? !q.followed : q.followed,
        })),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // RELATIONS / NPC (Authoritative)
  // ==========================================

  /**
   * Add an NPC to the game. Validates and assigns an ID if missing.
   */
  static addNPC(state: GameState, npc: NPC): EngineResult {
    // Validate reputation
    const validReputations: NPC['reputation'][] = ['hostile', 'unfriendly', 'neutral', 'friendly', 'allied'];
    const safeReputation = validReputations.includes(npc.reputation) ? npc.reputation : 'neutral';

    const safeNPC: NPC = {
      ...npc,
      id: npc.id || GameEngine.generateId(),
      reputation: safeReputation,
      reputationScore: Math.max(-100, Math.min(100, npc.reputationScore ?? 0)),
      interactionHistory: npc.interactionHistory || [],
      alive: npc.alive ?? true,
    };

    return {
      state: {
        ...state,
        relations: [...state.relations, safeNPC],
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update an NPC partially. Validates the NPC exists.
   * Clamps reputation score to -100..100 and updates reputation label.
   */
  static updateNPC(state: GameState, npcId: string, updates: Partial<NPC>): EngineResult {
    const npc = state.relations.find((n) => n.id === npcId);
    if (!npc) {
      return { state, success: false, message: 'NPC not found' };
    }

    // If reputationScore is being updated, clamp and recalculate reputation label
    let finalUpdates = { ...updates };
    if (updates.reputationScore !== undefined) {
      const newScore = Math.max(-100, Math.min(100, updates.reputationScore));
      finalUpdates.reputationScore = newScore;

      // Auto-update reputation label based on score
      let reputation: NPC['reputation'] = 'neutral';
      if (newScore >= 75) reputation = 'allied';
      else if (newScore >= 25) reputation = 'friendly';
      else if (newScore >= -25) reputation = 'neutral';
      else if (newScore >= -75) reputation = 'unfriendly';
      else reputation = 'hostile';
      finalUpdates.reputation = reputation;
    }

    return {
      state: {
        ...state,
        relations: state.relations.map((n) =>
          n.id === npcId ? { ...n, ...finalUpdates } : n
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // BESTIARY (Authoritative)
  // ==========================================

  /**
   * Discover a monster (or update if already known by name).
   */
  static discoverMonster(state: GameState, monster: Monster): EngineResult {
    const safeMonster: Monster = {
      ...monster,
      id: monster.id || GameEngine.generateId(),
      discovered: true,
      defeatCount: monster.defeatCount ?? 0,
      weaknesses: monster.weaknesses || [],
      resistances: monster.resistances || [],
      immunities: monster.immunities || [],
      loot: monster.loot || [],
    };

    const existing = state.bestiary.find((m) => m.name === monster.name);
    if (existing) {
      // Update existing entry (merge data)
      return {
        state: {
          ...state,
          bestiary: state.bestiary.map((m) =>
            m.name === monster.name ? { ...m, ...safeMonster, id: m.id, defeatCount: m.defeatCount } : m
          ),
          updatedAt: Date.now(),
        },
        success: true,
      };
    }

    return {
      state: {
        ...state,
        bestiary: [...state.bestiary, safeMonster],
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update a monster partially.
   */
  static updateMonster(state: GameState, monsterId: string, updates: Partial<Monster>): EngineResult {
    const monster = state.bestiary.find((m) => m.id === monsterId);
    if (!monster) {
      return { state, success: false, message: 'Monster not found' };
    }

    return {
      state: {
        ...state,
        bestiary: state.bestiary.map((m) =>
          m.id === monsterId ? { ...m, ...updates } : m
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Increment the defeat count for a monster.
   */
  static incrementDefeat(state: GameState, monsterId: string): EngineResult {
    const monster = state.bestiary.find((m) => m.id === monsterId);
    if (!monster) {
      return { state, success: false, message: 'Monster not found' };
    }

    return {
      state: {
        ...state,
        bestiary: state.bestiary.map((m) =>
          m.id === monsterId ? { ...m, defeatCount: m.defeatCount + 1 } : m
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // BOOK OF DEAD (Authoritative)
  // ==========================================

  /**
   * Add a death entry. Validates and assigns an ID if missing.
   */
  static addDeathEntry(state: GameState, entry: DeathEntry): EngineResult {
    const safeEntry: DeathEntry = {
      ...entry,
      id: entry.id || GameEngine.generateId(),
      confirmed: entry.confirmed ?? true,
    };

    return {
      state: {
        ...state,
        bookOfDead: [...state.bookOfDead, safeEntry],
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  /**
   * Update a death entry partially.
   */
  static updateDeathEntry(state: GameState, entryId: string, updates: Partial<DeathEntry>): EngineResult {
    const entry = state.bookOfDead.find((e) => e.id === entryId);
    if (!entry) {
      return { state, success: false, message: 'Death entry not found' };
    }

    return {
      state: {
        ...state,
        bookOfDead: state.bookOfDead.map((e) =>
          e.id === entryId ? { ...e, ...updates } : e
        ),
        updatedAt: Date.now(),
      },
      success: true,
    };
  }

  // ==========================================
  // CHAT (Authoritative)
  // ==========================================

  /**
   * Add a chat message. Generates ID and timestamp.
   */
  static addChatMessage(state: GameState, message: Omit<ChatMessage, 'id' | 'timestamp'>): EngineResult {
    const fullMessage: ChatMessage = {
      ...message,
      id: GameEngine.generateId(),
      timestamp: Date.now(),
    };

    return {
      state: {
        ...state,
        chatHistory: [...state.chatHistory, fullMessage],
        updatedAt: Date.now(),
      },
      success: true,
    };
  }
}

// Re-export all sub-modules for convenience
export { type CheckResult, resolveSkillCheck, resolveSavingThrow, rollDice, rollD20, calculateSkillTotal, calculateSaveTotal } from './checks';
export { applyDamage, applyHealing, applyTemporaryHp, clampHp, applyStatusEffect, removeCondition, resolveDeathSave, resolveCombat, createDeathEntry, type CombatResult, type DeathSaveResult } from './combat';
export { levelUp, grantXP, longRest, shortRest, canLevelUp, calculateProficiencyBonus, calculateXPToNext, calculateHPIncrease, type LevelUpResult, type GrantXPResult } from './progression';
export { addItem, removeItem, sanitizeItem, calculateAC, calculateWeight, createEmptyInventory, isConsumable, type AddItemResult } from './inventory';
export { sanitizeCurrency, parseCoinString, grantLoot, formatCurrency, formatItemValue, type LootResult } from './economy';
export { advanceTime, advanceTurn, advanceDays, updateLocation, updateNarrative, type TimeOfDay } from './world-time';
