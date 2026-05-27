// ==========================================
// TABERNA DEL VIEJO GREG - LLM Output Repair
// ==========================================
// When Zod validation fails, this module attempts to REPAIR the LLM output
// by applying heuristics that fix common AI mistakes. This is the LAST
// line of defense before aborting a turn.
//
// REPAIR STRATEGY:
// 1. Strip forbidden fields (stateUpdates, diceRolls, etc.)
// 2. Coerce types (string numbers → numbers, "null" → undefined)
// 3. Fix common AI mistakes (invalid enum values, missing required fields)
// 4. Clamp out-of-range values
// 5. Re-validate after each repair step

import { z } from 'zod';
import {
  LLMResponseSchema,
  IntentionTypeSchema,
  IntentionSchema,
  NarrativeString,
  DiceNotation,
  DamageAmount,
  XPAmount,
  type ValidatedLLMResponse,
  type ValidationError,
} from './schema';

// --- Repair Logging ---

export interface RepairLog {
  step: string;
  description: string;
  before?: unknown;
  after?: unknown;
  success: boolean;
}

// --- Forbidden Field Stripping ---

/** Fields the LLM is NEVER allowed to produce */
const FORBIDDEN_TOP_LEVEL = [
  'stateUpdates', 'state_updates',
  'diceRolls', 'dice_rolls',
  'state', 'character', 'inventory',
  'hp', 'xp', 'gold', 'items',
  'abilities', 'stats',
] as const;

const FORBIDDEN_INTENTION_FIELDS = [
  'stateUpdates', 'state_updates',
  'diceRolls', 'dice_rolls',
  'newState', 'new_state',
  'hpChange', 'hp_change',
  'xpChange', 'xp_change',
  'goldChange', 'gold_change',
] as const;

/**
 * Strip all forbidden fields from the raw response.
 * The LLM might try to sneak in stateUpdates, diceRolls, etc.
 */
function stripForbiddenFields(
  raw: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const cleaned = { ...raw };

  for (const field of FORBIDDEN_TOP_LEVEL) {
    if (field in cleaned) {
      logs.push({
        step: 'strip_forbidden',
        description: `Eliminado campo prohibido: ${field}`,
        before: cleaned[field],
        success: true,
      });
      delete cleaned[field];
    }
  }

  // Strip forbidden fields from each intention
  if (Array.isArray(cleaned.intentions)) {
    cleaned.intentions = (cleaned.intentions as Record<string, unknown>[]).map((intent, i) => {
      const intentCleaned = { ...intent };
      for (const field of FORBIDDEN_INTENTION_FIELDS) {
        if (field in intentCleaned) {
          logs.push({
            step: 'strip_forbidden_intention',
            description: `Eliminado campo prohibido en intención[${i}]: ${field}`,
            before: intentCleaned[field],
            success: true,
          });
          delete intentCleaned[field];
        }
      }
      return intentCleaned;
    });
  }

  return cleaned;
}

// --- Type Coercion ---

/**
 * Coerce common AI type mistakes:
 * - String numbers → numbers ("5" → 5)
 * - "null" strings → undefined
 * - Boolean strings → booleans ("true" → true)
 * - snake_case keys → camelCase keys
 */
