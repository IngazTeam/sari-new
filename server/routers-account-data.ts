import { COOKIE_NAME } from '@shared/const';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getSessionCookieOptions } from './_core/cookies';
import { protectedProcedure, router } from './_core/trpc';
import {
  exportPersonalAccountData,
  getPrivacyCenterState,
  listDataSubjectRequestsForAdmin,
  requestAccountDeletion,
  resolveDataSubjectRequest,
  setMarketingConsent,
  submitDataSubjectRequest,
} from './accounts/lifecycle';

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

function requestEvidence(ctx: { req: { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, unknown> } }) {
  const userAgent = typeof ctx.req.headers['user-agent'] === 'string'
    ? ctx.req.headers['user-agent']
    : null;
  return {
    ipAddress: ctx.req.ip || ctx.req.socket?.remoteAddress || null,
    userAgent,
  };
}

function mapLifecycleError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message === 'INVALID_PASSWORD') {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'كلمة المرور غير صحيحة' });
  }
  if (message === 'ADMIN_DELETION_REQUIRES_REVIEW') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'حذف حساب الإدارة يتطلب مراجعة يدوية' });
  }
  if (message === 'MERCHANT_OWNERSHIP_TRANSFER_REQUIRED') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'انقل ملكية المتجر المشترك قبل حذف الحساب' });
  }
  if (message === 'ACCOUNT_UNAVAILABLE') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'الحساب غير متاح لهذا الإجراء' });
  }
  if (message === 'DELETION_STATE_MISMATCH') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'حالة الحساب وطلب الحذف غير متطابقتين وتحتاجان مراجعة' });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تنفيذ طلب الخصوصية' });
}

export const accountDataRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    return getPrivacyCenterState(ctx.user.id);
  }),

  exportPersonalData: protectedProcedure
    .input(z.object({ password: z.string().min(8).max(128) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await exportPersonalAccountData(ctx.user.id, input.password);
      } catch (error) {
        return mapLifecycleError(error);
      }
    }),

  setMarketingConsent: protectedProcedure
    .input(z.object({ granted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await setMarketingConsent({ userId: ctx.user.id, granted: input.granted, ...requestEvidence(ctx) });
        return { success: true };
      } catch (error) {
        return mapLifecycleError(error);
      }
    }),

  submitRequest: protectedProcedure
    .input(z.object({
      requestType: z.enum(['access', 'correction', 'objection']),
      details: z.string().trim().min(3).max(1_000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await submitDataSubjectRequest({ userId: ctx.user.id, ...input });
      } catch (error) {
        return mapLifecycleError(error);
      }
    }),

  requestDeletion: protectedProcedure
    .input(z.object({
      password: z.string().min(8).max(128),
      confirmation: z.literal('DELETE_MY_ACCOUNT'),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await requestAccountDeletion(ctx.user.id, input.password);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true, request };
      } catch (error) {
        return mapLifecycleError(error);
      }
    }),

  adminListRequests: adminProcedure
    .input(z.object({
      status: z.enum(['pending', 'processing', 'completed', 'rejected', 'requires_review', 'failed']).optional(),
    }).optional())
    .query(({ input }) => listDataSubjectRequestsForAdmin(input?.status)),

  adminResolveRequest: adminProcedure
    .input(z.object({
      requestId: z.number().int().positive(),
      decision: z.enum(['completed', 'rejected', 'requires_review', 'retry']),
      notes: z.string().trim().min(3).max(2_000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolveDataSubjectRequest({ ...input, reviewerUserId: ctx.user.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'REQUEST_NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
        }
        if (message === 'REQUEST_ALREADY_FINAL') {
          throw new TRPCError({ code: 'CONFLICT', message: 'تم إغلاق الطلب مسبقاً' });
        }
        if (message === 'DELETION_COMPLETION_WORKER_ONLY') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'طلبات الحذف لا تُستكمل أو تُرفض يدويًا؛ عامل الحذف الذري وحده يغلقها',
          });
        }
        if (message === 'DELETION_RETRY_REQUIRES_REVIEW' || message === 'RETRY_ONLY_FOR_DELETION') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'إعادة المحاولة متاحة فقط لطلب حذف يحتاج مراجعة' });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تحديث الطلب' });
      }
    }),
});
