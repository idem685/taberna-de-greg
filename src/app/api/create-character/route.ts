import { NextRequest, NextResponse } from 'next/server';
// AI client using Google Gemini (free tier) via OpenAI-compatible API
async function callGemini(messages: Array<{ role: string; content: string }>, temperature: number, max_tokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en las variables de entorno');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gemini-2.0-flash', messages, temperature, max_tokens }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Gemini API error ${response.status}: ${err}`); }
  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}
import { transformKeysDeep } from '@/lib/game-types';
import { sanitizeAIItem, sanitizeAIResponse } from '@/lib/api-utils';
import { sanitizeCurrency } from '@/lib/game-engine';

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;

const CHARACTER_CREATION_PROMPT = `Eres un Dungeon Master experto en D&D 5e. Un jugador quiere crear un personaje describiéndolo en texto libre. 

Tu tarea es:
1. Interpretar la descripción del jugador y crear un personaje de D&D 5e coherente
2. Generar estadísticas apropiadas usando método estándar (27 point buy o 4d6 drop lowest)
3. Asignar raza, clase y subclase basándote en la descripción
4. Crear equipo inicial apropiado para la clase
5. Dar una narrativa de apertura oscura, elegante e inquietante

Responde SOLO en formato JSON con esta estructura exacta:
{
  "character": {
    "name": "Nombre del personaje",
    "race": "Raza",
    "class": "Clase",
    "subclass": "Subclase (si aplica, sino vacío)",
    "level": 1,
    "currentHp": valor,
    "maxHp": valor,
    "temporaryHp": 0,
    "experience": 0,
    "experienceToNext": 300,
    "armorClass": valor (10 + DES mod + armadura),
    "initiative": mod_des,
    "speed": 30,
    "proficiencyBonus": 2,
    "abilityScores": {
      "strength": valor,
      "dexterity": valor,
      "constitution": valor,
      "intelligence": valor,
      "wisdom": valor,
      "charisma": valor
    },
    "savingThrows": {
      "strength": true/false,
      "dexterity": true/false,
      "constitution": true/false,
      "intelligence": true/false,
      "wisdom": true/false,
      "charisma": true/false
    },
    "skills": [
      { "key": "skill_key", "name": "Nombre en español", "ability": "ability_key", "proficient": true/false, "expertise": false }
    ],
    "hitDice": "1d8",
    "hitDiceRemaining": 1,
    "deathSaves": { "successes": 0, "failures": 0 },
    "conditions": [],
    "backstory": "Breve backstory basado en la descripción del jugador"
  },
  "startingInventory": [
    {
      "id": "uuid1",
      "name": "Nombre del objeto",
      "description": "Descripción",
      "category": "weapon|armor|potion|important|misc",
      "rarity": "common",
      "weight": 3,
      "value": 1000,
      "effect": "",
      "equipped": true/false,
      "equipSlot": "weapon|armor|shield|accessory|null",
      "damage": "1d8",
      "damageType": "slashing",
      "armorBonus": 0,
      "quantity": 1
    }
  ],
  "startingCurrency": { "gold": 10, "silver": 0, "copper": 0 },
  "initialQuest": {
    "id": "quest_1",
    "name": "Nombre de la misión inicial",
    "description": "Descripción de la misión",
    "status": "active",
    "recommendedLevel": "1-3",
    "experienceReward": 100,
    "coinReward": "50 oro",
    "itemRewards": ["Recompensa"],
    "followed": true,
    "objectives": ["Primer objetivo"],
    "completedObjectives": []
  },
  "initialNPCs": [
    {
      "id": "npc_1",
      "name": "Viejo Greg",
      "race": "Humano",
      "location": "Taberna del Viejo Greg",
      "reputation": "neutral",
      "reputationScore": 0,
      "lastInteraction": "Sabía que vendrías.",
      "interactionHistory": ["Sabía que vendrías."],
      "notes": "Dueño de la taberna. Sabe cosas que no debería saber. Su familiaridad es inquietante, no hospitalaria. Nadie entra aquí por voluntad propia.",
      "alive": true
    }
  ],
  "openingNarrative": "Narrativa de apertura en español. TONO: oscuro, elegante, inquietante. CONDICIONES OBLIGATORIAS: (1) El personaje YA ESTÁ dentro de la taberna, sentado — NO recuerda haber entrado. (2) Greg ya lo observa y dice algo que revela conocimiento imposible sobre el personaje — un detalle íntimo, un nombre que no compartió, un secreto. (3) Hay tensión inmediata: los otros parroquianos no se mueven, el aire es denso, algo sobrenatural es ambiguo. (4) Greg presenta una elección binaria que no se puede evitar — dos caminos mutuamente excluyentes que constituyen la primera decisión importante. (5) Mínimo 8-10 frases, prosa literaria, sensorial y perturbadora. PROHIBIDO: clichés de taberna RPG (chimenea acogedora, cerveza espumosa, posadero amable, aventureros bulliciosos). NO suavizar."
}

