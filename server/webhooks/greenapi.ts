/**
 * Green API Webhook Handler
 * Receives incoming WhatsApp messages and processes them with Sari AI
 */

import * as db from '../db';
import { sendTextMessage, sendMessageWithCredentials } from '../whatsapp';
import { chatWithSari } from '../ai/sari-personality';
import { processVoiceMessage, hasReachedVoiceLimit, incrementVoiceMessageUsage } from '../ai/voice-handler';
import { extractKeywordsFromMessage } from '../ai/keyword-extraction';
import { selectABTestVariant, recordABTestResult } from '../ai/ab-testing';
import { isAppointmentRequest, handleAppointmentRequest } from '../appointmentBot';
import {
  hasReachedConversationLimit,
  hasReachedMessageLimit,
  incrementConversationUsage,
  incrementMessageUsage,
} from '../usage-tracking';

interface WebhookResult {
  success: boolean;
  message: string;
}

/**
 * Green API Webhook payload types
 */
interface GreenAPIWebhookPayload {
  typeWebhook: string;
  instanceData: {
    idInstance: number;
    wid: string;
    typeInstance: string;
  };
  timestamp: number;
  idMessage: string;
  senderData: {
    chatId: string;
    chatName?: string;
    sender: string;
    senderName?: string;
  };
  messageData: {
    typeMessage: 'textMessage' | 'imageMessage' | 'videoMessage' | 'documentMessage' | 'audioMessage' | 'voiceMessage' | 'contactMessage' | 'locationMessage' | 'quotedMessage' | 'extendedTextMessage';
    textMessageData?: {
      textMessage: string;
    };
    extendedTextMessageData?: {
      text: string;
    };
    quotedMessage?: {
      stanzaId: string;
      participant: string;
      typeMessage: string;
    };
    downloadUrl?: string;
    caption?: string;
    fileName?: string;
    jpegThumbnail?: string;
  };
}

/**
 * Extract phone number from chatId (format: 966501234567@c.us)
 */
function extractPhoneNumber(chatId: string): string {
  return chatId.split('@')[0];
}

/**
 * Extract message text from different message types
 */
function extractMessageText(payload: GreenAPIWebhookPayload): string | null {
  const { messageData } = payload;
  
  // Text message
  if (messageData.textMessageData?.textMessage) {
    return messageData.textMessageData.textMessage;
  }
  
  // Extended text message (with link preview, etc.)
  if (messageData.extendedTextMessageData?.text) {
    return messageData.extendedTextMessageData.text;
  }
  
  // Image/Video with caption
  if (messageData.caption) {
    return messageData.caption;
  }
  
  return null;
}

/**
 * Check if message is from a group chat
 */
function isGroupMessage(chatId: string): boolean {
  return chatId.endsWith('@g.us');
}

/**
 * Get or create conversation
 */
async function getOrCreateConversation(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
}): Promise<number> {
  // Try to find existing conversation
  const conversations = await db.getConversationsByMerchantId(params.merchantId);
  const existing = conversations.find(c => c.customerPhone === params.customerPhone);
  
  if (existing) {
    // Update last message time
    await db.updateConversation(existing.id, {
      lastMessageAt: new Date(),
      status: 'active',
    });
    return existing.id;
  }
  
  // Check conversation limit before creating new conversation
  const reachedLimit = await hasReachedConversationLimit(params.merchantId);
  if (reachedLimit) {
    throw new Error('CONVERSATION_LIMIT_REACHED');
  }
  
  // Create new conversation
  const conversation = await db.createConversation({
    merchantId: params.merchantId,
    customerPhone: params.customerPhone,
    customerName: params.customerName || null,
    lastMessageAt: new Date(),
    status: 'active',
  });
  
  if (!conversation) {
    throw new Error('Failed to create conversation');
  }
  
  // Increment conversation usage
  await incrementConversationUsage(params.merchantId);
  
  return conversation.id;
}

