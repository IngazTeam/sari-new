/**
 * Supervisor Cron Job
 * 
 * Runs every 5 minutes.
 * Finds conversations where the customer went silent 30+ minutes ago.
 * Evaluates each one and sends a supervisor recovery message if needed.
 * 
 * Safety:
 * - Max 20 conversations per cycle (prevent overload)
 * - Only runs during business hours (8 AM - 10 PM)
 * - One intervention per conversation (tracked in DB)
 * - Non-blocking: errors in one conversation don't affect others
 */

import {
  getPool,
  getMerchantById,
  getWhatsAppInstancesByMerchantId,
  createMessage,
} from '../db';
import {
  evaluateConversationForRecovery,
  isEligibleForSupervisor,
  recordSupervisorAction,
} from '../ai/supervisor-recovery';

let _isRunning = false;
let _migrated = false;
const MAX_PER_CYCLE = 20;

// ════════════════════════════════════════════════
// Main Check
// ════════════════════════════════════════════════

async function runSupervisorCheck(): Promise<void> {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const pool = await getPool();
    if (!pool) {
      _isRunning = false;
      return;
    }

    // ── Auto-migration: ensure supervisor columns/table exist ──
    if (!_migrated) {
      try {
        await pool.execute(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS supervisor_intervened_at TIMESTAMP NULL DEFAULT NULL`);
        await pool.execute(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS supervisor_reason VARCHAR(50) NULL DEFAULT NULL`);
        await pool.execute(`CREATE TABLE IF NOT EXISTS supervisor_interventions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          merchant_id INT NOT NULL,
          conversation_id INT NOT NULL,
          reason VARCHAR(50) NOT NULL,
          recovery_message TEXT,
          customer_responded TINYINT(1) DEFAULT 0,
          led_to_conversion TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_merchant (merchant_id),
          INDEX idx_created (created_at)
        )`);
        _migrated = true;
        console.log('[Supervisor] ✅ DB migration complete');
      } catch (migErr) {
        // Non-blocking — columns/table may already exist
        _migrated = true;
      }
    }

    // Business hours check
    const currentHour = new Date().getHours();
    if (currentHour < 8 || currentHour >= 22) {
      _isRunning = false;
      return;
    }

    // ── Find eligible conversations ──
    // Customer's last message was 30-120 minutes ago
    // (120 max to avoid processing very old conversations)
    const [rows] = await pool.execute(`
      SELECT 
        c.id as conversationId,
        c.merchantId,
        c.customerPhone,
        c.customerName,
        c.supervisor_intervened_at,
        (SELECT COUNT(*) FROM messages WHERE conversationId = c.id) as messageCount,
        (SELECT content FROM messages WHERE conversationId = c.id AND direction = 'incoming' ORDER BY createdAt DESC LIMIT 1) as lastCustomerMessage,
        (SELECT createdAt FROM messages WHERE conversationId = c.id AND direction = 'incoming' ORDER BY createdAt DESC LIMIT 1) as lastCustomerMessageAt
      FROM conversations c
      WHERE c.human_takeover = 0
        AND c.supervisor_intervened_at IS NULL
        AND EXISTS (
          SELECT 1 FROM messages m 
          WHERE m.conversationId = c.id 
            AND m.direction = 'incoming'
            AND m.createdAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            AND m.createdAt > DATE_SUB(NOW(), INTERVAL 120 MINUTE)
        )
        AND NOT EXISTS (
          SELECT 1 FROM messages m2
          WHERE m2.conversationId = c.id
            AND m2.direction = 'incoming'
            AND m2.createdAt > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        )
      ORDER BY c.updatedAt DESC
      LIMIT ?
    `, [MAX_PER_CYCLE]);

    const candidates = rows as any[];
    if (!candidates || candidates.length === 0) {
      _isRunning = false;
      return;
    }

    console.log(`[Supervisor] 🔍 Found ${candidates.length} candidate conversations`);

    for (const conv of candidates) {
      try {
        await processConversation(pool, conv);
      } catch (err) {
        console.error(`[Supervisor] Error processing conv ${conv.conversationId}:`, (err as Error).message);
      }
    }

  } catch (err) {
    console.error('[Supervisor] Cron job error:', (err as Error).message);
  } finally {
    _isRunning = false;
  }
}

