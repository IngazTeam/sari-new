import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { decryptSecret, encryptSecret } from '../security/secrets';
import { rotateZidWebhookCredentials } from '../webhooks/zid-security';
import {
  beginZidOAuth,
  consumeZidOAuthState,
  exchangeZidAuthorizationCode,
  ZidOAuthError,
} from './zid-oauth';
import {
  createIntegration,
  createSyncLog,
  deleteIntegrationByType,
  getCustomerCountByMerchant,
  getIntegrationByType,
  getMerchantByUserId,
  getOrderCountByMerchant,
  getProductCountByMerchant,
  getSyncLogsByMerchant,
  updateIntegrationLastSync,
  updateIntegrationSettings,
  updateProductInventoryFromZid,
  upsertOrderFromZid,
  upsertProductFromZid,
} from '../db';

// Zid API Base URL
const ZID_API_BASE = 'https://api.zid.sa/v1';

// Helper function to make Zid API requests
// Zid v1 API requires both Authorization (OAuth) and X-Manager-Token headers
async function zidApiRequest(endpoint: string, accessToken: string, managerToken?: string, options: RequestInit = {}) {
  const response = await fetch(`${ZID_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...(managerToken ? { 'X-Manager-Token': managerToken } : {}),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`ZID_API_REQUEST_FAILED_${response.status}`);
  }

  return response.json();
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

      const settings = integration.settings ? JSON.parse(integration.settings) : {};
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

  // Connect to Zid store
  connect: protectedProcedure
    .input(z.object({
      storeUrl: z.string().url(),
      accessToken: z.string(),
      managerToken: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      try {
        // Verify the access token by fetching store manager profile
        // Zid v1 API: GET /managers/account/profile
        const profileResponse = await zidApiRequest(
          '/managers/account/profile',
          input.accessToken,
          input.managerToken || input.accessToken
        );

        // Extract store name from profile response
        const storeName = profileResponse?.user?.store?.name
          || profileResponse?.store?.name
          || profileResponse?.name
          || 'متجر زد';

        // Save integration — store both tokens
        await createIntegration({
          merchantId: merchant.id,
          type: 'zid',
          storeName,
          storeUrl: input.storeUrl,
          accessToken: input.accessToken,
          isActive: true,
          settings: JSON.stringify({
            autoSync: true,
            syncProducts: true,
            syncOrders: true,
            syncCustomers: true,
            managerToken: encryptSecret(input.managerToken || input.accessToken),
          }),
        });

        return { success: true, message: 'تم ربط متجر زد بنجاح' };
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message || 'فشل الاتصال بمتجر زد',
        });
      }
    }),

  beginOAuth: protectedProcedure
    .mutation(async ({ ctx }) => {
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

        // Verify the token by fetching store profile
        const profileResponse = await zidApiRequest(
          '/managers/account/profile',
          tokens.authorizationToken,
          tokens.managerToken,
        );

        const storeName = profileResponse?.user?.store?.name
          || profileResponse?.store?.name
          || profileResponse?.name
          || 'متجر زد';

        const storeUrl = profileResponse?.user?.store?.url
          || profileResponse?.store?.url
          || `https://${storeName}.zid.store`;

        // Save integration
        await createIntegration({
          merchantId: merchant.id,
          type: 'zid',
          storeName,
          storeUrl,
          accessToken: tokens.authorizationToken,
          refreshToken: tokens.refreshToken,
          isActive: true,
          settings: JSON.stringify({
            autoSync: true,
            syncProducts: true,
            syncOrders: true,
            syncCustomers: true,
            managerToken: encryptSecret(tokens.managerToken),
            tokenExpiresAt: tokens.expiresIn
              ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
              : null,
          }),
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
    .mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      await deleteIntegrationByType(merchant.id, 'zid');
      return { success: true, message: 'تم فصل متجر زد' };
    }),

  // Sync now
  syncNow: protectedProcedure
    .mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      const integration = await getIntegrationByType(merchant.id, 'zid');

      if (!integration || !integration.accessToken) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      try {
        // Sync products — Zid v1 endpoint: /managers/store/products
        const settings = integration.settings ? JSON.parse(integration.settings) : {};
        const managerToken = decryptSecret(settings.managerToken) || integration.accessToken;
        const products = await zidApiRequest('/managers/store/products', integration.accessToken, managerToken);
        let syncedProducts = 0;

        if (products.data) {
          for (const product of products.data) {
            await upsertProductFromZid(merchant.id, product);
            syncedProducts++;
          }
        }

        // Update last sync time
        await updateIntegrationLastSync(integration.id);

        // Log sync
        await createSyncLog(merchant.id, 'zid_sync' as any, 'success');

        return {
          success: true,
          message: `تمت مزامنة ${syncedProducts} منتج بنجاح`
        };
      } catch (error: any) {
        // @ts-ignore
        await createSyncLog(merchant.id, 'zid_sync' as any, 'error');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'فشلت المزامنة',
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
    .mutation(async ({ ctx }) => {
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
      limit: z.number().optional().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await getSyncLogsByMerchant(merchant.id, 'zid', input.limit);
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

      return {
        products,
        orders,
        customers,
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

  const settings = integration.settings ? JSON.parse(integration.settings) : {};
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
        await createSyncLog(merchantId, 'zid_webhook' as any, 'success');
      }
      break;

    case 'product.created':
    case 'product.updated':
      if (settings.syncProducts) {
        await upsertProductFromZid(merchantId, payload);
        await createSyncLog(merchantId, 'zid_webhook' as any, 'success');
      }
      break;

    case 'inventory.updated':
      if (settings.syncProducts) {
        await updateProductInventoryFromZid(merchantId, payload);
        await createSyncLog(merchantId, 'zid_webhook' as any, 'success');
      }
      break;

    default:
      return;
  }
}
