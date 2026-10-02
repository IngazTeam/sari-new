import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { getDb, getSallaConnectionByMerchantId } from './db';
import { readSallaDashboardLogs } from './integrations/salla-dashboard-read';
import { registerSallaConnection,disconnectSallaConnection,SallaConnectionFault } from './integrations/salla-connection';
import { sallaRegisterInput,sallaDisconnectInput,sallaSyncInput } from '../shared/salla-connection';
import { sallaSyncReview } from './integrations/salla-sync-review';
import { safePlatformUrl } from '../shared/platform-workspace';
import { sallaLogsInput } from '../shared/salla-workspace';
import { readSallaWorkspace, readSallaLogsWorkspace } from './integrations/salla-workspace';

class DashboardFault extends Error { constructor(readonly code: 'BAD_REQUEST'|'CONFLICT'|'NOT_FOUND', message: string) { super(message); } }
async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try { if (!await getDb()) throw Error('Source unavailable'); return await read(); }
  catch (error) { if(error instanceof SallaConnectionFault){const code=error.reason==='forbidden'?'FORBIDDEN':error.reason==='credentials'?'BAD_REQUEST':error.reason==='missing'?'NOT_FOUND':error.reason==='unavailable'?'INTERNAL_SERVER_ERROR':'CONFLICT';throw new TRPCError({code,message:error.message});} if (error instanceof DashboardFault) throw new TRPCError({ code: error.code, message: error.message }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تأكيد بيانات سلة. حدّث حالة الربط قبل إعادة المحاولة.' }); }
}
const access = permissionProcedure('integrations.manage');
export const sallaDashboardProcedures = {
  workspace: access.query(({ ctx }) => guarded(() => readSallaWorkspace(ctx.user.id,ctx.merchantId))),
  logsWorkspace: access.input(sallaLogsInput).query(({ ctx,input }) => guarded(() => readSallaLogsWorkspace(ctx.user.id,ctx.merchantId,input))),
  getConnection: access.query(({ ctx }) => guarded(async () => {const value=await readSallaWorkspace(ctx.user.id,ctx.merchantId);return {connected:value.present,revision:value.revision,storeUrl:value.storeUrl??undefined,syncStatus:value.state==='configured'?'active':value.state,lastSyncAt:value.lastSyncAt,webhookHealth:value.webhooks};})),
  getSyncLogs: access.query(({ ctx }) => guarded(() => readSallaDashboardLogs(ctx.merchantId))),
  registerConnection: access.input(sallaRegisterInput).mutation(({ctx,input})=>guarded(()=>registerSallaConnection(ctx.user.id,ctx.merchantId,input))),
  connect: access.input(sallaRegisterInput.extend({storeUrl:z.string().trim().max(2048).url().refine(value=>!!safePlatformUrl(value),'Invalid store URL')}).strict()).mutation(({ctx,input})=>guarded(async()=>{
    const receipt=await registerSallaConnection(ctx.user.id,ctx.merchantId,{revision:input.revision,accessToken:input.accessToken});
    const { SallaIntegration }=await import('./integrations/salla');
    void new SallaIntegration(ctx.merchantId,input.accessToken,sallaSyncReview(ctx.user.id,ctx.merchantId,receipt.revision)).fullSync().catch(()=>console.error('[Salla] Initial catalog sync could not be confirmed'));
    return {success:true,message:'حُفظ الربط وبدأ طلب المزامنة. راجع السجل لمعرفة نتيجته.'};
  })),
  disconnect: access.input(sallaDisconnectInput).mutation(({ctx,input})=>guarded(async()=>({...await disconnectSallaConnection(ctx.user.id,ctx.merchantId,input),success:true,message:'تم فصل المتجر بنجاح'}))),
  syncNow: access.input(sallaSyncInput).mutation(({ ctx,input }) => guarded(async () => {
    const connection = await getSallaConnectionByMerchantId(ctx.merchantId); if (!connection) throw new DashboardFault('NOT_FOUND','المتجر غير مربوط');
    const { SallaIntegration } = await import('./integrations/salla'), salla = new SallaIntegration(ctx.merchantId,connection.accessToken,sallaSyncReview(ctx.user.id,ctx.merchantId,input.revision));
    if (input.syncType === 'full') { const result = await salla.fullSync(); if (!result.success) throw Error('Sync not confirmed'); return { success: true, message: `تمت مزامنة ${result.synced} منتج بنجاح` }; }
    const result = await salla.syncStock(); if (!result.success) throw Error('Sync not confirmed'); return { success: true, message: `تم تحديث ${result.updated} منتج بنجاح` };
  })),
};