function coerceTypes(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const result = { ...data };

  // Fix narrative
  if (typeof result.narrative !== 'string') {
    result.narrative = String(result.narrative || '');
    logs.push({
      step: 'coerce_narrative',
      description: 'Narrativa convertida a string',
      success: true,
    });
  }

  // Ensure intentions is an array
  if (!Array.isArray(result.intentions)) {
    if (result.intentions && typeof result.intentions === 'object') {
      // AI might return a single intention object instead of array
      result.intentions = [result.intentions];
      logs.push({
        step: 'coerce_intentions',
        description: 'Intenciones: objeto singular envuelto en array',
        success: true,
      });
    } else {
      result.intentions = [];
      logs.push({
        step: 'coerce_intentions',
        description: 'Intenciones no era array, reemplazado con []',
        before: result.intentions,
        success: true,
      });
    }
  }

  // Fix each intention
  result.intentions = (result.intentions as Record<string, unknown>[]).map((intent, i) => {
    const fixed = { ...intent };

    // Coerce numeric fields
    const numericFields = ['dc', 'damageToPlayer', 'healingToPlayer', 'temporaryHpGained',
      'xpReward', 'reputationDelta', 'reputationScore', 'daysAdvance', 'quantity', 'weight', 'value'];
    for (const field of numericFields) {
      if (field in fixed && typeof fixed[field] !== 'number') {
        const parsed = Number(fixed[field]);
        if (!isNaN(parsed)) {
          fixed[field] = parsed;
          logs.push({
            step: 'coerce_number',
            description: `intención[${i}].${field}: "${fixed[field]}" → ${parsed}`,
            success: true,
          });
        } else {
          delete fixed[field];
          logs.push({
            step: 'coerce_number',
            description: `intención[${i}].${field}: valor no numérico eliminado`,
            before: fixed[field],
            success: true,
          });
        }
      }
    }

    // Coerce boolean fields
    const booleanFields = ['equipped', 'completeQuest', 'alive', 'discovered', 'confirmed', 'followed'];
    for (const field of booleanFields) {
      if (field in fixed && typeof fixed[field] !== 'boolean') {
        if (fixed[field] === 'true' || fixed[field] === 1) {
          fixed[field] = true;
        } else if (fixed[field] === 'false' || fixed[field] === 0) {
          fixed[field] = false;
        } else {
          // Can't determine, remove
          delete fixed[field];
        }
        logs.push({
          step: 'coerce_boolean',
          description: `intención[${i}].${field} corregido`,
          success: true,
        });
      }
    }

    // Fix "null" strings → undefined
    for (const [key, value] of Object.entries(fixed)) {
      if (value === 'null' || value === '') {
        delete fixed[key];
        logs.push({
          step: 'coerce_null_string',
          description: `intención[${i}].${key}: "null" string eliminado`,
          success: true,
        });
      }
    }

    return fixed;
  });

  return result;
}

// --- Enum Fixing ---

/** Map common AI mistakes for intention types to valid types */
const INTENTION_TYPE_ALIASES: Record<string, string> = {
  'attack': 'combat_attack',
  'combat': 'combat_attack',
  'defend': 'combat_defend',
  'defense': 'combat_defend',
  'skill': 'skill_check',
  'check': 'skill_check',
  'skill_check': 'skill_check',
  'npc': 'npc_reaction',
  'reaction': 'npc_reaction',
  'npc_dialogue': 'npc_reaction',
  'quest': 'quest_progress',
  'quest_update': 'quest_progress',
  'time': 'time_advance',
  'travel': 'time_advance',
  'loot': 'loot_attempt',
  'search': 'loot_attempt',
  'find': 'loot_attempt',
  'escape': 'escape_attempt',
  'flee': 'escape_attempt',
  'run': 'escape_attempt',
  'dialogue': 'dialogue_trigger',
  'talk': 'dialogue_trigger',
  'conversation': 'dialogue_trigger',
  'environment': 'environment_effect',
  'trap': 'environment_effect',
  'weather': 'environment_effect',
  'rest': 'rest_attempt',
  'sleep': 'rest_attempt',
  'camp': 'rest_attempt',
  'death': 'death_event',
  'kill': 'death_event',
};

/** Map common AI mistakes for damage types */
const DAMAGE_TYPE_ALIASES: Record<string, string> = {
  'slash': 'slashing',
  'cut': 'slashing',
  'pierce': 'piercing',
  'stab': 'piercing',
  'blunt': 'bludgeoning',
  'crush': 'bludgeoning',
  'frost': 'cold',
  'ice': 'cold',
  'electric': 'lightning',
  'shock': 'lightning',
  'sonic': 'thunder',
  'sound': 'thunder',
  'corrosive': 'acid',
  'toxin': 'poison',
  'dark': 'necrotic',
  'shadow': 'necrotic',
  'holy': 'radiant',
  'divine': 'radiant',
  'mental': 'psychic',
  'mind': 'psychic',
  'kinetic': 'force',
  'magic': 'force',
};

/** Map common AI mistakes for reputation values */
const REPUTATION_ALIASES: Record<string, string> = {
  'respectful': 'friendly',
  'respetful': 'friendly',
  'kind': 'friendly',
  'warm': 'friendly',
  'hateful': 'hostile',
  'enemy': 'hostile',
  'angry': 'hostile',
  'ally': 'allied',
  'unknown': 'neutral',
  'indifferent': 'neutral',
  'stranger': 'neutral',
};

