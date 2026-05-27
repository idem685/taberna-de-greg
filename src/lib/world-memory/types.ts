// ==========================================
// TABERNA DEL VIEJO GREG - World Memory Types
// ==========================================
// Persistent memory structures that track EVERYTHING the world
// needs to remember across turns. This replaces sending full
// chat history to the LLM with semantic, compressed context.
//
// DESIGN PRINCIPLE:
//   The LLM receives: semantic summary + current state + relevant memories
//   The LLM does NOT receive: raw chat history (100+ messages)
//   Memory is the source of truth for "what the world remembers"

// --- Memory Entry Base ---

/** Severity/importance of a memory entry (affects retention and retrieval) */
export type MemoryImportance = 'critical' | 'major' | 'normal' | 'minor' | 'trivial';

/** The emotional valence of a memory (affects NPC reactions) */
export type MemoryValence = 'positive' | 'negative' | 'neutral' | 'mixed';

/** Base shape shared by all memory entries */
export interface MemoryEntryBase {
  /** Unique ID for this memory */
  id: string;
  /** When this memory was created (game turn number) */
  turn: number;
  /** When this memory was created (game day) */
  day: number;
  /** Timestamp for real-time sorting */
  timestamp: number;
  /** How important this memory is (affects compression priority) */
  importance: MemoryImportance;
  /** Emotional valence (affects NPC behavior) */
  valence: MemoryValence;
  /** Tags for semantic retrieval (e.g., "combate", "goblin", "traición") */
  tags: string[];
  /** Whether this memory has been compressed/summarized */
  compressed: boolean;
  /** If compressed, reference to the summary that replaced it */
  compressedIntoId?: string;
}

// --- NPC Memories ---

/** Types of things NPCs remember about the player */
export type NPCMemoryKind =
  | 'favor'        // Player helped the NPC
  | 'betrayal'     // Player betrayed the NPC
  | 'debt'         // NPC owes player or vice versa
  | 'threat'       // Player threatened or was threatened
  | 'gift'         // Player gave something
  | 'promise'      // A promise was made (by either side)
  | 'insult'       // Player insulted the NPC
  | 'rescue'       // Player rescued the NPC
  | 'abandonment'  // Player abandoned the NPC in need
  | 'secret'       // Player learned a secret
  | 'quest_help'   // Player helped with a quest
  | 'trade';       // Player traded with NPC

/** A single memory an NPC has about the player */
export interface NPCMemory extends MemoryEntryBase {
  kind: NPCMemoryKind;
  /** The NPC who holds this memory */
  npcId: string;
  /** Human-readable description of what happened */
  description: string;
  /** How strongly the NPC feels about this (affects reputation decay) */
  emotionalWeight: number; // 1-10
  /** Whether this debt/promise is still outstanding */
  outstanding: boolean;
  /** Amount of debt if applicable */
  debtAmount?: number;
  /** What was promised if applicable */
  promiseText?: string;
  /** Whether the promise/debt has been fulfilled */
  fulfilled: boolean;
}

// --- World Flags ---

/** A world flag tracks a boolean state change in the world */
export interface WorldFlag extends MemoryEntryBase {
  /** The flag key (e.g., "tavern_mine_shaft_open", "met_king") */
  key: string;
  /** Current value */
  value: boolean;
  /** Human-readable description of what this flag means */
  description: string;
  /** Can this flag be reverted? */
  reversible: boolean;
}

// --- Discovered Locations ---

/** A location the player has visited or learned about */
export interface DiscoveredLocation extends MemoryEntryBase {
  /** Location name */
  name: string;
  /** Location description (first impression) */
  description: string;
  /** How the player discovered it */
  discoveryMethod: 'visited' | 'heard' | 'map' | 'quest';
  /** Number of times visited */
  visitCount: number;
  /** Last visit turn */
  lastVisitTurn: number;
  /** Whether the player knows secrets about this location */
  secretsKnown: string[];
  /** Connected locations */
  connections: string[];
}

