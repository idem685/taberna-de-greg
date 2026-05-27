// ==========================================
// TABERNA DEL VIEJO GREG - Memory Manager
// ==========================================
// CRUD operations + relevance-based querying for WorldMemory.
// This is the ONLY module that reads/writes the memory store.
// All mutations are immutable (return new WorldMemory).

import {
  type WorldMemory,
  type NPCMemory,
  type WorldFlag,
  type DiscoveredLocation,
  type PlayerReputation,
  type ActiveConflict,
  type ResolvedChoice,
  type FactionRelation,
  type Promise,
  type DeathRecord,
  type HistoricalEvent,
  type MemoryEntryBase,
  type MemoryQuery,
  type MemoryQueryResult,
  type MemoryImportance,
  type MemoryValence,
  type NPCMemoryKind,
  generateMemoryId,
  createEmptyWorldMemory,
} from './types';

// ============================================================
// CRUD — ADD operations
// ============================================================

/** Add an NPC memory */
export function addNPCMemory(
  memory: WorldMemory,
  params: {
    npcId: string;
    kind: NPCMemoryKind;
    description: string;
    importance?: MemoryImportance;
    valence?: MemoryValence;
    emotionalWeight?: number;
    tags?: string[];
    outstanding?: boolean;
    debtAmount?: number;
    promiseText?: string;
    fulfilled?: boolean;
  }
): WorldMemory {
  const entry: NPCMemory = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: params.importance ?? 'normal',
    valence: params.valence ?? (params.kind === 'favor' || params.kind === 'rescue' || params.kind === 'gift' ? 'positive' : params.kind === 'betrayal' || params.kind === 'threat' || params.kind === 'insult' ? 'negative' : 'neutral'),
    tags: params.tags ?? [params.kind, params.npcId],
    compressed: false,
    npcId: params.npcId,
    kind: params.kind,
    description: params.description,
    emotionalWeight: params.emotionalWeight ?? 5,
    outstanding: params.outstanding ?? (params.kind === 'debt' || params.kind === 'promise'),
    debtAmount: params.debtAmount,
    promiseText: params.promiseText,
    fulfilled: params.fulfilled ?? false,
  };

  return {
    ...memory,
    npcMemories: [...memory.npcMemories, entry],
    updatedAt: Date.now(),
  };
}

/** Set a world flag */
export function setWorldFlag(
  memory: WorldMemory,
  params: {
    key: string;
    value: boolean;
    description: string;
    importance?: MemoryImportance;
    reversible?: boolean;
    tags?: string[];
  }
): WorldMemory {
  // Update existing flag or create new one
  const existingIdx = memory.worldFlags.findIndex(f => f.key === params.key);
  const entry: WorldFlag = {
    id: existingIdx >= 0 ? memory.worldFlags[existingIdx].id : generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: params.importance ?? 'major',
    valence: 'neutral',
    tags: params.tags ?? ['flag', params.key],
    compressed: false,
    key: params.key,
    value: params.value,
    description: params.description,
    reversible: params.reversible ?? false,
  };

  const newFlags = existingIdx >= 0
    ? memory.worldFlags.map((f, i) => i === existingIdx ? entry : f)
    : [...memory.worldFlags, entry];

  return { ...memory, worldFlags: newFlags, updatedAt: Date.now() };
}

/** Add a discovered location */
export function addDiscoveredLocation(
  memory: WorldMemory,
  params: {
    name: string;
    description: string;
    discoveryMethod?: 'visited' | 'heard' | 'map' | 'quest';
    tags?: string[];
    connections?: string[];
    secretsKnown?: string[];
  }
): WorldMemory {
  const existing = memory.discoveredLocations.find(l => l.name === params.name);
  if (existing) {
    // Increment visit count
    const updated = {
      ...existing,
      visitCount: existing.visitCount + 1,
      lastVisitTurn: memory.currentTurn,
    };
    return {
      ...memory,
      discoveredLocations: memory.discoveredLocations.map(l => l.id === updated.id ? updated : l),
      updatedAt: Date.now(),
    };
  }

  const entry: DiscoveredLocation = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'normal',
    valence: 'neutral',
    tags: params.tags ?? ['location', params.name],
    compressed: false,
    name: params.name,
    description: params.description,
    discoveryMethod: params.discoveryMethod ?? 'visited',
    visitCount: 1,
    lastVisitTurn: memory.currentTurn,
    secretsKnown: params.secretsKnown ?? [],
    connections: params.connections ?? [],
  };

  return {
    ...memory,
    discoveredLocations: [...memory.discoveredLocations, entry],
    updatedAt: Date.now(),
  };
}

