import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { merchantProcedure, permissionProcedure, router } from './_core/trpc';
import {
  createWooCommerceSyncLog,
  deleteWooCommerceIntegration,
  getConversationsByMerchant,
  getLatestWooCommerceSyncLog,
  getWooCommerceOrderByIdForMerchant,
  getWooCommerceOrders,
  getWooCommerceOrdersByMerchant,
  getWooCommerceOrdersByStatus,
  getWooCommerceOrdersStats,
  getWooCommerceProducts,
  getWooCommerceProductsStats,
  getWooCommerceSettings,
  getWooCommerceSyncLogs,
  getWooCommerceWebhookRegistrations,
  reconcileWooCommerceSnapshotAndWebhookIncidents,
  saveVerifiedWooCommerceSettings,
  searchWooCommerceProducts,
  updateWooCommerceConnectionStatus,
  updateWooCommerceSettings,
  updateWooCommerceSyncLog,
  upsertWooCommerceOrdersSnapshot,
  upsertWooCommerceProductsSnapshot,
} from './db';
import {
  canonicalWooStoreUrl,
  createWooCommerceClient,
  WooCommerceApiError,
} from './woocommerce';
import {
  fetchWooCommerceOrders,
  fetchWooCommerceProducts,
  normalizeWooCommerceOrder,
  normalizeWooCommerceProduct,
  wooSyncTimestamp,
} from './integrations/woocommerce-sync';
import {
  deleteWooCommerceWebhookRegistrations,
  registerWooCommerceWebhooks,
  verifyWooCommerceWebhookRegistrations,
} from './integrations/woocommerce-webhook-registration';
import { getWooCommerceWebhookHealth } from './integrations/woocommerce-webhook-receipts';
import { withWooCommerceMerchantLock, WooCommerceMerchantLockError } from './integrations/woocommerce-lock';
import { validateNewPlatformConnection } from './integrations/platform-checker';
import { sendMerchantWhatsApp, WhatsAppDeliveryStateError } from './channels/whatsapp/service';
import type { TrpcContext } from './_core/context';

const pageInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(1).max(100).default(50),
});
const orderStatus = z.enum(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed']);
const dateRangeInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(value => Boolean(value.startDate) === Boolean(value.endDate), 'date_range_incomplete');

function tenantId(ctx: { merchantId?: number }): number {
  if (!ctx.merchantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يوجد متجر مرتبط بهذه الجلسة' });
  return ctx.merchantId;
}

function publicWooError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof WooCommerceApiError) {
    if (error.code === 'endpoint') return new TRPCError({ code: 'BAD_REQUEST', message: 'رابط متجر WooCommerce غير آمن أو غير صالح' });
    if (error.code === 'credentials' || error.code === 'status') {
      return new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر توثيق اتصال WooCommerce؛ تحقق من الرابط والمفاتيح والصلاحيات' });
    }
    if (error.code === 'limit') {
      return new TRPCError({ code: 'BAD_REQUEST', message: 'يتجاوز المتجر حد المزامنة الآمنة البالغ 2000 سجل؛ استخدم مزامنة مرحلية' });
    }
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر الوصول إلى WooCommerce بأمان؛ حاول لاحقًا' });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر إكمال عملية WooCommerce' });
}

async function withWooCommerceLock<T>(merchantId: number, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await withWooCommerceMerchantLock(merchantId, action, signal);
  } catch (error) {
    if (error instanceof WooCommerceMerchantLockError) {
      if (error.code === 'merchant_lock_timeout') {
        throw new TRPCError({ code: 'CONFLICT', message: 'توجد عملية WooCommerce أخرى قيد التنفيذ' });
      }
      if (error.code === 'operation_capacity') {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'خدمة WooCommerce مشغولة؛ حاول بعد قليل' });
      }
      if (error.code === 'operation_cancelled') {
        throw new TRPCError({ code: 'CLIENT_CLOSED_REQUEST', message: 'تم إلغاء الطلب' });
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة' });
    }
    throw error;
  }
}

type WooCommerceRequestContext = Pick<TrpcContext, 'req' | 'res'>;

