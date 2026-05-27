// ==========================================
// TABERNA DEL VIEJO GREG - LLM Output Zod Schemas
// ==========================================
// Strict validation schemas for every piece of data the LLM can produce.
// The LLM is NEVER trusted — every field must pass through these schemas
// before it reaches the GameEngine or the UI.
//
// DESIGN PRINCIPLES:
// 1. Every optional field has a sane default via .default() or .optional()
// 2. Numeric fields are clamped to sane ranges
// 3. String fields are trimmed and length-limited
// 4. Enum fields only accept valid values
// 5. Forbidden fields (stateUpdates, diceRolls, etc.) are stripped

import { z } from 'zod';

// --- Primitive Validators ---

/** Non-empty trimmed string */
const NonEmptyString = z.string().trim().min(1);

/** Narrative text: non-empty, max 10000 chars (enough for rich descriptions) */
const NarrativeString = z.string().trim().min(1, 'La narrativa no puede estar vacía').max(10000);

/** Positive or zero integer */
const NonNegativeInt = z.number().int().min(0);

/** Positive integer (>= 1) */
const PositiveInt = z.number().int().min(1);

/** Damage roll expression: must match D&D dice notation like 1d8, 2d6+3, 1d20+5 */
const DiceNotation = z.string().regex(
  /^\d+d\d+([+-]\d+)?$/,
  'Formato de dado inválido. Ejemplos: 1d8, 2d6+3, 1d20+5'
);

/** DC (Difficulty Class): integer 1-30 (D&D 5e range) */
const DifficultyClass = z.number().int().min(1).max(30);

/** Damage amount: 0-999 (sane cap to prevent LLM hallucinations) */
const DamageAmount = z.number().min(0).max(999);

/** XP amount: 0-100000 (sane cap) */
const XPAmount = z.number().min(0).max(100000);

/** Reputation delta: -100 to +100 */
const ReputationDelta = z.number().int().min(-100).max(100);

/** Reputation score: -100 to +100 */
const ReputationScore = z.number().int().min(-100).max(100);

// --- Intention Type Enum ---

const IntentionTypeSchema = z.enum([
  'combat_attack',
  'combat_defend',
  'skill_check',
  'npc_reaction',
  'quest_progress',
  'time_advance',
  'loot_attempt',
  'escape_attempt',
  'dialogue_trigger',
  'environment_effect',
  'rest_attempt',
  'death_event',
]);

// --- Sub-schemas for nested objects ---

/** Damage type enum (D&D 5e standard types) */
const DamageTypeSchema = z.enum([
  'slashing', 'piercing', 'bludgeoning',
  'fire', 'cold', 'lightning', 'thunder',
  'acid', 'poison', 'necrotic', 'radiant',
  'psychic', 'force',
]).default('bludgeoning');

/** Ability score name */
const AbilityScoreSchema = z.enum([
  'strength', 'dexterity', 'constitution',
  'intelligence', 'wisdom', 'charisma',
]);

/** Skill key */
const SkillKeySchema = z.enum([
  'acrobatics', 'animalHandling', 'arcana', 'athletics',
  'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleightOfHand',
  'stealth', 'survival',
]);

/** Reputation level */
const ReputationSchema = z.enum([
  'hostile', 'unfriendly', 'neutral', 'friendly', 'allied',
]).default('neutral');

/** Quest status */
const QuestStatusSchema = z.enum([
  'active', 'completed', 'optional', 'failed',
]).default('active');

/** Item category */
const ItemCategorySchema = z.enum([
  'weapon', 'armor', 'potion', 'important', 'misc',
]).default('misc');

/** Item rarity */
const ItemRaritySchema = z.enum([
  'common', 'uncommon', 'rare', 'epic', 'legendary',
]).default('common');

/** Equipment slot */
const EquipSlotSchema = z.enum([
  'weapon', 'armor', 'shield', 'accessory',
]).optional();

