// ==========================================
// TABERNA DEL VIEJO GREG - Lasting Wounds
// ==========================================
// Wounds that persist beyond combat. Not everything heals with a potion.
// A sword across the face leaves a scar. A crushed hand won't grip a sword.
// These are the tangible costs of violence.

import {
  type LastingWound,
  type WoundPenalty,
  type WoundType,
  type WoundLocation,
  type ConsequenceSeverity,
  type ConsequenceState,
  generateConsequenceId,
} from './types';

// --- Wound Templates ---

const WOUND_DESCRIPTIONS: Record<WoundType, Record<WoundLocation, string[]>> = {
  slash: {
    head: ['Corte profundo en la frente', 'Cicatriz cruzando la mejilla', 'Tajo en el cuero cabelludo'],
    torso: ['Corte diagonal en el pecho', 'Herida de tajo en el abdomen', 'Cicatriz en las costillas'],
    leftArm: ['Tajo en el antebrazo izquierdo', 'Corte en el bíceps izquierdo', 'Herida en la muñeca izquierda'],
    rightArm: ['Tajo en el antebrazo derecho', 'Corte en el bíceps derecho', 'Herida en la muñeca derecha'],
    leftLeg: ['Corte en el muslo izquierdo', 'Tajo en la pantorrilla izquierda', 'Herida en la rodilla izquierda'],
    rightLeg: ['Corte en el muslo derecho', 'Tajo en la pantorrilla derecha', 'Herida en la rodilla derecha'],
    back: ['Corte en la espalda', 'Tajo entre los omóplatos', 'Cicatriz de latigazo'],
    eye: ['Corte cerca del ojo', 'Cicatriz cruzando el ojo', 'Tajo en la ceja'],
    hand: ['Corte en la palma', 'Tajo en los dedos', 'Herida en el pulgar'],
  },
  pierce: {
    head: ['Herida de puñalada en la sien', 'Perforación cerca del oído', 'Punctión en la mejilla'],
    torso: ['Puñalada en el hombro', 'Perforación en el costado', 'Herida de lanza en el pecho'],
    leftArm: ['Perforación en el brazo izquierdo', 'Puñalada en el codo izquierdo'],
    rightArm: ['Perforación en el brazo derecho', 'Puñalada en el codo derecho'],
    leftLeg: ['Perforación en el muslo izquierdo', 'Herida de flecha en la pierna izquierda'],
    rightLeg: ['Perforación en el muslo derecho', 'Herida de flecha en la pierna derecha'],
    back: ['Puñalada por la espalda', 'Flecha en la espalda'],
    eye: ['Herida cerca del ojo', 'Perforación junto al ojo'],
    hand: ['Perforación en la mano', 'Puñalada en la palma'],
  },
  crush: {
    head: ['Contusión craneal', 'Golpe en la mandíbula', 'Hematoma en la frente'],
    torso: ['Costillas rotas', 'Contusión en el pecho', 'Hematoma abdominal'],
    leftArm: ['Brazo izquierdo contusionado', 'Codo izquierdo magullado', 'Húmero izquierdo fisurado'],
    rightArm: ['Brazo derecho contusionado', 'Codo derecho magullado', 'Húmero derecho fisurado'],
    leftLeg: ['Pierna izquierda contusionada', 'Rodilla izquierda hinchada', 'Espinilla izquierda fisurada'],
    rightLeg: ['Pierna derecha contusionada', 'Rodilla derecha hinchada', 'Espinilla derecha fisurada'],
    back: ['Columna golpeada', 'Espalda contusionada', 'Vértebra fisurada'],
    eye: ['Ojo hinchado', 'Contusión orbital', 'Mandíbula rota afecta visión'],
    hand: ['Manos machacadas', 'Dedos rotos', 'Muñeca contusionada'],
  },
  burn: {
    head: ['Quemadura en el rostro', 'Cicatriz por fuego en la cara', 'Marcas de ácido en la mejilla'],
    torso: ['Quemadura en el pecho', 'Marcas de fuego en el torso', 'Quemadura ácida en el abdomen'],
    leftArm: ['Quemadura en el brazo izquierdo', 'Brazo izquierdo marcado por fuego'],
    rightArm: ['Quemadura en el brazo derecho', 'Brazo derecho marcado por fuego'],
    leftLeg: ['Quemadura en la pierna izquierda', 'Pierna izquierda marcada'],
    rightLeg: ['Quemadura en la pierna derecha', 'Pierna derecha marcada'],
    back: ['Quemadura en la espalda', 'Espalda marcada por fuego'],
    eye: ['Quemadura cerca del ojo', 'Visión dañada por calor'],
    hand: ['Quemadura en las manos', 'Dedos marcados por fuego'],
  },
  frost: {
    head: ['Congelación en las orejas', 'Escarcha en el rostro', 'Nariz congelada'],
    torso: ['Hipotermia en el pecho', 'Congelación superficial del torso'],
    leftArm: ['Brazo izquierdo congelado', 'Dedos izquierdos congelados'],
    rightArm: ['Brazo derecho congelado', 'Dedos derechos congelados'],
    leftLeg: ['Pierna izquierda congelada', 'Pie izquierdo congelado'],
    rightLeg: ['Pierna derecha congelada', 'Pie derecho congelado'],
    back: ['Espalda congelada', 'Hipotermia dorsal'],
    eye: ['Cataratas por frío', 'Visión nublada por congelación'],
    hand: ['Manos congeladas', 'Dedos congelados — movilidad reducida'],
  },
  poison: {
    head: ['Veneno afectando la mente', 'Alucinaciones tóxicas', 'Vértigo envenenado'],
    torso: ['Veneno en el torrente sanguíneo', 'Náuseas persistentes', 'Órganos irritados por toxina'],
    leftArm: ['Brazo izquierdo entumecido por veneno', 'Hormigueo tóxico'],
    rightArm: ['Brazo derecho entumecido por veneno', 'Temblor tóxico'],
    leftLeg: ['Pierna izquierda adormecida por veneno', 'Debilidad tóxica'],
    rightLeg: ['Pierna derecha adormecida por veneno', 'Inestabilidad tóxica'],
    back: ['Espalda ardiendo por veneno', 'Toxina en el sistema nervioso'],
    eye: ['Visión borrosa por veneno', 'Ojos inyectados en sangre'],
    hand: ['Manos temblorosas por veneno', 'Temblor tóxico en los dedos'],
  },
  necrotic: {
    head: ['Putrefacción necrótica en el rostro', 'Sombra en los ojos', 'Piel marchita en la cara'],
    torso: ['Herida necrótica que no cierra', 'Carne marchita en el pecho', 'Sombra en el corazón'],
    leftArm: ['Brazo izquierdo marchito', 'Piel necrótica en el antebrazo'],
    rightArm: ['Brazo derecho marchito', 'Piel necrótica en el antebrazo'],
    leftLeg: ['Pierna izquierda necrótica', 'Carne muerta en la pierna'],
    rightLeg: ['Pierna derecha necrótica', 'Carne muerta en la pierna'],
    back: ['Sombra necrótica en la espalda', 'Piel muerta extendiéndose'],
    eye: ['Ojo tocado por nigromancia', 'Visión de la muerte'],
    hand: ['Mano con toque de muerte', 'Dedos marchitos'],
  },
  psychic: {
    head: ['Dolor mental punzante', 'Voces intrusivas', 'Migraña psiónica'],
    torso: ['Ansiedad psíquica en el pecho', 'Opresión mental que duele físicamente'],
    leftArm: ['Temblor psíquico en el brazo izquierdo', 'Miembro dominado por miedo irracional'],
    rightArm: ['Temblor psíquico en el brazo derecho', 'Parálisis por terror'],
    leftLeg: ['Pierna izquierda temblorosa por trauma mental', 'Fobias arraigadas'],
    rightLeg: ['Pierna derecha inestable por daño mental', 'Vacilación por terror'],
    back: ['Escalofríos psíquicos', 'Sensación de ser observado'],
    eye: ['Alucinaciones visuales', 'Visión distorsionada por daño mental'],
    hand: ['Manos que tiemblan sin control', 'Agarrotamiento psíquico'],
  },
  dismemberment: {
    head: ['Ojo perdido', 'Oreja cortada', 'Mandíbula destrozada'],
    torso: ['Órgano dañado irreversiblemente', 'Torso destrozado parcialmente'],
    leftArm: ['Brazo izquierdo amputado', 'Mano izquierda perdida', 'Dedos izquierdos seccionados'],
    rightArm: ['Brazo derecho amputado', 'Mano derecha perdida', 'Dedos derechos seccionados'],
    leftLeg: ['Pierna izquierda amputada', 'Pie izquierdo perdido'],
    rightLeg: ['Pierna derecha amputada', 'Pie derecho perdido'],
    back: ['Columna dañada — parálisis parcial', 'Movilidad reducida permanentemente'],
    eye: ['Ojo perdido permanentemente', 'Ceguera parcial'],
    hand: ['Mano inutilizable', 'Destreza perdida'],
  },
  scar: {
    head: ['Cicatriz prominente en el rostro', 'Marca indeleble en la frente', 'Señal de guerra en la mejilla'],
    torso: ['Cicatriz glacial en el pecho', 'Marca de batalla en el abdomen'],
    leftArm: ['Cicatriz en el brazo izquierdo', 'Marca en el antebrazo izquierdo'],
    rightArm: ['Cicatriz en el brazo derecho', 'Marca en el antebrazo derecho'],
    leftLeg: ['Cicatriz en la pierna izquierda', 'Marca en la rodilla izquierda'],
    rightLeg: ['Cicatriz en la pierna derecha', 'Marca en la rodilla derecha'],
    back: ['Cicatriz en la espalda — marca de supervivencia', 'Línea de batalla en la espalda'],
    eye: ['Cicatriz cruzando el ojo', 'Marca junto al ojo'],
    hand: ['Cicatriz en las manos', 'Marcas de combate en los dedos'],
  },
};

