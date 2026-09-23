/**
 * Learning Database Module — Continuous Learning Engine
 * 
 * Tables:
 *   - sari_learning_signals: Real-time behavioral signals from conversations
 *   - sari_behavioral_dna: Evolved behavioral insights per merchant
 */

import { getPool } from '../db';
import { assertRuntimeSchema } from './schema-readiness';
import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SignalType =
  | 'positive_feedback'     // العميل شكر أو أثنى
  | 'purchase_completed'    // العميل اشترى
  | 'purchase_refunded'
  | 'question_repeated'     // العميل كرر سؤاله
  | 'customer_left'         // العميل غادر بدون رد
  | 'escalation_requested'  // العميل طلب بشري
  | 'price_objection'       // اعتراض على السعر
  | 'knowledge_gap'         // البوت ما عنده معلومات
  | 'merchant_correction'   // التاجر صحح الرد
  | 'long_conversation'     // محادثة ناجحة 5+ رسائل
  | 'quick_resolution';     // حل سريع 1-2 رسائل

export type DNADimension =
  | 'greeting_style'        // كيف يرحب
  | 'objection_handling'    // كيف يتعامل مع الاعتراضات
  | 'closing_technique'     // كيف يغلق البيع
  | 'tone_preference'       // اللهجة المفضلة
  | 'product_emphasis'      // أي منتجات يركز عليها
  | 'upsell_timing'         // متى يقترح منتجات إضافية
  | 'knowledge_gaps'        // ماذا ينقصه من معلومات
  | 'pain_points'           // ما يزعج العملاء
  | 'winning_patterns'      // أنماط ناجحة
  | 'losing_patterns';      // أنماط فاشلة

export interface LearningSignal {
  id: number;
  merchantId: number;
  conversationId: number;
  signalType: SignalType;
  signalWeight: number;
  botMessage: string | null;
  customerMessage: string | null;
  merchantCorrection: string | null;
  contextSummary: string | null;
  createdAt: Date;
}

