/**
 * Takeover Expiry Job
 * 
 * Runs every 60 seconds.
 * 
 * Handles TWO cases:
 * 
 * A) TIMED TAKEOVER (humanExpiresAt is set — from manual merchant reply)
 *    - When humanExpiresAt < NOW(): clear takeover + respond to pending messages
 * 
 * B) PERMANENT TAKEOVER (humanExpiresAt is NULL — from "سأتولى المحادثة")
 *    - After 1 hour: Send reminder to merchant about waiting customers
 *    - After 24 hours: Force-expire + respond to pending messages
 * 
 * This prevents:
 * 1. Customer sends message during takeover → saved but not processed
 * 2. Takeover expires → but no new message comes to trigger the expiry check
 * 3. Customer waits forever for a response
 * 4. Merchant forgets they activated permanent takeover
 * 
 * SECURITY NOTES:
 * - VULN-1 FIX: Mark message as processed BEFORE calling AI to prevent double-response race
 * - VULN-2 FIX: Skip reminder if merchant phone matches any active takeover customer phone
 * - VULN-3 FIX: Mark message as processed even on AI failure
 */

import * as db from '../db';

let _isRunning = false;

// Track which conversations we already sent reminders for (prevents spam)
const _remindersSent = new Set<number>();

// Marker prefix for system-generated messages (so outgoing handler can ignore them)
const SYSTEM_MSG_PREFIX = '⚠️ *تنبيه من ساري:*';

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

    // ═══════════════════════════════════════════════════════
    // CASE A: Timed takeovers that have expired
    // ═══════════════════════════════════════════════════════
    const expiredConvs = await pool.execute(
      `SELECT c.id, c.merchant_id, c.customer_phone, c.human_expires_at
       FROM conversations c
       WHERE c.human_takeover = 1
         AND c.human_expires_at IS NOT NULL
         AND c.human_expires_at < NOW()`,
    );

    const timedRows = (expiredConvs as any)[0] as any[];
    if (timedRows && timedRows.length > 0) {
      for (const conv of timedRows) {
        await resumeConversation(pool, conv, 'timed_expiry');
      }
    }

    // ═══════════════════════════════════════════════════════
    // CASE B: Permanent takeovers (humanExpiresAt IS NULL)
    // ═══════════════════════════════════════════════════════
    const permanentConvs = await pool.execute(
      `SELECT c.id, c.merchant_id, c.customer_phone, c.customer_name,
              c.human_takeover_at,
              TIMESTAMPDIFF(MINUTE, c.human_takeover_at, NOW()) as age_minutes
       FROM conversations c
       WHERE c.human_takeover = 1
         AND c.human_expires_at IS NULL
         AND c.human_takeover_at IS NOT NULL`,
    );

    const permanentRows = (permanentConvs as any)[0] as any[];
    if (permanentRows && permanentRows.length > 0) {
      for (const conv of permanentRows) {
        const ageMinutes = conv.age_minutes || 0;

        // After 24 hours → force-expire and resume Sari
        if (ageMinutes >= 1440) { // 24 * 60 = 1440
          console.log(`[TakeoverExpiry] ⚠️ Permanent takeover on conv ${conv.id} exceeded 24h — force-expiring`);
          await resumeConversation(pool, conv, 'force_24h');
          _remindersSent.delete(conv.id); // cleanup
          continue;
        }

        // After 1 hour → send reminder to merchant (once per takeover)
        if (ageMinutes >= 60 && !_remindersSent.has(conv.id)) {
          // Only send if there are ACTUAL unprocessed messages waiting
          const [pendingCheck] = await pool.execute(
            `SELECT COUNT(*) as count FROM messages
             WHERE conversation_id = ? AND direction = 'incoming' AND is_processed = 0`,
            [conv.id],
          );
          const hasPending = (pendingCheck as any[])?.[0]?.count > 0;

          if (hasPending) {
            await sendMerchantReminder(pool, conv);
          }
          _remindersSent.add(conv.id);
        }
      }
    }

    // Cleanup reminder tracking for conversations that are no longer in takeover
    if (_remindersSent.size > 0) {
      const activeIds = new Set((permanentRows || []).map((r: any) => r.id));
      for (const id of _remindersSent) {
        if (!activeIds.has(id)) {
          _remindersSent.delete(id);
        }
      }
    }

  } catch (err: any) {
    console.error('[TakeoverExpiry] Job error:', err.message);
  } finally {
    _isRunning = false;
  }
}

/**
 * Resume a conversation: clear takeover + process last pending message
 * 
 * VULN-1 FIX: Marks message as is_processed=1 BEFORE calling AI,
 * preventing double-response race between cron and webhook handler.
 */
