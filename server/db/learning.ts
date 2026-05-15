/**
 * Learning Database Module — Continuous Learning Engine
 * 
 * Tables:
 *   - sari_learning_signals: Real-time behavioral signals from conversations
 *   - sari_behavioral_dna: Evolved behavioral insights per merchant
 */

import * as db from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SignalType =
  | 'positive_feedback'     // العميل شكر أو أثنى
  | 'purchase_completed'    // العميل اشترى
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

let _tablesCreated = false;

export async function ensureLearningTables(): Promise<void> {
  if (_tablesCreated) return;

  const pool = await db.getPool();
  if (!pool) return;

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_learning_signals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        signal_type VARCHAR(30) NOT NULL,
        signal_weight DECIMAL(3,2) DEFAULT 1.00,
        bot_message TEXT DEFAULT NULL,
        customer_message TEXT DEFAULT NULL,
        merchant_correction TEXT DEFAULT NULL,
        context_summary TEXT DEFAULT NULL,
        analyzed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_type (merchant_id, signal_type),
        INDEX idx_merchant_date (merchant_id, created_at DESC),
        INDEX idx_merchant_unanalyzed (merchant_id, analyzed)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_behavioral_dna (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        generation INT DEFAULT 1,
        dimension VARCHAR(30) NOT NULL,
        insight TEXT NOT NULL,
        evidence_count INT DEFAULT 1,
        confidence DECIMAL(3,2) DEFAULT 0.50,
        is_active TINYINT(1) DEFAULT 1,
        auto_applied TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_merchant_dimension (merchant_id, dimension),
        INDEX idx_active (merchant_id, is_active)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_escalation_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        customer_name VARCHAR(100) DEFAULT NULL,
        question TEXT NOT NULL,
        bot_response TEXT DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        merchant_answer TEXT DEFAULT NULL,
        priority VARCHAR(10) DEFAULT 'standard',
        merchant_notified_at TIMESTAMP NULL,
        merchant_answered_at TIMESTAMP NULL,
        followed_up TINYINT(1) DEFAULT 0,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_status (merchant_id, status),
        INDEX idx_merchant_date (merchant_id, created_at DESC),
        INDEX idx_customer (merchant_id, customer_phone, status)
      )
    `);

    _tablesCreated = true;
    console.log('[Learning] ✅ Tables initialized');
  } catch (e: any) {
    console.error('[Learning] Failed to create tables:', e.message);
  }
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
}): Promise<void> {
  await ensureLearningTables();
  const pool = await db.getPool();
  if (!pool) return;

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
        bot_message, customer_message, merchant_correction, context_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.merchantId,
        data.conversationId,
        data.signalType,
        data.signalWeight ?? 1.0,
        data.botMessage?.substring(0, 2000) ?? null,
        data.customerMessage?.substring(0, 2000) ?? null,
        data.merchantCorrection?.substring(0, 2000) ?? null,
        data.contextSummary?.substring(0, 500) ?? null,
      ]
    );
  } catch (e: any) {
    console.error('[Learning] captureSignal failed:', e.message);
  }
}

/** Get recent unanalyzed signals for a merchant */
export async function getUnanalyzedSignals(
  merchantId: number,
  limit: number = 100
): Promise<LearningSignal[]> {
  await ensureLearningTables();
  const pool = await db.getPool();
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
  const pool = await db.getPool();
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
  const pool = await db.getPool();
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
  const pool = await db.getPool();
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
  const pool = await db.getPool();
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
  const pool = await db.getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    `SELECT MAX(generation) as gen FROM sari_behavioral_dna WHERE merchant_id = ?`,
    [merchantId]
  );
  return (rows as any[])[0]?.gen || 0;
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
  const pool = await db.getPool();
  if (!pool) return;

  try {
    await pool.execute(
      `INSERT INTO sari_behavioral_dna 
       (merchant_id, generation, dimension, insight, evidence_count, confidence, auto_applied, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         generation = VALUES(generation),
         insight = VALUES(insight),
         evidence_count = evidence_count + VALUES(evidence_count),
         confidence = VALUES(confidence),
         auto_applied = VALUES(auto_applied),
         is_active = 1`,
      [
        data.merchantId,
        data.generation,
        data.dimension,
        data.insight.substring(0, 5000),
        data.evidenceCount,
        data.confidence,
        data.autoApplied ? 1 : 0,
      ]
    );
  } catch (e: any) {
    console.error('[Learning] upsertDNA failed:', e.message);
  }
}

/** Get total conversations for a merchant (for maturity calculation) */
export async function getTotalConversations(merchantId: number): Promise<number> {
  const pool = await db.getPool();
  if (!pool) return 0;

  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM conversations WHERE merchant_id = ?`,
      [merchantId]
    );
    return (rows as any[])[0]?.cnt || 0;
  } catch { return 0; }
}