/**
 * Process incoming text message with Sari AI
 */
async function processTextMessage(params: {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  messageText: string;
}): Promise<string> {
  try {
    console.log('[Webhook] Processing text message:', params.messageText);
    
    // Check message limit
    const reachedLimit = await hasReachedMessageLimit(params.merchantId);
    if (reachedLimit) {
      throw new Error('MESSAGE_LIMIT_REACHED');
    }
    
    // Save incoming message
    await db.createMessage({
      conversationId: params.conversationId,
      direction: 'incoming',
      messageType: 'text',
      content: params.messageText,
      voiceUrl: null,
      isProcessed: 0,
      aiwResponse: null,
    });
    
    // التحقق من طلبات حجز المواعيد أولاً
    const isAppointment = await isAppointmentRequest(params.messageText);
    let response: string;
    
    if (isAppointment) {
      console.log('[Webhook] Detected appointment request');
      response = await handleAppointmentRequest(
        params.merchantId,
        params.customerPhone,
        params.customerName || 'عميل',
        params.messageText
      );
    } else {
      // Get AI response from Sari
      response = await chatWithSari({
        merchantId: params.merchantId,
        customerPhone: params.customerPhone,
        customerName: params.customerName,
        message: params.messageText,
        conversationId: params.conversationId,
      });
    }
    
    console.log('[Webhook] Sari response:', response);
    
    // استخراج الكلمات المفتاحية من الرسالة
    try {
      await extractKeywordsFromMessage(params.merchantId, params.messageText, params.conversationId);
    } catch (error) {
      console.error('[Webhook] Error extracting keywords:', error);
    }
    
    // تطبيق A/B testing على الردود السريعة
    let finalResponse = response;
    try {
      const abTestResult = await selectABTestVariant(params.merchantId, params.messageText);
      if (abTestResult) {
        finalResponse = abTestResult.text;
        console.log(`[Webhook] Using A/B test variant: ${abTestResult.variant}`);
        
        // تسجيل الاستخدام (سيتم تحديد النجاح لاحقاً بناءً على رد العميل)
        await recordABTestResult(abTestResult.testId, abTestResult.variant, true);
      }
    } catch (error) {
      console.error('[Webhook] Error applying A/B test:', error);
    }
    
    // Save outgoing message
    await db.createMessage({
      conversationId: params.conversationId,
      direction: 'outgoing',
      messageType: 'text',
      content: response,
      voiceUrl: null,
      isProcessed: 1,
      aiwResponse: response,
    });
    
    // Increment message usage (incoming + outgoing = 2 messages)
    await incrementMessageUsage(params.merchantId);
    await incrementMessageUsage(params.merchantId);
    
    return response;
  } catch (error: any) {
    console.error('[Webhook] Error processing text message:', error);
    throw error;
  }
}

/**
 * Process incoming voice message with Whisper + Sari AI
 */
async function processVoiceMessageWebhook(params: {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  audioUrl: string;
}): Promise<string> {
  try {
    console.log('[Webhook] Processing voice message:', params.audioUrl);
    
    // Check voice limit
    const limitReached = await hasReachedVoiceLimit(params.merchantId);
    if (limitReached) {
      console.warn('[Webhook] Voice message limit reached for merchant:', params.merchantId);
      return 'عذراً، لقد وصلت لحد الرسائل الصوتية في باقتك. يرجى الترقية للاستمرار أو إرسال رسالة نصية. 🙏';
    }
    
    const result = await processVoiceMessage({
      merchantId: params.merchantId,
      conversationId: params.conversationId,
      customerPhone: params.customerPhone,
      customerName: params.customerName,
      audioUrl: params.audioUrl,
    });
    
    // Increment usage
    await incrementVoiceMessageUsage(params.merchantId);
    
    console.log('[Webhook] Voice transcription:', result.transcription);
    console.log('[Webhook] Sari response:', result.response);
    
    return result.response;
  } catch (error: any) {
    console.error('[Webhook] Error processing voice message:', error);
    return 'عذراً، حصل خطأ في معالجة الرسالة الصوتية. ممكن تعيد إرسالها أو تكتب رسالة نصية؟ 🙏';
  }
}

