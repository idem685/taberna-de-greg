// ==========================================
// TABERNA DEL VIEJO GREG - LLM Output Parser
// ==========================================
// The central pipeline that processes raw LLM output into validated data.
//
// PIPELINE (mandatory, no shortcuts):
//   1. PARSE      — Extract JSON from raw model output
//   2. VALIDATE   — Run through Zod schemas (strict mode)
//   3. RETRY      — If validation fails, re-prompt the LLM (up to N times)
//   4. REPAIR     — If retry also fails, attempt heuristic repair
//   5. ABORT      — If repair also fails, abort the turn with a safe fallback
//
// INVARIANTS (never violated):
//   - No narrative without validated intentions array
//   - No partial state (missing fields get defaults, never undefined)
//   - No invalid intention type ever reaches the GameEngine
//   - All logging uses console.group for easy filtering

import {
  LLMResponseSchema,
  type ValidatedLLMResponse,
  type ValidationError,
  type ValidationResult,
} from './schema';
import { repairLLMResponse, createAbortResponse, type RepairLog } from './repair';

// --- Pipeline Configuration ---

const MAX_RETRY_ATTEMPTS = 1; // Re-prompt the LLM once if validation fails
const RAW_OUTPUT_MAX_LENGTH = 50000; // Truncate absurdly long outputs

// --- Pipeline Result ---

export interface ParsePipelineResult {
  /** The final validated response (always present, may be abort fallback) */
  response: ValidatedLLMResponse;
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Which stage the pipeline ended at */
  stage: 'parse' | 'validate' | 'retry' | 'repair' | 'abort';
  /** Validation errors from the initial parse */
  initialErrors: ValidationError[];
  /** Repair log if repair was attempted */
  repairLogs: RepairLog[];
  /** Number of LLM retries attempted */
  retryCount: number;
  /** Whether the final response is an abort fallback */
  isAborted: boolean;
}

// --- Stage 1: PARSE ---

/**
 * Extract JSON from raw LLM output.
 * The LLM may wrap its JSON in markdown code blocks, add preamble text, etc.
 */
function parseRawOutput(rawText: string): {
  data: Record<string, unknown> | null;
  error: string | null;
} {
  if (!rawText || rawText.trim().length === 0) {
    return { data: null, error: 'LLM output is empty' };
  }

  // Truncate absurdly long outputs
  let text = rawText.trim();
  if (text.length > RAW_OUTPUT_MAX_LENGTH) {
    text = text.substring(0, RAW_OUTPUT_MAX_LENGTH);
  }

  // Strategy 1: Try direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, error: null };
    }
    // If it's an array, wrap it (AI might return just the intentions array)
    if (Array.isArray(parsed)) {
      return { data: { narrative: '', intentions: parsed }, error: null };
    }
  } catch {
    // Not direct JSON, continue to other strategies
  }

  // Strategy 2: Extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null) {
        return { data: parsed as Record<string, unknown>, error: null };
      }
    } catch {
      // Code block content isn't valid JSON either
    }
  }

  // Strategy 3: Find first { ... } block in the text
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonCandidate);
      if (typeof parsed === 'object' && parsed !== null) {
        return { data: parsed as Record<string, unknown>, error: null };
      }
    } catch {
      // Braces didn't form valid JSON
    }
  }

  // Strategy 4: The entire output is narrative text (no JSON at all)
  // This is a valid case — the AI sometimes just writes narrative without JSON
  return {
    data: {
      narrative: text,
      intentions: [],
    },
    error: null,
  };
}

// --- Stage 2: VALIDATE ---

/**
 * Validate parsed data against Zod schemas.
 * Returns detailed error information for each validation failure.
 */
function validateParsedData(data: Record<string, unknown>): ValidationResult {
  const result = LLMResponseSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: [],
      repairAttempted: false,
      repairSucceeded: false,
      coercedFields: [],
    };
  }

  const errors: ValidationError[] = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  return {
    success: false,
    errors,
    repairAttempted: false,
    repairSucceeded: false,
    coercedFields: [],
  };
}

// --- Stage 3: RETRY (re-prompt LLM) ---

/**
 * Type for the LLM re-prompt function.
 * The parser doesn't directly call the LLM — it receives a callback
 * that the /api/dm route provides.
 */
export type LLMRetryFn = (validationErrors: ValidationError[]) => Promise<string | null>;

/**
 * Attempt to re-prompt the LLM with validation error feedback.
 * The retry prompt tells the LLM exactly what went wrong and asks it to fix it.
 */
