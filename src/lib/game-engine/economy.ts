// ==========================================
// TABERNA DEL VIEJO GREG - Economy System
// ==========================================
// Currency management, coin parsing, loot distribution, and trade logic.

import {
  type Currency,
  type Inventory,
  type Item,
  type Quest,
  type ItemRarity,
} from '@/lib/game-types';

// --- Currency Sanitization ---

/**
 * Ensure currency values are never negative.
 */
export function sanitizeCurrency(currency: Currency): Currency {
  return {
    gold: Math.max(0, Math.floor(currency.gold)),
    silver: Math.max(0, Math.floor(currency.silver)),
    copper: Math.max(0, Math.floor(currency.copper)),
  };
}

/**
 * Normalize currency: convert excess silver/copper up.
 * 100 copper = 1 gold, 10 silver = 1 gold (simplified)
 */
export function normalizeCurrency(currency: Currency): Currency {
  let { gold, silver, copper } = sanitizeCurrency(currency);

  // Convert copper overflow to silver
  const silverFromCopper = Math.floor(copper / 100);
  copper = copper % 100;
  silver += silverFromCopper;

  // Convert silver overflow to gold
  const goldFromSilver = Math.floor(silver / 10);
  silver = silver % 10;
  gold += goldFromSilver;

  return { gold, silver, copper };
}

// --- Coin String Parsing ---

/**
 * Parse a coin reward string like "50 oro" or "25 plata y 10 cobre" into a Currency object.
 * Supports Spanish coin names: oro, plata, cobre.
 * Also supports English: gold, silver, copper.
 */
export function parseCoinString(coinStr: string): Currency {
  const result: Currency = { gold: 0, silver: 0, copper: 0 };
  if (!coinStr || typeof coinStr !== 'string') return result;

  // Match patterns like "50 oro", "25plata", "10 cobre", "50 gold"
  const matches = coinStr.matchAll(/(\d+)\s*(oro|plata|cobre|gold|silver|copper)/gi);
  for (const match of matches) {
    const amount = parseInt(match[1], 10);
    const type = match[2].toLowerCase();

    if (type === 'oro' || type === 'gold') {
      result.gold += amount;
    } else if (type === 'plata' || type === 'silver') {
      result.silver += amount;
    } else if (type === 'cobre' || type === 'copper') {
      result.copper += amount;
    }
  }

  return sanitizeCurrency(result);
}

// --- Currency Update ---

/**
 * Update currency by merging partial updates. Sanitizes result.
 */
export function updateCurrency(
  current: Currency,
  updates: Partial<Currency>
): Currency {
  return sanitizeCurrency({
    gold: (current.gold ?? 0) + (updates.gold ?? 0),
    silver: (current.silver ?? 0) + (updates.silver ?? 0),
    copper: (current.copper ?? 0) + (updates.copper ?? 0),
  });
}

/**
 * Set currency to exact values (overwrites). Sanitizes result.
 */
export function setCurrency(
  current: Currency,
  updates: Partial<Currency>
): Currency {
  return sanitizeCurrency({
    gold: updates.gold ?? current.gold,
    silver: updates.silver ?? current.silver,
    copper: updates.copper ?? current.copper,
  });
}

// --- Loot Distribution ---

export interface LootResult {
  currency: Currency;
  items: Item[];
  xp: number;
}

/**
 * Process loot from a quest completion.
 * Converts coin rewards from string format and creates placeholder items.
 */
export function grantLoot(quest: Quest): LootResult {
  // Parse coin reward
  const currency = parseCoinString(quest.coinReward || '');

  // Convert item reward strings to placeholder items
  const items: Item[] = (quest.itemRewards || []).map((rewardName, index) => ({
    id: `loot_${Date.now()}_${index}`,
    name: rewardName,
    description: `Recompensa de misión: ${quest.name}`,
    category: 'important' as const,
    rarity: 'common' as ItemRarity,
    weight: 0,
    value: 0,
    effect: '',
    equipped: false,
    quantity: 1,
  }));

  return {
    currency,
    items,
    xp: quest.experienceReward || 0,
  };
}

// --- Trade / Purchase ---

/**
 * Check if the character can afford a given price.
 */
export function canAfford(current: Currency, price: Currency): boolean {
  // Convert everything to copper for comparison
  const currentCp = current.gold * 100 + current.silver * 10 + current.copper;
  const priceCp = price.gold * 100 + price.silver * 10 + price.copper;
  return currentCp >= priceCp;
}

/**
 * Deduct currency for a purchase. Returns the remaining currency.
 * Throws if the character can't afford it (caller should check canAfford first).
 */
export function deductCurrency(current: Currency, price: Currency): Currency {
  // Simple approach: convert to copper, subtract, convert back
  let totalCp = current.gold * 100 + current.silver * 10 + current.copper;
  const priceCp = price.gold * 100 + price.silver * 10 + price.copper;

  totalCp -= priceCp;
  if (totalCp < 0) {
    // Can't afford — return original
    return current;
  }

  const gold = Math.floor(totalCp / 100);
  totalCp %= 100;
  const silver = Math.floor(totalCp / 10);
  totalCp %= 10;

  return sanitizeCurrency({ gold, silver, copper: totalCp });
}

// --- Value Display ---

/**
 * Format a Currency object for display.
 * E.g., { gold: 5, silver: 3, copper: 12 } → "5 oro, 3 plata, 12 cobre"
 */
export function formatCurrency(currency: Currency): string {
  const parts: string[] = [];
  if (currency.gold > 0) parts.push(`${currency.gold} oro`);
  if (currency.silver > 0) parts.push(`${currency.silver} plata`);
  if (currency.copper > 0) parts.push(`${currency.copper} cobre`);
  return parts.length > 0 ? parts.join(', ') : '0 cobre';
}

/**
 * Convert an item value (in copper pieces) to a display string.
 */
export function formatItemValue(copperPieces: number): string {
  if (copperPieces >= 100) {
    const gold = Math.floor(copperPieces / 100);
    const remainder = copperPieces % 100;
    if (remainder === 0) return `${gold} oro`;
    const silver = Math.floor(remainder / 10);
    const copper = remainder % 10;
    if (copper === 0) return `${gold} oro, ${silver} plata`;
    return `${gold} oro, ${silver} plata, ${copper} cobre`;
  }
  if (copperPieces >= 10) {
    const silver = Math.floor(copperPieces / 10);
    const copper = copperPieces % 10;
    if (copper === 0) return `${silver} plata`;
    return `${silver} plata, ${copper} cobre`;
  }
  return `${copperPieces} cobre`;
}