type WooCommerceRequestLifecycle = {
  controller: AbortController;
  refs: number;
  req: WooCommerceRequestContext['req'];
  res: WooCommerceRequestContext['res'];
  abort: () => void;
  close: () => void;
};

const wooCommerceRequestLifecycles = new WeakMap<object, WooCommerceRequestLifecycle>();

function retainWooCommerceRequestLifecycle(ctx: WooCommerceRequestContext): WooCommerceRequestLifecycle {
  const existing = wooCommerceRequestLifecycles.get(ctx.req);
  if (existing) {
    existing.refs += 1;
    return existing;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => {
    if (!ctx.res.writableEnded) controller.abort();
  };
  const lifecycle: WooCommerceRequestLifecycle = {
    controller,
    refs: 1,
    req: ctx.req,
    res: ctx.res,
    abort,
    close,
  };
  wooCommerceRequestLifecycles.set(ctx.req, lifecycle);
  ctx.req.once('aborted', abort);
  ctx.res.once('close', close);
  if (ctx.req.aborted || ctx.req.destroyed) controller.abort();
  return lifecycle;
}

function releaseWooCommerceRequestLifecycle(lifecycle: WooCommerceRequestLifecycle): void {
  lifecycle.refs -= 1;
  if (lifecycle.refs > 0) return;
  lifecycle.req.off('aborted', lifecycle.abort);
  lifecycle.res.off('close', lifecycle.close);
  if (wooCommerceRequestLifecycles.get(lifecycle.req) === lifecycle) {
    wooCommerceRequestLifecycles.delete(lifecycle.req);
  }
}

async function withWooCommerceRequestLock<T>(
  ctx: WooCommerceRequestContext,
  merchantId: number,
  action: () => Promise<T>,
): Promise<T> {
  const lifecycle = retainWooCommerceRequestLifecycle(ctx);
  try {
    return await withWooCommerceLock(merchantId, action, lifecycle.controller.signal);
  } finally {
    releaseWooCommerceRequestLifecycle(lifecycle);
  }
}

async function cleanupRemoteWebhookRegistrations(
  settings: Parameters<typeof createWooCommerceClient>[0],
  registrations: Awaited<ReturnType<typeof getWooCommerceWebhookRegistrations>>,
): Promise<void> {
  if (!registrations.length) return;
  try {
    await deleteWooCommerceWebhookRegistrations(createWooCommerceClient(settings), registrations);
  } catch {
    console.warn('[WooCommerce] unable to initialize remote webhook cleanup');
  }
}

async function settingsDto(settings: NonNullable<Awaited<ReturnType<typeof getWooCommerceSettings>>>) {
  const registrations = await getWooCommerceWebhookRegistrations(settings.merchantId);
  const webhookReady = Boolean(
    settings.webhookEndpointId
    && settings.webhookSigningSecret
    && registrations.length === 6,
  );
  const webhookHealth = webhookReady ? await getWooCommerceWebhookHealth(settings.merchantId) : null;
  return {
    storeUrl: settings.storeUrl,
    isActive: settings.isActive,
    connected: settings.isActive === 1 && settings.connectionStatus === 'connected',
    connectionStatus: settings.connectionStatus,
    hasConsumerKey: Boolean(settings.consumerKey),
    hasConsumerSecret: Boolean(settings.consumerSecret),
    lastSyncAt: settings.lastSyncAt,
    lastTestAt: settings.lastTestAt,
    storeVersion: settings.storeVersion,
    storeName: settings.storeName,
    storeCurrency: settings.storeCurrency,
    syncMode: webhookReady ? 'webhook' as const : 'manual' as const,
    webhook: {
      ready: webhookReady,
      registeredTopics: registrations.length,
      health: webhookHealth,
    },
  };
}

function productDto(product: Awaited<ReturnType<typeof getWooCommerceProducts>>[number]) {
  return {
    id: product.id,
    wooProductId: product.wooProductId,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    price: product.price,
    regularPrice: product.regularPrice,
    salePrice: product.salePrice,
    stockStatus: product.stockStatus,
    stockQuantity: product.stockQuantity,
    manageStock: product.manageStock,
    imageUrl: product.imageUrl,
    categories: product.categories,
    providerUpdatedAt: product.providerUpdatedAt,
    lastSyncAt: product.lastSyncAt,
  };
}

type WooOrderRow = Awaited<ReturnType<typeof getWooCommerceOrders>>[number];

function orderDto(order: WooOrderRow) {
  return {
    id: order.id,
    wooOrderId: order.wooOrderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    status: order.status,
    currency: order.currency,
    total: order.total,
    subtotal: order.subtotal,
    totalTax: order.totalTax,
    shippingTotal: order.shippingTotal,
    discountTotal: order.discountTotal,
    paymentMethod: order.paymentMethod,
    paymentMethodTitle: order.paymentMethodTitle,
    lineItems: order.lineItems,
    customerNote: order.customerNote,
    orderDate: order.orderDate,
    providerUpdatedAt: order.providerUpdatedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function dateBounds(input: { startDate?: string; endDate?: string }): { start: Date; end: Date } | null {
  if (!input.startDate || !input.endDate) return null;
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86_400_000) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'نطاق التاريخ غير صالح أو يتجاوز سنة' });
  }
  return { start, end };
}