export interface BehavioralDNA {
  id: number;
  merchantId: number;
  generation: number;
  dimension: DNADimension;
  insight: string;
  evidenceCount: number;
  confidence: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Table Creation
// ═══════════════════════════════════════════════════════════════

export async function ensureLearningTables(): Promise<void> {
  await assertRuntimeSchema('adaptive learning', [
    { table: 'sari_learning_signals' },
    { table: 'sari_behavioral_dna' },
    { table: 'ai_learning_proposals' },
    { table: 'ai_learning_evidence_links' },
    { table: 'sari_escalation_queue' },
    { table: 'merchants', columns: ['escalation_phones', 'emergency_phone'] },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Signals — CRUD
// ═══════════════════════════════════════════════════════════════

/** Capture a learning signal from a conversation */
export async function captureSignal(data: {
  merchantId: number;
  conversationId: number;
  signalType: SignalType;
  signalWeight?: number;
  botMessage?: string;
  customerMessage?: string;
  merchantCorrection?: string;
  contextSummary?: string;
  sourceKey?: string;
  strict?: boolean;
}): Promise<void> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) { if (data.strict) throw new Error('Learning storage unavailable'); return; }

  // Daily cap: max 500 signals per merchant per day
  try {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sari_learning_signals 
       WHERE merchant_id = ? AND created_at >= CURDATE()`,
      [data.merchantId]
    );
    if ((countRows as any[])[0]?.cnt >= 500) return;
  } catch { /* continue */ }

  try {
    await pool.execute(
      `INSERT INTO sari_learning_signals 
       (merchant_id, conversation_id, signal_type, signal_weight,
        bot_message, customer_message, merchant_correction, context_summary, source_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        data.merchantId,
        data.conversationId,
        data.signalType,
        data.signalWeight ?? 1.0,
        data.botMessage?.substring(0, 2000) ?? null,
        data.customerMessage?.substring(0, 2000) ?? null,
        data.merchantCorrection?.substring(0, 2000) ?? null,
        data.contextSummary?.substring(0, 500) ?? null,
        data.sourceKey?.substring(0, 160) ?? null,
      ]
    );
  } catch (e: any) {
    console.error('[Learning] captureSignal failed:', e.message);
    if (data.strict) throw e;
  }
}

/** Get recent unanalyzed signals for a merchant */
export async function getUnanalyzedSignals(
  merchantId: number,
  limit: number = 100
): Promise<LearningSignal[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const [rows] = await pool.execute(
    `SELECT * FROM sari_learning_signals 
     WHERE merchant_id = ? AND analyzed = 0
     ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [merchantId]
  );
  return rows as LearningSignal[];
}

/** Mark signals as analyzed */
export async function markSignalsAnalyzed(
  merchantId: number,
  signalIds: number[]
): Promise<void> {
  if (signalIds.length === 0) return;
  const pool = await getPool();
  if (!pool) return;

  const placeholders = signalIds.map(() => '?').join(',');
  await pool.execute(
    `UPDATE sari_learning_signals SET analyzed = 1 
     WHERE merchant_id = ? AND id IN (${placeholders})`,
    [merchantId, ...signalIds]
  );
}

/** Count unanalyzed signals */
export async function countUnanalyzedSignals(merchantId: number): Promise<number> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    `SELECT COUNT(*) as cnt FROM sari_learning_signals 
     WHERE merchant_id = ? AND analyzed = 0`,
    [merchantId]
  );
  return (rows as any[])[0]?.cnt || 0;
}

/** Get signal distribution for a merchant (for dashboard) */
export async function getSignalDistribution(
  merchantId: number,
  days: number = 30
): Promise<{ signalType: string; count: number; avgWeight: number }[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeDays = Math.min(Math.max(days, 1), 90);
  const [rows] = await pool.execute(
    `SELECT signal_type as signalType, COUNT(*) as count, AVG(signal_weight) as avgWeight
     FROM sari_learning_signals 
     WHERE merchant_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY signal_type ORDER BY count DESC`,
    [merchantId, safeDays]
  );
  return (rows as any[]).map(r => ({
    signalType: r.signalType,
    count: Number(r.count),
    avgWeight: Number(r.avgWeight) || 1.0,
  }));
}

// ═══════════════════════════════════════════════════════════════
// Behavioral DNA — CRUD
// ═══════════════════════════════════════════════════════════════

/** Get all active DNA for a merchant */
export async function getActiveDNA(merchantId: number): Promise<BehavioralDNA[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM sari_behavioral_dna 
     WHERE merchant_id = ? AND is_active = 1
     ORDER BY confidence DESC`,
    [merchantId]
  );
  return rows as BehavioralDNA[];
}

/** Get the current DNA generation number */
export async function getDNAGeneration(merchantId: number): Promise<number> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    `SELECT MAX(generation) AS gen FROM (
      SELECT generation FROM sari_behavioral_dna WHERE merchant_id = ?
      UNION ALL SELECT generation FROM ai_learning_proposals WHERE merchant_id = ?
    ) generations`,
    [merchantId, merchantId]
  );
  return (rows as any[])[0]?.gen || 0;
}