// --- Wound Penalty Calculation ---

const SEVERITY_PENALTY_MAP: Record<ConsequenceSeverity, () => WoundPenalty> = {
  minor: () => ({
    abilityPenalty: {},
    skillDisadvantage: [],
    speedReduction: 0,
    acPenalty: 0,
    maxHpReduction: 0,
    attackRollPenalty: 0,
    disabledActions: [],
  }),
  moderate: () => ({
    abilityPenalty: { strength: -1, dexterity: -1 },
    skillDisadvantage: ['athletics', 'acrobatics'],
    speedReduction: 1.5,
    acPenalty: 0,
    maxHpReduction: 2,
    attackRollPenalty: 0,
    disabledActions: [],
  }),
  severe: () => ({
    abilityPenalty: { strength: -2, dexterity: -2, constitution: -1 },
    skillDisadvantage: ['athletics', 'acrobatics', 'stealth', 'sleightOfHand'],
    speedReduction: 3,
    acPenalty: -1,
    maxHpReduction: 5,
    attackRollPenalty: -1,
    disabledActions: ['dash', 'disengage'],
  }),
  critical: () => ({
    abilityPenalty: { strength: -3, dexterity: -3, constitution: -2 },
    skillDisadvantage: ['athletics', 'acrobatics', 'stealth', 'sleightOfHand', 'perception'],
    speedReduction: 4.5,
    acPenalty: -2,
    maxHpReduction: 10,
    attackRollPenalty: -2,
    disabledActions: ['dash', 'disengage', 'dodge'],
  }),
  catastrophic: () => ({
    abilityPenalty: { strength: -4, dexterity: -4, constitution: -3, charisma: -2 },
    skillDisadvantage: ['athletics', 'acrobatics', 'stealth', 'sleightOfHand', 'perception', 'persuasion'],
    speedReduction: 6,
    acPenalty: -3,
    maxHpReduction: 15,
    attackRollPenalty: -3,
    disabledActions: ['dash', 'disengage', 'dodge', 'help', 'ready'],
  }),
};

