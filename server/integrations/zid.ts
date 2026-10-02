import { z } from 'zod';
import { permissionProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { safePlatformUrl } from '../../shared/platform-workspace';
import { zidLogsInput } from '../../shared/zid-workspace';
import { readZidWorkspace, readZidLogsWorkspace } from './zid-workspace';
import { zidSettingsInput, zidReviewedSensitiveInput, zidOAuthBeginInput, zidConnectionRevision } from '../../shared/zid-connection';
import { saveZidWorkspaceSettings, disconnectReviewedZid, rotateReviewedZidWebhook, ZidConnectionFault } from './zid-connection';
import { resolveMerchantAccess } from '../accounts/merchant-access';
import { hasPermission } from '../_core/permissions';
import { rotateZidWebhookCredentials } from '../webhooks/zid-security';
import {
  beginZidOAuth,
  consumeZidOAuthState,
  exchangeZidAuthorizationCode,
  assertZidOAuthClaim,
  registerZidOAuthConnection,
  ZidOAuthError,
} from './zid-oauth';
import {
  getCustomerCountByMerchant,
  getIntegrationByType,
  getDb,
  getOrderCountByMerchant,
  getProductCountByMerchant,
  updateIntegrationSettings,
  updateProductInventoryFromZid,
  upsertOrderFromZid,
  upsertProductFromZid,
} from '../db';
import {
  createZidSyncLog,
  deleteAllZidConnections,
  getZidSyncLogs,
} from '../db_zid';
import {runReviewedZidSync} from './zid-reviewed-sync';
import { assertRecentReauthentication, ReauthenticationError } from '../security/reauthentication';
import {
  fetchZidStoreIdentity,
  ZidProductSyncError,
} from './zid-product-sync';
import { parseZidSettings } from './zid-settings';
import { requireZidOrderStoreId } from './zid-commerce-normalization';
import { requireZidProductStore } from './zid-product-normalization';
import {
  acknowledgeZidOrderNotificationIncidents,
  getZidOrderNotificationHealth,
} from './zid-order-notification-outbox';
const sensitiveActionInput = z.object({
  password: z.string().min(8).max(128).optional(),
}).strict().optional();
const zidSyncInput = z.object({
  resource: z.enum(['all', 'products', 'orders', 'customers']).default('all'),
  revision: zidConnectionRevision.optional(),
}).strict().optional();

async function requireZidReauthentication(input: {
  userId: number;
  merchantId: number;
  sessionId: string | undefined;
  password?: string;
  ipAddress: string;
}): Promise<void> {
  if (!input.sessionId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'تعذر تأكيد الهوية' });
  try {
    await assertRecentReauthentication({
      userId: input.userId,
      sessionId: input.sessionId,
      password: input.password,
      ipAddress: input.ipAddress,
    });
  } catch (error) {
    if (error instanceof ReauthenticationError && error.code === 'rate_limited') {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'محاولات كثيرة؛ حاول لاحقًا' });
    }
    if (error instanceof ReauthenticationError) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'تعذر تأكيد الهوية' });
    }
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تأكيد الهوية' });
  }
  // Password proof can wait. Recheck the same selected membership afterwards.
  const access = await resolveMerchantAccess(input.userId,input.merchantId);
  if (!access || access.merchantId !== input.merchantId || !hasPermission(access.role,'integrations.manage')) {
    throw new TRPCError({code:'FORBIDDEN',message:'لم تعد لديك صلاحية إدارة تكامل زد لهذا المتجر'});
  }
}