async function resumeConversation(pool: any, conv: any, reason: string): Promise<void> {
  try {
    // 1. Clear the takeover
    await db.updateConversation(conv.id, {
      humanTakeover: 0,
      humanExpiresAt: null,
    } as any);

    console.log(`[TakeoverExpiry] ✅ Auto-cleared takeover on conv ${conv.id} (reason: ${reason}, merchant: ${conv.merchant_id})`);

    // 2. Check for unprocessed incoming messages
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
    if (!pendingMsgs || pendingMsgs.length === 0) return;

    const lastMsg = pendingMsgs[0];
    console.log(`[TakeoverExpiry] 📨 Found unprocessed message on conv ${conv.id}: "${(lastMsg.content || '').substring(0, 50)}..."`);

    // ── VULN-1 FIX: Mark as processed IMMEDIATELY to prevent race condition ──
    // If the webhook handler processes the same message simultaneously,
    // it will see is_processed=1 and skip it.
    await pool.execute(
      `UPDATE messages SET is_processed = 1 WHERE id = ?`,
      [lastMsg.id],
    );

    // 3. Get merchant's WhatsApp instance
    const instances = await db.getWhatsAppInstancesByMerchantId(conv.merchant_id);
    const activeInstance = instances.find((i: any) => i.isActive || i.is_active);

    if (!activeInstance) {
      console.warn(`[TakeoverExpiry] No active WhatsApp instance for merchant ${conv.merchant_id}`);
      return;
    }

    // 4. Get bot settings
    const botSettings = await db.getBotSettings(conv.merchant_id);
    const resumeMsg = botSettings.takeoverResumeMessage || 'مرحباً! عدت لخدمتك 😊';

    // 5. Generate AI response for the pending message
    try {
      const { chatWithSari } = await import('../ai/sari-personality');
      const response = await chatWithSari({
        merchantId: conv.merchant_id,
        message: lastMsg.content || '',
        conversationId: conv.id,
        customerPhone: conv.customer_phone,
      });

      // 6. Send via WhatsApp
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

      // 8. Track usage
      try {
        const { incrementMessageCount } = await import('../usage-tracking');
        await incrementMessageCount(conv.merchant_id);
      } catch { /* non-blocking */ }

      console.log(`[TakeoverExpiry] ✅ Auto-responded to pending message on conv ${conv.id}`);
    } catch (aiErr: any) {
      console.error(`[TakeoverExpiry] AI response failed for conv ${conv.id}:`, aiErr.message);
      // ── VULN-3 FIX: Message already marked processed above, so no re-processing ──
      // Fallback: send resume message to let customer know Sari is back
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
  } catch (convErr: any) {
    console.error(`[TakeoverExpiry] Error processing conv ${conv.id}:`, convErr.message);
  }
}

/**
 * Send a reminder notification to the merchant about forgotten customers
 * Uses the merchant's WhatsApp number (emergency phone or main phone)
 * 
 * VULN-2 FIX: Sends via in-app notification as primary channel.
 * WhatsApp reminder is sent to merchant's own phone number ONLY if different
 * from the customer's phone (to prevent self-triggering takeover loops).
 */
async function sendMerchantReminder(pool: any, conv: any): Promise<void> {
  try {
    // Count total pending conversations for this merchant
    const [pendingResult] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM conversations c
       INNER JOIN messages m ON m.conversation_id = c.id
       WHERE c.merchant_id = ?
         AND c.human_takeover = 1
         AND m.direction = 'incoming'
         AND m.is_processed = 0`,
      [conv.merchant_id],
    );
    const pendingCount = (pendingResult as any[])?.[0]?.count || 1;

    // Get merchant info to find their phone
    const merchant = await db.getMerchantById(conv.merchant_id);
    if (!merchant) return;

    const customerName = conv.customer_name || conv.customer_phone;
    const ageHours = Math.round((conv.age_minutes || 60) / 60);

    // ── PRIMARY: In-app notification (always safe, no loop risk) ──
    try {
      const { notifyNewMessage } = await import('../_core/notificationService');
      await notifyNewMessage(
        conv.merchant_id,
        'ساري ⚠️',
        `${pendingCount} ${pendingCount > 1 ? 'عملاء' : 'عميل'} بانتظار ردك منذ ${ageHours} ساعة — أرسل "يسعدنا خدمتكم" لاستئناف ساري`,
      );
      console.log(`[TakeoverExpiry] 📢 In-app notification sent to merchant ${conv.merchant_id}`);
    } catch { /* non-blocking */ }

    // ── SECONDARY: WhatsApp reminder (with VULN-2 guard) ──
    const merchantPhone = (merchant as any).emergencyPhone || merchant.phone;
    if (!merchantPhone) {
      console.warn(`[TakeoverExpiry] No phone for merchant ${conv.merchant_id} — skipping WhatsApp reminder`);
      return;
    }

    // ── VULN-2 GUARD: Don't send if merchant phone IS the customer phone ──
    // This prevents: reminder sent → outgoing webhook → new takeover activated
    const normalizedMerchant = merchantPhone.replace(/[^0-9]/g, '');
    const normalizedCustomer = (conv.customer_phone || '').replace(/[^0-9]/g, '');
    if (normalizedMerchant === normalizedCustomer) {
      console.warn(`[TakeoverExpiry] Merchant phone === customer phone — skipping WhatsApp reminder to prevent loop`);
      return;
    }

    // Get the WhatsApp instance to send the reminder
    const instances = await db.getWhatsAppInstancesByMerchantId(conv.merchant_id);
    const activeInstance = instances.find((i: any) => i.isActive || i.is_active);
    if (!activeInstance) return;

    const reminderMessage = `${SYSTEM_MSG_PREFIX}

لديك ${pendingCount > 1 ? `${pendingCount} عملاء` : 'عميل'} بانتظار الرد منذ ${ageHours} ${ageHours > 1 ? 'ساعات' : 'ساعة'}.

${pendingCount === 1 ? `👤 *${customerName}* ينتظر ردك` : `👤 آخرهم: *${customerName}*`}

📌 لاستئناف ساري، أرسل:
*يسعدنا خدمتكم*

⏰ سيعود ساري تلقائياً بعد 24 ساعة من التدخل البشري.`;

    const { sendMessageWithCredentials } = await import('../whatsapp');
    const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
    await sendMessageWithCredentials(
      activeInstance.instanceId,
      activeInstance.token,
      apiUrl,
      merchantPhone,
      reminderMessage,
    );

    console.log(`[TakeoverExpiry] 📢 WhatsApp reminder sent to merchant ${conv.merchant_id} (${merchantPhone}) — ${pendingCount} pending customer(s)`);

  } catch (err: any) {
    console.error(`[TakeoverExpiry] Failed to send merchant reminder:`, err.message);
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
