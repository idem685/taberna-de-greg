'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import {
  GameState,
  Character,
  Quest,
  NPC,
  Monster,
  DeathEntry,
  ChatMessage,
  StateUpdates,
  Item,
  Equipment,
  Currency,
  Intention,
  IntentionResolution,
  DiceRoll,
} from '@/lib/game-types';
import { GameEngine, type EngineSideEffect, resolveIntentions, type IntentionsResolutionResult } from '@/lib/game-engine';
import {
  processConsequences,
  processRestConsequences,
  getCombinedPenalties,
  isPermanentlyDead,
  canCharacterAct,
  setPermadeathEnabled,
  configureResurrection,
  processDeath as processPermdeath,
  type ConsequenceState,
  type ConsequenceProcessingResult,
  createDefaultConsequenceState,
} from '@/lib/consequences';
import {
  type WorldMemory,
  type NPCMemoryKind,
  createEmptyWorldMemory,
  addNPCMemory,
  addDiscoveredLocation,
  addResolvedChoice,
  addDeathRecord as addDeathMemory,
  addHistoricalEvent,
  setWorldFlag,
  updatePlayerReputation,
  updateFactionRelation,
  addActiveConflict,
  addPromise,
  fulfillPromise,
  breakPromise,
  advanceMemoryTurn,
  getActivePromises,
  getOutstandingDebts,
  getOverduePromises,
} from '@/lib/world-memory';

/**
 * Process engine side effects (toasts, logs).
 * This is the bridge between GameEngine (pure logic) and the UI layer.
 */
function processSideEffects(effects?: EngineSideEffect[]): void {
  if (!effects) return;
  for (const effect of effects) {
    switch (effect.type) {
      case 'log':
        console.log(`[GameEngine] ${effect.payload}`);
        break;
    }
  }
}

// --- Store Interface ---

interface GameStore {
  // Current game state
  game: GameState;

  // World memory — persists alongside game state
  worldMemory: WorldMemory;

  // Multiple save slots
  saves: { id: string; name: string; updatedAt: number }[];

  // UI State
  activeTab: string;
  isCharacterCreated: boolean;
  isLoading: boolean;

  // Actions - Game Management
  newGame: (name?: string) => void;
  loadGame: (id: string) => void;
  saveCurrentGame: () => void;
  deleteGame: (id: string) => void;

  // Actions - Character (all delegated to GameEngine)
  setCharacter: (character: Character) => void;
  updateCharacter: (updates: Partial<Character>) => void;
  levelUp: (abilityImprovements?: Partial<Record<string, number>>) => EngineSideEffect[] | undefined;
  restCharacter: (longRest: boolean) => EngineSideEffect[] | undefined;

  // Actions - Inventory (all delegated to GameEngine)
  addItem: (item: Item) => EngineSideEffect[] | undefined;
  removeItem: (itemId: string) => void;
  equipItem: (itemId: string) => void;
  unequipItem: (slot: keyof Equipment) => void;
  consumeItem: (itemId: string) => EngineSideEffect[] | undefined;
  updateCurrency: (updates: Partial<Currency>) => void;

  // Actions - Quests (all delegated to GameEngine)
  addQuest: (quest: Quest) => void;
  updateQuest: (questId: string, updates: Partial<Quest>) => void;
  completeQuest: (questId: string) => EngineSideEffect[] | undefined;
  followQuest: (questId: string) => void;

  // Actions - Relations (all delegated to GameEngine)
  addNPC: (npc: NPC) => void;
  updateNPC: (npcId: string, updates: Partial<NPC>) => void;

  // Actions - Bestiary (all delegated to GameEngine)
  discoverMonster: (monster: Monster) => void;
  updateMonster: (monsterId: string, updates: Partial<Monster>) => void;
  incrementDefeat: (monsterId: string) => void;

  // Actions - Book of Dead (all delegated to GameEngine)
  addDeathEntry: (entry: DeathEntry) => void;
  updateDeathEntry: (entryId: string, updates: Partial<DeathEntry>) => void;

  // Actions - Chat (all delegated to GameEngine)
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;

  // Actions - AI State Updates (all delegated to GameEngine)
  applyStateUpdates: (updates: StateUpdates) => void;

  // Actions - AI Intention Processing (NEW PIPELINE)
  processAIIntentions: (intentions: Intention[], narrative: string) => IntentionsResolutionResult;

