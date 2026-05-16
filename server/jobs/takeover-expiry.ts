/**
 * Takeover Expiry Job
 * 
 * Runs every 60 seconds.
 * Checks for conversations where human takeover has expired (humanExpiresAt < now).
 * Auto-clears the takeover flag and processes any unresponded messages
 * that arrived during the silence period.
 * 
 * This prevents the "dead zone" where:
 * 1. Customer sends message during takeover → saved but not processed
 * 2. Takeover expires → but no new message comes to trigger the expiry check
 * 3. Customer waits forever for a response that never comes
 */

import * as db from '../db';

let _isRunning = false;

async function runTakeoverExpiryCheck(): Promise<void> {
  // Prevent overlapping runs
  if (_isRunning) return;
  _isRunning = true;

  try {
    const pool = await db.getPool();
    if (!pool) {
      _isRunning = false;
      return;
    }

    // Find all conversations where takeover has expired
    const expiredConvs = await pool.execute(
      `SELECT c.id, c.merchant_id, c.customer_phone, c.human_expires_at
       FROM conversations c
       WHERE c.human_takeover = 1
         AND c.human_expires_at IS NOT NULL
         AND c.human_expires_at < NOW()`,
    );

    const rows = (expiredConvs as any)[0] as any[];
    if (!rows || rows.length === 0) {
      _isRunning = false;
      return;
    }

    for (const conv of rows) {
      try {
        // 1. Clear the takeover
        await db.updateConversation(conv.id, {
          humanTakeover: 0,
          humanExpiresAt: null,
        } as any);

        console.log(`[TakeoverExpiry] ✅ Auto-cleared expired takeover on conv ${conv.id} (merchant ${conv.merchant_id})`);

        // 2. Check for unprocessed incoming messages during takeover
        const unprocessedMsgs = await pool.execute(
          `SELECT id, content, created_at
           FROM messages
           WHERE conversation_id = ?
             AND direction = 'incoming'
             AND is_processed = 0
           ORDER BY created_at DESC
           LIMIT 1`,
          [conv.id],
        );

        const pendingMsgs = (unprocessedMsgs as any)[0] as any[];
        if (pendingMsgs && pendingMsgs.length > 0) {
          const lastMsg = pendingMsgs[0];
          console.log(`[TakeoverExpiry] 📨 Found unprocessed message on conv ${conv.id}: "${(lastMsg.content || '').substring(0, 50)}..."`);

          // 3. Get merchant's WhatsApp instance to send response
          const instances = await db.getWhatsAppInstancesByMerchantId(conv.merchant_id);
          const activeInstance = instances.find((i: any) => i.isActive || i.is_active);

          if (activeInstance) {
            // 4. Get bot settings for resume message
            const botSettings = await db.getBotSettings(conv.merchant_id);
            const resumeMsg = botSettings.takeoverResumeMessage || 'مرحباً! عدت لخدمتك 😊';

            // 5. Import and call chatWithSari for the unprocessed message
            try {
              const { chatWithSari } = await import('../ai/sari-personality');
              const response = await chatWithSari({
                merchantId: conv.merchant_id,
                message: lastMsg.content || '',
                conversationId: conv.id,
                customerPhone: conv.customer_phone,
              });

              // 6. Send the AI response via WhatsApp
              const { sendMessageWithCredentials } = await import('../whatsapp');
              const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
              await sendMessageWithCredentials(
                activeInstance.instanceId,
                activeInstance.token,
                apiUrl,
                conv.customer_phone,
                response,
              );

              // 7. Save outgoing message
              await db.createMessage({
                conversationId: conv.id,
                direction: 'outgoing',
                messageType: 'text',
                content: response,
                voiceUrl: null,
                isProcessed: 1,
                aiResponse: null,
              });

              // 8. Mark original message as processed
              await pool.execute(
                `UPDATE messages SET is_processed = 1 WHERE id = ?`,
                [lastMsg.id],
              );

              // 9. Track usage
              try {
                const { incrementMessageCount } = await import('../usage-tracking');
                await incrementMessageCount(conv.merchant_id);
              } catch { /* non-blocking */ }

              console.log(`[TakeoverExpiry] ✅ Auto-responded to pending message on conv ${conv.id}`);
            } catch (aiErr: any) {
              console.error(`[TakeoverExpiry] AI response failed for conv ${conv.id}:`, aiErr.message);
              // Still send resume message even if AI fails
              try {
                const { sendMessageWithCredentials } = await import('../whatsapp');
                const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
                await sendMessageWithCredentials(
                  activeInstance.instanceId,
                  activeInstance.token,
                  apiUrl,
                  conv.customer_phone,
                  resumeMsg,
                );
              } catch { /* silent */ }
            }
          } else {
            console.warn(`[TakeoverExpiry] No active WhatsApp instance for merchant ${conv.merchant_id}`);
          }
        }
      } catch (convErr: any) {
        console.error(`[TakeoverExpiry] Error processing conv ${conv.id}:`, convErr.message);
      }
    }
  } catch (err: any) {
    console.error('[TakeoverExpiry] Job error:', err.message);
  } finally {
    _isRunning = false;
  }
}

/** Start the takeover expiry check job (runs every 60 seconds) */
export function startTakeoverExpiryJob(): void {
  console.log('[TakeoverExpiry] ✅ Started — checking every 60s for expired takeovers');

  // Run immediately on startup
  runTakeoverExpiryCheck();

  // Then every 60 seconds
  setInterval(runTakeoverExpiryCheck, 60_000);
}
