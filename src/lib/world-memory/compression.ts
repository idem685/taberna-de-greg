// ==========================================
// TABERNA DEL VIEJO GREG - Memory Compression
// ============================================
// Auto-compression for long campaigns.
// When memory grows too large, we compress older/less relevant
// entries into semantic summaries, preserving key facts while
// dramatically reducing token count.
//
// COMPRESSION STRATEGY:
// 1. Memories older than N turns are candidates for compression
// 2. Group candidates by topic (NPC, location, conflict, etc.)
// 3. For each group, produce a compressed summary
// 4. Replace the original entries with the summary
// 5. Mark compressed entries for exclusion from future queries
//
// COMPRESSION IS LOSSY BY DESIGN:
// - Specific details are lost, key facts are preserved
// - Emotional weight is preserved (important for NPC behavior)
// - Critical entries are NEVER compressed

import {
  type WorldMemory,
  type NPCMemory,
  type MemoryEntryBase,
  type CompressedSummary,
  type MemoryImportance,
  generateMemoryId,
} from './types';

// --- Configuration ---

/** Turn threshold: memories older than this are candidates for compression */
const COMPRESSION_AGE_THRESHOLD = 30; // turns

/** Minimum number of memories to trigger compression */
const COMPRESSION_MIN_ENTRIES = 50;

/** Target number of memories after compression */
const COMPRESSION_TARGET_ENTRIES = 30;

// --- Compression Entry Selection ---

/**
 * Determine which memories are candidates for compression.
 * Rules:
 * - Never compress critical entries
 * - Never compress entries from the last N turns
 * - Never compress outstanding promises/debts
 * - Prefer compressing trivial/minor entries
 * - Prefer compressing older entries
 */
function selectCompressionCandidates(memory: WorldMemory): MemoryEntryBase[] {
  const allEntries: MemoryEntryBase[] = [
    ...memory.npcMemories,
    ...memory.worldFlags,
    ...memory.discoveredLocations,
    ...memory.playerReputation,
    ...memory.activeConflicts,
    ...memory.resolvedChoices,
    ...memory.factionRelations,
    ...memory.promises,
    ...memory.deaths,
    ...memory.historicalEvents,
  ];

  return allEntries.filter(entry => {
    // Never compress critical entries
    if (entry.importance === 'critical') return false;
    // Never compress recent entries
    if (memory.currentTurn - entry.turn < COMPRESSION_AGE_THRESHOLD) return false;
    // Never compress already-compressed entries
    if (entry.compressed) return false;
    // Never compress outstanding promises/debts
    if ('outstanding' in entry && (entry as NPCMemory).outstanding) return false;
    if ('fulfilled' in entry && !(entry as NPCMemory).fulfilled && (entry as NPCMemory).outstanding) return false;

    return true;
  });
}

// --- Grouping ---

interface MemoryGroup {
  topic: string;
  entries: MemoryEntryBase[];
}

/**
 * Group memory entries by topic for coherent compression.
 * Each group will produce one compressed summary.
 */
function groupMemoriesForCompression(entries: MemoryEntryBase[]): MemoryGroup[] {
  const groups: Map<string, MemoryEntryBase[]> = new Map();

  for (const entry of entries) {
    let topic: string;

    if ('npcId' in entry) {
      topic = `npc_${(entry as NPCMemory).npcId}`;
    } else if ('key' in entry && 'value' in entry) {
      topic = 'world_flags';
    } else if ('visitCount' in entry) {
      topic = 'locations';
    } else if ('sphere' in entry) {
      topic = 'reputation';
    } else if ('parties' in entry) {
      topic = `conflict_${(entry as unknown as { name: string }).name}`;
    } else if ('chosenOption' in entry) {
      topic = 'choices';
    } else if ('faction' in entry) {
      topic = 'factions';
    } else if ('promisor' in entry) {
      topic = 'promises';
    } else if ('killedBy' in entry) {
      topic = 'deaths';
    } else if ('eventType' in entry) {
      topic = 'events';
    } else {
      topic = 'misc';
    }

    const existing = groups.get(topic) ?? [];
    existing.push(entry);
    groups.set(topic, existing);
  }

  return Array.from(groups.entries()).map(([topic, entries]) => ({ topic, entries }));
}

