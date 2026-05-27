'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/store/game-store';
import { getCombinedPenalties, isPermanentlyDead, canCharacterAct } from '@/lib/consequences';
import { getAllSkillTotals } from '@/lib/game-engine';
import { SKILL_MAP, type AbilityScore } from '@/lib/game-types';
import { X, Bug, ChevronDown, ChevronRight, Skull, Heart, Coins, Zap, Clock, Eye, AlertTriangle, Sparkles, Swords, Shield, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';

// --- Sections ---
type Section = 'state' | 'memory' | 'intentions' | 'engine' | 'time' | 'reputation' | 'parse' | 'tokens' | 'errors' | 'cheat';

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'state', label: 'Estado', icon: Heart },
  { id: 'memory', label: 'Memoria', icon: Eye },
  { id: 'intentions', label: 'Intenciones', icon: Zap },
  { id: 'engine', label: 'GameEngine', icon: Swords },
  { id: 'time', label: 'Tiempo', icon: Clock },
  { id: 'reputation', label: 'Reputación', icon: Shield },
  { id: 'parse', label: 'Parse Health', icon: AlertTriangle },
  { id: 'tokens', label: 'Tokens', icon: Sparkles },
  { id: 'errors', label: 'Errores', icon: AlertTriangle },
  { id: 'cheat', label: 'Cheat Menu', icon: Coins },
];

// --- Collapsible Section ---
function SectionBlock({ id, label, icon: Icon, defaultOpen = false, children }: {
  id: string; label: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-md">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Icon className="w-3 h-3 text-primary" />
        {label}
      </button>
      {open && <div className="px-3 pb-2 text-xs space-y-1">{children}</div>}
    </div>
  );
}

// --- JSON Viewer ---
function JsonView({ data, maxLen = 500 }: { data: unknown; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const truncated = !expanded && json.length > maxLen;
  return (
    <div className="font-mono text-[10px] bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
      {truncated ? json.slice(0, maxLen) + '...' : json}
      {truncated && (
        <button className="text-primary underline ml-1" onClick={() => setExpanded(true)}>expandir</button>
      )}
    </div>
  );
}

// --- Stat Row ---
function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={color || 'font-mono'}>{value}</span>
    </div>
  );
}

// --- Debug Diagnostics stored in window ---
// Type declarations are in src/types/debug.d.ts

