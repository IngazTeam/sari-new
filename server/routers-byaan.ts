/**
 * Byaan Integration Router — tRPC endpoints for Byaan dashboard pages
 * 
 * These endpoints power the Byaan-only dashboard pages:
 * - Connection status & sync stats
 * - Trainees list with search/filter
 * - FAQs management
 * - Site content viewer
 * 
 * All endpoints require Byaan integration to be active.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getMerchantByUserId, getPool } from './db';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function requireByaanMerchant(userId: number) {
  const merchant = await getMerchantByUserId(userId);
  if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });
  return merchant;
}

async function requireActiveByaanMerchant(userId: number) {
  const merchant = await requireByaanMerchant(userId);
  const { getByaanConnection } = await import('./integrations/byaan');
  const connection = await getByaanConnection(merchant.id);
  const source = merchant.integrationSource || 'none';
  if (source !== 'byaan' || !connection?.is_active || !connection?.verified_at) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'يلزم ربط بيان وتوثيق ملكية النطاق للوصول إلى هذه البيانات',
    });
  }
  return { merchant, connection };
}

function sanitizeForTRPC(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Buffer || data instanceof Uint8Array) return undefined;
  if (data instanceof Date) return data.toISOString();
  if (typeof data === 'bigint') return Number(data);
  if (Array.isArray(data)) return data.map(sanitizeForTRPC);
  if (typeof data === 'object') {
    const clean: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === 'embedding') continue;
      const sanitized = sanitizeForTRPC(val);
      if (sanitized !== undefined) clean[key] = sanitized;
    }
    return clean;
  }
  return data;
}

function parseEnrolledCourseNames(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 100)
      .map((course) => {
        if (typeof course === 'string') return course.trim().substring(0, 255);
        if (course && typeof course === 'object' && typeof course.name === 'string') {
          return course.name.trim().substring(0, 255);
        }
        return '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// PEN-BYAAN-06: Rate limiter for resync mutation (3 per 5 min per merchant)
const resyncLimits = new Map<number, number[]>();
function checkResyncLimit(merchantId: number): boolean {
  const now = Date.now();
  const window = 5 * 60_000; // 5 minutes
  const maxCalls = 3;
  let calls = resyncLimits.get(merchantId) || [];
  calls = calls.filter(t => now - t < window);
  if (calls.length >= maxCalls) return false;
  calls.push(now);
  resyncLimits.set(merchantId, calls);
  return true;
}

// NQ-2: Register memory cleanup
import('./cron/memory-cleanup').then(({ registerMemoryCleanup }) => {
  registerMemoryCleanup('byaan-resync', () => {
    const now = Date.now();
    let evicted = 0;
    for (const [key, calls] of Array.from(resyncLimits.entries())) {
      const fresh = calls.filter((t: number) => now - t < 600_000);
      if (fresh.length === 0) { resyncLimits.delete(key); evicted++; }
      else resyncLimits.set(key, fresh);
    }
    return evicted;
  });
}).catch(() => {});

// ═══════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════

export const byaanRouter = router({

  // ── Get connection status + sync stats ──
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await requireByaanMerchant(ctx.user.id);

    const { getByaanConnection, getByaanSyncStats } = await import('./integrations/byaan');
    const connection = await getByaanConnection(merchant.id);

    if (!connection) {
      return sanitizeForTRPC({
        connected: false,
        integrationSource: (merchant as any).integration_source || (merchant as any).integrationSource || 'none',
        stats: { trainees: 0, faqs: 0, courses: 0, sitePages: 0 },
      });
    }

    const integrationSource = merchant.integrationSource || 'none';
    const connected = Boolean(
      integrationSource === 'byaan' && connection.is_active && connection.verified_at,
    );
    const stats = connected
      ? await getByaanSyncStats(merchant.id)
      : { trainees: 0, faqs: 0, courses: 0, sitePages: 0 };
    return sanitizeForTRPC({
      connected,
      verificationPending: !connected,
      integrationSource,
      connection: {
        tenantDomain: connection.tenant_domain,
        syncStatus: connection.sync_status,
        lastSyncAt: connection.last_sync_at,
        hasSyncErrors: Boolean(connection.sync_errors),
        isActive: connection.is_active,
      },
      stats,
    });
  }),

  // ── Get trainees list ──
  getTrainees: protectedProcedure
    .input(z.object({
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.number().int().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { merchant } = await requireActiveByaanMerchant(ctx.user.id);

      const { getByaanTraineePage } = await import('./integrations/byaan');
      const page = await getByaanTraineePage(merchant.id, {
        search: input?.search,
        limit: input?.limit || 50,
        cursor: input?.cursor,
      });

      // Parse enrolled_courses JSON
      return sanitizeForTRPC({
        items: page.items.map((t) => ({
          id: t.id,
          externalId: t.external_id,
          name: t.name,
          phone: t.phone,
          email: t.email,
          enrolledCourses: parseEnrolledCourseNames(t.enrolled_courses),
          status: t.status,
          syncedAt: t.synced_at,
          createdAt: t.created_at,
        })),
        nextCursor: page.nextCursor,
      });
    }),

  // ── Get FAQs ──
  getFaqs: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.number().int().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { merchant } = await requireActiveByaanMerchant(ctx.user.id);

      const { getByaanFaqPage } = await import('./integrations/byaan');
      const page = await getByaanFaqPage(merchant.id, {
        limit: input?.limit || 50,
        cursor: input?.cursor,
      });

      return sanitizeForTRPC({
        items: page.items.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          category: f.category,
          isActive: f.is_active === 1,
          useInBot: f.use_in_bot === 1,
          syncedAt: f.synced_at,
        })),
        nextCursor: page.nextCursor,
      });
    }),

  // ── Toggle FAQ active/useInBot ──
  toggleFaq: protectedProcedure
    .input(z.object({
      faqId: z.number(),
      field: z.enum(['is_active', 'use_in_bot']),
      value: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await requireActiveByaanMerchant(ctx.user.id);

      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });

      // Verify FAQ belongs to this merchant
      const [rows] = await pool.execute(
        `SELECT id FROM byaan_faqs WHERE id = ? AND merchant_id = ?`,
        [input.faqId, merchant.id]
      );
      if (!(rows as any[])?.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'السؤال غير موجود' });
      }

      // PEN-BYAAN-04: Explicit field mapping — never interpolate user input into SQL
      const fieldMap: Record<string, string> = {
        'is_active': 'is_active',
        'use_in_bot': 'use_in_bot',
      };
      const safeField = fieldMap[input.field];
      if (!safeField) throw new TRPCError({ code: 'BAD_REQUEST', message: 'حقل غير صالح' });

      await pool.execute(
        `UPDATE byaan_faqs SET ${safeField} = ? WHERE id = ? AND merchant_id = ?`,
        [input.value ? 1 : 0, input.faqId, merchant.id]
      );

      return { success: true };
    }),

  // ── Get site content ──
  getSiteContent: protectedProcedure.query(async ({ ctx }) => {
    const { merchant } = await requireActiveByaanMerchant(ctx.user.id);

    const pool = await getPool();
    if (!pool) return [];

    const [rows] = await pool.execute(
      `SELECT id, page_type, title, content, synced_at
       FROM byaan_site_content WHERE merchant_id = ? ORDER BY page_type`,
      [merchant.id],
    );
    return sanitizeForTRPC(rows);
  }),

  // ── Trigger resync from Sari side ──
  triggerResync: protectedProcedure.mutation(async ({ ctx }) => {
    const { merchant } = await requireActiveByaanMerchant(ctx.user.id);

    // PEN-BYAAN-06: Rate limit resync (3 per 5 min)
    if (!checkResyncLimit(merchant.id)) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'انتظر قليلاً قبل إعادة المزامنة (الحد: 3 كل 5 دقائق)' });
    }
    const { requestByaanResync, updateByaanSyncStatus } = await import('./integrations/byaan');

    await updateByaanSyncStatus(merchant.id, 'syncing');
    const result = await requestByaanResync(merchant.id);
    if (!result.success) {
      await updateByaanSyncStatus(merchant.id, 'error', result.error);
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر طلب المزامنة من بيان' });
    }
    return { success: true, message: 'تم طلب إعادة المزامنة من بيان عبر طلب موقع' };
  }),
});
