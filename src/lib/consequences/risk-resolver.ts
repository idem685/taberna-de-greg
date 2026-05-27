// ==========================================
// TABERNA DEL VIEJO GREG - RiskResolver
// ==========================================
// Evaluates consequence severity based on CONTEXT.
// Every bad decision has a tangible cost.
// No soft punishments. No arbitrary injustice.
//
// DESIGN:
//   1. RISK TABLE: Maps (action + context) → severity
//   2. PROGRESSION: Repeated offenses escalate consequences
//   3. FAIRNESS: Same action + same context = same consequence (deterministic)
//
// HOW IT AVOIDS ARBITRARY INJUSTICE:
//   - All consequences are derived from LOOKUP TABLES + CONTEXT
//   - The RiskResolver NEVER rolls dice — it's purely deterministic
//   - Escalation is gradual and predictable (not sudden death)
//   - Every consequence has a clear cause that the player can trace back
//   - "Mercy buffer": first minor offense in a category is often just a warning

import {
  type ConsequenceSeverity,
  type RiskCategory,
  type RiskContext,
  type RiskEvaluationResult,
  type ConsequenceRecord,
  type ConsequenceState,
  type WoundType,
  type WoundLocation,
  SEVERITY_ORDER,
  generateConsequenceId,
} from './types';

// ============================================================
// RISK TABLE — Maps situations to base severity
// ============================================================
// Each entry defines: category → trigger pattern → base severity + risk points
// The RiskResolver then MODIFIES the base severity based on context.

interface RiskTableEntry {
  /** What triggers this risk */
  trigger: string;
  /** Risk category */
  category: RiskCategory;
  /** Base severity before context modifiers */
  baseSeverity: ConsequenceSeverity;
  /** Base risk points added */
  baseRiskPoints: number;
  /** Description of the consequence */
  description: string;
  /** What consequence type to apply */
  consequenceType: string;
}

