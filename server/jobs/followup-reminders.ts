/**
 * Follow-Up Reminder Job
 * 
 * Runs every 5 minutes.
 * Checks for conversations with a scheduled follow-up (from Action Selector).
 * When the follow-up time arrives, sends a gentle reminder to the customer
 * and clears the follow-up flag.
 * 
 * Follow-ups are stored in conversations.agent_history JSON:
 * { "followup_at": "2026-05-18T10:00:00Z", "followup_reason": "العميل متردد" }
 */

import * as db from '../db';
import { sendMessageWithCredentials } from '../whatsapp';

const FOLLOWUP_MESSAGES = [
  'مرحباً! 😊 رجعت أتطمن عليك — هل قدرت تاخذ قرار بخصوص ما ناقشناه؟ إذا عندك أي سؤال أنا هنا 🙏',
  'أهلاً! 👋 أبغى أتأكد إنك لقيت اللي تبحث عنه — تبي أساعدك بشي إضافي؟',
  'هلا! 😄 حبيت أتابع معك — لا تتردد إذا فيه أي استفسار!',
];

/** Process due follow-up reminders */
async function processFollowUps(): Promise<void> {
  try {
    const pool = await db.getPool();
    if (!pool) return;

    // Find conversations with follow-ups that are due
    const [rows] = await pool.execute(
      `SELECT c.id, c.merchant_id, c.customer_phone, c.agent_history
       FROM conversations c
       WHERE c.agent_history IS NOT NULL
       AND JSON_EXTRACT(c.agent_history, '$.followup_at') IS NOT NULL
       AND JSON_EXTRACT(c.agent_history, '$.followup_at') <= NOW()
       AND c.status = 'active'
       LIMIT 10`
    );

    const conversations = rows as any[];
    if (conversations.length === 0) return;

    let processed = 0;

    for (const conv of conversations) {
      try {
        const merchantId = conv.merchant_id;
        const customerPhone = conv.customer_phone;

        // Get WhatsApp instance for this merchant
        const instances = await db.getWhatsAppInstancesByMerchantId(merchantId);
        const activeInstance = instances.find((i: any) => i.status === 'active');

        if (!activeInstance) continue;

        // Send follow-up message
        const msgIdx = Math.floor(Math.random() * FOLLOWUP_MESSAGES.length);
        await sendMessageWithCredentials(
          (activeInstance as any).instanceId,
          (activeInstance as any).token,
          (activeInstance as any).apiUrl || 'https://api.green-api.com',
          customerPhone,
          FOLLOWUP_MESSAGES[msgIdx]
        );

        // Clear the follow-up flag
        await pool.execute(
          `UPDATE conversations SET 
            agent_history = JSON_REMOVE(agent_history, '$.followup_at', '$.followup_reason')
           WHERE id = ? AND merchant_id = ?`,
          [conv.id, merchantId]
        );

        processed++;
        console.log(`[FollowUpJob] ✅ Follow-up sent to ***${customerPhone.slice(-4)} (conv #${conv.id})`);

      } catch (convErr: any) {
        console.warn(`[FollowUpJob] Failed for conv #${conv.id}: ${convErr.message}`);
      }
    }

    if (processed > 0) {
      console.log(`[FollowUpJob] Processed ${processed} follow-up(s)`);
    }
  } catch (err: any) {
    console.error('[FollowUpJob] Error:', err.message);
  }
}

/** Start the follow-up reminder job (runs every 5 minutes) */
export function startFollowUpJob(): void {
  console.log('[FollowUpJob] ✅ Started — checking every 5min for due follow-ups');

  // Run immediately on startup
  processFollowUps();

  // Then every 5 minutes
  setInterval(processFollowUps, 5 * 60_000);
}
