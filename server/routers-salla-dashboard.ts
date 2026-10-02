import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { getDb } from './db';
import { readSallaDashboardLogs } from './integrations/salla-dashboard-read';
import { registerSallaConnection,disconnectSallaConnection,SallaConnectionFault } from './integrations/salla-connection';
import { sallaRegisterInput,sallaDisconnectInput,sallaSyncInput } from '../shared/salla-connection';
import {requestReviewedSallaSync,readSallaSyncRequest,readLatestSallaSyncRequest,SallaSyncRequestFault} from './integrations/salla-sync-request';
import {sallaSyncRequest,sallaSyncLookup} from '../shared/salla-sync-request';
import { safePlatformUrl } from '../shared/platform-workspace';
import { sallaLogsInput } from '../shared/salla-workspace';
import { readSallaWorkspace, readSallaLogsWorkspace } from './integrations/salla-workspace';

class DashboardFault extends Error { constructor(readonly code: 'BAD_REQUEST'|'CONFLICT'|'NOT_FOUND'|'PRECONDITION_FAILED', message: string) { super(message); } }
async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try { if (!await getDb()) throw Error('Source unavailable'); return await read(); }
  catch (error) { if(error instanceof SallaSyncRequestFault){throw new TRPCError({code:error.reason==='unavailable'?'INTERNAL_SERVER_ERROR':error.reason==='missing'?'NOT_FOUND':error.reason==='rate_limited'?'TOO_MANY_REQUESTS':'CONFLICT',message:error.message});} if(error instanceof SallaConnectionFault){const code=error.reason==='forbidden'?'FORBIDDEN':error.reason==='credentials'?'BAD_REQUEST':error.reason==='missing'?'NOT_FOUND':error.reason==='unavailable'?'INTERNAL_SERVER_ERROR':'CONFLICT';throw new TRPCError({code,message:error.message});} if (error instanceof DashboardFault) throw new TRPCError({ code: error.code, message: error.message }); throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تأكيد بيانات سلة. حدّث حالة الربط قبل إعادة المحاولة.' }); }
}
const access = permissionProcedure('integrations.manage');
// Retain a safe response for stale tabs. These unused legacy mutations must never
// dispatch outside durable request admission or silently create a fresh request ID.
const retiredMutation=()=>guarded(async()=>{throw new DashboardFault('PRECONDITION_FAILED','تم تحديث إدارة سلة. أعد تحميل الصفحة للربط أو بدء مزامنة قابلة للاستعادة.');});
export const sallaDashboardProcedures = {
  requestSync:access.input(sallaSyncRequest).mutation(({ctx,input})=>guarded(()=>requestReviewedSallaSync(ctx.user.id,ctx.merchantId,input))),
  syncRequest:access.input(sallaSyncLookup).query(({ctx,input})=>guarded(()=>readSallaSyncRequest(ctx.user.id,ctx.merchantId,input))),
  latestSyncRequest:access.query(({ctx})=>guarded(()=>readLatestSallaSyncRequest(ctx.user.id,ctx.merchantId))),
  workspace: access.query(({ ctx }) => guarded(() => readSallaWorkspace(ctx.user.id,ctx.merchantId))),
  logsWorkspace: access.input(sallaLogsInput).query(({ ctx,input }) => guarded(() => readSallaLogsWorkspace(ctx.user.id,ctx.merchantId,input))),
  getConnection: access.query(({ ctx }) => guarded(async () => {const value=await readSallaWorkspace(ctx.user.id,ctx.merchantId);return {connected:value.present,revision:value.revision,storeUrl:value.storeUrl??undefined,syncStatus:value.state==='configured'?'active':value.state,lastSyncAt:value.lastSyncAt,webhookHealth:value.webhooks};})),
  getSyncLogs: access.query(({ ctx }) => guarded(() => readSallaDashboardLogs(ctx.merchantId))),
  registerConnection: access.input(sallaRegisterInput).mutation(({ctx,input})=>guarded(()=>registerSallaConnection(ctx.user.id,ctx.merchantId,input))),
  connect: access.input(sallaRegisterInput.extend({storeUrl:z.string().trim().max(2048).url().refine(value=>!!safePlatformUrl(value),'Invalid store URL')}).strict()).mutation(retiredMutation),
  disconnect: access.input(sallaDisconnectInput).mutation(({ctx,input})=>guarded(async()=>({...await disconnectSallaConnection(ctx.user.id,ctx.merchantId,input),success:true,message:'تم فصل المتجر بنجاح'}))),
  syncNow: access.input(sallaSyncInput).mutation(retiredMutation),
};
