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
    const settings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));
    
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
          message: 'ط±ط§ط¨ط· ط§ظ„ظ…طھط¬ط± ط؛ظٹط± طµط­ظٹط­',
        });
      }

      // Check if settings exist
      const existingSettings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));
      
      // Only check for other platforms if creating new connection
      if (!existingSettings) {
        const { validateNewPlatformConnection } = await import('./integrations/platform-checker');
        try {
          await validateNewPlatformConnection((await getMerchantId(ctx.user.id)), 'ظˆظˆظƒظˆظ…ط±ط³');
        } catch (error: any) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: error.message 
          });
        }
      }

      if (existingSettings) {
        // Update existing settings
        await db.updateWooCommerceSettings((await getMerchantId(ctx.user.id)), {
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
          merchantId: (await getMerchantId(ctx.user.id)),
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

      return { success: true, message: 'طھظ… ط­ظپط¸ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ ط¨ظ†ط¬ط§ط­' };
    }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));

    if (!settings) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط¥ط¹ط¯ط§ط¯ط§طھ WooCommerce',
      });
    }

    const client = createWooCommerceClient(settings);
    const result = await client.testConnection();

    if (result.success) {
      // Update connection status
      await db.updateWooCommerceConnectionStatus((await getMerchantId(ctx.user.id)), 'connected', result.storeInfo);
    } else {
      await db.updateWooCommerceConnectionStatus((await getMerchantId(ctx.user.id)), 'error');
    }

    return result;
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await db.deleteWooCommerceSettings((await getMerchantId(ctx.user.id)));
    await db.deleteWooCommerceProductsByMerchant((await getMerchantId(ctx.user.id)));
    await db.deleteWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));

    return { success: true, message: 'طھظ… ظپطµظ„ ط§ظ„ط§طھطµط§ظ„ ط¨ظ†ط¬ط§ط­' };
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

      const products = await db.getWooCommerceProducts((await getMerchantId(ctx.user.id)), limit, offset);
      const stats = await db.getWooCommerceProductsStats((await getMerchantId(ctx.user.id)));

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
      const products = await db.searchWooCommerceProducts((await getMerchantId(ctx.user.id)), input.search, input.limit || 20);
      return products;
    }),

  syncProducts: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));

    if (!settings || settings.connectionStatus !== 'connected') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'ظٹط¬ط¨ ط§ظ„ط§طھطµط§ظ„ ط¨ظ€ WooCommerce ط£ظˆظ„ط§ظ‹',
      });
    }

    const client = createWooCommerceClient(settings);

    // Create sync log
    const logId = await db.createWooCommerceSyncLog({
      merchantId: (await getMerchantId(ctx.user.id)),
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
            const existingProduct = await db.getWooCommerceProductByWooId((await getMerchantId(ctx.user.id)), wooProduct.id);

            const productData = {
              merchantId: (await getMerchantId(ctx.user.id)),
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
      await db.updateWooCommerceSettings((await getMerchantId(ctx.user.id)), {
        lastSyncAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: `طھظ…طھ ظ…ط²ط§ظ…ظ†ط© ${itemsSuccess} ظ…ظ†طھط¬ ط¨ظ†ط¬ط§ط­`,
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
        message: error.message || 'ظپط´ظ„طھ ط§ظ„ظ…ط²ط§ظ…ظ†ط©',
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
        orders = await db.getWooCommerceOrdersByStatus((await getMerchantId(ctx.user.id)), input.status, limit);
      } else {
        orders = await db.getWooCommerceOrders((await getMerchantId(ctx.user.id)), limit, offset);
      }

      const stats = await db.getWooCommerceOrdersStats((await getMerchantId(ctx.user.id)));

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

      if (!order || order.merchantId !== (await getMerchantId(ctx.user.id))) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ط·ظ„ط¨',
        });
      }

      return order;
    }),

  syncOrders: protectedProcedure.mutation(async ({ ctx }) => {
    const settings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));

    if (!settings || settings.connectionStatus !== 'connected') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'ظٹط¬ط¨ ط§ظ„ط§طھطµط§ظ„ ط¨ظ€ WooCommerce ط£ظˆظ„ط§ظ‹',
      });
    }

    const client = createWooCommerceClient(settings);

    // Create sync log
    const logId = await db.createWooCommerceSyncLog({
      merchantId: (await getMerchantId(ctx.user.id)),
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
            const existingOrder = await db.getWooCommerceOrderByWooId((await getMerchantId(ctx.user.id)), wooOrder.id);

            const orderData = {
              merchantId: (await getMerchantId(ctx.user.id)),
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
      await db.updateWooCommerceSettings((await getMerchantId(ctx.user.id)), {
        lastSyncAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: `طھظ…طھ ظ…ط²ط§ظ…ظ†ط© ${itemsSuccess} ط·ظ„ط¨ ط¨ظ†ط¬ط§ط­`,
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
        message: error.message || 'ظپط´ظ„طھ ط§ظ„ظ…ط²ط§ظ…ظ†ط©',
      });
    }
  }),

  // ==================== Sync Logs ====================

  getSyncLogs: protectedProcedure
    .input(z.object({
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await db.getWooCommerceSyncLogs((await getMerchantId(ctx.user.id)), input.limit || 50);
      return logs;
    }),

  getLatestSync: protectedProcedure
    .input(z.object({
      syncType: z.enum(['products', 'orders', 'customers', 'manual']),
    }))
    .query(async ({ ctx, input }) => {
      const log = await db.getLatestWooCommerceSyncLog((await getMerchantId(ctx.user.id)), input.syncType);
      return log;
    }),

  // ==================== Order Management ====================

  updateOrderStatus: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      status: z.enum(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed']),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Get order from local database
        const order = await db.getWooCommerceOrderById(input.orderId);
        
        if (!order || order.merchantId !== (await getMerchantId(ctx.user.id))) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯',
          });
        }

        // Get WooCommerce settings
        const settings = await db.getWooCommerceSettings((await getMerchantId(ctx.user.id)));
        
        if (!settings) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط¥ط¹ط¯ط§ط¯ط§طھ WooCommerce',
          });
        }

        // Update order status in WooCommerce
        const client = createWooCommerceClient(settings);
        await client.updateOrder(order.wooOrderId, {
          status: input.status,
          ...(input.note && {
            customer_note: input.note,
          }),
        });

        // Update local database
        await db.updateWooCommerceOrder(input.orderId, {
          status: input.status,
          ...(input.note && {
            orderNotes: input.note,
          }),
        });

        return { 
          success: true, 
          message: 'طھظ… طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ ط¨ظ†ط¬ط§ط­',
          order: {
            ...order,
            status: input.status,
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'ظپط´ظ„ طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨',
        });
      }
    }),

  sendOrderNotification: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Get order from local database
        const order = await db.getWooCommerceOrderById(input.orderId);
        
        if (!order || order.merchantId !== (await getMerchantId(ctx.user.id))) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'ط§ظ„ط·ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯',
          });
        }

        if (!order.customerPhone) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'ط±ظ‚ظ… ظ‡ط§طھظپ ط§ظ„ط¹ظ…ظٹظ„ ط؛ظٹط± ظ…طھظˆظپط±',
          });
        }

        // Get merchant's WhatsApp connection
        const whatsappConnection = await db.getWhatsAppConnectionByMerchantId((await getMerchantId(ctx.user.id)));
        
        if (!whatsappConnection || !whatsappConnection.isActive) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'ظ„ظ… ظٹطھظ… ط±ط¨ط· ط­ط³ط§ط¨ ظˆط§طھط³ط§ط¨',
          });
        }

        // Parse line items
        const lineItems = JSON.parse(order.lineItems || '[]');
        
        // Prepare notification message
        const defaultMessage = `
ظ…ط±ط­ط¨ط§ظ‹ ${order.customerName}! ًں‘‹

ظ†ظˆط¯ ط¥ط¹ظ„ط§ظ…ظƒ ط¨طھط­ط¯ظٹط« ط­ط§ظ„ط© ط·ظ„ط¨ظƒ #${order.orderNumber}

ًں“¦ ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨: ${getOrderStatusArabic(order.status)}
ًں’° ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ: ${order.total} ${order.currency}

ط§ظ„ظ…ظ†طھط¬ط§طھ:
${lineItems.map((item: any, index: number) => `${index + 1}. ${item.name} أ— ${item.quantity}`).join('\n')}

ط´ظƒط±ط§ظ‹ ظ„ط«ظ‚طھظƒ ط¨ظ†ط§! ًں™ڈ
        `.trim();

        const messageToSend = input.message || defaultMessage;

        // Send WhatsApp message using Green API
        const { sendWhatsAppMessage } = await import('./whatsapp');
        await sendWhatsAppMessage(
          whatsappConnection.instanceId,
          whatsappConnection.apiToken,
          order.customerPhone,
          messageToSend
        );

        // Update notification status
        await db.updateWooCommerceOrder(input.orderId, {
          notificationSent: 1,
          notificationSentAt: new Date().toISOString(),
        });

        return { 
          success: true, 
          message: 'طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¥ط´ط¹ط§ط± ط¨ظ†ط¬ط§ط­',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'ظپط´ظ„ ط¥ط±ط³ط§ظ„ ط§ظ„ط¥ط´ط¹ط§ط±',
        });
      }
    }),

  // ==================== Analytics ====================

  getSalesStats: protectedProcedure
    .input(z.object({
      period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orders = await db.getWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));
      
      // Filter by date range if provided
      let filteredOrders = orders;
      if (input.startDate && input.endDate) {
        filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.orderDate);
          return orderDate >= new Date(input.startDate!) && orderDate <= new Date(input.endDate!);
        });
      }

      // Calculate stats
      const totalRevenue = filteredOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount || '0'), 0);
      const totalOrders = filteredOrders.length;
      const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
      const pendingOrders = filteredOrders.filter(o => o.status === 'pending').length;
      const processingOrders = filteredOrders.filter(o => o.status === 'processing').length;
      const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Group by period for chart data
      const chartData: { date: string; revenue: number; orders: number }[] = [];
      const groupedByDate = new Map<string, { revenue: number; orders: number }>();

      filteredOrders.forEach(order => {
        const date = new Date(order.orderDate);
        let key = '';
        
        if (input.period === 'daily') {
          key = date.toISOString().split('T')[0];
        } else if (input.period === 'weekly') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
        } else if (input.period === 'monthly') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        const existing = groupedByDate.get(key) || { revenue: 0, orders: 0 };
        existing.revenue += parseFloat(order.totalAmount || '0');
        existing.orders += 1;
        groupedByDate.set(key, existing);
      });

      groupedByDate.forEach((value, key) => {
        chartData.push({ date: key, revenue: value.revenue, orders: value.orders });
      });

      chartData.sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalRevenue,
        totalOrders,
        completedOrders,
        pendingOrders,
        processingOrders,
        cancelledOrders,
        averageOrderValue,
        chartData,
      };
    }),

  getTopProducts: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orders = await db.getWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));
      
      // Filter by date range if provided
      let filteredOrders = orders;
      if (input.startDate && input.endDate) {
        filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.orderDate);
          return orderDate >= new Date(input.startDate!) && orderDate <= new Date(input.endDate!);
        });
      }

      // Count product sales
      const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();

      filteredOrders.forEach(order => {
        try {
          const items = JSON.parse(order.items || '[]');
          items.forEach((item: any) => {
            const productKey = item.product_id || item.name;
            const existing = productSales.get(productKey) || { name: item.name, quantity: 0, revenue: 0 };
            existing.quantity += item.quantity || 1;
            existing.revenue += parseFloat(item.total || '0');
            productSales.set(productKey, existing);
          });
        } catch (e) {
          // Skip invalid JSON
        }
      });

      // Convert to array and sort by quantity
      const topProducts = Array.from(productSales.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, input.limit);

      return topProducts;
    }),

  getConversionRate: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Get WooCommerce orders
      const orders = await db.getWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));
      
      // Filter by date range if provided
      let filteredOrders = orders;
      if (input.startDate && input.endDate) {
        filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.orderDate);
          return orderDate >= new Date(input.startDate!) && orderDate <= new Date(input.endDate!);
        });
      }

      // Get WhatsApp conversations for the same period
      const conversations = await db.getConversationsByMerchant((await getMerchantId(ctx.user.id)));
      let filteredConversations = conversations;
      if (input.startDate && input.endDate) {
        filteredConversations = conversations.filter(conv => {
          const convDate = new Date(conv.createdAt);
          return convDate >= new Date(input.startDate!) && convDate <= new Date(input.endDate!);
        });
      }

      const totalConversations = filteredConversations.length;
      const totalOrders = filteredOrders.length;
      const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;

      // Calculate conversion rates
      const conversionRate = totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0;
      const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

      // Calculate revenue from WhatsApp-originated orders
      const whatsappOrders = filteredOrders.filter(order => {
        // Check if order has WhatsApp customer phone
        return order.customerPhone && order.customerPhone.length > 0;
      });
      const whatsappRevenue = whatsappOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount || '0'), 0);

      return {
        totalConversations,
        totalOrders,
        completedOrders,
        conversionRate: Math.round(conversionRate * 100) / 100,
        completionRate: Math.round(completionRate * 100) / 100,
        whatsappOrders: whatsappOrders.length,
        whatsappRevenue,
      };
    }),

  getCustomerStats: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orders = await db.getWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));
      
      // Filter by date range if provided
      let filteredOrders = orders;
      if (input.startDate && input.endDate) {
        filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.orderDate);
          return orderDate >= new Date(input.startDate!) && orderDate <= new Date(input.endDate!);
        });
      }

      // Count unique customers
      const uniqueCustomers = new Set<string>();
      const customerOrderCount = new Map<string, number>();

      filteredOrders.forEach(order => {
        const customerId = order.customerEmail || order.customerPhone || 'unknown';
        uniqueCustomers.add(customerId);
        customerOrderCount.set(customerId, (customerOrderCount.get(customerId) || 0) + 1);
      });

      // Calculate new vs returning customers
      const newCustomers = Array.from(customerOrderCount.values()).filter(count => count === 1).length;
      const returningCustomers = uniqueCustomers.size - newCustomers;

      return {
        totalCustomers: uniqueCustomers.size,
        newCustomers,
        returningCustomers,
        repeatCustomerRate: uniqueCustomers.size > 0 ? (returningCustomers / uniqueCustomers.size) * 100 : 0,
      };
    }),

  getRevenueChart: protectedProcedure
    .input(z.object({
      period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const orders = await db.getWooCommerceOrdersByMerchant((await getMerchantId(ctx.user.id)));
      
      // Filter by date range
      const filteredOrders = orders.filter(order => {
        const orderDate = new Date(order.orderDate);
        return orderDate >= new Date(input.startDate) && orderDate <= new Date(input.endDate);
      });

      // Group by period
      const chartData: { date: string; revenue: number; orders: number }[] = [];
      const groupedByDate = new Map<string, { revenue: number; orders: number }>();

      filteredOrders.forEach(order => {
        const date = new Date(order.orderDate);
        let key = '';
        
        if (input.period === 'daily') {
          key = date.toISOString().split('T')[0];
        } else if (input.period === 'weekly') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
        } else if (input.period === 'monthly') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        const existing = groupedByDate.get(key) || { revenue: 0, orders: 0 };
        existing.revenue += parseFloat(order.totalAmount || '0');
        existing.orders += 1;
        groupedByDate.set(key, existing);
      });

      groupedByDate.forEach((value, key) => {
        chartData.push({ date: key, revenue: value.revenue, orders: value.orders });
      });

      chartData.sort((a, b) => a.date.localeCompare(b.date));

      return chartData;
    }),
});


// Helper function to get order status in Arabic
function getOrderStatusArabic(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'ظ‚ظٹط¯ ط§ظ„ط§ظ†طھط¸ط§ط±',
    'processing': 'ظ‚ظٹط¯ ط§ظ„ظ…ط¹ط§ظ„ط¬ط©',
    'on-hold': 'ظ…ط¹ظ„ظ‚',
    'completed': 'ظ…ظƒطھظ…ظ„',
    'cancelled': 'ظ…ظ„ط؛ظٹ',
    'refunded': 'ظ…ط³طھط±ط¬ط¹',
    'failed': 'ظپط§ط´ظ„',
  };
  
  return statusMap[status] || status;
}