/**
 * Send response with typing simulation using merchant's WhatsApp instance
 */
async function sendResponseWithDelay(params: {
  customerPhone: string;
  message: string;
  delayMs?: number;
  instanceId?: string;
  token?: string;
  apiUrl?: string;
}): Promise<void> {
  try {
    // Random delay to simulate typing (1-3 seconds)
    const delay = params.delayMs || Math.floor(Math.random() * 2000) + 1000;
    
    console.log(`[Webhook] Waiting ${delay}ms before sending response...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Send message using merchant's credentials if provided
    console.log('[Webhook] Sending response to:', params.customerPhone);
    
    let result;
    if (params.instanceId && params.token) {
      // Use merchant's WhatsApp instance credentials
      const apiUrl = params.apiUrl || 'https://api.green-api.com';
      console.log(`[Webhook] Using merchant instance: ${params.instanceId}`);
      result = await sendMessageWithCredentials(
        params.instanceId,
        params.token,
        apiUrl,
        params.customerPhone,
        params.message
      );
    } else {
      // Fallback to env credentials
      console.log('[Webhook] Using env credentials (fallback)');
      result = await sendTextMessage(params.customerPhone, params.message);
    }
    
    if (!result.success) {
      console.error('[Webhook] Failed to send message:', result.error);
      throw new Error(result.error || 'Failed to send message');
    }
    
    console.log('[Webhook] Response sent successfully, messageId:', result.messageId);
  } catch (error: any) {
    console.error('[Webhook] Error sending response:', error);
    throw error;
  }
}

/**
 * Main webhook handler (Express-compatible)
 */
export async function handleGreenAPIWebhook(webhookData: any): Promise<WebhookResult> {
  try {
    const payload: GreenAPIWebhookPayload = webhookData;
    
    console.log('[Webhook] Received webhook:', JSON.stringify(payload, null, 2));
    
    // Only process incoming messages
    if (payload.typeWebhook !== 'incomingMessageReceived') {
      console.log('[Webhook] Ignoring non-message webhook:', payload.typeWebhook);
      return {
        success: true,
        message: 'Non-message webhook ignored'
      };
    }
    
    // Ignore group messages
    if (isGroupMessage(payload.senderData.chatId)) {
      console.log('[Webhook] Ignoring group message');
      return {
        success: true,
        message: 'Group message ignored'
      };
    }
    
    // Extract customer info
    const customerPhone = extractPhoneNumber(payload.senderData.chatId);
    const customerName = payload.senderData.senderName || payload.senderData.chatName;
    
    console.log('[Webhook] Customer:', customerPhone, customerName);
    
    // Find merchant by instance ID
    const instanceId = payload.instanceData.idInstance.toString();
    const instance = await db.getWhatsAppInstanceByInstanceId(instanceId);
    
    if (!instance) {
      console.error('[Webhook] No merchant found for instance:', instanceId);
      return {
        success: false,
        message: 'No merchant found for this instance'
      };
    }
    
    console.log('[Webhook] Merchant ID:', instance.merchantId);
    
    // Check if bot should respond based on settings
    const { shouldRespond, reason } = await db.shouldBotRespond(instance.merchantId);
    
    if (!shouldRespond) {
      console.log('[Webhook] Bot should not respond:', reason);
      
      // Send out-of-hours message if configured
      if (reason === 'Outside working hours' || reason === 'Outside working days') {
        const settings = await db.getBotSettings(instance.merchantId);
        if (settings.outOfHoursMessage) {
          await sendResponseWithDelay({
            customerPhone: extractPhoneNumber(payload.senderData.chatId),
            message: settings.outOfHoursMessage,
            delayMs: 1000,
            instanceId: instance.instanceId,
            token: instance.token,
            apiUrl: instance.apiUrl || undefined,
          });
        }
      }
      
      return {
        success: true,
        message: 'Bot not responding: ' + reason
      };
    }
    
    // Get bot settings for response customization
    const botSettings = await db.getBotSettings(instance.merchantId);
    
    // Get or create conversation
    const conversationId = await getOrCreateConversation({
      merchantId: instance.merchantId,
      customerPhone,
      customerName,
    });
    
    console.log('[Webhook] Conversation ID:', conversationId);
    
    // Process message based on type
    let response: string;
    
    if (payload.messageData.typeMessage === 'voiceMessage' || payload.messageData.typeMessage === 'audioMessage') {
      // Voice message
      if (!payload.messageData.downloadUrl) {
        console.error('[Webhook] No download URL for voice message');
        return {
          success: false,
          message: 'No download URL for voice message'
        };
      }
      
      response = await processVoiceMessageWebhook({
        merchantId: instance.merchantId,
        conversationId,
        customerPhone,
        customerName,
        audioUrl: payload.messageData.downloadUrl,
      });
    } else {
      // Text message
      const messageText = extractMessageText(payload);
      
      if (!messageText) {
        console.log('[Webhook] No text content in message, ignoring');
        return {
          success: true,
          message: 'No text content in message'
        };
      }
      
      response = await processTextMessage({
        merchantId: instance.merchantId,
        conversationId,
        customerPhone,
        customerName,
        messageText,
      });
    }
    
    // Send response with custom delay from settings using merchant's WhatsApp instance
    await sendResponseWithDelay({
      customerPhone,
      message: response,
      delayMs: (botSettings.responseDelay ?? 2) * 1000,
      instanceId: instance.instanceId,
      token: instance.token,
      apiUrl: instance.apiUrl || undefined,
    });
    
    console.log('[Webhook] Message processed successfully');
    
    return {
      success: true,
      message: 'Message processed and response sent'
    };
  } catch (error: any) {
    console.error('[Webhook] Error handling webhook:', error);
    
    // Handle limit errors - try to notify customer if possible
    const customerPhone = webhookData?.senderData?.chatId ? extractPhoneNumber(webhookData.senderData.chatId) : null;
    
    if (error.message === 'CONVERSATION_LIMIT_REACHED' && customerPhone) {
      try {
        await sendTextMessage(
          customerPhone,
          'عذراً، لقد وصلنا للحد الأقصى من المحادثات الشهرية. سنعود للتواصل معك قريباً! 🙏'
        );
      } catch (sendError) {
        console.error('[Webhook] Failed to send limit notification:', sendError);
      }
      
      return {
        success: false,
        message: 'Conversation limit reached'
      };
    }
    
    if (error.message === 'MESSAGE_LIMIT_REACHED' && customerPhone) {
      try {
        await sendTextMessage(
          customerPhone,
          'عذراً، لقد وصلنا للحد الأقصى من الرسائل الشهرية. شكراً لتواصلك! 🙏'
        );
      } catch (sendError) {
        console.error('[Webhook] Failed to send limit notification:', sendError);
      }
      
      return {
        success: false,
        message: 'Message limit reached'
      };
    }
    
    if (error.message === 'VOICE_LIMIT_REACHED' && customerPhone) {
      try {
        await sendTextMessage(
          customerPhone,
          'عذراً، لقد وصلنا للحد الأقصى من الرسائل الصوتية الشهرية. يمكنك إرسال رسالة نصية بدلاً من ذلك. 🙏'
        );
      } catch (sendError) {
        console.error('[Webhook] Failed to send limit notification:', sendError);
      }
      
      return {
        success: false,
        message: 'Voice message limit reached'
      };
    }
    
    return {
      success: false,
      message: error.message || 'Unknown error'
    };
  }
}
