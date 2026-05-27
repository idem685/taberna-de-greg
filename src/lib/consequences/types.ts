// ==========================================
// TABERNA DEL VIEJO GREG - Consequence Types
// ==========================================
// Persistent consequences that make every bad decision cost something tangible.
// No soft punishments. No free passes. The world remembers.
//
// DESIGN PRINCIPLE:
//   Consequences are PROPORTIONAL to context, CUMULATIVE over time,
//   and DETERMINISTIC for the same action in the same situation.
//   The RiskResolver ensures fairness — no arbitrary punishment.

// --- Severity Levels ---

export type ConsequenceSeverity = 'minor' | 'moderate' | 'severe' | 'critical' | 'catastrophic';

export const SEVERITY_ORDER: Record<ConsequenceSeverity, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
  critical: 4,
  catastrophic: 5,
};

export function severityGTE(a: ConsequenceSeverity, b: ConsequenceSeverity): boolean {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b];
}

// --- Risk Categories ---

export type RiskCategory =
  | 'combat'       // Physical damage taken in battle
  | 'social'       // Reputation damage, broken promises, insults
  | 'environmental' // Traps, poison, extreme conditions
  | 'economic'     // Financial losses, theft, gambling
  | 'moral'        // Killing innocents, betraying allies, cowardice
  | 'physical'     // Exhaustion, overexertion, lack of rest
  | 'supernatural' // Curses, divine wrath, arcane backlash
  | 'strategic';   // Failed quests, lost opportunities, tactical errors

// --- Lasting Wounds ---

export type WoundLocation =
  | 'head' | 'torso' | 'leftArm' | 'rightArm'
  | 'leftLeg' | 'rightLeg' | 'back' | 'eye' | 'hand';

export type WoundType =
  | 'slash'        // Cut from blade — bleeds, leaves scar
  | 'pierce'       // Stab wound — internal damage risk
  | 'crush'        // Blunt trauma — bone damage
  | 'burn'         // Fire/acid — disfigurement
  | 'frost'        // Cold damage — nerve damage
  | 'poison'       // Toxin — lingering sickness
  | 'necrotic'     // Dark magic — won't heal normally
  | 'psychic'      // Mind damage — hallucinations, fear
  | 'dismemberment' // Lost limb — permanent
  | 'scar';        // Cosmetic but reputation-affecting

export interface LastingWound {
  id: string;
  /** What kind of wound */
  woundType: WoundType;
  /** Where on the body */
  location: WoundLocation;
  /** When it was received (game turn) */
  receivedTurn: number;
  /** How severe (affects healing time and penalties) */
  severity: ConsequenceSeverity;
  /** Current healing progress (0 = fresh, 100 = healed) */
  healingProgress: number;
  /** Whether this wound can heal naturally */
  healable: boolean;
  /** Turns of natural rest needed to fully heal */
  turnsToHeal: number;
  /** Game-mechanical penalty while active */
  penalty: WoundPenalty;
  /** Narrative description */
  description: string;
  /** The event that caused this wound */
  sourceEvent: string;
  /** Whether this wound leaves a permanent mark even after healing */
  leavesScar: boolean;
  /** Scar description (if leavesScar) */
  scarDescription?: string;
}

export interface WoundPenalty {
  /** Ability score penalty (e.g., { strength: -2, dexterity: -1 }) */
  abilityPenalty: Partial<Record<string, number>>;
  /** Skill penalties */
  skillDisadvantage: string[];
  /** Speed reduction */
  speedReduction: number;
  /** AC penalty */
  acPenalty: number;
  /** Maximum HP reduction */
  maxHpReduction: number;
  /** Attack roll penalty */
  attackRollPenalty: number;
  /** Can't perform certain actions */
  disabledActions: string[];
}

// --- Exhaustion ---

export interface ExhaustionLevel {
  /** Current level 0-6 (D&D 5e: 6 = death) */
  level: number;
  /** How the exhaustion was acquired */
  causes: ExhaustionCause[];
  /** Whether this character is at risk of permadeath from exhaustion */
  atDeathDoor: boolean;
}

export interface ExhaustionCause {
  /** What caused the exhaustion */
  source: string;
  /** Turn it was incurred */
  turn: number;
  /** Severity of this particular cause */
  severity: ConsequenceSeverity;
}

/** D&D 5e exhaustion effects per level */
export const EXHAUSTION_EFFECTS: Record<number, string> = {
  0: 'Sin efectos',
  1: 'Desventaja en tiradas de habilidad',
  2: 'Velocidad reducida a la mitad',
  3: 'Desventaja en tiradas de ataque y salvación',
  4: 'PV máximos reducidos a la mitad',
  5: 'Velocidad reducida a 0',
  6: 'MUERTE',
};

// --- Negative Reputation & Hostility ---

