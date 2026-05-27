// ==========================================
// TABERNA DEL VIEJO GREG - Game Type Definitions
// ==========================================

// --- D&D 5e Core Types ---

export type AbilityScore = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Average hit die roll by die type (used for HP calculations) */
export const HIT_DIE_AVERAGE: Record<string, number> = {
  '1d4': 3,
  '1d6': 4,
  '1d8': 5,
  '1d10': 6,
  '1d12': 7,
  '2d6': 7,
};

// --- Skill System ---

export type SkillKey =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics'
  | 'deception' | 'history' | 'insight' | 'intimidation'
  | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleightOfHand'
  | 'stealth' | 'survival';

export interface Skill {
  key: SkillKey;
  name: string;
  ability: AbilityScore;
  proficient: boolean;
  expertise: boolean;
}

export const SKILL_MAP: Record<SkillKey, { name: string; ability: AbilityScore }> = {
  acrobatics: { name: 'Acrobacias', ability: 'dexterity' },
  animalHandling: { name: 'Trato con animales', ability: 'wisdom' },
  arcana: { name: 'Arcano', ability: 'intelligence' },
  athletics: { name: 'Atletismo', ability: 'strength' },
  deception: { name: 'Engaño', ability: 'charisma' },
  history: { name: 'Historia', ability: 'intelligence' },
  insight: { name: 'Perspicacia', ability: 'wisdom' },
  intimidation: { name: 'Intimidación', ability: 'charisma' },
  investigation: { name: 'Investigación', ability: 'intelligence' },
  medicine: { name: 'Medicina', ability: 'wisdom' },
  nature: { name: 'Naturaleza', ability: 'intelligence' },
  perception: { name: 'Percepción', ability: 'wisdom' },
  performance: { name: 'Interpretación', ability: 'charisma' },
  persuasion: { name: 'Persuasión', ability: 'charisma' },
  religion: { name: 'Religión', ability: 'intelligence' },
  sleightOfHand: { name: 'Juego de manos', ability: 'dexterity' },
  stealth: { name: 'Sigilo', ability: 'dexterity' },
  survival: { name: 'Supervivencia', ability: 'wisdom' },
};

// --- Saving Throws ---

export interface SavingThrows {
  strength: boolean;
  dexterity: boolean;
  constitution: boolean;
  intelligence: boolean;
  wisdom: boolean;
  charisma: boolean;
}

// --- Character ---

export interface Character {
  name: string;
  race: string;
  class: string;
  subclass: string;
  level: number;
  currentHp: number;
  maxHp: number;
  temporaryHp: number;
  experience: number;
  experienceToNext: number;
  armorClass: number;
  initiative: number;
  speed: number;
  proficiencyBonus: number;
  abilityScores: AbilityScores;
  savingThrows: SavingThrows;
  skills: Skill[];
  hitDice: string;
  hitDiceRemaining: number;
  deathSaves: { successes: number; failures: number };
  conditions: string[];
  backstory: string;
}

// --- Inventory ---

export type ItemCategory = 'weapon' | 'armor' | 'potion' | 'important' | 'misc';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Item {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  weight: number;
  value: number; // in copper pieces
  effect: string;
  equipped: boolean;
  equipSlot?: 'weapon' | 'armor' | 'shield' | 'accessory';
  damage?: string;
  damageType?: string;
  armorBonus?: number;
  properties?: string[];
  quantity: number;
}

export interface Currency {
  gold: number;
  silver: number;
  copper: number;
}

export interface Equipment {
  weapon: Item | null;
  armor: Item | null;
  shield: Item | null;
  accessory: Item | null;
}

export interface Inventory {
  items: Item[];
  equipment: Equipment;
  currency: Currency;
  maxWeight: number; // based on Strength * 15
}

// --- Quests ---

export type QuestStatus = 'active' | 'completed' | 'optional' | 'failed';

export interface Quest {
  id: string;
  name: string;
  description: string;
  status: QuestStatus;
  recommendedLevel: string;
  experienceReward: number;
  coinReward: string;
  itemRewards: string[];
  followed: boolean;
  objectives: string[];
  completedObjectives: string[];
}

// --- Relations ---

export type Reputation = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';

export interface NPC {
  id: string;
  name: string;
  race: string;
  location: string;
  reputation: Reputation;
  reputationScore: number; // -100 to 100
  lastInteraction: string;
  interactionHistory: string[];
  notes: string;
  alive: boolean;
}

