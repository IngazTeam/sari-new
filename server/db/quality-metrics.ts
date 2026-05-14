/**
 * Quality Metrics — Database Module
 * 
 * Tracks bot response quality, customer satisfaction, and weekly reports.
 * Tables:
 *   - sari_quality_metrics: per-response quality tracking
 *   - sari_weekly_reports: generated weekly summary
 */

import * as db from '../db';

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

export interface QualityDashboard {
  totalResponses: number;
  avgResponseTimeMs: number;
  cacheHitRate: number;
  emptyResponseRate: number;
  escalationRate: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topQuestions: string[];
  recentMetrics: QualityMetric[];
  trend: 'improving' | 'stable' | 'declining';
}

// ═══════════════════════════════════════════════════════════════
// Lazy Table Creation
// ═══════════════════════════════════════════════════════════════

let _tablesCreated = false;

export async function ensureQualityTables(): Promise<void> {
  if (_tablesCreated) return;
  
  const pool = await db.getPool();
  if (!pool) return;

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_quality_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        conversation_id INT DEFAULT NULL,
        question_text TEXT NOT NULL,
        response_text TEXT NOT NULL,
        response_time_ms INT DEFAULT 0,
        was_cache_hit TINYINT(1) DEFAULT 0,
        rag_sections_used INT DEFAULT 0,
        customer_sentiment VARCHAR(20) DEFAULT NULL,
        feedback_rating TINYINT DEFAULT NULL,
        was_empty TINYINT(1) DEFAULT 0,
        was_escalated TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_date (merchant_id, created_at DESC),
        INDEX idx_merchant_empty (merchant_id, was_empty),
        INDEX idx_merchant_sentiment (merchant_id, customer_sentiment)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_weekly_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        total_messages INT DEFAULT 0,
        total_responses INT DEFAULT 0,
        avg_response_time_ms INT DEFAULT 0,
        cache_hit_rate DECIMAL(5,2) DEFAULT 0,
        empty_response_rate DECIMAL(5,2) DEFAULT 0,
        avg_sentiment_score DECIMAL(3,2) DEFAULT 0,
        top_questions JSON DEFAULT NULL,
        escalation_rate DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_merchant_week (merchant_id, week_start)
      )
    `);

    _tablesCreated = true;
    console.log('[QualityMetrics] ✅ Tables initialized');
  } catch (e) {
    console.error('[QualityMetrics] Failed to create tables:', e);
  }
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
  const pool = await db.getPool();
  if (!pool) return;

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
  const pool = await db.getPool();
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

/** Get quality dashboard data for a merchant */
export async function getQualityDashboard(
  merchantId: number,
  days: number = 30
): Promise<QualityDashboard> {
  await ensureQualityTables();
  const pool = await db.getPool();
  if (!pool) {
    return {
      totalResponses: 0, avgResponseTimeMs: 0, cacheHitRate: 0,
      emptyResponseRate: 0, escalationRate: 0,
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
      topQuestions: [], recentMetrics: [], trend: 'stable',
    };
  }

  const safeDays = Math.min(Math.max(days, 1), 90);

  // Aggregate stats
  const [statsRows] = await pool.execute(
    `SELECT 
       COUNT(*) as total,
       AVG(response_time_ms) as avg_time,
       SUM(was_cache_hit) as cache_hits,
       SUM(was_empty) as empty_count,
       SUM(was_escalated) as escalated_count,
       SUM(CASE WHEN customer_sentiment IN ('positive','happy') THEN 1 ELSE 0 END) as positive,
       SUM(CASE WHEN customer_sentiment IN ('neutral') THEN 1 ELSE 0 END) as neutral_count,
       SUM(CASE WHEN customer_sentiment IN ('negative','angry','frustrated','sad') THEN 1 ELSE 0 END) as negative
     FROM sari_quality_metrics 
     WHERE merchant_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [merchantId, safeDays]
  );

  const stats = (statsRows as any[])[0] || {};
  const total = Number(stats.total) || 0;

  // Top questions (most repeated)
  const [topRows] = await pool.execute(
    `SELECT question_text, COUNT(*) as cnt 
     FROM sari_quality_metrics 
     WHERE merchant_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY question_text ORDER BY cnt DESC LIMIT 5`,
    [merchantId, safeDays]
  );
  const topQuestions = (topRows as any[]).map((r: any) => r.question_text);

  // SEC-V4-06 FIX: Truncate sensitive text — don't expose full conversations to dashboard
  const [recentRows] = await pool.execute(
    `SELECT id, merchant_id, conversation_id,
       LEFT(question_text, 80) as question_text,
       LEFT(response_text, 80) as response_text,
       response_time_ms, was_cache_hit, rag_sections_used,
       customer_sentiment, feedback_rating, was_empty, was_escalated, created_at
     FROM sari_quality_metrics 
     WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 10`,
    [merchantId]
  );

  // Trend: compare last 7 days vs previous 7 days
  const [trendRows] = await pool.execute(
    `SELECT 
       SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN was_empty ELSE 0 END) as recent_empty,
       SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recent_total,
       SUM(CASE WHEN created_at BETWEEN DATE_SUB(NOW(), INTERVAL 14 DAY) AND DATE_SUB(NOW(), INTERVAL 7 DAY) THEN was_empty ELSE 0 END) as prev_empty,
       SUM(CASE WHEN created_at BETWEEN DATE_SUB(NOW(), INTERVAL 14 DAY) AND DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as prev_total
     FROM sari_quality_metrics WHERE merchant_id = ?`,
    [merchantId]
  );

  const trend = (() => {
    const t = (trendRows as any[])[0] || {};
    const recentTotal = Number(t.recent_total) || 0;
    const prevTotal = Number(t.prev_total) || 0;
    // Not enough data to compare — treat as stable
    if (recentTotal < 5 || prevTotal < 5) return 'stable' as const;
    const recentRate = Number(t.recent_empty) / recentTotal;
    const prevRate = Number(t.prev_empty) / prevTotal;
    if (recentRate < prevRate - 0.05) return 'improving' as const;
    if (recentRate > prevRate + 0.05) return 'declining' as const;
    return 'stable' as const;
  })();

  return {
    totalResponses: total,
    avgResponseTimeMs: Math.round(Number(stats.avg_time) || 0),
    cacheHitRate: total > 0 ? Math.round((Number(stats.cache_hits) / total) * 100) : 0,
    emptyResponseRate: total > 0 ? Math.round((Number(stats.empty_count) / total) * 100) : 0,
    escalationRate: total > 0 ? Math.round((Number(stats.escalated_count) / total) * 100) : 0,
    sentimentBreakdown: {
      positive: Number(stats.positive) || 0,
      neutral: Number(stats.neutral_count) || 0,
      negative: Number(stats.negative) || 0,
    },
    topQuestions,
    recentMetrics: recentRows as QualityMetric[],
    trend,
  };
}

// ═══════════════════════════════════════════════════════════════
// Weekly Report Generation
// ═══════════════════════════════════════════════════════════════

/** Generate weekly report for a merchant */
export async function generateWeeklyReport(merchantId: number): Promise<WeeklyReport | null> {
  await ensureQualityTables();
  const pool = await db.getPool();
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
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.merchant_id = ? AND m.direction = 'incoming'
       AND DATE(m.created_at) BETWEEN ? AND ?`,
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
  const pool = await db.getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 52);
  const [rows] = await pool.execute(
    `SELECT * FROM sari_weekly_reports WHERE merchant_id = ? ORDER BY week_start DESC LIMIT ?`,
    [merchantId, safeLimit]
  );
  return rows as WeeklyReport[];
}
