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
import { logDelivery } from '../routers-monitor';
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
    // Green API puts file URLs in fileMessageData for voice/audio/image/video/document
    fileMessageData?: {
      downloadUrl?: string;
      mimeType?: string;
      fileName?: string;
      jpegThumbnail?: string;
      caption?: string;
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
    
    // إرسال إشعار بالرسالة الجديدة
    try {
      const { notifyNewMessage } = await import('../_core/notificationService');
      const messagePreview = params.messageText.length > 50 
        ? params.messageText.substring(0, 50) + '...' 
        : params.messageText;
      await notifyNewMessage(params.merchantId, params.customerName || 'عميل', messagePreview);
    } catch (error) {
      console.error('[Notification] Failed to send new message notification:', error);
    }
    
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
    
    // ── Handle outgoing messages (Human Takeover detection) ──
    if (payload.typeWebhook === 'outgoingMessageReceived' || payload.typeWebhook === 'outgoingAPIMessageWebhook') {
      const instanceId = payload.instanceData.idInstance.toString();
      const instance = await db.getWhatsAppInstanceByInstanceId(instanceId);
      if (!instance) return { success: true, message: 'Instance not found' };

      const chatId = (payload as any).chatId || (payload as any).senderData?.chatId;
      if (!chatId || isGroupMessage(chatId)) return { success: true, message: 'Ignored' };
      const customerPhone = extractPhoneNumber(chatId);

      // Check for takeover commands (natural phrases + legacy hashtag fallback)
      const outText = extractMessageText(payload);
      const botSettings = await db.getBotSettings(instance.merchantId);

      if (outText && botSettings.takeoverCommandsEnabled) {
        const cmd = outText.trim();
        const cmdLower = cmd.toLowerCase();

        // Stop commands: Arabic "سأتولى المحادثة" + English "I'll take over" + legacy "#stop"
        const isStopCmd = cmd.includes('سأتولى المحادثة') || cmd.includes('ساتولى المحادثة') || cmdLower.includes("i'll take over") || cmdLower.includes("i will take over") || cmdLower === '#stop';
        // Start commands: Arabic "يسعدنا خدمتكم" + English "Glad to help" + legacy "#start"
        const isStartCmd = cmd.includes('يسعدنا خدمتكم') || cmdLower.includes('glad to help') || cmdLower === '#start';

        if (isStopCmd) {
          const convs = await db.getConversationsByMerchantId(instance.merchantId);
          const conv = convs.find(c => c.customerPhone === customerPhone);
          if (conv) {
            await db.updateConversation(conv.id, {
              humanTakeover: 1,
              humanTakeoverAt: new Date(),
              humanExpiresAt: null, // no expiry until resume command
            } as any);
            console.log(`[Takeover] "سأتولى المحادثة" — permanent takeover on conv ${conv.id}`);
          }
          return { success: true, message: 'Human takeover activated (permanent)' };
        }
        if (isStartCmd) {
          const convs = await db.getConversationsByMerchantId(instance.merchantId);
          const conv = convs.find(c => c.customerPhone === customerPhone);
          if (conv) {
            await db.updateConversation(conv.id, {
              humanTakeover: 0,
              humanExpiresAt: null,
            } as any);
            console.log(`[Takeover] "يسعدنا خدمتكم" — Sari resumed on conv ${conv.id}`);

            // Context-aware resume: fetch last messages so Sari can understand the conversation
            try {
              const messages = await db.getMessagesByConversation(conv.id);
              const recentMsgs = messages.slice(-6); // Last 6 messages for context
              // VULN-1 FIX: Sanitize + truncate each message to prevent prompt injection
              const contextSummary = recentMsgs.map(m => {
                const role = m.direction === 'incoming' ? 'العميل' : 'التاجر';
                const safeContent = (m.content || '[media]')
                  .substring(0, 300) // max 300 chars per message
                  .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[...]')
                  .replace(/\b(system|assistant|user)\s*:/gi, '[...]')
                  .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[...]');
                return `${role}: ${safeContent}`;
              }).join('\n');

              // Trigger an AI-aware first response on the next incoming message
              // VULN-4 FIX: Cap total context to 2000 chars
              const cappedContext = contextSummary.substring(0, 2000);

              await db.updateConversation(conv.id, {
                agentHistory: JSON.stringify({
                  resumeContext: cappedContext,
                  resumedAt: new Date().toISOString(),
                  resumedBy: 'merchant_command',
                }),
              } as any);
              console.log(`[Takeover] Stored ${recentMsgs.length} messages as resume context`);
            } catch (ctxErr) {
              console.warn('[Takeover] Failed to store resume context:', ctxErr);
            }
          }
          return { success: true, message: 'Sari resumed with context' };
        }
      }

      // Auto-detect: merchant replied manually → activate takeover
      const convs = await db.getConversationsByMerchantId(instance.merchantId);
      const conv = convs.find(c => c.customerPhone === customerPhone);
      if (conv) {
        const timeoutMin = botSettings.takeoverTimeoutMinutes || 15;
        await db.updateConversation(conv.id, {
          humanTakeover: 1,
          humanTakeoverAt: new Date(),
          humanExpiresAt: new Date(Date.now() + timeoutMin * 60 * 1000),
        } as any);
        console.log(`[Takeover] Human took over conv ${conv.id} for ${timeoutMin} min`);
      }
      return { success: true, message: 'Human takeover activated' };
    }

    // Only process incoming messages
    if (payload.typeWebhook !== 'incomingMessageReceived') {
      console.log('[Webhook] Ignoring non-message webhook:', payload.typeWebhook);
      return {
        success: true,
        message: 'Non-message webhook ignored'
      };
    }
    
    // ── Smart Group Handling ──
    if (isGroupMessage(payload.senderData.chatId)) {
      // Need instance to get settings
      const gInstanceId = payload.instanceData.idInstance.toString();
      const gInstance = await db.getWhatsAppInstanceByInstanceId(gInstanceId);
      if (!gInstance) return { success: true, message: 'Group: instance not found' };

      const gSettings = await db.getBotSettings(gInstance.merchantId);
      const groupMode = gSettings.groupMode || 'disabled';

      switch (groupMode) {
        case 'disabled':
          console.log('[Webhook] Group mode disabled — ignoring');
          return { success: true, message: 'Group message ignored (disabled)' };

        case 'mention_only': {
          const msgText = extractMessageText(payload) || '';
          const botWid = payload.instanceData.wid;
          const botPhone = botWid ? botWid.split('@')[0] : '';
          if (!msgText.includes(`@${botPhone}`)) {
            return { success: true, message: 'Group: no mention' };
          }
          // Has mention — fall through to process normally
          break;
        }

        case 'keyword_only': {
          const msgText = extractMessageText(payload) || '';
          let keywords: string[] = [];
          try { keywords = gSettings.groupKeywords ? JSON.parse(gSettings.groupKeywords) : []; } catch { keywords = []; }
          const hasKeyword = keywords.some(kw => msgText.toLowerCase().includes(kw.toLowerCase()));
          if (!hasKeyword) {
            return { success: true, message: 'Group: no keyword match' };
          }
          break;
        }

        case 'private_redirect': {
          const senderPhone = extractPhoneNumber(payload.senderData.sender || payload.senderData.chatId);
          const redirectMsg = gSettings.groupRedirectMessage || 'مرحباً! شفت رسالتك في الجروب. أقدر أساعدك هنا بشكل أفضل 😊';
          await sendResponseWithDelay({
            customerPhone: senderPhone,
            message: redirectMsg,
            delayMs: 1000,
            instanceId: gInstance.instanceId,
            token: gInstance.token,
            apiUrl: gInstance.apiUrl || undefined,
          });
          return { success: true, message: 'Group: redirected to private' };
        }
      }
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
      // Can't log merchantId since we don't know it
      return {
        success: false,
        message: 'No merchant found for this instance'
      };
    }

    // Track timing for response time measurement
    const _deliveryStart = Date.now();

    // VULN-4 FIX: Only process messages for active instances
    if (instance.status !== 'active') {
      console.warn(`[Webhook] Ignoring message for ${instance.status} instance: ${instanceId} (merchant: ${instance.merchantId})`);
      logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, status: 'dropped', failureReason: 'instance_inactive', failureDetails: `Instance status: ${instance.status}`, source: 'webhook' });
      return {
        success: false,
        message: `Instance is ${instance.status}, not processing`
      };
    }
    
    console.log('[Webhook] Merchant ID:', instance.merchantId);

    // SEC-FIX: Verify merchant has active subscription before processing
    const subscription = await db.getActiveSubscriptionByMerchantId(instance.merchantId);
    if (!subscription) {
      console.warn(`[Webhook] No active subscription for merchant ${instance.merchantId} — dropping message`);
      logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, status: 'failed', failureReason: 'subscription_expired', source: 'webhook' });
      return {
        success: false,
        message: 'Merchant subscription expired or inactive'
      };
    }
    
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
      
      logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, status: 'dropped', failureReason: reason === 'Outside working hours' || reason === 'Outside working days' ? 'outside_working_hours' : 'auto_reply_disabled', failureDetails: reason, source: 'webhook' });
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

    // ── Human Takeover Check ──
    const allConvs = await db.getConversationsByMerchantId(instance.merchantId);
    const currentConv = allConvs.find(c => c.customerPhone === customerPhone);
    if (currentConv && (currentConv as any).humanTakeover) {
      const expiresAt = (currentConv as any).humanExpiresAt;
      if (!expiresAt || new Date(expiresAt) > new Date()) {
        // Human is still active — Sari stays silent, just save incoming message
        console.log(`[Takeover] Sari silent — human active until ${expiresAt || 'manual #start'}`);
        await db.createMessage({
          conversationId,
          direction: 'incoming',
          messageType: 'text',
          content: extractMessageText(payload) || '[media]',
          voiceUrl: null,
          isProcessed: 0,
          aiResponse: null,
        });
        return { success: true, message: 'Human takeover active — Sari silent' };
      } else {
        // Takeover expired — resume Sari
        await db.updateConversation(currentConv.id, {
          humanTakeover: 0,
          humanExpiresAt: null,
        } as any);
        console.log(`[Takeover] Expired — Sari resuming on conv ${currentConv.id}`);
        // Send resume message
        const resumeMsg = botSettings.takeoverResumeMessage || 'مرحباً! عدت لخدمتك 😊';
        await sendResponseWithDelay({
          customerPhone,
          message: resumeMsg,
          delayMs: 500,
          instanceId: instance.instanceId,
          token: instance.token,
          apiUrl: instance.apiUrl || undefined,
        });
      }
    }
    
    // Process message based on type
    let response: string;
    
    if (payload.messageData.typeMessage === 'voiceMessage' || payload.messageData.typeMessage === 'audioMessage') {
      // Voice message — downloadUrl can be at messageData.downloadUrl OR messageData.fileMessageData.downloadUrl
      const audioDownloadUrl = payload.messageData.downloadUrl 
        || payload.messageData.fileMessageData?.downloadUrl
        || (payload.messageData as any).fileMessage?.downloadUrl;
      
      if (!audioDownloadUrl) {
        console.error('[Webhook] No download URL for voice message. messageData keys:', Object.keys(payload.messageData));
        logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, customerName, messageType: 'voice', status: 'failed', failureReason: 'voice_no_url', failureDetails: `Keys: ${Object.keys(payload.messageData).join(',')}`, source: 'webhook' });
        return {
          success: false,
          message: 'No download URL for voice message'
        };
      }
      
      console.log('[Webhook] Voice message download URL found:', audioDownloadUrl.substring(0, 80) + '...');
      
      response = await processVoiceMessageWebhook({
        merchantId: instance.merchantId,
        conversationId,
        customerPhone,
        customerName,
        audioUrl: audioDownloadUrl,
      });
    } else {
      // Text message
      const messageText = extractMessageText(payload);
      
      if (!messageText) {
        console.log('[Webhook] No text content in message, ignoring');
        logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, customerName, messageType: 'other', status: 'dropped', failureReason: 'no_text_content', failureDetails: `typeMessage: ${payload.messageData.typeMessage}`, source: 'webhook' });
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
    
    const msgType = (payload.messageData.typeMessage === 'voiceMessage' || payload.messageData.typeMessage === 'audioMessage') ? 'voice' : 'text';
    logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, customerName, messageType: msgType as any, status: 'delivered', responseTimeMs: Date.now() - _deliveryStart, source: 'webhook' });
    
    return {
      success: true,
      message: 'Message processed and response sent'
    };
  } catch (error: any) {
    console.error('[Webhook] Error handling webhook:', error);
    
    // Handle limit errors - try to notify customer using merchant's instance
    const customerPhone = webhookData?.senderData?.chatId ? extractPhoneNumber(webhookData.senderData.chatId) : null;
    const instanceId = webhookData?.instanceData?.idInstance?.toString();
    
    // Look up merchant instance for sending limit notifications from correct number
    let instance: any = null;
    if (instanceId) {
      try {
        instance = await db.getWhatsAppInstanceByInstanceId(instanceId);
      } catch (_) { /* ignore lookup errors in error handler */ }
    }
    
    // Helper: send limit notification using merchant's credentials
    const sendLimitNotification = async (message: string) => {
      if (!customerPhone) return;
      try {
        if (instance?.instanceId && instance?.token) {
          await sendMessageWithCredentials(
            instance.instanceId,
            instance.token,
            instance.apiUrl || 'https://api.greenapi.com',
            customerPhone,
            message
          );
        } else {
          await sendTextMessage(customerPhone, message);
        }
      } catch (sendError) {
        console.error('[Webhook] Failed to send limit notification:', sendError);
      }
    };
    
    if (error.message === 'CONVERSATION_LIMIT_REACHED' && customerPhone) {
      await sendLimitNotification('عذراً، لقد وصلنا للحد الأقصى من المحادثات الشهرية. سنعود للتواصل معك قريباً! 🙏');
      if (instance) logDelivery({ merchantId: instance.merchantId, instanceId: instanceId || '', customerPhone, status: 'failed', failureReason: 'conversation_limit', source: 'webhook' });
      return { success: false, message: 'Conversation limit reached' };
    }
    
    if (error.message === 'MESSAGE_LIMIT_REACHED' && customerPhone) {
      await sendLimitNotification('عذراً، لقد وصلنا للحد الأقصى من الرسائل الشهرية. شكراً لتواصلك! 🙏');
      if (instance) logDelivery({ merchantId: instance.merchantId, instanceId: instanceId || '', customerPhone, status: 'failed', failureReason: 'message_limit', source: 'webhook' });
      return { success: false, message: 'Message limit reached' };
    }
    
    if (error.message === 'VOICE_LIMIT_REACHED' && customerPhone) {
      await sendLimitNotification('عذراً، لقد وصلنا للحد الأقصى من الرسائل الصوتية الشهرية. يمكنك إرسال رسالة نصية بدلاً من ذلك. 🙏');
      return { success: false, message: 'Voice message limit reached' };
    }
    
    return {
      success: false,
      message: error.message || 'Unknown error'
    };
  }
}
