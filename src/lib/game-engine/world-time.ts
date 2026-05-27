// ==========================================
// TABERNA DEL VIEJO GREG - World Time System
// ==========================================
// Time of day, day count, turn tracking, and location management.

import { type GameState } from '@/lib/game-types';

// --- Time of Day ---

export type TimeOfDay = 'Mañana' | 'Tarde' | 'Noche';

const TIME_ORDER: TimeOfDay[] = ['Mañana', 'Tarde', 'Noche'];

/**
 * Get the next time of day in the cycle.
 * After Noche comes Mañana of the next day.
 */
export function advanceTimeOfDay(current: string): { timeOfDay: TimeOfDay; newDay: boolean } {
  const currentIdx = TIME_ORDER.indexOf(current as TimeOfDay);
  if (currentIdx === -1) {
    // Unknown time — default to morning
    return { timeOfDay: 'Mañana', newDay: false };
  }

  if (currentIdx >= TIME_ORDER.length - 1) {
    // Noche → Mañana of next day
    return { timeOfDay: 'Mañana', newDay: true };
  }

  return { timeOfDay: TIME_ORDER[currentIdx + 1], newDay: false };
}

// --- Turn Advancement ---

/**
 * Advance the turn counter by 1.
 */
export function advanceTurn(narrative: GameState['narrative']): GameState['narrative'] {
  return {
    ...narrative,
    turn: narrative.turn + 1,
  };
}

/**
 * Advance time by a full time period (Mañana→Tarde, etc.).
 * Automatically increments day when wrapping around.
 */
export function advanceTime(narrative: GameState['narrative']): GameState['narrative'] {
  const { timeOfDay, newDay } = advanceTimeOfDay(narrative.timeOfDay);
  return {
    ...narrative,
    timeOfDay,
    day: newDay ? narrative.day + 1 : narrative.day,
    turn: narrative.turn + 1,
  };
}

/**
 * Advance to a specific time of day, possibly on a new day.
 */
export function advanceToTime(
  narrative: GameState['narrative'],
  timeOfDay: TimeOfDay,
  day?: number
): GameState['narrative'] {
  return {
    ...narrative,
    timeOfDay,
    day: day ?? narrative.day,
    turn: narrative.turn + 1,
  };
}

/**
 * Advance by multiple days (e.g., travel time).
 */
export function advanceDays(
  narrative: GameState['narrative'],
  days: number
): GameState['narrative'] {
  if (days <= 0) return narrative;
  return {
    ...narrative,
    day: narrative.day + days,
    turn: narrative.turn + 1,
    timeOfDay: 'Mañana', // Arriving in the morning after travel
  };
}

// --- Location ---

/**
 * Update the current location.
 */
export function updateLocation(
  narrative: GameState['narrative'],
  location: string
): GameState['narrative'] {
  return {
    ...narrative,
    location,
    turn: narrative.turn + 1,
  };
}

// --- Narrative Update ---

/**
 * Apply partial narrative updates. Only overwrites provided fields.
 */
export function updateNarrative(
  narrative: GameState['narrative'],
  updates: Partial<GameState['narrative']>
): GameState['narrative'] {
  return {
    ...narrative,
    ...updates,
  };
}

// --- Context Building ---

/**
 * Get a human-readable description of the current narrative state.
 * Useful for AI context building.
 */
export function getNarrativeSummary(narrative: GameState['narrative']): string {
  return `Ubicación: ${narrative.location} | Hora: ${narrative.timeOfDay} | Día: ${narrative.day} | Turno: ${narrative.turn}`;
}