/** Get total signals for a merchant */
export async function getTotalSignals(merchantId: number): Promise<number> {
  await ensureLearningTables();
  const pool = await db.getPool();
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
}

/** Create a new escalation entry */
export async function createEscalation(data: {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  question: string;
  botResponse?: string;
  priority?: EscalationPriority;
}): Promise<number | null> {
  await ensureLearningTables();
  const pool = await db.getPool();
  if (!pool) return null;

  // Daily cap: max 50 escalations per merchant per day
  try {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sari_escalation_queue 
       WHERE merchant_id = ? AND created_at >= CURDATE()`,
      [data.merchantId]
    );
    if ((countRows as any[])[0]?.cnt >= 50) return null;
  } catch { /* continue */ }

  // Check for duplicate active escalation for same customer
  try {
    const [existing] = await pool.execute(
      `SELECT id FROM sari_escalation_queue 
       WHERE merchant_id = ? AND customer_phone = ? AND status IN ('pending', 'notified')
       LIMIT 1`,
      [data.merchantId, data.customerPhone]
    );
    if ((existing as any[]).length > 0) return (existing as any[])[0].id;
  } catch { /* continue */ }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  try {
    const [result] = await pool.execute(
      `INSERT INTO sari_escalation_queue 
       (merchant_id, conversation_id, customer_phone, customer_name, question, bot_response, priority, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.merchantId,
        data.conversationId,
        data.customerPhone.substring(0, 30),
        data.customerName?.substring(0, 100) ?? null,
        data.question.substring(0, 2000),
        data.botResponse?.substring(0, 2000) ?? null,
        data.priority || 'standard',
        expiresAt,
      ]
    );
    return (result as any).insertId;
  } catch (e: any) {
    console.error('[Escalation] createEscalation failed:', e.message);
    return null;
  }
}

/** Mark escalation as notified (merchant was alerted) */
export async function markEscalationNotified(escalationId: number, merchantId: number): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE sari_escalation_queue SET status = 'notified', merchant_notified_at = NOW() 
     WHERE id = ? AND merchant_id = ?`,
    [escalationId, merchantId]
  );
}

/** Resolve escalation with merchant's answer */
export async function resolveEscalation(data: {
  merchantId: number;
  customerPhone: string;
  merchantAnswer: string;
}): Promise<EscalationItem | null> {
  await ensureLearningTables();
  const pool = await db.getPool();
  if (!pool) return null;

  let rows: any[];

  if (data.customerPhone) {
    // Find by specific customer
    const [result] = await pool.execute(
      `SELECT * FROM sari_escalation_queue 
       WHERE merchant_id = ? AND customer_phone = ? AND status IN ('pending', 'notified')
       ORDER BY created_at DESC LIMIT 1`,
      [data.merchantId, data.customerPhone]
    );
    rows = result as any[];
  } else {
    // Merchant reply — find the most recent pending escalation
    const [result] = await pool.execute(
      `SELECT * FROM sari_escalation_queue 
       WHERE merchant_id = ? AND status IN ('pending', 'notified')
       ORDER BY created_at DESC LIMIT 1`,
      [data.merchantId]
    );
    rows = result as any[];
  }

  const escalation = rows[0];
  if (!escalation) return null;

  await pool.execute(
    `UPDATE sari_escalation_queue 
     SET status = 'answered', merchant_answer = ?, merchant_answered_at = NOW()
     WHERE id = ? AND merchant_id = ?`,
    [data.merchantAnswer.substring(0, 2000), escalation.id, data.merchantId]
  );

  return { ...escalation, status: 'answered', merchantAnswer: data.merchantAnswer } as EscalationItem;
}

/** Get active escalation for a customer */
export async function getActiveEscalation(
  merchantId: number,
  customerPhone: string
): Promise<EscalationItem | null> {
  await ensureLearningTables();
  const pool = await db.getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sari_escalation_queue 
     WHERE merchant_id = ? AND customer_phone = ? AND status IN ('pending', 'notified')
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId, customerPhone]
  );

  return (rows as any[])[0] as EscalationItem || null;
}

/** Get escalations needing follow-up (>15 min, not followed up yet) */
export async function getEscalationsNeedingFollowUp(merchantId: number): Promise<EscalationItem[]> {
  await ensureLearningTables();
  const pool = await db.getPool();
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

/** Expire stale escalations (>24 hours unanswered) */
export async function expireStaleEscalations(): Promise<number> {
  await ensureLearningTables();
  const pool = await db.getPool();
  if (!pool) return 0;

  const [result] = await pool.execute(
    `UPDATE sari_escalation_queue 
     SET status = 'expired' 
     WHERE status IN ('pending', 'notified') AND expires_at < NOW()`
  );
  return (result as any).affectedRows || 0;
}

/** Get today's unanswered questions for gap digest */
export async function getDailyKnowledgeGaps(merchantId: number): Promise<{ question: string; count: number }[]> {
  await ensureLearningTables();
  const pool = await db.getPool();
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
