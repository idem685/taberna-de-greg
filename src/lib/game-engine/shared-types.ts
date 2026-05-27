// ==========================================
// TABERNA DEL VIEJO GREG - Shared Type Re-exports for GameEngine
// ==========================================
// Re-exports all game types from the canonical source so that
// GameEngine modules don't need to import from multiple locations.

export type {
  GameState,
  Character,
  AbilityScores,
  AbilityScore,
  Inventory,
  Item,
  ItemCategory,
  ItemRarity,
  Equipment,
  Currency,
  Quest,
  QuestStatus,
  NPC,
  Reputation,
  Monster,
  DeathEntry,
  ChatMessage,
  StateUpdates,
  AIResponse,
  DiceRoll,
  Skill,
  SkillKey,
  SavingThrows,
  CharacterCreationResult,
} from '@/lib/game-types';

export {
  getModifier,
  formatModifier,
  HIT_DIE_AVERAGE,
  SKILL_MAP,
  snakeToCamel,
  transformKeysDeep,
  transformAIResponse,
} from '@/lib/game-types';