/** Update player reputation in a sphere */
export function updatePlayerReputation(
  memory: WorldMemory,
  params: {
    sphere: string;
    scoreDelta: number;
    deed: string;
    region?: string;
    tags?: string[];
  }
): WorldMemory {
  const existing = memory.playerReputation.find(r => r.sphere === params.sphere);
  if (existing) {
    const newScore = Math.max(-100, Math.min(100, existing.score + params.scoreDelta));
    const updated: PlayerReputation = {
      ...existing,
      score: newScore,
      notableDeeds: [...existing.notableDeeds, params.deed].slice(-10),
      regions: params.region && !existing.regions.includes(params.region)
        ? [...existing.regions, params.region]
        : existing.regions,
      timestamp: Date.now(),
    };
    return {
      ...memory,
      playerReputation: memory.playerReputation.map(r => r.id === updated.id ? updated : r),
      updatedAt: Date.now(),
    };
  }

  const entry: PlayerReputation = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'major',
    valence: params.scoreDelta >= 0 ? 'positive' : 'negative',
    tags: params.tags ?? ['reputation', params.sphere],
    compressed: false,
    sphere: params.sphere,
    score: Math.max(-100, Math.min(100, params.scoreDelta)),
    notableDeeds: [params.deed],
    regions: params.region ? [params.region] : [],
  };

  return {
    ...memory,
    playerReputation: [...memory.playerReputation, entry],
    updatedAt: Date.now(),
  };
}

/** Add or update an active conflict */
export function addActiveConflict(
  memory: WorldMemory,
  params: {
    name: string;
    description: string;
    parties: string[];
    playerStance?: ActiveConflict['playerStance'];
    intensity?: number;
    relatedQuestIds?: string[];
    tags?: string[];
  }
): WorldMemory {
  const entry: ActiveConflict = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'critical',
    valence: 'mixed',
    tags: params.tags ?? ['conflict', params.name, ...params.parties],
    compressed: false,
    name: params.name,
    description: params.description,
    parties: params.parties,
    playerStance: params.playerStance ?? 'unknown',
    intensity: params.intensity ?? 5,
    escalating: false,
    relatedQuestIds: params.relatedQuestIds ?? [],
    timeline: [params.description],
  };

  return {
    ...memory,
    activeConflicts: [...memory.activeConflicts, entry],
    updatedAt: Date.now(),
  };
}

/** Record a resolved choice */
export function addResolvedChoice(
  memory: WorldMemory,
  params: {
    choiceDescription: string;
    chosenOption: string;
    rejectedOptions: string[];
    consequences: string[];
    reversible?: boolean;
    affectedNPCs?: string[];
    affectedLocations?: string[];
    tags?: string[];
  }
): WorldMemory {
  const entry: ResolvedChoice = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'major',
    valence: 'mixed',
    tags: params.tags ?? ['choice', params.chosenOption],
    compressed: false,
    choiceDescription: params.choiceDescription,
    chosenOption: params.chosenOption,
    rejectedOptions: params.rejectedOptions,
    consequences: params.consequences,
    reversible: params.reversible ?? false,
    affectedNPCs: params.affectedNPCs ?? [],
    affectedLocations: params.affectedLocations ?? [],
  };

  return {
    ...memory,
    resolvedChoices: [...memory.resolvedChoices, entry],
    updatedAt: Date.now(),
  };
}

