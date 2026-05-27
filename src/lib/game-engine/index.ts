// ==========================================
// TABERNA DEL VIEJO GREG - GameEngine Module Index
// ==========================================
// Central export point for the entire game engine.
// Import from '@/lib/game-engine' to access everything.

export { GameEngine, type EngineResult, type EngineSideEffect } from './engine';

// Intention resolver — the new pipeline where LLM proposes, engine resolves
export { resolveIntentions, type IntentionsResolutionResult } from './intention-resolver';

// Re-export all sub-modules
export { type CheckResult, resolveSkillCheck, resolveSavingThrow, rollDice, rollD20, calculateSkillTotal, calculateSaveTotal, getAllSkillTotals, getAllSaveTotals } from './checks';
export { applyDamage, applyHealing, applyTemporaryHp, clampHp, addCondition, removeCondition, applyStatusEffect, resolveDeathSave, resolveCombat, createDeathEntry, type CombatResult, type DeathSaveResult } from './combat';
export { levelUp, grantXP, longRest, shortRest, canLevelUp, calculateProficiencyBonus, calculateXPToNext, calculateHPIncrease, type LevelUpResult, type GrantXPResult } from './progression';
export { addItem, removeItem, sanitizeItem, calculateAC, calculateWeight, createEmptyInventory, isConsumable, equipItem, unequipItem, consumeItem, canAddItem, type AddItemResult } from './inventory';
export { sanitizeCurrency, parseCoinString, grantLoot, formatCurrency, formatItemValue, updateCurrency, setCurrency, canAfford, deductCurrency, normalizeCurrency, type LootResult } from './economy';
export { advanceTime, advanceTurn, advanceDays, updateLocation, updateNarrative, getNarrativeSummary, type TimeOfDay } from './world-time';
