/**
 * WooCommerce tRPC Router
 * 
 * Handles all WooCommerce integration operations
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { createWooCommerceClient, validateStoreUrl } from "./woocommerce";
import type { WooCommerceSettings } from "../drizzle/schema";

export const woocommerceRouter = router({
  // ==================== Settings ====================

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings(ctx.user.merchantId);
    
    // Don't expose sensitive keys to frontend
    if (settings) {
      return {
        ...settings,
        consumerKey: settings.consumerKey ? '***' + settings.consumerKey.slice(-4) : '',
        consumerSecret: settings.consumerSecret ? '***' + settings.consumerSecret.slice(-4) : '',
      };
    }
    
    return null;
  }),

  saveSettings: protectedProcedure
    .input(z.object({
      storeUrl: z.string().url(),
      consumerKey: z.string().min(10),
      consumerSecret: z.string().min(10),
      autoSyncProducts: z.boolean().optional(),
      autoSyncOrders: z.boolean().optional(),
      autoSyncCustomers: z.boolean().optional(),
      syncInterval: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate store URL
      if (!validateStoreUrl(input.storeUrl)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'رابط المتجر غير صحيح',
        });
      }

      // Check if settings exist
      const existingSettings = await db.getWooCommerceSettings(ctx.user.merchantId);

      if (existingSettings) {
        // Update existing settings
        await db.updateWooCommerceSettings(ctx.user.merchantId, {
          storeUrl: input.storeUrl,
          consumerKey: input.consumerKey,
          consumerSecret: input.consumerSecret,
          autoSyncProducts: input.autoSyncProducts ? 1 : 0,
          autoSyncOrders: input.autoSyncOrders ? 1 : 0,
          autoSyncCustomers: input.autoSyncCustomers ? 1 : 0,
          syncInterval: input.syncInterval,
          isActive: 1,
        });
      } else {
        // Create new settings
        await db.createWooCommerceSettings({
          merchantId: ctx.user.merchantId,
          storeUrl: input.storeUrl,
          consumerKey: input.consumerKey,
          consumerSecret: input.consumerSecret,
          autoSyncProducts: input.autoSyncProducts ? 1 : 0,
          autoSyncOrders: input.autoSyncOrders ? 1 : 0,
          autoSyncCustomers: input.autoSyncCustomers ? 1 : 0,
          syncInterval: input.syncInterval || 60,
          isActive: 1,
        });
      }

      return { success: true, message: 'تم حفظ الإعدادات بنجاح' };
    }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings(ctx.user.merchantId);

    if (!settings) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'لم يتم العثور على إعدادات WooCommerce',
      });
    }

    const client = createWooCommerceClient(settings);
    const result = await client.testConnection();

    if (result.success) {
      // Update connection status
      await db.updateWooCommerceConnectionStatus(ctx.user.merchantId, 'connected', result.storeInfo);
    } else {
      await db.updateWooCommerceConnectionStatus(ctx.user.merchantId, 'error');
    }

    return result;
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await db.deleteWooCommerceSettings(ctx.user.merchantId);
    await db.deleteWooCommerceProductsByMerchant(ctx.user.merchantId);
    await db.deleteWooCommerceOrdersByMerchant(ctx.user.merchantId);

    return { success: true, message: 'تم فصل الاتصال بنجاح' };
  }),

  // ==================== Products ====================

  getProducts: protectedProcedure
    .input(z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const page = input.page || 1;
      const limit = input.limit || 50;
      const offset = (page - 1) * limit;

      const products = await db.getWooCommerceProducts(ctx.user.merchantId, limit, offset);
      const stats = await db.getWooCommerceProductsStats(ctx.user.merchantId);

      return {
        products,
        stats,
        pagination: {
          page,
          limit,
          total: stats.total,
        },
      };
    }),

  searchProducts: protectedProcedure
    .input(z.object({
      search: z.string(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const products = await db.searchWooCommerceProducts(ctx.user.merchantId, input.search, input.limit || 20);
      return products;
    }),

  syncProducts: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings(ctx.user.merchantId);

    if (!settings || settings.connectionStatus !== 'connected') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'يجب الاتصال بـ WooCommerce أولاً',
      });
    }

    const client = createWooCommerceClient(settings);

    // Create sync log
    const logId = await db.createWooCommerceSyncLog({
      merchantId: ctx.user.merchantId,
      syncType: 'products',
      direction: 'import',
      status: 'success',
      startedAt: new Date().toISOString(),
    });

    let itemsProcessed = 0;
    let itemsSuccess = 0;
    let itemsFailed = 0;
    const errors: string[] = [];

    try {
      // Fetch all products from WooCommerce (paginated)
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const wooProducts = await client.getProducts({ page, per_page: 100 });

        if (wooProducts.length === 0) {
          hasMore = false;
          break;
        }

        for (const wooProduct of wooProducts) {
          itemsProcessed++;

          try {
            // Check if product already exists
            const existingProduct = await db.getWooCommerceProductByWooId(ctx.user.merchantId, wooProduct.id);

            const productData = {
              merchantId: ctx.user.merchantId,
              wooProductId: wooProduct.id,
              name: wooProduct.name,
              slug: wooProduct.slug,
              sku: wooProduct.sku || '',
              price: wooProduct.price,
              regularPrice: wooProduct.regular_price || wooProduct.price,
              salePrice: wooProduct.sale_price || null,
              stockStatus: wooProduct.stock_status,
              stockQuantity: wooProduct.stock_quantity,
              manageStock: wooProduct.manage_stock ? 1 : 0,
              description: wooProduct.description || '',
              shortDescription: wooProduct.short_description || '',
              imageUrl: wooProduct.images[0]?.src || '',
              categories: JSON.stringify(wooProduct.categories),
              lastSyncAt: new Date().toISOString(),
              syncStatus: 'synced' as const,
            };

            if (existingProduct) {
              await db.updateWooCommerceProduct(existingProduct.id, productData);
            } else {
              await db.createWooCommerceProduct(productData);
            }

            itemsSuccess++;
          } catch (error: any) {
            itemsFailed++;
            errors.push(`Product ${wooProduct.id}: ${error.message}`);
          }
        }

        page++;
      }

      // Update sync log
      await db.updateWooCommerceSyncLog(logId, {
        status: itemsFailed > 0 ? 'partial' : 'success',
        itemsProcessed,
        itemsSuccess,
        itemsFailed,
        completedAt: new Date().toISOString(),
        duration: Math.floor((Date.now() - new Date(await db.getWooCommerceSyncLogById(logId).then(l => l!.startedAt)).getTime()) / 1000),
        errorMessage: errors.length > 0 ? errors.join('\n') : null,
      });

      // Update last sync time
      await db.updateWooCommerceSettings(ctx.user.merchantId, {
        lastSyncAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: `تمت مزامنة ${itemsSuccess} منتج بنجاح`,
        stats: {
          processed: itemsProcessed,
          success: itemsSuccess,
          failed: itemsFailed,
        },
      };
    } catch (error: any) {
      await db.updateWooCommerceSyncLog(logId, {
        status: 'failed',
        itemsProcessed,
        itemsSuccess,
        itemsFailed,
        completedAt: new Date().toISOString(),
        errorMessage: error.message,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'فشلت المزامنة',
      });
    }
  }),

  // ==================== Orders ====================

  getOrders: protectedProcedure
    .input(z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const page = input.page || 1;
      const limit = input.limit || 50;
      const offset = (page - 1) * limit;

      let orders;
      if (input.status) {
        orders = await db.getWooCommerceOrdersByStatus(ctx.user.merchantId, input.status, limit);
      } else {
        orders = await db.getWooCommerceOrders(ctx.user.merchantId, limit, offset);
      }

      const stats = await db.getWooCommerceOrdersStats(ctx.user.merchantId);

      return {
        orders,
        stats,
        pagination: {
          page,
          limit,
          total: stats.total,
        },
      };
    }),

  getOrder: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const order = await db.getWooCommerceOrderById(input.id);

      if (!order || order.merchantId !== ctx.user.merchantId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لم يتم العثور على الطلب',
        });
      }

      return order;
    }),

  syncOrders: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings(ctx.user.merchantId);

    if (!settings || settings.connectionStatus !== 'connected') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'يجب الاتصال بـ WooCommerce أولاً',
      });
    }

    const client = createWooCommerceClient(settings);

    // Create sync log
    const logId = await db.createWooCommerceSyncLog({
      merchantId: ctx.user.merchantId,
      syncType: 'orders',
      direction: 'import',
      status: 'success',
      startedAt: new Date().toISOString(),
    });

    let itemsProcessed = 0;
    let itemsSuccess = 0;
    let itemsFailed = 0;
    const errors: string[] = [];

    try {
      // Fetch orders from WooCommerce (last 30 days)
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const wooOrders = await client.getOrders({ page, per_page: 100 });

        if (wooOrders.length === 0) {
          hasMore = false;
          break;
        }

        for (const wooOrder of wooOrders) {
          itemsProcessed++;

          try {
            // Check if order already exists
            const existingOrder = await db.getWooCommerceOrderByWooId(ctx.user.merchantId, wooOrder.id);

            const orderData = {
              merchantId: ctx.user.merchantId,
              wooOrderId: wooOrder.id,
              orderNumber: wooOrder.number,
              status: wooOrder.status,
              currency: wooOrder.currency,
              total: wooOrder.total,
              subtotal: wooOrder.line_items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0).toString(),
              totalTax: wooOrder.total_tax,
              shippingTotal: wooOrder.shipping_total,
              discountTotal: wooOrder.discount_total,
              customerEmail: wooOrder.billing.email,
              customerPhone: wooOrder.billing.phone,
              customerName: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`,
              billingAddress: JSON.stringify(wooOrder.billing),
              shippingAddress: JSON.stringify(wooOrder.shipping),
              lineItems: JSON.stringify(wooOrder.line_items),
              paymentMethod: wooOrder.payment_method,
              paymentMethodTitle: wooOrder.payment_method_title,
              transactionId: wooOrder.transaction_id || '',
              orderDate: wooOrder.date_created,
              paidDate: wooOrder.date_paid || null,
              completedDate: wooOrder.date_completed || null,
              customerNote: wooOrder.customer_note || '',
              lastSyncAt: new Date().toISOString(),
              syncStatus: 'synced' as const,
            };

            if (existingOrder) {
              await db.updateWooCommerceOrder(existingOrder.id, orderData);
            } else {
              await db.createWooCommerceOrder(orderData);
            }

            itemsSuccess++;
          } catch (error: any) {
            itemsFailed++;
            errors.push(`Order ${wooOrder.id}: ${error.message}`);
          }
        }

        page++;
      }

      // Update sync log
      await db.updateWooCommerceSyncLog(logId, {
        status: itemsFailed > 0 ? 'partial' : 'success',
        itemsProcessed,
        itemsSuccess,
        itemsFailed,
        completedAt: new Date().toISOString(),
        duration: Math.floor((Date.now() - new Date(await db.getWooCommerceSyncLogById(logId).then(l => l!.startedAt)).getTime()) / 1000),
        errorMessage: errors.length > 0 ? errors.join('\n') : null,
      });

      // Update last sync time
      await db.updateWooCommerceSettings(ctx.user.merchantId, {
        lastSyncAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: `تمت مزامنة ${itemsSuccess} طلب بنجاح`,
        stats: {
          processed: itemsProcessed,
          success: itemsSuccess,
          failed: itemsFailed,
        },
      };
    } catch (error: any) {
      await db.updateWooCommerceSyncLog(logId, {
        status: 'failed',
        itemsProcessed,
        itemsSuccess,
        itemsFailed,
        completedAt: new Date().toISOString(),
        errorMessage: error.message,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'فشلت المزامنة',
      });
    }
  }),

  // ==================== Sync Logs ====================

  getSyncLogs: protectedProcedure
    .input(z.object({
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await db.getWooCommerceSyncLogs(ctx.user.merchantId, input.limit || 50);
      return logs;
    }),

  getLatestSync: protectedProcedure
    .input(z.object({
      syncType: z.enum(['products', 'orders', 'customers', 'manual']),
    }))
    .query(async ({ ctx, input }) => {
      const log = await db.getLatestWooCommerceSyncLog(ctx.user.merchantId, input.syncType);
      return log;
    }),
});