// --- Bestiary ---

export interface Monster {
  id: string;
  name: string;
  description: string;
  level: number;
  hp: number;
  armorClass: number;
  abilityScores: AbilityScores;
  weaknesses: string[];
  resistances: string[];
  immunities: string[];
  experienceReward: number;
  loot: string[];
  discovered: boolean;
  defeatCount: number;
}

// --- Book of the Dead ---

export interface DeathEntry {
  id: string;
  name: string;
  race: string;
  role: 'ally' | 'enemy' | 'neutral' | 'player';
  causeOfDeath: string;
  location: string;
  turn: number;
  day: number;
  elegy: string;
  confirmed: boolean; // true = confirmed dead, false = uncertain
}

// --- Chat ---

export interface ChatMessage {
  id: string;
  role: 'player' | 'dm' | 'system';
  content: string;
  timestamp: number;
  stateUpdates?: StateUpdates;
  diceRolls?: DiceRoll[];
}

export interface DiceRoll {
  type: string; // e.g., "1d20+5"
  result: number;
  breakdown: string; // e.g., "Natural 15 + 5 = 20"
  purpose: string;
}

// --- AI Intention Types ---
// The LLM NO LONGER has authority to modify game state directly.
// It can only propose INTENTIONS, which the GameEngine resolves
// using D&D 5e rules. The engine decides the actual outcome.

export type IntentionType =
  | 'combat_attack'    // Player attacks a target
  | 'combat_defend'    // Player takes defensive action
  | 'skill_check'      // Player attempts a skill check
  | 'npc_reaction'     // NPC reacts to player
  | 'quest_progress'   // Quest state changes
  | 'time_advance'     // Time passes in the world
  | 'loot_attempt'     // Player tries to find/acquire loot
  | 'escape_attempt'   // Player tries to flee
  | 'dialogue_trigger' // Dialogue event occurs
  | 'environment_effect' // Environmental effect (trap, weather, etc.)
  | 'rest_attempt'     // Player tries to rest
  | 'death_event';     // A character or NPC dies

/** An intention proposed by the AI DM. The engine resolves the actual outcome. */
export interface Intention {
  type: IntentionType;
  /** Human-readable description of what happens */
  description: string;

  // --- Combat parameters ---
  /** Target of the action (monster name, NPC name, etc.) */
  target?: string;
  /** Suggested attack damage dice (e.g. "1d8+3"). Engine validates and rolls. */
  damageRoll?: string;
  /** Damage type (slashing, fire, etc.) */
  damageType?: string;
  /** Damage the player receives from enemy counterattack */
  damageToPlayer?: number;
  /** Healing the player receives */
  healingToPlayer?: number;
  /** Temporary HP gained */
  temporaryHpGained?: number;
  /** Status effects applied to the player */
  statusesApplied?: string[];
  /** Status effects removed from the player */
  statusesRemoved?: string[];

  // --- Skill check parameters ---
  /** Skill being checked */
  skill?: SkillKey;
  /** Suggested DC. Engine may adjust based on context. */
  dc?: number;
  /** Suggested ability for saving throw */
  savingThrowAbility?: AbilityScore;

  // --- NPC parameters ---
  /** NPC ID or name that reacts */
  npcId?: string;
  /** Suggested reputation change. Engine clamps to -100..100. */
  reputationDelta?: number;
  /** New NPC data to add */
  newNPC?: NPC;

  // --- Quest parameters ---
  /** Quest ID affected */
  questId?: string;
  /** New quest data */
  newQuest?: Quest;
  /** Quest updates */
  questUpdates?: Partial<Quest>;
  /** Whether to complete the quest */
  completeQuest?: boolean;
  /** XP reward for quest/event */
  xpReward?: number;

  // --- Loot parameters ---
  /** Suggested loot items. Engine validates weight and adds to inventory. */
  lootItems?: Partial<Item>[];
  /** Currency found */
  lootCurrency?: Partial<Currency>;

  // --- Time parameters ---
  /** New location */
  location?: string;
  /** Time of day change */
  timeOfDay?: string;
  /** Days to advance */
  daysAdvance?: number;

  // --- Bestiary ---
  /** Monster discovered */
  newMonster?: Monster;
  /** Monster ID defeated */
  monsterDefeatedId?: string;

  // --- Book of Dead ---
  /** Death entry to record */
  deathEntry?: DeathEntry;

