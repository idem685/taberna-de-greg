// ==========================================
// TABERNA DEL VIEJO GREG - Inventory Management
// ==========================================
// All inventory, equipment, weight, and item consumption logic.
// No component or store should mutate inventory state directly.

import {
  type Character,
  type Inventory,
  type Item,
  type Equipment,
  type ItemCategory,
  getModifier,
} from '@/lib/game-types';

// --- Weight Calculation ---

/**
 * Calculate the total weight of all items in an inventory.
 */
export function calculateWeight(items: Item[]): number {
  return items.reduce(
    (sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 1),
    0
  );
}

/**
 * Calculate max carry weight based on Strength score.
 * D&D 5e: carrying capacity = Strength × 15 (in lbs)
 */
export function calculateMaxWeight(strength: number): number {
  return strength * 15;
}

/**
 * Check if an item can be added without exceeding weight limit.
 */
export function canAddItem(inventory: Inventory, item: Item): boolean {
  const currentWeight = calculateWeight(inventory.items);
  const itemWeight = (Number(item.weight) || 0) * (Number(item.quantity) || 1);
  return currentWeight + itemWeight <= inventory.maxWeight;
}

// --- Item Sanitization ---

/**
 * Sanitize item data from AI or import sources.
 * Fixes common AI issues like "null" strings, missing types, etc.
 */
export function sanitizeItem(item: Partial<Item> & { id?: string }): Item {
  const safeItem = { ...item } as Record<string, unknown>;

  // Fix equipSlot: "null" string → undefined
  if (safeItem.equipSlot === 'null' || safeItem.equipSlot === '') {
    delete safeItem.equipSlot;
  }

  // Fix equipped: ensure boolean
  if (typeof safeItem.equipped === 'string') {
    safeItem.equipped = safeItem.equipped === 'true';
  }

  // Fix quantity: ensure number
  if (typeof safeItem.quantity !== 'number') {
    safeItem.quantity = parseInt(String(safeItem.quantity), 10) || 1;
  }

  // Fix weight: ensure number
  if (typeof safeItem.weight !== 'number') {
    safeItem.weight = parseFloat(String(safeItem.weight)) || 0;
  }

  // Fix value: ensure number
  if (typeof safeItem.value !== 'number') {
    safeItem.value = parseInt(String(safeItem.value), 10) || 0;
  }

  // Fix armorBonus: ensure number or undefined
  if (safeItem.armorBonus === 0 || safeItem.armorBonus === '0' || safeItem.armorBonus === '') {
    delete safeItem.armorBonus;
  }
  if (typeof safeItem.armorBonus === 'string') {
    safeItem.armorBonus = parseInt(safeItem.armorBonus as string, 10) || undefined;
  }

  return {
    id: (safeItem.id as string) || crypto.randomUUID?.() || `item_${Date.now()}`,
    name: (safeItem.name as string) || 'Objeto desconocido',
    description: (safeItem.description as string) || '',
    category: (safeItem.category as ItemCategory) || 'misc',
    rarity: (safeItem.rarity as Item['rarity']) || 'common',
    weight: (safeItem.weight as number) ?? 0,
    value: (safeItem.value as number) ?? 0,
    effect: (safeItem.effect as string) || '',
    equipped: (safeItem.equipped as boolean) ?? false,
    equipSlot: safeItem.equipSlot as Item['equipSlot'],
    damage: safeItem.damage as string | undefined,
    damageType: safeItem.damageType as string | undefined,
    armorBonus: safeItem.armorBonus as number | undefined,
    properties: safeItem.properties as string[] | undefined,
    quantity: (safeItem.quantity as number) ?? 1,
  };
}

// --- Add Item ---

export interface AddItemResult {
  inventory: Inventory;
  added: boolean;
  reason?: string;
}

/**
 * Add an item to inventory. Handles:
 * - Weight limit enforcement
 * - Stack merging for non-weapon/non-armor items
 * - Item sanitization
 */
export function addItem(inventory: Inventory, rawItem: Partial<Item> & { id?: string }): AddItemResult {
  const item = sanitizeItem(rawItem);

  // Check weight limit
  if (!canAddItem(inventory, item)) {
    return {
      inventory,
      added: false,
      reason: `Cannot add ${item.name}: would exceed weight limit`,
    };
  }

  // Check for stacking (same name + category, but not weapons/armor)
  const existingItem = inventory.items.find(
    (i) => i.name === item.name && i.category === item.category
  );

  let newItems: Item[];
  if (existingItem && item.category !== 'weapon' && item.category !== 'armor') {
    // Stack: increase quantity
    newItems = inventory.items.map((i) =>
      i.id === existingItem.id
        ? { ...i, quantity: i.quantity + item.quantity }
        : i
    );
  } else {
    // New item
    newItems = [...inventory.items, item];
  }

  return {
    inventory: { ...inventory, items: newItems },
    added: true,
  };
}

