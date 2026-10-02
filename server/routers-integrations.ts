import { z } from 'zod';
import { permissionProcedure, router } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { readPlatformWorkspace } from './integrations/platform-workspace';
import { getCurrentPlatform, getAllConnectedPlatforms } from './integrations/platform-checker';
const manage = permissionProcedure('integrations.manage');
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'Platform connection data unavailable'}); }
}
export const integrationsRouter = router({
  workspace: manage.query(({ctx}) => guarded(() => readPlatformWorkspace(ctx.user.id,ctx.merchantId))),
  getCurrentPlatform: manage.query(({ctx}) => guarded(() => getCurrentPlatform(ctx.merchantId))),
  getAllConnectedPlatforms: manage.query(({ctx}) => guarded(() => getAllConnectedPlatforms(ctx.merchantId))),
  getByaanStatus: manage.query(({ctx}) => guarded(async () => {
    const snapshot = await readPlatformWorkspace(ctx.user.id,ctx.merchantId);
    const connection = snapshot.platforms.find(p => p.platform === 'byaan')!;
    const {getTerminology} = await import('./integrations/byaan');
    return {
      actorId:ctx.user.id,merchantId:ctx.merchantId,source:snapshot.source,
      isConnected:snapshot.source==='byaan' && connection.occupiesSlot && !['pending_verification','unknown'].includes(connection.state),
      verificationPending:connection.state==='pending_verification',terminology:getTerminology(snapshot.source),
      byaan:connection.present ? {tenantDomain:connection.storeUrl ? new URL(connection.storeUrl).hostname : null,syncStatus:connection.state==='configured'?'active' as const:connection.state,lastSyncAt:connection.lastSyncAt,hasSyncErrors:connection.hasSyncErrors} : null,
      stats:{products:snapshot.stats.products,customers:snapshot.stats.customers},
    };
  })),
  connectByaan: manage.input(z.object({tenantDomain:z.string().trim().min(3).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,'نطاق غير صالح')}).strict()).mutation(async ({ctx,input}) => {
    const existing = await guarded(() => getAllConnectedPlatforms(ctx.merchantId));
    if (existing.some(p => p.platform !== 'byaan')) throw new TRPCError({code:'CONFLICT',message:'افصل المنصة الحالية قبل ربط بيان.'});
    return guarded(async () => {
      const {createByaanConnection} = await import('./integrations/byaan');
      const connection = await createByaanConnection(ctx.merchantId,input.tenantDomain);
      const connected = Boolean(connection?.is_active && connection?.verified_at);
      return {success:connected,pendingVerification:!connected,tenantDomain:input.tenantDomain};
    });
  }),
  testByaanConnection: manage.mutation(({ctx}) => guarded(async () => {
    const snapshot = await readPlatformWorkspace(ctx.user.id,ctx.merchantId);
    const connection = snapshot.platforms.find(p => p.platform === 'byaan')!;
    if (!connection.present || connection.state==='disabled') return {success:false,message:'لا يوجد ربط مع بيان لهذا الحساب',status:'not_connected' as const};
    if (connection.state==='pending_verification' || connection.state==='unknown') return {success:false,message:'النطاق مسجل لكنه غير موثق. يجب إثبات ملكية نطاق بيان.',status:'pending_verification' as const};
    const {getByaanHealth} = await import('./integrations/byaan');
    const health = await getByaanHealth(ctx.merchantId);
    return {success:health.success,message:health.success?'تم التحقق من اتصال بيان الموقّع':'تعذر التحقق من واجهة بيان الموقّعة',status:health.success?'active' as const:'error' as const,tenantDomain:connection.storeUrl ? new URL(connection.storeUrl).hostname : null,capabilities:health.capabilities,stats:{syncStatus:connection.state,lastSyncAt:connection.lastSyncAt}};
  })),
});
export type IntegrationsRouter = typeof integrationsRouter;
