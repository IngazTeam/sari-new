/**
 * Admin AI Analytics Router
 * Platform-wide AI intelligence dashboard for SuperAdmin
 * 
 * All endpoints protected by adminProcedure (admin/superadmin only)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from './_core/trpc';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'superadmin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const adminAiAnalyticsRouter = router({

  // ═══════════════════════════════════════════════════════════════
  // Overview — Quick platform stats
  // ═══════════════════════════════════════════════════════════════
  getOverview: adminProcedure.query(async () => {
    const { getPool } = await import('./db');
    const pool = await getPool();
    if (!pool) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

    // Total merchants
    const [merchantRows] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
      FROM merchants`
    );
    const merchants = (merchantRows as any[])[0] || { total: 0, active: 0, suspended: 0 };

    // Website analyses
    let websiteStats = { total: 0, avgScore: 0 };
    try {
      const [waRows] = await pool.execute(
        `SELECT COUNT(*) as total, ROUND(AVG(overall_score), 1) as avg_score FROM website_analyses WHERE status = 'completed'`
      );
      const wa = (waRows as any[])[0];
      websiteStats = { total: wa?.total || 0, avgScore: wa?.avg_score || 0 };
    } catch { /* table may not exist */ }

    // Knowledge sections
    let knowledgeStats = { totalSections: 0, merchantsWithKnowledge: 0, avgSections: 0 };
    try {
      const [ksRows] = await pool.execute(
        `SELECT 
          COUNT(*) as total_sections,
          COUNT(DISTINCT merchant_id) as merchants_with_knowledge,
          ROUND(COUNT(*) / GREATEST(COUNT(DISTINCT merchant_id), 1), 1) as avg_sections
        FROM knowledge_sections`
      );
      const ks = (ksRows as any[])[0];
      knowledgeStats = {
        totalSections: ks?.total_sections || 0,
        merchantsWithKnowledge: ks?.merchants_with_knowledge || 0,
        avgSections: ks?.avg_sections || 0,
      };
    } catch { /* table may not exist */ }

    // AI Response quality (last 30 days)
    let responseStats = { totalMessages: 0, avgResponseMs: 0, deliveryRate: 0 };
    try {
      const [msgRows] = await pool.execute(
        `SELECT 
          COUNT(*) as total,
          ROUND(AVG(response_time_ms), 0) as avg_ms,
          ROUND(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) * 100, 1) as delivery_rate
        FROM message_delivery_log
        WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );
      const msg = (msgRows as any[])[0];
      responseStats = {
        totalMessages: msg?.total || 0,
        avgResponseMs: msg?.avg_ms || 0,
        deliveryRate: msg?.delivery_rate || 0,
      };
    } catch { /* table may not exist */ }

    // Sales intelligence coverage
    let salesIntelCount = 0;
    try {
      const [siRows] = await pool.execute(
        `SELECT COUNT(DISTINCT merchant_id) as cnt FROM knowledge_sections WHERE section_type = 'sales_intel'`
      );
      salesIntelCount = (siRows as any[])[0]?.cnt || 0;
    } catch { /* skip */ }

    return {
      merchants: {
        total: Number(merchants.total),
        active: Number(merchants.active),
        suspended: Number(merchants.suspended),
      },
      websites: websiteStats,
      knowledge: knowledgeStats,
      responses: responseStats,
      salesIntelCoverage: salesIntelCount,
    };
  }),

  // ═══════════════════════════════════════════════════════════════
  // Website Analysis Stats
  // ═══════════════════════════════════════════════════════════════
  getWebsiteStats: adminProcedure.query(async () => {
    const { getPool } = await import('./db');
    const pool = await getPool();
    if (!pool) return { distribution: [], industries: [], needsImprovement: [] };

    try {
      // Score distribution
      const [distRows] = await pool.execute(
        `SELECT 
          CASE 
            WHEN overall_score >= 80 THEN 'excellent'
            WHEN overall_score >= 60 THEN 'good'
            WHEN overall_score >= 40 THEN 'average'
            ELSE 'poor'
          END as quality,
          COUNT(*) as count
        FROM website_analyses WHERE status = 'completed'
        GROUP BY quality
        ORDER BY FIELD(quality, 'excellent', 'good', 'average', 'poor')`
      );

      // Top industries
      const [indRows] = await pool.execute(
        `SELECT industry, COUNT(*) as count, ROUND(AVG(overall_score), 1) as avg_score
         FROM website_analyses 
         WHERE status = 'completed' AND industry IS NOT NULL AND industry != ''
         GROUP BY industry ORDER BY count DESC LIMIT 10`
      );

      // Sites needing improvement (score < 50)
      const [poorRows] = await pool.execute(
        `SELECT wa.id, wa.url, wa.title, wa.overall_score, wa.industry, wa.analyzed_at, m.business_name
         FROM website_analyses wa
         JOIN merchants m ON wa.merchant_id = m.id
         WHERE wa.status = 'completed' AND wa.overall_score < 50
         ORDER BY wa.overall_score ASC LIMIT 15`
      );

      return {
        distribution: distRows as any[],
        industries: indRows as any[],
        needsImprovement: (poorRows as any[]).map((r: any) => ({
          id: r.id,
          url: r.url,
          title: r.title,
          score: r.overall_score,
          industry: r.industry,
          merchantName: r.business_name,
          analyzedAt: r.analyzed_at,
        })),
      };
    } catch {
      return { distribution: [], industries: [], needsImprovement: [] };
    }
  }),

  // ═══════════════════════════════════════════════════════════════
  // Knowledge Engine Stats
  // ═══════════════════════════════════════════════════════════════
  getKnowledgeStats: adminProcedure.query(async () => {
    const { getPool } = await import('./db');
    const pool = await getPool();
    if (!pool) return { sectionTypes: [], sourceDistribution: [], healthDistribution: [] };

    try {
      // Section types distribution
      const [typeRows] = await pool.execute(
        `SELECT section_type, COUNT(*) as count 
         FROM knowledge_sections GROUP BY section_type ORDER BY count DESC`
      );

      // Source distribution
      const [sourceRows] = await pool.execute(
        `SELECT source, COUNT(*) as count 
         FROM knowledge_sections GROUP BY source ORDER BY count DESC`
      );

      // Per-merchant health (how many merchants have each type)
      const [healthRows] = await pool.execute(
        `SELECT 
          m.id as merchant_id,
          m.business_name,
          COUNT(ks.id) as section_count,
          COUNT(DISTINCT ks.section_type) as type_count,
          SUM(CASE WHEN ks.section_type = 'sales_intel' THEN 1 ELSE 0 END) as has_intel,
          SUM(CASE WHEN ks.section_type = 'opportunities' THEN 1 ELSE 0 END) as has_opps
         FROM merchants m
         LEFT JOIN knowledge_sections ks ON m.id = ks.merchant_id
         WHERE m.status = 'active'
         GROUP BY m.id, m.business_name
         ORDER BY section_count DESC
         LIMIT 20`
      );

      return {
        sectionTypes: typeRows as any[],
        sourceDistribution: sourceRows as any[],
        merchantHealth: (healthRows as any[]).map((r: any) => ({
          merchantId: r.merchant_id,
          merchantName: r.business_name,
          sectionCount: Number(r.section_count),
          typeCount: Number(r.type_count),
          hasIntel: Number(r.has_intel) > 0,
          hasOpps: Number(r.has_opps) > 0,
        })),
      };
    } catch {
      return { sectionTypes: [], sourceDistribution: [], merchantHealth: [] };
    }
  }),

  // ═══════════════════════════════════════════════════════════════
  // Response Quality & Satisfaction
  // ═══════════════════════════════════════════════════════════════
  getResponseQuality: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }).optional())
    .query(async ({ input }) => {
      const { getPool } = await import('./db');
      const pool = await getPool();
      if (!pool) return { daily: [], topQuestions: [], escalationRate: 0, satisfaction: null };

      const days = input?.days || 30;

      try {
        // Daily message volume
        const [dailyRows] = await pool.execute(
          `SELECT DATE(created_at) as day, status, COUNT(*) as count
           FROM message_delivery_log
           WHERE created_at > DATE_SUB(NOW(), INTERVAL ${days} DAY)
           GROUP BY day, status ORDER BY day`
        );

        // Escalation rate (messages transferred to human)
        let escalationRate = 0;
        try {
          const [escRows] = await pool.execute(
            `SELECT 
              ROUND(SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) * 100, 1) as rate
             FROM conversations 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL ${days} DAY)`
          );
          escalationRate = (escRows as any[])[0]?.rate || 0;
        } catch { /* conversations table may not have escalated column */ }

        // Sentiment/satisfaction
        let satisfaction = null;
        try {
          const [sentRows] = await pool.execute(
            `SELECT sentiment, COUNT(*) as count
             FROM conversations 
             WHERE created_at > DATE_SUB(NOW(), INTERVAL ${days} DAY) AND sentiment IS NOT NULL
             GROUP BY sentiment`
          );
          const sentMap: Record<string, number> = {};
          for (const r of sentRows as any[]) {
            sentMap[r.sentiment] = Number(r.count);
          }
          const total = Object.values(sentMap).reduce((a, b) => a + b, 0);
          if (total > 0) {
            satisfaction = {
              positive: sentMap['positive'] || 0,
              neutral: sentMap['neutral'] || 0,
              negative: sentMap['negative'] || 0,
              total,
              positiveRate: Math.round(((sentMap['positive'] || 0) / total) * 100),
            };
          }
        } catch { /* skip */ }

        // Top repeated questions (from cache)
        let topQuestions: any[] = [];
        try {
          const [qRows] = await pool.execute(
            `SELECT question_text, hit_count, merchant_id
             FROM sari_response_cache 
             WHERE is_valid = 1
             ORDER BY hit_count DESC LIMIT 10`
          );
          topQuestions = (qRows as any[]).map((r: any) => ({
            question: r.question_text?.substring(0, 150),
            hitCount: r.hit_count,
          }));
        } catch { /* skip */ }

        return {
          daily: dailyRows as any[],
          topQuestions,
          escalationRate,
          satisfaction,
        };
      } catch {
        return { daily: [], topQuestions: [], escalationRate: 0, satisfaction: null };
      }
    }),

  // ═══════════════════════════════════════════════════════════════
  // Top Opportunities across all merchants
  // ═══════════════════════════════════════════════════════════════
  getTopOpportunities: adminProcedure.query(async () => {
    const { getPool } = await import('./db');
    const pool = await getPool();
    if (!pool) return [];

    try {
      const [rows] = await pool.execute(
        `SELECT ks.merchant_id, ks.content, ks.created_at, m.business_name
         FROM knowledge_sections ks
         JOIN merchants m ON ks.merchant_id = m.id
         WHERE ks.section_type = 'opportunities' AND m.status = 'active'
         ORDER BY ks.updated_at DESC LIMIT 20`
      );

      return (rows as any[]).map((r: any) => ({
        merchantId: r.merchant_id,
        merchantName: r.business_name,
        content: (r.content || '').substring(0, 500),
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }),
});