// --- Summary Generation ---

/**
 * Generate a compressed summary for a group of memories.
 * This is a deterministic text compression — no LLM involved.
 * It preserves key facts while discarding details.
 */
function generateGroupSummary(group: MemoryGroup): CompressedSummary {
  const turnRange = {
    start: Math.min(...group.entries.map(e => e.turn)),
    end: Math.max(...group.entries.map(e => e.turn)),
  };
  const dayRange = {
    start: Math.min(...group.entries.map(e => e.day)),
    end: Math.max(...group.entries.map(e => e.day)),
  };

  // Extract key facts based on entry type
  const keyFacts: string[] = [];
  const allTags: string[] = [];

  for (const entry of group.entries) {
    allTags.push(...entry.tags);

    if ('kind' in entry && 'npcId' in entry) {
      const npc = entry as NPCMemory;
      if (npc.outstanding && !npc.fulfilled) {
        keyFacts.push(`${npc.kind} pendiente con ${npc.npcId}: ${npc.description}`);
      } else {
        keyFacts.push(`${npc.kind} con ${npc.npcId}`);
      }
    } else if ('key' in entry) {
      const flag = entry as MemoryEntryBase & { key: string; value: boolean; description: string };
      keyFacts.push(`Flag ${flag.key}=${flag.value}`);
    } else if ('chosenOption' in entry) {
      const choice = entry as MemoryEntryBase & { choiceDescription: string; chosenOption: string };
      keyFacts.push(`Decisión: ${choice.choiceDescription} → ${choice.chosenOption}`);
    } else if ('faction' in entry) {
      const fac = entry as MemoryEntryBase & { faction: string; standing: number; attitude: string };
      keyFacts.push(`${fac.faction}: ${fac.attitude} (${fac.standing})`);
    } else if ('killedBy' in entry) {
      const death = entry as MemoryEntryBase & { name: string; killedBy: string };
      keyFacts.push(`Muerte: ${death.name} por ${death.killedBy}`);
    } else {
      // Generic description extraction
      if ('description' in entry) {
        const desc = (entry as MemoryEntryBase & { description: string }).description;
        keyFacts.push(desc.substring(0, 100));
      } else if ('name' in entry) {
        keyFacts.push((entry as MemoryEntryBase & { name: string }).name);
      }
    }
  }

  // Build the summary text
  const summaryParts: string[] = [];
  summaryParts.push(`[${group.topic}] Turnos ${turnRange.start}-${turnRange.end}, Días ${dayRange.start}-${dayRange.end}:`);
  for (const fact of keyFacts) {
    summaryParts.push(`  • ${fact}`);
  }

  const summary = summaryParts.join('\n');

  // Estimate tokens saved
  const originalTokens = group.entries.reduce((sum, e) => sum + Math.ceil(JSON.stringify(e).length / 4), 0);
  const compressedTokens = Math.ceil(summary.length / 4);

  return {
    id: generateMemoryId(),
    timestamp: Date.now(),
    turnRange,
    dayRange,
    summary,
    sourceMemoryIds: group.entries.map(e => e.id),
    keyFacts,
    tags: [...new Set(allTags)],
    compressedCount: group.entries.length,
    tokensSaved: Math.max(0, originalTokens - compressedTokens),
  };
}

// --- Main Compression Function ---

/**
 * Auto-compress world memory when it grows too large.
 * Returns a new WorldMemory with compressed entries replaced by summaries.
 *
 * @param memory - Current world memory
 * @param forceCompress - Force compression even if below threshold
 * @returns Compressed WorldMemory + stats
 */
