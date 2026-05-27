// ==========================================
// TABERNA DEL VIEJO GREG - Skill Checks & Saving Throws
// ==========================================
// All D&D 5e check resolution logic centralized here.
// No component or store should compute skill/save totals directly.

import {
  type Character,
  type AbilityScore,
  type SkillKey,
  SKILL_MAP,
  getModifier,
} from '@/lib/game-types';

// --- Dice Rolling ---

/**
 * Parse a dice expression like "2d6+3" or "1d20" and roll it.
 * Returns the total result and a breakdown string.
 */
export function rollDice(expression: string): { total: number; breakdown: string } {
  const normalized = expression.replace(/\s/g, '').toLowerCase();
  const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);

  if (!match) {
    // Fallback: treat as flat number
    const flat = parseInt(normalized, 10);
    if (!isNaN(flat)) return { total: flat, breakdown: `${flat}` };
    return { total: 0, breakdown: `Invalid: ${expression}` };
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  const rolls: number[] = [];
  for (let i = 0; i < Math.min(count, 100); i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;

  const rollStr = rolls.length === 1 ? `${rolls[0]}` : `[${rolls.join(', ')}]`;
  const breakdown = modifier !== 0
    ? `${rollStr} ${modifier > 0 ? '+' : ''}${modifier} = ${total}`
    : `${rollStr} = ${total}`;

  return { total, breakdown };
}

/**
 * Roll a d20 and add a modifier.
 * Returns the total, whether it was a natural 20/1, and breakdown.
 */
export function rollD20(modifier: number = 0): {
  total: number;
  natural: number;
  isCrit: boolean;
  isFumble: boolean;
  breakdown: string;
} {
  const natural = Math.floor(Math.random() * 20) + 1;
  const total = natural + modifier;
  return {
    total,
    natural,
    isCrit: natural === 20,
    isFumble: natural === 1,
    breakdown: `Natural ${natural} ${modifier >= 0 ? '+' : ''}${modifier} = ${total}`,
  };
}

// --- Skill Total Calculation ---

/**
 * Calculate the total bonus for a given skill.
 * Formula: ability modifier + proficiency bonus (if proficient) + proficiency bonus (if expertise)
 */
export function calculateSkillTotal(
  character: Character,
  skillKey: SkillKey
): number {
  const skill = character.skills.find((s) => s.key === skillKey);
  if (!skill) return 0;

  const abilityMod = getModifier(character.abilityScores[skill.ability]);
  let total = abilityMod;

  if (skill.proficient) {
    total += character.proficiencyBonus;
  }
  if (skill.expertise) {
    total += character.proficiencyBonus;
  }

  return total;
}

// --- Saving Throw Total Calculation ---

/**
 * Calculate the total bonus for a given saving throw.
 * Formula: ability modifier + proficiency bonus (if proficient)
 */
export function calculateSaveTotal(
  character: Character,
  ability: AbilityScore
): number {
  const abilityMod = getModifier(character.abilityScores[ability]);
  const proficient = character.savingThrows[ability];
  return proficient ? abilityMod + character.proficiencyBonus : abilityMod;
}

// --- Check Resolution ---

export interface CheckResult {
  success: boolean;
  total: number;
  dc: number;
  natural: number;
  isCrit: boolean;
  isFumble: boolean;
  breakdown: string;
}

/**
 * Resolve a skill check against a DC.
 * Natural 20 always succeeds, natural 1 always fails (D&D 5e optional rule, used for drama).
 */
export function resolveSkillCheck(
  character: Character,
  skillKey: SkillKey,
  dc: number
): CheckResult {
  const modifier = calculateSkillTotal(character, skillKey);
  const roll = rollD20(modifier);

  // Natural 20 = automatic success, natural 1 = automatic failure
  const success = roll.isCrit || (!roll.isFumble && roll.total >= dc);

  return {
    success,
    total: roll.total,
    dc,
    natural: roll.natural,
    isCrit: roll.isCrit,
    isFumble: roll.isFumble,
    breakdown: roll.breakdown,
  };
}

/**
 * Resolve a saving throw against a DC.
 */
export function resolveSavingThrow(
  character: Character,
  ability: AbilityScore,
  dc: number
): CheckResult {
  const modifier = calculateSaveTotal(character, ability);
  const roll = rollD20(modifier);

  const success = roll.isCrit || (!roll.isFumble && roll.total >= dc);

  return {
    success,
    total: roll.total,
    dc,
    natural: roll.natural,
    isCrit: roll.isCrit,
    isFumble: roll.isFumble,
    breakdown: roll.breakdown,
  };
}

// --- Skill/Save Info ---

/**
 * Get all skill totals for a character (for display or context building).
 */
export function getAllSkillTotals(character: Character): Record<SkillKey, number> {
  const totals = {} as Record<SkillKey, number>;
  for (const key of Object.keys(SKILL_MAP) as SkillKey[]) {
    totals[key] = calculateSkillTotal(character, key);
  }
  return totals;
}

/**
 * Get all saving throw totals for a character.
 */
export function getAllSaveTotals(character: Character): Record<AbilityScore, number> {
  return {
    strength: calculateSaveTotal(character, 'strength'),
    dexterity: calculateSaveTotal(character, 'dexterity'),
    constitution: calculateSaveTotal(character, 'constitution'),
    intelligence: calculateSaveTotal(character, 'intelligence'),
    wisdom: calculateSaveTotal(character, 'wisdom'),
    charisma: calculateSaveTotal(character, 'charisma'),
  };
}