function filterOrdersByDate<T extends { orderDate: string }>(orders: T[], range: { start: Date; end: Date } | null): T[] {
  if (!range) return orders;
  return orders.filter(order => {
    const value = new Date(order.orderDate).getTime();
    return Number.isFinite(value) && value >= range.start.getTime() && value <= range.end.getTime();
  });
}

async function runManualSync(ctx: WooCommerceRequestContext, merchantId: number, type: 'products' | 'orders') {
  return withWooCommerceRequestLock(ctx, merchantId, async () => {
    const settings = await getWooCommerceSettings(merchantId);
    if (!settings || settings.isActive !== 1 || settings.connectionStatus !== 'connected') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط WooCommerce والتحقق منه أولًا' });
    }
    const started = Date.now();
    const startedAt = wooSyncTimestamp(new Date(started));
    const logId = await createWooCommerceSyncLog({
      merchantId,
      syncType: type,
      direction: 'import',
      status: 'running',
      startedAt,
    });
    try {
      const client = createWooCommerceClient(settings);
      if (type === 'products') {
        const remote = await fetchWooCommerceProducts(client);
        const normalized = remote.map(product => normalizeWooCommerceProduct(merchantId, product, startedAt));
        await upsertWooCommerceProductsSnapshot(merchantId, normalized, true);
      } else {
        const remote = await fetchWooCommerceOrders(client);
        const normalized = remote.map(order => normalizeWooCommerceOrder(merchantId, order, startedAt));
        await upsertWooCommerceOrdersSnapshot(merchantId, normalized, true);
      }
      const count = type === 'products'
        ? (await getWooCommerceProductsStats(merchantId)).total
        : (await getWooCommerceOrdersStats(merchantId)).total;
      await updateWooCommerceSyncLog(logId, {
        status: 'success',
        itemsProcessed: count,
        itemsSuccess: count,
        itemsFailed: 0,
        completedAt: wooSyncTimestamp(),
        duration: Math.max(0, Math.floor((Date.now() - started) / 1000)),
        errorMessage: null,
      });
      await updateWooCommerceSettings(merchantId, { lastSyncAt: wooSyncTimestamp() });
      return { success: true, count };
    } catch (error) {
      await updateWooCommerceSyncLog(logId, {
        status: 'failed',
        completedAt: wooSyncTimestamp(),
        duration: Math.max(0, Math.floor((Date.now() - started) / 1000)),
        errorMessage: error instanceof WooCommerceApiError ? error.code : 'sync_failed',
      }).catch(() => undefined);
      throw publicWooError(error);
    }
  });
}

