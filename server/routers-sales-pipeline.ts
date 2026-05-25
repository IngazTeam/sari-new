/**
 * Sales Pipeline Router — "غرفة قيادة المبيعات"
 * 
 * Replaces the static SalesHub (quotations-only) with a real-time
 * sales operations dashboard showing:
 * - Pipeline stages (Kanban view data)
 * - Hot leads ready to pay
 * - Stalled deals needing attention
 * - Payment links pending completion
 * - Loss reasons breakdown
 * - Weekly trend comparison
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getMerchantByUserId, getPool } from './db';
import { getPipelineSummary } from './ai/loss-detector';

export const salesPipelineRouter = router({

  /**
   * Main pipeline view — all data for the Sales Pipeline Board
   */
  getPipeline: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return getPipelineSummary(merchant.id);
  }),

  /**
   * Pipeline KPIs — conversion rate, avg time to close, top loss reason
   */
  getKPIs: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const pool = await getPool();
    if (!pool) return { conversionRate: 0, avgTimeToClose: 0, topLossReason: null, totalRevenue: 0, weeklyTrend: 'stable' as const };

    // Conversion rate: paid / (paid + lost) last 30 days
    const [convRows] = await pool.execute(
      `SELECT 
         SUM(CASE WHEN deal_stage = 'paid' THEN 1 ELSE 0 END) as wins,
         SUM(CASE WHEN deal_stage = 'lost' THEN 1 ELSE 0 END) as losses,
         SUM(CASE WHEN deal_stage = 'paid' THEN 1 ELSE 0 END) + 
         SUM(CASE WHEN deal_stage = 'lost' THEN 1 ELSE 0 END) as total
       FROM conversations
       WHERE merchantId = ?
         AND lastMessageAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [merchant.id]
    );
    const conv = (convRows as any[])[0];
    const conversionRate = conv?.total > 0 ? Math.round((conv.wins / conv.total) * 100) : 0;

    // Top loss reason
    const [lossRows] = await pool.execute(
      `SELECT loss_reason, COUNT(*) as count FROM conversations
       WHERE merchantId = ? AND loss_reason IS NOT NULL
         AND lastMessageAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY loss_reason ORDER BY count DESC LIMIT 1`,
      [merchant.id]
    );
    const topLossReason = (lossRows as any[])[0]?.loss_reason || null;
    const topLossCount = (lossRows as any[])[0]?.count || 0;

    // Weekly trend: this week vs last week paid count
    const [trendRows] = await pool.execute(
      `SELECT 
         SUM(CASE WHEN lastMessageAt > DATE_SUB(NOW(), INTERVAL 7 DAY) AND deal_stage = 'paid' THEN 1 ELSE 0 END) as this_week,
         SUM(CASE WHEN lastMessageAt BETWEEN DATE_SUB(NOW(), INTERVAL 14 DAY) AND DATE_SUB(NOW(), INTERVAL 7 DAY) AND deal_stage = 'paid' THEN 1 ELSE 0 END) as last_week
       FROM conversations WHERE merchantId = ?`,
      [merchant.id]
    );
    const trend = (trendRows as any[])[0];
    const weeklyTrend = (trend?.this_week || 0) > (trend?.last_week || 0)
      ? 'up' as const
      : (trend?.this_week || 0) < (trend?.last_week || 0)
        ? 'down' as const
        : 'stable' as const;

    // Total revenue (from paid orders, last 30 days)
    const [revRows] = await pool.execute(
      `SELECT COALESCE(SUM(o.totalAmount), 0) as revenue
       FROM orders o
       WHERE o.merchantId = ? AND o.status = 'paid'
         AND o.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [merchant.id]
    );
    const totalRevenue = (revRows as any[])[0]?.revenue || 0;

    return {
      conversionRate,
      topLossReason,
      topLossCount,
      totalRevenue: Number(totalRevenue),
      weeklyTrend,
      thisWeekWins: trend?.this_week || 0,
      lastWeekWins: trend?.last_week || 0,
    };
  }),

  /**
   * Action counts — for the action cards at the top
   */
  getActionCounts: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    const pool = await getPool();
    if (!pool) return { readyToPay: 0, needsHuman: 0, paymentPending: 0, stalled: 0 };

    const [rows] = await pool.execute(
      `SELECT 
         SUM(CASE WHEN deal_stage = 'ready' AND lastMessageAt > DATE_SUB(NOW(), INTERVAL 48 HOUR) THEN 1 ELSE 0 END) as ready_to_pay,
         SUM(CASE WHEN deal_stage IN ('interested', 'qualified') AND lastMessageAt < DATE_SUB(NOW(), INTERVAL 48 HOUR) AND loss_reason IS NULL THEN 1 ELSE 0 END) as stalled,
         SUM(CASE WHEN deal_stage = 'payment_link_sent' THEN 1 ELSE 0 END) as payment_pending
       FROM conversations WHERE merchantId = ?`,
      [merchant.id]
    );
    const counts = (rows as any[])[0];

    // Active escalations needing human
    const [escRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM sari_escalation_queue
       WHERE merchant_id = ? AND status IN ('pending', 'notified')`,
      [merchant.id]
    );
    const needsHuman = (escRows as any[])[0]?.count || 0;

    return {
      readyToPay: counts?.ready_to_pay || 0,
      needsHuman,
      paymentPending: counts?.payment_pending || 0,
      stalled: counts?.stalled || 0,
    };
  }),

  /**
   * Loss reasons breakdown — for the loss analysis chart
   */
  getLossBreakdown: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const pool = await getPool();
      if (!pool) return [];

      const REASON_LABELS: Record<string, string> = {
        price: '💰 السعر',
        trust: '🤝 الثقة',
        competitor: '🏪 منافس',
        delivery: '🚚 التوصيل',
        payment_failed: '❌ فشل الدفع',
        payment_abandoned: '🛒 دفع غير مكتمل',
        no_response: '👻 لم يرد',
        human_needed: '🙋 يحتاج إنسان',
      };

      const [rows] = await pool.execute(
        `SELECT loss_reason, COUNT(*) as count FROM conversations
         WHERE merchantId = ? AND loss_reason IS NOT NULL
           AND stalled_since > DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY loss_reason ORDER BY count DESC`,
        [merchant.id, input.days]
      );

      return (rows as any[]).map(r => ({
        reason: r.loss_reason,
        label: REASON_LABELS[r.loss_reason] || r.loss_reason,
        count: r.count,
      }));
    }),
});

export type SalesPipelineRouter = typeof salesPipelineRouter;
