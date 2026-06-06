/**
 * Green API Polling System
 * 
 * This module handles polling for incoming WhatsApp messages
 * for accounts that don't support webhooks (free tier).
 */

import * as whatsapp from './whatsapp';
import {
  createConversation,
  createMessage,
  getAllWhatsAppConnectionRequests,
  getConversationByMerchantAndPhone,
  getConversationsByMerchantId,
  getWhatsAppConnectionRequestByMerchantId,
  getMessagesByConversationId,
  updateConversation,
} from './db';
import { processIncomingMessage, type AIResponse } from './ai';
import { processVoiceMessage } from './ai/voice-handler';

// Store active polling intervals
const activePollers: Map<number, NodeJS.Timeout> = new Map();

// Polling interval in milliseconds (2 seconds for faster response)
const POLLING_INTERVAL = 2000;

// Track processed messages to prevent duplicate responses
const processedMessages: Set<string> = new Set();

// Clean up old processed messages every 5 minutes
setInterval(() => {
  processedMessages.clear();
  // LIM-02: Also clean AI rate limit counters
  aiRateLimiter.clear();
}, 5 * 60 * 1000);

// LIM-02: AI call rate limiter — max 100 calls per hour per merchant
const AI_MAX_CALLS_PER_HOUR = 100;
const aiRateLimiter: Map<number, { count: number; resetAt: number }> = new Map();