// --- Player Reputation ---

/** The player's overall reputation in different spheres */
export interface PlayerReputation extends MemoryEntryBase {
  /** Sphere of reputation (e.g., "criminal", "heroic", "noble") */
  sphere: string;
  /** Current reputation score in this sphere (-100 to 100) */
  score: number;
  /** Notable deeds that built this reputation */
  notableDeeds: string[];
  /** Where this reputation is known */
  regions: string[];
}

// --- Active Conflicts ---

/** An ongoing conflict or tension */
export interface ActiveConflict extends MemoryEntryBase {
  /** Conflict name */
  name: string;
  /** Description of the conflict */
  description: string;
  /** Factions/parties involved */
  parties: string[];
  /** Player's stance (if any) */
  playerStance: 'ally_a' | 'ally_b' | 'neutral' | 'opposed_a' | 'opposed_b' | 'unknown';
  /** Intensity level (1-10) */
  intensity: number;
  /** Whether the conflict is escalating */
  escalating: boolean;
  /** Related quest IDs */
  relatedQuestIds: string[];
  /** Key events in this conflict */
  timeline: string[];
}

// --- Resolved Choices ---

/** A major choice the player made that had consequences */
export interface ResolvedChoice extends MemoryEntryBase {
  /** Description of the choice */
  choiceDescription: string;
  /** What the player chose */
  chosenOption: string;
  /** What the player rejected */
  rejectedOptions: string[];
  /** Consequences that followed */
  consequences: string[];
  /** Whether this choice can be revisited */
  reversible: boolean;
  /** NPCs affected by this choice */
  affectedNPCs: string[];
  /** Locations affected by this choice */
  affectedLocations: string[];
}

// --- Faction Relations ---

/** The player's relationship with a faction */
export interface FactionRelation extends MemoryEntryBase {
  /** Faction name */
  faction: string;
  /** Standing with the faction (-100 to 100) */
  standing: number;
  /** Faction's attitude toward player */
  attitude: 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';
  /** What the player has done for/against this faction */
  actions: string[];
  /** Faction's current goals */
  goals: string[];
  /** Key faction members the player knows */
  knownMembers: string[];
}

// --- Promises ---

/** A promise made between any parties (player↔NPC, NPC↔NPC) */
export interface Promise extends MemoryEntryBase {
  /** Who made the promise */
  promisor: string;
  /** Who the promise was made to */
  promisee: string;
  /** What was promised */
  content: string;
  /** Deadline turn (0 = no deadline) */
  deadlineTurn: number;
  /** Whether the promise has been fulfilled */
  fulfilled: boolean;
  /** Whether the promise has been broken */
  broken: boolean;
  /** Consequence of breaking (if known) */
  breakConsequence: string;
}

// --- Death Records (extends Book of Dead with memory context) ---

/** A death record with full memory context */
export interface DeathRecord extends MemoryEntryBase {
  /** Who died */
  name: string;
  /** Their race */
  race: string;
  /** Their role in the story */
  role: 'ally' | 'enemy' | 'neutral' | 'player';
  /** Cause of death */
  causeOfDeath: string;
  /** Location */
  location: string;
  /** Who/what killed them */
  killedBy: string;
  /** Whether the player was responsible */
  playerResponsible: boolean;
  /** Who mourns them */
  mournedBy: string[];
  /** Consequences of this death */
  consequences: string[];
  /** Whether anyone witnessed it */
  witnessed: boolean;
  /** Witnesses */
  witnesses: string[];
}

// --- Historical Events ---

/** A significant event that occurred in the world */
export interface HistoricalEvent extends MemoryEntryBase {
  /** Event name */
  name: string;
  /** Description */
  description: string;
  /** Event type */
  eventType: 'battle' | 'discovery' | 'political' | 'magical' | 'natural' | 'personal' | 'economic';
  /** Scale of impact */
  scale: 'personal' | 'local' | 'regional' | 'world';
  /** Who was involved */
  involvedParties: string[];
  /** Consequences */
  consequences: string[];
  /** Whether this event is widely known */
  widelyKnown: boolean;
  /** What locations were affected */
  affectedLocations: string[];
}