  // Actions - Narrative (all delegated to GameEngine)
  updateNarrative: (updates: Partial<GameState['narrative']>) => void;

  // Actions - World Memory
  recordNPCInteraction: (npcId: string, kind: NPCMemoryKind, description: string, opts?: { emotionalWeight?: number; outstanding?: boolean; promiseText?: string }) => void;
  recordWorldFlag: (key: string, value: boolean, description: string) => void;
  recordDiscoveredLocation: (name: string, description: string, method?: 'visited' | 'heard' | 'map' | 'quest') => void;
  recordPlayerChoice: (choiceDescription: string, chosenOption: string, rejectedOptions: string[], consequences: string[]) => void;
  recordDeathMemory: (params: { name: string; race: string; role: 'ally' | 'enemy' | 'neutral' | 'player'; causeOfDeath: string; location: string; killedBy: string; playerResponsible?: boolean }) => void;
  recordHistoricalEvent: (params: { name: string; description: string; eventType: 'battle' | 'discovery' | 'political' | 'magical' | 'natural' | 'personal' | 'economic'; scale: 'personal' | 'local' | 'regional' | 'world'; involvedParties: string[] }) => void;
  recordReputation: (sphere: string, delta: number, deed: string, region?: string) => void;
  recordFactionAction: (faction: string, standingDelta: number, action: string) => void;
  recordConflict: (name: string, description: string, parties: string[], intensity?: number) => void;
  recordPromise: (promisor: string, promisee: string, content: string, deadlineTurn?: number) => void;

  // Actions - Consequences
  enablePermadeath: (enabled: boolean) => void;
  setMaxResurrections: (max: number) => void;
  getConsequenceState: () => ConsequenceState;

  // Actions - UI
  setActiveTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;

  // Actions - Export/Import
  exportGame: () => string;
  importGame: (json: string) => boolean;
}

