/**
 * Message Delivery Monitor — tRPC Router
 * Provides admin endpoints for real-time message delivery tracking
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from './_core/trpc';
import { eq, desc, and, gte, sql, count } from 'drizzle-orm';

// Admin-only procedure — SEC-FIX: accepts both admin and superadmin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user.role as string) !== 'admin' && (ctx.user.role as string) !== 'superadmin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

/** Strip HTML tags from a string — prevents stored XSS */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '');
}

/** Truncate string to max length */
function truncate(str: string | undefined | null, max: number): string | null {
  if (!str) return null;
  return str.length > max ? str.substring(0, max) : str;
}

/** Fire-and-forget: log a message delivery outcome */
export async function logDelivery(data: {
  merchantId: number;
  instanceId?: string;
  customerPhone: string;
  customerName?: string;
  messageType?: 'text' | 'voice' | 'image' | 'video' | 'document' | 'other';
  status: 'delivered' | 'failed' | 'dropped';
  failureReason?: string;
  failureDetails?: string;
  responseTimeMs?: number;
  source?: 'webhook' | 'polling';
}): Promise<void> {
  try {
    const { getDb } = await import('./db');
    const db = await getDb();
    if (!db) return;

    const { messageDeliveryLog } = await import('../drizzle/schema_monitor');

    // SEC-FIX: Sanitize all string inputs (VULN-MON-2, VULN-MON-4)
    await db.insert(messageDeliveryLog).values({
      merchantId: data.merchantId,
      instanceId: truncate(data.instanceId, 255),
      customerPhone: truncate(data.customerPhone, 30) || 'unknown',
      customerName: truncate(stripHtml(data.customerName || ''), 200) || null,
      messageType: data.messageType || 'text',
      status: data.status,
      failureReason: truncate(data.failureReason, 200),
      failureDetails: truncate(data.failureDetails, 1000),
      responseTimeMs: data.responseTimeMs || null,
      source: data.source || 'webhook',
    });
  } catch (err) {
    // Never let logging break the main flow
    console.error('[Monitor] Failed to log delivery:', (err as Error).message);
  }
}

