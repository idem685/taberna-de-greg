// ==========================================
// TABERNA DEL VIEJO GREG - Progression System
// ==========================================
// XP, leveling, proficiency, HP growth — all D&D 5e progression rules.

import {
  type Character,
  type AbilityScores,
  type Skill,
  type SkillKey,
  SKILL_MAP,
  getModifier,
  HIT_DIE_AVERAGE,
} from '@/lib/game-types';

// --- Proficiency ---

/**
 * Calculate proficiency bonus for a given level.
 * D&D 5e formula: ceil(level / 4) + 1
 * Level 1-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6
 */
export function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// --- XP Thresholds ---

/**
 * Calculate XP needed to reach the NEXT level.
 * Custom formula: level * 300 + (level - 1) * 150
 * Produces: Level 1→2: 300, 2→3: 750, 3→4: 1200, etc.
 */
export function calculateXPToNext(level: number): number {
  return level * 300 + (level - 1) * 150;
}

/**
 * Check if a character has enough XP to level up.
 */
export function canLevelUp(character: Character): boolean {
  return character.experience >= character.experienceToNext;
}

// --- HP Growth ---

/**
 * Calculate HP gained on a single level-up.
 * = hit die average + CON modifier
 */
export function calculateHPIncrease(character: Character): number {
  const conMod = getModifier(character.abilityScores.constitution);
  const hitDieAvg = HIT_DIE_AVERAGE[character.hitDice] || 5;
  return hitDieAvg + conMod;
}

// --- Level Up ---

export interface LevelUpResult {
  character: Character;
  levelsGained: number;
  hpGained: number;
}

/**
 * Perform a full level-up on a character.
 * Can apply ability score improvements if provided.
 * Can level multiple times if XP warrants it.
 * Returns the updated character and stats about what changed.
 */
export function levelUp(
  character: Character,
  abilityImprovements?: Partial<Record<string, number>>
): LevelUpResult {
  let char = { ...character };
  let levelsGained = 0;
  let totalHpGained = 0;

  // Perform level-up (may happen multiple times if enough XP)
  while (char.experience >= char.experienceToNext && char.level < 20) {
    char.level += 1;
    levelsGained += 1;

    // Update proficiency bonus
    char.proficiencyBonus = calculateProficiencyBonus(char.level);

    // Update XP threshold
    char.experienceToNext = calculateXPToNext(char.level);

    // Increase max HP
    const hpIncrease = calculateHPIncrease(char);
    char.maxHp += hpIncrease;
    totalHpGained += hpIncrease;

    // On level-up, heal to full (D&D 5e long rest equivalent)
    char.currentHp = char.maxHp;

    // Reset hit dice
    char.hitDiceRemaining = char.level;
  }

  // Apply ability score improvements (once, for the overall level-up)
  if (abilityImprovements && levelsGained > 0) {
    const scores = { ...char.abilityScores } as Record<string, number>;
    for (const [key, value] of Object.entries(abilityImprovements)) {
      if (key in scores && typeof value === 'number') {
        scores[key] = (scores[key] || 10) + value;
      }
    }
    char.abilityScores = scores as unknown as AbilityScores;
  }

  // Clamp HP after all changes
  char.currentHp = Math.max(0, Math.min(char.currentHp, char.maxHp));

  return {
    character: char,
    levelsGained,
    hpGained: totalHpGained,
  };
}

// --- XP Granting ---

export interface GrantXPResult {
  character: Character;
  xpGranted: number;
  levelsGained: number;
  didLevelUp: boolean;
}

/**
 * Grant XP to a character and auto-level-up if threshold is reached.
 * This is the ONLY way XP should be added to a character.
 */
export function grantXP(character: Character, amount: number): GrantXPResult {
  if (amount <= 0) {
    return {
      character,
      xpGranted: 0,
      levelsGained: 0,
      didLevelUp: false,
    };
  }

  let char = { ...character };
  char.experience += amount;

  // Check for level-up
  const levelsBefore = char.level;
  const result = levelUp(char);
  char = result.character;

  return {
    character: char,
    xpGranted: amount,
    levelsGained: result.levelsGained,
    didLevelUp: result.levelsGained > 0,
  };
}

// --- Rest Mechanics ---

/**
 * Perform a long rest:
 * - Restore all HP
 * - Remove temporary HP
 * - Reset hit dice to max (level)
 * - Reset death saves
 * - Remove all conditions (except permanent ones)
 */
export function longRest(character: Character): Character {
  return {
    ...character,
    currentHp: character.maxHp,
    temporaryHp: 0,
    hitDiceRemaining: character.level,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [], // Long rest removes most conditions
  };
}

/**
 * Perform a short rest:
 * - Can spend hit dice to recover HP
 * - Each hit die heals: hit die average + CON modifier
 * - Automatically spends optimal number of dice
 */
export function shortRest(character: Character): Character {
  const conMod = getModifier(character.abilityScores.constitution);
  const hitDieAvg = HIT_DIE_AVERAGE[character.hitDice] || 5;
  const hpPerDie = hitDieAvg + conMod;

  // Calculate how many dice to spend (up to what's needed and available)
  const hpNeeded = character.maxHp - character.currentHp;
  const diceToSpend = hpPerDie > 0
    ? Math.min(character.hitDiceRemaining, Math.ceil(hpNeeded / hpPerDie))
    : 0;

  if (diceToSpend <= 0) return character;

  return {
    ...character,
    currentHp: Math.min(
      character.maxHp,
      character.currentHp + diceToSpend * hpPerDie
    ),
    hitDiceRemaining: character.hitDiceRemaining - diceToSpend,
  };
}
