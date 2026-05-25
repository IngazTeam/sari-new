/**
 * Loss Detector — Why didn't the customer buy?
 * 
 * Periodic background job that analyzes stalled conversations and
 * classifies the reason for loss. This data feeds:
 * - Sales Pipeline Board (loss reasons breakdown)
 * - Learning Engine (pattern analysis of failures)
 * - Contextual Follow-ups (recovery messages based on reason)
 * 
 * Runs every hour via cronJobs.ts
 * 
 * 8 Loss Reasons:
 *   price           — last objection was about price + ghost
 *   trust           — last objection was about trust + ghost
 *   competitor      — mentioned another store/competitor
 *   delivery        — asked about delivery + ghost
 *   payment_failed  — Tap status = FAILED/DECLINED (set by tap-webhook.ts)
 *   payment_abandoned — payment link sent but never completed
 *   no_response     — ghost 72h with no clear objection
 *   human_needed    — escalation expired without merchant response
 */

import { getPool } from '../db';
import { captureSignal } from '../db/learning';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type LossReason =
  | 'price'
  | 'trust'
  | 'competitor'
  | 'delivery'
  | 'payment_failed'
  | 'payment_abandoned'
  | 'no_response'
  | 'human_needed';

export interface LossDetectionResult {
  merchantId: number;
  conversationId: number;
  reason: LossReason;
  lastCustomerMessage: string;
  stalledHours: number;
}

// ═══════════════════════════════════════════════════════════════
// Objection Detection Patterns
// ═══════════════════════════════════════════════════════════════