/**
 * Fix enum values that the AI commonly gets wrong.
 */
function fixEnums(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const result = { ...data };

  // Fix intention types
  if (Array.isArray(result.intentions)) {
    result.intentions = (result.intentions as Record<string, unknown>[]).map((intent, i) => {
      const fixed = { ...intent };

      // Fix intention type
      if (typeof fixed.type === 'string') {
        const lowerType = fixed.type.toLowerCase().replace(/\s+/g, '_');
        if (INTENTION_TYPE_ALIASES[lowerType]) {
          logs.push({
            step: 'fix_intention_type',
            description: `intención[${i}].type: "${fixed.type}" → "${INTENTION_TYPE_ALIASES[lowerType]}"`,
            before: fixed.type,
            after: INTENTION_TYPE_ALIASES[lowerType],
            success: true,
          });
          fixed.type = INTENTION_TYPE_ALIASES[lowerType];
        } else {
          // Check if it's a valid type already
          const validTypes = IntentionTypeSchema.options;
          if (!validTypes.includes(lowerType as z.infer<typeof IntentionTypeSchema>)) {
            logs.push({
              step: 'fix_intention_type',
              description: `intención[${i}].type: "${fixed.type}" no es válido, eliminando intención`,
              success: false,
            });
            return null; // Mark for removal
          }
          fixed.type = lowerType;
        }
      }

      // Fix damage type
      if (typeof fixed.damageType === 'string') {
        const lowerDT = fixed.damageType.toLowerCase();
        if (DAMAGE_TYPE_ALIASES[lowerDT]) {
          fixed.damageType = DAMAGE_TYPE_ALIASES[lowerDT];
          logs.push({
            step: 'fix_damage_type',
            description: `intención[${i}].damageType: "${lowerDT}" → "${DAMAGE_TYPE_ALIASES[lowerDT]}"`,
            success: true,
          });
        }
      }

      // Fix reputation in nested NPC
      if (fixed.newNPC && typeof fixed.newNPC === 'object') {
        const npc = { ...(fixed.newNPC as Record<string, unknown>) };
        if (typeof npc.reputation === 'string') {
          const lowerRep = npc.reputation.toLowerCase();
          if (REPUTATION_ALIASES[lowerRep]) {
            npc.reputation = REPUTATION_ALIASES[lowerRep];
            logs.push({
              step: 'fix_reputation',
              description: `intención[${i}].newNPC.reputation: "${lowerRep}" → "${REPUTATION_ALIASES[lowerRep]}"`,
              success: true,
            });
          }
        }
        fixed.newNPC = npc;
      }

      // Fix equipSlot "null" strings in lootItems
      if (Array.isArray(fixed.lootItems)) {
        fixed.lootItems = (fixed.lootItems as Record<string, unknown>[]).map((item) => {
          const fixedItem = { ...item };
          if (fixedItem.equipSlot === 'null' || fixedItem.equipSlot === '') {
            delete fixedItem.equipSlot;
          }
          return fixedItem;
        });
      }

      return fixed;
    }).filter(Boolean) as Record<string, unknown>[];
  }

  return result;
}

// --- Range Clamping ---

/**
 * Clamp numeric values to sane ranges to prevent LLM hallucinations.
 * E.g., damageToPlayer: 9999 → 999, xpReward: 1000000 → 100000
 */