function requestIp(ctx: { req: { ip?: string; socket?: { remoteAddress?: string } } }): string {
  return String(ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown').slice(0, 45);
}

function mysqlTimestamp(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function recordCompletedZidSync(
  merchantId: number,
  syncType: 'products' | 'orders' | 'customers' | 'inventory',
  items = 1,
): Promise<void> {
  const now = mysqlTimestamp();
  await createZidSyncLog({
    merchantId,
    syncType,
    status: 'completed',
    totalItems: items,
    processedItems: items,
    successCount: items,
    failedCount: 0,
    startedAt: now,
    completedAt: now,
  }).catch(() => {
    console.warn('[Zid] Unable to persist completed sync log');
  });
}

// Resolve the selected tenant and integration permission for every dashboard call.
// Raw storage/provider failures must not become merchant-facing messages.
const zidDashboardProcedure=permissionProcedure('integrations.manage').use(async({next})=>{
  const unavailable=()=>new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'تعذر تأكيد بيانات زد. حدّث الصفحة وحاول مجددًا.'});
  try{if(!await getDb())throw unavailable();}catch{throw unavailable();}
  const result=await next();if(!result.ok&&result.error.code==='INTERNAL_SERVER_ERROR')throw unavailable();return result;
});

function connectionError(error:ZidConnectionFault){const code=error.reason==='forbidden'?'FORBIDDEN':error.reason==='missing'?'NOT_FOUND':error.reason==='unavailable'?'INTERNAL_SERVER_ERROR':error.reason==='changed'||error.reason==='conflict'?'CONFLICT':'PRECONDITION_FAILED';return new TRPCError({code,message:error.message});}
async function reviewedWrite<T>(work:()=>Promise<T>){
  try{return await work();}catch(error){if(error instanceof ZidConnectionFault)throw connectionError(error);throw error;}
}

