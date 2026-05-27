// ==========================================
// TABERNA DEL VIEJO GREG - API Utilities
// ==========================================
// Safe fetch wrapper that handles HTML error pages from Next.js,
// network errors, timeouts, and non-JSON responses gracefully.

const DEFAULT_TIMEOUT = 120000; // 2 minutes

export class APIError extends Error {
  public status: number;
  public detail: string;

  constructor(message: string, status: number = 0, detail: string = '') {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Safely fetch a JSON API endpoint.
 * - Validates the response Content-Type is JSON
 * - Handles Next.js HTML error pages (dev overlay, 404, 500)
 * - Handles network errors and timeouts
 * - Returns parsed JSON or throws APIError with user-friendly messages
 */
export async function fetchJSON<T = Record<string, unknown>>(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new APIError(
        'La petición tardó demasiado. Intenta de nuevo.',
        0,
        'TIMEOUT'
      );
    }
    throw new APIError(
      'No se pudo conectar con el servidor. Verifica tu conexión.',
      0,
      error instanceof Error ? error.message : 'NETWORK_ERROR'
    );
  }

  clearTimeout(timeoutId);

  // Check Content-Type before reading the body
  const contentType = response.headers.get('content-type') || '';
  const isJSON = contentType.includes('application/json');

  // If the response is not JSON (e.g., HTML error page from Next.js),
  // read it as text and throw a meaningful error
  if (!isJSON) {
    const text = await response.text().catch(() => '');
    // Detect Next.js dev error overlay or standard HTML error pages
    const isHTMLError = text.trim().startsWith('<!') || text.trim().startsWith('<html');

    if (response.status === 404) {
      throw new APIError(
        'El endpoint no fue encontrado. Puede que el servidor esté reiniciándose.',
        response.status,
        'ENDPOINT_NOT_FOUND'
      );
    }

    if (response.status >= 500) {
      throw new APIError(
        'El servidor tuvo un error interno. Intenta de nuevo en unos momentos.',
        response.status,
        isHTMLError ? 'SERVER_HTML_ERROR' : 'SERVER_ERROR'
      );
    }

    if (isHTMLError) {
      throw new APIError(
        'El servidor devolvió una respuesta inesperada. Puede que esté reiniciándose.',
        response.status,
        'UNEXPECTED_HTML'
      );
    }

    throw new APIError(
      'Respuesta inesperada del servidor.',
      response.status,
      'UNEXPECTED_CONTENT_TYPE'
    );
  }

  // Parse the JSON body
  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new APIError(
      'La respuesta del servidor no es JSON válido.',
      response.status,
      'JSON_PARSE_ERROR'
    );
  }

  // Check for API-level errors (response.ok is false but body is JSON)
  if (!response.ok) {
    const errorBody = data as Record<string, unknown>;
    const errorMessage = (errorBody?.error as string) || 'Error desconocido del servidor.';
    throw new APIError(errorMessage, response.status, 'API_ERROR');
  }

  return data;
}

/**
 * Sanitize items from AI responses.
 * The AI sometimes returns "null" as a string for equipSlot instead of actual null.
 * This fixes that and other common AI data issues.
 */
export function sanitizeAIItem(item: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...item };

  // Fix equipSlot: "null" string → undefined
  if (sanitized.equipSlot === 'null' || sanitized.equipSlot === '') {
    delete sanitized.equipSlot;
  }

  // Fix equipped: ensure boolean
  if (typeof sanitized.equipped === 'string') {
    sanitized.equipped = sanitized.equipped === 'true';
  }

  // Fix quantity: ensure number
  if (typeof sanitized.quantity !== 'number') {
    sanitized.quantity = parseInt(String(sanitized.quantity), 10) || 1;
  }

  // Fix weight: ensure number
  if (typeof sanitized.weight !== 'number') {
    sanitized.weight = parseFloat(String(sanitized.weight)) || 0;
  }

  // Fix value: ensure number
  if (typeof sanitized.value !== 'number') {
    sanitized.value = parseInt(String(sanitized.value), 10) || 0;
  }

  // Fix armorBonus: ensure number or undefined
  if (sanitized.armorBonus === 0 || sanitized.armorBonus === '0' || sanitized.armorBonus === '') {
    delete sanitized.armorBonus;
  }
  if (typeof sanitized.armorBonus === 'string') {
    sanitized.armorBonus = parseInt(sanitized.armorBonus, 10) || undefined;
  }

  return sanitized;
}

