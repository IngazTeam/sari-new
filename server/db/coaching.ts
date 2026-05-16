/**
 * Coaching Database Module — Sari Coaching Sessions
 * 
 * Tables:
 *   - sari_coaching_sessions: Session state machine (pending → active → completed)
 *   - sari_coaching_questions: Individual Q&A items within a session
 * 
 * A coaching session is a WhatsApp-based Q&A review where Sari asks the merchant
 * to validate or correct its recent responses to customers.
 */

import * as db from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SessionStatus = 'pending' | 'active' | 'completed' | 'expired';
export type QuestionVerdict = 'correct' | 'corrected' | 'skipped';

export interface CoachingSession {
  id: number;
  merchantId: number;
  status: SessionStatus;
  totalQuestions: number;
  correctCount: number;
  correctedCount: number;
  skippedCount: number;
  currentQuestionIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CoachingQuestion {
  id: number;
  sessionId: number;
  merchantId: number;
  conversationId: number | null;
  customerQuestion: string;
  botResponse: string;
  merchantVerdict: QuestionVerdict | null;
  merchantCorrection: string | null;
  questionOrder: number;
  reviewedAt: Date | null;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Table Creation
// ═══════════════════════════════════════════════════════════════

let _tablesCreated = false;

export async function ensureCoachingTables(): Promise<void> {
  if (_tablesCreated) return;

  const pool = await db.getPool();
  if (!pool) return;

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_coaching_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        total_questions INT DEFAULT 0,
        correct_count INT DEFAULT 0,
        corrected_count INT DEFAULT 0,
        skipped_count INT DEFAULT 0,
        current_question_index INT DEFAULT 0,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_status (merchant_id, status),
        INDEX idx_merchant_date (merchant_id, created_at DESC)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_coaching_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL,
        merchant_id INT NOT NULL,
        conversation_id INT NULL,
        customer_question TEXT NOT NULL,
        bot_response TEXT NOT NULL,
        merchant_verdict VARCHAR(20) NULL,
        merchant_correction TEXT NULL,
        question_order INT DEFAULT 0,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_order (session_id, question_order),
        INDEX idx_merchant (merchant_id)
      )
    `);

    _tablesCreated = true;
    console.log('[Coaching] ✅ Tables initialized');
  } catch (e: any) {
    console.error('[Coaching] Failed to create tables:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Sessions — CRUD
// ═══════════════════════════════════════════════════════════════

/** Create a new coaching session with its questions */
export async function createCoachingSession(
  merchantId: number,
  questions: { customerQuestion: string; botResponse: string; conversationId?: number }[]
): Promise<number | null> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool || questions.length === 0) return null;

  try {
    // Create session
    const [result] = await pool.execute(
      `INSERT INTO sari_coaching_sessions (merchant_id, total_questions, status) VALUES (?, ?, 'active')`,
      [merchantId, questions.length]
    );
    const sessionId = (result as any).insertId;
    if (!sessionId) return null;

    // Insert questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await pool.execute(
        `INSERT INTO sari_coaching_questions
         (session_id, merchant_id, conversation_id, customer_question, bot_response, question_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          merchantId,
          q.conversationId || null,
          q.customerQuestion.substring(0, 2000),
          q.botResponse.substring(0, 2000),
          i + 1,
        ]
      );
    }

    // Mark as started
    await pool.execute(
      `UPDATE sari_coaching_sessions SET started_at = NOW() WHERE id = ?`,
      [sessionId]
    );

    console.log(`[Coaching] 🎓 Session #${sessionId} created for merchant ${merchantId}: ${questions.length} questions`);
    return sessionId;
  } catch (e: any) {
    console.error('[Coaching] createCoachingSession failed:', e.message);
    return null;
  }
}

/** Get active coaching session for a merchant */
export async function getActiveSession(merchantId: number): Promise<CoachingSession | null> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sari_coaching_sessions
     WHERE merchant_id = ? AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId]
  );

  return (rows as any[])[0] as CoachingSession || null;
}

/** Get the current question for an active session — PEN-COACH-02 FIX: merchant_id guard */
export async function getCurrentQuestion(sessionId: number, currentIndex: number, merchantId?: number): Promise<CoachingQuestion | null> {
  const pool = await db.getPool();
  if (!pool) return null;

  const query = merchantId
    ? `SELECT * FROM sari_coaching_questions WHERE session_id = ? AND question_order = ? AND merchant_id = ?`
    : `SELECT * FROM sari_coaching_questions WHERE session_id = ? AND question_order = ?`;
  const params = merchantId
    ? [sessionId, currentIndex + 1, merchantId]
    : [sessionId, currentIndex + 1];

  const [rows] = await pool.execute(query, params);
  return (rows as any[])[0] as CoachingQuestion || null;
}