const RISK_TABLE: RiskTableEntry[] = [
  // --- COMBAT RISKS ---
  { trigger: 'hp_dropped_below_50', category: 'combat', baseSeverity: 'minor', baseRiskPoints: 5, description: 'Herida en combate', consequenceType: 'wound_minor' },
  { trigger: 'hp_dropped_below_25', category: 'combat', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Herida grave en combate', consequenceType: 'wound_moderate' },
  { trigger: 'hp_dropped_to_0', category: 'combat', baseSeverity: 'severe', baseRiskPoints: 20, description: 'Caído en combate — herida crítica', consequenceType: 'wound_severe' },
  { trigger: 'critical_hit_received', category: 'combat', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Golpe crítico recibido — herida duradera', consequenceType: 'wound_moderate' },
  { trigger: 'fumble_in_combat', category: 'combat', baseSeverity: 'minor', baseRiskPoints: 3, description: 'Pifia en combate — auto-daño o apertura', consequenceType: 'wound_minor' },
  { trigger: 'fighting_while_wounded', category: 'combat', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Combatir herido agrava las heridas', consequenceType: 'wound_aggravation' },
  { trigger: 'multiple_enemies', category: 'combat', baseSeverity: 'moderate', baseRiskPoints: 6, description: 'Superado en número — agotamiento', consequenceType: 'exhaustion_increase' },
  { trigger: 'failed_escape_combat', category: 'combat', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Escape fallido — golpe por la espalda', consequenceType: 'wound_moderate' },

  // --- SOCIAL RISKS ---
  { trigger: 'insulted_important_npc', category: 'social', baseSeverity: 'minor', baseRiskPoints: 5, description: 'Insulto a PNJ importante', consequenceType: 'hostility_minor' },
  { trigger: 'broke_promise', category: 'social', baseSeverity: 'moderate', baseRiskPoints: 12, description: 'Promesa rota — pérdida de confianza', consequenceType: 'hostility_moderate' },
  { trigger: 'betrayed_ally', category: 'social', baseSeverity: 'severe', baseRiskPoints: 25, description: 'Traición a aliado — hostilidad permanente', consequenceType: 'hostility_severe' },
  { trigger: 'killed_neutral_npc', category: 'social', baseSeverity: 'severe', baseRiskPoints: 20, description: 'Asesinato de PNJ neutral — venganza', consequenceType: 'hostility_severe' },
  { trigger: 'killed_ally_npc', category: 'social', baseSeverity: 'critical', baseRiskPoints: 35, description: 'Asesinato de aliado — enemistad absoluta', consequenceType: 'hostility_critical' },
  { trigger: 'stole_from_npc', category: 'social', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Robo descubierto — desconfianza', consequenceType: 'hostility_moderate' },
  { trigger: 'lied_caught', category: 'social', baseSeverity: 'minor', baseRiskPoints: 6, description: 'Mentira descubierta — desconfianza', consequenceType: 'hostility_minor' },
  { trigger: 'ignored_plea_for_help', category: 'social', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Ignorar súplica de ayuda — abandono', consequenceType: 'hostility_moderate' },
  { trigger: 'hostility_spread', category: 'social', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Hostilidad se extiende a aliados del objetivo', consequenceType: 'hostility_spread' },

  // --- ENVIRONMENTAL RISKS ---
  { trigger: 'trap_hit', category: 'environmental', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Trampa activada — herida ambiental', consequenceType: 'wound_moderate' },
  { trigger: 'poison_exposure', category: 'environmental', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Exposición a veneno — enfermedad', consequenceType: 'wound_poison' },
  { trigger: 'extreme_weather_no_shelter', category: 'environmental', baseSeverity: 'moderate', baseRiskPoints: 7, description: 'Clima extremo sin refugio — agotamiento', consequenceType: 'exhaustion_increase' },
  { trigger: 'fell_from_height', category: 'environmental', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Caída desde altura — herida grave', consequenceType: 'wound_severe' },
  { trigger: 'drowning_near', category: 'environmental', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Casi ahogado — daño pulmonar', consequenceType: 'wound_severe' },

  // --- ECONOMIC RISKS ---
  { trigger: 'spent_all_gold', category: 'economic', baseSeverity: 'minor', baseRiskPoints: 5, description: 'Sin oro — escasez', consequenceType: 'economic_scarcity' },
  { trigger: 'debt_incurred', category: 'economic', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Deuda pendiente — intereses y cobradores', consequenceType: 'economic_debt' },
  { trigger: 'debt_default', category: 'economic', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Deuda impaga — represalias', consequenceType: 'economic_debt_default' },
  { trigger: 'gambling_loss', category: 'economic', baseSeverity: 'minor', baseRiskPoints: 3, description: 'Pérdida por juego', consequenceType: 'economic_loss' },
  { trigger: 'merchant_ban', category: 'economic', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Prohibido en comercios — mercado reducido', consequenceType: 'economic_ban' },
  { trigger: 'stolen_goods_caught', category: 'economic', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Bienes robados descubiertos — multa y confisco', consequenceType: 'economic_penalty' },

  // --- MORAL RISKS ---
  { trigger: 'killed_innocent', category: 'moral', baseSeverity: 'severe', baseRiskPoints: 20, description: 'Asesinato de inocente — maldición potencial', consequenceType: 'moral_consequence' },
  { trigger: 'tortured_someone', category: 'moral', baseSeverity: 'critical', baseRiskPoints: 30, description: 'Tortura — corrupción del alma', consequenceType: 'moral_corruption' },
  { trigger: 'broke_oath', category: 'moral', baseSeverity: 'severe', baseRiskPoints: 18, description: 'Juramento roto — castigo divino', consequenceType: 'moral_oathbreak' },
  { trigger: 'cowardice_in_battle', category: 'moral', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Cobardía en batalla — vergüenza', consequenceType: 'moral_cowardice' },
  { trigger: 'desecrated_holy_place', category: 'moral', baseSeverity: 'critical', baseRiskPoints: 25, description: 'Profanación — ira divina', consequenceType: 'moral_divine_wrath' },

  // --- PHYSICAL RISKS ---
  { trigger: 'no_rest_3_turns', category: 'physical', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Sin descansar 3 turnos — agotamiento', consequenceType: 'exhaustion_increase' },
  { trigger: 'no_rest_5_turns', category: 'physical', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Sin descansar 5 turnos — agotamiento grave', consequenceType: 'exhaustion_increase' },
  { trigger: 'heavy_load_travel', category: 'physical', baseSeverity: 'minor', baseRiskPoints: 4, description: 'Viaje con carga pesada — fatiga', consequenceType: 'exhaustion_minor' },
  { trigger: 'forced_march', category: 'physical', baseSeverity: 'moderate', baseRiskPoints: 7, description: 'Marcha forzada — agotamiento', consequenceType: 'exhaustion_increase' },

  // --- SUPERNATURAL RISKS ---
  { trigger: 'curse_received', category: 'supernatural', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Maldición recibida', consequenceType: 'supernatural_curse' },
  { trigger: 'divine_punishment', category: 'supernatural', baseSeverity: 'critical', baseRiskPoints: 25, description: 'Castigo divino', consequenceType: 'supernatural_divine' },
  { trigger: 'arcane_backlash', category: 'supernatural', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Contraataque arcano', consequenceType: 'wound_moderate' },
  { trigger: 'undead_contact', category: 'supernatural', baseSeverity: 'moderate', baseRiskPoints: 8, description: 'Contacto con muertos vivientes — corrupción', consequenceType: 'supernatural_corruption' },

  // --- STRATEGIC RISKS ---
  { trigger: 'quest_failed', category: 'strategic', baseSeverity: 'moderate', baseRiskPoints: 10, description: 'Misión fallida — consecuencias', consequenceType: 'quest_failure' },
  { trigger: 'quest_failed_critical', category: 'strategic', baseSeverity: 'severe', baseRiskPoints: 20, description: 'Misión crítica fallida — catástrofe', consequenceType: 'quest_failure_critical' },
  { trigger: 'opportunity_lost', category: 'strategic', baseSeverity: 'minor', baseRiskPoints: 3, description: 'Oportunidad perdida', consequenceType: 'irreversible_loss' },
  { trigger: 'territory_lost', category: 'strategic', baseSeverity: 'severe', baseRiskPoints: 15, description: 'Territorio perdido', consequenceType: 'irreversible_loss' },
];

// ============================================================
// CONTEXT MODIFIERS — How context adjusts base severity
// ============================================================

interface ContextModifier {
  /** Condition that activates this modifier */
  condition: string;
  /** How many severity levels to shift (positive = worse, negative = lighter) */
  severityShift: number;
  /** Multiplier to risk points */
  riskPointMultiplier: number;
  /** Explanation */
  reason: string;
}

function getContextModifiers(ctx: RiskContext): ContextModifier[] {
  const modifiers: ContextModifier[] = [];

  // Low HP makes everything worse
  if (ctx.hpPercentage <= 25) {
    modifiers.push({ condition: 'hp_critical', severityShift: 1, riskPointMultiplier: 1.5, reason: 'PV críticos agravan las consecuencias' });
  } else if (ctx.hpPercentage <= 50) {
    modifiers.push({ condition: 'hp_low', severityShift: 0, riskPointMultiplier: 1.2, reason: 'PV bajos aumentan el riesgo' });
  }

  // Existing wounds make new wounds worse
  if (ctx.activeWoundCount >= 3) {
    modifiers.push({ condition: 'many_wounds', severityShift: 1, riskPointMultiplier: 1.5, reason: 'Múltiples heridas agravan el daño' });
  } else if (ctx.activeWoundCount >= 1) {
    modifiers.push({ condition: 'wounded', severityShift: 0, riskPointMultiplier: 1.2, reason: 'Heridas existentes aumentan vulnerabilidad' });
  }

  // Exhaustion compounds everything
  if (ctx.exhaustionLevel >= 4) {
    modifiers.push({ condition: 'exhausted_severe', severityShift: 2, riskPointMultiplier: 2.0, reason: 'Agotamiento severo — casi indefenso' });
  } else if (ctx.exhaustionLevel >= 2) {
    modifiers.push({ condition: 'exhausted', severityShift: 1, riskPointMultiplier: 1.3, reason: 'Agotamiento aumenta vulnerabilidad' });
  }

  // Low level characters are more fragile
  if (ctx.characterLevel <= 3) {
    modifiers.push({ condition: 'low_level', severityShift: 1, riskPointMultiplier: 1.3, reason: 'Nivel bajo — mayor vulnerabilidad' });
  } else if (ctx.characterLevel >= 10) {
    modifiers.push({ condition: 'high_level', severityShift: -1, riskPointMultiplier: 0.8, reason: 'Nivel alto — mayor resistencia' });
  }

  // Being alone is worse
  if (ctx.isAlone) {
    modifiers.push({ condition: 'alone', severityShift: 0, riskPointMultiplier: 1.2, reason: 'Sin aliados — sin respaldo' });
  }

  // Dangerous location escalates
  if (ctx.locationDanger >= 8) {
    modifiers.push({ condition: 'dangerous_location', severityShift: 1, riskPointMultiplier: 1.3, reason: 'Lugar extremadamente peligroso' });
  } else if (ctx.locationDanger >= 5) {
    modifiers.push({ condition: 'risky_location', severityShift: 0, riskPointMultiplier: 1.1, reason: 'Lugar peligroso' });
  }

  // Recent bad decisions compound
  if (ctx.recentBadDecisions >= 5) {
    modifiers.push({ condition: 'pattern_bad_decisions', severityShift: 1, riskPointMultiplier: 1.5, reason: 'Patrón de malas decisiones — consecuencias escalan' });
  } else if (ctx.recentBadDecisions >= 3) {
    modifiers.push({ condition: 'recent_bad_decisions', severityShift: 0, riskPointMultiplier: 1.2, reason: 'Decisiones recientes negativas' });
  }

  // Many hostilities compound social risk
  if (ctx.hostileCount >= 4) {
    modifiers.push({ condition: 'many_enemies', severityShift: 1, riskPointMultiplier: 1.4, reason: 'Muchos enemigos — mundo hostil' });
  }

  // Destitute characters face harsher economic consequences
  if (ctx.wealthRating === 'destitute') {
    modifiers.push({ condition: 'destitute', severityShift: 0, riskPointMultiplier: 1.5, reason: 'Sin recursos — más difícil recuperarse' });
  }

  return modifiers;
}

// ============================================================
// ESCALATION SYSTEM — Repeated offenses get worse
// ============================================================

/**
 * Calculate the escalation tier based on cumulative risk points.
 * This ensures that players who keep making bad decisions face
 * progressively worse consequences.
 */
function getEscalationTier(riskPoints: number): {
  tier: number;
  name: string;
  multiplier: number;
  severityBonus: number;
} {
  if (riskPoints >= 100) return { tier: 5, name: 'Impredecible', multiplier: 2.5, severityBonus: 2 };
  if (riskPoints >= 70) return { tier: 4, name: 'Desesperado', multiplier: 2.0, severityBonus: 1 };
  if (riskPoints >= 45) return { tier: 3, name: 'Peligroso', multiplier: 1.5, severityBonus: 1 };
  if (riskPoints >= 25) return { tier: 2, name: 'Arriesgado', multiplier: 1.25, severityBonus: 0 };
  if (riskPoints >= 10) return { tier: 1, name: 'Advertido', multiplier: 1.1, severityBonus: 0 };
  return { tier: 0, name: 'Normal', multiplier: 1.0, severityBonus: 0 };
}

// ============================================================
// MERCY BUFFER — First offense is often a warning
// ============================================================

/**
 * Check if the player gets mercy for this category.
 * First minor/moderate offense in a category with 0 prior risk points
 * gets downgraded to a warning (no mechanical consequence).
 */
function checkMercy(
  categoryRiskPoints: number,
  baseSeverity: ConsequenceSeverity
): { mercyApplied: boolean; reducedSeverity: ConsequenceSeverity; reason: string } {
  // No mercy for severe+ consequences
  if (SEVERITY_ORDER[baseSeverity] >= SEVERITY_ORDER['severe']) {
    return { mercyApplied: false, reducedSeverity: baseSeverity, reason: '' };
  }

  // No mercy if already warned in this category
  if (categoryRiskPoints > 0) {
    return { mercyApplied: false, reducedSeverity: baseSeverity, reason: '' };
  }

  // First minor offense becomes a warning (no mechanical penalty, just narrative)
  if (baseSeverity === 'minor') {
    return { mercyApplied: true, reducedSeverity: 'minor', reason: 'Primera ofensa — advertencia sin penalización mecánica' };
  }

  // First moderate offense gets downgraded to minor
  if (baseSeverity === 'moderate') {
    return { mercyApplied: true, reducedSeverity: 'minor', reason: 'Primera ofensa moderada — reducida a menor' };
  }

  return { mercyApplied: false, reducedSeverity: baseSeverity, reason: '' };
}

// ============================================================
// SEVERITY ADJUSTMENT — Apply all modifiers to get final severity
// ============================================================

const SEVERITY_LEVELS: ConsequenceSeverity[] = ['minor', 'moderate', 'severe', 'critical', 'catastrophic'];

function adjustSeverity(
  baseSeverity: ConsequenceSeverity,
  shift: number,
  escalationBonus: number
): ConsequenceSeverity {
  const baseIdx = SEVERITY_LEVELS.indexOf(baseSeverity);
  const finalIdx = Math.min(
    SEVERITY_LEVELS.length - 1,
    Math.max(0, baseIdx + shift + escalationBonus)
  );
  return SEVERITY_LEVELS[finalIdx];
}

// ============================================================
// RISKRESOLVER — Main evaluation engine
// ============================================================

export class RiskResolver {
  /**
   * Evaluate whether a consequence should be applied for the given trigger.
   *
   * ALGORITHM:
   * 1. Look up trigger in RISK TABLE → get base severity + risk points
   * 2. Apply CONTEXT MODIFIERS → shift severity, multiply risk points
   * 3. Apply ESCALATION TIER → bonus severity from cumulative risk
   * 4. Apply MERCY BUFFER → first offense may be downgraded
   * 5. Return evaluation result with exact consequence to apply
   *
   * DETERMINISM: Same trigger + same context = same result. No dice.
   */
  static evaluate(
    trigger: string,
    context: RiskContext,
    currentState: ConsequenceState
  ): RiskEvaluationResult | null {
    // 1. Find matching risk table entry
    const entry = RISK_TABLE.find(e => e.trigger === trigger);
    if (!entry) return null;

    // 2. Get context modifiers
    const modifiers = getContextModifiers(context);
    const totalSeverityShift = modifiers.reduce((sum, m) => sum + m.severityShift, 0);
    const totalRiskMultiplier = modifiers.reduce((mul, m) => mul * m.riskPointMultiplier, 1.0);
    const modifierReasons = modifiers.map(m => m.reason);

    // 3. Get escalation tier from cumulative risk
    const categoryRiskPoints = currentState.riskPointsByCategory[entry.category] ?? 0;
    const escalation = getEscalationTier(currentState.totalRiskPoints);

    // 4. Calculate final severity
    let finalSeverity = adjustSeverity(entry.baseSeverity, totalSeverityShift, escalation.severityBonus);

    // 5. Apply mercy buffer
    const mercy = checkMercy(categoryRiskPoints, entry.baseSeverity);
    if (mercy.mercyApplied) {
      finalSeverity = mercy.reducedSeverity;
      modifierReasons.push(mercy.reason);
    }

    // 6. Calculate risk points
    const riskPoints = Math.round(entry.baseRiskPoints * totalRiskMultiplier * escalation.multiplier);

    // 7. Build consequence record
    const consequenceRecord: ConsequenceRecord = {
      id: generateConsequenceId(),
      turn: context.currentTurn,
      category: entry.category,
      severity: finalSeverity,
      trigger: entry.trigger,
      consequence: entry.description,
      mechanicEffect: this.getMechanicEffect(entry.consequenceType, finalSeverity),
      active: true,
      resolvable: this.isResolvable(entry.consequenceType, finalSeverity),
      resolution: this.getResolution(entry.consequenceType, finalSeverity),
    };

    // 8. Build narrative addition
    const narrativeAddition = this.buildNarrativeAddition(entry, finalSeverity, modifierReasons, mercy.mercyApplied);

    // 9. Determine if consequence should be applied
    // Mercy means narrative warning only (no mechanical effect)
    const shouldApplyMechanical = !mercy.mercyApplied || finalSeverity !== 'minor' || categoryRiskPoints > 0;

    return {
      shouldApplyConsequence: true,
      category: entry.category,
      severity: finalSeverity,
      reasoning: [
        `Base: ${entry.baseSeverity}`,
        `Contexto: ${totalSeverityShift > 0 ? '+' : ''}${totalSeverityShift} niveles`,
        `Escalada (tier ${escalation.tier}): +${escalation.severityBonus} niveles`,
        ...modifierReasons,
        mercy.mercyApplied ? `Clemencia: ${mercy.reason}` : '',
      ].filter(Boolean).join(' → '),
      consequenceType: entry.consequenceType,
      consequence: consequenceRecord,
      stateMutations: shouldApplyMechanical ? this.calculateStateMutations(entry, finalSeverity, riskPoints, context, currentState) : {},
      narrativeAddition,
      escalates: riskPoints > 0,
      riskPointsAdded: riskPoints,
    };
  }

  /**
   * Evaluate a combat resolution for consequences.
   * Called after every combat intention is resolved.
   */
  static evaluateCombatResult(
    hpBefore: number,
    hpAfter: number,
    maxHp: number,
    isCriticalHitReceived: boolean,
    isFumble: boolean,
    context: RiskContext,
    currentState: ConsequenceState
  ): RiskEvaluationResult[] {
    const results: RiskEvaluationResult[] = [];
    const hpPercentage = (hpAfter / maxHp) * 100;

    // HP threshold checks
    if (hpAfter === 0 && hpBefore > 0) {
      const eval_ = this.evaluate('hp_dropped_to_0', { ...context, hpPercentage }, currentState);
      if (eval_) results.push(eval_);
    } else if (hpPercentage < 25 && hpBefore / maxHp >= 25) {
      const eval_ = this.evaluate('hp_dropped_below_25', { ...context, hpPercentage }, currentState);
      if (eval_) results.push(eval_);
    } else if (hpPercentage < 50 && hpBefore / maxHp >= 50) {
      const eval_ = this.evaluate('hp_dropped_below_50', { ...context, hpPercentage }, currentState);
      if (eval_) results.push(eval_);
    }

    // Critical hit received
    if (isCriticalHitReceived) {
      const eval_ = this.evaluate('critical_hit_received', context, currentState);
      if (eval_) results.push(eval_);
    }

    // Fumble
    if (isFumble) {
      const eval_ = this.evaluate('fumble_in_combat', context, currentState);
      if (eval_) results.push(eval_);
    }

    // Fighting while wounded
    if (currentState.wounds.filter(w => w.healingProgress < 100).length > 0) {
      const eval_ = this.evaluate('fighting_while_wounded', context, currentState);
      if (eval_) results.push(eval_);
    }

    return results;
  }

  /**
   * Evaluate a social interaction for consequences.
   */
  static evaluateSocialEvent(
    trigger: string,
    context: RiskContext,
    currentState: ConsequenceState
  ): RiskEvaluationResult | null {
    return this.evaluate(trigger, context, currentState);
  }

  // --- Private Helpers ---

  private static getMechanicEffect(consequenceType: string, severity: ConsequenceSeverity): string {
    const effects: Record<string, Record<ConsequenceSeverity, string>> = {
      wound_minor: {
        minor: 'Desventaja en 1 tirada de habilidad relacionada con la ubicación de la herida',
        moderate: '-1 a una puntuación de característica, desventaja en 2 habilidades',
        severe: '-2 a 2 puntuaciones, desventaja en 3 habilidades, -5 PV máximos',
        critical: '-3 a 2 puntuaciones, -10 PV máximos, -1 CA, velocidad -3m',
        catastrophic: 'Miembro perdido o daño permanente e irreversible',
      },
      wound_moderate: {
        minor: '-1 a 1 puntuación de característica por 1d4 turnos',
        moderate: '-2 a 1 puntuación, desventaja en 2 habilidades por 2d4 turnos',
        severe: '-2 a 2 puntuaciones, -5 PV máximos, velocidad -3m por 3d4 turnos',
        critical: '-3 a 2 puntuaciones, -10 PV máximos, -2 CA permanentemente',
        catastrophic: 'Incapacidad permanente del miembro afectado',
      },
      wound_severe: {
        minor: '-2 a 1 puntuación, sangrado (1 PV/turno) por 3 turnos',
        moderate: '-2 a 2 puntuaciones, -5 PV máximos, desventaja en salvaciones',
        severe: '-3 a 2 puntuaciones, -10 PV máximos, -1 CA, velocidad -3m',
        critical: '-4 a 2 puntuaciones, -15 PV máximos, -2 CA, velocidad -6m, desventaja permanente',
        catastrophic: 'Amputación o daño orgánico irreversible',
      },
      wound_poison: {
        minor: 'Veneno leve: desventaja en Constitución por 2d4 turnos',
        moderate: 'Veneno moderado: -2 Constitución, 1 PV/turno por 3d4 turnos',
        severe: 'Veneno grave: -4 Constitución, 3 PV/turno, desventaja en todas las salvaciones',
        critical: 'Veneno mortal: -6 Constitución, 5 PV/turno, riesgo de coma',
        catastrophic: 'Toxina permanente: daño orgánico irreversible',
      },
      wound_aggravation: {
        minor: 'Herida existente empeora: +1 turno de recuperación',
        moderate: 'Herida empeora: -1 puntuación adicional, +2 turnos recuperación',
        severe: 'Herida se reopen: -2 PV máximos adicionales, sangrado renovado',
        critical: 'Herida se infecta: todas las penalizaciones duplicadas',
        catastrophic: 'Sepsis: muerte inminente sin tratamiento urgente',
      },
      hostility_minor: {
        minor: "PNJ desconfía: actitud 'wary', precios +20%",
        moderate: 'PNJ hostil: no comercia, información limitada',
        severe: 'PNJ busca venganza: emboscada potencial',
        critical: 'PNJ se convierte en enemigo declarado: cazarrecompensas',
        catastrophic: 'PNJ lidera facción enemiga contra el jugador',
      },
      hostility_moderate: {
        minor: 'Desconfianza extendida: PNJ + aliados desconfían',
        moderate: 'Hostilidad abierta: PNJ + 2 aliados son hostiles',
        severe: 'Venganza organizada: facción completa es hostil',
        critical: 'Guerra de facciones: multiples grupos son enemigos',
        catastrophic: 'El jugador es proscrito en toda la región',
      },
      hostility_severe: {
        minor: 'Enemistad profunda: el PNJ nunca olvidará',
        moderate: 'Venganza activa: el PNJ busca al jugador',
        severe: 'Alianzas enemigas: el PNJ une a otros contra el jugador',
        critical: 'Contrato de asesinato: cazarrecompensas profesionales',
        catastrophic: 'El PNJ se convierte en némesis permanente',
      },
      hostility_critical: {
        minor: 'Traición absoluta: el PNJ juró venganza eterna',
        moderate: 'Facción completa declara enemistad',
        severe: 'Red de espías rastrea al jugador',
        critical: 'El PNJ ofrece recompensa por la cabeza del jugador',
        catastrophic: 'El PNJ es ahora némesis con recursos ilimitados',
      },
      hostility_spread: {
        minor: '2 aliados del objetivo ahora desconfían',
        moderate: '3 aliados son hostiles, 5 desconfían',
        severe: 'Facción completa es hostil',
        critical: 'Múltiples facciones son hostiles',
        catastrophic: 'El jugador es enemigo público regional',
      },
      exhaustion_increase: {
        minor: '+1 nivel de agotamiento',
        moderate: '+1 nivel de agotamiento (+1 si ya tiene 2+)',
        severe: '+2 niveles de agotamiento',
        critical: '+2 niveles de agotamiento, PV máximos -10',
        catastrophic: '+3 niveles de agotamiento (6 = muerte)',
      },
      exhaustion_minor: {
        minor: '+1 nivel de agotamiento',
        moderate: '+1 nivel de agotamiento',
        severe: '+2 niveles de agotamiento',
        critical: '+2 niveles, -5 PV máximos',
        catastrophic: '+3 niveles (peligro de muerte)',
      },
      economic_scarcity: {
        minor: 'Precios +25% en la región actual',
        moderate: 'Precios +50%, algunos artículos no disponibles',
        severe: 'Precios x2, pocos comerciantes disponibles',
        critical: 'Precios x3, mercado casi cerrado',
        catastrophic: 'Ningún comerciante vende al jugador',
      },
      economic_debt: {
        minor: 'Deuda con intereses del 3% por turno',
        moderate: 'Deuda con intereses del 5%, cobradores en 5 turnos',
        severe: 'Deuda con intereses del 8%, cobradores activos',
        critical: 'Deuda impagable, embargo de bienes',
        catastrophic: 'Esclavitud por deudas o muerte por cobradores',
      },
      economic_debt_default: {
        minor: 'Cobradores hostiles, +10% precios',
        moderate: 'Bienes embargados, PNJ hostil',
        severe: 'Todo inventario confiscable, proscrito en tiendas',
        critical: 'Búsqueda y captura por deudas',
        catastrophic: 'Esclavitud o ejecución por deudas',
      },
      economic_loss: {
        minor: 'Pérdida del 10% del oro',
        moderate: 'Pérdida del 25% del oro',
        severe: 'Pérdida del 50% del oro',
        critical: 'Pérdida del 75% del oro + 1 ítem aleatorio',
        catastrophic: 'Pérdida total de oro + inventario confiscado',
      },
      economic_ban: {
        minor: '1 comerciante no vende al jugador',
        moderate: '3 comerciantes rehúsan servicio',
        severe: 'Todos los comerciantes de la región rehúsan',
        critical: 'Prohibido en gremio de comerciantes',
        catastrophic: 'Proscrito en todos los mercados de la región',
      },
      economic_penalty: {
        minor: 'Multa del 20% del valor robado',
        moderate: 'Multa del 50% + 3 días de cárcel',
        severe: 'Multa del 100% + 10 días de cárcel + decomiso',
        critical: 'Confiscación total + marca de ladrón',
        catastrophic: 'Mano cortada (ladrón) o ejecución',
      },
      moral_consequence: {
        minor: 'Remordimiento: desventaja en Carisma 1 turno',
        moderate: 'Peso moral: desventaja en Carisma y Sabiduría',
        severe: 'Corrupción: -2 Carisma permanente, PNJs buenos son hostiles',
        critical: 'Maldición: -4 Carisma, aura de maldad detectable',
        catastrophic: 'Corrupción total: alineamiento forzado, pérdida de control',
      },
      moral_corruption: {
        minor: '-1 Carisma, ojos oscurecen',
        moderate: '-2 Carisma, -1 Sabiduría, voces',
        severe: '-3 Carisma, -2 Sabiduría, pesadillas, aura oscura',
        critical: '-4 Carisma, -3 Sabiduría, alucinaciones, PNJs huyen',
        catastrophic: 'Posesión: el personaje ya no es completamente controlable',
      },
      moral_oathbreak: {
        minor: 'Deidad desfavorable: curación reducida',
        moderate: 'Deidad enojada: conjuros fallan 25%',
        severe: 'Deidad castiga: -2 a todas las tiradas divinas',
        critical: 'Maldición divina: -10 PV máximos, no hay curación divina',
        catastrophic: 'Excomunión: sin acceso a magia divina, cazado por inquisidores',
      },
      moral_cowardice: {
        minor: 'Vergüenza: desventaja en Intimidación 3 turnos',
        moderate: 'Cobardía conocida: desventaja en Persuasión e Intimidación',
        severe: 'Repudio: PNJs guerreros desprecian al jugador',
        critical: 'Exilio: expulsado de comunidades guerreras',
        catastrophic: 'Marca de cobarde: permanente, imposible de ocultar',
      },
      moral_divine_wrath: {
        minor: 'Señal divina: fenómenos sobrenaturales menores',
        moderate: 'Castigo: rayo o daño divino, -2 a salvaciones',
        severe: 'Ira divina: maldición persistente, -4 a salvaciones divinas',
        critical: 'Juicio: geas o quest impuesto por la deidad',
        catastrophic: 'Anatema: el jugador es marcado como enemigo divino',
      },
      supernatural_curse: {
        minor: 'Maldición menor: desventaja en 1 habilidad',
        moderate: 'Maldición moderada: desventaja en 2 habilidades, -1 CA',
        severe: 'Maldición mayor: -2 a 2 características, desventaja permanente',
        critical: 'Maldición poderosa: -4 a 1 característica, PV máximos -15',
        catastrophic: 'Maldición irrevocable: solo magia épica puede removerla',
      },
      supernatural_divine: {
        minor: 'Señal de rechazo divino',
        moderate: 'Castigo: -2 a salvaciones, visiones punitivas',
        severe: 'Ira: maldición divina, conjuros fallan 50%',
        critical: 'Abandono: sin magia divina, -3 a todas las tiradas',
        catastrophic: 'Anatema: la deidad quiere al jugador muerto',
      },
      supernatural_corruption: {
        minor: 'Inquietud: desventaja en Sabiduría por 1d4 turnos',
        moderate: 'Corrupción: -1 Sabiduría, vibración antinatural',
        severe: 'Infección: -2 Sabiduría, -1 Carisma, aura necrótica',
        critical: 'Transformación: rasgos no-muerto apareciendo',
        catastrophic: 'Conversión: el personaje se convierte en no-muerto',
      },
      quest_failure: {
        minor: 'Misión fallida: reputación -5, sin recompensa',
        moderate: 'Misión fallida: reputación -10, recompensa perdida, PNJs decepcionados',
        severe: 'Misión crítica fallida: reputación -20, facciones hostiles, consecuencias regionales',
        critical: 'Catástrofe: reputación -30, pérdida de aliados, guerra posible',
        catastrophic: 'Apocalipsis: la región cambia permanentemente por el fracaso',
      },
      quest_failure_critical: {
        minor: 'Consecuencias menores del fracaso crítico',
        moderate: 'Consecuencias moderadas: facción afectada',
        severe: 'Consecuencias severas: región desestabilizada',
        critical: 'Catástrofe regional: muertes, destrucción',
        catastrophic: 'Cambio permanente del mundo: la campaña se altera fundamentalmente',
      },
      irreversible_loss: {
        minor: 'Pérdida menor: 1 objeto o 1 oportunidad',
        moderate: 'Pérdida moderada: 1 aliado o 1 territorio menor',
        severe: 'Pérdida grave: territorio importante, aliado permanente',
        critical: 'Pérdida crítica: base de operaciones, facción completa',
        catastrophic: 'Pérdida total: todo lo construido se pierde',
      },
    };

    return effects[consequenceType]?.[severity] ?? 'Efecto no especificado';
  }

  private static isResolvable(consequenceType: string, severity: ConsequenceSeverity): boolean {
    // Severe+ consequences from certain categories are NOT resolvable
    const unresolvableTypes = new Set(['moral_corruption', 'moral_oathbreak', 'supernatural_curse', 'supernatural_divine']);
    if (unresolvableTypes.has(consequenceType) && SEVERITY_ORDER[severity] >= SEVERITY_ORDER['severe']) {
      return false;
    }

    // Catastrophic is never resolvable
    if (severity === 'catastrophic') return false;

    return true;
  }

  private static getResolution(consequenceType: string, severity: ConsequenceSeverity): string | undefined {
    if (!this.isResolvable(consequenceType, severity)) return undefined;

    const resolutions: Record<string, Record<ConsequenceSeverity, string>> = {
      wound_minor: {
        minor: 'Descanso 2 turnos o curación mágica menor',
        moderate: 'Descanso 5 turnos + curación mágica o Medicina DC 15',
        severe: 'Curación mágica mayor + descanso 10 turnos',
        critical: 'Regeneración o magia épica',
        catastrophic: 'Irreversible',
      },
      wound_moderate: {
        minor: 'Descanso 3 turnos',
        moderate: 'Descanso 6 turnos + Medicina DC 15',
        severe: 'Curación mágica + descanso 8 turnos',
        critical: 'Regeneración',
        catastrophic: 'Irreversible',
      },
      wound_severe: {
        minor: 'Descanso 4 turnos + Medicina DC 12',
        moderate: 'Descanso 8 turnos + curación mágica',
        severe: 'Curación mágica mayor + descanso 12 turnos',
        critical: 'Regeneración o milagro',
        catastrophic: 'Irreversible',
      },
      hostility_minor: {
        minor: 'Disculpas + 1 oro o pequeño favor',
        moderate: 'Gran favor + 10 oro + misión de redención',
        severe: 'Misión peligrosa + 50 oro + juramento',
        critical: 'Sacrificio personal + misión imposible',
        catastrophic: 'Irreversible',
      },
      hostility_moderate: {
        minor: 'Gran favor + compensación económica',
        moderate: 'Misión de redención + 50 oro + juramento',
        severe: 'Misión imposible + sacrificio + juramento mágico',
        critical: 'Sacrificio mayor + prueba de lealtad extrema',
        catastrophic: 'Irreversible',
      },
    };

    return resolutions[consequenceType]?.[severity] ?? 'Resolución posible con esfuerzo significativo';
  }

  private static calculateStateMutations(
    entry: RiskTableEntry,
    severity: ConsequenceSeverity,
    riskPoints: number,
    context: RiskContext,
    currentState: ConsequenceState
  ): Partial<ConsequenceState> {
    const mutations: Partial<ConsequenceState> = {};

    // Update risk points
    mutations.totalRiskPoints = currentState.totalRiskPoints + riskPoints;
    mutations.riskPointsByCategory = {
      ...currentState.riskPointsByCategory,
      [entry.category]: (currentState.riskPointsByCategory[entry.category] ?? 0) + riskPoints,
    };

    // Update consequence multiplier based on new total
    const newEscalation = getEscalationTier(mutations.totalRiskPoints);
    mutations.consequenceMultiplier = newEscalation.multiplier;
    mutations.lastConsequenceTurn = context.currentTurn;
    mutations.updatedAt = Date.now();

    return mutations;
  }

  private static buildNarrativeAddition(
    entry: RiskTableEntry,
    severity: ConsequenceSeverity,
    reasons: string[],
    mercyApplied: boolean
  ): string {
    const severityNarrative: Record<ConsequenceSeverity, string> = {
      minor: 'Una molestia que no deberías ignorar.',
      moderate: 'El dolor es real y duradero. No se pasará solo.',
      severe: 'Una herida profunda — física, social o espiritual. El mundo te lo recordará.',
      critical: 'Consecuencia devastadora. La vida no será igual después de esto.',
      catastrophic: 'Punto de no retorno. Lo que se perdió no volverá.',
    };

    if (mercyApplied) {
      return `[Consecuencia advertida — ${entry.description}. ${severityNarrative[severity]} Esta vez, los dioses son clementes. La próxima, no lo serán.]`;
    }

    return `[Consecuencia (${severity}): ${entry.description}. ${severityNarrative[severity]}]`;
  }
}

// ============================================================
// PUBLIC HELPERS — For external use
// ============================================================

/**
 * Get the wound type appropriate for a damage type.
 */
export function woundTypeFromDamageType(damageType?: string): WoundType {
  const map: Record<string, WoundType> = {
    slashing: 'slash',
    piercing: 'pierce',
    bludgeoning: 'crush',
    fire: 'burn',
    acid: 'burn',
    cold: 'frost',
    poison: 'poison',
    necrotic: 'necrotic',
    psychic: 'psychic',
    radiant: 'burn',
    lightning: 'burn',
    thunder: 'crush',
    force: 'crush',
  };
  return map[damageType ?? ''] ?? 'slash';
}

/**
 * Get a random wound location weighted by combat realism.
 * (Torso most likely, head rare but devastating)
 */
export function randomWoundLocation(): WoundLocation {
  const roll = Math.random() * 100;
  if (roll < 40) return 'torso';
  if (roll < 55) return 'leftArm';
  if (roll < 70) return 'rightArm';
  if (roll < 82) return 'leftLeg';
  if (roll < 92) return 'rightLeg';
  if (roll < 96) return 'head';
  if (roll < 98) return 'back';
  if (roll < 99) return 'hand';
  return 'eye';
}

/**
 * Calculate healing progress for wounds per turn of rest.
 */
export function calculateWoundHealing(wound: { healable: boolean; severity: ConsequenceSeverity }): number {
  if (!wound.healable) return 0;
  const baseHealing: Record<ConsequenceSeverity, number> = {
    minor: 25,
    moderate: 15,
    severe: 8,
    critical: 4,
    catastrophic: 0,
  };
  return baseHealing[wound.severity];
}

/**
 * Get wealth rating from total copper value.
 */
export function calculateWealthRating(totalCopper: number): EconomicState['playerWealthRating'] {
  if (totalCopper >= 50000) return 'rich';       // 500+ gold
  if (totalCopper >= 20000) return 'wealthy';     // 200+ gold
  if (totalCopper >= 8000) return 'comfortable';  // 80+ gold
  if (totalCopper >= 2000) return 'modest';       // 20+ gold
  if (totalCopper >= 500) return 'poor';          // 5+ gold
  return 'destitute';
}

// Re-import for the type used in calculateWealthRating
import type { EconomicState } from './types';
