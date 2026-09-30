/**
 * Quality Metrics — Database Module
 * 
 * Tracks bot response quality, customer satisfaction, and weekly reports.
 * Tables:
 *   - sari_quality_metrics: per-response quality tracking
 *   - sari_weekly_reports: generated weekly summary
 */

import { getPool } from '../db';
import { assertRuntimeSchema } from './schema-readiness';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface QualityMetric {
  id: number;
  merchantId: number;
  conversationId: number | null;
  questionText: string;
  responseText: string;
  responseTimeMs: number;
  wasCacheHit: boolean;
  ragSectionsUsed: number;
  customerSentiment: string | null;
  feedbackRating: number | null;  // 1-5 stars
  wasEmpty: boolean;
  wasEscalated: boolean;
  createdAt: Date;
}

export interface WeeklyReport {
  id: number;
  merchantId: number;
  weekStart: string;
  weekEnd: string;
  totalMessages: number;
  totalResponses: number;
  avgResponseTimeMs: number;
  cacheHitRate: number;
  emptyResponseRate: number;
  avgSentimentScore: number;
  topQuestions: string;  // JSON array
  escalationRate: number;
  createdAt: Date;
}

export type { QualityReadout as QualityDashboard } from '../../shared/quality-readout';

// ═══════════════════════════════════════════════════════════════
// Lazy Table Creation
// ═══════════════════════════════════════════════════════════════

