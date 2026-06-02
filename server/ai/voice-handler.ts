/**
 * Voice Message Handler
 * Process voice messages using Whisper and respond with Sari
 */

import { transcribeAudio } from './openai';
import { chatWithSari } from './sari-personality';
import {
  createMessage,
  getActiveSubscriptionByMerchantId,
  getMerchantById,
  getPlanById,
  updateSubscription,
} from '../db';

/**
 * Process voice message from customer
 */
export async function processVoiceMessage(params: {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  audioUrl: string;
  externalId?: string; // FIX-2: Green API idMessage for dedup
}): Promise<{
  transcription: string;
  response: string;
  incomingMsgId?: number;
}> {
  // FIX-VOICE-EARLY: Save placeholder BEFORE download/transcribe.
  // If download or Whisper fails, the row exists with externalId → dedup protected,
  // and the catch in greenapi.ts can UPDATE it to isProcessed=1.
  const placeholderMsg = await createMessage({
    conversationId: params.conversationId,
    direction: 'incoming',
    messageType: 'voice',
    content: '[رسالة صوتية — جاري المعالجة]',
    voiceUrl: params.audioUrl,
    isProcessed: 0,
    externalId: params.externalId || null,
    aiResponse: null,
  });

  try {
    console.log('[Voice Handler] Processing voice message:', params.audioUrl);

    // Download audio file
    const audioBuffer = await downloadAudio(params.audioUrl);
    
    // Transcribe using Whisper
    console.log('[Voice Handler] Transcribing audio...');
    const transcription = await transcribeAudio(audioBuffer, {
      language: 'ar', // Arabic by default
    });
    
    console.log('[Voice Handler] Transcription:', transcription);

    // UPDATE placeholder with actual transcription
    if (placeholderMsg?.id) {
      const { getPool } = await import('../db');
      const pool = await getPool();
      if (pool) {
        await pool.execute(
          'UPDATE messages SET content = ? WHERE id = ?',
          [transcription, placeholderMsg.id]
        );
      }
    }

    // Generate response using Sari
    console.log('[Voice Handler] Generating AI response...');
    const response = await chatWithSari({
      merchantId: params.merchantId,
      customerPhone: params.customerPhone,
      customerName: params.customerName,
      message: transcription,
      conversationId: params.conversationId,
    });

    console.log('[Voice Handler] AI Response:', response);

    // NOTE: Outgoing message save + isProcessed update moved to caller
    // (ensures we don't mark as processed before WhatsApp delivery succeeds)

    return {
      transcription,
      response,
      incomingMsgId: placeholderMsg?.id,
    };
  } catch (error: any) {
    console.error('[Voice Handler] Error processing voice message:', error);
    throw new Error(`Failed to process voice message: ${error.message}`);
  }
}

/**
 * Download audio file from URL
 */
async function downloadAudio(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    console.error('Error downloading audio:', error);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Check if voice message processing is enabled for merchant
 */
export async function isVoiceProcessingEnabled(merchantId: number): Promise<boolean> {
  try {
    // Get merchant subscription
    const merchant = await getMerchantById(merchantId);
    if (!merchant) {
      return false;
    }

    const subscription = await getActiveSubscriptionByMerchantId(merchantId);
    if (!subscription || subscription.status !== 'active') {
      return false;
    }

    // Check plan limits
    const plan = await getPlanById(subscription.planId);
    if (!plan) {
      return false;
    }

    // Check if voice message limit is available
    if (plan.voiceMessageLimit === 0) {
      return false;
    }

    // Check current usage (assuming we track this)
    // For now, return true if plan allows voice messages
    return plan.voiceMessageLimit > 0;
  } catch (error) {
    console.error('Error checking voice processing status:', error);
    return false;
  }
}

/**
 * Increment voice message usage counter
 */
export async function incrementVoiceMessageUsage(merchantId: number): Promise<void> {
  try {
    const subscription = await getActiveSubscriptionByMerchantId(merchantId);
    if (!subscription) {
      return;
    }

    // Get current usage
    const currentUsage = subscription.voiceMessagesUsed || 0;
    
    // Update usage
    await updateSubscription(subscription.id, {
      voiceMessagesUsed: currentUsage + 1,
    });

    console.log(`[Voice Handler] Incremented voice usage for merchant ${merchantId}: ${currentUsage + 1}`);
  } catch (error) {
    console.error('Error incrementing voice usage:', error);
  }
}

/**
 * Check if merchant has reached voice message limit
 */
export async function hasReachedVoiceLimit(merchantId: number): Promise<boolean> {
  try {
    const subscription = await getActiveSubscriptionByMerchantId(merchantId);
    if (!subscription || subscription.status !== 'active') {
      return true; // No active subscription = limit reached
    }

    const plan = await getPlanById(subscription.planId);
    if (!plan) {
      return true;
    }

    const currentUsage = subscription.voiceMessagesUsed || 0;
    
    // Check if limit reached
    return currentUsage >= plan.voiceMessageLimit;
  } catch (error) {
    console.error('Error checking voice limit:', error);
    return true; // Fail safe: assume limit reached on error
  }
}