/** Add or update faction relation */
export function updateFactionRelation(
  memory: WorldMemory,
  params: {
    faction: string;
    standingDelta: number;
    action: string;
    attitude?: FactionRelation['attitude'];
    goals?: string[];
    knownMembers?: string[];
    tags?: string[];
  }
): WorldMemory {
  const existing = memory.factionRelations.find(f => f.faction === params.faction);
  if (existing) {
    const newStanding = Math.max(-100, Math.min(100, existing.standing + params.standingDelta));
    const attitude: FactionRelation['attitude'] =
      newStanding >= 50 ? 'allied' :
      newStanding >= 20 ? 'friendly' :
      newStanding >= -20 ? 'neutral' :
      newStanding >= -50 ? 'unfriendly' : 'hostile';

    const updated: FactionRelation = {
      ...existing,
      standing: newStanding,
      attitude,
      actions: [...existing.actions, params.action].slice(-15),
      goals: params.goals ?? existing.goals,
      knownMembers: params.knownMembers
        ? [...new Set([...existing.knownMembers, ...params.knownMembers])]
        : existing.knownMembers,
      timestamp: Date.now(),
    };
    return {
      ...memory,
      factionRelations: memory.factionRelations.map(f => f.id === updated.id ? updated : f),
      updatedAt: Date.now(),
    };
  }

  const standing = Math.max(-100, Math.min(100, params.standingDelta));
  const attitude: FactionRelation['attitude'] =
    standing >= 50 ? 'allied' :
    standing >= 20 ? 'friendly' :
    standing >= -20 ? 'neutral' :
    standing >= -50 ? 'unfriendly' : 'hostile';

  const entry: FactionRelation = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'major',
    valence: standing >= 0 ? 'positive' : 'negative',
    tags: params.tags ?? ['faction', params.faction],
    compressed: false,
    faction: params.faction,
    standing,
    attitude,
    actions: [params.action],
    goals: params.goals ?? [],
    knownMembers: params.knownMembers ?? [],
  };

  return {
    ...memory,
    factionRelations: [...memory.factionRelations, entry],
    updatedAt: Date.now(),
  };
}

/** Add a promise */
export function addPromise(
  memory: WorldMemory,
  params: {
    promisor: string;
    promisee: string;
    content: string;
    deadlineTurn?: number;
    breakConsequence?: string;
    tags?: string[];
  }
): WorldMemory {
  const entry: Promise = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'major',
    valence: 'neutral',
    tags: params.tags ?? ['promise', params.promisor, params.promisee],
    compressed: false,
    promisor: params.promisor,
    promisee: params.promisee,
    content: params.content,
    deadlineTurn: params.deadlineTurn ?? 0,
    fulfilled: false,
    broken: false,
    breakConsequence: params.breakConsequence ?? '',
  };

  return {
    ...memory,
    promises: [...memory.promises, entry],
    updatedAt: Date.now(),
  };
}

/** Fulfill a promise */
export function fulfillPromise(memory: WorldMemory, promiseId: string): WorldMemory {
  return {
    ...memory,
    promises: memory.promises.map(p =>
      p.id === promiseId ? { ...p, fulfilled: true, outstanding: false } : p
    ),
    updatedAt: Date.now(),
  };
}

/** Break a promise */
export function breakPromise(memory: WorldMemory, promiseId: string): WorldMemory {
  return {
    ...memory,
    promises: memory.promises.map(p =>
      p.id === promiseId ? { ...p, broken: true } : p
    ),
    updatedAt: Date.now(),
  };
}

