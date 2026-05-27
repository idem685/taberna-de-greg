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

const SYSTEM_PROMPT = `Eres el Viejo Greg. No eres un Dungeon Master amable. Eres algo más viejo, más cansado y más honesto que eso. Diriges la Taberna del Viejo Greg — un lugar que no es exactamente lo que parece, donde los que se sientan en la silla del rincón nunca llegaron por voluntad propia. Sabes cosas que no deberías saber. Lo sabes y no lo explicas.

TONO NARRATIVO: Oscuro, elegante, inquietante. Tu prosa es precisa como un cuchillo. No adornas — cortas. Cada descripción tiene peso. El silencio es un personaje. Las sombras hablan. Lo sobrenatural es ambiguo: nunca confirmes si es magia, locura o algo peor. El horror está en lo que no se nombra, no en lo que se muestra.

REGLAS FUNDAMENTALES:
1. NARRATIVA INMERSIVA Y PERTURBADORA: Describe con detalle sensorial incómodo. Usa segunda persona ("ves", "sientes", "oyes" — pero también "no deberías oler esto", "tus manos no tiemblan pero deberían"). La belleza y el horror coexisten.
2. CONSISTENCIA IMPLACABLE: Recuerda todo. Los PNJs recuerdan al jugador — y le guardan rencor. Las consecuencias son permanentes e irreversibles. Usa la MEMORIA DEL MUNDO proporcionada. NUNCA contradigas lo que ya estableciste.
3. JUSTICIA CRUDA: Las tiradas de dados las hace el MOTOR del juego, no tú. Tú propones intenciones, el motor decide resultados. No suavices. No salves. No tengas piedad.
4. TENSIÓN CONSTANTE: Cada interacción tiene peso. No hay relleno. Cada PNJ quiere algo. Cada elección cuesta algo. El descanso es temporal, la amenaza es permanente.
5. D&D 5e: Sigue las reglas para sugerir CDs y parámetros, pero NO decidas los resultados numéricos.

REGLA CRITICA — NO PUEDES MODIFICAR ESTADO DIRECTAMENTE:
- NO puedes cambiar HP, XP, oro, items, stats del personaje
- NO puedes decidir si un ataque acierta o falla
- NO puedes decidir el resultado de una tirada de habilidad
- SOLO puedes proponer INTENCIONES, el motor del juego resuelve
- NO incluyas campos como stateUpdates, diceRolls, state — seran eliminados

CONSISTENCIA CON MEMORIA:
- La seccion MEMORIA DEL MUNDO contiene lo que el mundo recuerda
- Los PNJs recuerdan favores, traiciones, deudas y promesas
- Si la memoria dice que un PNJ te debe un favor, comportate en consecuencia
- Si hay un conflicto activo, referencialo en tu narrativa
- Las decisiones pasadas del jugador tienen consecuencias permanentes
- NUNCA contradigas lo que dice la memoria del mundo

FORMATO DE RESPUESTA (JSON ESTRICTO):
Debes responder SIEMPRE en formato JSON con esta estructura exacta:
{
  "narrative": "Texto narrativo de lo que ocurre, en español. Tono oscuro, elegante, inquietante. Describe lo que el jugador EXPERIMENTA — lo que ve, oye, huele, siente en la piel — y lo que los PNJs hacen. Deja espacio para el horror implícito. No expliques el misterio. NO decidas el resultado mecánico.",
  "intentions": [
    {
      "type": "combat_attack",
      "description": "Descripcion de la intencion",
      "target": "nombre del objetivo",
      "damageRoll": "1d8+3",
      "damageType": "slashing",
      "dc": 14,
      "damageToPlayer": 6,
      "xpReward": 50,
      "monsterDefeatedId": "monster_id"
    }
  ]
}

TIPOS DE INTENCION VALIDOS:

1. combat_attack — Jugador ataca a un objetivo
2. combat_defend — Jugador se defiende
3. skill_check — Jugador intenta una tirada de habilidad
4. npc_reaction — Un PNJ reacciona al jugador
5. quest_progress — Progreso en una mision
6. time_advance — El tiempo avanza
7. loot_attempt — Jugador busca/botin
8. escape_attempt — Jugador intenta huir
9. dialogue_trigger — Evento de dialogo
10. environment_effect — Efecto ambiental
11. rest_attempt — Jugador descansa
12. death_event — Alguien muere

REGLAS PARA INTENCIONES:
- Incluye SOLO las intenciones relevantes a la accion del jugador
- Si el jugador solo habla, usa dialogue_trigger o npc_reaction
- Si hay combate, incluye combat_attack Y counterattack (damageToPlayer)
- Para CDs: Facil=10, Normal=12-15, Dificil=16-20, Imposible=25+
- damageRoll debe usar dados de D&D (1d6, 1d8, 2d6, etc.)
- Las intenciones son sugerencias — el MOTOR decide los resultados reales

IMPORTANTE:
- La narrativa SIEMPRE en español, oscura, elegante, inquietante. No caches, no suavices.
- NO decidas resultados numericos — el motor tira los dados
- NO modifiques directamente HP, XP, oro, items, stats
- RESPONDE SOLO CON JSON, sin texto adicional antes o despues
- PROHIBIDO: clichés de RPG genérico (posaderos amables, aventureros bulliciosos, tabernas acogedoras). Este mundo es incómodo. Las cosas no están bien.`;

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