async function runFullWooCommerceReconciliation(ctx: WooCommerceRequestContext, merchantId: number) {
  return withWooCommerceRequestLock(ctx, merchantId, async () => {
    const settings = await getWooCommerceSettings(merchantId);
    if (!settings || settings.isActive !== 1 || settings.connectionStatus !== 'connected') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط WooCommerce والتحقق منه أولًا' });
    }
    const started = Date.now();
    const startedAt = wooSyncTimestamp(new Date(started));
    const logId = await createWooCommerceSyncLog({
      merchantId,
      syncType: 'manual',
      direction: 'import',
      status: 'running',
      startedAt,
    });
    try {
      const client = createWooCommerceClient(settings);
      const [remoteProducts, remoteOrders] = await Promise.all([
        fetchWooCommerceProducts(client),
        fetchWooCommerceOrders(client),
      ]);
      const observedAt = wooSyncTimestamp();
      const result = await reconcileWooCommerceSnapshotAndWebhookIncidents({
        merchantId,
        products: remoteProducts.map(product => normalizeWooCommerceProduct(merchantId, product, observedAt)),
        orders: remoteOrders.map(order => normalizeWooCommerceOrder(merchantId, order, observedAt)),
        observedAt,
      });
      const total = result.products + result.orders;
      await updateWooCommerceSyncLog(logId, {
        status: 'success',
        itemsProcessed: total,
        itemsSuccess: total,
        itemsFailed: 0,
        completedAt: wooSyncTimestamp(),
        duration: Math.max(0, Math.floor((Date.now() - started) / 1000)),
        errorMessage: null,
      });
      return { success: true, ...result };
    } catch (error) {
      await updateWooCommerceSyncLog(logId, {
        status: 'failed',
        completedAt: wooSyncTimestamp(),
        duration: Math.max(0, Math.floor((Date.now() - started) / 1000)),
        errorMessage: error instanceof WooCommerceApiError ? error.code : 'reconciliation_failed',
      }).catch(() => undefined);
      throw publicWooError(error);
    }
  });
}

