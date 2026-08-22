import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { encryptSecret } from '../security/secrets';
import { rotateZidWebhookCredentials } from '../webhooks/zid-security';
import {
  beginZidOAuth,
  consumeZidOAuthState,
  exchangeZidAuthorizationCode,
  ZidOAuthError,
} from './zid-oauth';
import {
  createIntegration,
  getCustomerCountByMerchant,
  getIntegrationByType,
  getMerchantByUserId,
  getOrderCountByMerchant,
  getProductCountByMerchant,
  updateIntegrationLastSync,
  updateIntegrationSettings,
  updateProductInventoryFromZid,
  upsertNormalizedProductsFromZid,
  upsertOrderFromZid,
  upsertProductFromZid,
} from '../db';
import {
  createZidSyncLog,
  deleteAllZidConnections,
  deleteZidSettings as deleteLegacyZidSettings,
  getZidSyncLogs,
  updateZidSyncLog,
} from '../db_zid';
import { getValidZidApiCredentials } from './zid-token-manager';
import { assertRecentReauthentication, ReauthenticationError } from '../security/reauthentication';
import { normalizeZidStoreId } from './zid-api';
import {
  fetchAllZidProducts,
  fetchZidStoreIdentity,
  ZidProductSyncError,
} from './zid-product-sync';
import { withZidSyncLock } from './zid-sync-lock';
const sensitiveActionInput = z.object({
  password: z.string().min(8).max(128).optional(),
}).optional();

