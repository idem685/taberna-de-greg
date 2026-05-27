import { NextRequest, NextResponse } from 'next/server';
async function callGroq(messages: Array<{ role: string; content: string }>, temperature: number, max_tokens: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada en las variables de entorno');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature, max_tokens }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Groq API error ${response.status}: ${err}`); }
  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}
import { type GameState } from '@/lib/game-types';
import { parseLLMOutput, type LLMRetryFn } from '@/lib/llm/parser';
import type { ValidatedLLMResponse } from '@/lib/llm/schema';
import {
  type WorldMemory,
  createEmptyWorldMemory,
  buildLLMContext,
  extractRelevantNPCs,
} from '@/lib/world-memory';

const MAX_MESSAGE_LENGTH = 2000;

// ==========================================
// SYSTEM PROMPT — Intention-Based Architecture
// ==========================================
// The LLM NO LONGER receives full chat history.
// Instead it receives: semantic summary + current state + relevant memories
// This saves massive context tokens and improves consistency.

const SYSTEM_PROMPT = `Eres un Dungeon Master maestro. Narras aventuras de rol oscuras, cinematográficas e inmersivas. Tu escritura es literaria, con detalle sensorial, tensión constante y consecuencias reales.

ESTILO NARRATIVO (como el ejemplo):
- Escribe en segunda persona ("tus dedos se aferran", "tu corazón late")
- Describe lo que el personaje siente físicamente: frío, peso, adrenalina, olor
- Incluye pensamientos internos del personaje en cursiva con *asteriscos*
- Cada escena tiene urgencia — algo siempre está a punto de ocurrir
- Mínimo 4-6 párrafos ricos en detalle antes de las opciones
- La historia SIEMPRE avanza — introduce personajes, giros, revelaciones, peligros nuevos

ESTRUCTURA DE RESPUESTA OBLIGATORIA:
Escribe primero la narrativa completa en texto libre (sin JSON), luego al final agrega exactamente esto:

[OPCIONES]
1. (primera opción concreta y específica)
2. (segunda opción)
3. (tercera opción)
4. (cuarta opción, más arriesgada)
5. (quinta opción creativa o inesperada)
[/OPCIONES]

[INTENCIONES]
{"intentions":[]}
[/INTENCIONES]

REGLAS PARA LAS INTENCIONES (el bloque JSON al final):
- Solo incluye intenciones si el jugador hizo algo que las requiere
- Si el jugador solo habla o explora: {"intentions":[]}
- Tipos válidos: combat_attack, combat_defend, skill_check, npc_reaction, quest_progress, time_advance, loot_attempt, escape_attempt, dialogue_trigger, environment_effect, rest_attempt, death_event
- Ejemplo con intención: {"intentions":[{"type":"skill_check","description":"Sigilosa entre las sombras","dc":13}]}
- NO decidas resultados numéricos — el motor tira los dados

ROL DEL VIEJO GREG:
Es un NPC más — el dueño de la taberna donde empieza la historia. Aparece cuando es relevante. Tú eres el narrador omnisciente, no Greg.

REGLA CRÍTICA:
- NO modifiques HP, XP, oro ni stats directamente
- Solo propón intenciones en el bloque [INTENCIONES]
- La narrativa NO lleva JSON incrustado — va separada

MEMORIA: Usa la información de contexto del mundo para mantener consistencia. Los NPCs recuerdan todo.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, gameState, worldMemory } = body as {
      message: string;
      gameState: GameState;
      worldMemory?: WorldMemory;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` }, { status: 400 });
    }

    // Build context using WorldMemory
    const memory = worldMemory ?? createEmptyWorldMemory();
    const relevantNPCs = extractRelevantNPCs(gameState);
    const contextResult = buildLLMContext(gameState, memory, message, relevantNPCs);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextResult.contextMessage },
      { role: 'user', content: `[JUGADOR]: ${message}` },
    ];

    const rawText = await callGroq(messages, 0.85, 2000);

    // Parse the free-text response
    const { parseDMResponse } = await import('./parse-response');
    const parsed = parseDMResponse(rawText);

    return NextResponse.json({
      narrative: parsed.narrative,
      options: parsed.options,
      intentions: parsed.intentions,
    });

  } catch (error: unknown) {
    console.error('DM API Error:', error);
    return NextResponse.json(
      {
        narrative: `*El Dungeon Master observa la escena en silencio durante un momento, como si algo hubiera interrumpido el flujo del destino.* La historia continúa... intenta de nuevo.`,
        options: [],
        intentions: [],
      },
      { status: 500 }
    );
  }
}