// ════════════════════════════════════════════════
// Process Single Conversation
// ════════════════════════════════════════════════

async function processConversation(pool: any, conv: any): Promise<void> {
  // Eligibility check
  if (!isEligibleForSupervisor({
    messageCount: conv.messageCount || 0,
    lastCustomerMessage: conv.lastCustomerMessage || '',
    hasPurchase: false, // TODO: Check orders table
    alreadyIntervened: !!conv.supervisor_intervened_at,
    currentHour: new Date().getHours(),
  })) {
    return;
  }

  // Get conversation messages
  const [msgRows] = await pool.execute(
    `SELECT direction, content, createdAt FROM messages 
     WHERE conversationId = ? ORDER BY createdAt ASC LIMIT 30`,
    [conv.conversationId]
  );

  const messages = (msgRows as any[]).map(m => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: m.content || '',
  }));

  if (messages.length < 3) return;

  // Get merchant info
  const merchant = await getMerchantById(conv.merchantId);
  if (!merchant) return;

  // ── Evaluate ──
  const analysis = await evaluateConversationForRecovery({
    messages,
    merchantBusinessName: merchant.businessName,
  });

  recordSupervisorAction(analysis.reason);

  if (!analysis.shouldIntervene || analysis.confidence < 0.5 || !analysis.recoveryMessage) {
    return;
  }

  console.log(`[Supervisor] 🎯 Intervening on conv ${conv.conversationId} — reason: ${analysis.reason} (confidence: ${analysis.confidence})`);

  // ── Send recovery message ──
  const instances = await getWhatsAppInstancesByMerchantId(conv.merchantId);
  const activeInstance = instances.find((i: any) => i.status === 'active');
  if (!activeInstance) {
    console.warn(`[Supervisor] No active WhatsApp instance for merchant ${conv.merchantId}`);
    return;
  }

  try {
    const { sendMessageWithCredentials } = await import('../whatsapp');
    const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
    await sendMessageWithCredentials(
      activeInstance.instanceId,
      activeInstance.token,
      apiUrl,
      conv.customerPhone,
      analysis.recoveryMessage,
    );

    // Save the message
    await createMessage({
      conversationId: conv.conversationId,
      direction: 'outgoing',
      messageType: 'text',
      content: analysis.recoveryMessage,
      voiceUrl: null,
      isProcessed: 1,
      aiResponse: null,
    });

    // Mark as intervened
    await pool.execute(
      `UPDATE conversations SET supervisor_intervened_at = NOW(), supervisor_reason = ? WHERE id = ?`,
      [analysis.reason, conv.conversationId]
    );

    // Record in supervisor_interventions table
    try {
      await pool.execute(
        `INSERT INTO supervisor_interventions (merchant_id, conversation_id, reason, recovery_message, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [conv.merchantId, conv.conversationId, analysis.reason, analysis.recoveryMessage]
      );
    } catch {
      // Table may not exist yet — non-blocking
    }

    // Track usage
    try {
      const { incrementMessageUsage } = await import('../usage-tracking');
      await incrementMessageUsage(conv.merchantId);
    } catch { /* non-blocking */ }

    console.log(`[Supervisor] ✅ Recovery sent to ${conv.customerPhone} on conv ${conv.conversationId}`);

  } catch (sendErr) {
    console.error(`[Supervisor] Failed to send recovery:`, (sendErr as Error).message);
  }
}

// ════════════════════════════════════════════════
// Job Starter
// ════════════════════════════════════════════════

/** Start the supervisor recovery job (runs every 5 minutes) */
export function startSupervisorRecoveryJob(): void {
  console.log('[Supervisor] ✅ Started — checking every 5 min for silent conversations');

  // Run first check after 2 minutes (let server boot first)
  setTimeout(runSupervisorCheck, 2 * 60_000);

  // Then every 5 minutes
  setInterval(runSupervisorCheck, 5 * 60_000);
}