async function requireZidReauthentication(input: {
  userId: number;
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
}

function requestIp(ctx: { req: { ip?: string; socket?: { remoteAddress?: string } } }): string {
  return String(ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown').slice(0, 45);
}

function parseZidSettings(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
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

// Zid Integration Router
export const zidRouter = router({
  // Get connection status
  getConnection: protectedProcedure
    .query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration) {
        return { connected: false };
      }

      const settings = parseZidSettings(integration.settings);
      return {
        connected: integration.isActive,
        storeName: integration.storeName,
        storeUrl: integration.storeUrl,
        lastSync: integration.lastSyncAt,
        webhookEndpointPath: integration.webhookEndpointId
          ? `/api/webhooks/zid/${integration.webhookEndpointId}`
          : null,
        settings: {
          autoSync: settings.autoSync !== false,
          syncProducts: settings.syncProducts !== false,
          syncOrders: settings.syncOrders !== false,
          syncCustomers: settings.syncCustomers !== false,
        },
      };
    }),

  beginOAuth: protectedProcedure
    .input(sensitiveActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      if (!ctx.session?.sessionId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session unavailable' });
      try {
        return await beginZidOAuth({
          merchantId: merchant.id,
          userId: ctx.user.id,
          sessionId: ctx.session.sessionId,
        });
      } catch (error) {
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
  handleOAuthCallback: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(4096),
      state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      if (!ctx.session?.sessionId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session unavailable' });

      try {
        await consumeZidOAuthState({
          merchantId: merchant.id,
          userId: ctx.user.id,
          sessionId: ctx.session.sessionId,
          state: input.state,
        });
        const tokens = await exchangeZidAuthorizationCode(input.code);

        // Verify both tokens and resolve the Store-Id required by Zid's current
        // products API from the authoritative store endpoint.
        const store = await fetchZidStoreIdentity({
          credentials: {
            authorizationToken: tokens.authorizationToken,
            managerToken: tokens.managerToken,
          },
        });

        // Save integration
        await createIntegration({
          merchantId: merchant.id,
          type: 'zid',
          storeName: store.storeName,
          storeUrl: store.storeUrl || undefined,
          accessToken: tokens.authorizationToken,
          refreshToken: tokens.refreshToken,
          isActive: true,
          settings: JSON.stringify({
            autoSync: true,
            syncProducts: true,
            syncOrders: true,
            syncCustomers: true,
            storeId: store.storeId,
            managerToken: encryptSecret(tokens.managerToken),
            tokenExpiresAt: tokens.expiresIn
              ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
              : null,
          }),
        });
        await deleteLegacyZidSettings(merchant.id).catch(() => {
          console.warn('[Zid] Legacy credential cleanup pending');
        });

        return { success: true, message: 'تم ربط متجر زد بنجاح عبر OAuth' };
      } catch (error) {
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
  disconnect: protectedProcedure
    .input(sensitiveActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      await deleteAllZidConnections(merchant.id);
      return { success: true, message: 'تم فصل متجر زد' };
    }),

  // Sync now
  syncNow: protectedProcedure
    .mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration || !integration.accessToken || integration.isActive !== 1) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      const settings = parseZidSettings(integration.settings);
      if (settings.syncProducts === false) {
        return { success: true, message: 'مزامنة المنتجات معطلة من الإعدادات' };
      }

      let syncLogId: number | null = null;
      try {
        return await withZidSyncLock(merchant.id, async () => {
          const currentIntegration = await getIntegrationByType(merchant.id, 'zid');
          if (!currentIntegration || currentIntegration.isActive !== 1) {
            throw new Error('ZID_NOT_CONNECTED');
          }
          const currentSettings = parseZidSettings(currentIntegration.settings);
          if (currentSettings.syncProducts === false) {
            return { success: true, message: 'مزامنة المنتجات معطلة من الإعدادات' };
          }
          const credentials = await getValidZidApiCredentials({ merchantId: merchant.id });
          const syncLog = await createZidSyncLog({
            merchantId: merchant.id,
            syncType: 'products',
            status: 'in_progress',
            totalItems: 0,
            processedItems: 0,
            successCount: 0,
            failedCount: 0,
            startedAt: mysqlTimestamp(),
          }).catch(() => null);
          syncLogId = syncLog?.id || null;
          let storeId = normalizeZidStoreId(currentSettings.storeId);
          if (!storeId) {
            const store = await fetchZidStoreIdentity({
              credentials: {
                authorizationToken: credentials.authorizationToken,
                managerToken: credentials.managerToken,
              },
            });
            storeId = store.storeId;
            await updateIntegrationSettings(currentIntegration.id, { storeId });
          }
          const products = await fetchAllZidProducts({
            credentials: {
              authorizationToken: credentials.authorizationToken,
              managerToken: credentials.managerToken,
            },
            storeId,
          });
          await upsertNormalizedProductsFromZid(merchant.id, products);
          await updateIntegrationLastSync(currentIntegration.id);
          if (syncLogId) {
            await updateZidSyncLog(syncLogId, {
              status: 'completed',
              totalItems: products.length,
              processedItems: products.length,
              successCount: products.length,
              failedCount: 0,
              completedAt: mysqlTimestamp(),
            }).catch(() => console.warn('[Zid] Unable to complete sync log'));
          }
          return {
            success: true,
            message: `تمت مزامنة ${products.length} منتج بنجاح`,
          };
        });
      } catch (error) {
        if (error instanceof ZidProductSyncError && error.code === 'busy') {
          throw new TRPCError({ code: 'CONFLICT', message: 'توجد مزامنة قيد التنفيذ بالفعل' });
        }
        if (syncLogId) {
          await updateZidSyncLog(syncLogId, {
            status: 'failed',
            failedCount: 1,
            errorMessage: 'ZID_PRODUCT_SYNC_FAILED',
            completedAt: mysqlTimestamp(),
          }).catch(() => console.warn('[Zid] Unable to fail sync log'));
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'فشلت مزامنة متجر زد',
        });
      }
    }),

  // Update settings
  updateSettings: protectedProcedure
    .input(z.object({
      autoSync: z.boolean(),
      syncProducts: z.boolean(),
      syncOrders: z.boolean(),
      syncCustomers: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
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
      });

      return { success: true };
    }),

  rotateWebhookCredentials: protectedProcedure
    .input(sensitiveActionInput)
    .mutation(async ({ ctx, input }) => {
      await requireZidReauthentication({
        userId: ctx.user.id,
        sessionId: ctx.session?.sessionId,
        password: input?.password,
        ipAddress: requestIp(ctx),
      });
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
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
  getSyncLogs: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).optional().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
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
  getSyncStats: protectedProcedure
    .query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
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
        await upsertOrderFromZid(merchantId, payload);
        await recordCompletedZidSync(merchantId, 'orders');
      }
      break;

    case 'product.created':
    case 'product.updated':
      if (settings.syncProducts) {
        await upsertProductFromZid(merchantId, payload);
        await recordCompletedZidSync(merchantId, 'products');
      }
      break;

    case 'inventory.updated':
      if (settings.syncProducts) {
        await updateProductInventoryFromZid(merchantId, payload);
        await recordCompletedZidSync(merchantId, 'inventory');
      }
      break;

    default:
      return;
  }
}