export async function getLearningEvidence(merchantId: number) {
  const pool = await getPool();
  if (!pool) throw new Error('Learning evidence unavailable');
  const [proposals] = await pool.execute<any[]>(`SELECT p.id, p.dimension, p.insight,
    (SELECT COUNT(DISTINCT s.conversation_id) FROM ai_learning_evidence_links e
      JOIN sari_learning_signals s ON s.id = e.signal_id AND s.merchant_id = e.merchant_id
      WHERE e.proposal_id = p.id AND e.merchant_id = p.merchant_id) AS evidence_count
    FROM ai_learning_proposals p WHERE p.merchant_id = ?
    AND p.status = 'proposed' ORDER BY p.id DESC LIMIT 20`, [merchantId]);
  const evidenceByProposal = new Map<number, Array<{ signalId: number; conversationId: number; relation: string; type: string; excerpt: string }>>();
  if (proposals.length) {
    const [evidence] = await pool.execute<any[]>(`SELECT * FROM (SELECT e.proposal_id, e.signal_id, e.relation, s.conversation_id,
      s.signal_type, LEFT(COALESCE(s.customer_message, s.context_summary, ''), 500) AS excerpt,
      ROW_NUMBER() OVER (PARTITION BY e.proposal_id ORDER BY e.signal_id DESC) AS sample_rank
      FROM ai_learning_evidence_links e JOIN sari_learning_signals s ON s.id = e.signal_id AND s.merchant_id = e.merchant_id
      WHERE e.merchant_id = ? AND e.proposal_id IN (${proposals.map(() => '?').join(',')})) samples
      WHERE sample_rank <= 20 ORDER BY proposal_id DESC, signal_id DESC`,
    [merchantId, ...proposals.map(p => p.id)]);
    for (const row of evidence) {
      const list = evidenceByProposal.get(Number(row.proposal_id)) || [];
      if (list.length < 20) list.push({ signalId: Number(row.signal_id), conversationId: Number(row.conversation_id),
        relation: String(row.relation), type: String(row.signal_type), excerpt: String(row.excerpt) });
      evidenceByProposal.set(Number(row.proposal_id), list);
    }
  }
  const [counts] = await pool.execute<any[]>(`SELECT COUNT(*) AS count FROM ai_learning_proposals
    WHERE merchant_id = ? AND status = 'proposed'`, [merchantId]);
  const [outcomes] = await pool.execute<any[]>(`SELECT
    COUNT(DISTINCT CASE WHEN e.outcome_type = 'purchase_completed' AND p.status = 'captured' THEN e.payment_id END) AS purchases,
    COUNT(DISTINCT CASE WHEN e.outcome_type = 'purchase_refunded' AND p.status = 'refunded' THEN e.payment_id END) AS refunds
    FROM ai_purchase_outcomes e JOIN order_payments p ON p.id = e.payment_id AND p.merchant_id = e.merchant_id
    WHERE e.merchant_id = ?`, [merchantId]);
  return { proposalCount: Number(counts[0]?.count || 0), verifiedPurchases: Number(outcomes[0]?.purchases || 0),
    verifiedRefunds: Number(outcomes[0]?.refunds || 0), source: 'tap' as const,
    proposals: proposals.map(row => ({ id: Number(row.id), dimension: String(row.dimension), insight: String(row.insight),
      evidenceCount: Number(row.evidence_count), evidence: evidenceByProposal.get(Number(row.id)) || [], status: 'proposed' as const })) };
}

/** Upsert a DNA dimension (create or evolve) */
export async function upsertDNA(data: {
  merchantId: number;
  generation: number;
  dimension: DNADimension;
  insight: string;
  evidenceCount: number;
  confidence: number;
  autoApplied?: boolean;
}): Promise<void> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return;

  // Even a legacy caller passing autoApplied=true can only propose. Publication requires
  // a separate versioned evaluation/experiment/approval workflow, not this boolean.
  await pool.execute(`INSERT INTO ai_learning_proposals
    (merchant_id, generation, dimension, insight, content_hash, evidence_count, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
  [data.merchantId, data.generation, data.dimension, data.insight.substring(0, 5000),
    createHash('sha256').update(data.insight).digest('hex'), data.evidenceCount, data.confidence]);
}

/** Get total conversations for a merchant (for maturity calculation) */
export async function getTotalConversations(merchantId: number): Promise<number> {
  const pool = await getPool();
  if (!pool) return 0;

  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM conversations WHERE merchantId = ?`,
      [merchantId]
    );
    return (rows as any[])[0]?.cnt || 0;
  } catch { return 0; }
}

