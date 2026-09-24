/**
 * OpenAI Integration — Hardened with 3-Layer Resilience
 * 
 * Layer 1: AbortController timeout (25s primary, 15s fallback)
 * Layer 2: Auto-retry with exponential backoff (2 attempts + mini fallback)
 * Layer 3: Circuit Breaker (5 failures → 60s cooldown)
 */

import {
  getOptionalZahyPiRequestContext,
  requestZahyPiChat,
  resolveZahyPiRuntimeConfig,
} from './zahypi-client';
import { AiBudgetError, withAiBudget, promptBudgetShape, type AiBudgetLifecycle } from './budget-ledger';
import { AUXILIARY_AI_ROUTES } from '../../shared/ai-capabilities';
import { resolveAuxiliaryAiRoute, assertAuxiliaryAiRouteCurrent } from './auxiliary-routing';

const OPENAI_API_URL = 'https://api.openai.com/v1';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface FileContent {
  type: 'file';
  file: {
    url: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | (TextContent | ImageContent | FileContent)[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface TranscriptionResponse {
  text: string;
}

// ═══════════════════════════════════════════════════════════════
// Circuit Breaker — prevents hammering a dead API
// ═══════════════════════════════════════════════════════════════

const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  halfOpenSuccesses: 0,      // PEN-RES-02 FIX: track consecutive successes in half-open
  cooldownMs: 60_000,        // 60 seconds cooldown after circuit opens
  threshold: 5,              // 5 consecutive failures → open circuit
  recoveryThreshold: 2,      // Need 2 consecutive successes to close

  recordFailure() {
    this.failures++;
    this.halfOpenSuccesses = 0;  // Reset half-open progress
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.isOpen = true;
      console.error(`[OpenAI] 🔴 Circuit OPEN — ${this.failures} consecutive failures. Cooling down ${this.cooldownMs / 1000}s`);
    }
  },

  recordSuccess() {
    if (this.isOpen) {
      // PEN-RES-02 FIX: In half-open, require multiple successes to confirm recovery
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.recoveryThreshold) {
        console.log(`[OpenAI] 🟢 Circuit CLOSED — confirmed recovery after ${this.halfOpenSuccesses} consecutive successes`);
        this.failures = 0;
        this.isOpen = false;
        this.halfOpenSuccesses = 0;
      } else {
        console.log(`[OpenAI] 🟡 Half-open success ${this.halfOpenSuccesses}/${this.recoveryThreshold} — awaiting confirmation`);
      }
    } else {
      this.failures = 0;
    }
  },

  canAttempt(): boolean {
    if (!this.isOpen) return true;
    // Check if cooldown has passed
    if (Date.now() - this.lastFailure > this.cooldownMs) {
      console.log('[OpenAI] 🟡 Circuit half-open — attempting recovery');
      return true; // Half-open: allow one attempt
    }
    return false;
  },
};

// NQ-5: Export circuit breaker status for /health endpoint
export function getCircuitBreakerStatus(): string {
  if (!circuitBreaker.isOpen) return 'closed';
  if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.cooldownMs) return 'half-open';
  return 'open';
}

// ═══════════════════════════════════════════════════════════════
// Core: callGPT4 with Timeout + Retry + Circuit Breaker
// ═══════════════════════════════════════════════════════════════

/**
 * Call GPT-4o for chat completion — hardened with 3-layer resilience.
 * 
 * Attempt chain:
 * 1. Primary model (gpt-4o) with 25s timeout
 * 2. Retry primary with 1s backoff
 * 3. Fallback to gpt-4o-mini with 15s timeout
 * All attempts throw if circuit breaker is open.
 */