// --- Store ---

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      game: GameEngine.createDefaultGameState(),
      worldMemory: createEmptyWorldMemory(),
      saves: [],
      activeTab: 'chat',
      isCharacterCreated: false,
      isLoading: false,

      // --- Game Management ---

      newGame: (name?: string) => {
        const currentGame = get().game;
        const currentSaves = get().saves;
        const existingSave = currentSaves.find(s => s.id === currentGame.id);
        let updatedSaves = currentSaves;
        if (!existingSave && get().isCharacterCreated) {
          updatedSaves = [...currentSaves, {
            id: currentGame.id,
            name: currentGame.name,
            updatedAt: currentGame.updatedAt,
          }];
        }

        const newGameState = GameEngine.createDefaultGameState();
        if (name) newGameState.name = name;
        set({
          game: newGameState,
          worldMemory: createEmptyWorldMemory(),
          saves: updatedSaves,
          isCharacterCreated: false,
          activeTab: 'chat',
        });
      },

      loadGame: (id: string) => {
        const state = get();
        if (state.game.id === id) return;

        const currentSaves = state.saves;
        const existingSave = currentSaves.find(s => s.id === state.game.id);
        let updatedSaves = currentSaves;
        if (!existingSave && state.isCharacterCreated) {
          updatedSaves = [...currentSaves, {
            id: state.game.id,
            name: state.game.name,
            updatedAt: state.game.updatedAt,
          }];
        }

        try {
          const savesMapStr = localStorage.getItem('taberna-saves-map');
          if (savesMapStr) {
            const savesMap = JSON.parse(savesMapStr) as Record<string, { game: GameState; worldMemory?: WorldMemory }>;
            if (savesMap[id]) {
              const gameData = savesMap[id];
              // Validate loaded state through GameEngine
              const result = GameEngine.validateAndSanitizeSave(gameData.game);
              const worldMemory = gameData.worldMemory ?? createEmptyWorldMemory();
              if (result.success) {
                set({
                  game: result.state,
                  worldMemory,
                  saves: updatedSaves,
                  isCharacterCreated: !!result.state.character,
                  activeTab: 'chat',
                });
                return;
              }
              console.warn('Save validation failed, loading anyway');
              set({
                game: gameData.game,
                worldMemory,
                saves: updatedSaves,
                isCharacterCreated: !!gameData.game.character,
                activeTab: 'chat',
              });
              return;
            }
          }
        } catch (e) {
          console.error('Error loading game:', e);
        }

        console.warn(`Game with id ${id} not found in saves map`);
      },

      saveCurrentGame: () => {
        const state = get();
        try {
          const savesMapStr = localStorage.getItem('taberna-saves-map');
          const savesMap = savesMapStr ? JSON.parse(savesMapStr) as Record<string, { game: GameState; worldMemory: WorldMemory }> : {};
          savesMap[state.game.id] = {
            game: state.game,
            worldMemory: state.worldMemory,
          };
          localStorage.setItem('taberna-saves-map', JSON.stringify(savesMap));

          const existingSaves = state.saves;
          const existingIdx = existingSaves.findIndex(s => s.id === state.game.id);
          const saveEntry = { id: state.game.id, name: state.game.name, updatedAt: Date.now() };
          let updatedSaves: typeof existingSaves;
          if (existingIdx >= 0) {
            updatedSaves = existingSaves.map((s, i) => i === existingIdx ? saveEntry : s);
          } else {
            updatedSaves = [...existingSaves, saveEntry];
          }
          set({ saves: updatedSaves });
        } catch (e) {
          console.error('Error saving game:', e);
        }
      },

      deleteGame: (id: string) => {
        try {
          const savesMapStr = localStorage.getItem('taberna-saves-map');
          if (savesMapStr) {
            const savesMap = JSON.parse(savesMapStr) as Record<string, unknown>;
            delete savesMap[id];
            localStorage.setItem('taberna-saves-map', JSON.stringify(savesMap));
          }
        } catch (e) {
          console.error('Error deleting game from saves map:', e);
        }
        set((state) => ({
          saves: state.saves.filter((s) => s.id !== id),
        }));
      },

      // --- Character (GameEngine delegated) ---

      setCharacter: (character: Character) => {
        const result = GameEngine.setCharacter(get().game, character);
        processSideEffects(result.sideEffects);
        set({
          game: result.state,
          isCharacterCreated: true,
        });
      },

      updateCharacter: (updates: Partial<Character>) => {
        const result = GameEngine.updateCharacter(get().game, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      levelUp: (abilityImprovements?: Partial<Record<string, number>>) => {
        const result = GameEngine.levelUp(get().game, abilityImprovements);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
        return result.sideEffects;
      },

      restCharacter: (longRest: boolean) => {
        const result = GameEngine.restCharacter(get().game, longRest);
        processSideEffects(result.sideEffects);

        // Process rest consequences (heal wounds, reduce exhaustion)
        let game = result.state;
        if (game.consequenceState) {
          game = {
            ...game,
            consequenceState: processRestConsequences(game.consequenceState, longRest),
          };
        }

        set({ game });
        return result.sideEffects;
      },

      // --- Inventory (GameEngine delegated) ---

      addItem: (item: Item) => {
        const result = GameEngine.addItem(get().game, item);
        processSideEffects(result.sideEffects);
        if (result.success) {
          set({ game: result.state });
        }
        return result.sideEffects;
      },

      removeItem: (itemId: string) => {
        const result = GameEngine.removeItem(get().game, itemId);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      equipItem: (itemId: string) => {
        const result = GameEngine.equipItem(get().game, itemId);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      unequipItem: (slot: keyof Equipment) => {
        const result = GameEngine.unequipItem(get().game, slot);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      consumeItem: (itemId: string) => {
        const result = GameEngine.consumeItem(get().game, itemId);
        processSideEffects(result.sideEffects);
        if (result.success) {
          set({ game: result.state });
        }
        return result.sideEffects;
      },

      updateCurrency: (updates: Partial<Currency>) => {
        const result = GameEngine.updateCurrency(get().game, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Quests (GameEngine delegated) ---

      addQuest: (quest: Quest) => {
        const result = GameEngine.addQuest(get().game, quest);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      updateQuest: (questId: string, updates: Partial<Quest>) => {
        const result = GameEngine.updateQuest(get().game, questId, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      completeQuest: (questId: string) => {
        const result = GameEngine.completeQuest(get().game, questId);
        processSideEffects(result.sideEffects);
        if (result.success) {
          set({ game: result.state });
        }
        return result.sideEffects;
      },

      followQuest: (questId: string) => {
        const result = GameEngine.followQuest(get().game, questId);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Relations (GameEngine delegated) ---

      addNPC: (npc: NPC) => {
        const result = GameEngine.addNPC(get().game, npc);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      updateNPC: (npcId: string, updates: Partial<NPC>) => {
        const result = GameEngine.updateNPC(get().game, npcId, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Bestiary (GameEngine delegated) ---

      discoverMonster: (monster: Monster) => {
        const result = GameEngine.discoverMonster(get().game, monster);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      updateMonster: (monsterId: string, updates: Partial<Monster>) => {
        const result = GameEngine.updateMonster(get().game, monsterId, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      incrementDefeat: (monsterId: string) => {
        const result = GameEngine.incrementDefeat(get().game, monsterId);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Book of Dead (GameEngine delegated) ---

      addDeathEntry: (entry: DeathEntry) => {
        const result = GameEngine.addDeathEntry(get().game, entry);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      updateDeathEntry: (entryId: string, updates: Partial<DeathEntry>) => {
        const result = GameEngine.updateDeathEntry(get().game, entryId, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Chat (GameEngine delegated) ---

      addChatMessage: (message) => {
        const result = GameEngine.addChatMessage(get().game, message);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Apply AI State Updates (Legacy — GameEngine delegated) ---

      applyStateUpdates: (updates: StateUpdates) => {
        const result = GameEngine.applyStateUpdates(get().game, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- Process AI Intentions (NEW PIPELINE) ---
      // The LLM proposes intentions; the engine resolves them with real dice rolls.
      // The LLM NEVER modifies state directly.
      // After resolution, we record significant events in WorldMemory.

      processAIIntentions: (intentions: Intention[], narrative: string) => {
        const state = get().game;
        let memory = get().worldMemory;

        // Advance memory turn tracking
        memory = advanceMemoryTurn(memory, state.narrative.turn, state.narrative.day);

        // Resolve all intentions through the GameEngine
        const result = resolveIntentions(state, intentions);

        // Update game state with engine-calculated results
        let updatedGame = result.state;

        // --- Process Consequences ---
        // After intentions are resolved, evaluate consequences
        const consequenceResult = processConsequences(
          updatedGame.consequenceState ?? createDefaultConsequenceState(),
          updatedGame,
          result.resolutions
        );

        // Apply consequence state to game state
        updatedGame = {
          ...updatedGame,
          consequenceState: consequenceResult.consequenceState,
        };

        // Apply wound penalties to character if needed
        if (updatedGame.character && consequenceResult.newWounds.length > 0) {
          const penalties = getCombinedPenalties(consequenceResult.consequenceState);
          if (penalties.woundMaxHpReduction > 0 || penalties.woundAcPenalty !== 0) {
            updatedGame = {
              ...updatedGame,
              character: {
                ...updatedGame.character,
                maxHp: Math.max(1, updatedGame.character.maxHp - penalties.woundMaxHpReduction),
                armorClass: updatedGame.character.armorClass + penalties.woundAcPenalty,
                currentHp: Math.min(
                  updatedGame.character.currentHp,
                  Math.max(1, updatedGame.character.maxHp - penalties.woundMaxHpReduction)
                ),
              },
            };
          }
        }

        // Apply exhaustion penalties to character
        if (updatedGame.character && consequenceResult.consequenceState.exhaustion.level > 0) {
          const penalties = getCombinedPenalties(consequenceResult.consequenceState);
          if (penalties.exhaustionMaxHpMultiplier < 1.0) {
            const adjustedMaxHp = Math.floor(updatedGame.character.maxHp * penalties.exhaustionMaxHpMultiplier);
            updatedGame = {
              ...updatedGame,
              character: {
                ...updatedGame.character,
                maxHp: adjustedMaxHp,
                currentHp: Math.min(updatedGame.character.currentHp, adjustedMaxHp),
                speed: Math.floor(updatedGame.character.speed * penalties.exhaustionSpeedMultiplier),
              },
            };
          } else if (penalties.exhaustionSpeedMultiplier < 1.0) {
            updatedGame = {
              ...updatedGame,
              character: {
                ...updatedGame.character,
                speed: Math.floor(updatedGame.character.speed * penalties.exhaustionSpeedMultiplier),
              },
            };
          }
        }

        // Check if character is permanently dead
        if (consequenceResult.characterDied && isPermanentlyDead(consequenceResult.consequenceState)) {
          toast.error('Tu personaje ha muerto permanentemente. La aventura termina aquí.');
        }

        set({ game: updatedGame });

        // Process side effects (toasts, logs)
        processSideEffects(result.allSideEffects);

        // Show toast for important side effects
        for (const effect of result.allSideEffects) {
          if (effect.type === 'toast') {
            toast.success(effect.payload);
          } else if (effect.type === 'death') {
            toast.error(effect.payload);
          }
        }

        // Show consequence toasts
        for (const cResult of consequenceResult.appliedConsequences) {
          if (cResult.severity === 'severe' || cResult.severity === 'critical' || cResult.severity === 'catastrophic') {
            toast.error(cResult.consequence.consequence);
          }
        }

        // Show wound toasts
        for (const wound of consequenceResult.newWounds) {
          toast.warning(`Herida duradera: ${wound.description}`);
        }

        // --- Record significant events in WorldMemory ---
        for (const resolution of result.resolutions) {
          const intent = resolution.intention;

          // Record NPC interactions
          if (intent.npcId && (intent.type === 'npc_reaction' || intent.type === 'dialogue_trigger')) {
            const kind: NPCMemoryKind =
              intent.type === 'dialogue_trigger' ? 'quest_help' :
              (intent.reputationDelta ?? 0) > 0 ? 'favor' :
              (intent.reputationDelta ?? 0) < 0 ? 'insult' : 'trade';
            memory = addNPCMemory(memory, {
              npcId: intent.npcId,
              kind,
              description: intent.description,
              emotionalWeight: Math.abs(intent.reputationDelta ?? 0) > 10 ? 8 : 5,
              tags: [intent.type, intent.npcId],
            });
          }

          // Record combat interactions with NPCs
          if (intent.target && intent.type === 'combat_attack') {
            memory = addNPCMemory(memory, {
              npcId: intent.target,
              kind: resolution.success ? 'threat' : 'abandonment',
              description: intent.description,
              emotionalWeight: 7,
              valence: 'negative',
              tags: ['combat', intent.target],
            });
          }

          // Record skill check outcomes
          if (intent.type === 'skill_check' && intent.xpReward && intent.xpReward > 0) {
            memory = updatePlayerReputation(memory, {
              sphere: resolution.success ? 'heroico' : 'aventurero',
              scoreDelta: resolution.success ? 2 : -1,
              deed: intent.description,
              region: state.narrative.location,
            });
          }

          // Record quest progress
          if (intent.type === 'quest_progress' && intent.completeQuest) {
            memory = addHistoricalEvent(memory, {
              name: `Misión completada: ${intent.questId ?? 'desconocida'}`,
              description: intent.description,
              eventType: 'personal',
              scale: 'local',
              involvedParties: [state.character?.name ?? 'Jugador'],
            });
          }

          // Record new locations
          if (intent.type === 'time_advance' && intent.location && intent.location !== state.narrative.location) {
            memory = addDiscoveredLocation(memory, {
              name: intent.location,
              description: `Visitado en día ${state.narrative.day}`,
            });
          }

          // Record death events
          if (intent.type === 'death_event' && intent.deathEntry) {
            memory = addDeathMemory(memory, {
              name: intent.deathEntry.name,
              race: intent.deathEntry.race,
              role: intent.deathEntry.role,
              causeOfDeath: intent.deathEntry.causeOfDeath,
              location: intent.deathEntry.location,
              killedBy: state.character?.name ?? 'desconocido',
              playerResponsible: intent.deathEntry.role !== 'player',
            });
          }

          // Record escapes
          if (intent.type === 'escape_attempt') {
            memory = addNPCMemory(memory, {
              npcId: 'sistema',
              kind: resolution.success ? 'favor' : 'threat',
              description: `Escape ${resolution.success ? 'exitoso' : 'fallido'}`,
              emotionalWeight: 3,
              tags: ['escape'],
            });
          }
        }

        // Check for overdue promises
        const overdue = getOverduePromises(memory);
        for (const p of overdue) {
          memory = breakPromise(memory, p.id);
        }

        // Update world memory in store
        set({ worldMemory: memory });

        // Add DM narrative message with engine dice rolls and resolutions
        const dmMessage: Omit<ChatMessage, 'id' | 'timestamp'> & {
          diceRolls?: DiceRoll[];
          intentionResolutions?: IntentionResolution[];
        } = {
          role: 'dm',
          content: narrative,
          diceRolls: result.allDiceRolls.length > 0 ? result.allDiceRolls : undefined,
          intentionResolutions: result.resolutions.length > 0 ? result.resolutions : undefined,
        };
        get().addChatMessage(dmMessage);

        return result;
      },

      // --- World Memory Actions ---

      recordNPCInteraction: (npcId, kind, description, opts) => {
        const memory = get().worldMemory;
        set({ worldMemory: addNPCMemory(memory, {
          npcId,
          kind,
          description,
          emotionalWeight: opts?.emotionalWeight,
          outstanding: opts?.outstanding,
          promiseText: opts?.promiseText,
        })});
      },

      recordWorldFlag: (key, value, description) => {
        const memory = get().worldMemory;
        set({ worldMemory: setWorldFlag(memory, { key, value, description })});
      },

      recordDiscoveredLocation: (name, description, method) => {
        const memory = get().worldMemory;
        set({ worldMemory: addDiscoveredLocation(memory, { name, description, discoveryMethod: method })});
      },

      recordPlayerChoice: (choiceDescription, chosenOption, rejectedOptions, consequences) => {
        const memory = get().worldMemory;
        set({ worldMemory: addResolvedChoice(memory, { choiceDescription, chosenOption, rejectedOptions, consequences })});
      },

      recordDeathMemory: (params) => {
        const memory = get().worldMemory;
        set({ worldMemory: addDeathMemory(memory, params)});
      },

      recordHistoricalEvent: (params) => {
        const memory = get().worldMemory;
        set({ worldMemory: addHistoricalEvent(memory, params)});
      },

      recordReputation: (sphere, delta, deed, region) => {
        const memory = get().worldMemory;
        set({ worldMemory: updatePlayerReputation(memory, { sphere, scoreDelta: delta, deed, region })});
      },

      recordFactionAction: (faction, standingDelta, action) => {
        const memory = get().worldMemory;
        set({ worldMemory: updateFactionRelation(memory, { faction, standingDelta, action })});
      },

      recordConflict: (name, description, parties, intensity) => {
        const memory = get().worldMemory;
        set({ worldMemory: addActiveConflict(memory, { name, description, parties, intensity })});
      },

      recordPromise: (promisor, promisee, content, deadlineTurn) => {
        const memory = get().worldMemory;
        set({ worldMemory: addPromise(memory, { promisor, promisee, content, deadlineTurn })});
      },

      // --- Consequence Actions ---

      enablePermadeath: (enabled: boolean) => {
        const game = get().game;
        const cState = game.consequenceState ?? createDefaultConsequenceState();
        set({
          game: {
            ...game,
            consequenceState: setPermadeathEnabled(cState, enabled),
          },
        });
      },

      setMaxResurrections: (max: number) => {
        const game = get().game;
        const cState = game.consequenceState ?? createDefaultConsequenceState();
        set({
          game: {
            ...game,
            consequenceState: configureResurrection(cState, max),
          },
        });
      },

      getConsequenceState: () => {
        return get().game.consequenceState ?? createDefaultConsequenceState();
      },

      // --- Narrative (GameEngine delegated) ---

      updateNarrative: (updates) => {
        const result = GameEngine.updateNarrative(get().game, updates);
        processSideEffects(result.sideEffects);
        set({ game: result.state });
      },

      // --- UI ---

      setActiveTab: (tab: string) => set({ activeTab: tab }),
      setLoading: (loading: boolean) => set({ isLoading: loading }),

      // --- Export/Import (GameEngine validation) ---

      exportGame: () => {
        const state = get();
        return JSON.stringify({ game: state.game, worldMemory: state.worldMemory, version: 2 }, null, 2);
      },

      importGame: (json: string) => {
        try {
          const rawState = JSON.parse(json);
          const gameData = rawState.game ?? rawState; // Support v1 (just GameState) and v2 (with worldMemory)
          const result = GameEngine.validateAndSanitizeSave(gameData);
          const worldMemory = rawState.worldMemory ?? createEmptyWorldMemory();

          if (!result.success) {
            console.error('Import failed:', result.message);
            return false;
          }

          set({
            game: result.state,
            worldMemory,
            isCharacterCreated: true,
          });
          return true;
        } catch (e) {
          console.error('Import failed:', e);
          return false;
        }
      },
    }),
    {
      name: 'taberna-del-viejo-greg',
      partialize: (state) => ({
        game: state.game,
        worldMemory: state.worldMemory,
        saves: state.saves,
        isCharacterCreated: state.isCharacterCreated,
      }),
    }
  )
);
