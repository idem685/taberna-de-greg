// ==========================================
// TABERNA DEL VIEJO GREG - Context Builder
// ==========================================
// Replaces sending full chat history to the LLM with:
//   1. Semantic summary of the campaign
//   2. Current game state
//   3. Contextually relevant memories
//
// This is the ONLY module that builds the LLM context message.
// It produces a compact, structured context that gives the LLM
// everything it needs without hundreds of messages of history.

import { type GameState } from '@/lib/game-types';
import {
  type WorldMemory,
  type MemoryQuery,
  createEmptyWorldMemory,
} from './types';
import { queryRelevantMemories, getNPCMemories, getActivePromises, getOutstandingDebts } from './memory-manager';
import { generateSemanticSummary, shouldRegenerateSummary, compressWorldMemory } from './compression';

// --- Token Budget Configuration ---

/** Maximum tokens for the entire context sent to the LLM */
const MAX_CONTEXT_TOKENS = 1200;

/** Token budget allocation (percentages) */
const BUDGET_ALLOCATION = {
  semanticSummary: 0.25,  // 25% — campaign overview
  currentState: 0.30,     // 30% — character, inventory, quests
  relevantMemories: 0.35, // 35% — context-specific memories
  recentEvents: 0.10,     // 10% — last few turns summary
} as const;

/** Estimate tokens (rough: 1 token ≈ 4 chars in Spanish) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate text to fit within a token budget */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + '...';
}

// --- Current State Builder ---

/**
 * Build a compact current state summary.
 * This replaces GameEngine.getContextSummary() with a more
 * token-efficient version.
 */
function buildCurrentStateContext(state: GameState): string {
  const parts: string[] = [];
  const char = state.character;
  const narrative = state.narrative;

  // Location & time
  parts.push(`📍 ${narrative.location} | ${narrative.timeOfDay} | Día ${narrative.day} | Turno ${narrative.turn}`);

  if (char) {
    // Character (compact)
    parts.push(`⚔️ ${char.name} (${char.race} ${char.class} Nv.${char.level}) | HP ${char.currentHp}/${char.maxHp} | CA ${char.armorClass} | XP ${char.experience}/${char.experienceToNext}`);
    if (char.conditions.length > 0) {
      parts.push(`⚠️ Condiciones: ${char.conditions.join(', ')}`);
    }
  }

  // Inventory (very compact — just key items)
  if (state.inventory.items.length > 0) {
    const weapon = state.inventory.equipment.weapon?.name ?? '-';
    const armor = state.inventory.equipment.armor?.name ?? '-';
    const gold = state.inventory.currency.gold;
    parts.push(`🎒 Arma: ${weapon} | Armadura: ${armor} | Oro: ${gold} | Objetos: ${state.inventory.items.length}`);
  }

  // Active quests (max 3 most relevant)
  const activeQuests = state.quests.filter(q => q.status === 'active').slice(0, 3);
  if (activeQuests.length > 0) {
    parts.push(`📜 Misiones: ${activeQuests.map(q => q.name).join(', ')}`);
  }

  // Known NPCs present (compact)
  if (state.relations.length > 0) {
    const npcsStr = state.relations
      .filter(n => n.alive)
      .slice(0, 5)
      .map(n => `${n.name}(${n.reputation[0].toUpperCase()})`)
      .join(', ');
    parts.push(`👥 PNJs: ${npcsStr}`);
  }

  return parts.join('\n');
}

// --- Recent Events Builder ---

/**
 * Build a summary of the last few turns from chat history.
 * This is the ONLY part where we look at recent messages,
 * and we only look at the last 3-4 DM messages for context.
 */
function buildRecentEventsContext(chatHistory: GameState['chatHistory']): string {
  const dmMessages = chatHistory
    .filter(m => m.role === 'dm')
    .slice(-3); // Only last 3 DM messages

  if (dmMessages.length === 0) return '';

  const parts: string[] = ['Últimos eventos:'];
  for (const msg of dmMessages) {
    // Truncate long messages to key content
    const content = msg.content.length > 200
      ? msg.content.substring(0, 197) + '...'
      : msg.content;
    parts.push(`- ${content}`);
  }

  return parts.join('\n');
}

// --- NPC Memory Context ---