export async function ensureQualityTables(): Promise<void> {
  await assertRuntimeSchema('quality metrics', [
    { table: 'sari_quality_metrics' },
    { table: 'sari_weekly_reports' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Record Metrics
// ═══════════════════════════════════════════════════════════════

/** Record a single response quality metric */
export async function recordMetric(data: {
  merchantId: number;
  conversationId?: number | null;
  questionText: string;
  responseText: string;
  responseTimeMs: number;
  wasCacheHit: boolean;
  ragSectionsUsed: number;
  customerSentiment?: string | null;
  wasEscalated?: boolean;
}): Promise<void> {
  await ensureQualityTables();
  const pool = await getPool();
  if (!pool) return;

  // SEC-V7-05 FIX: Daily cap — max 2000 records per merchant per day
  try {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM sari_quality_metrics 
       WHERE merchant_id = ? AND created_at >= CURDATE()`,
      [data.merchantId]
    );
    const todayCount = (countRows as any[])[0]?.cnt || 0;
    if (todayCount >= 2000) return; // silent drop — prevent DB flooding
  } catch { /* continue if count fails */ }

  const wasEmpty = !data.responseText || data.responseText.trim().length < 10;

  try {
    await pool.execute(
      `INSERT INTO sari_quality_metrics 
       (merchant_id, conversation_id, question_text, response_text, 
        response_time_ms, was_cache_hit, rag_sections_used, 
        customer_sentiment, was_empty, was_escalated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.merchantId,
        data.conversationId ?? null,
        data.questionText.substring(0, 5000),
        data.responseText.substring(0, 5000),
        data.responseTimeMs,
        data.wasCacheHit ? 1 : 0,
        data.ragSectionsUsed,
        data.customerSentiment ?? null,
        wasEmpty ? 1 : 0,
        data.wasEscalated ? 1 : 0,
      ]
    );
  } catch (e: any) {
    console.error('[QualityMetrics] recordMetric failed:', e.message);
  }
}

/** Record customer feedback rating */
export async function recordFeedback(
  metricId: number, 
  merchantId: number, 
  rating: number
): Promise<void> {
  await ensureQualityTables();
  const pool = await getPool();
  if (!pool) return;

  const safeRating = Math.min(5, Math.max(1, Math.round(rating)));
  await pool.execute(
    `UPDATE sari_quality_metrics SET feedback_rating = ? WHERE id = ? AND merchant_id = ?`,
    [safeRating, metricId, merchantId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Dashboard Queries
// ═══════════════════════════════════════════════════════════════

export { readQualityReadout as getQualityDashboard } from '../quality-readout';

// ═══════════════════════════════════════════════════════════════
// Weekly Report Generation
// ═══════════════════════════════════════════════════════════════

/** Generate weekly report for a merchant */
export async function generateWeeklyReport(merchantId: number): Promise<WeeklyReport | null> {
  await ensureQualityTables();
  const pool = await getPool();
  if (!pool) return null;

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay()); // Last Sunday
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);

  const startStr = weekStart.toISOString().split('T')[0];
  const endStr = weekEnd.toISOString().split('T')[0];

  // Check if already generated
  const [existing] = await pool.execute(
    `SELECT id FROM sari_weekly_reports WHERE merchant_id = ? AND week_start = ?`,
    [merchantId, startStr]
  );
  if ((existing as any[]).length > 0) return null;

  // Calculate stats for the week
  const [statsRows] = await pool.execute(
    `SELECT 
       COUNT(*) as total,
       AVG(response_time_ms) as avg_time,
       SUM(was_cache_hit) as cache_hits,
       SUM(was_empty) as empty_count,
       SUM(was_escalated) as escalated,
       AVG(CASE 
         WHEN customer_sentiment IN ('positive','happy') THEN 1.0
         WHEN customer_sentiment = 'neutral' THEN 0.5
         WHEN customer_sentiment IN ('negative','angry','frustrated','sad') THEN 0.0
         ELSE 0.5 END) as avg_sentiment
     FROM sari_quality_metrics 
     WHERE merchant_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
    [merchantId, startStr, endStr]
  );

  const stats = (statsRows as any[])[0] || {};
  const total = Number(stats.total) || 0;
  if (total === 0) return null;

  // Top questions
  const [topRows] = await pool.execute(
    `SELECT question_text FROM sari_quality_metrics 
     WHERE merchant_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY question_text ORDER BY COUNT(*) DESC LIMIT 5`,
    [merchantId, startStr, endStr]
  );
  const topQs = (topRows as any[]).map((r: any) => r.question_text);

  // Get total messages (incoming) from conversations table
  let totalMessages = total;
  try {
    const [msgRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM messages m
       JOIN conversations c ON m.conversationId = c.id
       WHERE c.merchantId = ? AND m.direction = 'incoming'
       AND DATE(m.createdAt) BETWEEN ? AND ?`,
      [merchantId, startStr, endStr]
    );
    totalMessages = Number((msgRows as any[])[0]?.cnt) || total;
  } catch { /* fallback to total responses */ }

  const [result] = await pool.execute(
    `INSERT INTO sari_weekly_reports 
     (merchant_id, week_start, week_end, total_messages, total_responses,
      avg_response_time_ms, cache_hit_rate, empty_response_rate,
      avg_sentiment_score, top_questions, escalation_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      merchantId,
      startStr,
      endStr,
      totalMessages,
      total,
      Math.round(Number(stats.avg_time) || 0),
      total > 0 ? Math.round((Number(stats.cache_hits) / total) * 100) : 0,
      total > 0 ? Math.round((Number(stats.empty_count) / total) * 100) : 0,
      Number(stats.avg_sentiment) || 0.5,
      JSON.stringify(topQs),
      total > 0 ? Math.round((Number(stats.escalated) / total) * 100) : 0,
    ]
  );

  const reportId = (result as any).insertId;
  const [reportRows] = await pool.execute(
    `SELECT * FROM sari_weekly_reports WHERE id = ?`, [reportId]
  );
  return (reportRows as any[])[0] as WeeklyReport || null;
}

/** Get weekly reports history */
export async function getWeeklyReports(merchantId: number, limit: number = 12): Promise<WeeklyReport[]> {
  await ensureQualityTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 52);
  const [rows] = await pool.execute(
    `SELECT * FROM sari_weekly_reports WHERE merchant_id = ? ORDER BY week_start DESC LIMIT ${safeLimit}`,
    [merchantId]
  );
  return rows as WeeklyReport[];
}
