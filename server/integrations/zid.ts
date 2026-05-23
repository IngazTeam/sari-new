import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import {
  createIntegration,
  createSyncLog,
  deleteIntegrationByType,
  getCustomerCountByMerchant,
  getIntegrationByType,
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
    const error = await response.text();
    throw new Error(`Zid API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Zid Integration Router
export const zidRouter = router({
  // Get connection status
  getConnection: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const integration = await getIntegrationByType(input.merchantId, 'zid');

      if (!integration) {
        return { connected: false };
      }

      return {
        connected: integration.isActive,
        storeName: integration.storeName,
        storeUrl: integration.storeUrl,
        lastSync: integration.lastSyncAt,
        settings: integration.settings ? JSON.parse(integration.settings) : null,
      };
    }),

  // Connect to Zid store
  connect: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      storeUrl: z.string().url(),
      accessToken: z.string(),
      managerToken: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
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
          merchantId: input.merchantId,
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
            managerToken: input.managerToken || input.accessToken,
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

  // Disconnect from Zid store
  disconnect: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteIntegrationByType(input.merchantId, 'zid');
      return { success: true, message: 'تم فصل متجر زد' };
    }),

  // Sync now
  syncNow: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .mutation(async ({ input }) => {
      const integration = await getIntegrationByType(input.merchantId, 'zid');

      if (!integration || !integration.accessToken) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      try {
        // Sync products — Zid v1 endpoint: /managers/store/products
        const settings = integration.settings ? JSON.parse(integration.settings) : {};
        const managerToken = settings.managerToken || integration.accessToken;
        const products = await zidApiRequest('/managers/store/products', integration.accessToken, managerToken);
        let syncedProducts = 0;

        if (products.data) {
          for (const product of products.data) {
            await upsertProductFromZid(input.merchantId, product);
            syncedProducts++;
          }
        }

        // Update last sync time
        await updateIntegrationLastSync(integration.id);

        // Log sync
        await createSyncLog(input.merchantId ?? 0, 'zid_sync' as any, 'success');

        return {
          success: true,
          message: `تمت مزامنة ${syncedProducts} منتج بنجاح`
        };
      } catch (error: any) {
        // @ts-ignore
        await createSyncLog(merchantId ?? (input as any).merchantId, 'zid_sync' as any, 'error');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'فشلت المزامنة',
        });
      }
    }),

  // Update settings
  updateSettings: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      autoSync: z.boolean(),
      syncProducts: z.boolean(),
      syncOrders: z.boolean(),
      syncCustomers: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const integration = await getIntegrationByType(input.merchantId, 'zid');

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

  // Get sync logs
  getSyncLogs: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      limit: z.number().optional().default(10),
    }))
    .query(async ({ input }) => {
      return await getSyncLogsByMerchant(input.merchantId, 'zid', input.limit);
    }),

  // Get sync stats
  getSyncStats: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const integration = await getIntegrationByType(input.merchantId, 'zid');

      if (!integration) {
        return null;
      }

      const products = await getProductCountByMerchant(input.merchantId);
      const orders = await getOrderCountByMerchant(input.merchantId);
      const customers = await getCustomerCountByMerchant(input.merchantId);

      return {
        products,
        orders,
        customers,
        lastSync: integration.lastSyncAt
          ? new Date(integration.lastSyncAt).toLocaleDateString('ar-SA')
          : null,
      };
    }),

  // Handle Zid webhook
  handleWebhook: publicProcedure
    .input(z.object({
      merchantId: z.number(),
      payload: z.any(),
      signature: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { processZidWebhook } = await import('../webhooks/zid-webhook');

      // Get Zid settings to retrieve webhook secret
      const dbZid = await import('../db_zid');
      const settings = await dbZid.getZidSettings(input.merchantId);

      const result = await processZidWebhook(
        input.payload,
        input.merchantId,
        input.signature,
        settings?.clientSecret || undefined
      );

      return result;
    }),
});


// Webhook handler for Zid events
export async function handleZidWebhook(merchantId: number, event: string, payload: any) {
  console.log(`[Zid Webhook] Merchant ${merchantId} - Event: ${event}`);

  const integration = await getIntegrationByType(merchantId, 'zid');
  if (!integration || !integration.isActive) {
    console.log('[Zid Webhook] Integration not found or inactive');
    return;
  }

  const settings = integration.settings ? JSON.parse(integration.settings) : {};

  switch (event) {
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
      console.log(`[Zid Webhook] Unknown event: ${event}`);
  }
}