/** Get total signals for a merchant */
export async function getTotalSignals(merchantId: number): Promise<number> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return 0;

  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sari_learning_signals WHERE merchant_id = ?`,
      [merchantId]
    );
    return (rows as any[])[0]?.cnt || 0;
  } catch { return 0; }
}

// ═══════════════════════════════════════════════════════════════
// Escalation Queue — Smart Escalation Protocol
// ═══════════════════════════════════════════════════════════════

export type EscalationStatus = 'pending' | 'notified' | 'answered' | 'expired' | 'auto_resolved';
export type EscalationPriority = 'urgent' | 'standard' | 'low';

export interface EscalationItem {
  id: number;
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName: string | null;
  question: string;
  botResponse: string | null;
  status: EscalationStatus;
  merchantAnswer: string | null;
  priority: EscalationPriority;
  merchantNotifiedAt: Date | null;
  merchantAnsweredAt: Date | null;
  followedUp: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  // Cascading escalation
  currentEscalationLevel: number;
  lastEscalatedAt: Date | null;
}

/** Create a new escalation entry */
export async function createEscalation(data: {
  merchantId: number; conversationId: number; customerPhone: string; incomingMessageId?: number;
  customerName?: string; question: string; botResponse?: string; priority?: EscalationPriority;
}): Promise<number | null> {
  await ensureLearningTables();
  const { createSourcedEscalation } = await import('../ai/escalation-relay');
  return createSourcedEscalation(data);
}

/** Mark escalation as notified (merchant was alerted) at given level */
export async function markEscalationNotified(escalationId: number, merchantId: number, level: number = 0): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE sari_escalation_queue 
     SET status = 'notified', merchant_notified_at = NOW(),
         current_escalation_level = GREATEST(current_escalation_level, ?), last_escalated_at = NOW()
     WHERE id = ? AND merchant_id = ? AND status IN ('pending','notified')`,
    [level, escalationId, merchantId]
  );
}

/** Update escalation level (cascade to next phone) — PEN-ESC-03 FIX: merchant_id guard */
export async function updateEscalationLevel(escalationId: number, level: number, merchantId?: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  if (merchantId) {
    await pool.execute(
      `UPDATE sari_escalation_queue 
       SET current_escalation_level = ?, last_escalated_at = NOW()
       WHERE id = ? AND merchant_id = ?`,
      [level, escalationId, merchantId]
    );
  } else {
    await pool.execute(
      `UPDATE sari_escalation_queue 
       SET current_escalation_level = ?, last_escalated_at = NOW()
       WHERE id = ?`,
      [level, escalationId]
    );
  }
}

/** Get escalations that need cascading to next phone (notified > 5 min ago, not answered) */
export async function getEscalationsNeedingCascade(): Promise<EscalationItem[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  // PEN-ESC-02 FIX: LIMIT 20 per cycle to prevent unbounded processing
  const [rows] = await pool.execute(
    `SELECT * FROM sari_escalation_queue 
     WHERE status = 'notified'
     AND last_escalated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     AND expires_at > NOW()
     AND NOT EXISTS (SELECT 1 FROM sales_escalation_relays r WHERE r.escalation_id=sari_escalation_queue.id AND r.merchant_id=sari_escalation_queue.merchant_id)
     LIMIT 20`
  );
  return rows as EscalationItem[];
}