export const monitorRouter = router({
  // ── Overview: summary stats for last 24h ──
  getOverview: adminProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
      const hours = input?.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const rows = await db
        .select({
          status: messageDeliveryLog.status,
          count: count(),
        })
        .from(messageDeliveryLog)
        .where(gte(messageDeliveryLog.createdAt, since.toISOString()))
        .groupBy(messageDeliveryLog.status);

      let total = 0, delivered = 0, failed = 0, dropped = 0;
      for (const r of rows) {
        const c = Number(r.count);
        total += c;
        if (r.status === 'delivered') delivered = c;
        if (r.status === 'failed') failed = c;
        if (r.status === 'dropped') dropped = c;
      }

      // Average response time
      const [avgRow] = await db
        .select({ avg: sql<number>`AVG(response_time_ms)` })
        .from(messageDeliveryLog)
        .where(and(
          gte(messageDeliveryLog.createdAt, since.toISOString()),
          eq(messageDeliveryLog.status, 'delivered'),
        ));

      return {
        total,
        delivered,
        failed,
        dropped,
        rate: total > 0 ? Math.round((delivered / total) * 1000) / 10 : 100,
        avgResponseMs: Math.round(avgRow?.avg ?? 0),
        hours,
      };
    }),

  // ── Failed Messages: list of recent failures ──
  getFailedMessages: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      hours: z.number().min(1).max(168).default(24),
    }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
      const limit = input?.limit ?? 50;
      const hours = input?.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const rows = await db
        .select()
        .from(messageDeliveryLog)
        .where(and(
          gte(messageDeliveryLog.createdAt, since.toISOString()),
          sql`${messageDeliveryLog.status} IN ('failed', 'dropped')`,
        ))
        .orderBy(desc(messageDeliveryLog.createdAt))
        .limit(limit);

      // Enrich with merchant names
      const { merchants } = await import('../drizzle/schema');
      const merchantIds = Array.from(new Set(rows.map(r => r.merchantId)));
      const merchantMap = new Map<number, string>();
      if (merchantIds.length > 0) {
        const merchantRows = await db
          .select({ id: merchants.id, businessName: merchants.businessName })
          .from(merchants)
          .where(sql`${merchants.id} IN (${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)})`);
        for (const m of merchantRows) {
          merchantMap.set(m.id, m.businessName);
        }
      }

      return rows.map(r => ({
        ...r,
        // SEC-FIX: Mask phone numbers in API response (VULN-MON-3)
        customerPhone: r.customerPhone
          ? r.customerPhone.substring(0, 7) + '****' + r.customerPhone.slice(-1)
          : 'unknown',
        // SEC-FIX: Truncate failureDetails to prevent path exposure (VULN-MON-5)
        failureDetails: r.failureDetails
          ? r.failureDetails.substring(0, 500)
          : null,
        merchantName: merchantMap.get(r.merchantId) || `تاجر #${r.merchantId}`,
      }));
    }),

  // ── Merchant Health: per-merchant delivery summary ──
  getMerchantHealth: adminProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
      const { merchants } = await import('../drizzle/schema');
      const hours = input?.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const rows = await db
        .select({
          merchantId: messageDeliveryLog.merchantId,
          status: messageDeliveryLog.status,
          count: count(),
          lastMessage: sql<string>`MAX(${messageDeliveryLog.createdAt})`,
        })
        .from(messageDeliveryLog)
        .where(gte(messageDeliveryLog.createdAt, since.toISOString()))
        .groupBy(messageDeliveryLog.merchantId, messageDeliveryLog.status);

      // Group by merchant
      const merchantStats = new Map<number, { total: number; delivered: number; failed: number; lastMessage: string }>();
      for (const r of rows) {
        const existing = merchantStats.get(r.merchantId) || { total: 0, delivered: 0, failed: 0, lastMessage: '' };
        const c = Number(r.count);
        existing.total += c;
        if (r.status === 'delivered') existing.delivered += c;
        if (r.status === 'failed' || r.status === 'dropped') existing.failed += c;
        if (r.lastMessage > existing.lastMessage) existing.lastMessage = r.lastMessage;
        merchantStats.set(r.merchantId, existing);
      }

      // Get merchant names
      const merchantIds = Array.from(merchantStats.keys());
      const merchantMap = new Map<number, string>();
      if (merchantIds.length > 0) {
        const merchantRows = await db
          .select({ id: merchants.id, businessName: merchants.businessName })
          .from(merchants)
          .where(sql`${merchants.id} IN (${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)})`);
        for (const m of merchantRows) {
          merchantMap.set(m.id, m.businessName);
        }
      }

      return Array.from(merchantStats.entries()).map(([merchantId, stats]) => ({
        merchantId,
        merchantName: merchantMap.get(merchantId) || `تاجر #${merchantId}`,
        total: stats.total,
        delivered: stats.delivered,
        failed: stats.failed,
        rate: stats.total > 0 ? Math.round((stats.delivered / stats.total) * 1000) / 10 : 100,
        lastMessage: stats.lastMessage,
      })).sort((a, b) => a.rate - b.rate); // Worst first
    }),

  // ── Failure Breakdown by Reason ──
  getFailuresByReason: adminProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
      const hours = input?.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      return await db
        .select({
          reason: messageDeliveryLog.failureReason,
          count: count(),
        })
        .from(messageDeliveryLog)
        .where(and(
          gte(messageDeliveryLog.createdAt, since.toISOString()),
          sql`${messageDeliveryLog.status} IN ('failed', 'dropped')`,
        ))
        .groupBy(messageDeliveryLog.failureReason)
        .orderBy(desc(count()));
    }),

  // ── Timeline: hourly message counts ──
  getTimeline: adminProcedure
    .input(z.object({ hours: z.number().min(1).max(168).default(24) }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
      const hours = input?.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      return await db
        .select({
          hour: sql<string>`DATE_FORMAT(${messageDeliveryLog.createdAt}, '%Y-%m-%d %H:00')`,
          status: messageDeliveryLog.status,
          count: count(),
        })
        .from(messageDeliveryLog)
        .where(gte(messageDeliveryLog.createdAt, since.toISOString()))
        .groupBy(sql`DATE_FORMAT(${messageDeliveryLog.createdAt}, '%Y-%m-%d %H:00')`, messageDeliveryLog.status)
        .orderBy(sql`DATE_FORMAT(${messageDeliveryLog.createdAt}, '%Y-%m-%d %H:00')`);
    }),

  // ── Unread failure count (for sidebar badge) ──
  getFailureCount: adminProcedure.query(async () => {
    const { getDb } = await import('./db');
    const db = await getDb();
    if (!db) return { count: 0 };

    const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [row] = await db
      .select({ count: count() })
      .from(messageDeliveryLog)
      .where(and(
        gte(messageDeliveryLog.createdAt, since.toISOString()),
        sql`${messageDeliveryLog.status} IN ('failed', 'dropped')`,
      ));

    return { count: Number(row?.count ?? 0) };
  }),
});

/**
 * 30-day retention cleanup — call from cron (daily)
 * Removes delivery logs older than 30 days
 */
export async function cleanupOldDeliveryLogs(): Promise<number> {
  try {
    const { getDb } = await import('./db');
    const db = await getDb();
    if (!db) return 0;

    const { messageDeliveryLog } = await import('../drizzle/schema_monitor');
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(messageDeliveryLog)
      .where(sql`${messageDeliveryLog.createdAt} < ${cutoff.toISOString()}`);

    const deleted = (result as any)?.[0]?.affectedRows ?? 0;
    if (deleted > 0) {
      console.log(`[Monitor] Cleaned up ${deleted} delivery logs older than 30 days`);
    }
    return deleted;
  } catch (err) {
    console.error('[Monitor] Failed to cleanup old logs:', (err as Error).message);
    return 0;
  }
}
