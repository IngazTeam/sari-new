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

import { getPool } from "./connection";
import {
  assertCoachingSchema,
  type CoachingCandidate,
} from "../ai/coaching-store";
import { assertRuntimeSchema } from "./schema-readiness";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SessionStatus = "pending" | "active" | "completed" | "expired";
export type QuestionVerdict = "correct" | "corrected" | "skipped";

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

export async function ensureCoachingTables(): Promise<void> {
  await assertCoachingSchema();
  await assertRuntimeSchema("merchant coaching", [
    { table: "sari_coaching_sessions" },
    { table: "sari_coaching_questions" },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Sessions — CRUD
// ═══════════════════════════════════════════════════════════════

/** Get active coaching session for a merchant */
export async function getActiveSession(
  merchantId: number
): Promise<CoachingSession | null> {
  await ensureCoachingTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sari_coaching_sessions
     WHERE merchant_id = ? AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId]
  );

  const row = (rows as any[])[0];
  return row
    ? {
        id: row.id,
        merchantId: row.merchant_id,
        status: row.status,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        correctedCount: row.corrected_count,
        skippedCount: row.skipped_count,
        currentQuestionIndex: row.current_question_index,
        startedAt: row.started_at ? new Date(row.started_at) : null,
        completedAt: row.completed_at ? new Date(row.completed_at) : null,
        createdAt: new Date(row.created_at),
      }
    : null;
}

/** Expire stale sessions (> 8 hours without response — matches SESSION_TIMEOUT_HOURS) */
export async function expireStaleSessions(): Promise<number> {
  await ensureCoachingTables();
  const pool = await getPool();
  if (!pool) return 0;

  const [result] = await pool.execute(
    `UPDATE sari_coaching_sessions
     SET status = 'expired'
     WHERE status = 'active'
     AND started_at < DATE_SUB(NOW(), INTERVAL 8 HOUR)
     LIMIT 50`
  );
  return (result as any).affectedRows || 0;
}

/** Get the date of the last coaching session for a merchant */
export async function getLastSessionDate(
  merchantId: number
): Promise<Date | null> {
  await ensureCoachingTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT created_at FROM sari_coaching_sessions
     WHERE merchant_id = ? AND status IN ('completed', 'active', 'expired')
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
): Promise<CoachingCandidate[]> {
  await ensureCoachingTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 10)
    : 1;

  try {
    // Get recent outgoing messages with customer context (last 72 hours)
    // Exclude already-reviewed conversations
    // BUG-FIX: Use TRIM + LENGTH to exclude whitespace-only and media-placeholder content
    const [rows] = await pool.execute(
      `SELECT 
        m_in.content AS customer_question, m_in.id AS incoming_id,
        m_out.content AS bot_response, m_out.id AS outgoing_id,
        m_out.conversationId AS conversation_id
       FROM messages m_out
       INNER JOIN messages m_in ON m_in.conversationId = m_out.conversationId
         AND m_in.direction = 'incoming'
         AND m_in.id = (
           SELECT MAX(m2.id) FROM messages m2
           WHERE m2.conversationId = m_out.conversationId
           AND m2.direction = 'incoming'
           AND m2.id < m_out.id
         )
       INNER JOIN conversations c ON c.id = m_out.conversationId
       WHERE c.merchantId = ?
         AND m_out.direction = 'outgoing'
         AND m_out.sender_type = 'assistant' AND m_out.isProcessed = 1 AND m_out.aiResponse = m_out.content
         AND m_out.messageType = 'text' AND m_in.messageType = 'text'
         AND CHAR_LENGTH(m_out.content)+CHAR_LENGTH(m_in.content)<=3000
         AND c.customerPhone REGEXP '^[1-9][0-9]{7,14}$'
         AND m_out.createdAt > DATE_SUB(NOW(), INTERVAL 72 HOUR)
         AND m_out.content IS NOT NULL
         AND m_in.content IS NOT NULL
         AND LENGTH(TRIM(m_out.content)) > 20
         AND LENGTH(TRIM(m_in.content)) > 5
         AND TRIM(m_in.content) NOT IN ('[media]', '[صورة]', '[صوت]', '[فيديو]', '[صورة من العميل]', '[ملف]', '[audio]', '[image]', '[video]', '[file]', '[sticker]', '[ملصق]', '')
         AND TRIM(m_out.content) NOT LIKE '[%]'
         AND TRIM(m_in.content) != ''
         AND TRIM(m_out.content) != ''
         AND m_out.conversationId NOT IN (
           SELECT DISTINCT cq.conversation_id
           FROM sari_coaching_questions cq
           WHERE cq.merchant_id = ? AND cq.conversation_id IS NOT NULL
         )
       ORDER BY m_out.createdAt DESC
       LIMIT ${safeLimit}`,
      [merchantId, merchantId]
    );

    return (rows as any[]).map(r => ({
      customerQuestion: r.customer_question,
      botResponse: r.bot_response,
      conversationId: r.conversation_id,
      incomingId: r.incoming_id,
      outgoingId: r.outgoing_id,
    }));
  } catch (e: any) {
    console.error("[Coaching] getReviewCandidates failed:", e.message);
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
  const pool = await getPool();
  if (!pool) return { totalSessions: 0, totalReviewed: 0, correctRate: 0 };

  try {
    const [rows] = await pool.execute(
      `SELECT
        COUNT(*) as total_sessions,
        SUM(correct_count + corrected_count) as total_reviewed,
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
  } catch {
    return { totalSessions: 0, totalReviewed: 0, correctRate: 0 };
  }
}