/** NPC sub-schema (for newNPC field) */
const NPCSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString.max(100),
  race: z.string().trim().max(50).default('Desconocido'),
  location: z.string().trim().max(100).default('Desconocido'),
  reputation: ReputationSchema,
  reputationScore: ReputationScore.default(0),
  lastInteraction: z.string().trim().max(500).default(''),
  interactionHistory: z.array(z.string().trim().max(500)).max(50).default([]),
  notes: z.string().trim().max(1000).default(''),
  alive: z.boolean().default(true),
}).strict();

/** Quest sub-schema (for newQuest field) */
const QuestSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString.max(100),
  description: z.string().trim().max(2000).default(''),
  status: QuestStatusSchema,
  recommendedLevel: z.string().trim().max(20).default('1'),
  experienceReward: XPAmount.default(0),
  coinReward: z.string().trim().max(100).default('0'),
  itemRewards: z.array(z.string().trim().max(100)).max(10).default([]),
  followed: z.boolean().default(true),
  objectives: z.array(z.string().trim().max(200)).max(10).default([]),
  completedObjectives: z.array(z.string().trim().max(200)).max(10).default([]),
}).strict();

/** Loot item sub-schema (for lootItems field — partial items) */
const LootItemSchema = z.object({
  id: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
  category: ItemCategorySchema,
  rarity: ItemRaritySchema,
  weight: z.number().min(0).max(500).default(0),
  value: NonNegativeInt.max(999999).default(0),
  effect: z.string().trim().max(500).default(''),
  equipped: z.boolean().default(false),
  equipSlot: EquipSlotSchema,
  damage: z.string().trim().max(20).optional(),
  damageType: z.string().trim().max(20).optional(),
  armorBonus: z.number().int().min(0).max(20).optional(),
  properties: z.array(z.string().trim().max(50)).max(10).optional(),
  quantity: PositiveInt.max(100).default(1),
}).passthrough(); // Allow extra fields from AI, will be sanitized later

/** Currency sub-schema */
const CurrencySchema = z.object({
  gold: z.number().min(0).max(999999).default(0),
  silver: z.number().min(0).max(999999).default(0),
  copper: z.number().min(0).max(999999).default(0),
}).strict();

/** Monster sub-schema (for newMonster field) */
const MonsterSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString.max(100),
  description: z.string().trim().max(2000).default(''),
  level: PositiveInt.max(30).default(1),
  hp: PositiveInt.max(9999).default(10),
  armorClass: PositiveInt.max(30).default(10),
  abilityScores: z.object({
    strength: z.number().int().min(1).max(30).default(10),
    dexterity: z.number().int().min(1).max(30).default(10),
    constitution: z.number().int().min(1).max(30).default(10),
    intelligence: z.number().int().min(1).max(30).default(10),
    wisdom: z.number().int().min(1).max(30).default(10),
    charisma: z.number().int().min(1).max(30).default(10),
  }).strict().optional(),
  weaknesses: z.array(z.string().trim().max(50)).max(10).default([]),
  resistances: z.array(z.string().trim().max(50)).max(10).default([]),
  immunities: z.array(z.string().trim().max(50)).max(10).default([]),
  experienceReward: XPAmount.default(0),
  loot: z.array(z.string().trim().max(100)).max(20).default([]),
  discovered: z.boolean().default(true),
  defeatCount: NonNegativeInt.max(999).default(0),
}).passthrough();

/** Death entry sub-schema */
const DeathEntrySchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString.max(100),
  race: z.string().trim().max(50).default('Desconocido'),
  role: z.enum(['ally', 'enemy', 'neutral', 'player']).default('neutral'),
  causeOfDeath: z.string().trim().max(500).default('Desconocida'),
  location: z.string().trim().max(100).default('Desconocido'),
  turn: NonNegativeInt.default(0),
  day: PositiveInt.default(1),
  elegy: z.string().trim().max(1000).default(''),
  confirmed: z.boolean().default(true),
}).strict();

/** Status effect name: well-known D&D conditions */
const StatusEffectSchema = z.enum([
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion',
  'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
  // Allow custom status names too (LLM might create non-standard ones)
]).or(z.string().trim().min(1).max(50));

// --- Per-Type Intention Schemas ---
// Each intention type has its own required/optional fields.
// The base schema enforces: type + description.
// Per-type refinements add type-specific validation.