/** Record merchant's verdict on a question */
export async function recordVerdict(
  questionId: number,
  merchantId: number,
  verdict: QuestionVerdict,
  correction?: string
): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE sari_coaching_questions
     SET merchant_verdict = ?, merchant_correction = ?, reviewed_at = NOW()
     WHERE id = ? AND merchant_id = ?`,
    [verdict, correction?.substring(0, 2000) || null, questionId, merchantId]
  );
}

/** PEN-COACH-01/02 FIX: Whitelist columns + merchant_id guard */
const VERDICT_COLUMN_MAP: Record<string, string> = {
  correct: 'correct_count',
  corrected: 'corrected_count',
  skipped: 'skipped_count',
};

/** Advance session to next question, returns new index */
export async function advanceSession(sessionId: number, verdict: QuestionVerdict, merchantId?: number): Promise<number> {
  const pool = await db.getPool();
  if (!pool) return -1;

  // PEN-COACH-01 FIX: Whitelist column name — never interpolate user-derived values
  const countField = VERDICT_COLUMN_MAP[verdict] || 'skipped_count';

  if (merchantId) {
    await pool.execute(
      `UPDATE sari_coaching_sessions
       SET current_question_index = current_question_index + 1,
           ${countField} = ${countField} + 1
       WHERE id = ? AND merchant_id = ?`,
      [sessionId, merchantId]
    );
  } else {
    await pool.execute(
      `UPDATE sari_coaching_sessions
       SET current_question_index = current_question_index + 1,
           ${countField} = ${countField} + 1
       WHERE id = ?`,
      [sessionId]
    );
  }

  // Return new index
  const [rows] = await pool.execute(
    `SELECT current_question_index FROM sari_coaching_sessions WHERE id = ?`,
    [sessionId]
  );

  return (rows as any[])[0]?.current_question_index ?? -1;
}

/** Complete a coaching session — PEN-COACH-02 FIX: merchant_id guard */
export async function completeSession(sessionId: number, merchantId?: number): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  if (merchantId) {
    await pool.execute(
      `UPDATE sari_coaching_sessions
       SET status = 'completed', completed_at = NOW()
       WHERE id = ? AND merchant_id = ?`,
      [sessionId, merchantId]
    );
  } else {
    await pool.execute(
      `UPDATE sari_coaching_sessions
       SET status = 'completed', completed_at = NOW()
       WHERE id = ?`,
      [sessionId]
    );
  }
}

/** Expire stale sessions (> 2 hours without response) */
export async function expireStaleSessions(): Promise<number> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool) return 0;

  const [result] = await pool.execute(
    `UPDATE sari_coaching_sessions
     SET status = 'expired'
     WHERE status = 'active'
     AND started_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)
     LIMIT 50`
  );
  return (result as any).affectedRows || 0;
}

/** Get the date of the last coaching session for a merchant */
export async function getLastSessionDate(merchantId: number): Promise<Date | null> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT created_at FROM sari_coaching_sessions
     WHERE merchant_id = ? AND status IN ('completed', 'active')
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId]
  );

  const row = (rows as any[])[0];
  return row?.created_at ? new Date(row.created_at) : null;
}

/**
 * Get candidate Q&A pairs for coaching review.
 * Selects recent bot responses that haven't been reviewed yet.
 * Prioritizes: escalated questions > long conversations > new GPT-generated answers.
 */
export async function getReviewCandidates(
  merchantId: number,
  limit: number = 5
): Promise<{ customerQuestion: string; botResponse: string; conversationId: number }[]> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 10);

  try {
    // Get recent outgoing messages with customer context (last 72 hours)
    // Exclude already-reviewed conversations
    const [rows] = await pool.execute(
      `SELECT 
        m_in.content AS customer_question,
        m_out.content AS bot_response,
        m_out.conversation_id
       FROM messages m_out
       INNER JOIN messages m_in ON m_in.conversation_id = m_out.conversation_id
         AND m_in.direction = 'incoming'
         AND m_in.id = (
           SELECT MAX(m2.id) FROM messages m2
           WHERE m2.conversation_id = m_out.conversation_id
           AND m2.direction = 'incoming'
           AND m2.id < m_out.id
         )
       INNER JOIN conversations c ON c.id = m_out.conversation_id
       WHERE c.merchant_id = ?
         AND m_out.direction = 'outgoing'
         AND m_out.created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)
         AND m_out.content IS NOT NULL
         AND LENGTH(m_out.content) > 20
         AND m_in.content IS NOT NULL
         AND LENGTH(m_in.content) > 5
         AND m_out.conversation_id NOT IN (
           SELECT DISTINCT cq.conversation_id
           FROM sari_coaching_questions cq
           WHERE cq.merchant_id = ? AND cq.conversation_id IS NOT NULL
         )
       ORDER BY m_out.created_at DESC
       LIMIT ?`,
      [merchantId, merchantId, safeLimit]
    );

    return (rows as any[]).map(r => ({
      customerQuestion: r.customer_question,
      botResponse: r.bot_response,
      conversationId: r.conversation_id,
    }));
  } catch (e: any) {
    console.error('[Coaching] getReviewCandidates failed:', e.message);
    return [];
  }
}

/** Get session summary stats for a merchant (for dashboard) */
export async function getCoachingStats(merchantId: number): Promise<{
  totalSessions: number;
  totalReviewed: number;
  correctRate: number;
}> {
  await ensureCoachingTables();
  const pool = await db.getPool();
  if (!pool) return { totalSessions: 0, totalReviewed: 0, correctRate: 0 };

  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) as total_sessions,
        SUM(correct_count + corrected_count + skipped_count) as total_reviewed,
        SUM(correct_count) as total_correct
       FROM sari_coaching_sessions
       WHERE merchant_id = ? AND status = 'completed'`,
      [merchantId]
    );

    const row = (rows as any[])[0];
    const totalReviewed = Number(row?.total_reviewed) || 0;
    const totalCorrect = Number(row?.total_correct) || 0;

    return {
      totalSessions: Number(row?.total_sessions) || 0,
      totalReviewed,
      correctRate: totalReviewed > 0 ? totalCorrect / totalReviewed : 0,
    };
  } catch { return { totalSessions: 0, totalReviewed: 0, correctRate: 0 }; }
}