// Zid Integration Router
export const zidRouter = router({
  workspace: zidDashboardProcedure.query(({ctx})=>readZidWorkspace(ctx.user.id,ctx.merchantId)),
  logsWorkspace: zidDashboardProcedure.input(zidLogsInput).query(({ctx,input})=>readZidLogsWorkspace(ctx.user.id,ctx.merchantId,input)),
  saveWorkspaceSettings:zidDashboardProcedure.input(zidSettingsInput).mutation(({ctx,input})=>reviewedWrite(()=>saveZidWorkspaceSettings(ctx.user.id,ctx.merchantId,input))),
  disconnectWorkspace:zidDashboardProcedure.input(zidReviewedSensitiveInput).mutation(async({ctx,input})=>{
    await requireZidReauthentication({userId:ctx.user.id,merchantId:ctx.merchantId,sessionId:ctx.session?.sessionId,password:input.password,ipAddress:requestIp(ctx)});
    return reviewedWrite(()=>disconnectReviewedZid(ctx.user.id,ctx.merchantId,input.revision));
  }),
  rotateWorkspaceWebhook:zidDashboardProcedure.input(zidReviewedSensitiveInput).mutation(async({ctx,input})=>{
    await requireZidReauthentication({userId:ctx.user.id,merchantId:ctx.merchantId,sessionId:ctx.session?.sessionId,password:input.password,ipAddress:requestIp(ctx)});
    return reviewedWrite(()=>rotateReviewedZidWebhook(ctx.user.id,ctx.merchantId,input.revision));
  }),
  // Get connection status
  getConnection: zidDashboardProcedure
    .query(async ({ ctx }) => {
      const merchant = {id:ctx.merchantId};
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration) {
        return { connected: false };
      }

      const settings = parseZidSettings(integration.settings);
      return {
        connected: integration.isActive,
        storeName: integration.storeName,
        storeUrl: safePlatformUrl(integration.storeUrl),
        lastSync: integration.lastSyncAt,
        webhookEndpointPath: integration.webhookEndpointId
          ? `/api/webhooks/zid/${integration.webhookEndpointId}`
          : null,
        settings: {
          autoSync: settings.autoSync,
          syncProducts: settings.syncProducts,
          syncOrders: settings.syncOrders,
          syncCustomers: settings.syncCustomers,
          notifyMerchantOrders: settings.notifyMerchantOrders,
        },
      };
    }),

  getNotificationHealth: zidDashboardProcedure
    .query(async ({ ctx }) => {
      const merchant = {id:ctx.merchantId};
      return getZidOrderNotificationHealth(merchant.id);
    }),

  acknowledgeNotificationIncidents: zidDashboardProcedure
    .mutation(async ({ ctx }) => {
      const merchant = {id:ctx.merchantId};
      return acknowledgeZidOrderNotificationIncidents(merchant.id);
    }),

  beginOAuth: zidDashboardProcedure
    .input(zidOAuthBeginInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        merchantId: ctx.merchantId,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = {id:ctx.merchantId};
      if (!ctx.session?.sessionId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session unavailable' });
      try {
        return await beginZidOAuth({
          ...(input?.revision?{revision:input.revision}:{}),
          merchantId: merchant.id,
          userId: ctx.user.id,
          sessionId: ctx.session.sessionId,
        });
      } catch (error) {
        if(error instanceof ZidConnectionFault)throw connectionError(error);
        if (error instanceof ZidOAuthError && error.code === 'configuration') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تكامل زد غير مهيأ على الخادم' });
        }
        if (error instanceof ZidOAuthError && error.code === 'rate_limited') {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'انتظر قليلًا قبل إعادة محاولة الربط' });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر بدء ربط زد' });
      }
    }),

  // OAuth callback consumes a session-bound, one-time state before the server
  // exchanges the code with its own confidential-client credentials.
  handleOAuthCallback: zidDashboardProcedure
    .input(z.object({
      code: z.string().min(1).max(4096),
      state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = {id:ctx.merchantId};
      if (!ctx.session?.sessionId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session unavailable' });

      try {
        const claim=await consumeZidOAuthState({
          merchantId: merchant.id,
          userId: ctx.user.id,
          sessionId: ctx.session.sessionId,
          state: input.state,
        });
        const tokens = await exchangeZidAuthorizationCode(input.code);
        await assertZidOAuthClaim(ctx.user.id,merchant.id,claim);

        // Verify both tokens and resolve the Store-Id required by Zid's current
        // products API from the authoritative store endpoint.
        const store = await fetchZidStoreIdentity({
          credentials: {
            authorizationToken: tokens.authorizationToken,
            managerToken: tokens.managerToken,
          },
        });

        const receipt=await registerZidOAuthConnection(ctx.user.id,merchant.id,claim,tokens,store);

        return { ...receipt, success: true, message: 'تم ربط متجر زد بنجاح عبر OAuth' };
      } catch (error) {
        if(error instanceof ZidConnectionFault)throw connectionError(error);
        if (error instanceof ZidOAuthError && error.code === 'invalid_state') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'انتهت أو استُخدمت محاولة الربط؛ ابدأ من جديد' });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'فشل ربط متجر زد عبر OAuth؛ ابدأ محاولة جديدة',
        });
      }
    }),

  // Disconnect from Zid store
  disconnect: zidDashboardProcedure
    .input(sensitiveActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        merchantId: ctx.merchantId,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = {id:ctx.merchantId};
      await deleteAllZidConnections(merchant.id);
      return { success: true, message: 'تم فصل متجر زد' };
    }),

  // Manual sync retains its legacy response shape while enforcing continued authority.
  syncNow: zidDashboardProcedure
    .input(zidSyncInput)
    .mutation(async ({ctx,input})=>{
      try{return await reviewedWrite(()=>runReviewedZidSync(ctx.user.id,ctx.merchantId,{resource:input?.resource??'all',revision:input?.revision}));}
      catch(error){if(error instanceof TRPCError)throw error;if(error instanceof ZidProductSyncError&&error.code==='busy')throw new TRPCError({code:'CONFLICT',message:'توجد مزامنة قيد التنفيذ بالفعل'});throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message: 'فشلت مزامنة متجر زد'});}
    }),

  // Update settings
  updateSettings: zidDashboardProcedure
    .input(z.object({
      autoSync: z.boolean(),
      syncProducts: z.boolean(),
      syncOrders: z.boolean(),
      syncCustomers: z.boolean(),
      notifyMerchantOrders: z.boolean(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = {id:ctx.merchantId};
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      await updateIntegrationSettings(integration.id, {
        autoSync: input.autoSync,
        syncProducts: input.syncProducts,
        syncOrders: input.syncOrders,
        syncCustomers: input.syncCustomers,
        notifyMerchantOrders: input.notifyMerchantOrders,
      });

      return { success: true };
    }),

  rotateWebhookCredentials: zidDashboardProcedure
    .input(sensitiveActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        merchantId: ctx.merchantId,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = {id:ctx.merchantId};
      try {
        return await rotateZidWebhookCredentials(merchant.id);
      } catch (error: any) {
        if (error?.message === 'ZID_INTEGRATION_NOT_ACTIVE') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'اربط متجر زد النشط أولاً' });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر إنشاء بيانات Webhook' });
      }
    }),

  // Get sync logs
  getSyncLogs: zidDashboardProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).optional().default(10),
    }).strict())
    .query(async ({ ctx, input }) => {
      const merchant = {id:ctx.merchantId};
      const logs = await getZidSyncLogs(merchant.id, undefined, input.limit);
      return logs.map(log => ({
        id: log.id,
        type: log.syncType,
        syncType: log.syncType,
        status: log.status,
        message: log.status === 'completed'
          ? `تمت معالجة ${log.successCount} عنصر`
          : log.status === 'failed'
            ? 'تعذر إكمال المزامنة'
            : 'المزامنة قيد التنفيذ',
        createdAt: log.startedAt || log.completedAt,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
        successCount: log.successCount,
        failedCount: log.failedCount,
      }));
    }),

  // Get sync stats
  getSyncStats: zidDashboardProcedure
    .query(async ({ ctx }) => {
      const merchant = {id:ctx.merchantId};
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration) {
        return null;
      }

      const products = await getProductCountByMerchant(merchant.id);
      const orders = await getOrderCountByMerchant(merchant.id);
      const customers = await getCustomerCountByMerchant(merchant.id);
      const recentSyncLogs = await getZidSyncLogs(merchant.id, undefined, 1000);

      return {
        products,
        orders,
        customers,
        totalSyncs: recentSyncLogs.length,
        successfulSyncs: recentSyncLogs.filter(log => log.status === 'completed').length,
        failedSyncs: recentSyncLogs.filter(log => log.status === 'failed').length,
        lastSync: integration.lastSyncAt
          ? new Date(integration.lastSyncAt).toLocaleDateString('ar-SA')
          : null,
      };
    }),

});


