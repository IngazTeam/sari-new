/**
 * Green API Webhook Handler
 * Receives incoming WhatsApp messages and processes them with Sari AI
 */

import {
  createConversation,
  createMessage,
  getActiveSubscriptionByMerchantId,
  getBotSettings,
  getConversationsByMerchantId,
  getMessagesByConversationId,
  getPool,
  getWhatsAppInstanceByInstanceId,
  getWhatsAppInstancesByMerchantId,
  shouldBotRespond,
  updateConversation,
} from '../db';
import type { CustomerProfile } from '../db/customer-intelligence';
import { sendTextMessage, sendMessageWithCredentials } from '../whatsapp';
import { chatWithSari } from '../ai/sari-personality';
import { processVoiceMessage, hasReachedVoiceLimit, incrementVoiceMessageUsage } from '../ai/voice-handler';
import { extractKeywordsFromMessage } from '../ai/keyword-extraction';
import { selectABTestVariant, recordABTestResult } from '../ai/ab-testing';
import { isAppointmentRequest, handleAppointmentRequest } from '../appointmentBot';
import { logDelivery } from '../routers-monitor';
import { captureMerchantCorrection } from '../ai/learning-engine';
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
 * Sanitize text before injecting into AI prompts — prevents prompt injection.
 * Mirrors sari-personality.ts sanitizeForPrompt but accessible locally.
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  const normalized = text.normalize('NFKC');
  return normalized
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/do\s+not\s+follow/gi, '[filtered]')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد|اعداداتهم)/gi, '[filtered]');
}

/**
 * Extract message text from different message types
 * Includes quoted/replied message context when available
 * 
 * GreenAPI sends quoted replies in two possible structures:
 * 
 * 1. typeMessage: "quotedMessage" → extendedTextMessageData.text (new text),
 *    extendedTextMessageData.stanzaId (original msg ID), 
 *    extendedTextMessageData.participant (original sender)
 * 
 * 2. typeMessage: "extendedTextMessage" → extendedTextMessageData.text,
 *    possibly with messageData.quotedMessage (top-level) containing the quoted context
 * 
 * The quoted original text may appear in:
 *   - messageData.quotedMessage.textMessage
 *   - messageData.quotedMessage.extendedTextMessage?.text
 *   - messageData.quotedMessage.conversation
 *   - (messageData.extendedTextMessageData as any).quotedMessage (undocumented nesting)
 */
function extractMessageText(payload: GreenAPIWebhookPayload): string | null {
  const { messageData } = payload;
  
  // Extended text message (with link preview, quoted reply, etc.) — check first
  if (messageData.extendedTextMessageData?.text) {
    let text = messageData.extendedTextMessageData.text;
    
    // ── Quoted/Reply Context Extraction ──
    // Try multiple paths where GreenAPI may place the quoted original text:
    //   Path A: messageData.quotedMessage (top-level, per GreenAPI docs for quotedMessage type)
    //   Path B: extendedTextMessageData.quotedMessage (nested, observed in some webhook variants)
    const quotedTopLevel = (messageData as any).quotedMessage;
    const quotedNested = (messageData.extendedTextMessageData as any).quotedMessage;
    const quoted = quotedTopLevel || quotedNested;
    
    if (quoted) {
      const quotedText = quoted.textMessage 
        || quoted.extendedTextMessage?.text 
        || quoted.caption
        || quoted.conversation
        || '';
      if (quotedText) {
        // PEN-Q-01 FIX: Sanitize quoted content to prevent prompt injection via crafted replies
        const safeQuoted = sanitizeForPrompt(quotedText.substring(0, 300));
        text = `[رد على رسالة: "${safeQuoted}"]\n${text}`;
      }
    } else if ((messageData.extendedTextMessageData as any).stanzaId) {
      // GreenAPI quotedMessage type: stanzaId is present but original text is not in payload.
      // Log this so we can track when quoted context is missing.
      const stanzaId = (messageData.extendedTextMessageData as any).stanzaId;
      const participant = (messageData.extendedTextMessageData as any).participant || '';
      console.log(`[QuotedMsg] 📎 Reply detected via stanzaId: ${stanzaId}, participant: ${participant?.slice(-8) || 'unknown'}`);
      text = `[رد على رسالة سابقة]\n${text}`;
    }
    return text;
  }
  
  // Text message
  if (messageData.textMessageData?.textMessage) {
    return messageData.textMessageData.textMessage;
  }
  
  // Image/Video with caption
  if (messageData.caption) {
    return messageData.caption;
  }
  
  return null;
}