/**
 * Build NPC-specific context for NPCs currently involved in the scene.
 * This is crucial for NPC consistency — they remember what happened.
 */
function buildNPCMemoryContext(
  memory: WorldMemory,
  npcIds: string[]
): string {
  if (npcIds.length === 0) return '';

  const parts: string[] = ['Lo que los PNJs recuerdan:'];

  for (const npcId of npcIds.slice(0, 5)) { // Max 5 NPCs
    const memories = getNPCMemories(memory, npcId);
    if (memories.length === 0) continue;

    // Summarize NPC memories compactly
    const favors = memories.filter(m => m.kind === 'favor' || m.kind === 'rescue' || m.kind === 'gift').length;
    const betrayals = memories.filter(m => m.kind === 'betrayal' || m.kind === 'threat' || m.kind === 'insult').length;
    const debts = memories.filter(m => m.kind === 'debt' && m.outstanding && !m.fulfilled);
    const promises = memories.filter(m => m.kind === 'promise' && m.outstanding && !m.fulfilled);

    let npcLine = `- ${npcId}: ${favors} favores, ${betrayals} conflictos`;
    if (debts.length > 0) {
      npcLine += `, ${debts.length} deudas pendientes`;
    }
    if (promises.length > 0) {
      npcLine += `, ${promises.length} promesas pendientes`;
    }

    // Add the most recent significant memory
    const significant = memories
      .filter(m => m.importance === 'critical' || m.importance === 'major')
      .sort((a, b) => b.turn - a.turn)[0];
    if (significant) {
      npcLine += ` | Último: ${significant.description}`;
    }

    parts.push(npcLine);
  }

  return parts.join('\n');
}

// --- Main Context Builder ---

export interface ContextBuildResult {
  /** The formatted context message for the LLM */
  contextMessage: string;
  /** Estimated total tokens */
  estimatedTokens: number;
  /** Breakdown by section */
  sections: {
    semanticSummary: { text: string; tokens: number };
    currentState: { text: string; tokens: number };
    relevantMemories: { text: string; tokens: number };
    recentEvents: { text: string; tokens: number };
  };
  /** Memory query details */
  memoryQuery: {
    totalConsidered: number;
    totalSelected: number;
    selectionLog: string[];
  };
  /** Whether the semantic summary was regenerated */
  summaryRegenerated: boolean;
  /** Compression stats if compression ran */
  compressionStats: { ran: boolean; entriesBefore: number; entriesAfter: number; tokensSaved: number } | null;
}

/**
 * Build the complete LLM context message.
 * This is the ONLY function that should be called to prepare
 * the context for the LLM. It replaces both:
 *   - GameEngine.getContextSummary() (replaced by currentState section)
 *   - chatHistory.slice(-20) (replaced by semanticSummary + recentEvents)
 *
 * @param state - Current game state
 * @param memory - World memory (persisted alongside game state)
 * @param playerMessage - The current player message
 * @param relevantNPCs - NPCs currently in the scene or mentioned
 * @returns Formatted context + diagnostics
 */