export const woocommerceRouter = router({
  getSettings: merchantProcedure.query(async ({ ctx }) => {
    const settings = await getWooCommerceSettings(tenantId(ctx));
    return settings ? await settingsDto(settings) : null;
  }),

  saveSettings: permissionProcedure('integrations.manage')
    .input(z.object({
      storeUrl: z.string().trim().min(8).max(500),
      consumerKey: z.string().trim().max(160).optional(),
      consumerSecret: z.string().trim().max(160).optional(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchantId = tenantId(ctx);
      try {
        return await withWooCommerceRequestLock(ctx, merchantId, async () => {
          const existing = await getWooCommerceSettings(merchantId);
          if (!existing) await validateNewPlatformConnection(merchantId, 'WooCommerce');
          const storeUrl = canonicalWooStoreUrl(input.storeUrl);
          const consumerKey = input.consumerKey || existing?.consumerKey;
          const consumerSecret = input.consumerSecret || existing?.consumerSecret;
          if (!consumerKey || !consumerSecret) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'مفتاح WooCommerce وسرّه مطلوبان للربط الأول' });
          }
          const client = createWooCommerceClient({ storeUrl, consumerKey, consumerSecret });
          const storeInfo = await client.testConnection();
          const previousRegistrations = existing
            ? await getWooCommerceWebhookRegistrations(merchantId)
            : [];
          const webhookEndpointId = crypto.randomBytes(32).toString('base64url');
          const webhookSigningSecret = crypto.randomBytes(48).toString('base64url');
          const registrations = await registerWooCommerceWebhooks({
            client,
            endpointId: webhookEndpointId,
            signingSecret: webhookSigningSecret,
          });
          const now = wooSyncTimestamp();
          try {
            await saveVerifiedWooCommerceSettings({
              merchantId,
              storeUrl,
              consumerKey,
              consumerSecret,
              webhookEndpointId,
              webhookSigningSecret,
              isActive: 1,
              connectionStatus: 'connected',
              lastTestAt: now,
              autoSyncProducts: 0,
              autoSyncOrders: 0,
              autoSyncCustomers: 0,
              syncInterval: 60,
              storeVersion: storeInfo.version || null,
              storeName: storeInfo.name || null,
              storeCurrency: storeInfo.currency || null,
            }, registrations);
          } catch (error) {
            await deleteWooCommerceWebhookRegistrations(client, registrations);
            throw error;
          }
          if (existing && previousRegistrations.length) {
            await cleanupRemoteWebhookRegistrations(existing, previousRegistrations);
          }
          return { success: true, connected: true, webhookReady: true };
        });
      } catch (error) {
        throw publicWooError(error);
      }
    }),

  testConnection: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    const merchantId = tenantId(ctx);
    try {
      return await withWooCommerceRequestLock(ctx, merchantId, async () => {
        const settings = await getWooCommerceSettings(merchantId);
        if (!settings) throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم ربط WooCommerce' });
        const client = createWooCommerceClient(settings);
        const info = await client.testConnection();
        const previousRegistrations = await getWooCommerceWebhookRegistrations(merchantId);
        const storedWebhookIdentityReady = Boolean(
          settings.webhookEndpointId
          && settings.webhookSigningSecret
          && previousRegistrations.length === 6,
        );
        const webhookReady = storedWebhookIdentityReady
          && await verifyWooCommerceWebhookRegistrations({
            client,
            endpointId: settings.webhookEndpointId!,
            registrations: previousRegistrations,
          });
        if (webhookReady) {
          await updateWooCommerceConnectionStatus(merchantId, 'connected', info);
          return { success: true, connected: true, webhookReady: true };
        }
        const webhookEndpointId = crypto.randomBytes(32).toString('base64url');
        const webhookSigningSecret = crypto.randomBytes(48).toString('base64url');
        const registrations = await registerWooCommerceWebhooks({
          client,
          endpointId: webhookEndpointId,
          signingSecret: webhookSigningSecret,
        });
        try {
          await saveVerifiedWooCommerceSettings({
            merchantId,
            storeUrl: settings.storeUrl,
            consumerKey: settings.consumerKey,
            consumerSecret: settings.consumerSecret,
            webhookEndpointId,
            webhookSigningSecret,
            isActive: 1,
            connectionStatus: 'connected',
            lastSyncAt: settings.lastSyncAt,
            lastTestAt: wooSyncTimestamp(),
            autoSyncProducts: 0,
            autoSyncOrders: 0,
            autoSyncCustomers: 0,
            syncInterval: settings.syncInterval,
            storeVersion: info.version || settings.storeVersion,
            storeName: info.name || settings.storeName,
            storeCurrency: info.currency || settings.storeCurrency,
          }, registrations);
        } catch (error) {
          await deleteWooCommerceWebhookRegistrations(client, registrations);
          throw error;
        }
        await cleanupRemoteWebhookRegistrations(settings, previousRegistrations);
        return { success: true, connected: true, webhookReady: true };
      });
    } catch (error) {
      if (!(error instanceof TRPCError)) await updateWooCommerceConnectionStatus(merchantId, 'error').catch(() => undefined);
      throw publicWooError(error);
    }
  }),

  disconnect: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    const merchantId = tenantId(ctx);
    await withWooCommerceRequestLock(ctx, merchantId, async () => {
      const settings = await getWooCommerceSettings(merchantId);
      const registrations = await getWooCommerceWebhookRegistrations(merchantId);
      if (settings) await cleanupRemoteWebhookRegistrations(settings, registrations);
      await deleteWooCommerceIntegration(merchantId);
    });
    return { success: true };
  }),

  getProducts: merchantProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const merchantId = tenantId(ctx);
    const products = await getWooCommerceProducts(merchantId, input.limit, (input.page - 1) * input.limit);
    const stats = await getWooCommerceProductsStats(merchantId);
    return { products: products.map(productDto), stats, pagination: { ...input, total: stats.total } };
  }),

  searchProducts: merchantProcedure
    .input(z.object({ search: z.string().trim().min(3).max(120), limit: z.number().int().min(1).max(50).default(20) }).strict())
    .query(async ({ ctx, input }) => (await searchWooCommerceProducts(tenantId(ctx), input.search, input.limit)).map(productDto)),

  syncProducts: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    const result = await runManualSync(ctx, tenantId(ctx), 'products');
    return { ...result, message: `تمت مزامنة ${result.count} منتج من WooCommerce` };
  }),

  getOrders: merchantProcedure
    .input(pageInput.extend({ status: orderStatus.optional() }))
    .query(async ({ ctx, input }) => {
      const merchantId = tenantId(ctx);
      const offset = (input.page - 1) * input.limit;
      const rows = input.status
        ? await getWooCommerceOrdersByStatus(merchantId, input.status, input.limit, offset)
        : await getWooCommerceOrders(merchantId, input.limit, offset);
      const stats = await getWooCommerceOrdersStats(merchantId);
      const total = input.status ? (stats.statusCounts[input.status] || 0) : stats.total;
      return { orders: rows.map(orderDto), stats, pagination: { page: input.page, limit: input.limit, total } };
    }),

  getOrder: merchantProcedure.input(z.object({ id: z.number().int().positive() }).strict()).query(async ({ ctx, input }) => {
    const order = await getWooCommerceOrderByIdForMerchant(tenantId(ctx), input.id);
    if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
    return orderDto(order);
  }),

  syncOrders: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    const result = await runManualSync(ctx, tenantId(ctx), 'orders');
    return { ...result, message: `تمت مزامنة ${result.count} طلب من WooCommerce` };
  }),

  reconcileWebhookIncidents: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    return runFullWooCommerceReconciliation(ctx, tenantId(ctx));
  }),

  getSyncLogs: merchantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).strict())
    .query(({ ctx, input }) => getWooCommerceSyncLogs(tenantId(ctx), input.limit)),

  getLatestSync: merchantProcedure
    .input(z.object({ syncType: z.enum(['products', 'orders', 'customers', 'manual']) }).strict())
    .query(({ ctx, input }) => getLatestWooCommerceSyncLog(tenantId(ctx), input.syncType)),

  updateOrderStatus: permissionProcedure('orders.manage')
    .input(z.object({ orderId: z.number().int().positive(), status: orderStatus, note: z.string().trim().max(1_000).optional() }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchantId = tenantId(ctx);
      try {
        return await withWooCommerceRequestLock(ctx, merchantId, async () => {
          const order = await getWooCommerceOrderByIdForMerchant(merchantId, input.orderId);
          if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
          const settings = await getWooCommerceSettings(merchantId);
          if (!settings || settings.connectionStatus !== 'connected') {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'اتصال WooCommerce غير جاهز' });
          }
          const canonical = await createWooCommerceClient(settings).updateOrder(order.wooOrderId, {
            status: input.status,
            ...(input.note ? { customer_note: input.note } : {}),
          });
          const normalized = normalizeWooCommerceOrder(merchantId, canonical, wooSyncTimestamp());
          await upsertWooCommerceOrdersSnapshot(merchantId, [normalized], false);
          const updated = await getWooCommerceOrderByIdForMerchant(merchantId, input.orderId);
          if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر قراءة الطلب بعد التحديث' });
          return { success: true, order: orderDto(updated) };
        });
      } catch (error) {
        throw publicWooError(error);
      }
    }),

  sendOrderNotification: permissionProcedure('orders.manage')
    .input(z.object({ orderId: z.number().int().positive(), message: z.string().trim().min(1).max(2_000).optional() }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchantId = tenantId(ctx);
      const order = await getWooCommerceOrderByIdForMerchant(merchantId, input.orderId);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
      if (!order.customerPhone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد رقم هاتف صالح لهذا الطلب' });
      const defaultMessage = `مرحبًا ${order.customerName || ''}\n\nتم تحديث طلبك #${order.orderNumber}.\nالحالة: ${order.status}\nالإجمالي: ${order.total} ${order.currency}`;
      const message = input.message || defaultMessage;
      const messageDigest = crypto.createHash('sha256').update(message, 'utf8').digest('hex').slice(0, 24);
      try {
        const sent = await sendMerchantWhatsApp({
          merchantId,
          idempotencyKey: `woo-order:${merchantId}:${order.wooOrderId}:${order.status}:${messageDigest}`,
          to: order.customerPhone,
          kind: 'text',
          text: message,
          retryFailed: true,
        });
        if (sent.accepted && sent.providerMessageId) {
          return { success: true, messageId: sent.providerMessageId, duplicate: sent.duplicate };
        }
        if (sent.errorCode === 'delivery_in_progress') {
          throw new TRPCError({ code: 'CONFLICT', message: 'حالة تسليم الرسالة غير محسومة؛ لن نعيد إرسالها تلقائيًا' });
        }
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر إرسال الرسالة عبر قناة WhatsApp النشطة' });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof WhatsAppDeliveryStateError) {
          throw new TRPCError({ code: 'CONFLICT', message: 'حالة تسليم الرسالة غير محسومة؛ راجع سجل التسليم قبل المحاولة' });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر الوصول إلى خدمة إرسال WhatsApp' });
      }
    }),

  getSalesStats: permissionProcedure('analytics.read')
    .input(dateRangeInput.extend({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') }))
    .query(async ({ ctx, input }) => {
      const rows = filterOrdersByDate(await getWooCommerceOrdersByMerchant(tenantId(ctx)), dateBounds(input));
      const completed = rows.filter(order => order.status === 'completed');
      const totalRevenue = completed.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const grouped = new Map<string, { revenue: number; orders: number }>();
      for (const order of completed) {
        const date = new Date(order.orderDate);
        let key = date.toISOString().slice(0, 10);
        if (input.period === 'weekly') {
          date.setUTCDate(date.getUTCDate() - date.getUTCDay());
          key = date.toISOString().slice(0, 10);
        } else if (input.period === 'monthly') key = date.toISOString().slice(0, 7);
        const current = grouped.get(key) || { revenue: 0, orders: 0 };
        current.revenue += Number(order.total || 0);
        current.orders += 1;
        grouped.set(key, current);
      }
      return {
        totalRevenue,
        totalOrders: rows.length,
        completedOrders: completed.length,
        pendingOrders: rows.filter(order => order.status === 'pending').length,
        processingOrders: rows.filter(order => order.status === 'processing').length,
        cancelledOrders: rows.filter(order => order.status === 'cancelled').length,
        averageOrderValue: completed.length ? totalRevenue / completed.length : 0,
        chartData: Array.from(grouped, ([date, value]) => ({ date, ...value })).sort((a, b) => a.date.localeCompare(b.date)),
        revenueDefinition: 'completed_orders' as const,
      };
    }),

  getTopProducts: permissionProcedure('analytics.read')
    .input(dateRangeInput.extend({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const rows = filterOrdersByDate(await getWooCommerceOrdersByMerchant(tenantId(ctx)), dateBounds(input))
        .filter(order => order.status === 'completed');
      const products = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (const order of rows) {
        try {
          const items = JSON.parse(order.lineItems || '[]');
          if (!Array.isArray(items)) continue;
          for (const item of items.slice(0, 500)) {
            const name = String(item?.name || '').slice(0, 500);
            if (!name) continue;
            const key = String(item.product_id || name);
            const current = products.get(key) || { name, quantity: 0, revenue: 0 };
            current.quantity += Number(item.quantity || 0);
            current.revenue += Number(item.total || 0);
            products.set(key, current);
          }
        } catch { /* corrupted historical row is excluded */ }
      }
      return Array.from(products.values()).sort((a, b) => b.quantity - a.quantity).slice(0, input.limit);
    }),

  getConversionRate: permissionProcedure('analytics.read').input(dateRangeInput).query(async ({ ctx, input }) => {
    const merchantId = tenantId(ctx);
    const orders = filterOrdersByDate(await getWooCommerceOrdersByMerchant(merchantId), dateBounds(input));
    const conversations = await getConversationsByMerchant(merchantId);
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    return {
      attributionAvailable: false as const,
      totalConversations: conversations.length,
      totalOrders: orders.length,
      completedOrders,
      conversionRate: null,
      completionRate: orders.length ? Math.round((completedOrders / orders.length) * 10_000) / 100 : 0,
      whatsappOrders: null,
      whatsappRevenue: null,
    };
  }),

  getCustomerStats: permissionProcedure('analytics.read').input(dateRangeInput).query(async ({ ctx, input }) => {
    const orders = filterOrdersByDate(await getWooCommerceOrdersByMerchant(tenantId(ctx)), dateBounds(input));
    const counts = new Map<string, number>();
    for (const order of orders) {
      const key = order.customerEmail || order.customerPhone;
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    const singleOrderCustomers = Array.from(counts.values()).filter(count => count === 1).length;
    const repeatCustomers = counts.size - singleOrderCustomers;
    return {
      totalCustomers: counts.size,
      newCustomers: singleOrderCustomers,
      returningCustomers: repeatCustomers,
      repeatCustomerRate: counts.size ? (repeatCustomers / counts.size) * 100 : 0,
      definition: 'orders_in_selected_period' as const,
    };
  }),
});