// Location-specific modifiers on top of severity
const LOCATION_PENALTY_MODIFIERS: Record<WoundLocation, Partial<WoundPenalty>> = {
  head: { skillDisadvantage: ['perception', 'investigation', 'insight'] },
  torso: { maxHpReduction: 3, skillDisadvantage: ['constitution'] },
  leftArm: { attackRollPenalty: -1, skillDisadvantage: ['sleightOfHand'] },
  rightArm: { attackRollPenalty: -1, skillDisadvantage: ['sleightOfHand'] },
  leftLeg: { speedReduction: 1.5, skillDisadvantage: ['stealth'] },
  rightLeg: { speedReduction: 1.5, skillDisadvantage: ['stealth'] },
  back: { acPenalty: -1 },
  eye: { skillDisadvantage: ['perception', 'investigation', 'rangedAttacks'] },
  hand: { attackRollPenalty: -1, skillDisadvantage: ['sleightOfHand', 'medicine'] },
};

// --- Wound Creation ---

export function createWound(
  woundType: WoundType,
  location: WoundLocation,
  severity: ConsequenceSeverity,
  sourceEvent: string,
  currentTurn: number
): LastingWound {
  // Get description
  const descriptions = WOUND_DESCRIPTIONS[woundType]?.[location] ?? ['Herida persistente'];
  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  // Calculate healing parameters
  const healable = severity !== 'catastrophic' && woundType !== 'dismemberment';
  const turnsToHeal: Record<ConsequenceSeverity, number> = {
    minor: 4,
    moderate: 8,
    severe: 15,
    critical: 25,
    catastrophic: 0, // Never heals naturally
  };

  // Get penalty
  const basePenalty = SEVERITY_PENALTY_MAP[severity]();
  const locationMod = LOCATION_PENALTY_MODIFIERS[location];

  // Merge penalties (location adds to base)
  const penalty: WoundPenalty = {
    abilityPenalty: { ...basePenalty.abilityPenalty, ...locationMod.abilityPenalty },
    skillDisadvantage: [...new Set([...basePenalty.skillDisadvantage, ...locationMod.skillDisadvantage ?? []])],
    speedReduction: basePenalty.speedReduction + (locationMod.speedReduction ?? 0),
    acPenalty: basePenalty.acPenalty + (locationMod.acPenalty ?? 0),
    maxHpReduction: basePenalty.maxHpReduction + (locationMod.maxHpReduction ?? 0),
    attackRollPenalty: basePenalty.attackRollPenalty + (locationMod.attackRollPenalty ?? 0),
    disabledActions: [...new Set([...basePenalty.disabledActions, ...locationMod.disabledActions ?? []])],
  };

  // Determine if it leaves a scar
  const leavesScar = severity !== 'minor' || woundType === 'slash' || woundType === 'burn' || woundType === 'dismemberment';
  const scarDescription = leavesScar
    ? `Cicatriz de ${woundType === 'burn' ? 'quemadura' : woundType === 'slash' ? 'corte' : woundType === 'dismemberment' ? 'amputación' : 'herida'} en ${location === 'head' || location === 'eye' ? 'el rostro' : location === 'torso' ? 'el torso' : location === 'back' ? 'la espalda' : 'una extremidad'}`
    : undefined;

  return {
    id: generateConsequenceId(),
    woundType,
    location,
    receivedTurn: currentTurn,
    severity,
    healingProgress: 0,
    healable,
    turnsToHeal: turnsToHeal[severity],
    penalty,
    description,
    sourceEvent,
    leavesScar,
    scarDescription,
  };
}

