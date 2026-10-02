import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { getDb, getSallaConnectionByMerchantId, createSallaConnection, updateSallaConnection, deleteSallaConnection } from './db';
import { readSallaDashboardStatus, readSallaDashboardLogs } from './integrations/salla-dashboard-read';
import { checkExistingIntegrations } from './integrations/platform-checker';
import { safePlatformUrl } from '../shared/platform-workspace';

class DashboardFault extends Error { constructor(readonly code: 'BAD_REQUEST'|'CONFLICT'|'NOT_FOUND', message: string) { super(message); } }
async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try { if (!await getDb()) throw Error('Source unavailable'); return await read(); }
  catch (error) { if (error instanceof DashboardFault) throw new TRPCError({ code: error.code, message: error.message }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تأكيد بيانات سلة. حدّث حالة الربط قبل إعادة المحاولة.' }); }
}
const access = permissionProcedure('integrations.manage');
export const sallaDashboardProcedures = {
  getConnection: access.query(({ ctx }) => guarded(() => readSallaDashboardStatus(ctx.merchantId))),
  getSyncLogs: access.query(({ ctx }) => guarded(() => readSallaDashboardLogs(ctx.merchantId))),
  connect: access.input(z.object({ storeUrl: z.string().trim().max(2048).url().refine(value => !!safePlatformUrl(value), 'Invalid store URL'), accessToken: z.string().trim().min(10).max(8192).regex(/^[\x21-\x7e]+$/) }).strict()).mutation(({ ctx,input }) => guarded(async () => {
    if ((await checkExistingIntegrations(ctx.merchantId)).length) throw new DashboardFault('CONFLICT','يوجد ربط محفوظ. راجعه وافصله قبل ربط متجر آخر.');
    const { SallaIntegration } = await import('./integrations/salla'), salla = new SallaIntegration(ctx.merchantId,input.accessToken), tested = await salla.testConnection();
    if (!tested.success || !tested.storeInfo) throw new DashboardFault('BAD_REQUEST','تعذر التحقق من متجر سلة. راجع بيانات الربط.');
    const fields = { sallaStoreId: tested.storeInfo.id, storeUrl: tested.storeInfo.domain, accessToken: input.accessToken, syncStatus: 'active' as const };
    try { if (await getSallaConnectionByMerchantId(ctx.merchantId)) await updateSallaConnection(ctx.merchantId,fields); else if (!await createSallaConnection({ merchantId: ctx.merchantId,...fields })) throw Error('Connection not saved'); }
    catch (error) { if ((error as any)?.code === 'ER_DUP_ENTRY') throw new DashboardFault('CONFLICT','متجر سلة هذا مرتبط بحساب تاجر آخر.'); throw error; }
    // Existing catalogue authority checks still guard each provider read and projection.
    void salla.fullSync().catch(() => console.error('[Salla] Initial catalog sync could not be confirmed'));
    return { success: true, message: 'حُفظ الربط وبدأ طلب المزامنة. راجع السجل لمعرفة نتيجته.' };
  })),
  disconnect: access.mutation(({ ctx }) => guarded(async () => { await deleteSallaConnection(ctx.merchantId); return { success: true, message: 'تم فصل المتجر بنجاح' }; })),
  syncNow: access.input(z.object({ syncType: z.enum(['full','stock']).default('stock') }).strict()).mutation(({ ctx,input }) => guarded(async () => {
    const connection = await getSallaConnectionByMerchantId(ctx.merchantId); if (!connection) throw new DashboardFault('NOT_FOUND','المتجر غير مربوط');
    const { SallaIntegration } = await import('./integrations/salla'), salla = new SallaIntegration(ctx.merchantId,connection.accessToken);
    if (input.syncType === 'full') { const result = await salla.fullSync(); if (!result.success) throw Error('Sync not confirmed'); return { success: true, message: `تمت مزامنة ${result.synced} منتج بنجاح` }; }
    const result = await salla.syncStock(); if (!result.success) throw Error('Sync not confirmed'); return { success: true, message: `تم تحديث ${result.updated} منتج بنجاح` };
  })),
};