/** Add a death record */
export function addDeathRecord(
  memory: WorldMemory,
  params: {
    name: string;
    race: string;
    role: DeathRecord['role'];
    causeOfDeath: string;
    location: string;
    killedBy: string;
    playerResponsible?: boolean;
    mournedBy?: string[];
    consequences?: string[];
    witnessed?: boolean;
    witnesses?: string[];
    tags?: string[];
  }
): WorldMemory {
  const entry: DeathRecord = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: 'critical',
    valence: params.playerResponsible ? 'negative' : 'neutral',
    tags: params.tags ?? ['death', params.name],
    compressed: false,
    name: params.name,
    race: params.race,
    role: params.role,
    causeOfDeath: params.causeOfDeath,
    location: params.location,
    killedBy: params.killedBy,
    playerResponsible: params.playerResponsible ?? false,
    mournedBy: params.mournedBy ?? [],
    consequences: params.consequences ?? [],
    witnessed: params.witnessed ?? false,
    witnesses: params.witnesses ?? [],
  };

  return {
    ...memory,
    deaths: [...memory.deaths, entry],
    updatedAt: Date.now(),
  };
}

/** Add a historical event */
export function addHistoricalEvent(
  memory: WorldMemory,
  params: {
    name: string;
    description: string;
    eventType: HistoricalEvent['eventType'];
    scale: HistoricalEvent['scale'];
    involvedParties: string[];
    consequences?: string[];
    widelyKnown?: boolean;
    affectedLocations?: string[];
    tags?: string[];
  }
): WorldMemory {
  const entry: HistoricalEvent = {
    id: generateMemoryId(),
    turn: memory.currentTurn,
    day: memory.currentDay,
    timestamp: Date.now(),
    importance: params.scale === 'world' ? 'critical' : params.scale === 'regional' ? 'major' : 'normal',
    valence: 'mixed',
    tags: params.tags ?? ['event', params.eventType, params.name],
    compressed: false,
    name: params.name,
    description: params.description,
    eventType: params.eventType,
    scale: params.scale,
    involvedParties: params.involvedParties,
    consequences: params.consequences ?? [],
    widelyKnown: params.widelyKnown ?? false,
    affectedLocations: params.affectedLocations ?? [],
  };

  return {
    ...memory,
    historicalEvents: [...memory.historicalEvents, entry],
    updatedAt: Date.now(),
  };
}

// ============================================================
// QUERIES — Relevance-based retrieval
// ============================================================