function checkAIRateLimit(merchantId: number): boolean {
  const now = Date.now();
  const entry = aiRateLimiter.get(merchantId);
  if (!entry || now > entry.resetAt) {
    aiRateLimiter.set(merchantId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= AI_MAX_CALLS_PER_HOUR) {
    console.warn(`[Polling] ⚠️ AI rate limit reached for merchant ${merchantId}: ${entry.count}/${AI_MAX_CALLS_PER_HOUR} calls/hour`);
    return false;
  }
  entry.count++;
  return true;
}

/**
 * Start polling for a specific merchant
 */
export async function startPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already polling
    if (activePollers.has(merchantId)) {
      console.log(`[Polling] Already polling for merchant ${merchantId}`);
      return { success: true };
    }

    // Get merchant's WhatsApp connection from connection requests
    const connection = await getWhatsAppConnectionRequestByMerchantId(merchantId);
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'WhatsApp not connected' };
    }

    if (!connection.instanceId || !connection.apiToken) {
      return { success: false, error: 'Missing Green API credentials' };
    }

    const apiUrl = 'https://api.green-api.com';

    // ── FIX: Check if this instance has a webhook URL configured ──
    // Business instances use webhooks and should NOT be switched to polling.
    // Clearing their webhook URL breaks message delivery!
    try {
      const currentSettings = await whatsapp.getWebhookSettings(connection.instanceId, connection.apiToken, apiUrl);
      if (currentSettings.webhookUrl && currentSettings.webhookUrl.length > 5) {
        console.log(`[Polling] ⏭️ Skipping merchant ${merchantId} — webhook already configured: ${currentSettings.webhookUrl}`);
        return { success: true }; // Webhook is active, no need for polling
      }
    } catch (settingsErr) {
      console.warn(`[Polling] Could not check webhook settings for merchant ${merchantId}, proceeding with polling`);
    }

    console.log(`[Polling] Starting polling for merchant ${merchantId} (no webhook configured)`);

    // Clear webhook URL before starting polling (required for polling to work)
    console.log(`[Polling] Clearing webhook URL for merchant ${merchantId} to enable polling mode...`);
    const clearResult = await whatsapp.clearWebhookUrl(connection.instanceId, connection.apiToken, apiUrl);
    
    if (!clearResult.success) {
      console.warn(`[Polling] Warning: Failed to clear webhook URL for merchant ${merchantId}: ${clearResult.error}`);
    } else {
      console.log(`[Polling] Webhook URL cleared successfully for merchant ${merchantId}`);
      // Wait a moment for Green API to process the settings change
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Start polling interval
    const interval = setInterval(async () => {
      await pollMessages(merchantId, connection.instanceId!, connection.apiToken!, apiUrl);
    }, POLLING_INTERVAL);

    activePollers.set(merchantId, interval);

    // Poll immediately
    await pollMessages(merchantId, connection.instanceId, connection.apiToken, apiUrl);

    return { success: true };
  } catch (error: any) {
    console.error(`[Polling] Error starting polling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Stop polling for a specific merchant
 */
export function stopPolling(merchantId: number): void {
  const interval = activePollers.get(merchantId);
  if (interval) {
    clearInterval(interval);
    activePollers.delete(merchantId);
    console.log(`[Polling] Stopped polling for merchant ${merchantId}`);
  }
}

/**
 * Poll for messages from Green API
 */
async function pollMessages(
  merchantId: number,
  instanceId: string,
  apiToken: string,
  apiUrl: string
): Promise<void> {
  try {
    // Receive notification from Green API
    const { notification, receiptId, error } = await whatsapp.receiveNotification(instanceId, apiToken, apiUrl);

    if (error) {
      console.error(`[Polling] Error receiving notification for merchant ${merchantId}:`, error);
      return;
    }

    if (!notification || !receiptId) {
      // No new messages
      return;
    }

    console.log(`[Polling] Received notification for merchant ${merchantId}:`, JSON.stringify(notification, null, 2));

    // Process the notification
    await processNotification(merchantId, instanceId, apiToken, apiUrl, notification);

    // Delete the notification from queue
    await whatsapp.deleteNotification(instanceId, apiToken, receiptId, apiUrl);

  } catch (error) {
    console.error(`[Polling] Error polling messages for merchant ${merchantId}:`, error);
  }
}

/**
 * Process incoming notification
 */
async function processNotification(
  merchantId: number,
  instanceId: string,
  apiToken: string,
  apiUrl: string,
  notification: any
): Promise<void> {
  try {
    // Check notification type
    const typeWebhook = notification.typeWebhook;

    if (typeWebhook === 'incomingMessageReceived') {
      await handleIncomingMessage(merchantId, instanceId, apiToken, apiUrl, notification);
    } else if (typeWebhook === 'stateInstanceChanged') {
      console.log(`[Polling] Instance state changed for merchant ${merchantId}:`, notification.stateInstance);
    } else {
      console.log(`[Polling] Ignoring notification type: ${typeWebhook}`);
    }
  } catch (error) {
    console.error(`[Polling] Error processing notification:`, error);
  }
}

/**
 * Handle incoming message
 */
async function handleIncomingMessage(
  merchantId: number,
  instanceId: string,
  apiToken: string,
  apiUrl: string,
  notification: any
): Promise<void> {
  try {
    const messageData = notification.messageData;
    const senderData = notification.senderData;

    if (!messageData || !senderData) {
      console.log('[Polling] Missing messageData or senderData');
      return;
    }

    // Extract phone number (remove @c.us suffix)
    const customerPhone = senderData.chatId?.replace('@c.us', '') || senderData.sender?.replace('@c.us', '');
    const customerName = senderData.senderName || senderData.chatName || customerPhone;

    if (!customerPhone) {
      console.log('[Polling] Missing customer phone');
      return;
    }

    // Get message content
    let messageText = '';
    const messageType = messageData.typeMessage;

    if (messageType === 'textMessage') {
      messageText = messageData.textMessageData?.textMessage || '';
    } else if (messageType === 'extendedTextMessage') {
      messageText = messageData.extendedTextMessageData?.text || '';
    } else if (messageType === 'audioMessage' || messageType === 'voiceMessage') {
      // Handle voice messages with transcription
      const audioData = messageData.audioMessageData || messageData.fileMessageData;
      const audioUrl = audioData?.downloadUrl || audioData?.url;
      
      if (audioUrl) {
        console.log(`[Polling] Voice message received, URL: ${audioUrl}`);
        
        // Process voice message separately
        await handleVoiceMessage(
          merchantId,
          instanceId,
          apiToken,
          apiUrl,
          customerPhone,
          customerName,
          audioUrl,
          notification.idMessage
        );
        return; // Voice message handled separately
      } else {
        messageText = '[رسالة صوتية - لم يتم العثور على الرابط]';
      }
    } else if (messageType === 'imageMessage') {
      messageText = messageData.imageMessageData?.caption || '[صورة]';
    } else {
      messageText = `[${messageType}]`;
    }

    console.log(`[Polling] Incoming message from ${customerPhone}: ${messageText}`);

    // Check if message was already processed (prevent duplicate responses)
    const messageId = notification.idMessage;
    if (messageId && processedMessages.has(messageId)) {
      console.log(`[Polling] Message ${messageId} already processed, skipping`);
      return;
    }
    
    // Mark message as processed
    if (messageId) {
      processedMessages.add(messageId);
    }

    // Get or create conversation
    let conversation = await getConversationByMerchantAndPhone(merchantId, customerPhone);
    
    if (!conversation) {
      // Create new conversation
      const conversationId = await createConversation({
        merchantId,
        customerPhone,
        customerName,
        status: 'active',
      });
      const conversations = await getConversationsByMerchantId(merchantId);
      conversation = conversations.find(c => c.customerPhone === customerPhone);
    }

    if (!conversation) {
      console.error('[Polling] Failed to create/get conversation');
      return;
    }

    // ── Human Takeover Check (parity with webhook path) ──
    if ((conversation as any).humanTakeover) {
      const expiresAt = (conversation as any).humanExpiresAt;
      const takeoverAge = (conversation as any).humanTakeoverAt
        ? Date.now() - new Date((conversation as any).humanTakeoverAt).getTime()
        : Infinity;
      const { MAX_PERMANENT_TAKEOVER_MS: MAX_TAKEOVER_MS } = await import('./ai/takeover-constants');

      if (takeoverAge > MAX_TAKEOVER_MS) {
        // Force-expire stuck takeover
        await updateConversation(conversation.id, { humanTakeover: 0, humanExpiresAt: null } as any);
        console.log(`[Polling] ⚠️ Force-expired stuck takeover on conv ${conversation.id}`);
      } else if (!expiresAt || new Date(expiresAt) > new Date()) {
        // Human is still active — save message but don't respond
        console.log(`[Polling] Sari silent — human takeover active on conv ${conversation.id}`);
        await createMessage({
          conversationId: conversation.id,
          direction: 'incoming',
          content: messageText,
          messageType: 'text',
          isProcessed: 0,
        });
        return;
      } else {
        // Takeover expired + customer sent new message → resume with context
        console.log(`[Polling] Takeover expired on conv ${conversation.id} — building resume context`);
        
        // Build resume context from last 20 messages
        const allMsgs = await getMessagesByConversationId(conversation.id);
        const last20 = allMsgs.slice(-20);
        const resumeLines: string[] = [];
        for (const msg of last20) {
          const dir = (msg as any).direction;
          const content = ((msg as any).content || '').substring(0, 300);
          const sender = (msg as any).senderType;
          if (!content || content === '[media]') continue;
          if (dir === 'incoming') {
            resumeLines.push(`▸ العميل: "${content}"`);
          } else if (sender === 'merchant' || sender === 'human') {
            resumeLines.push(`▸ التاجر (يدوي): "${content}"`);
          } else {
            resumeLines.push(`▸ البوت: "${content}"`);
          }
        }
        
        await updateConversation(conversation.id, {
          humanTakeover: 0,
          humanExpiresAt: null,
          agentHistory: JSON.stringify({ resumeContext: resumeLines.join('\n') }),
        } as any);
        // Fall through to normal AI processing (no "عدت لخدمتك" message)
      }
    }

    // ── Bot Settings Check (autoReply + working hours) ──
    try {
      const { getBotSettings, shouldBotRespond } = await import('./db');
      const botSettings = await getBotSettings(merchantId);
      if (!botSettings.autoReplyEnabled) {
        console.log(`[Polling] Auto-reply disabled for merchant ${merchantId}`);
        await createMessage({
          conversationId: conversation.id,
          direction: 'incoming',
          content: messageText,
          messageType: 'text',
          isProcessed: 0,
        });
        return;
      }
      const { shouldRespond: canRespond, reason: respondReason } = await shouldBotRespond(merchantId);
      if (!canRespond) {
        console.log(`[Polling] Outside working hours for merchant ${merchantId} — reason: ${respondReason}`);
        await createMessage({
          conversationId: conversation.id,
          direction: 'incoming',
          content: messageText,
          messageType: 'text',
          isProcessed: 0,
        });
        // Send out-of-hours message if configured
        if (botSettings.outOfHoursMessage) {
          await whatsapp.sendMessageWithCredentials(
            instanceId, apiToken, apiUrl, customerPhone,
            botSettings.outOfHoursMessage as string
          );
        }
        return;
      }
    } catch (settingsErr) {
      console.warn('[Polling] Bot settings check failed, continuing:', settingsErr);
    }

    // ── Welcome Message for first-time customers (parity with webhook) ──
    try {
      const { getBotSettings: getBSWelcome } = await import('./db');
      const bsWelcome = await getBSWelcome(merchantId);
      if (bsWelcome.welcomeMessage) {
        const existingMsgs = await getMessagesByConversationId(conversation.id);
        if (existingMsgs.length === 0) {
          console.log(`[Polling] 🎉 First-time customer ${customerPhone} — sending welcome`);
          await whatsapp.sendMessageWithCredentials(
            instanceId, apiToken, apiUrl, customerPhone,
            bsWelcome.welcomeMessage as string
          );
        }
      }
    } catch { /* non-blocking */ }

    // Save incoming message
    await createMessage({
      conversationId: conversation.id,
      direction: 'incoming',
      content: messageText,
      messageType: 'text',
      isProcessed: 0,
    });

    // Update conversation
    await updateConversation(conversation.id, {
      lastMessageAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    // LIM-02: Check AI rate limit before processing
    if (!checkAIRateLimit(merchantId)) {
      console.log(`[Polling] Skipping AI response due to rate limit for merchant ${merchantId}`);
      return;
    }

    // Process with AI and send response
    const aiResponse = await processIncomingMessage(
      merchantId,
      conversation.id,
      customerPhone,
      messageText
    );

    if (aiResponse) {
      // Apply responseDelay from botSettings (parity with webhook)
      try {
        const { getBotSettings: getBSForDelay } = await import('./db');
        const bsDelay = await getBSForDelay(merchantId);
        const delayMs = (bsDelay.responseDelay ?? 2) * 1000;
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch { /* use no delay on error */ }

      // Phase 2: Send text response first
      const sendResult = await whatsapp.sendMessageWithCredentials(
        instanceId,
        apiToken,
        apiUrl,
        customerPhone,
        aiResponse.text
      );

      if (sendResult.success) {
        console.log(`[Polling] ✅ Sent AI text response to ${customerPhone}`);
      } else {
        console.error(`[Polling] ❌ Failed to send AI response:`, sendResult.error);
      }

      // Phase 2: Send media attachments (product images, documents)
      if (aiResponse.media && aiResponse.media.length > 0) {
        for (const mediaItem of aiResponse.media) {
          // Rate-limit: wait 1.5s between media sends
          await new Promise(resolve => setTimeout(resolve, 1500));
          try {
            if (mediaItem.type === 'image') {
              const imgResult = await whatsapp.sendImageWithCredentials(
                instanceId, apiToken, apiUrl, customerPhone,
                mediaItem.url, mediaItem.caption
              );
              if (imgResult.success) {
                console.log(`[Polling] 🖼️ Sent product image to ${customerPhone}`);
              } else {
                // UX-02: Notify customer that image failed with fallback text
                console.warn(`[Polling] Image send failed, sending fallback text`);
                await whatsapp.sendMessageWithCredentials(
                  instanceId, apiToken, apiUrl, customerPhone,
                  `📷 ${mediaItem.caption || 'صورة المنتج غير متوفرة مؤقتاً'}`
                );
              }
            } else if (mediaItem.type === 'document') {
              const fileResult = await whatsapp.sendFileWithCredentials(
                instanceId, apiToken, apiUrl, customerPhone,
                mediaItem.url, mediaItem.fileName || 'document.pdf', mediaItem.caption
              );
              if (fileResult.success) {
                console.log(`[Polling] 📎 Sent document to ${customerPhone}`);
              }
            }
          } catch (mediaErr) {
            console.error(`[Polling] Failed to send media:`, mediaErr);
          }
        }
      }

      // Phase 4: Send discount code if AI shared one — with validation
      if (aiResponse.discountCode) {
        // UX-04: Verify discount code exists and is valid before sending
        try {
          const { getDiscountCodesByMerchantId } = await import('./db');
          const allDiscounts = await getDiscountCodesByMerchantId(merchantId);
          const validDiscount = allDiscounts.find((d: any) =>
            d.code.toUpperCase() === aiResponse.discountCode!.toUpperCase() &&
            d.isActive === 1 &&
            (!d.expiresAt || new Date(d.expiresAt) > new Date()) &&
            (!d.maxUses || d.usedCount < d.maxUses)
          );

          if (validDiscount) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await whatsapp.sendMessageWithCredentials(
              instanceId, apiToken, apiUrl, customerPhone,
              `🎁 كود خصم خاص لك: *${aiResponse.discountCode}*\nاستخدمه عند الطلب للحصول على الخصم ✨`
            );
            console.log(`[Polling] 🎁 Sent validated discount code ${aiResponse.discountCode} to ${customerPhone}`);
          } else {
            console.warn(`[Polling] ⚠️ AI hallucinated discount code "${aiResponse.discountCode}" — not sent to customer`);
          }
        } catch (discountErr) {
          console.error(`[Polling] Error validating discount code:`, discountErr);
        }
      }

      // FIX-8 (P1): ActionSelector parity with webhook path (fire-and-forget).
      // Without this, polling customers get no deal stage updates, no discount
      // offers, no follow-up scheduling — degraded sales experience.
      try {
        const { selectAction, executeAction } = await import('./ai/action-selector');
        const { detectIntent } = await import('./ai/session-context');
        
        // Load customer profile (read-only)
        let actionProfile: any = null;
        try {
          const { getPool } = await import('./db');
          const pool = await getPool();
          if (pool) {
            const [rows] = await pool.execute(
              `SELECT customer_tier, total_conversations, purchase_count, preferences 
               FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ? LIMIT 1`,
              [merchantId, customerPhone]
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
          merchantId,
          customerMessage: messageText,
          botResponse: aiResponse.text,
          intent: realIntent,
          profile: actionProfile ? {
            customerTier: actionProfile.customerTier || 'new',
            totalConversations: actionProfile.totalConversations || 0,
          } as any : null,
        }).then(async (action) => {
          if (action.type !== 'text_only') {
            console.log(`[Polling/ActionSelector] 🎯 Action: ${action.type} (intent: ${realIntent})`);
            await executeAction({
              action,
              merchantId,
              customerPhone,
              customerName: undefined,
              customerMessage: messageText,
              conversationId: conversation!.id,
              sendMessage: async (phone: string, msg: string) => {
                await whatsapp.sendMessageWithCredentials(
                  instanceId, apiToken, apiUrl, phone, msg
                );
              },
            });
          }
        }).catch(() => {}); // Non-blocking
      } catch { /* action selector is supplementary */ }
    }

  } catch (error) {
    console.error('[Polling] Error handling incoming message:', error);
  }
}

/**
 * Handle voice message with transcription
 */
async function handleVoiceMessage(
  merchantId: number,
  instanceId: string,
  apiToken: string,
  apiUrl: string,
  customerPhone: string,
  customerName: string,
  audioUrl: string,
  messageId?: string
): Promise<void> {
  try {
    // Check if message was already processed
    if (messageId && processedMessages.has(messageId)) {
      console.log(`[Polling] Voice message ${messageId} already processed, skipping`);
      return;
    }
    
    // Mark message as processed
    if (messageId) {
      processedMessages.add(messageId);
    }

    console.log(`[Polling] Processing voice message from ${customerPhone}`);

    // Get or create conversation
    let conversation = await getConversationByMerchantAndPhone(merchantId, customerPhone);
    
    if (!conversation) {
      const conversationId = await createConversation({
        merchantId,
        customerPhone,
        customerName,
        status: 'active',
      });
      const conversations = await getConversationsByMerchantId(merchantId);
      conversation = conversations.find(c => c.customerPhone === customerPhone);
    }

    if (!conversation) {
      console.error('[Polling] Failed to create/get conversation for voice message');
      return;
    }

    // Process voice message using voice handler
    const result = await processVoiceMessage({
      merchantId,
      conversationId: conversation.id,
      customerPhone,
      customerName,
      audioUrl,
    });

    // UX-03: Parse voice AI response through rich media pipeline
    // This ensures [SEND_IMAGE:id] and [SEND_DISCOUNT:CODE] commands work for voice messages too
    const { parseAICommands: parseVoiceCommands } = await import('./ai');
    const voiceAiResponse = await parseVoiceCommands(result.response, merchantId);

    // Send text response
    const sendResult = await whatsapp.sendMessageWithCredentials(
      instanceId,
      apiToken,
      apiUrl,
      customerPhone,
      voiceAiResponse.text
    );

    if (sendResult.success) {
      console.log(`[Polling] Sent voice response to ${customerPhone}`);
    } else {
      console.error(`[Polling] Failed to send voice response:`, sendResult.error);
    }

    // Send media attachments from voice response
    if (voiceAiResponse.media && voiceAiResponse.media.length > 0) {
      for (const mediaItem of voiceAiResponse.media) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          if (mediaItem.type === 'image') {
            await whatsapp.sendImageWithCredentials(
              instanceId, apiToken, apiUrl, customerPhone,
              mediaItem.url, mediaItem.caption
            );
          }
        } catch (mediaErr) {
          console.error(`[Polling] Failed to send voice media:`, mediaErr);
        }
      }
    }

  } catch (error: any) {
    console.error('[Polling] Error handling voice message:', error);
    
    // Send error message to customer
    try {
      await whatsapp.sendMessageWithCredentials(
        instanceId,
        apiToken,
        apiUrl,
        customerPhone,
        'عذراً، لم أتمكن من فهم الرسالة الصوتية. يرجى إرسال رسالة نصية أو إعادة المحاولة. 🙏'
      );
    } catch (sendError) {
      console.error('[Polling] Failed to send error message:', sendError);
    }
  }
}

/**
 * Start polling for all connected merchants
 */
export async function startAllPolling(): Promise<void> {
  try {
    console.log('[Polling] Starting polling for all connected merchants...');
    
    // Get all connected WhatsApp connections
    const connections = await getAllWhatsAppConnectionRequests();
    const connectedConnections = connections.filter(c => c.status === 'connected');
    
    for (const connection of connectedConnections) {
      if (connection.instanceId && connection.apiToken) {
        await startPolling(connection.merchantId);
      }
    }

    console.log(`[Polling] Started polling for ${connectedConnections.length} merchants`);
  } catch (error) {
    console.error('[Polling] Error starting all polling:', error);
  }
}

/**
 * Stop all polling
 */
export function stopAllPolling(): void {
  console.log('[Polling] Stopping all polling...');
  activePollers.forEach((interval, merchantId) => {
    clearInterval(interval);
    console.log(`[Polling] Stopped polling for merchant ${merchantId}`);
  });
  activePollers.clear();
}

/**
 * Get polling status
 */
export function getPollingStatus(): { merchantId: number; active: boolean }[] {
  return Array.from(activePollers.keys()).map(merchantId => ({
    merchantId,
    active: true,
  }));
}


/**
 * Restart polling for a specific merchant
 * This will stop the current polling, clear webhook URL, and start fresh
 */
export async function restartPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Polling] Restarting polling for merchant ${merchantId}...`);
    
    // Stop current polling if active
    stopPolling(merchantId);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start polling (this will clear webhook URL)
    return await startPolling(merchantId);
  } catch (error: any) {
    console.error(`[Polling] Error restarting polling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Restart all polling
 * This will stop all current polling, clear webhook URLs, and start fresh
 */
export async function restartAllPolling(): Promise<void> {
  try {
    console.log('[Polling] Restarting all polling...');
    
    // Stop all current polling
    stopAllPolling();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start all polling (this will clear webhook URLs)
    await startAllPolling();
  } catch (error) {
    console.error('[Polling] Error restarting all polling:', error);
  }
}

/**
 * Force clear webhook and restart polling for a merchant
 * Use this when webhook is blocking polling
 */
export async function forceClearAndRestartPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Polling] Force clearing webhook and restarting polling for merchant ${merchantId}...`);
    
    // Get merchant's WhatsApp connection
    const connection = await getWhatsAppConnectionRequestByMerchantId(merchantId);
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'WhatsApp not connected' };
    }

    if (!connection.instanceId || !connection.apiToken) {
      return { success: false, error: 'Missing Green API credentials' };
    }

    // Stop current polling
    stopPolling(merchantId);

    // Force clear webhook URL
    const apiUrl = 'https://api.green-api.com';
    console.log(`[Polling] Force clearing webhook URL for instance ${connection.instanceId}...`);
    
    const clearResult = await whatsapp.clearWebhookUrl(connection.instanceId, connection.apiToken, apiUrl);
    
    if (clearResult.success) {
      console.log(`[Polling] Webhook URL cleared successfully. Waiting for Green API to process...`);
      // Wait longer for Green API to process the settings change
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds as recommended by Green API
    } else {
      console.warn(`[Polling] Warning: Failed to clear webhook URL: ${clearResult.error}`);
    }

    // Start polling
    return await startPolling(merchantId);
  } catch (error: any) {
    console.error(`[Polling] Error in forceClearAndRestartPolling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}