const OBJECTION_PATTERNS: { reason: LossReason; patterns: RegExp[] }[] = [
  {
    reason: 'price',
    patterns: [
      /غالي/i, /غالية/i, /كثير/i, /مبالغ/i, /السعر عالي/i,
      /أرخص/i, /أقل/i, /ما عندكم عروض/i, /خصم/i, /تخفيض/i,
      /expensive/i, /too much/i, /cheaper/i,
    ],
  },
  {
    reason: 'trust',
    patterns: [
      /ما أعرفكم/i, /مضمون/i, /موثوق/i, /أول مرة/i,
      /مو نصب/i, /ضمان/i, /ما أثق/i, /مجرب/i,
    ],
  },
  {
    reason: 'competitor',
    patterns: [
      /مكان ثاني/i, /محل ثاني/i, /أقارن/i, /بشوف عند/i,
      /لقيت أفضل/i, /عند غيركم/i, /منافس/i, /بديل/i,
      /another store/i, /competitor/i,
    ],
  },
  {
    reason: 'delivery',
    patterns: [
      /توصيل/i, /شحن/i, /يوصل/i, /كم يوم/i,
      /ما يوصل/i, /بعيد/i, /مدينت/i, /عنوان/i,
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// Core: Detect Lost Deals
// ═══════════════════════════════════════════════════════════════

/**
 * Scan all merchants' conversations for stalled deals and classify loss reasons.
 * Called by cron job every hour.
 */
export async function detectLostDeals(): Promise<LossDetectionResult[]> {
  const results: LossDetectionResult[] = [];

  try {
    const pool = await getPool();
    if (!pool) return results;

    // ── Auto-add columns if missing (emergency migration pattern) ──
    try {
      await pool.execute(`ALTER TABLE conversations ADD COLUMN loss_reason VARCHAR(30) DEFAULT NULL`);
      console.log('[LossDetector] ✅ Added loss_reason column');
    } catch { /* column already exists */ }
    try {
      await pool.execute(`ALTER TABLE conversations ADD COLUMN stalled_since TIMESTAMP NULL`);
      console.log('[LossDetector] ✅ Added stalled_since column');
    } catch { /* column already exists */ }
    try {
      await pool.execute(`ALTER TABLE conversations ADD COLUMN payment_link_sent_at TIMESTAMP NULL`);
      console.log('[LossDetector] ✅ Added payment_link_sent_at column');
    } catch { /* column already exists */ }

    // ── 1. Payment link sent but no payment (24h+) ──
    const [paymentAbandoned] = await pool.execute(
      `SELECT c.id, c.merchantId, c.customerPhone, c.lastMessage,
              TIMESTAMPDIFF(HOUR, c.payment_link_sent_at, NOW()) as hours_since
       FROM conversations c
       WHERE c.deal_stage = 'payment_link_sent'
         AND c.payment_link_sent_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND c.loss_reason IS NULL
       LIMIT 100`
    );

    for (const row of paymentAbandoned as any[]) {
      await pool.execute(
        `UPDATE conversations SET deal_stage = 'lost', loss_reason = 'payment_abandoned', stalled_since = payment_link_sent_at WHERE id = ?`,
        [row.id]
      );
      results.push({
        merchantId: row.merchantId,
        conversationId: row.id,
        reason: 'payment_abandoned',
        lastCustomerMessage: row.lastMessage || '',
        stalledHours: row.hours_since,
      });
    }

    // ── 2. Escalation expired (pending > 24h, no merchant reply) ──
    const [escalationExpired] = await pool.execute(
      `SELECT c.id, c.merchantId, c.customerPhone, c.lastMessage
       FROM conversations c
       INNER JOIN sari_escalation_queue eq ON eq.conversation_id = c.id
       WHERE eq.status IN ('pending', 'notified')
         AND eq.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND c.deal_stage NOT IN ('paid', 'lost')
         AND c.loss_reason IS NULL
       LIMIT 100`
    );

    for (const row of escalationExpired as any[]) {
      await pool.execute(
        `UPDATE conversations SET deal_stage = 'lost', loss_reason = 'human_needed', stalled_since = NOW() WHERE id = ?`,
        [row.id]
      );
      results.push({
        merchantId: row.merchantId,
        conversationId: row.id,
        reason: 'human_needed',
        lastCustomerMessage: row.lastMessage || '',
        stalledHours: 24,
      });
    }

    // ── 3. Ghost conversations (72h+ no activity, not paid/lost) ──
    const [ghostConvs] = await pool.execute(
      `SELECT c.id, c.merchantId, c.customerPhone, c.lastMessage, c.deal_stage,
              TIMESTAMPDIFF(HOUR, c.lastMessageAt, NOW()) as hours_since
       FROM conversations c
       WHERE c.lastMessageAt < DATE_SUB(NOW(), INTERVAL 72 HOUR)
         AND c.deal_stage IN ('interested', 'qualified', 'ready')
         AND c.loss_reason IS NULL
       LIMIT 200`
    );

    for (const row of ghostConvs as any[]) {
      const reason = classifyLossReason(row.lastMessage || '');
      await pool.execute(
        `UPDATE conversations SET deal_stage = 'lost', loss_reason = ?, stalled_since = lastMessageAt WHERE id = ?`,
        [reason, row.id]
      );
      results.push({
        merchantId: row.merchantId,
        conversationId: row.id,
        reason,
        lastCustomerMessage: row.lastMessage || '',
        stalledHours: row.hours_since,
      });
    }

    // ── 4. Capture loss signals for Learning Engine ──
    for (const loss of results) {
      captureSignal({
        merchantId: loss.merchantId,
        conversationId: loss.conversationId,
        signalType: 'customer_left',
        signalWeight: 1.0,
        customerMessage: loss.lastCustomerMessage.substring(0, 500),
        contextSummary: `صفقة خاسرة: ${loss.reason} (بعد ${loss.stalledHours} ساعة)`,
      }).catch(() => {});
    }

    // ── 5. Schedule recovery follow-ups based on loss reason ──
    try {
      const { scheduleFollowUp } = await import('./proactive-followup');
      const LOSS_TO_FOLLOWUP: Record<string, string> = {
        price: 'recovery_price',
        trust: 'recovery_trust',
        competitor: 'recovery_competitor',
        delivery: 'recovery_delivery',
        payment_abandoned: 'recovery_payment',
        payment_failed: 'recovery_payment',
        no_response: 'recovery_general',
      };

      for (const loss of results) {
        const followUpType = LOSS_TO_FOLLOWUP[loss.reason];
        if (!followUpType) continue;

        // Resolve customerPhone from DB
        const [phoneRows] = await pool.execute(
          `SELECT customerPhone, customerName FROM conversations WHERE id = ? AND merchantId = ? LIMIT 1`,
          [loss.conversationId, loss.merchantId]
        );
        const row = (phoneRows as any[])[0];
        if (!row?.customerPhone) continue;

        scheduleFollowUp({
          merchantId: loss.merchantId,
          customerPhone: row.customerPhone,
          conversationId: loss.conversationId,
          followUpType: followUpType as any,
          customerName: row.customerName || row.customerPhone,
          customDelayMs: 24 * 60 * 60 * 1000, // 24h after detection before recovery outreach
          source: 'loss_recovery',
        }).catch(() => {});
      }
    } catch {
      // Recovery follow-ups are supplementary — non-blocking
    }

    if (results.length > 0) {
      console.log(`[LossDetector] 📊 Detected ${results.length} lost deals:`,
        results.reduce((acc, r) => {
          acc[r.reason] = (acc[r.reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      );
    }

    return results;
  } catch (err: any) {
    console.error('[LossDetector] Failed:', err.message);
    return results;
  }
}

// ═══════════════════════════════════════════════════════════════
// Loss Reason Classification (Rule-Based)
// ═══════════════════════════════════════════════════════════════

/**
 * Classify loss reason from the last customer message.
 * Falls back to 'no_response' if no pattern matches.
 */
function classifyLossReason(lastMessage: string): LossReason {
  if (!lastMessage) return 'no_response';
  const msg = lastMessage.toLowerCase();

  for (const { reason, patterns } of OBJECTION_PATTERNS) {
    if (patterns.some(p => p.test(msg))) {
      return reason;
    }
  }

  return 'no_response';
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Summary (for Sales Pipeline Board)
// ═══════════════════════════════════════════════════════════════

/**
 * Get pipeline summary for a merchant — used by the Sales Pipeline Board.
 */
export async function getPipelineSummary(merchantId: number): Promise<{
  stages: Record<string, number>;
  lossReasons: Record<string, number>;
  hotLeads: any[];
  stalledDeals: any[];
  paymentPending: any[];
  recentWins: any[];
  recentLosses: any[];
}> {
  const pool = await getPool();
  if (!pool) return {
    stages: {}, lossReasons: {},
    hotLeads: [], stalledDeals: [], paymentPending: [],
    recentWins: [], recentLosses: [],
  };

  // Stage counts
  const [stageRows] = await pool.execute(
    `SELECT deal_stage, COUNT(*) as count FROM conversations
     WHERE merchantId = ? AND deal_stage IS NOT NULL
     GROUP BY deal_stage`,
    [merchantId]
  );
  const stages: Record<string, number> = {};
  for (const row of stageRows as any[]) {
    stages[row.deal_stage] = row.count;
  }

  // Loss reasons breakdown
  const [lossRows] = await pool.execute(
    `SELECT loss_reason, COUNT(*) as count FROM conversations
     WHERE merchantId = ? AND loss_reason IS NOT NULL
     GROUP BY loss_reason ORDER BY count DESC`,
    [merchantId]
  );
  const lossReasons: Record<string, number> = {};
  for (const row of lossRows as any[]) {
    lossReasons[row.loss_reason] = row.count;
  }

  // Hot leads (ready + last 48h)
  const [hotRows] = await pool.execute(
    `SELECT id, customerPhone, customerName, lastMessage, lastMessageAt, deal_stage
     FROM conversations
     WHERE merchantId = ? AND deal_stage = 'ready'
       AND lastMessageAt > DATE_SUB(NOW(), INTERVAL 48 HOUR)
     ORDER BY lastMessageAt DESC LIMIT 10`,
    [merchantId]
  );

  // Stalled (qualified + no activity 48h)
  const [stalledRows] = await pool.execute(
    `SELECT id, customerPhone, customerName, lastMessage, lastMessageAt, deal_stage
     FROM conversations
     WHERE merchantId = ? AND deal_stage IN ('interested', 'qualified')
       AND lastMessageAt < DATE_SUB(NOW(), INTERVAL 48 HOUR)
       AND loss_reason IS NULL
     ORDER BY lastMessageAt DESC LIMIT 10`,
    [merchantId]
  );

  // Payment pending
  const [paymentRows] = await pool.execute(
    `SELECT id, customerPhone, customerName, lastMessage, payment_link_sent_at, deal_stage
     FROM conversations
     WHERE merchantId = ? AND deal_stage = 'payment_link_sent'
     ORDER BY payment_link_sent_at DESC LIMIT 10`,
    [merchantId]
  );

  // Recent wins (paid, last 7 days)
  const [winRows] = await pool.execute(
    `SELECT id, customerPhone, customerName, lastMessage, lastMessageAt
     FROM conversations
     WHERE merchantId = ? AND deal_stage = 'paid'
       AND lastMessageAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY lastMessageAt DESC LIMIT 10`,
    [merchantId]
  );

  // Recent losses (last 7 days)
  const [lossDetailRows] = await pool.execute(
    `SELECT id, customerPhone, customerName, lastMessage, loss_reason, stalled_since
     FROM conversations
     WHERE merchantId = ? AND deal_stage = 'lost'
       AND stalled_since > DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY stalled_since DESC LIMIT 10`,
    [merchantId]
  );

  return {
    stages,
    lossReasons,
    hotLeads: hotRows as any[],
    stalledDeals: stalledRows as any[],
    paymentPending: paymentRows as any[],
    recentWins: winRows as any[],
    recentLosses: lossDetailRows as any[],
  };
}