export async function callGPT4(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    noRetry?: boolean; // PEN-RES-03 FIX: Skip internal retry (used when caller already handles retry)
    lifecycle?: AiBudgetLifecycle<string>;
    merchantId?: number;
    conversationId?: number | string;
    userId?: number | string;
    taskType?: string;
  }
): Promise<string> {
  if (options?.lifecycle && options.noRetry !== true) throw new AiBudgetError('invalid_usage');
  const startedAt = Date.now();
  const primaryModel = options?.model || 'gpt-4o';
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens || 1000;
  const budgetIdentity = options?.merchantId ?? getOptionalZahyPiRequestContext()?.merchantId;
  const budgetTask = options?.taskType ?? getOptionalZahyPiRequestContext()?.taskType ?? 'sari.reply';
  const runtimeConfig = await resolveZahyPiRuntimeConfig();

  if (!runtimeConfig.enabled) {
    throw new Error('AI services are disabled by an administrator');
  }

  if (runtimeConfig.provider === 'zahypi') {
    const inheritedContext = getOptionalZahyPiRequestContext();
    const explicitContext = options?.merchantId !== undefined
      ? {
          merchantId: options.merchantId,
          conversationId: options.conversationId ?? (String(inheritedContext?.merchantId) === String(options.merchantId)
            ? inheritedContext?.conversationId : undefined),
          userId: options.userId,
          taskType: options.taskType || 'sari.reply',
        }
      : options?.taskType && inheritedContext
        ? { ...inheritedContext, taskType: options.taskType }
        : undefined;
    const result = await requestZahyPiChat(
      messages,
      {
        maxTokens,
        temperature,
        timeoutMs: 25_000,
        maxAttempts: options?.noRetry ? 1 : 3,
        ...(options?.lifecycle ? { lifecycle: options.lifecycle } : {}),
      },
      explicitContext ?? inheritedContext,
    );
    if (result.usage) {
      const usage = result.usage;
      const merchantId = (explicitContext ?? inheritedContext)?.merchantId;
      import('../db_ai_settings').then(({ logAiUsage }) => logAiUsage({
        merchantId: typeof merchantId === 'number' ? merchantId : null,
        requestType: 'chat',
        model: result.model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        // ZahyPi pricing is not equivalent to OpenAI pricing; keep cost neutral
        // until the gateway exposes an authoritative billed-cost field.
        estimatedCost: '0',
        durationMs: Date.now() - startedAt,
      })).catch(() => {});
    }
    return result.content;
  }

  // OpenAI and ZahyPi keep independent circuit-breaker state.
  if (!circuitBreaker.canAttempt()) {
    throw new Error('OpenAI circuit breaker is OPEN — too many recent failures. Cooling down.');
  }

  // Get API key
  const { getOpenAiApiKey } = await import('../db_ai_settings');
  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set it in Admin > AI Settings.');
  }

  // Attempt 1: Primary model
  try {
    const result = await fetchWithTimeout(apiKey, messages, primaryModel, temperature, maxTokens, 25_000, budgetIdentity, budgetTask, options?.lifecycle);
    circuitBreaker.recordSuccess();
    return result;
  } catch (err1: any) {
    if (err1 instanceof AiBudgetError) throw err1;
    console.warn(`[OpenAI] Attempt 1 failed (${primaryModel}):`, err1.message);

    // Don't retry on auth errors — they'll fail again
    if (err1.message?.includes('401') || err1.message?.includes('API key')) {
      circuitBreaker.recordFailure();
      throw err1;
    }

    // PEN-RES-03 FIX: Skip internal retry when caller handles its own retry
    if (options?.noRetry) {
      circuitBreaker.recordFailure();
      throw err1;
    }

    // Attempt 2: Retry primary after 1s backoff
    await sleep(1000);
    try {
      const result = await fetchWithTimeout(apiKey, messages, primaryModel, temperature, maxTokens, 25_000, budgetIdentity, budgetTask);
      circuitBreaker.recordSuccess();
      console.log('[OpenAI] ✅ Attempt 2 succeeded');
      return result;
    } catch (err2: any) {
      if (err2 instanceof AiBudgetError) throw err2;
      console.warn(`[OpenAI] Attempt 2 failed (${primaryModel}):`, err2.message);

      // Attempt 3: Fallback to mini model (faster, cheaper)
      if (primaryModel !== 'gpt-4o-mini') {
        await sleep(500);
        try {
          const result = await fetchWithTimeout(apiKey, messages, 'gpt-4o-mini', temperature, Math.min(maxTokens, 500), 15_000, budgetIdentity, budgetTask);
          circuitBreaker.recordSuccess();
          console.log('[OpenAI] ✅ Attempt 3 succeeded (gpt-4o-mini fallback)');
          return result;
        } catch (err3: any) {
          console.error(`[OpenAI] Attempt 3 failed (gpt-4o-mini):`, err3.message);
          circuitBreaker.recordFailure();
          throw err3;
        }
      }

      circuitBreaker.recordFailure();
      throw err2;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Internal: fetch with AbortController timeout
// ═══════════════════════════════════════════════════════════════

async function fetchWithTimeout(
  apiKey: string,
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
  merchantId: number | string | undefined,
  taskType: string,
  lifecycle?: AiBudgetLifecycle<string>,
): Promise<string> {
  const completion = await withAiBudget({ merchantId, provider: 'openai', model, taskType,
    ...promptBudgetShape(messages), maxOutputTokens: maxTokens }, async attempt => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Client-Request-Id': attempt.requestId,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`OpenAI API Error ${response.status}`);
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content || content.trim().length === 0) {
      throw new Error('OpenAI returned empty response');
    }

    // Log usage stats (fire-and-forget — non-blocking)
    if (data.usage) {
      import('../db_ai_settings').then(({ logAiUsage, estimateCost }) => {
        logAiUsage({
          merchantId: typeof merchantId === 'number' ? merchantId : null,
          requestType: 'chat',
          model,
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCost: String(estimateCost(model, data.usage.prompt_tokens, data.usage.completion_tokens)),
          durationMs: Date.now() - startTime,
        });
      }).catch(() => {}); // Never let logging break the response

    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`OpenAI timeout after ${timeoutMs / 1000}s (model: ${model})`);
    }
    throw error;
  }
  }, data => data.usage, lifecycle && {
    beforeDispatch: attempt => lifecycle.beforeDispatch(attempt),
    afterResponse: (data, attempt) => lifecycle.afterResponse(data.choices[0].message.content, attempt),
  });
  return completion.choices[0].message.content;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// Whisper: Transcribe audio (unchanged)
