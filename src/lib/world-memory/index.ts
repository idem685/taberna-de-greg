// ==========================================
// TABERNA DEL VIEJO GREG - World Memory Module
// ==========================================
// Central export point for the entire world memory system.
// Import from '@/lib/world-memory' to access everything.

// Types
export type {
  WorldMemory,
  NPCMemory,
  WorldFlag,
  DiscoveredLocation,
  PlayerReputation,
  ActiveConflict,
  ResolvedChoice,
  FactionRelation,
  Promise,
  DeathRecord,
  HistoricalEvent,
  CompressedSummary,
  MemoryEntryBase,
  MemoryImportance,
  MemoryValence,
  NPCMemoryKind,
  MemoryQuery,
  MemoryQueryResult,
} from './types';

export { createEmptyWorldMemory, generateMemoryId } from './types';

// Memory Manager (CRUD + queries)
export {
  addNPCMemory,
  setWorldFlag,
  addDiscoveredLocation,
  updatePlayerReputation,
  addActiveConflict,
  addResolvedChoice,
  updateFactionRelation,
  addPromise,
  fulfillPromise,
  breakPromise,
  addDeathRecord,
  addHistoricalEvent,
  queryRelevantMemories,
  advanceMemoryTurn,
  getOverduePromises,
  getOutstandingDebts,
  getActivePromises,
  getNPCMemories,
  getWorldFlag,
  getLocationInfo,
} from './memory-manager';

// Compression
export {
  compressWorldMemory,
  generateSemanticSummary,
  shouldRegenerateSummary,
  type CompressionStats,
} from './compression';

// Context Builder
export {
  buildLLMContext,
  extractRelevantNPCs,
  type ContextBuildResult,
} from './context-builder';
