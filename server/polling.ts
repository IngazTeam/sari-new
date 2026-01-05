/**
 * Green API Polling System
 * 
 * This module handles polling for incoming WhatsApp messages
 * for accounts that don't support webhooks (free tier).
 */

import * as whatsapp from './whatsapp';
import * as db from './db';
import { processIncomingMessage } from './ai';
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
}, 5 * 60 * 1000);

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
    const connection = await db.getWhatsAppConnectionRequestByMerchantId(merchantId);
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'WhatsApp not connected' };
    }

    if (!connection.instanceId || !connection.apiToken) {
      return { success: false, error: 'Missing Green API credentials' };
    }

    console.log(`[Polling] Starting polling for merchant ${merchantId}`);

    const apiUrl = 'https://api.green-api.com';

    // Clear webhook URL before starting polling (required for polling to work)
    console.log(`[Polling] Clearing webhook URL for merchant ${merchantId} to enable polling mode...`);
    const clearResult = await whatsapp.clearWebhookUrl(connection.instanceId, connection.apiToken, apiUrl);
    
    if (!clearResult.success) {
      console.warn(`[Polling] Warning: Failed to clear webhook URL for merchant ${merchantId}: ${clearResult.error}`);
      // Continue anyway - the webhook might already be cleared or the API might have issues
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
    let conversation = await db.getConversationByMerchantAndPhone(merchantId, customerPhone);
    
    if (!conversation) {
      // Create new conversation
      const conversationId = await db.createConversation({
        merchantId,
        customerPhone,
        customerName,
        status: 'active',
      });
      const conversations = await db.getConversationsByMerchantId(merchantId);
      conversation = conversations.find(c => c.customerPhone === customerPhone);
    }

    if (!conversation) {
      console.error('[Polling] Failed to create/get conversation');
      return;
    }

    // Save incoming message
    await db.createMessage({
      conversationId: conversation.id,
      direction: 'incoming',
      content: messageText,
      messageType: 'text',
      isProcessed: 0,
    });

    // Update conversation
    await db.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
    });

    // Process with AI and send response
    const aiResponse = await processIncomingMessage(
      merchantId,
      conversation.id,
      customerPhone,
      messageText
    );

    if (aiResponse) {
      // Send response via WhatsApp
      const sendResult = await whatsapp.sendMessageWithCredentials(
        instanceId,
        apiToken,
        apiUrl,
        customerPhone,
        aiResponse
      );

      if (sendResult.success) {
        console.log(`[Polling] Sent AI response to ${customerPhone}`);
      } else {
        console.error(`[Polling] Failed to send AI response:`, sendResult.error);
      }
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
    let conversation = await db.getConversationByMerchantAndPhone(merchantId, customerPhone);
    
    if (!conversation) {
      const conversationId = await db.createConversation({
        merchantId,
        customerPhone,
        customerName,
        status: 'active',
      });
      const conversations = await db.getConversationsByMerchantId(merchantId);
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

    console.log(`[Polling] Voice transcription: ${result.transcription}`);
    console.log(`[Polling] AI response: ${result.response}`);

    // Send response via WhatsApp
    const sendResult = await whatsapp.sendMessageWithCredentials(
      instanceId,
      apiToken,
      apiUrl,
      customerPhone,
      result.response
    );

    if (sendResult.success) {
      console.log(`[Polling] Sent voice response to ${customerPhone}`);
    } else {
      console.error(`[Polling] Failed to send voice response:`, sendResult.error);
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
    const connections = await db.getAllWhatsAppConnectionRequests();
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
    const connection = await db.getWhatsAppConnectionRequestByMerchantId(merchantId);
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