// --- Compressed Summary ---

/** A compressed summary that replaces multiple detailed memories */
export interface CompressedSummary {
  /** Unique ID */
  id: string;
  /** When this summary was created */
  timestamp: number;
  /** Turn range covered */
  turnRange: { start: number; end: number };
  /** Day range covered */
  dayRange: { start: number; end: number };
  /** The compressed narrative text */
  summary: string;
  /** IDs of memories that were compressed into this summary */
  sourceMemoryIds: string[];
  /** Key facts preserved from compression */
  keyFacts: string[];
  /** Tags inherited from source memories */
  tags: string[];
  /** Number of memories compressed */
  compressedCount: number;
  /** Tokens saved by compression (estimated) */
  tokensSaved: number;
}

// --- Complete World Memory ---

/** The entire world memory state — persisted alongside GameState */
export interface WorldMemory {
  /** Version for migration */
  version: number;
  /** Timestamp of last update */
  updatedAt: number;
  /** Current game turn (for memory queries) */
  currentTurn: number;
  /** Current game day */
  currentDay: number;

  // --- All memory collections ---
  npcMemories: NPCMemory[];
  worldFlags: WorldFlag[];
  discoveredLocations: DiscoveredLocation[];
  playerReputation: PlayerReputation[];
  activeConflicts: ActiveConflict[];
  resolvedChoices: ResolvedChoice[];
  factionRelations: FactionRelation[];
  promises: Promise[];
  deaths: DeathRecord[];
  historicalEvents: HistoricalEvent[];

  // --- Compressed summaries ---
  compressedSummaries: CompressedSummary[];

  // --- Semantic summary cache ---
  /** The latest semantic summary of the entire campaign */
  semanticSummary: string;
  /** When the semantic summary was last generated */
  semanticSummaryTurn: number;
  /** Estimated token count of the semantic summary */
  semanticSummaryTokens: number;
}

// --- Context Query ---

/** Parameters for querying relevant memories for LLM context */
export interface MemoryQuery {
  /** The current player action/message */
  playerAction: string;
  /** Current location */
  location: string;
  /** NPCs currently present or mentioned */
  relevantNPCs: string[];
  /** Tags to match (from intention analysis) */
  tags: string[];
  /** Maximum tokens to spend on memory context */
  maxTokens: number;
  /** Current game turn (for recency weighting) */
  currentTurn: number;
  /** Whether to include compressed summaries */
  includeSummaries: boolean;
}

/** Result of a memory query */
export interface MemoryQueryResult {
  /** The selected memories for context */
  entries: MemoryEntryBase[];
  /** The formatted text for LLM context */
  contextText: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** How many memories were considered */
  totalConsidered: number;
  /** How many were selected */
  totalSelected: number;
  /** Selection criteria applied */
  selectionLog: string[];
}

// --- Helper: Create empty WorldMemory ---

export function createEmptyWorldMemory(): WorldMemory {
  return {
    version: 1,
    updatedAt: Date.now(),
    currentTurn: 0,
    currentDay: 1,
    npcMemories: [],
    worldFlags: [],
    discoveredLocations: [],
    playerReputation: [],
    activeConflicts: [],
    resolvedChoices: [],
    factionRelations: [],
    promises: [],
    deaths: [],
    historicalEvents: [],
    compressedSummaries: [],
    semanticSummary: '',
    semanticSummaryTurn: 0,
    semanticSummaryTokens: 0,
  };
}

// --- Helper: Generate Memory ID ---

let memoryIdCounter = 0;
export function generateMemoryId(): string {
  memoryIdCounter++;
  return `mem_${Date.now()}_${memoryIdCounter}`;
}