// Initialize debug store
if (typeof window !== 'undefined' && !window.__TABERNA_DEBUG) {
  window.__TABERNA_DEBUG = { errors: [] };
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('state');

  const {
    game,
    worldMemory,
    updateCharacter,
    updateCurrency,
    levelUp,
    restCharacter,
    addItem,
    addChatMessage,
    getConsequenceState,
  } = useGameStore();

  const character = game.character;
  const narrative = game.narrative;
  const consequenceState = getConsequenceState();

  // Hook into chat component to capture diagnostics
  useEffect(() => {
    const origLog = console.log;
    const origError = console.error;

    console.log = (...args: unknown[]) => {
      origLog(...args);
      try {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (msg.includes('[Chat] Pipeline')) {
          // Next console.logs in the group will have pipeline data
        }
      } catch { /* ignore */ }
    };

    console.error = (...args: unknown[]) => {
      origError(...args);
      try {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        window.__TABERNA_DEBUG?.errors.push({ message: msg.slice(0, 200), timestamp: Date.now() });
        // Keep only last 20 errors
        if (window.__TABERNA_DEBUG && window.__TABERNA_DEBUG.errors.length > 20) {
          window.__TABERNA_DEBUG.errors = window.__TABERNA_DEBUG.errors.slice(-20);
        }
      } catch { /* ignore */ }
    };

    return () => {
      console.log = origLog;
      console.error = origError;
    };
  }, []);

  // --- Cheat Actions ---
  const cheatAddGold = (amount: number) => {
    updateCurrency({ gold: (game.inventory?.currency?.gold ?? 0) + amount });
    toast.success(`+${amount} oro (cheat)`);
  };

  const cheatAddXP = (amount: number) => {
    if (!character) return;
    const newXP = character.experience + amount;
    updateCharacter({ experience: newXP });
    toast.success(`+${amount} XP (cheat)`);
    // Check for level up
    if (newXP >= character.experienceToNext) {
      levelUp();
      toast.success('¡Subiste de nivel! (cheat)');
    }
  };

  const cheatFullHeal = () => {
    if (!character) return;
    updateCharacter({ currentHp: character.maxHp, temporaryHp: 0 });
    toast.success('HP restaurado (cheat)');
  };

  const cheatSetAbility = (ability: AbilityScore, value: number) => {
    if (!character) return;
    updateCharacter({
      abilityScores: { ...character.abilityScores, [ability]: value },
    });
    toast.success(`${ability} = ${value} (cheat)`);
  };

  const cheatAddItem = () => {
    addItem({
      id: `cheat_item_${Date.now()}`,
      name: 'Espada del Debug',
      description: 'Un arma imposible, forjada en los fuegos del desarrollo.',
      category: 'weapon',
      rarity: 'legendary',
      weight: 0,
      value: 99999,
      effect: 'Cheat weapon — daño máximo',
      equipped: false,
      damage: '10d6',
      damageType: 'slashing',
      quantity: 1,
    });
    toast.success('Item cheat añadido');
  };

  const cheatLevelUp = () => {
    levelUp();
    toast.success('Level up (cheat)');
  };

  const cheatLongRest = () => {
    restCharacter(true);
    toast.success('Long rest (cheat)');
  };

  const cheatClearWounds = () => {
    if (!game.consequenceState) return;
    // Wipe wounds and exhaustion by updating consequence state directly
    const cs = { ...game.consequenceState };
    cs.wounds = [];
    cs.exhaustion = { level: 0, causes: [], atDeathDoor: false };
    cs.hostilities = [];
    cs.failedQuests = [];
    useGameStore.setState(s => ({
      game: { ...s.game, consequenceState: cs },
    }));
    toast.success('Consecuencias limpiadas (cheat)');
  };

  const cheatDumpState = () => {
    const dump = JSON.stringify({ game, worldMemory, consequenceState }, null, 2);
    const blob = new Blob([dump], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `debug-dump-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('State dump descargado');
  };

  // --- Render Sections ---
  const renderSection = () => {
    switch (activeSection) {
      case 'state':
        return (
          <div className="space-y-3">
            <SectionBlock id="char" label="Personaje" icon={Heart} defaultOpen>
              {character ? (
                <>
                  <StatRow label="Nombre" value={character.name} />
                  <StatRow label="Raza / Clase" value={`${character.race} / ${character.class}`} />
                  <StatRow label="Nivel" value={character.level} />
                  <StatRow label="HP" value={`${character.currentHp} / ${character.maxHp}`} color={character.currentHp < character.maxHp / 2 ? 'text-red-500' : 'text-green-500'} />
                  <StatRow label="AC" value={character.armorClass} />
                  <StatRow label="XP" value={`${character.experience} / ${character.experienceToNext}`} />
                  <StatRow label="Moneda" value={`${game.inventory?.currency?.gold ?? 0}g ${game.inventory?.currency?.silver ?? 0}s ${game.inventory?.currency?.copper ?? 0}c`} />
                  <StatRow label="Condiciones" value={character.conditions?.length ? character.conditions.join(', ') : 'ninguna'} />
                  <StatRow label="Death Saves" value={`✓${character.deathSaves?.successes ?? 0} ✗${character.deathSaves?.failures ?? 0}`} />
                  <StatRow label="Muerto" value={isPermanentlyDead(consequenceState) ? 'SÍ' : 'No'} color={isPermanentlyDead(consequenceState) ? 'text-red-500' : undefined} />
                  <StatRow label="Puede actuar" value={canCharacterAct(consequenceState) ? 'Sí' : 'NO'} color={!canCharacterAct(consequenceState) ? 'text-red-500' : undefined} />
                </>
              ) : (
                <span className="text-muted-foreground">Sin personaje</span>
              )}
            </SectionBlock>

            <SectionBlock id="abilities" label="Ability Scores" icon={Zap}>
              {character ? (
                <>
                  {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as AbilityScore[]).map(a => (
                    <StatRow key={a} label={a} value={`${character.abilityScores[a]} (${Math.floor((character.abilityScores[a] - 10) / 2) >= 0 ? '+' : ''}${Math.floor((character.abilityScores[a] - 10) / 2)})`} />
                  ))}
                </>
              ) : null}
            </SectionBlock>

            <SectionBlock id="consequences-debug" label="Consecuencias" icon={Skull}>
              <StatRow label="Heridas activas" value={consequenceState.wounds?.length ?? 0} color={(consequenceState.wounds?.length ?? 0) > 0 ? 'text-orange-500' : undefined} />
              <StatRow label="Agotamiento" value={`${consequenceState.exhaustion?.level ?? 0}/6`} color={(consequenceState.exhaustion?.level ?? 0) >= 3 ? 'text-red-500' : undefined} />
              <StatRow label="Hostilidades" value={consequenceState.hostilities?.length ?? 0} />
              <StatRow label="Deudas" value={consequenceState.economy?.debts?.length ?? 0} />
              <StatRow label="Quests fallidos" value={consequenceState.failedQuests?.length ?? 0} />
              <StatRow label="Muertes" value={consequenceState.permadeath?.deathCount ?? 0} />
              <StatRow label="Estado" value={consequenceState.permadeath?.status ?? 'alive'} />
              <StatRow label="Permadeath" value={consequenceState.permadeath?.enabled ? 'ON' : 'OFF'} color={consequenceState.permadeath?.enabled ? 'text-red-500' : 'text-muted-foreground'} />
              {(() => {
                const penalties = getCombinedPenalties(consequenceState);
                const hasPenalties = penalties.woundMaxHpReduction !== 0 || penalties.woundAcPenalty !== 0 || penalties.exhaustionLevel > 0 || !penalties.canAct;
                return hasPenalties ? (
                  <div className="mt-1 p-1.5 bg-red-500/10 border border-red-500/20 rounded text-red-400">
                    {penalties.woundMaxHpReduction !== 0 && <div>Max HP reducido: -{penalties.woundMaxHpReduction}</div>}
                    {penalties.woundAcPenalty !== 0 && <div>CA penalizada: -{penalties.woundAcPenalty}</div>}
                    {penalties.exhaustionLevel > 0 && <div>Agotamiento: nivel {penalties.exhaustionLevel}</div>}
                    {penalties.exhaustionDisadvantageChecks && <div>Desventaja en checks</div>}
                    {penalties.exhaustionDisadvantageAttacksSaves && <div>Desventaja en ataques/salvaciones</div>}
                    {!penalties.canAct && <div>NO PUEDE ACTUAR</div>}
                  </div>
                ) : null;
              })()}
            </SectionBlock>

            <SectionBlock id="full-state" label="Estado completo (JSON)" icon={Eye}>
              <JsonView data={game} maxLen={800} />
            </SectionBlock>
          </div>
        );

      case 'memory':
        return (
          <div className="space-y-3">
            <SectionBlock id="mem-overview" label="Resumen" icon={Eye} defaultOpen>
              <StatRow label="Turno memoria" value={worldMemory.currentTurn} />
              <StatRow label="NPCs en memoria" value={worldMemory.npcMemories?.length ?? 0} />
              <StatRow label="Flags mundiales" value={worldMemory.worldFlags?.length ?? 0} />
              <StatRow label="Lugares descubiertos" value={worldMemory.discoveredLocations.length} />
              <StatRow label="Conflictos activos" value={worldMemory.activeConflicts.length} />
              <StatRow label="Promesas" value={worldMemory.promises?.length ?? 0} />
              <StatRow label="Registros de muerte" value={worldMemory.deaths?.length ?? 0} />
              <StatRow label="Eventos históricos" value={worldMemory.historicalEvents.length} />
              <StatRow label="Resumen comprimido" value={worldMemory.semanticSummary ? `${worldMemory.semanticSummary.length} chars` : 'N/A'} />
            </SectionBlock>

            <SectionBlock id="mem-npcs" label="Memorias NPC" icon={Eye}>
              {!worldMemory.npcMemories?.length ? (
                <span className="text-muted-foreground">Sin memorias de NPC</span>
              ) : (
                worldMemory.npcMemories.map((mem, i) => (
                  <div key={mem.id || i} className="border border-border/30 rounded p-1.5">
                    <div className="font-medium text-primary">{mem.npcId || mem.id}</div>
                    <div className="text-muted-foreground">{mem.description?.slice(0, 80) ?? 'Sin descripción'}</div>
                  </div>
                ))
              )}
            </SectionBlock>

            <SectionBlock id="mem-full" label="Memoria completa (JSON)" icon={Eye}>
              <JsonView data={worldMemory} maxLen={1000} />
            </SectionBlock>
          </div>
        );

      case 'intentions':
        return (
          <div className="space-y-3">
            <SectionBlock id="last-intentions" label="Últimas intenciones" icon={Zap} defaultOpen>
              {window.__TABERNA_DEBUG?.lastIntentions?.length ? (
                <JsonView data={window.__TABERNA_DEBUG.lastIntentions} maxLen={600} />
              ) : (
                <span className="text-muted-foreground">Sin intenciones registradas aún. Envía un mensaje al DM.</span>
              )}
            </SectionBlock>

            <SectionBlock id="last-resolutions" label="Resoluciones GameEngine" icon={Swords}>
              {window.__TABERNA_DEBUG?.lastResolutions?.length ? (
                window.__TABERNA_DEBUG.lastResolutions.map((r, i) => (
                  <div key={i} className={`border rounded p-1.5 ${r.success ? 'border-green-500/30' : 'border-red-500/30'}`}>
                    <div className="flex items-center gap-1">
                      <span className={r.success ? 'text-green-500' : 'text-red-500'}>{r.success ? '✓' : '✗'}</span>
                      <span className="font-medium">{(r.intention as Record<string, unknown>)?.type as string}</span>
                    </div>
                    <div className="text-muted-foreground">{r.resultText}</div>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">Sin resoluciones registradas</span>
              )}
            </SectionBlock>
          </div>
        );

      case 'engine':
        return (
          <div className="space-y-3">
            <SectionBlock id="engine-resolve" label="Resolución de intenciones" icon={Swords} defaultOpen>
              <p className="text-muted-foreground">
                Las intenciones se procesan a través de <code className="text-primary">resolveIntentions()</code> en GameEngine.
                Cada intención se resuelve independientemente: tirada de dados, cálculo de resultado, daño/curación, side effects.
              </p>
              <div className="mt-1 font-mono text-[10px] bg-muted/30 rounded p-2">
                <div>resolveIntentions(intentions, character) → IntentionsResolutionResult</div>
                <div className="mt-1 text-muted-foreground">→ diceRolls: DiceRoll[]</div>
                <div className="text-muted-foreground">→ resolutions: IntentionResolution[]</div>
                <div className="text-muted-foreground">→ stateUpdates: Partial&lt;GameState&gt;</div>
                <div className="text-muted-foreground">→ sideEffects: EngineSideEffect[]</div>
              </div>
            </SectionBlock>

            <SectionBlock id="engine-pipeline" label="Pipeline completo" icon={Zap}>
              <div className="font-mono text-[10px] space-y-0.5">
                <div>1. Player input → POST /api/dm</div>
                <div>2. LLM → {`{ narrative, intentions[] }`}</div>
                <div>3. Zod validation pipeline (5 etapas)</div>
                <div>4. processAIIntentions() → GameEngine.resolveIntentions()</div>
                <div>5. Consequence processing → RiskResolver</div>
                <div>6. State update → Zustand store</div>
                <div>7. DM message + dice rolls + resolutions → Chat</div>
              </div>
            </SectionBlock>

            <SectionBlock id="engine-skills" label="Skill Totals" icon={Zap}>
              {character ? (() => {
                const totals = getAllSkillTotals(character);
                return Object.entries(totals).map(([key, total]) => (
                  <StatRow key={key} label={(SKILL_MAP as Record<string, { name: string }>)[key]?.name ?? key} value={`${total >= 0 ? '+' : ''}${total}`} />
                ));
              })() : <span className="text-muted-foreground">Sin personaje</span>}
            </SectionBlock>
          </div>
        );

      case 'time':
        return (
          <div className="space-y-3">
            <SectionBlock id="time-current" label="Tiempo actual" icon={Clock} defaultOpen>
              <StatRow label="Ubicación" value={narrative.location} />
              <StatRow label="Hora" value={narrative.timeOfDay} />
              <StatRow label="Día" value={narrative.day} />
              <StatRow label="Turno" value={narrative.turn} />
            </SectionBlock>
          </div>
        );

      case 'reputation':
        return (
          <div className="space-y-3">
            <SectionBlock id="rep-npcs" label="Relaciones NPC" icon={Shield} defaultOpen>
              {game.relations?.length ? (
                game.relations.map(npc => (
                  <div key={npc.id} className="border border-border/30 rounded p-1.5">
                    <div className="flex justify-between">
                      <span className="font-medium">{npc.name}</span>
                      <span className={npc.reputation === 'hostile' ? 'text-red-500' : npc.reputation === 'friendly' ? 'text-green-500' : 'text-yellow-500'}>
                        {npc.reputation} ({npc.reputationScore})
                      </span>
                    </div>
                    {npc.alive === false && <span className="text-red-400 text-[10px]">MUERTO</span>}
                    <div className="text-muted-foreground text-[10px] truncate">{npc.lastInteraction}</div>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">Sin NPCs registrados</span>
              )}
            </SectionBlock>

            <SectionBlock id="rep-factions" label="Facciones" icon={Shield}>
              {worldMemory.factionRelations?.length ? (
                worldMemory.factionRelations.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{f.faction}</span>
                    <span className={f.standing < 0 ? 'text-red-500' : f.standing > 0 ? 'text-green-500' : ''}>{f.standing}</span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">Sin facciones</span>
              )}
            </SectionBlock>

            <SectionBlock id="rep-hostilities" label="Hostilidades" icon={Skull}>
              {consequenceState.hostilities?.length ? (
                consequenceState.hostilities.map((h, i) => (
                  <div key={i} className="border border-red-500/20 rounded p-1.5">
                    <div className="flex justify-between">
                      <span>{h.targetName || h.targetId}</span>
                      <span className="text-red-400">{h.attitude}</span>
                    </div>
                    <div className="text-muted-foreground text-[10px]">Nivel: {h.hostilityLevel} | Causas: {h.causes?.length ?? 0}</div>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">Sin hostilidades</span>
              )}
            </SectionBlock>
          </div>
        );

      case 'parse':
        return (
          <div className="space-y-3">
            <SectionBlock id="parse-pipeline" label="Pipeline de parseo" icon={AlertTriangle} defaultOpen>
              {window.__TABERNA_DEBUG?.lastPipeline ? (
                <>
                  <StatRow label="Etapa" value={window.__TABERNA_DEBUG.lastPipeline.stage} />
                  <StatRow label="Éxito" value={window.__TABERNA_DEBUG.lastPipeline.success ? '✓' : '✗'} color={window.__TABERNA_DEBUG.lastPipeline.success ? 'text-green-500' : 'text-red-500'} />
                  <StatRow label="Abortado" value={window.__TABERNA_DEBUG.lastPipeline.isAborted ? 'SÍ' : 'No'} color={window.__TABERNA_DEBUG.lastPipeline.isAborted ? 'text-red-500' : undefined} />
                  <StatRow label="Reintentos" value={window.__TABERNA_DEBUG.lastPipeline.retryCount} />
                  <StatRow label="Errores iniciales" value={window.__TABERNA_DEBUG.lastPipeline.initialErrorCount} />
                  <StatRow label="Pasos de reparación" value={window.__TABERNA_DEBUG.lastPipeline.repairSteps} />
                  <StatRow label="Timestamp" value={new Date(window.__TABERNA_DEBUG.lastPipeline.timestamp).toLocaleTimeString()} />
                </>
              ) : (
                <span className="text-muted-foreground">Sin datos de pipeline. Envía un mensaje al DM.</span>
              )}
            </SectionBlock>

            <SectionBlock id="parse-stages" label="5 Etapas del Pipeline" icon={AlertTriangle}>
              <div className="font-mono text-[10px] space-y-0.5">
                <div>1. <span className="text-blue-400">parse</span> — JSON.parse de la respuesta LLM</div>
                <div>2. <span className="text-yellow-400">validate</span> — Zod schema validation</div>
                <div>3. <span className="text-orange-400">retry</span> — Re-prompt LLM con errores</div>
                <div>4. <span className="text-purple-400">repair</span> — 7 estrategias de reparación</div>
                <div>5. <span className="text-red-400">abort</span> — Narrative genérica, sin intenciones</div>
              </div>
            </SectionBlock>
          </div>
        );

      case 'tokens':
        return (
          <div className="space-y-3">
            <SectionBlock id="token-estimate" label="Estimación de tokens" icon={Sparkles} defaultOpen>
              {window.__TABERNA_DEBUG?.lastContext ? (
                <>
                  <StatRow label="Tokens estimados" value={window.__TABERNA_DEBUG.lastContext.estimatedTokens} />
                  <StatRow label="Memorias seleccionadas" value={`${window.__TABERNA_DEBUG.lastContext.memorySelected} / ${window.__TABERNA_DEBUG.lastContext.memoryConsidered}`} />
                  <StatRow label="Resumen regenerado" value={window.__TABERNA_DEBUG.lastContext.summaryRegenerated ? 'Sí' : 'No'} />
                  <StatRow label="Compresión ejecutada" value={window.__TABERNA_DEBUG.lastContext.compressionRan ? 'Sí' : 'No'} />
                </>
              ) : (
                <span className="text-muted-foreground">Sin datos de contexto. Envía un mensaje al DM.</span>
              )}
            </SectionBlock>

            <SectionBlock id="token-state-size" label="Tamaño del estado" icon={Sparkles}>
              {(() => {
                const stateJson = JSON.stringify(game);
                const memoryJson = JSON.stringify(worldMemory);
                return (
                  <>
                    <StatRow label="GameState" value={`${(stateJson.length / 1024).toFixed(1)} KB`} />
                    <StatRow label="WorldMemory" value={`${(memoryJson.length / 1024).toFixed(1)} KB`} />
                    <StatRow label="Total" value={`${((stateJson.length + memoryJson.length) / 1024).toFixed(1)} KB`} />
                    <StatRow label="GameState chars" value={stateJson.length.toLocaleString()} />
                    <StatRow label="WorldMemory chars" value={memoryJson.length.toLocaleString()} />
                    <StatRow label="Est. tokens estado" value={`~${Math.ceil(stateJson.length / 4)}`} />
                    <StatRow label="Est. tokens memoria" value={`~${Math.ceil(memoryJson.length / 4)}`} />
                  </>
                );
              })()}
            </SectionBlock>
          </div>
        );

      case 'errors':
        return (
          <div className="space-y-3">
            <SectionBlock id="error-log" label="Últimos errores" icon={AlertTriangle} defaultOpen>
              {window.__TABERNA_DEBUG?.errors?.length ? (
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {window.__TABERNA_DEBUG.errors.slice().reverse().map((e, i) => (
                    <div key={i} className="border border-red-500/20 rounded p-1.5">
                      <div className="text-red-400 font-mono text-[10px] break-all">{e.message}</div>
                      <div className="text-muted-foreground text-[10px]">{new Date(e.timestamp).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-green-500">Sin errores recientes</span>
              )}
            </SectionBlock>
          </div>
        );

      case 'cheat':
        return (
          <div className="space-y-3">
            <SectionBlock id="cheat-gold" label="Oro" icon={Coins} defaultOpen>
              <div className="flex flex-wrap gap-1.5">
                {[10, 50, 100, 500, 1000].map(amt => (
                  <button key={amt} onClick={() => cheatAddGold(amt)}
                    className="px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded text-[10px] font-mono transition-colors">
                    +{amt}g
                  </button>
                ))}
              </div>
            </SectionBlock>

            <SectionBlock id="cheat-xp" label="Experiencia" icon={Zap}>
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 300, 500, 1000].map(amt => (
                  <button key={amt} onClick={() => cheatAddXP(amt)}
                    className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-[10px] font-mono transition-colors">
                    +{amt} XP
                  </button>
                ))}
              </div>
            </SectionBlock>

            <SectionBlock id="cheat-hp" label="Salud" icon={Heart}>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={cheatFullHeal}
                  className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-[10px] font-mono transition-colors">
                  Full Heal
                </button>
                <button onClick={cheatLongRest}
                  className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-[10px] font-mono transition-colors">
                  Long Rest
                </button>
              </div>
            </SectionBlock>

            <SectionBlock id="cheat-level" label="Nivel" icon={ArrowUp}>
              <button onClick={cheatLevelUp}
                className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-[10px] font-mono transition-colors">
                +1 Nivel
              </button>
            </SectionBlock>

            <SectionBlock id="cheat-abilities" label="Ability Scores" icon={Zap}>
              {character && (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as AbilityScore[]).map(ability => (
                <div key={ability} className="flex items-center gap-1.5 py-0.5">
                  <span className="w-24 text-muted-foreground">{ability.slice(0, 3).toUpperCase()}</span>
                  <span className="font-mono w-6">{character.abilityScores[ability]}</span>
                  {[12, 14, 16, 18, 20].map(val => (
                    <button key={val} onClick={() => cheatSetAbility(ability, val)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        character.abilityScores[ability] >= val ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground hover:bg-primary/10'
                      }`}>
                      {val}
                    </button>
                  ))}
                </div>
              ))}
            </SectionBlock>

            <SectionBlock id="cheat-items" label="Items" icon={Coins}>
              <button onClick={cheatAddItem}
                className="px-2 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-[10px] font-mono transition-colors">
                + Espada del Debug (10d6)
              </button>
            </SectionBlock>

            <SectionBlock id="cheat-consequences" label="Consecuencias" icon={Skull}>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={cheatClearWounds}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px] font-mono transition-colors">
                  Limpiar heridas/agonía
                </button>
              </div>
            </SectionBlock>

            <SectionBlock id="cheat-utility" label="Utilidad" icon={Sparkles}>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={cheatDumpState}
                  className="px-2 py-1 bg-muted/30 hover:bg-muted/50 text-foreground rounded text-[10px] font-mono transition-colors">
                  Exportar estado
                </button>
                <button onClick={() => {
                  if (confirm('¿Borrar TODO el estado local?')) {
                    localStorage.removeItem('taberna-del-viejo-greg');
                    window.location.reload();
                  }
                }}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px] font-mono transition-colors">
                  Reset completo
                </button>
              </div>
            </SectionBlock>
          </div>
        );
    }
  };

  // --- Toggle Button (always visible) ---
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-card border shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
        aria-label="Abrir panel debug"
        title="Debug Panel"
      >
        <Bug className="w-5 h-5 text-primary" />
      </button>
    );
  }

  // --- Panel ---
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[90vw] bg-card border-l shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-wide">DEBUG</span>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 hover:bg-accent rounded" aria-label="Cerrar debug">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex overflow-x-auto border-b shrink-0 px-1 gap-0.5 scrollbar-hide">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1 px-2 py-1.5 text-[10px] whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3 h-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {renderSection()}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t text-[9px] text-muted-foreground shrink-0">
        Taberna Debug v1.0 — {character?.name ?? 'Sin personaje'} — Turno {narrative.turn}
      </div>
    </div>
  );
}