export interface HostilityRecord {
  /** NPC or faction ID */
  targetId: string;
  /** Target name for display */
  targetName: string;
  /** Current hostility level (0-100) */
  hostilityLevel: number;
  /** What caused the hostility */
  causes: HostilityCause[];
  /** Current attitude */
  attitude: 'wary' | 'hostile' | 'vengeful' | 'enemy' | 'nemesis';
  /** Whether this hostility spreads to allies of the target */
  spreadsToAllies: boolean;
  /** NPCs/factions that have been influenced by this hostility */
  influencedTargets: string[];
  /** Whether this hostility can be reduced through amends */
  redeemable: boolean;
  /** Actions needed to redeem (if redeemable) */
  redemptionConditions: string[];
}

export interface HostilityCause {
  /** What happened */
  action: string;
  /** Turn it occurred */
  turn: number;
  /** How much hostility it added */
  hostilityAdded: number;
  /** Whether it was witnessed by others */
  witnessed: boolean;
  /** Witnesses */
  witnesses: string[];
}

// --- Economic Scarcity ---

export interface EconomicState {
  /** Regional price multiplier (1.0 = normal, 2.0 = double prices) */
  regionalMultiplier: number;
  /** Which regions have scarcity */
  scarceRegions: ScarceRegion[];
  /** The player's credit/debt status */
  debts: PlayerDebt[];
  /** Whether the player is banned from merchants */
  merchantBans: MerchantBan[];
  /** Stolen goods that can't be sold normally */
  stolenGoods: StolenGood[];
  /** Overall economic flag */
  playerWealthRating: 'destitute' | 'poor' | 'modest' | 'comfortable' | 'wealthy' | 'rich';
}

export interface ScarceRegion {
  region: string;
  multiplier: number;
  /** What's scarce */
  scarceItems: string[];
  /** Why it's scarce */
  reason: string;
  /** When scarcity started */
  sinceTurn: number;
}

export interface PlayerDebt {
  creditorId: string;
  creditorName: string;
  amount: number; // in copper
  /** Interest rate per turn (e.g., 0.05 = 5%) */
  interestRate: number;
  /** Turn the debt was incurred */
  sinceTurn: number;
  /** Whether debt collectors are actively pursuing */
  collectorsActive: boolean;
  /** Consequence if debt is not paid */
  defaultConsequence: string;
}

export interface MerchantBan {
  merchantId: string;
  merchantName: string;
  reason: string;
  /** Whether the ban can be lifted */
  canBeLifted: boolean;
  /** Cost to lift the ban */
  liftCost: number;
}

export interface StolenGood {
  itemId: string;
  itemName: string;
  /** Original owner */
  originalOwner: string;
  /** Whether fences will buy it (at reduced price) */
  fenceable: boolean;
  /** Price reduction for being stolen */
  valueReduction: number; // 0.0-1.0 multiplier
}

// --- Failed Quests ---

export interface FailedQuest {
  questId: string;
  questName: string;
  /** Why it failed */
  failureReason: string;
  /** When it failed */
  failedTurn: number;
  /** Consequences of failure */
  consequences: QuestFailureConsequence[];
  /** Whether it can be reattempted (usually NO) */
  reattemptable: boolean;
  /** Who is affected by this failure */
  affectedParties: string[];
  /** Whether the failure is widely known */
  widelyKnown: boolean;
  /** Reputation impact */
  reputationImpact: number;
}

export interface QuestFailureConsequence {
  type: 'reputation' | 'economic' | 'social' | 'political' | 'supernatural';
  description: string;
  severity: ConsequenceSeverity;
  /** Mechanical effect */
  mechanicEffect: string;
}

// --- Permadeath ---

export interface PermadeathState {
  /** Whether permadeath is enabled for this game */
  enabled: boolean;
  /** How many times the character has died (0 = alive) */
  deathCount: number;
  /** Current death state */
  status: 'alive' | 'dying' | 'dead' | 'ressurrected';
  /** Resurrection attempts (if allowed by campaign settings) */
  resurrectionAttempts: number;
  /** Maximum resurrection attempts allowed */
  maxResurrectionAttempts: number;
  /** Each resurrection has a cost */
  resurrectionCosts: ResurrectionCost[];
  /** Lasting effects from near-death experiences */
  nearDeathEffects: NearDeathEffect[];
  /** Whether the character is permanently dead */
  isPermanentlyDead: boolean;
  /** Epitaph if dead */
  epitaph?: string;
}

export interface ResurrectionCost {
  type: 'level_loss' | 'ability_loss' | 'item_loss' | 'debt' | 'quest' | 'curse';
  description: string;
  /** The actual cost value */
  value: number | string;
  /** Whether this cost has been paid */
  paid: boolean;
}

export interface NearDeathEffect {
  id: string;
  /** What happened during the near-death */
  experience: string;
  /** Mechanical effect while active */
  effect: string;
  /** Turn it was incurred */
  turn: number;
  /** Whether it fades over time */
  fadesOverTime: boolean;
  /** Turns until it fades (0 = permanent) */
  turnsUntilFade: number;
}

// --- Irreversible Loss ---

export interface IrreversibleLoss {
  id: string;
  /** What was lost */
  lostThing: string;
  /** Category of loss */
  category: 'item' | 'ability' | 'relationship' | 'opportunity' | 'territory' | 'knowledge' | 'time';
  /** How it was lost */
  cause: string;
  /** Turn it was lost */
  lostTurn: number;
  /** Whether it's truly gone forever */
  permanent: boolean;
  /** If not permanent, what could restore it */
  restorationCondition?: string;
  /** Narrative impact */
  narrative: string;
  /** Severity */
  severity: ConsequenceSeverity;
}