// ═══════════════════════════════════════════════════════════════

/**
 * Transcribe audio using Whisper
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options?: {
    model?: string;
    language?: string;
    merchantId?: number;
  }
): Promise<string> {
  const route = await resolveAuxiliaryAiRoute('transcription', options?.model);
  const model = route.model;
  const language = options?.language || 'ar'; // Arabic by default
  if (!audioBuffer.length || audioBuffer.length > AUXILIARY_AI_ROUTES.transcription.maxFileBytes) throw new Error('Invalid audio size');

  return withAiBudget({ merchantId: options?.merchantId ?? getOptionalZahyPiRequestContext()?.merchantId,
    provider: 'openai', model, taskType: 'voice.transcription', inputTokens: 0, maxOutputTokens: 0 }, async attempt => {
  try {
    await assertAuxiliaryAiRouteCurrent(route);
    const formData = new FormData();
    
    // Create a Blob from the buffer
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', model);
    if (language) {
      formData.append('language', language);
    }

    // Keep the deadline active while reading the response body as well as headers.
    const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${route.apiKey}`,
          'X-Client-Request-Id': attempt.requestId,
        },
        body: formData,
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`Transcription provider status ${response.status}`);
    }

    const data: TranscriptionResponse = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Invalid transcription response');
    return data.text;
  } catch (error: any) {
    console.error('Error transcribing audio');
    throw new Error('Failed to transcribe audio');
  }
  }, () => undefined); // Hold the configured per-file maximum until billed duration is reconciled.
}

/**
 * Test OpenAI connection
 */
export async function testOpenAIConnection(apiKeyOverride?: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const { getOpenAiApiKey } = await import('../db_ai_settings');
    const apiKey = apiKeyOverride || await getOpenAiApiKey();
    if (!apiKey || apiKey.length > 512 || !/^sk-[A-Za-z0-9_-]+$/.test(apiKey)) return false;
    const response = await fetch(`${OPENAI_API_URL}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      redirect: 'error',
    });
    return response.ok;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