/** Mark escalation as exhausted (all phones tried, no answer) — PEN-ESC-03 FIX */
export async function markEscalationExhausted(escalationId: number, merchantId?: number): Promise<void> {
  if (!Number.isSafeInteger(merchantId) || Number(merchantId) <= 0) return;
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE sari_escalation_queue SET status = 'expired', followed_up = 1 WHERE id = ? AND merchant_id = ?
      AND status IN ('pending','notified') AND NOT EXISTS (SELECT 1 FROM sales_escalation_relays r
        WHERE r.escalation_id=sari_escalation_queue.id AND r.merchant_id=sari_escalation_queue.merchant_id)`,
      [escalationId, merchantId!]
    );
}

/** Resolve escalation with merchant's answer */
export async function resolveEscalation(data: {
  merchantId: number;
  customerPhone: string;
  conversationId?: number;
  merchantAnswer: string;
}): Promise<EscalationItem | null> {
  if (!data.customerPhone || !Number.isSafeInteger(data.conversationId) || Number(data.conversationId) <= 0) return null;
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM sari_escalation_queue WHERE merchant_id=? AND conversation_id=? AND customer_phone=?
      AND status IN ('pending','notified') ORDER BY created_at DESC LIMIT 1`,
    [data.merchantId, data.conversationId!, data.customerPhone]);

  const escalation = rows[0];
  if (!escalation) return null;

  await pool.execute(
    `UPDATE sari_escalation_queue 
     SET status = 'answered', merchant_answer = ?, merchant_answered_at = NOW()
     WHERE id = ? AND merchant_id = ? AND status IN ('pending','notified')`,
    [data.merchantAnswer.substring(0, 2000), escalation.id, data.merchantId]
  );

  // Normalize snake_case SQL columns to camelCase for JS consumers
  return {
    ...escalation,
    customerPhone: escalation.customer_phone || escalation.customerPhone,
    customerName: escalation.customer_name || escalation.customerName,
    merchantId: escalation.merchant_id || escalation.merchantId,
    conversationId: escalation.conversation_id || escalation.conversationId,
    botResponse: escalation.bot_response || escalation.botResponse,
    merchantAnswer: data.merchantAnswer,
    merchantNotifiedAt: escalation.merchant_notified_at || escalation.merchantNotifiedAt,
    merchantAnsweredAt: new Date(),
    currentEscalationLevel: escalation.current_escalation_level ?? escalation.currentEscalationLevel ?? 0,
    lastEscalatedAt: escalation.last_escalated_at || escalation.lastEscalatedAt,
    expiresAt: escalation.expires_at || escalation.expiresAt,
    followedUp: escalation.followed_up ?? escalation.followedUp ?? false,
    status: 'answered',
  } as EscalationItem;
}

/** Get active escalation for a customer */
export async function getActiveEscalation(
  merchantId: number,
  customerPhone: string
): Promise<EscalationItem | null> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sari_escalation_queue 
     WHERE merchant_id = ? AND customer_phone = ? AND status IN ('pending', 'notified')
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId, customerPhone]
  );

  return (rows as any[])[0] as EscalationItem || null;
}

/**
 * PEN-ESC-01 FIX: Check if merchant has ANY active escalation pending.
 * Used by webhook to verify an escalation reply is expected before processing.
 * Without this check, any message from a chain member phone would be
 * incorrectly treated as an escalation reply — causing cross-customer data leakage.
 */
export async function getActiveEscalationForMerchant(
  merchantId: number
): Promise<EscalationItem | null> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sari_escalation_queue 
     WHERE merchant_id = ? AND status IN ('pending', 'notified')
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId]
  );

  return (rows as any[])[0] as EscalationItem || null;
}

/** Get escalations needing follow-up (>15 min, not followed up yet) */
export async function getEscalationsNeedingFollowUp(merchantId: number): Promise<EscalationItem[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM sari_escalation_queue 
     WHERE merchant_id = ? AND status IN ('pending', 'notified') 
     AND followed_up = 0
     AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
    [merchantId]
  );
  return rows as EscalationItem[];
}

/** Expire stale escalations (>24 hours unanswered) — PEN-INFO-03 FIX: batch limit */
export async function expireStaleEscalations(): Promise<number> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return 0;

  // PEN-INFO-03: Limit to 500 per cycle to prevent table locks
  const [result] = await pool.execute(
    `UPDATE sari_escalation_queue 
     SET status = 'expired' 
     WHERE status IN ('pending', 'notified') AND expires_at < NOW()
     LIMIT 500`
  );
  return (result as any).affectedRows || 0;
}

/** Get today's unanswered questions for gap digest */
export async function getDailyKnowledgeGaps(merchantId: number): Promise<{ question: string; count: number }[]> {
  await ensureLearningTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT question, COUNT(*) as count 
     FROM sari_escalation_queue 
     WHERE merchant_id = ? AND created_at >= CURDATE()
     GROUP BY question ORDER BY count DESC LIMIT 10`,
    [merchantId]
  );
  return (rows as any[]).map(r => ({ question: r.question, count: Number(r.count) }));
}
