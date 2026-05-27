// ==========================================
// TABERNA DEL VIEJO GREG - Combat Resolution
// ==========================================
// All combat, damage, healing, death save, and status effect logic.
// Every HP mutation in the app MUST go through this module.

import {
  type Character,
  type DeathEntry,
  getModifier,
} from '@/lib/game-types';

// --- HP Management ---

/**
 * Apply damage to a character. Temporary HP is consumed first.
 * Returns a new Character with updated HP (never below 0).
 */
export function applyDamage(character: Character, amount: number): Character {
  if (amount <= 0) return character;

  let tempHp = character.temporaryHp;
  let currentHp = character.currentHp;

  // Temporary HP absorbs damage first
  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, amount);
    tempHp -= absorbed;
    currentHp -= (amount - absorbed);
  } else {
    currentHp -= amount;
  }

  return {
    ...character,
    currentHp: Math.max(0, currentHp),
    temporaryHp: Math.max(0, tempHp),
  };
}

/**
 * Apply healing to a character. Never exceeds maxHp.
 * Returns a new Character with updated HP.
 */
export function applyHealing(character: Character, amount: number): Character {
  if (amount <= 0) return character;

  const newHp = Math.min(character.maxHp, character.currentHp + amount);
  return {
    ...character,
    currentHp: newHp,
  };
}

/**
 * Add temporary HP to a character. Does not stack — takes the higher value.
 * Returns a new Character with updated temp HP.
 */
export function applyTemporaryHp(character: Character, amount: number): Character {
  if (amount <= 0) return character;
  return {
    ...character,
    temporaryHp: Math.max(character.temporaryHp, amount),
  };
}

/**
 * Clamp HP to valid range (0..maxHp). Defensive utility.
 */
export function clampHp(character: Character): Character {
  return {
    ...character,
    currentHp: Math.max(0, Math.min(character.currentHp, character.maxHp)),
  };
}

// --- Death Saves ---

export interface DeathSaveResult {
  character: Character;
  died: boolean;
  stabilized: boolean;
  rollResult: number;
  isCrit: boolean; // natural 20 = 2 successes
  isFumble: boolean; // natural 1 = 2 failures
}

/**
 * Process a death saving throw for a character.
 * - DC 10, natural 20 = 2 successes, natural 1 = 2 failures
 * - 3 successes = stabilized, 3 failures = dead
 * Only processes if character is at 0 HP.
 */
export function resolveDeathSave(character: Character): DeathSaveResult {
  // Can only death save if at 0 HP
  if (character.currentHp > 0) {
    return {
      character,
      died: false,
      stabilized: false,
      rollResult: 0,
      isCrit: false,
      isFumble: false,
    };
  }

  const roll = Math.floor(Math.random() * 20) + 1;
  let successes = character.deathSaves.successes;
  let failures = character.deathSaves.failures;

  if (roll === 20) {
    // Natural 20: 2 successes + regain 1 HP
    successes = Math.min(3, successes + 2);
  } else if (roll === 1) {
    // Natural 1: 2 failures
    failures = Math.min(3, failures + 2);
  } else if (roll >= 10) {
    successes += 1;
  } else {
    failures += 1;
  }

  const stabilized = successes >= 3;
  const died = failures >= 3;

  // Natural 20 also restores 1 HP
  const regainedHp = roll === 20;

  const updatedChar: Character = {
    ...character,
    currentHp: regainedHp ? 1 : character.currentHp,
    deathSaves: {
      successes: Math.min(3, successes),
      failures: Math.min(3, failures),
    },
    // If stabilized or died, clear conditions that caused dying
    conditions: stabilized || died
      ? character.conditions.filter((c) => c !== 'Unconscious' && c !== 'Dying')
      : character.conditions,
  };

  return {
    character: updatedChar,
    died,
    stabilized,
    rollResult: roll,
    isCrit: roll === 20,
    isFumble: roll === 1,
  };
}

// --- Death Resolution ---

/**
 * Create a death entry for the Book of Dead when a character or NPC dies.
 */
