import { NextRequest, NextResponse } from 'next/server';
// AI client using Google Gemini (free tier) via OpenAI-compatible API
async function callGemini(messages: Array<{ role: string; content: string }>, temperature: number, max_tokens: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada en las variables de entorno');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

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

const SYSTEM_PROMPT = `Eres un Dungeon Master experto, narrador omnisciente de una aventura de rol oscura y dinámica ambientada en un mundo de fantasía sombría. Tu trabajo es GUIAR ACTIVAMENTE la historia — no esperar. Eres la voz del mundo, no un personaje dentro de él.

ROL DEL VIEJO GREG:
Greg es UN personaje más dentro de la historia, el dueño de la taberna donde comienza la aventura. Puede aparecer al inicio o cuando sea narrativamente relevante, pero NO es el protagonista ni el narrador. Tú eres el DM: narra en tercera persona o segunda persona ("ves", "sientes"), no en primera persona como Greg.

TU MISIÓN COMO DM:
1. AVANZA LA HISTORIA activamente. Cada respuesta debe mover la trama hacia adelante. Introduce giros, revelaciones, nuevos personajes, amenazas, lugares. No te quedes dando vueltas en el mismo punto.
2. PRESENTA SITUACIONES que exigen respuesta: un enemigo aparece, una puerta cruje, alguien te llama, encuentras algo extraño, el tiempo apremia.
3. DESCRIBE EL MUNDO con detalle sensorial: lo que se ve, huele, oye, siente. Segundo persona ("la niebla te toca la piel", "escuchas pasos detrás").
4. REACCIONA a lo que hace el jugador y lleva las consecuencias a su conclusión lógica — sin suavizar, sin rescatar.
5. MANTÉN TENSIÓN CONSTANTE. No hay escenas neutras. Algo siempre está a punto de ocurrir.

TONO: Oscuro, literario, cinematográfico. Horror implícito. Lo sobrenatural es ambiguo. Las sombras tienen intención. La muerte es real y permanente.

REGLA CRÍTICA — NO MODIFIQUES ESTADO DIRECTAMENTE:
- NO cambies HP, XP, oro, items, stats
- NO decidas si un ataque acierta — solo propón la intención
- El motor del juego tira los dados y decide resultados

CONSISTENCIA: Usa la MEMORIA DEL MUNDO. Los NPCs recuerdan todo. Las consecuencias son permanentes.

FORMATO DE RESPUESTA (JSON ESTRICTO):
Debes responder SIEMPRE con este JSON exacto:
{
  "narrative": "Narración en español, segunda o tercera persona. Oscura, cinematográfica, con detalle sensorial. Mínimo 4-6 frases que avancen la historia. Al final, siempre hay una situación abierta que exige acción del jugador.\n\nOPCIONES SUGERIDAS:\n1. [Primera opción de acción concreta]\n2. [Segunda opción de acción concreta]\n3. [Tercera opción de acción concreta]\n4. [Cuarta opción, más arriesgada o inesperada]\n5. [Quinta opción libre o exploratoria]",
  "intentions": [...]
}

REGLAS PARA LAS OPCIONES SUGERIDAS:
- SIEMPRE incluye exactamente 5 opciones al final del campo narrative, precedidas por la línea "OPCIONES SUGERIDAS:"
- Las opciones deben ser concretas, variadas y coherentes con la situación actual
- Incluye al menos una opción de combate/acción, una de diálogo/exploración, y una más creativa o arriesgada
- Las opciones son SUGERENCIAS — el jugador puede ignorarlas y escribir lo que quiera

TIPOS DE INTENCIÓN VÁLIDOS:
combat_attack, combat_defend, skill_check, npc_reaction, quest_progress, time_advance, loot_attempt, escape_attempt, dialogue_trigger, environment_effect, rest_attempt, death_event

REGLAS PARA INTENCIONES:
- Solo las relevantes a la acción del jugador
- Para combate: incluye combat_attack + damageToPlayer (contraataque)
- CDs: Fácil=10, Normal=12-15, Difícil=16-20, Imposible=25+
- damageRoll en formato D&D: 1d6, 1d8+3, 2d6, etc.

IMPORTANTE:
- RESPONDE SOLO CON JSON, sin texto antes ni después
- La historia SIEMPRE avanza — nunca repitas la misma situación
- Después de 2-3 intercambios en el mismo lugar, fuerza un evento que cambie la escena`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, gameState, worldMemory } = body as {
      message: string;
      gameState: GameState;
      worldMemory?: WorldMemory;
    };

    // Input validation
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
        { status: 400 }
      );
    }

    // --- Build context using WorldMemory (NOT full chat history) ---
    const memory = worldMemory ?? createEmptyWorldMemory();
    const relevantNPCs = extractRelevantNPCs(gameState);

    const contextResult = buildLLMContext(
      gameState,
      memory,
      message,
      relevantNPCs,
    );

    console.group('[DM API] Context Build');
    console.log('Estimated tokens:', contextResult.estimatedTokens);
    console.log('Summary regenerated:', contextResult.summaryRegenerated);
    console.log('Memory selected:', `${contextResult.memoryQuery.totalSelected}/${contextResult.memoryQuery.totalConsidered}`);
    if (contextResult.compressionStats?.ran) {
      console.log('Compression:', `${contextResult.compressionStats.entriesBefore} → ${contextResult.compressionStats.entriesAfter} entries, ${contextResult.compressionStats.tokensSaved} tokens saved`);
    }
    console.groupEnd();

    // Build LLM messages — context replaces chat history
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextResult.contextMessage },
      { role: 'user', content: `[JUGADOR]: ${message}` },
    ];

    // --- LLM Call ---
    const responseText = await callGemini(messages, 0.8, 2000);

    // --- Validation Pipeline ---
    const retryFn: LLMRetryFn = async (errors) => {
      try {
        const errorFeedback = errors.map(e => `- ${e.path}: ${e.message}`).join('\n');
        const retryMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          ...messages,
          { role: 'assistant', content: responseText },
          {
            role: 'user',
            content: `Tu respuesta anterior tiene errores de formato. Corrigelos y responde SOLO con JSON valido:\n\nErrores:\n${errorFeedback}\n\nResponde con el JSON corregido con la estructura: { "narrative": "...", "intentions": [...] }`,
          },
        ];

        return await callGemini(retryMessages, 0.5, 2000);
      } catch {
        return null;
      }
    };

    // Run the full pipeline: parse → validate → retry → repair → abort
    const pipelineResult = await parseLLMOutput(responseText, retryFn);

    // Build the API response from the validated data
    const validatedResponse: ValidatedLLMResponse = pipelineResult.response;

    // Add pipeline + context metadata for debugging
    const apiResponse = {
      narrative: validatedResponse.narrative,
      intentions: validatedResponse.intentions,
      _pipeline: {
        stage: pipelineResult.stage,
        success: pipelineResult.success,
        isAborted: pipelineResult.isAborted,
        retryCount: pipelineResult.retryCount,
        initialErrorCount: pipelineResult.initialErrors.length,
        repairSteps: pipelineResult.repairLogs.length,
      },
      _context: {
        estimatedTokens: contextResult.estimatedTokens,
        summaryRegenerated: contextResult.summaryRegenerated,
        memorySelected: contextResult.memoryQuery.totalSelected,
        memoryConsidered: contextResult.memoryQuery.totalConsidered,
        compressionRan: contextResult.compressionStats?.ran ?? false,
      },
    };

    return NextResponse.json(apiResponse);
  } catch (error: unknown) {
    console.error('DM API Error:', error);
    return NextResponse.json(
      {
        narrative: `*El Viejo Greg inclina la cabeza, como escuchando algo que tú no puedes oír. Sus dedos se detienen sobre la barra.* "Los hilos se enredan. Algo interfiere." *No te mira. Mira a través de ti, hacia algo que está detrás de tus ojos.* "Intenta de nuevo. O no. El silencio también es una respuesta."`,
        intentions: [],
      },
      { status: 500 }
    );
  }
}