/** Score a memory entry for relevance to a query (0-100) */
function scoreRelevance(
  entry: MemoryEntryBase,
  query: MemoryQuery,
  extraKeywords?: string[]
): number {
  let score = 0;

  // 1. Tag overlap (0-40 points)
  const queryTags = [...query.tags, ...query.relevantNPCs, query.location.toLowerCase()];
  const playerWords = query.playerAction.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const allQueryTerms = [...queryTags, ...playerWords, ...(extraKeywords ?? [])];

  const entryTags = entry.tags.map(t => t.toLowerCase());
  let tagMatches = 0;
  for (const term of allQueryTerms) {
    if (entryTags.some(t => t.includes(term) || term.includes(t))) {
      tagMatches++;
    }
  }
  score += Math.min(40, tagMatches * 10);

  // 2. Importance weighting (0-25 points)
  const importanceScores: Record<MemoryImportance, number> = {
    critical: 25,
    major: 20,
    normal: 12,
    minor: 6,
    trivial: 2,
  };
  score += importanceScores[entry.importance];

  // 3. Recency (0-20 points) — recent memories score higher
  const turnAge = query.currentTurn - entry.turn;
  if (turnAge <= 2) score += 20;       // Last 2 turns
  else if (turnAge <= 5) score += 15;  // Last 5 turns
  else if (turnAge <= 10) score += 10; // Last 10 turns
  else if (turnAge <= 30) score += 5;  // Last 30 turns

  // 4. Emotional valence (0-15 points) — strong emotions are more relevant
  const valenceBoost: Record<MemoryValence, number> = {
    positive: 8,
    negative: 15, // Negative memories are more salient (psychological realism)
    neutral: 3,
    mixed: 10,
  };
  score += valenceBoost[entry.valence];

  // 5. Compressed entries get a penalty (they're less detailed)
  if (entry.compressed) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/** Estimate token count for a text string (rough: 1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Format a memory entry for LLM context */
function formatMemoryEntry(entry: MemoryEntryBase, memory: WorldMemory): string {
  // Find the entry in the appropriate collection and format it
  if ('kind' in entry && 'npcId' in entry) {
    const npc = entry as NPCMemory;
    const status = npc.outstanding ? ' [PENDIENTE]' : npc.fulfilled ? ' [CUMPLIDO]' : '';
    return `- (${npc.kind}) con ${npc.npcId}: ${npc.description}${status}`;
  }
  if ('key' in entry && 'value' in entry) {
    const flag = entry as WorldFlag;
    return `- Flag [${flag.key}]: ${flag.value ? 'ACTIVO' : 'INACTIVO'} — ${flag.description}`;
  }
  if ('name' in entry && 'visitCount' in entry) {
    const loc = entry as DiscoveredLocation;
    return `- Lugar: ${loc.name} (visitas: ${loc.visitCount}) — ${loc.description}`;
  }
  if ('sphere' in entry) {
    const rep = entry as PlayerReputation;
    return `- Reputación (${rep.sphere}): ${rep.score}/100 — Último: ${rep.notableDeeds[rep.notableDeeds.length - 1] ?? 'N/A'}`;
  }
  if ('parties' in entry) {
    const conflict = entry as ActiveConflict;
    return `- Conflicto: ${conflict.name} (intensidad ${conflict.intensity}/10) — ${conflict.description}`;
  }
  if ('chosenOption' in entry) {
    const choice = entry as ResolvedChoice;
    return `- Decisión: ${choice.choiceDescription} → Elegiste: ${choice.chosenOption}`;
  }
  if ('faction' in entry) {
    const fac = entry as FactionRelation;
    return `- Facción (${fac.faction}): ${fac.attitude} (${fac.standing}/100)`;
  }
  if ('promisor' in entry) {
    const prom = entry as Promise;
    const status = prom.fulfilled ? '[CUMPLIDA]' : prom.broken ? '[ROTA]' : '[PENDIENTE]';
    return `- Promesa ${status}: ${prom.promisor} → ${prom.promisee}: ${prom.content}`;
  }
  if ('killedBy' in entry) {
    const death = entry as DeathRecord;
    return `- Muerte: ${death.name} (${death.race}) — ${death.causeOfDeath}${death.playerResponsible ? ' [CAUSADA POR TI]' : ''}`;
  }
  if ('eventType' in entry) {
    const event = entry as HistoricalEvent;
    return `- Evento (${event.eventType}/${event.scale}): ${event.name} — ${event.description}`;
  }
  return `- [Memoria sin formato]`;
}

/**
 * Query the world memory for context-relevant entries.
 * This is the main retrieval function for building LLM context.
 *
 * SELECTION ALGORITHM:
 * 1. Score every memory for relevance to the current situation
 * 2. Sort by score (descending)
 * 3. Select entries until maxTokens budget is exhausted
 * 4. Always include: critical memories, outstanding promises/debts
 * 5. Format selected entries as text for LLM consumption
 */
export function queryRelevantMemories(
  memory: WorldMemory,
  query: MemoryQuery
): MemoryQueryResult {
  const selectionLog: string[] = [];
  const allEntries: MemoryEntryBase[] = [];

  // Gather all entries
  allEntries.push(...memory.npcMemories);
  allEntries.push(...memory.worldFlags);
  allEntries.push(...memory.discoveredLocations);
  allEntries.push(...memory.playerReputation);
  allEntries.push(...memory.activeConflicts);
  allEntries.push(...memory.resolvedChoices);
  allEntries.push(...memory.factionRelations);
  allEntries.push(...memory.promises.filter(p => !p.fulfilled && !p.broken)); // Only active promises
  allEntries.push(...memory.deaths);
  allEntries.push(...memory.historicalEvents);

  // Score every entry
  const scored = allEntries.map(entry => ({
    entry,
    score: scoreRelevance(entry, query),
  }));

  // Always include: critical + outstanding
  const mustInclude = scored.filter(s =>
    s.entry.importance === 'critical' ||
    ('outstanding' in s.entry && (s.entry as NPCMemory).outstanding) ||
    ('fulfilled' in s.entry && !(s.entry as Promise).fulfilled && !(s.entry as Promise).broken)
  );

  // Sort rest by score
  const restByScore = scored
    .filter(s => !mustInclude.includes(s))
    .sort((a, b) => b.score - a.score);

  selectionLog.push(`Total memories: ${allEntries.length}`);
  selectionLog.push(`Must-include (critical/outstanding): ${mustInclude.length}`);

  // Select entries within token budget
  const selected: MemoryEntryBase[] = [];
  let tokensUsed = 0;
  const maxTokens = query.maxTokens;

  // Add must-include first
  for (const s of mustInclude) {
    const text = formatMemoryEntry(s.entry, memory);
    const tokens = estimateTokens(text);
    if (tokensUsed + tokens <= maxTokens) {
      selected.push(s.entry);
      tokensUsed += tokens;
    } else {
      selectionLog.push(`Must-include entry skipped (budget): ${s.entry.id}`);
    }
  }

  // Add score-ranked entries until budget exhausted
  for (const s of restByScore) {
    if (s.score < 10) continue; // Skip irrelevant entries
    const text = formatMemoryEntry(s.entry, memory);
    const tokens = estimateTokens(text);
    if (tokensUsed + tokens <= maxTokens) {
      selected.push(s.entry);
      tokensUsed += tokens;
    } else {
      break; // Budget exhausted
    }
  }

  // Format the context text
  const contextParts: string[] = [];
  for (const entry of selected) {
    contextParts.push(formatMemoryEntry(entry, memory));
  }

  const contextText = contextParts.length > 0
    ? `=== MEMORIA DEL MUNDO ===\n${contextParts.join('\n')}\n=== FIN MEMORIA ===`
    : '';

  selectionLog.push(`Selected: ${selected.length}/${allEntries.length}, tokens: ${tokensUsed}/${maxTokens}`);

  return {
    entries: selected,
    contextText,
    estimatedTokens: tokensUsed,
    totalConsidered: allEntries.length,
    totalSelected: selected.length,
    selectionLog,
  };
}

// ============================================================
// UTILITY — Update turn/day tracking
// ============================================================

/** Advance the memory's turn/day tracking */
export function advanceMemoryTurn(memory: WorldMemory, turn: number, day: number): WorldMemory {
  return {
    ...memory,
    currentTurn: turn,
    currentDay: day,
    updatedAt: Date.now(),
  };
}

/** Check unfulfilled promises for deadlines */
export function getOverduePromises(memory: WorldMemory): Promise[] {
  return memory.promises.filter(p =>
    !p.fulfilled && !p.broken && p.deadlineTurn > 0 && memory.currentTurn > p.deadlineTurn
  );
}

/** Get all outstanding debts (NPC owes player or player owes NPC) */
export function getOutstandingDebts(memory: WorldMemory): NPCMemory[] {
  return memory.npcMemories.filter(m =>
    m.kind === 'debt' && m.outstanding && !m.fulfilled
  );
}

/** Get all active promises */
export function getActivePromises(memory: WorldMemory): Promise[] {
  return memory.promises.filter(p => !p.fulfilled && !p.broken);
}

/** Get NPC-specific memories (for NPC reaction context) */
export function getNPCMemories(memory: WorldMemory, npcId: string): NPCMemory[] {
  return memory.npcMemories.filter(m =>
    m.npcId === npcId || m.tags.includes(npcId)
  );
}

/** Get world flag value */
export function getWorldFlag(memory: WorldMemory, key: string): boolean | undefined {
  const flag = memory.worldFlags.find(f => f.key === key);
  return flag?.value;
}

/** Get location info */
export function getLocationInfo(memory: WorldMemory, name: string): DiscoveredLocation | undefined {
  return memory.discoveredLocations.find(l => l.name === name);
}