export function compressWorldMemory(
  memory: WorldMemory,
  forceCompress: boolean = false
): { memory: WorldMemory; stats: CompressionStats } {
  const totalEntries = countTotalEntries(memory);

  // Check if compression is needed
  if (!forceCompress && totalEntries < COMPRESSION_MIN_ENTRIES) {
    return {
      memory,
      stats: {
        entriesBefore: totalEntries,
        entriesAfter: totalEntries,
        summariesCreated: 0,
        tokensSaved: 0,
        compressionRatio: 1,
      },
    };
  }

  // Select candidates
  const candidates = selectCompressionCandidates(memory);

  if (candidates.length === 0) {
    return {
      memory,
      stats: {
        entriesBefore: totalEntries,
        entriesAfter: totalEntries,
        summariesCreated: 0,
        tokensSaved: 0,
        compressionRatio: 1,
      },
    };
  }

  // Group and compress
  const groups = groupMemoriesForCompression(candidates);
  const summaries: CompressedSummary[] = [];
  const compressedIds = new Set<string>();
  let totalTokensSaved = 0;

  for (const group of groups) {
    // Only compress groups with 2+ entries (single entries are kept as-is)
    if (group.entries.length < 2) continue;

    const summary = generateGroupSummary(group);
    summaries.push(summary);

    for (const entry of group.entries) {
      compressedIds.add(entry.id);
    }

    totalTokensSaved += summary.tokensSaved;
  }

  // Mark compressed entries and add summaries
  const newMemory: WorldMemory = {
    ...memory,
    npcMemories: markCompressed(memory.npcMemories, compressedIds),
    worldFlags: markCompressed(memory.worldFlags, compressedIds),
    discoveredLocations: markCompressed(memory.discoveredLocations, compressedIds),
    playerReputation: markCompressed(memory.playerReputation, compressedIds),
    activeConflicts: markCompressed(memory.activeConflicts, compressedIds),
    resolvedChoices: markCompressed(memory.resolvedChoices, compressedIds),
    factionRelations: markCompressed(memory.factionRelations, compressedIds),
    promises: markCompressed(memory.promises, compressedIds),
    deaths: markCompressed(memory.deaths, compressedIds),
    historicalEvents: markCompressed(memory.historicalEvents, compressedIds),
    compressedSummaries: [...memory.compressedSummaries, ...summaries],
    updatedAt: Date.now(),
  };

  const entriesAfter = countTotalEntries(newMemory);

  console.group('[WorldMemory] Compression');
  console.log('Entries before:', totalEntries);
  console.log('Candidates:', candidates.length);
  console.log('Groups formed:', groups.length);
  console.log('Summaries created:', summaries.length);
  console.log('Entries after:', entriesAfter);
  console.log('Tokens saved:', totalTokensSaved);
  console.groupEnd();

  return {
    memory: newMemory,
    stats: {
      entriesBefore: totalEntries,
      entriesAfter,
      summariesCreated: summaries.length,
      tokensSaved: totalTokensSaved,
      compressionRatio: entriesAfter / totalEntries,
    },
  };
}

// --- Helpers ---

function markCompressed<T extends MemoryEntryBase>(
  entries: T[],
  compressedIds: Set<string>
): T[] {
  return entries.map(entry =>
    compressedIds.has(entry.id)
      ? { ...entry, compressed: true } as T
      : entry
  );
}

