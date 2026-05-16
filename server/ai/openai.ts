/**
 * OpenAI Integration — Hardened with 3-Layer Resilience
 * 
 * Layer 1: AbortController timeout (25s primary, 15s fallback)
 * Layer 2: Auto-retry with exponential backoff (2 attempts + mini fallback)
 * Layer 3: Circuit Breaker (5 failures → 60s cooldown)
 */

import { ENV } from '../_core/env';

const OPENAI_API_URL = 'https://api.openai.com/v1';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  }
): Promise<string> {
  const primaryModel = options?.model || 'gpt-4o';
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens || 1000;

  // Circuit Breaker check
  if (!circuitBreaker.canAttempt()) {
    throw new Error('OpenAI circuit breaker is OPEN — too many recent failures. Cooling down.');
  }

  // Get API key
  const { getOpenAiApiKey } = await import('../db_ai_settings');
  const apiKey = await getOpenAiApiKey() || ENV.openaiApiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set it in Admin > AI Settings.');
  }

  // Attempt 1: Primary model
  try {
    const result = await fetchWithTimeout(apiKey, messages, primaryModel, temperature, maxTokens, 25_000);
    circuitBreaker.recordSuccess();
    return result;
  } catch (err1: any) {
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
      const result = await fetchWithTimeout(apiKey, messages, primaryModel, temperature, maxTokens, 25_000);
      circuitBreaker.recordSuccess();
      console.log('[OpenAI] ✅ Attempt 2 succeeded');
      return result;
    } catch (err2: any) {
      console.warn(`[OpenAI] Attempt 2 failed (${primaryModel}):`, err2.message);

      // Attempt 3: Fallback to mini model (faster, cheaper)
      if (primaryModel !== 'gpt-4o-mini') {
        await sleep(500);
        try {
          const result = await fetchWithTimeout(apiKey, messages, 'gpt-4o-mini', temperature, Math.min(maxTokens, 500), 15_000);
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
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(`OpenAI API Error ${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content || content.trim().length === 0) {
      throw new Error('OpenAI returned empty response');
    }

    return content;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`OpenAI timeout after ${timeoutMs / 1000}s (model: ${model})`);
    }
    throw error;
  }
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
  }
): Promise<string> {
  const model = options?.model || 'whisper-1';
  const language = options?.language || 'ar'; // Arabic by default

  try {
    // Get API key from DB (admin panel) first, then fallback to .env
    const { getOpenAiApiKey } = await import('../db_ai_settings');
    const apiKey = await getOpenAiApiKey() || ENV.openaiApiKey;

    const formData = new FormData();
    
    // Create a Blob from the buffer
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', model);
    if (language) {
      formData.append('language', language);
    }

    // PEN-RES-04 FIX: 30s timeout for audio transcription
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: globalThis.Response;
    try {
      response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Whisper transcription timeout after 30s');
      }
      throw fetchErr;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI Whisper Error: ${error.error?.message || response.statusText}`);
    }

    const data: TranscriptionResponse = await response.json();
    return data.text;
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

/**
 * Test OpenAI connection
 */
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    const response = await callGPT4([
      { role: 'user', content: 'Hello, respond with "OK" if you can read this.' }
    ], { maxTokens: 10 });
    
    return response.toLowerCase().includes('ok');
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
}