async function attemptRetry(
  retryFn: LLMRetryFn,
  errors: ValidationError[]
): Promise<Record<string, unknown> | null> {
  const rawRetryOutput = await retryFn(errors);
  if (!rawRetryOutput) return null;

  const parseResult = parseRawOutput(rawRetryOutput);
  return parseResult.data;
}

// --- Stage 4: REPAIR ---

/**
 * Attempt to repair invalid data using heuristics.
 */
function attemptRepair(
  data: Record<string, unknown>,
  errors: ValidationError[]
): {
  validatedData: ValidatedLLMResponse | null;
  logs: RepairLog[];
} {
  const result = repairLLMResponse(data, errors);

  console.group('[LLM Pipeline] Stage 4: REPAIR');
  console.log('Repair attempted:', result.repaired);
  console.log('Repair steps:', result.logs.length);
  for (const log of result.logs) {
    console.log(`  [${log.step}] ${log.description} ${log.success ? '✓' : '✗'}`);
  }
  console.log('Valid after repair:', result.validAfterRepair);
  if (result.validationErrors.length > 0) {
    console.warn('Remaining errors:', result.validationErrors);
  }
  console.groupEnd();

  return {
    validatedData: result.validatedData ?? null,
    logs: result.logs,
  };
}

// --- Stage 5: ABORT ---

/**
 * Abort the turn with a safe fallback response.
 * This response has NO intentions (zero game state changes) and
 * a narrative that explains the issue in-character.
 */
function abortTurn(rawOutput: string): ValidatedLLMResponse {
  console.group('[LLM Pipeline] Stage 5: ABORT');
  console.error('Turn aborted — LLM output could not be validated or repaired');
  console.log('Raw output (first 500 chars):', rawOutput.substring(0, 500));
  console.groupEnd();

  return createAbortResponse(rawOutput);
}

// --- MAIN PIPELINE ---

/**
 * Full LLM output processing pipeline.
 *
 * @param rawOutput - The raw text output from the LLM
 * @param retryFn - Optional callback to re-prompt the LLM with error feedback
 * @returns ParsePipelineResult with the final validated response and diagnostic info
 */