  // --- Dialogue ---
  /** NPC dialogue text */
  dialogueText?: string;
}

/** Result of resolving a single intention through the GameEngine */
export interface IntentionResolution {
  intention: Intention;
  success: boolean;
  /** Human-readable result description (e.g. "Attack hit for 12 slashing damage") */
  resultText: string;
  /** Dice rolls that occurred during resolution */
  diceRolls: DiceRoll[];
  /** Side effects to display to the player */
  sideEffects: string[];
}

// --- Legacy StateUpdates (kept for backward compatibility with existing saves) ---

export interface StateUpdates {
  character?: Partial<Character>;
  inventory?: {
    addItems?: Item[];
    removeItems?: string[]; // item ids
    equipItem?: string;
    unequipItem?: string;
    currency?: Partial<Currency>;
    consumeItem?: string;
  };
  quests?: {
    addQuest?: Quest;
    updateQuest?: { id: string; updates: Partial<Quest> };
    completeQuest?: string;
  };
  relations?: {
    addNPC?: NPC;
    updateNPC?: { id: string; updates: Partial<NPC> };
  };
  bestiary?: {
    discoverMonster?: Monster;
    updateMonster?: { id: string; updates: Partial<Monster> };
    incrementDefeat?: string;
  };
  bookOfDead?: {
    addEntry?: DeathEntry;
    updateEntry?: { id: string; updates: Partial<DeathEntry> };
  };
  narrative?: {
    location?: string;
    timeOfDay?: string;
    day?: number;
    turn?: number;
  };
}

/** AI response format — intentions only, NO direct state mutations */
export interface AIResponse {
  narrative: string;
  intentions: Intention[];
  /** @deprecated Kept for migration only. Engine ignores this in the new pipeline. */
  stateUpdates?: StateUpdates;
  /** @deprecated Kept for migration only. Engine generates real dice rolls. */
  diceRolls?: DiceRoll[];
}

// --- AI Response Transformer ---
// The AI returns snake_case keys (state_updates, add_items, dice_rolls, etc.)
// but our TypeScript types use camelCase. This transformer converts the raw
// AI JSON response into the camelCase format our store expects.

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function transformKeysDeep(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformKeysDeep);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = transformKeysDeep(value);
    }
    return result;
  }
  return obj;
}

/**
 * Transforms a raw AI response (snake_case keys) into the typed AIResponse (camelCase).
 * This handles the mismatch between the AI's JSON format and our TypeScript types.
 * e.g. state_updates → stateUpdates, add_items → addItems, dice_rolls → diceRolls
 *
 * Supports both the NEW format (narrative + intentions) and the legacy format
 * (narrative + stateUpdates). The new pipeline uses intentions only.
 */
export function transformAIResponse(raw: Record<string, unknown>): AIResponse {
  const transformed = transformKeysDeep(raw) as Record<string, unknown>;
  return {
    narrative: (transformed.narrative as string) || '',
    intentions: (transformed.intentions as Intention[]) || [],
    // Legacy fields (kept for migration safety)
    stateUpdates: (transformed.stateUpdates as StateUpdates) || (transformed.state_updates as StateUpdates) || undefined,
    diceRolls: (transformed.diceRolls as DiceRoll[]) || (transformed.dice_rolls as DiceRoll[]) || undefined,
  };
}

// --- Consequence State ---
// Imported from the consequences system to avoid circular dependencies.
// The actual type definition lives in /lib/consequences/types.ts
// We re-export a minimal reference here so GameState can include it.

import type { ConsequenceState } from '@/lib/consequences/types';

// --- Complete Game State ---

export interface GameState {
  id: string;
  name: string;
  character: Character | null;
  inventory: Inventory;
  quests: Quest[];
  relations: NPC[];
  bestiary: Monster[];
  bookOfDead: DeathEntry[];
  chatHistory: ChatMessage[];
  narrative: {
    location: string;
    timeOfDay: string;
    day: number;
    turn: number;
  };
  /** Persistent consequence state — wounds, exhaustion, hostility, etc. */
  consequenceState: ConsequenceState;
  createdAt: number;
  updatedAt: number;
  version?: number; // For forward compatibility in import/export
}

// --- Character Creation ---

export interface CharacterCreationResult {
  character: Character;
  startingInventory: Item[];
  startingCurrency: Currency;
  initialQuest: Quest;
  initialNPCs: NPC[];
  openingNarrative: string;
}
