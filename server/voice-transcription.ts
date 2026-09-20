/**
 * Voice Transcription Module
 * 
 * Converts voice messages from WhatsApp to text using OpenAI Whisper API
 */

import axios from 'axios';
import FormData from 'form-data';
import { ENV } from './_core/env';
import { downloadPublicMedia } from './security/download-media';
import { withAiBudget } from './ai/budget-ledger';
import { getOptionalZahyPiRequestContext, resolveZahyPiRuntimeConfig } from './ai/zahypi-client';

/**
 * Download voice message file from Green API
 */
async function downloadVoiceFile(fileUrl: string): Promise<Buffer> {
  return (await downloadPublicMedia(fileUrl)).data;
}

/**
 * Transcribe voice message to text using OpenAI Whisper
 */
export async function transcribeVoiceMessage(
  fileUrl: string,
  language: 'ar' | 'en' = 'ar',
  merchantId?: number,
): Promise<{
  text: string;
  duration?: number;
  language: string;
}> {
  const startTime = Date.now();
  
  try {
    if (!(await resolveZahyPiRuntimeConfig()).enabled) throw new Error('AI services are disabled');
    console.log('[Voice] Starting transcription:', { language });
    
    // Download the voice file
    const audioBuffer = await downloadVoiceFile(fileUrl);
    console.log('[Voice] Downloaded file, size:', audioBuffer.length, 'bytes');
    
    // Check file size (max 25MB for Whisper API)
    if (audioBuffer.length === 0 || audioBuffer.length > 25 * 1024 * 1024) {
      throw new Error('الملف الصوتي كبير جداً (الحد الأقصى 25 ميجابايت)');
    }
    
    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'voice.ogg',
      contentType: 'audio/ogg',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    formData.append('response_format', 'json');
    
    // Call OpenAI Whisper API
    const response = await withAiBudget({ merchantId: merchantId ?? getOptionalZahyPiRequestContext()?.merchantId,
      provider: 'openai', model: 'whisper-1', taskType: 'voice.transcription', inputTokens: 0, maxOutputTokens: 0,
    }, attempt => axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${ENV.openaiApiKey}`,
          'X-Client-Request-Id': attempt.requestId,
        },
        timeout: 60000, // 60 seconds
        maxRedirects: 0,
      }
    ), () => undefined);
    
    const duration = Date.now() - startTime;
    const text = response.data?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Invalid transcription response');
    
    console.log('[Voice] Transcription successful:', {
      duration: `${duration}ms`,
      language: response.data.language || language,
    });
    
    return {
      text,
      duration,
      language: response.data.language || language,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Voice] Transcription failed:', {
      status: Number.isInteger(error?.response?.status) ? error.response.status : undefined,
      duration: `${duration}ms`,
    });
    
    // Return user-friendly error message
    if (error?.response?.status === 429) {
      throw new Error('تم تجاوز الحد الأقصى للطلبات، يرجى المحاولة لاحقاً');
    } else if (error?.response?.status === 401) {
      throw new Error('خطأ في مفتاح OpenAI API');
    } else if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
      throw new Error('انتهت مهلة معالجة الملف الصوتي');
    } else {
      throw new Error('فشل تحويل الرسالة الصوتية إلى نص');
    }
  }
}

/**
 * Check if a message is a voice message based on Green API webhook data
 */
export function isVoiceMessage(messageData: any): boolean {
  return (
    messageData.typeMessage === 'audioMessage' ||
    messageData.typeMessage === 'voiceMessage' ||
    (messageData.type === 'audio' && !!messageData.audioMessage) ||
    (messageData.type === 'voice' && !!messageData.voiceMessage)
  );
}

/**
 * Extract voice file URL from Green API webhook data
 */
export function getVoiceFileUrl(messageData: any): string | null {
  // Try different possible structures from Green API
  const fileUrl =
    messageData.downloadUrl ||
    messageData.fileUrl ||
    messageData.audioMessage?.downloadUrl ||
    messageData.voiceMessage?.downloadUrl ||
    messageData.url;
  
  return fileUrl || null;
}