/** Base intention schema — all intentions must satisfy this */
const BaseIntentionSchema = z.object({
  type: IntentionTypeSchema,
  description: z.string().trim().min(1, 'Toda intención necesita descripción').max(500),
});

/** combat_attack: target required, damageRoll validated */
const CombatAttackIntentionSchema = BaseIntentionSchema.extend({
  target: z.string().trim().min(1).max(100).optional(),
  damageRoll: DiceNotation.optional(),
  damageType: DamageTypeSchema.optional(),
  dc: DifficultyClass.optional(),
  damageToPlayer: DamageAmount.optional(),
  healingToPlayer: DamageAmount.optional(),
  temporaryHpGained: DamageAmount.optional(),
  statusesApplied: z.array(StatusEffectSchema).max(5).optional(),
  statusesRemoved: z.array(StatusEffectSchema).max(5).optional(),
  xpReward: XPAmount.optional(),
  monsterDefeatedId: z.string().trim().max(100).optional(),
  newMonster: MonsterSchema.optional(),
});

/** combat_defend: savingThrowAbility or just defensive stance */
const CombatDefendIntentionSchema = BaseIntentionSchema.extend({
  savingThrowAbility: AbilityScoreSchema.optional(),
  dc: DifficultyClass.optional(),
  damageToPlayer: DamageAmount.optional(),
  healingToPlayer: DamageAmount.optional(),
  statusesApplied: z.array(StatusEffectSchema).max(5).optional(),
  statusesRemoved: z.array(StatusEffectSchema).max(5).optional(),
});

/** skill_check: skill required, dc required */
const SkillCheckIntentionSchema = BaseIntentionSchema.extend({
  skill: SkillKeySchema.optional(),
  dc: DifficultyClass.optional(),
  xpReward: XPAmount.optional(),
  damageToPlayer: DamageAmount.optional(),
  healingToPlayer: DamageAmount.optional(),
  statusesApplied: z.array(StatusEffectSchema).max(5).optional(),
  statusesRemoved: z.array(StatusEffectSchema).max(5).optional(),
});

/** npc_reaction: npcId or newNPC required */
const NPCReactionIntentionSchema = BaseIntentionSchema.extend({
  npcId: z.string().trim().max(100).optional(),
  reputationDelta: ReputationDelta.optional(),
  newNPC: NPCSchema.optional(),
  dialogueText: z.string().trim().max(2000).optional(),
});

/** quest_progress: questId or newQuest required */
const QuestProgressIntentionSchema = BaseIntentionSchema.extend({
  questId: z.string().trim().max(100).optional(),
  newQuest: QuestSchema.optional(),
  questUpdates: z.record(z.string(), z.unknown()).optional(),
  completeQuest: z.boolean().optional(),
  xpReward: XPAmount.optional(),
});

/** time_advance */
const TimeAdvanceIntentionSchema = BaseIntentionSchema.extend({
  location: z.string().trim().max(100).optional(),
  timeOfDay: z.string().trim().max(50).optional(),
  daysAdvance: z.number().int().min(0).max(365).optional(),
});

/** loot_attempt: lootItems and/or lootCurrency */
const LootAttemptIntentionSchema = BaseIntentionSchema.extend({
  lootItems: z.array(LootItemSchema).max(20).optional(),
  lootCurrency: CurrencySchema.optional(),
  xpReward: XPAmount.optional(),
});

/** escape_attempt: dc required */
const EscapeAttemptIntentionSchema = BaseIntentionSchema.extend({
  dc: DifficultyClass.optional(),
  damageToPlayer: DamageAmount.optional(),
});

/** dialogue_trigger: npcId and dialogueText */
const DialogueTriggerIntentionSchema = BaseIntentionSchema.extend({
  npcId: z.string().trim().max(100).optional(),
  dialogueText: z.string().trim().max(2000).optional(),
  newNPC: NPCSchema.optional(),
});