// --- Remove Item ---

/**
 * Remove one quantity of an item. If quantity drops to 0, removes the item entirely.
 * Also unequips the item if it was equipped.
 */
export function removeItem(inventory: Inventory, itemId: string): Inventory {
  const item = inventory.items.find((i) => i.id === itemId);
  if (!item) return inventory;

  // Unequip if equipped
  let equipment = { ...inventory.equipment };
  for (const [slot, equipped] of Object.entries(equipment)) {
    if (equipped && (equipped as Item).id === itemId) {
      equipment = { ...equipment, [slot]: null };
    }
  }

  let newItems: Item[];
  if (item.quantity > 1) {
    newItems = inventory.items.map((i) =>
      i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
    );
  } else {
    newItems = inventory.items.filter((i) => i.id !== itemId);
  }

  return { ...inventory, items: newItems, equipment };
}

// --- Equipment ---

/**
 * Calculate Armor Class from equipment and Dexterity.
 * Formula: 10 + DEX modifier + armor bonus + shield bonus
 */
export function calculateAC(character: Character | null, equipment: Equipment): number {
  let ac = 10 + getModifier(character?.abilityScores?.dexterity ?? 10);
  if (equipment.armor) ac += equipment.armor.armorBonus ?? 0;
  if (equipment.shield) ac += equipment.shield.armorBonus ?? 2;
  return ac;
}

/**
 * Equip an item. Swaps out the current item in that slot.
 * Updates the character's AC based on new equipment.
 */
export function equipItem(
  inventory: Inventory,
  character: Character | null,
  itemId: string
): { inventory: Inventory; character: Character | null } {
  const item = inventory.items.find((i) => i.id === itemId);
  if (!item?.equipSlot) return { inventory, character };

  let equipment = { ...inventory.equipment };
  let newItems = [...inventory.items];

  // Unequip current item in that slot
  const currentEquipped = equipment[item.equipSlot];
  if (currentEquipped) {
    newItems = newItems.map((i) =>
      i.id === currentEquipped.id ? { ...i, equipped: false } : i
    );
  }

  // Equip new item
  equipment = { ...equipment, [item.equipSlot]: item };
  newItems = newItems.map((i) =>
    i.id === itemId ? { ...i, equipped: true } : i
  );

  // Recalculate AC
  const newAC = calculateAC(character, equipment);

  return {
    inventory: { ...inventory, items: newItems, equipment },
    character: character ? { ...character, armorClass: newAC } : null,
  };
}

/**
 * Unequip an item from a specific slot.
 * Updates the character's AC.
 */
export function unequipItem(
  inventory: Inventory,
  character: Character | null,
  slot: keyof Equipment
): { inventory: Inventory; character: Character | null } {
  const item = inventory.equipment[slot];
  if (!item) return { inventory, character };

  const equipment = { ...inventory.equipment, [slot]: null };
  const newItems = inventory.items.map((i) =>
    i.id === item.id ? { ...i, equipped: false } : i
  );

  // Recalculate AC
  const newAC = calculateAC(character, equipment);

  return {
    inventory: { ...inventory, items: newItems, equipment },
    character: character ? { ...character, armorClass: newAC } : null,
  };
}

// --- Consumption ---

/**
 * Check if an item is consumable.
 * Potions, misc items with effects, and scrolls are consumable.
 */
export function isConsumable(item: Item): boolean {
  return (
    item.category === 'potion' ||
    item.category === 'misc' ||
    (item.effect !== undefined && item.effect !== null && item.effect.length > 0)
  );
}

/**
 * Consume an item. Decrements quantity, removes if 0.
 * Returns the updated inventory and a description of the effect for the caller to process.
 */
export function consumeItem(inventory: Inventory, itemId: string): {
  inventory: Inventory;
  consumed: boolean;
  effect: string;
  itemName: string;
} {
  const item = inventory.items.find((i) => i.id === itemId);
  if (!item) {
    return { inventory, consumed: false, effect: '', itemName: '' };
  }

  if (!isConsumable(item)) {
    return { inventory, consumed: false, effect: '', itemName: item.name };
  }

  const newItems =
    item.quantity > 1
      ? inventory.items.map((i) =>
          i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
        )
      : inventory.items.filter((i) => i.id !== itemId);

  return {
    inventory: { ...inventory, items: newItems },
    consumed: true,
    effect: item.effect || '',
    itemName: item.name,
  };
}

// --- Create Empty Inventory ---

/**
 * Create an empty inventory with weight limit based on Strength.
 */
export function createEmptyInventory(strength: number = 10): Inventory {
  return {
    items: [],
    equipment: {
      weapon: null,
      armor: null,
      shield: null,
      accessory: null,
    },
    currency: { gold: 0, silver: 0, copper: 0 },
    maxWeight: calculateMaxWeight(strength),
  };
}