REGLAS:
- Las estadísticas deben ser coherentes con la clase elegida (guerrero => FUE alta, mago => INT alta, etc.)
- El equipo inicial debe ser apropiado para nivel 1
- Los valores en value son en piezas de cobre (100 cobre = 1 oro)
- hitDice según clase: Mago=1d6, Pícaro/Bardo/Monje=1d8, Guerrero/Paladín/Ranger=1d10, Bárbaro=1d12
- Asigna salvaciones competentes según la clase
- Asigna habilidades competentes según la clase (normalmente 2-4)
- Los skills deben incluir TODOS los 18 skills con proficient=true/false
- La narrativa de apertura debe ser OSCURA, ELEGANTE e INQUIETANTE. No es una bienvenida cálida — es una trampa suave. Greg sabe algo imposible sobre el personaje. El jugador no recuerda haber entrado. Hay algo sobrenatural y ambiguo. La primera decisión importante debe plantearse en la propia narrativa de apertura (antes del turno 5). Cero clichés de taberna RPG genérica.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description } = body;

    // Input validation with proper length checks
    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Se requiere una descripción del personaje' },
        { status: 400 }
      );
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < MIN_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `La descripción es muy corta (mínimo ${MIN_DESCRIPTION_LENGTH} caracteres)` },
        { status: 400 }
      );
    }

    if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `La descripción es muy larga (máximo ${MAX_DESCRIPTION_LENGTH} caracteres)` },
        { status: 400 }
      );
    }

    const responseText = await callGemini([
        { role: 'system', content: CHARACTER_CREATION_PROMPT },
        { role: 'user', content: `Quiero crear un personaje: ${trimmedDesc}` },
      ], 0.7, 3000);

    // Parse the JSON response
    let parsedResponse;
    try {
      let jsonStr = responseText.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      const rawParsed = JSON.parse(jsonStr);
      // Transform ALL snake_case keys to camelCase (AI may return either format)
      const transformed = transformKeysDeep(rawParsed) as Record<string, unknown>;
      // Sanitize AI data (fix "null" strings in equipSlot, etc.)
      parsedResponse = sanitizeAIResponse(transformed);
    } catch {
      return NextResponse.json(
        {
          error: 'Error al generar el personaje. Intenta con una descripción más detallada.',
          raw: responseText,
        },
        { status: 500 }
      );
    }

    // Validate the AI output has required fields
    if (!parsedResponse.character) {
      return NextResponse.json(
        {
          error: 'El Dungeon Master no pudo crear tu personaje. Intenta con una descripción diferente.',
          raw: responseText,
        },
        { status: 500 }
      );
    }

    // Ensure character has required fields with defaults
    const char = parsedResponse.character as Record<string, unknown>;

    // Sanitize skills array if present (fix snake_case keys from AI)
    const rawSkills = char.skills as Array<Record<string, unknown>> | undefined;
    const safeSkills = Array.isArray(rawSkills) ? rawSkills.map(s => {
      let skillKey = String(s.key || '');
      // Fix snake_case skill keys: "sleight_of_hand" → "sleightOfHand"
      if (skillKey.includes('_')) {
        skillKey = skillKey.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      }
      return {
        key: skillKey,
        name: s.name || '',
        ability: s.ability || 'strength',
        proficient: s.proficient === true,
        expertise: s.expertise === true,
      };
    }) : [];

    // Sanitize starting inventory items
    const rawInventory = parsedResponse.startingInventory as Array<Record<string, unknown>> | undefined;
    const safeInventory = Array.isArray(rawInventory) ? rawInventory.map(sanitizeAIItem) : [];
    parsedResponse.startingInventory = safeInventory;

    // Sanitize starting currency using GameEngine
    const rawCurrency = parsedResponse.startingCurrency as Record<string, number> | undefined;
    if (rawCurrency) {
      parsedResponse.startingCurrency = sanitizeCurrency({
        gold: rawCurrency.gold ?? 0,
        silver: rawCurrency.silver ?? 0,
        copper: rawCurrency.copper ?? 0,
      });
    }

    parsedResponse.character = {
      name: char.name || 'Aventurero',
      race: char.race || 'Humano',
      class: char.class || 'Guerrero',
      subclass: char.subclass || '',
      level: typeof char.level === 'number' ? char.level : 1,
      currentHp: typeof char.currentHp === 'number' ? char.currentHp : (typeof char.maxHp === 'number' ? char.maxHp : 10),
      maxHp: typeof char.maxHp === 'number' ? char.maxHp : 10,
      temporaryHp: typeof char.temporaryHp === 'number' ? char.temporaryHp : 0,
      experience: typeof char.experience === 'number' ? char.experience : 0,
      experienceToNext: typeof char.experienceToNext === 'number' ? char.experienceToNext : 300,
      armorClass: typeof char.armorClass === 'number' ? char.armorClass : 10,
      initiative: typeof char.initiative === 'number' ? char.initiative : 0,
      speed: typeof char.speed === 'number' ? char.speed : 30,
      proficiencyBonus: typeof char.proficiencyBonus === 'number' ? char.proficiencyBonus : 2,
      abilityScores: char.abilityScores ?? {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
      },
      savingThrows: char.savingThrows ?? {
        strength: false, dexterity: false, constitution: false,
        intelligence: false, wisdom: false, charisma: false,
      },
      skills: safeSkills,
      hitDice: char.hitDice ?? '1d8',
      hitDiceRemaining: typeof char.hitDiceRemaining === 'number' ? char.hitDiceRemaining : 1,
      deathSaves: char.deathSaves ?? { successes: 0, failures: 0 },
      conditions: Array.isArray(char.conditions) ? char.conditions : [],
      backstory: char.backstory || '',
    };

    return NextResponse.json(parsedResponse);
  } catch (error: unknown) {
    console.error('Character Creation API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Error del servidor: ${errorMessage}` },
      { status: 500 }
    );
  }
}
