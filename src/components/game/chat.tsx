'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useGameStore } from '@/store/game-store';
import { type IntentionResolution, type DiceRoll } from '@/lib/game-types';
import { fetchJSON, APIError } from '@/lib/api-utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Send, Loader2, Dices, MapPin, Clock, Swords, Heart, ScrollText, Shield, Zap } from 'lucide-react';

const DM_REQUEST_TIMEOUT = 120000; // 2 minutes timeout for DM requests

/** The shape returned by /api/dm after Zod validation pipeline */
interface DMApiResponse {
  narrative: string;
  intentions: Array<Record<string, unknown>>;
  /** Pipeline diagnostic info (optional) */
  _pipeline?: {
    stage: 'parse' | 'validate' | 'retry' | 'repair' | 'abort';
    success: boolean;
    isAborted: boolean;
    retryCount: number;
    initialErrorCount: number;
    repairSteps: number;
  };
  /** Context builder diagnostic info (optional) */
  _context?: {
    estimatedTokens: number;
    summaryRegenerated: boolean;
    memorySelected: number;
    memoryConsidered: number;
    compressionRan: boolean;
  };
}

export default function Chat() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  const {
    game,
    worldMemory,
    addChatMessage,
    processAIIntentions,
  } = useGameStore();

  const chatHistory = game.chatHistory;
  const narrative = game.narrative;

  // Smart auto-scroll: only scroll to bottom if user is already near the bottom
  const checkIfNearBottom = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const playerMessage = input.trim();
    setInput('');

    // Add player message
    addChatMessage({
      role: 'player',
      content: playerMessage,
    });

    setIsProcessing(true);

    try {
      // Fetch from the DM API — the response has been validated through Zod pipeline
      const data = await fetchJSON<DMApiResponse>('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: playerMessage,
          gameState: game,
          worldMemory: worldMemory,
        }),
        timeout: DM_REQUEST_TIMEOUT,
      });

      // Log pipeline diagnostics if present
      if (data._pipeline) {
        console.group('[Chat] Pipeline Diagnostics');
        console.log('Stage:', data._pipeline.stage);
        console.log('Success:', data._pipeline.success);
        console.log('Aborted:', data._pipeline.isAborted);
        console.log('Retries:', data._pipeline.retryCount);
        console.log('Initial errors:', data._pipeline.initialErrorCount);
        console.log('Repair steps:', data._pipeline.repairSteps);
        console.groupEnd();
        // Store for debug panel
        if (typeof window !== 'undefined') {
          if (!window.__TABERNA_DEBUG) window.__TABERNA_DEBUG = { errors: [] };
          window.__TABERNA_DEBUG.lastPipeline = { ...data._pipeline, timestamp: Date.now() };
        }
      }

      // Log context builder diagnostics
      if (data._context) {
        console.group('[Chat] Context Builder Diagnostics');
        console.log('Estimated tokens:', data._context.estimatedTokens);
        console.log('Summary regenerated:', data._context.summaryRegenerated);
        console.log('Memory selected:', `${data._context.memorySelected}/${data._context.memoryConsidered}`);
        console.log('Compression ran:', data._context.compressionRan);
        console.groupEnd();
        // Store for debug panel
        if (typeof window !== 'undefined') {
          if (!window.__TABERNA_DEBUG) window.__TABERNA_DEBUG = { errors: [] };
          window.__TABERNA_DEBUG.lastContext = { ...data._context, timestamp: Date.now() };
        }
      }

      // The response from /api/dm is already validated through the Zod pipeline.
      // narrative is guaranteed to be a non-empty string.
      // intentions is guaranteed to be an array of valid Intention objects.
      const { narrative: dmNarrative, intentions } = data;

      // Store raw intentions for debug panel
      if (typeof window !== 'undefined' && intentions) {
        if (!window.__TABERNA_DEBUG) window.__TABERNA_DEBUG = { errors: [] };
        window.__TABERNA_DEBUG.lastIntentions = intentions as Array<Record<string, unknown>>;
      }

      // Process intentions through GameEngine (the ONLY path to state changes)
      if (intentions && intentions.length > 0) {
        const result = processAIIntentions(intentions as unknown as Array<import('@/lib/game-types').Intention>, dmNarrative);
        // Store resolutions for debug panel
        if (typeof window !== 'undefined' && result?.resolutions) {
          if (!window.__TABERNA_DEBUG) window.__TABERNA_DEBUG = { errors: [] };
          window.__TABERNA_DEBUG.lastResolutions = result.resolutions.map(r => ({
            intention: r.intention as unknown as Record<string, unknown>,
            success: r.success,
            resultText: r.resultText,
          }));
        }
      } else {
        // No intentions — just add the narrative as a DM message
        addChatMessage({
          role: 'dm',
          content: dmNarrative,
        });
      }
    } catch (error: unknown) {
      console.error('DM communication error:', error);
      // Store error for debug panel
      if (typeof window !== 'undefined') {
        if (!window.__TABERNA_DEBUG) window.__TABERNA_DEBUG = { errors: [] };
        const msg = error instanceof Error ? error.message : String(error);
        window.__TABERNA_DEBUG.errors.push({ message: msg, timestamp: Date.now() });
        if (window.__TABERNA_DEBUG.errors.length > 20) {
          window.__TABERNA_DEBUG.errors = window.__TABERNA_DEBUG.errors.slice(-20);
        }
      }
      let userMessage: string;
      if (error instanceof APIError) {
        userMessage = `⚠️ ${error.message}`;
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        userMessage = '⏱️ El Dungeon Master está tardando demasiado. Intenta de nuevo.';
      } else {
        userMessage = '⚠️ Error de comunicación con el Dungeon Master. Intenta de nuevo.';
      }
      addChatMessage({ role: 'system', content: userMessage });
      toast.error(error instanceof APIError ? error.message : 'Error al comunicarse con el DM');
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderDiceRoll = (roll: DiceRoll, index: number) => (
    <div key={index} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
      <Dices className="w-3 h-3 text-primary" />
      <span className="font-mono font-bold">{roll.type}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-bold text-primary">{roll.result}</span>
      <span className="text-muted-foreground">({roll.breakdown})</span>
      <span className="text-muted-foreground italic">{roll.purpose}</span>
    </div>
  );

  const renderIntentionResult = (resolution: IntentionResolution, index: number) => {
    const isSuccess = resolution.success;
    return (
      <div key={index} className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${
        isSuccess ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'
      }`}>
        {resolution.intention.type === 'combat_attack' && <Swords className="w-3 h-3" />}
        {resolution.intention.type === 'skill_check' && <Zap className="w-3 h-3" />}
        {resolution.intention.type === 'combat_defend' && <Shield className="w-3 h-3" />}
        {!['combat_attack', 'skill_check', 'combat_defend'].includes(resolution.intention.type) && <Dices className="w-3 h-3" />}
        <span className="font-medium">{resolution.resultText}</span>
      </div>
    );
  };

  const renderMessage = (msg: typeof chatHistory[0], index: number) => {
    const isPlayer = msg.role === 'player';
    const isDM = msg.role === 'dm';
    const isSystem = msg.role === 'system';

    return (
      <div
        key={msg.id || index}
        className={`animate-fade-in ${isPlayer ? 'flex justify-end' : ''}`}
      >
        <div
          className={`max-w-[85%] rounded-xl px-4 py-3 ${
            isPlayer
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : isSystem
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm'
              : 'bg-card border rounded-bl-sm'
          }`}
        >
          {/* Role badge */}
          <div className="flex items-center gap-2 mb-1">
            {isPlayer && <Badge variant="secondary" className="text-xs bg-primary-foreground/20 text-primary-foreground">Tú</Badge>}
            {isDM && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                <ScrollText className="w-3 h-3 mr-1" />
                Dungeon Master
              </Badge>
            )}
            {isSystem && <Badge variant="destructive" className="text-xs">Sistema</Badge>}
          </div>

          {/* Content - render markdown for DM messages */}
          <div className={`text-sm leading-relaxed ${isDM ? 'dm-narrative' : 'whitespace-pre-wrap'}`}>
            {isDM ? (() => {
              const parts = msg.content.split(/OPCIONES SUGERIDAS:/);
              const mainText = parts[0].trim();
              const optionsText = parts[1] || '';
              const options = optionsText
                .split(/\n/)
                .map(l => l.trim())
                .filter(l => /^[1-5][\.\)]/.test(l))
                .map(l => l.replace(/^[1-5][\.\)]\s*/, ''));
              return (
                <>
                  <ReactMarkdown>{mainText}</ReactMarkdown>
                  {options.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Opciones sugeridas</p>
                      {options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setInput(opt)}
                          className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-primary/10 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <span className="font-bold text-primary mr-2">{i + 1}.</span>{opt}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })() : (
              msg.content
            )}
          </div>

          {/* Engine dice rolls (real rolls from GameEngine) */}
          {msg.diceRolls && msg.diceRolls.length > 0 && (
            <div className="mt-2 space-y-1">
              {msg.diceRolls.map((roll, i) => renderDiceRoll(roll, i))}
            </div>
          )}

          {/* Intention resolutions (engine results) — stored as extra field on message */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(msg as any).intentionResolutions && Array.isArray((msg as any).intentionResolutions) && (msg as any).intentionResolutions.length > 0 && (
            <div className="mt-2 space-y-1">
              {((msg as any).intentionResolutions as IntentionResolution[]).map((res: IntentionResolution, i: number) => renderIntentionResult(res, i))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-card/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          <span>{narrative.location}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Día {narrative.day} • {narrative.timeOfDay}</span>
        </div>
        {game.character && (
          <>
            <div className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-hp" />
              <span>{game.character.currentHp}/{game.character.maxHp}</span>
            </div>
            <div className="flex items-center gap-1">
              <Swords className="w-3 h-3 text-primary" />
              <span>CA {game.character.armorClass}</span>
            </div>
          </>
        )}
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
        onScroll={checkIfNearBottom}
      >
        {chatHistory.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground space-y-2">
              <ScrollText className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">El silencio espera...</p>
              <p className="text-xs">Crea tu personaje para comenzar</p>
            </div>
          </div>
        )}
        {chatHistory.map((msg, i) => renderMessage(msg, i))}
        {isProcessing && (
          <div className="flex items-start gap-2 animate-fade-in">
            <div className="bg-card border rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">El Viejo Greg escucha algo que tú no puedes oír...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-3 border-t bg-card/50">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe tu acción... (Enter para enviar, Shift+Enter nueva línea)"
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            disabled={isProcessing}
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={isProcessing || !input.trim()}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
            aria-label="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
