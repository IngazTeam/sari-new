/**
 * OpenAI Integration
 * Handles GPT-4o and Whisper API calls
 */

import { ENV } from '../_core/env';

const OPENAI_API_URL = 'https://api.openai.com/v1';

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

/**
 * Call GPT-4o for chat completion
 */
export async function callGPT4(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model || 'gpt-4o';
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens || 1000;

  // Get API key from DB (admin panel) first, then fallback to .env
  const { getOpenAiApiKey } = await import('../db_ai_settings');
  const apiKey = await getOpenAiApiKey() || ENV.openaiApiKey;

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set it in Admin > AI Settings.');
  }

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
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`);
    }

    const data: ChatCompletionResponse = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error('Error calling GPT-4:', error);
    throw new Error(`Failed to call GPT-4: ${error.message}`);
  }
}

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

    const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

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
