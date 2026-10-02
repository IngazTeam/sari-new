/**
 * Byaan Integration Router — tRPC endpoints for Byaan dashboard pages
 * 
 * These endpoints power the Byaan-only dashboard pages:
 * - Connection status & sync stats
 * - Trainees list with search/filter
 * - FAQs management
 * - Site content viewer
 * 
 * Status is available to members; operational data requires an active verified Byaan integration and feature permission.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { getPool } from './db';
import { hasPermission } from './_core/permissions';
import { byaanDataInput, byaanFaqChangeInput } from '../shared/byaan-data-workspace';
import { readByaanDataWorkspace } from './integrations/byaan-data-workspace';
import { readByaanConnectionWorkspace } from './integrations/byaan-connection-workspace';
import { ByaanDashboardFault, requireActiveByaanMerchant, toggleByaanDashboardFaq } from './integrations/byaan-dashboard-access';
import { byaanSalesReviewInput } from '../shared/byaan-sales-review';
import { byaanEnrollmentRecoveryInput } from '../shared/byaan-enrollment-recovery';
import { byaanSalesReviewAuthority, listByaanSalesOperations } from './integrations/byaan-sales-review';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function dashboardGuard<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const reason = error instanceof ByaanDashboardFault ? error.reason : 'unavailable';
    const faults = {
      stale: ['CONFLICT', 'تغير السؤال منذ المراجعة، حدّث البيانات وراجع التغيير'],
      unavailable: ['INTERNAL_SERVER_ERROR', 'Byaan dashboard data unavailable'],
      inactive: ['PRECONDITION_FAILED', 'يلزم ربط بيان وتوثيق ملكية النطاق للوصول إلى هذه البيانات'],
      forbidden: ['FORBIDDEN', 'ليست لديك صلاحية إدارة معرفة بيان'],
      missing: ['NOT_FOUND', 'السؤال غير موجود'],
      rate_limited: ['TOO_MANY_REQUESTS', 'انتظر قليلاً قبل إعادة المزامنة (الحد: 3 كل 5 دقائق)'],
      provider: ['BAD_GATEWAY', 'تعذر طلب المزامنة من بيان'],
    } as const;
    const [code, message] = faults[reason];
    throw new TRPCError({ code, message });
  }
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
  dataWorkspace: merchantProcedure.input(byaanDataInput).query(async ({ ctx, input }) => dashboardGuard(async () => {
    const permission = input.kind === 'trainees' ? 'customers.manage' : 'bot_settings.manage';
    if (!hasPermission(ctx.merchantRole, permission)) throw new ByaanDashboardFault('forbidden');
    return readByaanDataWorkspace(ctx.user.id, ctx.merchantId, input);
  })),
  changeFaq: permissionProcedure('bot_settings.manage').input(byaanFaqChangeInput).mutation(async ({ ctx, input }) =>
    dashboardGuard(async () => ({ actorId: ctx.user.id, merchantId: ctx.merchantId, faqId: input.faqId, ...await toggleByaanDashboardFaq(ctx.user.id, ctx.merchantId, input) }))),


  recoverEnrollmentProjection: permissionProcedure('orders.manage').input(byaanEnrollmentRecoveryInput).mutation(async ({ ctx, input }) => {
    try {
      const { recoverByaanEnrollmentProjection } = await import('./ai/byaan-enrollment-agreements');
      return await recoverByaanEnrollmentProjection(ctx.merchantId, ctx.user.id, input);
    } catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر التحقق من استعادة نتيجة اتفاق بيان' }); }
  }),

  salesReviewAccess: permissionProcedure('orders.manage').query(async ({ ctx }) => {
    try { return await byaanSalesReviewAuthority(ctx.merchantId, ctx.user.id); }
    catch { throw new TRPCError({ code: 'FORBIDDEN', message: 'تعذر التحقق من صلاحية مراجعة عمليات بيان' }); }
  }),
  listSalesOperations: permissionProcedure('orders.manage').input(byaanSalesReviewInput).query(async ({ ctx, input }) => {
    try { return await listByaanSalesOperations(ctx.merchantId, ctx.user.id, input); }
    catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر قراءة سجل عمليات بيان' }); }
  }),

  // ── Get connection status + sync stats ──
  getStatus: merchantProcedure.query(async ({ ctx }) => dashboardGuard(async () => {
    const workspace = await readByaanConnectionWorkspace(ctx.user.id, ctx.merchantId);
    const connected = workspace.managedContent && !!workspace.verifiedAt && ['configured', 'syncing', 'paused', 'error'].includes(workspace.state);
    return {
      actorId: ctx.user.id, merchantId: ctx.merchantId,
      connected, verificationPending: workspace.state === 'pending_verification',
      integrationSource: workspace.source,
      connection: workspace.present ? {
        tenantDomain: workspace.tenantDomain,
        syncStatus: workspace.state === 'configured' ? 'active' : workspace.state,
        lastSyncAt: workspace.lastSyncAt, hasSyncErrors: workspace.hasSyncErrors,
        isActive: connected,
      } : undefined,
      stats: { trainees: workspace.counts.activeTrainees, faqs: workspace.counts.activeFaqs, courses: workspace.counts.catalog, sitePages: workspace.counts.sitePages },
    };
  })),

  // ── Get trainees list ──
  getTrainees: permissionProcedure('customers.manage')
    .input(z.object({
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.number().int().positive().max(2147483647).optional(),
    }).strict().optional())
    .query(async ({ ctx, input }) => dashboardGuard(async () => {
      const { merchant } = await requireActiveByaanMerchant(ctx.merchantId);

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
    })),

  // ── Get FAQs ──
  getFaqs: permissionProcedure('bot_settings.manage')
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.number().int().positive().max(2147483647).optional(),
    }).strict().optional())
    .query(async ({ ctx, input }) => dashboardGuard(async () => {
      const { merchant } = await requireActiveByaanMerchant(ctx.merchantId);

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
    })),

  // ── Toggle FAQ active/useInBot ──
  toggleFaq: permissionProcedure('bot_settings.manage')
    .input(z.object({
      faqId: z.number().int().positive().max(2147483647),
      field: z.enum(['is_active', 'use_in_bot']),
      value: z.boolean(),
    }).strict())
    .mutation(async ({ ctx, input }) => dashboardGuard(() => toggleByaanDashboardFaq(ctx.user.id, ctx.merchantId, input))),

  // ── Get site content ──
  getSiteContent: permissionProcedure('bot_settings.manage').query(async ({ ctx }) => dashboardGuard(async () => {
    const { merchant } = await requireActiveByaanMerchant(ctx.merchantId);

    const pool = await getPool();
    if (!pool) throw new ByaanDashboardFault('unavailable');

    const [rows] = await pool.execute(
      `SELECT id, page_type, title, content, synced_at
       FROM byaan_site_content WHERE merchant_id = ? ORDER BY page_type`,
      [merchant.id],
    );
    return sanitizeForTRPC(rows);
  })),

  // ── Trigger resync from Sari side ──
  triggerResync: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => dashboardGuard(async () => {
    const { merchant } = await requireActiveByaanMerchant(ctx.merchantId);

    // PEN-BYAAN-06: Rate limit resync (3 per 5 min)
    if (!checkResyncLimit(merchant.id)) {
      throw new ByaanDashboardFault('rate_limited');
    }
    const { requestByaanResync, updateByaanSyncStatus } = await import('./integrations/byaan');

    await updateByaanSyncStatus(merchant.id, 'syncing');
    const result = await requestByaanResync(merchant.id);
    if (!result.success) {
      await updateByaanSyncStatus(merchant.id, 'error', result.error);
      throw new ByaanDashboardFault('provider');
    }
    return { success: true, message: 'تم طلب إعادة المزامنة من بيان عبر طلب موقع' };
  })),
});