function clampRanges(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const result = { ...data };

  if (Array.isArray(result.intentions)) {
    result.intentions = (result.intentions as Record<string, unknown>[]).map((intent, i) => {
      const fixed = { ...intent };

      // Clamp DC to 1-30
      if (typeof fixed.dc === 'number') {
        const clamped = Math.min(30, Math.max(1, Math.round(fixed.dc)));
        if (clamped !== fixed.dc) {
          logs.push({
            step: 'clamp_dc',
            description: `intención[${i}].dc: ${fixed.dc} → ${clamped}`,
            success: true,
          });
          fixed.dc = clamped;
        }
      }

      // Clamp damageToPlayer to 0-999
      if (typeof fixed.damageToPlayer === 'number') {
        const clamped = Math.min(999, Math.max(0, Math.round(fixed.damageToPlayer)));
        if (clamped !== fixed.damageToPlayer) {
          logs.push({
            step: 'clamp_damage',
            description: `intención[${i}].damageToPlayer: ${fixed.damageToPlayer} → ${clamped}`,
            success: true,
          });
          fixed.damageToPlayer = clamped;
        }
      }

      // Clamp xpReward to 0-100000
      if (typeof fixed.xpReward === 'number') {
        const clamped = Math.min(100000, Math.max(0, Math.round(fixed.xpReward)));
        if (clamped !== fixed.xpReward) {
          logs.push({
            step: 'clamp_xp',
            description: `intención[${i}].xpReward: ${fixed.xpReward} → ${clamped}`,
            success: true,
          });
          fixed.xpReward = clamped;
        }
      }

      // Clamp reputationDelta to -100..100
      if (typeof fixed.reputationDelta === 'number') {
        const clamped = Math.min(100, Math.max(-100, Math.round(fixed.reputationDelta)));
        if (clamped !== fixed.reputationDelta) {
          logs.push({
            step: 'clamp_reputation',
            description: `intención[${i}].reputationDelta: ${fixed.reputationDelta} → ${clamped}`,
            success: true,
          });
          fixed.reputationDelta = clamped;
        }
      }

      return fixed;
    });
  }

  return result;
}

// --- Dice Notation Repair ---

/**
 * Fix common dice notation mistakes from the LLM.
 * Examples: "d8+3" → "1d8+3", "1D8+3" → "1d8+3", "1d8 + 3" → "1d8+3"
 */
function repairDiceNotation(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const result = { ...data };

  if (Array.isArray(result.intentions)) {
    result.intentions = (result.intentions as Record<string, unknown>[]).map((intent, i) => {
      const fixed = { ...intent };

      if (typeof fixed.damageRoll === 'string') {
        let notation = fixed.damageRoll as string;

        // Fix: "d8+3" → "1d8+3"
        if (/^d\d+/i.test(notation)) {
          notation = '1' + notation;
        }

        // Fix: "1D8+3" → "1d8+3"
        notation = notation.replace(/D/g, 'd');

        // Fix: "1d8 + 3" → "1d8+3"
        notation = notation.replace(/\s+/g, '');

        // Fix: "1d8+ 3" → "1d8+3"
        notation = notation.replace(/([+-])\s+/g, '$1');

        // Validate the repaired notation
        const parseResult = DiceNotation.safeParse(notation);
        if (parseResult.success) {
          if (notation !== fixed.damageRoll) {
            logs.push({
              step: 'repair_dice_notation',
              description: `intención[${i}].damageRoll: "${fixed.damageRoll}" → "${notation}"`,
              success: true,
            });
            fixed.damageRoll = notation;
          }
        } else {
          // Can't repair the notation, remove it
          logs.push({
            step: 'repair_dice_notation',
            description: `intención[${i}].damageRoll: "${fixed.damageRoll}" irreparable, eliminado`,
            success: false,
          });
          delete fixed.damageRoll;
        }
      }

      return fixed;
    });
  }

  return result;
}

// --- Narrative Repair ---

/**
 * Ensure narrative exists and is non-empty.
 * If missing, try to extract from other fields or use a fallback.
 */
function repairNarrative(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  const result = { ...data };

  if (!result.narrative || typeof result.narrative !== 'string' || result.narrative.trim() === '') {
    // Try to find narrative text in other common AI fields
    const fallbackFields = ['text', 'message', 'response', 'description', 'content'];
    for (const field of fallbackFields) {
      if (typeof result[field] === 'string' && (result[field] as string).trim().length > 0) {
        result.narrative = result[field];
        logs.push({
          step: 'repair_narrative',
          description: `Narrativa vacía/ausente, usando campo "${field}" como fallback`,
          success: true,
        });
        break;
      }
    }

    // If still no narrative, check if intentions have descriptions
    if (!result.narrative && Array.isArray(result.intentions) && result.intentions.length > 0) {
      const descriptions = (result.intentions as Array<Record<string, unknown>>)
        .map(i => i.description)
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0);

      if (descriptions.length > 0) {
        result.narrative = descriptions.join('. ') + '.';
        logs.push({
          step: 'repair_narrative',
          description: 'Narrativa construida desde descripciones de intenciones',
          success: true,
        });
      }
    }

    // Final fallback
    if (!result.narrative || (result.narrative as string).trim() === '') {
      result.narrative = '*El Viejo Greg guarda silencio por un momento...*';
      logs.push({
        step: 'repair_narrative',
        description: 'Narrativa vacía, usando fallback genérico',
        success: true,
      });
    }
  }

  return result;
}