export async function parseLLMOutput(
  rawOutput: string,
  retryFn?: LLMRetryFn
): Promise<ParsePipelineResult> {
  console.group('[LLM Pipeline] === New Turn ===');
  console.log('Raw model output (first 500 chars):', rawOutput.substring(0, 500));

  const initialErrors: ValidationError[] = [];
  let repairLogs: RepairLog[] = [];
  let retryCount = 0;

  // ──── Stage 1: PARSE ────
  console.group('[LLM Pipeline] Stage 1: PARSE');
  const parseResult = parseRawOutput(rawOutput);
  console.log('Parse success:', parseResult.data !== null);
  if (parseResult.error) {
    console.warn('Parse error:', parseResult.error);
  }
  console.groupEnd();

  if (!parseResult.data) {
    // Can't even parse — go directly to abort
    console.groupEnd(); // Close main group
    return {
      response: abortTurn(rawOutput),
      success: false,
      stage: 'parse',
      initialErrors: [{ path: 'root', message: parseResult.error || 'JSON parse failed' }],
      repairLogs: [],
      retryCount: 0,
      isAborted: true,
    };
  }

  // ──── Stage 2: VALIDATE ────
  console.group('[LLM Pipeline] Stage 2: VALIDATE');
  const validationResult = validateParsedData(parseResult.data);
  console.log('Validation success:', validationResult.success);
  if (!validationResult.success) {
    console.warn('Validation errors:', validationResult.errors);
  }
  if (validationResult.data) {
    console.log('Validated intentions count:', validationResult.data.intentions.length);
  }
  console.groupEnd();

  if (validationResult.success && validationResult.data) {
    // ✅ Passed on first try
    console.log('Pipeline completed at Stage 2 (VALIDATE) — success');
    console.groupEnd(); // Close main group
    return {
      response: validationResult.data,
      success: true,
      stage: 'validate',
      initialErrors: [],
      repairLogs: [],
      retryCount: 0,
      isAborted: false,
    };
  }

  // Collect initial errors
  initialErrors.push(...validationResult.errors);

  // ──── Stage 3: RETRY ────
  if (retryFn) {
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      console.group(`[LLM Pipeline] Stage 3: RETRY (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
      console.log('Retrying with error feedback:', initialErrors.map(e => e.message));

      const retryData = await attemptRetry(retryFn, initialErrors);
      retryCount++;

      if (retryData) {
        const retryValidation = validateParsedData(retryData);
        console.log('Retry validation success:', retryValidation.success);
        console.groupEnd();

        if (retryValidation.success && retryValidation.data) {
          // ✅ Retry worked
          console.log('Pipeline completed at Stage 3 (RETRY) — success');
          console.groupEnd(); // Close main group
          return {
            response: retryValidation.data,
            success: true,
            stage: 'retry',
            initialErrors,
            repairLogs: [],
            retryCount,
            isAborted: false,
          };
        }
      } else {
        console.log('Retry produced no output');
        console.groupEnd();
      }
    }
  }

  // ──── Stage 4: REPAIR ────
  const repairResult = attemptRepair(parseResult.data, initialErrors);
  repairLogs = repairResult.logs;

  if (repairResult.validatedData) {
    // ✅ Repair worked
    console.log('Pipeline completed at Stage 4 (REPAIR) — success');
    console.log('Final validated object:', {
      narrative: repairResult.validatedData.narrative.substring(0, 100) + '...',
      intentions: repairResult.validatedData.intentions.map(i => i.type),
    });
    console.groupEnd(); // Close main group
    return {
      response: repairResult.validatedData,
      success: true,
      stage: 'repair',
      initialErrors,
      repairLogs,
      retryCount,
      isAborted: false,
    };
  }

  // ──── Stage 5: ABORT ────
  const abortResponse = abortTurn(rawOutput);
  console.groupEnd(); // Close main group

  return {
    response: abortResponse,
    success: false,
    stage: 'abort',
    initialErrors,
    repairLogs,
    retryCount,
    isAborted: true,
  };
}

// --- Synchronous Version (for cases where retry is not needed) ---

/**
 * Synchronous version of the pipeline that skips the retry stage.
 * Useful for server-side processing where re-prompting is handled
 * at a higher level.
 */
export function parseLLMOutputSync(rawOutput: string): ParsePipelineResult {
  console.group('[LLM Pipeline] === New Turn (sync) ===');
  console.log('Raw model output (first 500 chars):', rawOutput.substring(0, 500));

  const initialErrors: ValidationError[] = [];
  let repairLogs: RepairLog[] = [];

  // Stage 1: PARSE
  console.group('[LLM Pipeline] Stage 1: PARSE');
  const parseResult = parseRawOutput(rawOutput);
  console.log('Parse success:', parseResult.data !== null);
  if (parseResult.error) {
    console.warn('Parse error:', parseResult.error);
  }
  console.groupEnd();

  if (!parseResult.data) {
    console.groupEnd();
    return {
      response: abortTurn(rawOutput),
      success: false,
      stage: 'parse',
      initialErrors: [{ path: 'root', message: parseResult.error || 'JSON parse failed' }],
      repairLogs: [],
      retryCount: 0,
      isAborted: true,
    };
  }

  // Stage 2: VALIDATE
  console.group('[LLM Pipeline] Stage 2: VALIDATE');
  const validationResult = validateParsedData(parseResult.data);
  console.log('Validation success:', validationResult.success);
  if (!validationResult.success) {
    console.warn('Validation errors:', validationResult.errors);
  }
  console.groupEnd();

  if (validationResult.success && validationResult.data) {
    console.log('Pipeline completed at Stage 2 (VALIDATE) — success');
    console.groupEnd();
    return {
      response: validationResult.data,
      success: true,
      stage: 'validate',
      initialErrors: [],
      repairLogs: [],
      retryCount: 0,
      isAborted: false,
    };
  }

  initialErrors.push(...validationResult.errors);

  // Stage 4: REPAIR (skip retry in sync mode)
  const repairResult = attemptRepair(parseResult.data, initialErrors);
  repairLogs = repairResult.logs;

  if (repairResult.validatedData) {
    console.log('Pipeline completed at Stage 4 (REPAIR) — success');
    console.log('Final validated object:', {
      narrative: repairResult.validatedData.narrative.substring(0, 100) + '...',
      intentions: repairResult.validatedData.intentions.map(i => i.type),
    });
    console.groupEnd();
    return {
      response: repairResult.validatedData,
      success: true,
      stage: 'repair',
      initialErrors,
      repairLogs,
      retryCount: 0,
      isAborted: false,
    };
  }

  // Stage 5: ABORT
  const abortResponse = abortTurn(rawOutput);
  console.groupEnd();

  return {
    response: abortResponse,
    success: false,
    stage: 'abort',
    initialErrors,
    repairLogs,
    retryCount: 0,
    isAborted: true,
  };
}