/**
 * Fix skill keys: the AI sometimes returns snake_case skill keys like
 * "sleight_of_hand" instead of the camelCase "sleightOfHand" our SKILL_MAP expects.
 */
function fixSkillKeys(skill: Record<string, unknown>): Record<string, unknown> {
  if (typeof skill.key === 'string' && skill.key.includes('_')) {
    // Convert snake_case key to camelCase
    skill.key = skill.key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
  return skill;
}

const VALID_REPUTATIONS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'allied'];

/**
 * Fix NPC reputation: the AI sometimes returns invalid values like "respetful"
 * that don't match our valid Reputation type.
 */
function fixNPCReputation(npc: Record<string, unknown>): Record<string, unknown> {
  if (typeof npc.reputation === 'string' && !VALID_REPUTATIONS.includes(npc.reputation)) {
    // Map common AI mistakes to valid values
    const reputationMap: Record<string, string> = {
      respectful: 'friendly',
      respetful: 'friendly',
      kind: 'friendly',
      warm: 'friendly',
      cold: 'unfriendly',
      hateful: 'hostile',
      enemy: 'hostile',
      ally: 'allied',
      unknown: 'neutral',
      indifferent: 'neutral',
    };
    npc.reputation = reputationMap[npc.reputation.toLowerCase()] || 'neutral';
  }
  return npc;
}

/**
 * Recursively sanitize AI response data (items, skills, etc.)
 */
export function sanitizeAIResponse(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };

  // Sanitize items in startingInventory / starting_inventory
  const inventoryKey = result.startingInventory ? 'startingInventory' : 'starting_inventory';
  const inventory = result[inventoryKey];
  if (Array.isArray(inventory)) {
    result[inventoryKey] = inventory.map(sanitizeAIItem);
  }

  // Sanitize skill keys in character data
  const character = result.character as Record<string, unknown> | undefined;
  if (character) {
    const skills = character.skills as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(skills)) {
      character.skills = skills.map(fixSkillKeys);
    }
  }

  // Sanitize NPC reputations in initialNPCs / initial_npcs
  const npcsKey = result.initialNPCs ? 'initialNPCs' : 'initial_npcs';
  const npcs = result[npcsKey];
  if (Array.isArray(npcs)) {
    result[npcsKey] = npcs.map(fixNPCReputation);
  }

  // Sanitize items in stateUpdates.inventory.addItems
  const stateUpdates = result.stateUpdates as Record<string, unknown> | undefined;
  if (stateUpdates) {
    const inv = stateUpdates.inventory as Record<string, unknown> | undefined;
    if (inv && Array.isArray(inv.addItems)) {
      inv.addItems = inv.addItems.map(sanitizeAIItem);
    }
    // Fix skill keys in character updates too
    const charUpdates = stateUpdates.character as Record<string, unknown> | undefined;
    if (charUpdates) {
      const skills = charUpdates.skills as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(skills)) {
        charUpdates.skills = skills.map(fixSkillKeys);
      }
    }
    // Fix NPC reputations in relations updates
    const relUpdates = stateUpdates.relations as Record<string, unknown> | undefined;
    if (relUpdates) {
      const addNPC = relUpdates.addNPC as Record<string, unknown> | undefined;
      if (addNPC) {
        fixNPCReputation(addNPC);
      }
    }
  }

  return result;
}