// --- Snake Case Key Fix ---

/**
 * Convert snake_case keys in intentions to camelCase.
 * The AI sometimes returns mixed formats.
 */
function fixSnakeCaseKeys(
  data: Record<string, unknown>,
  logs: RepairLog[]
): Record<string, unknown> {
  function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  function transformDeep(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(transformDeep);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const camelKey = snakeToCamel(key);
        if (camelKey !== key) {
          logs.push({
            step: 'fix_snake_case',
            description: `Clave convertida: "${key}" → "${camelKey}"`,
            success: true,
          });
        }
        result[camelKey] = transformDeep(value);
      }
      return result;
    }
    return obj;
  }

  // Only transform the intentions array (top-level keys are already known)
  if (Array.isArray(data.intentions)) {
    data.intentions = (data.intentions as unknown[]).map(transformDeep);
  }

  // Also transform nested objects
  if (data.lootCurrency && typeof data.lootCurrency === 'object') {
    data.lootCurrency = transformDeep(data.lootCurrency);
  }

  return data;
}

// --- Main Repair Pipeline ---

export interface RepairResult {
  data: Record<string, unknown>;
  repaired: boolean;
  logs: RepairLog[];
  /** Whether the repaired data passes validation */
  validAfterRepair: boolean;
  validatedData?: ValidatedLLMResponse;
  validationErrors: ValidationError[];
}

/**
 * Attempt to repair an invalid LLM response.
 * Runs through a series of repair steps, each one fixing a specific class
 * of errors. After all repairs, re-validates with Zod.
 *
 * Returns the repaired data and diagnostic info.
 */
export function repairLLMResponse(
  raw: Record<string, unknown>,
  originalErrors: ValidationError[]
): RepairResult {
  const logs: RepairLog[] = [];

  logs.push({
    step: 'repair_start',
    description: `Iniciando reparación con ${originalErrors.length} errores de validación`,
    success: true,
  });

  // Step 1: Fix snake_case keys first (so all subsequent steps see camelCase)
  let data = fixSnakeCaseKeys(raw, logs);

  // Step 2: Strip forbidden fields
  data = stripForbiddenFields(data, logs);

  // Step 3: Fix enum values (intention types, damage types, reputation)
  data = fixEnums(data, logs);

  // Step 4: Coerce types (strings → numbers, "null" → undefined, etc.)
  data = coerceTypes(data, logs);

  // Step 5: Repair dice notation
  data = repairDiceNotation(data, logs);

  // Step 6: Clamp numeric ranges
  data = clampRanges(data, logs);

  // Step 7: Repair narrative (ensure non-empty)
  data = repairNarrative(data, logs);

  // Step 8: Re-validate with Zod
  const validationResult = LLMResponseSchema.safeParse(data);
  const validationErrors: ValidationError[] = [];

  if (!validationResult.success) {
    for (const issue of validationResult.error.issues) {
      validationErrors.push({
        path: issue.path.join('.'),
        message: issue.message,
        value: issue.code === 'invalid_type' ? undefined : undefined,
      });
    }
  }

  logs.push({
    step: 'repair_end',
    description: validationResult.success
      ? 'Reparación exitosa — datos validados correctamente'
      : `Reparación fallida — ${validationErrors.length} errores persisten`,
    success: validationResult.success,
  });

  return {
    data,
    repaired: logs.some(l => l.step !== 'repair_start' && l.step !== 'repair_end'),
    logs,
    validAfterRepair: validationResult.success,
    validatedData: validationResult.success ? validationResult.data : undefined,
    validationErrors,
  };
}

// --- Utility: Create Abort Response ---

/**
 * Create a safe "turn aborted" response when the LLM output is completely
 * unparseable. This is the FINAL fallback — it should NEVER modify game state.
 */
export function createAbortResponse(originalRaw: string): ValidatedLLMResponse {
  return {
    narrative: `*El Viejo Greg frunce el ceño y se rasca la barba pensativamente.* "Disculpa, aventurero. Las palabras de los dioses llegan distorsionadas... ¿Podrías repetir lo que dijiste?"`,
    intentions: [],
  };
}