export function buildLLMContext(
  state: GameState,
  memory: WorldMemory,
  playerMessage: string,
  relevantNPCs: string[] = []
): ContextBuildResult {
  // --- 0. Auto-compress if needed ---
  let currentMemory = memory;
  let compressionStats: ContextBuildResult['compressionStats'] = null;

  const totalMemoryEntries = countMemoryEntries(memory);
  if (totalMemoryEntries > 50) {
    const result = compressWorldMemory(memory);
    currentMemory = result.memory;
    compressionStats = {
      ran: true,
      entriesBefore: result.stats.entriesBefore,
      entriesAfter: result.stats.entriesAfter,
      tokensSaved: result.stats.tokensSaved,
    };
  }

  // --- 1. Semantic Summary ---
  let semanticSummaryText = currentMemory.semanticSummary;
  let summaryRegenerated = false;

  if (shouldRegenerateSummary(currentMemory)) {
    semanticSummaryText = generateSemanticSummary(currentMemory);
    currentMemory = {
      ...currentMemory,
      semanticSummary: semanticSummaryText,
      semanticSummaryTurn: currentMemory.currentTurn,
      semanticSummaryTokens: estimateTokens(semanticSummaryText),
    };
    summaryRegenerated = true;
  }

  const summaryBudget = Math.floor(MAX_CONTEXT_TOKENS * BUDGET_ALLOCATION.semanticSummary);
  const semanticSummary = truncateToTokens(semanticSummaryText, summaryBudget);

  // --- 2. Current State ---
  const stateBudget = Math.floor(MAX_CONTEXT_TOKENS * BUDGET_ALLOCATION.currentState);
  const currentState = truncateToTokens(buildCurrentStateContext(state), stateBudget);

  // --- 3. Relevant Memories ---
  const memoryBudget = Math.floor(MAX_CONTEXT_TOKENS * BUDGET_ALLOCATION.relevantMemories);

  // Build memory query from player message + context
  const playerWords = playerMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const npcTags = relevantNPCs.map(id => id.toLowerCase());
  const locationTag = state.narrative.location.toLowerCase();

  const memoryQuery: MemoryQuery = {
    playerAction: playerMessage,
    location: state.narrative.location,
    relevantNPCs,
    tags: [...playerWords.slice(0, 10), ...npcTags, locationTag],
    maxTokens: memoryBudget,
    currentTurn: state.narrative.turn,
    includeSummaries: true,
  };

  const memoryResult = queryRelevantMemories(currentMemory, memoryQuery);

  // Add NPC-specific memory context
  const npcMemoryText = buildNPCMemoryContext(currentMemory, relevantNPCs);
  const combinedMemoryText = [memoryResult.contextText, npcMemoryText]
    .filter(Boolean)
    .join('\n\n');

  const relevantMemories = truncateToTokens(combinedMemoryText, memoryBudget);

  // --- 4. Recent Events ---
  const eventsBudget = Math.floor(MAX_CONTEXT_TOKENS * BUDGET_ALLOCATION.recentEvents);
  const recentEvents = truncateToTokens(buildRecentEventsContext(state.chatHistory), eventsBudget);

  // --- 5. Assemble final context ---
  const sections = {
    semanticSummary: { text: semanticSummary, tokens: estimateTokens(semanticSummary) },
    currentState: { text: currentState, tokens: estimateTokens(currentState) },
    relevantMemories: { text: relevantMemories, tokens: estimateTokens(relevantMemories) },
    recentEvents: { text: recentEvents, tokens: estimateTokens(recentEvents) },
  };

  const contextParts: string[] = [];
  if (semanticSummary) contextParts.push(semanticSummary);
  if (currentState) contextParts.push(`\n=== ESTADO ACTUAL ===\n${currentState}`);
  if (relevantMemories) contextParts.push(`\n${relevantMemories}`);
  if (recentEvents) contextParts.push(`\n=== EVENTOS RECIENTES ===\n${recentEvents}`);

  const contextMessage = contextParts.join('\n');
  const estimatedTokens = estimateTokens(contextMessage);

  return {
    contextMessage,
    estimatedTokens,
    sections,
    memoryQuery: {
      totalConsidered: memoryResult.totalConsidered,
      totalSelected: memoryResult.totalSelected,
      selectionLog: memoryResult.selectionLog,
    },
    summaryRegenerated,
    compressionStats,
  };
}

// --- Helper ---

function countMemoryEntries(memory: WorldMemory): number {
  return (
    memory.npcMemories.length +
    memory.worldFlags.length +
    memory.discoveredLocations.length +
    memory.playerReputation.length +
    memory.activeConflicts.length +
    memory.resolvedChoices.length +
    memory.factionRelations.length +
    memory.promises.length +
    memory.deaths.length +
    memory.historicalEvents.length
  );
}

/**
 * Extract NPC IDs that are relevant to the current scene.
 * This uses the game state's relations + mentions in chat.
 */
export function extractRelevantNPCs(state: GameState): string[] {
  const npcIds = new Set<string>();

  // All living NPCs in the current location
  for (const npc of state.relations) {
    if (npc.alive) {
      npcIds.add(npc.id);
    }
  }

  // NPCs mentioned in the last 5 messages
  const recentMessages = state.chatHistory.slice(-5);
  for (const msg of recentMessages) {
    for (const npc of state.relations) {
      if (msg.content.toLowerCase().includes(npc.name.toLowerCase())) {
        npcIds.add(npc.id);
      }
    }
  }

  return Array.from(npcIds);
}
