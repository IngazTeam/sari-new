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
}): Promise<{
  transcription: string;
  response: string;
}> {
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

    // Save transcription to database
    await createMessage({
      conversationId: params.conversationId,
      direction: 'incoming',
      messageType: 'voice',
      content: transcription,
      voiceUrl: params.audioUrl,
      isProcessed: 0,
      aiResponse: null,
    });

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

    // Save AI response to database
    await createMessage({
      conversationId: params.conversationId,
      direction: 'outgoing',
      messageType: 'text',
      content: response,
      voiceUrl: null,
      isProcessed: 1,
      aiResponse: response,
    });

    return {
      transcription,
      response,
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
