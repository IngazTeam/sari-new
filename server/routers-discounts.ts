import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { merchantProcedure, permissionProcedure, router } from './_core/trpc';
import { discountCreateInput, discountTargetInput, discountUpdateInput, discountDeleteInput } from '../shared/discount-dashboard';
import { createDashboardDiscount, deleteDashboardDiscount, getDashboardDiscount, listDashboardDiscounts, updateDashboardDiscount, readDiscountWorkspace, DiscountDashboardError } from './discount-dashboard-store';
import { discountWorkspaceInput } from '../shared/discount-workspace';
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    const reason = error instanceof DiscountDashboardError ? error.reason : 'unavailable';
    const messages = { forbidden: 'تعذر الوصول إلى أكواد الخصم لهذا المتجر.', missing: 'كود الخصم غير موجود في هذا المتجر.', duplicate: 'كود الخصم موجود مسبقًا.', stale: 'تغير كود الخصم. حدّث البيانات وراجع التغيير من جديد.', unavailable: 'تعذر تأكيد نتيجة العملية. حدّث القائمة قبل المحاولة مجددًا.' };
    throw new TRPCError({ code: reason === 'forbidden' ? 'FORBIDDEN' : reason === 'missing' ? 'NOT_FOUND' : reason === 'duplicate' || reason === 'stale' ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR', message: messages[reason] });
  }
}
export const discountsRouter = router({
  workspace: merchantProcedure.input(discountWorkspaceInput).query(({ ctx, input }) => guarded(() => readDiscountWorkspace(ctx.user.id, ctx.merchantId, input))),
  list: merchantProcedure.input(z.undefined()).query(({ ctx }) => guarded(() => listDashboardDiscounts(ctx.user.id, ctx.merchantId))),
  getStats: merchantProcedure.input(z.undefined()).query(({ ctx }) => guarded(async () => {
    const codes = await listDashboardDiscounts(ctx.user.id, ctx.merchantId);
    return { total: codes.length, active: codes.filter(code => code.isActive === 1).length, used: codes.reduce((sum, code) => sum + code.usedCount, 0) };
  })),
  getById: merchantProcedure.input(discountTargetInput).query(({ ctx, input }) => guarded(() => getDashboardDiscount(ctx.user.id, ctx.merchantId, input.id))),
  create: permissionProcedure('campaigns.manage').input(discountCreateInput).mutation(({ ctx, input }) => guarded(async () => ({ success: true, discountCode: await createDashboardDiscount(ctx.user.id, ctx.merchantId, input) }))),
  update: permissionProcedure('campaigns.manage').input(discountUpdateInput).mutation(({ ctx, input }) => guarded(async () => {
    await updateDashboardDiscount(ctx.user.id, ctx.merchantId, input);
    return { success: true, message: 'تم تحديث كود الخصم' };
  })),
  delete: permissionProcedure('campaigns.manage').input(discountDeleteInput).mutation(({ ctx, input }) => guarded(async () => {
    await deleteDashboardDiscount(ctx.user.id, ctx.merchantId, input.id, input.expectedRevision);
    return { success: true, message: 'تم حذف كود الخصم' };
  })),
});
export type DiscountsRouter = typeof discountsRouter;
