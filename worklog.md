---
Task ID: 1
Agent: Main
Task: Implement persistent consequences system (RiskResolver)

Work Log:
- Read all project files: game-types.ts, game-engine/*, game-store.ts, dm/route.ts, llm/*, world-memory/*
- Created /lib/consequences/types.ts — All consequence type definitions (LastingWound, ExhaustionLevel, HostilityRecord, EconomicState, FailedQuest, PermadeathState, IrreversibleLoss, RiskContext, ConsequenceState, etc.)
- Created /lib/consequences/risk-resolver.ts — RiskResolver class with full RISK_TABLE (50+ entries across 8 categories), context modifiers, escalation system, mercy buffer, severity adjustment algorithm
- Created /lib/consequences/wounds.ts — Lasting wounds system with wound templates per type+location, severity-based penalties, healing mechanics, combined penalty calculation
- Created /lib/consequences/reputation.ts — Cumulative hostility system with attitude thresholds (wary→hostile→vengeful→enemy→nemesis), spread to allies, redemption conditions, reputation loss as irreversible loss
- Created /lib/consequences/exhaustion.ts — D&D 5e exhaustion levels (0-6, 6=death), debt/economic scarcity (interest, collectors, merchant bans, stolen goods, scarcity regions)
- Created /lib/consequences/permadeath.ts — Optional permanent death, resurrection costs (level loss, ability loss, debt, quest, curse), near-death effects, irreversible losses
- Created /lib/consequences/quest-failure.ts — Permanently failed quests with consequence templates per quest type, reputation impact, faction trust erosion
- Created /lib/consequences/index.ts — Orchestrator: processConsequences() integrates all subsystems, processRestConsequences() handles healing, getCombinedPenalties() for engine integration
- Updated game-types.ts — Added ConsequenceState import and consequenceState field to GameState
- Updated game-engine/engine.ts — Added consequenceState to createDefaultGameState() and validateAndSanitizeSave()
- Updated game-store.ts — Integrated consequence processing into processAIIntentions(), added consequence actions (enablePermadeath, setMaxResurrections, getConsequenceState), updated restCharacter to process rest consequences

Stage Summary:
- Build passes with 0 TS errors and Next.js build succeeds
- Full consequence system: 9 modules, 50+ risk table entries, 8 risk categories, 5 severity levels, deterministic evaluation
- Every bad decision has tangible cost, no soft punishments
- RiskResolver is purely deterministic — no dice, no randomness in consequence selection

---
Task ID: 2
Agent: Main
Task: Rewrite opening narrative — dark, elegant, unsettling tone with Greg's impossible knowledge

Work Log:
- Read all 3 files containing intro text: create-character/route.ts, character-creation.tsx, dm/route.ts
- Wrote new opening narrative: player is already inside, doesn't remember entering, Greg knows the impossible, unmoving patrons, supernatural ambiguity, binary choice (package vs door)
- Updated CHARACTER_CREATION_PROMPT in create-character/route.ts: new openingNarrative instructions, updated NPC Greg (neutral reputation, "Sabía que vendrías", ominous notes), rule about dark tone
- Updated createFallbackCharacter() in character-creation.tsx: full new narrative text, new quest "El paquete de cuero", new NPC with neutral/ominous data
- Updated SYSTEM_PROMPT in dm/route.ts: new identity (not a friendly DM, something older/tired/honest), dark narrative tone rules, tension constant rule, anti-cliché prohibition
- Updated narrative instruction in DM response format to specify dark/elegant/unsettling tone
- Updated error fallback narrative to match dark tone
- Updated UI elements: button text "Sentarse en la silla", status messages ("Greg te observa...", "La silla espera...", "El silencio se espesa..."), toast messages, empty chat placeholder, loading text, example descriptions (darker backstory for each), info cards ("Reglas crudas", "Viejo Greg - Sabe demasiado", "Consecuencias - Permanentes")
- Build passes successfully

Stage Summary:
- Opening narrative completely rewritten — no generic tavern RPG clichés
- Greg's impossible knowledge: "Sabía que vendrías, [nombre]. No por la puerta. No por elección."
- First important decision embedded in opening: open the package OR walk to the door (mutually exclusive)
- Supernatural ambiguity: unmoving patrons, candles that don't flicker, no memory of entering
- All UI copy updated to match dark, elegant, unsettling tone
- Build compiles with 0 errors

---
Task ID: 3
Agent: Main
Task: Create debug panel with state inspector, memory viewer, intention/resolution tracker, parse health, token estimate, error log, and cheat menu

Work Log:
- Created /src/types/debug.d.ts — Global Window.__TABERNA_DEBUG type declaration
- Created /src/components/game/debug-panel.tsx — Full debug panel component (620+ lines)
  - 10 tabbed sections: Estado, Memoria, Intenciones, GameEngine, Tiempo, Reputación, Parse Health, Tokens, Errores, Cheat Menu
  - Floating bug icon button (bottom-right) to toggle panel
  - Slide-in panel from right side with collapsible sections
  - JSON viewer with expand/collapse for full state dumps
  - Stat rows for structured data display
- Updated /src/components/game/chat.tsx — Hooked into DM API response pipeline
  - Stores lastPipeline diagnostics in window.__TABERNA_DEBUG
  - Stores lastContext (token estimates, memory selection) in window.__TABERNA_DEBUG
  - Stores lastIntentions (raw LLM intentions) in window.__TABERNA_DEBUG
  - Stores lastResolutions (GameEngine resolution results) in window.__TABERNA_DEBUG
  - Stores errors in window.__TABERNA_DEBUG.errors array (max 20)
- Updated /src/app/page.tsx — Added DebugPanel component to page layout
- Fixed multiple type mismatches during build: Character vs GameState currency paths, ExhaustionLevel object, HostilityRecord fields, WorldMemory field names, CombinedPenalties shape, getAllSkillTotals return type
- Build passes with 0 errors

Stage Summary:
- Debug panel accessible via floating bug icon (bottom-right corner)
- 10 sections: state, memory, intentions, engine, time, reputation, parse health, tokens, errors, cheat menu
- Cheat menu: +gold, +XP, full heal, level up, long rest, set ability scores (12-20), add debug weapon, clear wounds/exhaustion, export state dump, reset completo
- Real-time diagnostics: pipeline stage, token estimates, memory selection, intention/resolution tracking, error log
- All data captured automatically from DM API responses via window.__TABERNA_DEBUG
- Minimalist UI with collapsible sections and monospace code views