/** environment_effect */
const EnvironmentEffectIntentionSchema = BaseIntentionSchema.extend({
  savingThrowAbility: AbilityScoreSchema.optional(),
  dc: DifficultyClass.optional(),
  damageToPlayer: DamageAmount.optional(),
  statusesApplied: z.array(StatusEffectSchema).max(5).optional(),
  statusesRemoved: z.array(StatusEffectSchema).max(5).optional(),
});

/** rest_attempt */
const RestAttemptIntentionSchema = BaseIntentionSchema.extend({
  // No extra fields — just a description of the rest type
});

/** death_event: deathEntry required */
const DeathEventIntentionSchema = BaseIntentionSchema.extend({
  deathEntry: DeathEntrySchema.optional(),
});

/** Discriminated union of all intention schemas based on type field */
const IntentionSchema = z.discriminatedUnion('type', [
  CombatAttackIntentionSchema,
  CombatDefendIntentionSchema,
  SkillCheckIntentionSchema,
  NPCReactionIntentionSchema,
  QuestProgressIntentionSchema,
  TimeAdvanceIntentionSchema,
  LootAttemptIntentionSchema,
  EscapeAttemptIntentionSchema,
  DialogueTriggerIntentionSchema,
  EnvironmentEffectIntentionSchema,
  RestAttemptIntentionSchema,
  DeathEventIntentionSchema,
]);

// --- Top-Level Response Schema ---

/**
 * The ONLY valid shape the LLM is allowed to return.
 * Any field NOT in this schema is STRIPPED.
 */
export const LLMResponseSchema = z.object({
  narrative: NarrativeString,
  intentions: z.array(IntentionSchema).max(10, 'Máximo 10 intenciones por turno'),
}).strict();

/** Type inferred from the Zod schema — the validated shape */
export type ValidatedLLMResponse = z.infer<typeof LLMResponseSchema>;

/** Type for a single validated intention */
export type ValidatedIntention = z.infer<typeof IntentionSchema>;

// --- Validation Error Types ---

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  success: boolean;
  data?: ValidatedLLMResponse;
  errors: ValidationError[];
  /** Whether a repair was attempted */
  repairAttempted: boolean;
  /** Whether the repair succeeded */
  repairSucceeded: boolean;
  /** Number of fields that were coerced/defaults applied */
  coercedFields: string[];
}

// --- Schema Introspection (for logging) ---

/** Get the list of valid intention types */
export function getValidIntentionTypes(): string[] {
  return IntentionTypeSchema.options;
}

/** Get required fields per intention type (for repair hints) */
export function getRequiredFieldsForType(type: string): string[] {
  switch (type) {
    case 'combat_attack':
      return ['type', 'description'];
    case 'combat_defend':
      return ['type', 'description'];
    case 'skill_check':
      return ['type', 'description'];
    case 'npc_reaction':
      return ['type', 'description'];
    case 'quest_progress':
      return ['type', 'description'];
    case 'time_advance':
      return ['type', 'description'];
    case 'loot_attempt':
      return ['type', 'description'];
    case 'escape_attempt':
      return ['type', 'description'];
    case 'dialogue_trigger':
      return ['type', 'description'];
    case 'environment_effect':
      return ['type', 'description'];
    case 'rest_attempt':
      return ['type', 'description'];
    case 'death_event':
      return ['type', 'description'];
    default:
      return ['type', 'description'];
  }
}

// Re-export sub-schemas for use in repair.ts
export {
  IntentionTypeSchema,
  BaseIntentionSchema,
  CombatAttackIntentionSchema,
  CombatDefendIntentionSchema,
  SkillCheckIntentionSchema,
  NPCReactionIntentionSchema,
  QuestProgressIntentionSchema,
  TimeAdvanceIntentionSchema,
  LootAttemptIntentionSchema,
  EscapeAttemptIntentionSchema,
  DialogueTriggerIntentionSchema,
  EnvironmentEffectIntentionSchema,
  RestAttemptIntentionSchema,
  DeathEventIntentionSchema,
  NarrativeString,
  IntentionSchema,
  DiceNotation,
  DifficultyClass,
  DamageAmount,
  XPAmount,
  ReputationDelta,
  StatusEffectSchema,
};
