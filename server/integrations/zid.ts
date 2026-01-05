import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import * as db from '../db';

// Zid API Base URL
const ZID_API_BASE = 'https://api.zid.sa/v1';

// Helper function to make Zid API requests
async function zidApiRequest(endpoint: string, accessToken: string, options: RequestInit = {}) {
  const response = await fetch(`${ZID_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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
      const integration = await db.getIntegrationByType(input.merchantId, 'zid');
      
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
    }))
    .mutation(async ({ input }) => {
      try {
        // Verify the access token by fetching store info
        const storeInfo = await zidApiRequest('/store', input.accessToken);

        // Save integration
        await db.createIntegration({
          merchantId: input.merchantId,
          type: 'zid',
          storeName: storeInfo.name || 'متجر زد',
          storeUrl: input.storeUrl,
          accessToken: input.accessToken,
          isActive: true,
          settings: JSON.stringify({
            autoSync: true,
            syncProducts: true,
            syncOrders: true,
            syncCustomers: true,
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
      await db.deleteIntegrationByType(input.merchantId, 'zid');
      return { success: true, message: 'تم فصل متجر زد' };
    }),

  // Sync now
  syncNow: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .mutation(async ({ input }) => {
      const integration = await db.getIntegrationByType(input.merchantId, 'zid');
      
      if (!integration || !integration.accessToken) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      try {
        // Sync products
        const products = await zidApiRequest('/products', integration.accessToken);
        let syncedProducts = 0;
        
        if (products.data) {
          for (const product of products.data) {
            await db.upsertProductFromZid(input.merchantId, product);
            syncedProducts++;
          }
        }

        // Update last sync time
        await db.updateIntegrationLastSync(integration.id);

        // Log sync
        await db.createSyncLog({
          merchantId: input.merchantId,
          type: 'zid_sync',
          status: 'success',
          message: `تمت مزامنة ${syncedProducts} منتج`,
        });

        return { 
          success: true, 
          message: `تمت مزامنة ${syncedProducts} منتج بنجاح` 
        };
      } catch (error: any) {
        await db.createSyncLog({
          merchantId: input.merchantId,
          type: 'zid_sync',
          status: 'error',
          message: error.message,
        });

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
      const integration = await db.getIntegrationByType(input.merchantId, 'zid');
      
      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على تكامل زد',
        });
      }

      await db.updateIntegrationSettings(integration.id, {
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
      return await db.getSyncLogsByMerchant(input.merchantId, 'zid', input.limit);
    }),

  // Get sync stats
  getSyncStats: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const integration = await db.getIntegrationByType(input.merchantId, 'zid');
      
      if (!integration) {
        return null;
      }

      const products = await db.getProductCountByMerchant(input.merchantId);
      const orders = await db.getOrderCountByMerchant(input.merchantId);
      const customers = await db.getCustomerCountByMerchant(input.merchantId);

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

  const integration = await db.getIntegrationByType(merchantId, 'zid');
  if (!integration || !integration.isActive) {
    console.log('[Zid Webhook] Integration not found or inactive');
    return;
  }

  const settings = integration.settings ? JSON.parse(integration.settings) : {};

  switch (event) {
    case 'order.created':
    case 'order.updated':
      if (settings.syncOrders) {
        await db.upsertOrderFromZid(merchantId, payload);
        await db.createSyncLog({
          merchantId,
          type: 'zid_webhook',
          status: 'success',
          message: `تم ${event === 'order.created' ? 'إنشاء' : 'تحديث'} طلب #${payload.id}`,
        });
      }
      break;

    case 'product.created':
    case 'product.updated':
      if (settings.syncProducts) {
        await db.upsertProductFromZid(merchantId, payload);
        await db.createSyncLog({
          merchantId,
          type: 'zid_webhook',
          status: 'success',
          message: `تم ${event === 'product.created' ? 'إضافة' : 'تحديث'} منتج: ${payload.name}`,
        });
      }
      break;

    case 'inventory.updated':
      if (settings.syncProducts) {
        await db.updateProductInventoryFromZid(merchantId, payload);
        await db.createSyncLog({
          merchantId,
          type: 'zid_webhook',
          status: 'success',
          message: `تم تحديث مخزون المنتج #${payload.product_id}`,
        });
      }
      break;

    default:
      console.log(`[Zid Webhook] Unknown event: ${event}`);
  }
}