// Webhook handler for Zid events
export async function handleZidWebhook(merchantId: number, event: string, payload: any) {
  const integration = await getIntegrationByType(merchantId, 'zid');
  if (!integration || !integration.isActive) {
    return;
  }

  const settings = parseZidSettings(integration.settings);
  if (!settings.valid || !settings.autoSync) return;
  const normalizedEvent: Record<string, string> = {
    'order.create': 'order.created',
    'order.update': 'order.updated',
    'order.status.update': 'order.updated',
    'order.payment_status.update': 'order.updated',
    'product.create': 'product.created',
    'product.update': 'product.updated',
    'product.publish': 'product.updated',
    'inventory.update': 'inventory.updated',
  };

  switch (normalizedEvent[event] || event) {
    case 'order.created':
    case 'order.updated':
      if (settings.syncOrders) {
        requireZidOrderStoreId(payload?.store_id, requireZidOrderStoreId(settings.storeId));
        await upsertOrderFromZid(merchantId, payload);
        await recordCompletedZidSync(merchantId, 'orders');
      }
      break;

    case 'product.created':
    case 'product.updated':
      if (settings.syncProducts) {
        const storeId=requireZidProductStore(settings.storeId);
        await upsertProductFromZid(merchantId, {...payload,store_id:requireZidProductStore(payload?.store_id??storeId,storeId)});
        await recordCompletedZidSync(merchantId, 'products');
      }
      break;

    case 'inventory.updated':
      if (settings.syncProducts) {
        const storeId=requireZidProductStore(settings.storeId);
        await updateProductInventoryFromZid(merchantId, {...payload,store_id:requireZidProductStore(payload?.store_id??storeId,storeId)});
        await recordCompletedZidSync(merchantId, 'inventory');
      }
      break;

    default:
      return;
  }
}