/**
 * Extract quoted message text from a GreenAPI webhook payload.
 * Checks all possible paths where the quoted text may appear:
 *   - messageData.quotedMessage (top-level, documented for quotedMessage type)
 *   - messageData.extendedTextMessageData.quotedMessage (nested, some variants)
 * Returns the quoted text (sanitized) or empty string if none found.
 */
function extractQuotedText(payload: any): string {
  const md = payload?.messageData;
  if (!md) return '';
  
  // Path A: top-level quotedMessage on messageData
  const quotedTopLevel = md.quotedMessage;
  // Path B: nested under extendedTextMessageData
  const quotedNested = md.extendedTextMessageData?.quotedMessage;
  const quoted = quotedTopLevel || quotedNested;
  
  if (quoted) {
    return quoted.textMessage
      || quoted.extendedTextMessage?.text
      || quoted.caption
      || quoted.conversation
      || '';
  }
  
  return '';
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
  const conversations = await getConversationsByMerchantId(params.merchantId);
  const existing = conversations.find(c => c.customerPhone === params.customerPhone);
  
  if (existing) {
    // Update last message time
    await updateConversation(existing.id, {
      lastMessageAt: new Date().toISOString().slice(0, 19).replace("T", " "),
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
  const conversation = await createConversation({
    merchantId: params.merchantId,
    customerPhone: params.customerPhone,
    customerName: params.customerName || null,
    lastMessageAt: new Date().toISOString().slice(0, 19).replace("T", " "),
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
  imageUrl?: string; // GPT-4o Vision: URL of image sent by customer
}): Promise<string> {
  try {
    console.log('[Webhook] Processing text message:', params.messageText, params.imageUrl ? `[with image: ${params.imageUrl.substring(0, 60)}...]` : '');
    
    // Check message limit
    const reachedLimit = await hasReachedMessageLimit(params.merchantId);
    if (reachedLimit) {
      throw new Error('MESSAGE_LIMIT_REACHED');
    }
    
    // Save incoming message
    await createMessage({
      conversationId: params.conversationId,
      direction: 'incoming',
      messageType: params.imageUrl ? 'image' : 'text',
      content: params.messageText,
      voiceUrl: params.imageUrl || null,  // Reuse voiceUrl field for image URL
      isProcessed: 0,
      // @ts-ignore
      aiwResponse: null,
    });
    
    // إرسال إشعار بالرسالة الجديدة
    try {
      const { notifyNewMessage } = await import('../_core/notificationService');
      const messagePreview = params.imageUrl 
        ? `🖼️ ${params.messageText.substring(0, 40) || 'صورة'}` 
        : (params.messageText.length > 50 
          ? params.messageText.substring(0, 50) + '...' 
          : params.messageText);
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
        imageUrl: params.imageUrl,
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
        
        // BUG-FIX: Record as impression (false), not success — conversion tracked later
        await recordABTestResult(abTestResult.testId, abTestResult.variant, false);
      }
    } catch (error) {
      console.error('[Webhook] Error applying A/B test:', error);
    }
    
    // Save outgoing message — BUG-FIX: use finalResponse (was using original `response`)
    await createMessage({
      conversationId: params.conversationId,
      direction: 'outgoing',
      messageType: 'text',
      content: finalResponse,
      voiceUrl: null,
      isProcessed: 1,
      // @ts-ignore
      aiwResponse: finalResponse,
    });
    
    // Increment message usage (incoming + outgoing = 2 messages)
    await incrementMessageUsage(params.merchantId);
    await incrementMessageUsage(params.merchantId);
    
    return finalResponse;
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
    return 'ما قدرت أسمع الرسالة الصوتية واضح 🎙️ ممكن تعيد إرسالها أو تكتب لي نصياً؟ 😊';
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
      const instance = await getWhatsAppInstanceByInstanceId(instanceId);
      if (!instance) return { success: true, message: 'Instance not found' };

      const chatId = (payload as any).chatId || (payload as any).senderData?.chatId;
      if (!chatId || isGroupMessage(chatId)) return { success: true, message: 'Ignored' };
      const customerPhone = extractPhoneNumber(chatId);

      // Check for takeover commands (natural phrases + legacy hashtag fallback)
      const outText = extractMessageText(payload);
      const botSettings = await getBotSettings(instance.merchantId);

      if (outText && botSettings.takeoverCommandsEnabled) {
        const cmd = outText.trim();
        const cmdLower = cmd.toLowerCase();

        // Stop commands: Arabic "سأتولى المحادثة" + English "I'll take over" + legacy "#stop"
        const isStopCmd = cmd.includes('سأتولى المحادثة') || cmd.includes('ساتولى المحادثة') || cmdLower.includes("i'll take over") || cmdLower.includes("i will take over") || cmdLower === '#stop';
        // Start commands: Arabic "يسعدنا خدمتكم" + English "Glad to help" + legacy "#start"
        const isStartCmd = cmd.includes('يسعدنا خدمتكم') || cmdLower.includes('glad to help') || cmdLower === '#start';

        if (isStopCmd) {
          const convs = await getConversationsByMerchantId(instance.merchantId);
          const conv = convs.find(c => c.customerPhone === customerPhone);
          if (conv) {
            await updateConversation(conv.id, {
              humanTakeover: 1,
              humanTakeoverAt: new Date(),
              humanExpiresAt: null, // no expiry until resume command
            } as any);
            console.log(`[Takeover] "سأتولى المحادثة" — permanent takeover on conv ${conv.id}`);
          }
          return { success: true, message: 'Human takeover activated (permanent)' };
        }
        if (isStartCmd) {
          const convs = await getConversationsByMerchantId(instance.merchantId);
          const conv = convs.find(c => c.customerPhone === customerPhone);
          if (conv) {
            await updateConversation(conv.id, {
              humanTakeover: 0,
              humanExpiresAt: null,
            } as any);
            console.log(`[Takeover] "يسعدنا خدمتكم" — Sari resumed on conv ${conv.id}`);

            // Context-aware resume: fetch last messages so Sari can understand the conversation
            try {
              const messages = await getMessagesByConversationId(conv.id);
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

              await updateConversation(conv.id, {
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
      // ── VULN-2 FIX: Skip system-generated messages (cron reminders, API messages) ──
      if (outText && (
        outText.startsWith('⚠️ *تنبيه من ساري:*') || // System reminder from takeover-expiry job
        payload.typeWebhook === 'outgoingAPIMessageWebhook'  // Message sent via API (Sari's own responses)
      )) {
        console.log('[Takeover] Skipping system/API message — not a manual merchant reply');
        return { success: true, message: 'System message ignored' };
      }

      // ── Merchant Reply to Sari Alert → Forward to Customer + AI Feedback ──
      // When the merchant replies (quotes) a "تنبيه من ساري — سؤال عميل" message:
      // 1. Forward the answer to the customer
      // 2. Confirm delivery to the merchant
      // 3. AI-analyze the reply quality and suggest improvements or praise
      if (outText) {
        const quotedText = extractQuotedText(payload);
        
        const isReplyToSariAlert = quotedText.includes('تنبيه من ساري') 
          || quotedText.includes('سؤال عميل')
          || quotedText.includes('العميل ينتظر')
          || quotedText.includes('سيوصله للعميل');
        
        if (isReplyToSariAlert) {
          console.log(`[MerchantReply] 📩 Merchant replied to Sari alert — forwarding to customer`);
          
          // Extract the original customer question from the quoted alert
          const customerQuestionMatch = quotedText.match(/❓\s*\*?السؤال:?\*?\s*([\s\S]+?)(?:\n|💡|⏰|⚠️|$)/);
          const originalQuestion = customerQuestionMatch?.[1]?.trim() || '';
          
          let targetCustomerPhone = '';
          let deliverySuccess = false;
          
          // Try to resolve via escalation system first (most reliable)
          try {
            const { handleMerchantEscalationReply } = await import('../ai/smart-escalation');
            const escResult = await handleMerchantEscalationReply({
              merchantId: instance.merchantId,
              merchantPhone: customerPhone,
              replyText: outText,
            });
            
            if (escResult.handled) {
              deliverySuccess = true;
              targetCustomerPhone = escResult.escalation?.customerPhone || '';
              console.log(`[MerchantReply] ✅ Escalation reply handled — answer delivered to customer`);
            }
          } catch (escErr) {
            console.warn('[MerchantReply] Escalation relay failed, trying direct:', escErr);
          }
          
          // Fallback: direct delivery via escalation DB
          if (!deliverySuccess) {
            try {
              const { getActiveEscalationForMerchant } = await import('../db/learning');
              const activeEsc = await getActiveEscalationForMerchant(instance.merchantId);
              if (activeEsc) {
                targetCustomerPhone = (activeEsc as any).customer_phone || (activeEsc as any).customerPhone || '';
              }
            } catch { /* silent */ }
            
            if (targetCustomerPhone) {
              const customerReply = `أهلاً مجدداً! 😊 حصلت لك الجواب:\n\n${outText.substring(0, 2000)}\n\nهل فيه شي ثاني أقدر أساعدك فيه؟ 🙏`;
              
              try {
                await sendMessageWithCredentials(
                  (instance as any).instanceId,
                  (instance as any).token,
                  (instance as any).apiUrl || 'https://api.green-api.com',
                  targetCustomerPhone,
                  customerReply
                );
                deliverySuccess = true;
                console.log(`[MerchantReply] ✅ Reply forwarded to customer ***${targetCustomerPhone.slice(-4)}`);
              } catch (sendErr) {
                console.error('[MerchantReply] Failed to forward reply:', sendErr);
              }
            }
          }
          
          // ── AI Feedback to Merchant ──
          // Analyze the merchant's reply and provide constructive feedback
          if (deliverySuccess) {
            try {
              const { callGPT4 } = await import('../ai/openai');
              const feedbackPrompt = [
                {
                  role: 'system' as const,
                  content: `أنت ساري، مستشار خدمة العملاء الذكي. مهمتك تقييم رد التاجر على سؤال العميل وتقديم ملاحظات مختصرة.

قواعد التقييم:
1. إذا كان الرد احترافي وواضح → أثنِ عليه بحماس وأكّد أنه ممتاز
2. إذا كان الرد جيد لكن يمكن تحسينه → أثنِ أولاً ثم اقترح تحسين واحد محدد
3. إذا كان الرد ضعيف أو ناقص → اقترح رد بديل أفضل بلطف

الرد يجب أن يكون:
- باللهجة السعودية
- مختصر (3-5 أسطر كحد أقصى)
- يبدأ بتأكيد التوصيل ✅
- يحتوي تقييم صادق لكن لطيف
- إذا اقترحت تحسين، اكتب الرد المقترح كاملاً ليقدر التاجر ينسخه`
                },
                {
                  role: 'user' as const,
                  // PEN-MR-02 FIX: Sanitize both inputs to prevent prompt manipulation
                  content: `سؤال العميل: "${sanitizeForPrompt(originalQuestion.substring(0, 300)) || 'غير متوفر'}"\n\nرد التاجر: "${sanitizeForPrompt(outText.substring(0, 500))}"\n\nقيّم رد التاجر وأعطه ملاحظاتك:`
                }
              ];
              
              const aiFeedback = await callGPT4(feedbackPrompt, {
                model: 'gpt-4o-mini',
                temperature: 0.7,
                maxTokens: 300,
                noRetry: true,
              });
              
              // Send AI feedback to merchant
              const feedbackMessage = `✅ *تم توصيل ردك للعميل بنجاح!*\n\n${aiFeedback.trim()}`;
              
              await sendMessageWithCredentials(
                (instance as any).instanceId,
                (instance as any).token,
                (instance as any).apiUrl || 'https://api.green-api.com',
                customerPhone,
                feedbackMessage
              );
              
              console.log(`[MerchantReply] 🧠 AI feedback sent to merchant`);
            } catch (feedbackErr) {
              // Fallback: simple confirmation without AI analysis
              console.warn('[MerchantReply] AI feedback failed, sending simple confirmation:', feedbackErr);
              try {
                await sendMessageWithCredentials(
                  (instance as any).instanceId,
                  (instance as any).token,
                  (instance as any).apiUrl || 'https://api.green-api.com',
                  customerPhone,
                  `✅ *تم توصيل ردك للعميل بنجاح!*\n\nشكراً لسرعة استجابتك 👏 ساري تعلّم من ردك وسيستخدمه مستقبلاً 🧠`
                );
              } catch { /* confirmation is non-blocking */ }
            }
            
            return { success: true, message: 'Merchant reply forwarded + AI feedback sent' };
          }
          
          console.warn('[MerchantReply] Could not determine target customer — falling through to takeover');
        }
      }

      const convs = await getConversationsByMerchantId(instance.merchantId);
      const conv = convs.find(c => c.customerPhone === customerPhone);
      if (conv) {
        const timeoutMin = botSettings.takeoverTimeoutMinutes || 15;
        await updateConversation(conv.id, {
          humanTakeover: 1,
          humanTakeoverAt: new Date(),
          humanExpiresAt: new Date(Date.now() + timeoutMin * 60 * 1000),
        } as any);
        console.log(`[Takeover] Human took over conv ${conv.id} for ${timeoutMin} min`);

        // Learning Engine: Capture merchant correction signal
        // When the merchant sends a message, it means the bot's response was inadequate
        if (outText) {
          try {
            const messages = await getMessagesByConversationId(conv.id);
            const lastBotMsg = messages.filter((m: any) => m.direction === 'outgoing').pop();
            if (lastBotMsg) {
              captureMerchantCorrection({
                merchantId: instance.merchantId,
                conversationId: conv.id,
                lastBotMessage: (lastBotMsg as any).content || '',
                merchantMessage: outText,
              }).catch(() => {});
            }
          } catch { /* silent — learning is non-blocking */ }
        }

        // ── UX: Confirm takeover + AI feedback to merchant (in-app notification) ──
        // NOTE: We CANNOT send WhatsApp in the customer chat (customer would see "تم إيقاف ساري")
        // Instead, use in-app notification that only the merchant dashboard shows
        try {
          let feedbackLine = '';
          // Quick AI feedback on merchant reply (only if outText is substantive)
          if (outText && outText.length > 5) {
            try {
              const messages = await getMessagesByConversationId(conv.id);
              const lastCustomerMsg = messages.filter((m: any) => m.direction === 'incoming').pop();
              const customerQuestion = (lastCustomerMsg as any)?.content?.substring(0, 300) || '';
              if (customerQuestion) {
                const { callGPT4 } = await import('../ai/openai');
                const quickFeedback = await callGPT4([
                  {
                    role: 'system' as const,
                    content: `أنت ساري. قيّم رد التاجر على سؤال العميل بجملة واحدة فقط باللهجة السعودية. إذا الرد ممتاز أثنِ عليه، وإذا ناقص اقترح إضافة محددة. لا تزيد عن سطر واحد.`
                  },
                  {
                    role: 'user' as const,
                    content: `سؤال العميل: "${sanitizeForPrompt(customerQuestion)}"\nرد التاجر: "${sanitizeForPrompt(outText.substring(0, 500))}"`
                  }
                ], { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 100, noRetry: true });
                feedbackLine = ` | ${quickFeedback.trim()}`;
              }
            } catch { /* AI feedback is non-blocking */ }
          }

          const { notifyNewMessage } = await import('../_core/notificationService');
          await notifyNewMessage(
            instance.merchantId,
            'ساري ⏸️',
            `تم إيقاف ساري ${timeoutMin} دقيقة على محادثة ${conv.customerPhone?.slice(-4) || 'عميل'}. أرسل "يسعدنا خدمتكم" للاستئناف${feedbackLine}`
          );
          console.log(`[Takeover] 📩 In-app confirmation sent to merchant for conv ${conv.id}`);
        } catch (confirmErr) {
          console.warn('[Takeover] Failed to send confirmation (non-blocking):', confirmErr);
        }
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
      const gInstance = await getWhatsAppInstanceByInstanceId(gInstanceId);
      if (!gInstance) return { success: true, message: 'Group: instance not found' };

      const gSettings = await getBotSettings(gInstance.merchantId);
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
    const instance = await getWhatsAppInstanceByInstanceId(instanceId);
    
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

    // ── #علم_ساري: Natural WhatsApp Training Command ──
    // Allows merchant to teach Sari directly via WhatsApp hashtag
    try {
      const incomingText = extractMessageText(payload);
      if (incomingText) {
        const { isPhoneInEscalationChain } = await import('../ai/smart-escalation');
        const isChainMember = await isPhoneInEscalationChain(instance.merchantId, customerPhone);

        if (isChainMember) {
          // Priority 1: #علم_ساري command (check with .includes to work with quoted reply prefix)
          if (incomingText.includes('#علم')) {
            const { handleTeachCommand } = await import('../ai/coaching-engine');
            const teachResult = await handleTeachCommand(instance.merchantId, incomingText);
            if (teachResult.handled && teachResult.response) {
              const instances = await getWhatsAppInstancesByMerchantId(instance.merchantId);
              const inst = instances.find((i: any) => i.status === 'active');
              if (inst) {
                const { sendMessageWithCredentials } = await import('../whatsapp');
                await sendMessageWithCredentials(
                  (inst as any).instanceId, (inst as any).token,
                  (inst as any).apiUrl || 'https://api.green-api.com',
                  customerPhone, teachResult.response
                );
              }
              return { success: true, message: 'Teach command processed' };
            }
          }

          // Priority 2: Coaching session reply
          const { getActiveSession, handleCoachingReply } = await import('../ai/coaching-engine');
          const activeCoaching = await getActiveSession(instance.merchantId);
          if (activeCoaching) {
            const coachResult = await handleCoachingReply(instance.merchantId, incomingText);
            if (coachResult.handled) {
              console.log(`[Coaching] ✅ Training reply processed for merchant ${instance.merchantId}`);
              return { success: true, message: 'Coaching reply processed' };
            }
          }

          // Priority 3: Escalation reply — quoted alert OR implicit reply with active escalation
          // FIX: Previously ANY message from a chain member was treated as escalation reply,
          // which prevented the merchant from being served as a normal customer
          const quotedText = extractQuotedText(payload);
          
          const isReplyToAlert = quotedText.includes('تنبيه من ساري')
            || quotedText.includes('سؤال عميل')
            || quotedText.includes('العميل ينتظر')
            || quotedText.includes('سيوصله للعميل');

          // BUG-3 FIX: Also detect implicit escalation replies (no quote but reply-intent phrases)
          const replyIntentPhrases = ['قول له', 'قوله', 'جاوبه', 'ابلغه', 'أبلغه', 'بلغه', 'وصله', 'وصل له', 'رد عليه', 'ردي عليه', 'طمنه'];
          const hasReplyIntent = !isReplyToAlert && replyIntentPhrases.some(p => incomingText.includes(p));

          // Priority 4 (NEW): Auto-detect — chain member sent ANY message while escalation is active
          // This catches the common case: merchant reads alert, types plain answer without quoting
          let hasActiveEscalation = false;
          if (!isReplyToAlert && !hasReplyIntent) {
            try {
              const { getActiveEscalationForMerchant } = await import('../db/learning');
              const activeEsc = await getActiveEscalationForMerchant(instance.merchantId);
              if (activeEsc) {
                hasActiveEscalation = true;
                console.log(`[Escalation] 🎯 Chain member has active escalation #${activeEsc.id} — treating as reply`);
              }
            } catch { /* non-blocking */ }
          }
          
          if (isReplyToAlert || hasReplyIntent || hasActiveEscalation) {
            const { handleMerchantEscalationReply } = await import('../ai/smart-escalation');

            // For implicit replies, extract the actual answer (after the intent phrase)
            let replyText = incomingText;
            if (hasReplyIntent) {
              for (const phrase of replyIntentPhrases) {
                if (incomingText.includes(phrase)) {
                  const afterPhrase = incomingText.substring(incomingText.indexOf(phrase) + phrase.length).trim();
                  if (afterPhrase.length > 2) {
                    replyText = afterPhrase;
                  }
                  break;
                }
              }
            }

            const result = await handleMerchantEscalationReply({
              merchantId: instance.merchantId,
              merchantPhone: customerPhone,
              replyText,
            });

            if (result.handled) {
              console.log(`[Escalation] ✅ Chain member reply routed to customer ${result.escalation?.customerPhone?.slice(-4)}${hasReplyIntent ? ' (implicit)' : hasActiveEscalation ? ' (auto-detected)' : ''}`);
              return { success: true, message: 'Escalation reply handled' };
            }
          }
          // No explicit escalation reply AND no active escalation — continue normal customer flow
          // (merchant is treated as a regular customer)
        }
      }
    } catch (escErr) {
      console.warn('[Webhook] Chain member reply check failed:', escErr);
    }

    // SEC-FIX: Verify merchant has active subscription before processing
    const subscription = await getActiveSubscriptionByMerchantId(instance.merchantId);
    if (!subscription) {
      console.warn(`[Webhook] No active subscription for merchant ${instance.merchantId} — dropping message`);
      logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, status: 'failed', failureReason: 'subscription_expired', source: 'webhook' });
      return {
        success: false,
        message: 'Merchant subscription expired or inactive'
      };
    }
    
    // Check if bot should respond based on settings
    const { shouldRespond, reason } = await shouldBotRespond(instance.merchantId);
    
    if (!shouldRespond) {
      console.log('[Webhook] Bot should not respond:', reason);
      
      // Send out-of-hours message if configured
      if (reason === 'Outside working hours' || reason === 'Outside working days') {
        const settings = await getBotSettings(instance.merchantId);
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
    const botSettings = await getBotSettings(instance.merchantId);
    
    // Get or create conversation
    const conversationId = await getOrCreateConversation({
      merchantId: instance.merchantId,
      customerPhone,
      customerName,
    });
    
    console.log('[Webhook] Conversation ID:', conversationId);

    // ── Human Takeover Check ──
    const allConvs = await getConversationsByMerchantId(instance.merchantId);
    const currentConv = allConvs.find(c => c.customerPhone === customerPhone);
    if (currentConv && (currentConv as any).humanTakeover) {
      const expiresAt = (currentConv as any).humanExpiresAt;
      const takeoverAt = (currentConv as any).humanTakeoverAt;

      // BUG FIX: Force-expire takeovers older than 24 hours (prevents permanent silence)
      const takeoverAge = takeoverAt ? Date.now() - new Date(takeoverAt).getTime() : Infinity;
      const MAX_TAKEOVER_MS = 24 * 60 * 60 * 1000; // 24 hours

      if (takeoverAge > MAX_TAKEOVER_MS) {
        // Takeover stuck for 24+ hours — auto-expire
        await updateConversation(currentConv.id, {
          humanTakeover: 0,
          humanExpiresAt: null,
        } as any);
        console.log(`[Takeover] ⚠️ Force-expired stuck takeover on conv ${currentConv.id} (age: ${Math.round(takeoverAge / 3600000)}h)`);
      } else if (!expiresAt || new Date(expiresAt) > new Date()) {
        // Human is still active — Sari stays silent, just save incoming message
        console.log(`[Takeover] Sari silent — human active until ${expiresAt || 'manual #start'} (age: ${Math.round(takeoverAge / 60000)}min)`);
        await createMessage({
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
        await updateConversation(currentConv.id, {
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

    // ── BUG-1 FIX: Send typing indicator IMMEDIATELY while GPT processes ──
    // Fire-and-forget — non-blocking, just starts "typing..." in WhatsApp
    try {
      const { sendTypingWithCredentials } = await import('../whatsapp');
      sendTypingWithCredentials(
        instance.instanceId,
        instance.token,
        instance.apiUrl || `https://${instance.instanceId.substring(0, 4)}.api.greenapi.com`,
        customerPhone
      ).catch(() => {}); // truly non-blocking
    } catch { /* non-critical */ }

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
    } else if (payload.messageData.typeMessage === 'imageMessage' || payload.messageData.typeMessage === 'videoMessage') {
      // ── Image/Video Message → GPT-4o Vision ──
      const imageDownloadUrl = payload.messageData.downloadUrl
        || payload.messageData.fileMessageData?.downloadUrl
        || (payload.messageData as any).fileMessage?.downloadUrl;
      
      const caption = payload.messageData.fileMessageData?.caption
        || payload.messageData.caption
        || '';
      
      // PEN-IMG-02 FIX: Validate image URL to prevent SSRF
      let safeImageUrl: string | undefined;
      if (imageDownloadUrl) {
        try {
          const parsed = new URL(imageDownloadUrl);
          const isTrustedDomain = parsed.protocol === 'https:'
            && (parsed.hostname.endsWith('.digitaloceanspaces.com')
              || parsed.hostname.endsWith('.whatsapp.net')
              || parsed.hostname.endsWith('.green-api.com')
              || parsed.hostname.endsWith('.greenapi.com')       // GreenAPI without hyphen
              || parsed.hostname.endsWith('.yandexcloud.net')     // GreenAPI file CDN (Yandex Cloud)
              || parsed.hostname.endsWith('.storage.googleapis.com') // Google Cloud media
              || parsed.hostname.endsWith('.wa.me'));
          
          if (isTrustedDomain) {
            safeImageUrl = imageDownloadUrl;
          } else {
            console.warn(`[Webhook] ⚠️ Untrusted image URL domain blocked: ${parsed.hostname}`);
          }
        } catch {
          console.warn(`[Webhook] ⚠️ Invalid image URL format: ${String(imageDownloadUrl).substring(0, 60)}`);
        }
      }
      
      if (!safeImageUrl) {
        // No valid image URL — process caption-only if available
        if (caption) {
          response = await processTextMessage({
            merchantId: instance.merchantId,
            conversationId,
            customerPhone,
            customerName,
            messageText: caption,
          });
        } else if (imageDownloadUrl) {
          // URL exists but untrusted — still acknowledge the image
          response = await processTextMessage({
            merchantId: instance.merchantId,
            conversationId,
            customerPhone,
            customerName,
            messageText: '[صورة من العميل]',
          });
        } else {
          logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, customerName, messageType: 'other', status: 'dropped', failureReason: 'image_no_url', failureDetails: `typeMessage: ${payload.messageData.typeMessage}`, source: 'webhook' });
          return { success: true, message: 'No download URL for image' };
        }
      } else {
        const mediaType = payload.messageData.typeMessage === 'imageMessage' ? 'صورة' : 'فيديو';
        const messageText = caption || `[${mediaType} من العميل — صفها وتفاعل معها]`;
        
        console.log(`[Webhook] 🖼️ Image/video message with URL: ${safeImageUrl.substring(0, 80)}...${caption ? ` caption: ${caption.substring(0, 50)}` : ''}`);
        
        response = await processTextMessage({
          merchantId: instance.merchantId,
          conversationId,
          customerPhone,
          customerName,
          messageText,
          imageUrl: safeImageUrl,
        });
      }
    } else {
      // Text message (and other types)
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
    
    const msgType = (payload.messageData.typeMessage === 'voiceMessage' || payload.messageData.typeMessage === 'audioMessage') ? 'voice' : (payload.messageData.typeMessage === 'imageMessage' || payload.messageData.typeMessage === 'videoMessage') ? 'image' : 'text';
    logDelivery({ merchantId: instance.merchantId, instanceId, customerPhone, customerName, messageType: msgType as any, status: 'delivered', responseTimeMs: Date.now() - _deliveryStart, source: 'webhook' });
    
    // === Action Selector: Decide supplementary actions (fire-and-forget) ===
    try {
      const { selectAction, executeAction } = await import('../ai/action-selector');
      const { detectIntent } = await import('../ai/session-context');
      const messageText = extractMessageText(payload) || '';
      
      // Load profile read-only (profile already created by chatWithSari earlier)
      let actionProfile: any = null;
      try {
        const pool = await getPool();
        if (pool) {
          const [rows] = await pool.execute(
            `SELECT customer_tier, total_conversations, purchase_count, preferences 
             FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ? LIMIT 1`,
            [instance.merchantId, customerPhone]
          );
          const row = (rows as any[])[0];
          if (row) {
            actionProfile = {
              customerTier: row.customer_tier || 'new',
              totalConversations: row.total_conversations || 0,
              purchaseCount: row.purchase_count || 0,
              preferences: row.preferences ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences) : {},
            };
          }
        }
      } catch { /* profile is supplementary */ }
      
      const realIntent = detectIntent(
        messageText,
        actionProfile?.totalConversations,
        actionProfile?.preferences?.buyingStage,
      );
      
      selectAction({
        merchantId: instance.merchantId,
        customerMessage: messageText,
        botResponse: response,
        intent: realIntent,
        profile: actionProfile ? {
          customerTier: actionProfile.customerTier || 'new',
          totalConversations: actionProfile.totalConversations || 0,
          purchaseCount: actionProfile.purchaseCount || 0,
        } as Partial<CustomerProfile> : null,
      }).then(async (action) => {
        if (action.type !== 'text_only') {
          console.log(`[ActionSelector] 🎯 Action selected: ${action.type} (intent: ${realIntent})`);
          await executeAction({
            action,
            merchantId: instance.merchantId,
            customerPhone,
            conversationId,
            sendMessage: async (phone, msg) => {
              await sendMessageWithCredentials(
                instance.instanceId, instance.token,
                instance.apiUrl || 'https://api.green-api.com',
                phone, msg
              );
            },
          });
        }
      }).catch(() => {}); // Non-blocking
    } catch { /* action selector is supplementary */ }
    
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
        instance = await getWhatsAppInstanceByInstanceId(instanceId);
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