// --- Consequence Record ---

export interface ConsequenceRecord {
  /** Unique ID */
  id: string;
  /** When this consequence was applied */
  turn: number;
  /** The risk category */
  category: RiskCategory;
  /** The severity */
  severity: ConsequenceSeverity;
  /** What triggered this consequence */
  trigger: string;
  /** What the consequence is */
  consequence: string;
  /** Mechanical effect description */
  mechanicEffect: string;
  /** Whether this consequence is still active */
  active: boolean;
  /** Whether it can be resolved/removed */
  resolvable: boolean;
  /** How to resolve it (if resolvable) */
  resolution?: string;
}

// --- Risk Evaluation Context ---

export interface RiskContext {
  /** Current character level */
  characterLevel: number;
  /** Current HP percentage (0-100) */
  hpPercentage: number;
  /** Number of active wounds */
  activeWoundCount: number;
  /** Current exhaustion level */
  exhaustionLevel: number;
  /** Number of active hostile relationships */
  hostileCount: number;
  /** Number of failed quests */
  failedQuestCount: number;
  /** Economic state rating */
  wealthRating: EconomicState['playerWealthRating'];
  /** Recent bad decisions count (last 10 turns) */
  recentBadDecisions: number;
  /** Current location danger level (1-10) */
  locationDanger: number;
  /** Whether character is alone */
  isAlone: boolean;
  /** Whether permadeath is enabled */
  permadeathEnabled: boolean;
  /** Turn number */
  currentTurn: number;
}

// --- Complete Consequence State ---

export interface ConsequenceState {
  /** Version for migration */
  version: number;
  /** Last updated */
  updatedAt: number;

  // --- All consequence collections ---
  /** Active lasting wounds */
  wounds: LastingWound[];
  /** Exhaustion state */
  exhaustion: ExhaustionLevel;
  /** Hostility records */
  hostilities: HostilityRecord[];
  /** Economic scarcity state */
  economy: EconomicState;
  /** Permanently failed quests */
  failedQuests: FailedQuest[];
  /** Permadeath state */
  permadeath: PermadeathState;
  /** Irreversible losses */
  irreversibleLosses: IrreversibleLoss[];
  /** History of all consequences applied */
  consequenceLog: ConsequenceRecord[];

  // --- Cumulative risk tracking ---
  /** Total severity points accumulated (affects escalation) */
  totalRiskPoints: number;
  /** Risk points by category */
  riskPointsByCategory: Record<RiskCategory, number>;
  /** Consequence multiplier (increases with repeated offenses) */
  consequenceMultiplier: number;
  /** Turn of the last consequence (for cooldown) */
  lastConsequenceTurn: number;
}

// --- Risk Evaluation Result ---

export interface RiskEvaluationResult {
  /** Whether a consequence should be applied */
  shouldApplyConsequence: boolean;
  /** The risk category */
  category: RiskCategory;
  /** Determined severity */
  severity: ConsequenceSeverity;
  /** Why this severity was chosen */
  reasoning: string;
  /** What consequence to apply */
  consequenceType: string;
  /** The actual consequence to apply */
  consequence: ConsequenceRecord;
  /** Additional state mutations needed */
  stateMutations: Partial<ConsequenceState>;
  /** Narrative text to include */
  narrativeAddition: string;
  /** Whether this consequence escalates future consequences */
  escalates: boolean;
  /** Risk points added */
  riskPointsAdded: number;
}

// --- Helper: Create Default Consequence State ---

export function createDefaultConsequenceState(): ConsequenceState {
  return {
    version: 1,
    updatedAt: Date.now(),
    wounds: [],
    exhaustion: { level: 0, causes: [], atDeathDoor: false },
    hostilities: [],
    economy: {
      regionalMultiplier: 1.0,
      scarceRegions: [],
      debts: [],
      merchantBans: [],
      stolenGoods: [],
      playerWealthRating: 'modest',
    },
    failedQuests: [],
    permadeath: {
      enabled: false,
      deathCount: 0,
      status: 'alive',
      resurrectionAttempts: 0,
      maxResurrectionAttempts: 0,
      resurrectionCosts: [],
      nearDeathEffects: [],
      isPermanentlyDead: false,
    },
    irreversibleLosses: [],
    consequenceLog: [],
    totalRiskPoints: 0,
    riskPointsByCategory: {
      combat: 0,
      social: 0,
      environmental: 0,
      economic: 0,
      moral: 0,
      physical: 0,
      supernatural: 0,
      strategic: 0,
    },
    consequenceMultiplier: 1.0,
    lastConsequenceTurn: 0,
  };
}

// --- Helper: Generate Consequence ID ---

let consequenceIdCounter = 0;
export function generateConsequenceId(): string {
  consequenceIdCounter++;
  return `cons_${Date.now()}_${consequenceIdCounter}`;
}