function countTotalEntries(memory: WorldMemory): number {
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

export interface CompressionStats {
  entriesBefore: number;
  entriesAfter: number;
  summariesCreated: number;
  tokensSaved: number;
  compressionRatio: number;
}

// --- Semantic Summary Generation ---

/**
 * Generate a full semantic summary of the campaign.
 * This replaces the entire chat history with a compressed narrative.
 * Called periodically (every N turns) or on-demand.
 *
 * This is DETERMINISTIC — no LLM involved. It reads the memory
 * structure and produces a structured summary.
 */
export function generateSemanticSummary(memory: WorldMemory): string {
  const parts: string[] = [];

  // Campaign overview
  parts.push(`=== RESUMEN DE CAMPAÑA (Día ${memory.currentDay}, Turno ${memory.currentTurn}) ===\n`);

  // Active conflicts
  if (memory.activeConflicts.length > 0) {
    parts.push('CONFLICTOS ACTIVOS:');
    for (const c of memory.activeConflicts) {
      parts.push(`- ${c.name} (intensidad ${c.intensity}/10): ${c.description}`);
    }
    parts.push('');
  }

  // Key choices made
  const majorChoices = memory.resolvedChoices.filter(c => c.importance === 'major' || c.importance === 'critical');
  if (majorChoices.length > 0) {
    parts.push('DECISIONES IMPORTANTES:');
    for (const c of majorChoices) {
      parts.push(`- ${c.choiceDescription} → Elegiste: ${c.chosenOption}`);
    }
    parts.push('');
  }

  // Outstanding promises
  const activePromises = memory.promises.filter(p => !p.fulfilled && !p.broken);
  if (activePromises.length > 0) {
    parts.push('PROMESAS PENDIENTES:');
    for (const p of activePromises) {
      parts.push(`- ${p.promisor} prometió a ${p.promisee}: ${p.content}`);
    }
    parts.push('');
  }

  // Outstanding debts
  const debts = memory.npcMemories.filter(m => m.kind === 'debt' && m.outstanding && !m.fulfilled);
  if (debts.length > 0) {
    parts.push('DEUDAS PENDIENTES:');
    for (const d of debts) {
      parts.push(`- ${d.description} (${d.npcId})`);
    }
    parts.push('');
  }

  // Notable NPC relationships (summarized)
  const npcGroups = new Map<string, NPCMemory[]>();
  for (const m of memory.npcMemories) {
    if (m.compressed) continue;
    const group = npcGroups.get(m.npcId) ?? [];
    group.push(m);
    npcGroups.set(m.npcId, group);
  }
  if (npcGroups.size > 0) {
    parts.push('RELACIONES CON PNJs (resumen):');
    for (const [npcId, memories] of npcGroups) {
      const favors = memories.filter(m => m.kind === 'favor' || m.kind === 'rescue').length;
      const betrayals = memories.filter(m => m.kind === 'betrayal' || m.kind === 'threat').length;
      const outstanding = memories.filter(m => m.outstanding && !m.fulfilled);
      const outStr = outstanding.length > 0 ? ` [${outstanding.length} asuntos pendientes]` : '';
      parts.push(`- ${npcId}: ${favors} favores, ${betrayals} conflictos${outStr}`);
    }
    parts.push('');
  }

  // Faction standings
  if (memory.factionRelations.length > 0) {
    parts.push('FACCIONES:');
    for (const f of memory.factionRelations) {
      parts.push(`- ${f.faction}: ${f.attitude} (${f.standing}/100)`);
    }
    parts.push('');
  }

  // Reputation spheres
  if (memory.playerReputation.length > 0) {
    parts.push('REPUTACIÓN:');
    for (const r of memory.playerReputation) {
      parts.push(`- ${r.sphere}: ${r.score}/100`);
    }
    parts.push('');
  }

  // Notable deaths
  const notableDeaths = memory.deaths.filter(d => d.importance === 'critical' || d.playerResponsible);
  if (notableDeaths.length > 0) {
    parts.push('MUERTES NOTABLES:');
    for (const d of notableDeaths) {
      parts.push(`- ${d.name} (${d.race}): ${d.causeOfDeath}${d.playerResponsible ? ' [TU RESPONSABILIDAD]' : ''}`);
    }
    parts.push('');
  }

  // Active world flags
  const activeFlags = memory.worldFlags.filter(f => f.value);
  if (activeFlags.length > 0) {
    parts.push('ESTADO DEL MUNDO:');
    for (const f of activeFlags) {
      parts.push(`- ${f.key}: ${f.description}`);
    }
    parts.push('');
  }

  // Compressed summaries (historical context)
  if (memory.compressedSummaries.length > 0) {
    parts.push('HISTORIAL COMPRIMIDO:');
    for (const s of memory.compressedSummaries) {
      parts.push(s.summary);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Check if semantic summary needs regeneration.
 * Regenerate every N turns or when significant events occur.
 */
export function shouldRegenerateSummary(memory: WorldMemory): boolean {
  // Regenerate every 10 turns
  if (memory.currentTurn - memory.semanticSummaryTurn >= 10) return true;
  // Regenerate if no summary exists
  if (!memory.semanticSummary) return true;
  return false;
}