export function createDeathEntry(params: {
  name: string;
  race: string;
  role: DeathEntry['role'];
  causeOfDeath: string;
  location: string;
  turn: number;
  day: number;
  elegy?: string;
  confirmed?: boolean;
}): DeathEntry {
  return {
    id: crypto.randomUUID?.() || `death_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: params.name,
    race: params.race,
    role: params.role,
    causeOfDeath: params.causeOfDeath,
    location: params.location,
    turn: params.turn,
    day: params.day,
    elegy: params.elegy || '',
    confirmed: params.confirmed ?? true,
  };
}

// --- Status Effects ---

/**
 * Add a condition to a character. Does not add duplicates.
 */
export function addCondition(character: Character, condition: string): Character {
  if (character.conditions.includes(condition)) return character;
  return {
    ...character,
    conditions: [...character.conditions, condition],
  };
}

/**
 * Remove a condition from a character.
 */
export function removeCondition(character: Character, condition: string): Character {
  return {
    ...character,
    conditions: character.conditions.filter((c) => c !== condition),
  };
}

/**
 * Apply a status effect by name. Maps common conditions to their mechanical effects.
 * Returns the character with any mechanical changes applied + the condition tag.
 */
export function applyStatusEffect(character: Character, effect: string): Character {
  let char = addCondition(character, effect);

  switch (effect.toLowerCase()) {
    case 'poisoned':
    case 'envenenado':
      // No mechanical change, just tagged
      break;
    case 'blinded':
    case 'cegado':
      // No mechanical change on character sheet, affects checks
      break;
    case 'paralyzed':
    case 'paralizado':
      // STR/DEX saves auto-fail, attacks auto-crit — tagged only
      break;
    case 'stunned':
    case 'aturdido':
      // Can't act — tagged only
      break;
    case 'unconscious':
    case 'inconsciente':
    case 'dying':
    case 'moribundo':
      char = { ...char, conditions: [...new Set([...char.conditions, 'Unconscious'])] };
      break;
    case 'exhaustion':
    case 'agotamiento':
      // Would need exhaustion level tracking — tagged only
      break;
    default:
      // Unknown effect — just tag it
      break;
  }

  return char;
}

// --- Combat Resolution ---

export interface CombatResult {
  character: Character;
  damageDealt: number;
  damageTaken: number;
  healingReceived: number;
  targetDefeated: boolean;
  characterDied: boolean;
}

/**
 * Resolve a full combat exchange.
 * This is a high-level orchestrator that applies damage/healing/status in one pass.
 */
export function resolveCombat(params: {
  character: Character;
  damageTaken?: number;
  healingReceived?: number;
  temporaryHpGained?: number;
  statusesApplied?: string[];
  statusesRemoved?: string[];
}): CombatResult {
  let char = { ...params.character };
  let damageTaken = 0;
  let targetDefeated = false;

  // Apply damage first
  if (params.damageTaken && params.damageTaken > 0) {
    char = applyDamage(char, params.damageTaken);
    damageTaken = params.damageTaken;
  }

  // Apply temporary HP
  if (params.temporaryHpGained && params.temporaryHpGained > 0) {
    char = applyTemporaryHp(char, params.temporaryHpGained);
  }

  // Apply healing (after damage, so healing works on the post-damage HP)
  if (params.healingReceived && params.healingReceived > 0) {
    char = applyHealing(char, params.healingReceived);
  }

  // Apply status effects
  if (params.statusesApplied) {
    for (const effect of params.statusesApplied) {
      char = applyStatusEffect(char, effect);
    }
  }

  // Remove status effects
  if (params.statusesRemoved) {
    for (const effect of params.statusesRemoved) {
      char = removeCondition(char, effect);
    }
  }

  // Clamp HP
  char = clampHp(char);

  const characterDied = char.currentHp === 0 && char.deathSaves.failures >= 3;

  return {
    character: char,
    damageDealt: 0, // Would need target info — filled by caller
    damageTaken,
    healingReceived: params.healingReceived ?? 0,
    targetDefeated,
    characterDied,
  };
}