// --- Wound Healing ---

/** Calculate healing progress for wounds per turn of rest. */
function calculateWoundHealing(wound: { healable: boolean; severity: ConsequenceSeverity }): number {
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

export function advanceWoundHealing(wound: LastingWound, isLongRest: boolean): LastingWound {
  if (!wound.healable || wound.healingProgress >= 100) return wound;

  const progress = isLongRest
    ? Math.min(100, wound.healingProgress + calculateWoundHealing(wound) * 3)
    : Math.min(100, wound.healingProgress + calculateWoundHealing(wound));

  return {
    ...wound,
    healingProgress: progress,
  };
}

export function isWoundHealed(wound: LastingWound): boolean {
  return wound.healingProgress >= 100;
}

// --- State Operations ---

export function addWound(state: ConsequenceState, wound: LastingWound): ConsequenceState {
  return {
    ...state,
    wounds: [...state.wounds, wound],
    updatedAt: Date.now(),
  };
}

export function removeHealedWounds(state: ConsequenceState): ConsequenceState {
  return {
    ...state,
    wounds: state.wounds.filter(w => !isWoundHealed(w)),
    updatedAt: Date.now(),
  };
}

export function healAllWoundsOneStep(state: ConsequenceState, isLongRest: boolean): ConsequenceState {
  const healed = state.wounds.map(w => advanceWoundHealing(w, isLongRest));
  return {
    ...state,
    wounds: healed,
    updatedAt: Date.now(),
  };
}

export function getActiveWounds(state: ConsequenceState): LastingWound[] {
  return state.wounds.filter(w => !isWoundHealed(w));
}

export function getWoundPenalties(state: ConsequenceState): WoundPenalty {
  const activeWounds = getActiveWounds(state);
  const combined: WoundPenalty = {
    abilityPenalty: {},
    skillDisadvantage: [],
    speedReduction: 0,
    acPenalty: 0,
    maxHpReduction: 0,
    attackRollPenalty: 0,
    disabledActions: [],
  };

  for (const wound of activeWounds) {
    for (const [key, val] of Object.entries(wound.penalty.abilityPenalty)) {
      if (val !== undefined) {
        combined.abilityPenalty[key] = (combined.abilityPenalty[key] ?? 0) + val;
      }
    }
    combined.skillDisadvantage = [...new Set([...combined.skillDisadvantage, ...wound.penalty.skillDisadvantage])];
    combined.speedReduction += wound.penalty.speedReduction;
    combined.acPenalty += wound.penalty.acPenalty;
    combined.maxHpReduction += wound.penalty.maxHpReduction;
    combined.attackRollPenalty += wound.penalty.attackRollPenalty;
    combined.disabledActions = [...new Set([...combined.disabledActions, ...wound.penalty.disabledActions])];
  }

  return combined;
}
