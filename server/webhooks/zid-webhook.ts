/**
 * Zid Webhook Handler
 * معالج Webhooks من منصة زد
 */

import {
  deactivateProductFromZid,
  getMerchantById,
  getWhatsAppConnection,
  saveZidOrder,
  updateProductInventoryFromZid,
  upsertProductFromZid,
} from '../db';

export interface ZidWebhookPayload {
  event: string;
  data: any;
  created_at?: string;
  webhook_id?: string;
}

const EVENT_ALIASES: Readonly<Record<string, string>> = {
  'order.create': 'order.created',
  'order.update': 'order.updated',
  'order.status.update': 'order.updated',
  'order.payment_status.update': 'order.updated',
  'order.cancel': 'order.cancelled',
  'product.create': 'product.created',
  'product.update': 'product.updated',
  'product.publish': 'product.updated',
  'product.delete': 'product.deleted',
  'inventory.update': 'inventory.updated',
};

const MIN_EVENT_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function normalizeZidWebhookOccurredAt(value: unknown, now = new Date()): Date | null {
  if (value === undefined) return now;
  if (typeof value !== 'string' || value.length > 64) return null;
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp)
    || timestamp < MIN_EVENT_TIME_MS
    || timestamp > now.getTime() + MAX_FUTURE_SKEW_MS
  ) return null;
  return new Date(timestamp);
}

export function parseZidWebhookPayload(value: unknown, now = new Date()): ZidWebhookPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.event !== 'string' || !/^[a-z0-9_.-]{1,100}$/i.test(candidate.event)) return null;
  if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) return null;
  if (candidate.webhook_id !== undefined && typeof candidate.webhook_id !== 'string') return null;
  const occurredAt = normalizeZidWebhookOccurredAt(candidate.created_at, now);
  if (!occurredAt) return null;
  return {
    event: candidate.event,
    data: candidate.data,
    created_at: occurredAt.toISOString(),
    webhook_id: candidate.webhook_id,
  };
}

export async function processZidWebhook(
  payload: ZidWebhookPayload,
  merchantId: number,
): Promise<{ success: boolean; message: string }> {
  const event = EVENT_ALIASES[payload.event] || payload.event;
  const occurredAt = normalizeZidWebhookOccurredAt(payload.created_at);
  if (!occurredAt) throw new Error('INVALID_ZID_WEBHOOK_TIME');
  switch (event) {
    case 'order.created':
      await handleOrderCreated(merchantId, payload.data);
      break;
    case 'order.updated':
      await handleOrderUpdated(merchantId, payload.data);
      break;
    case 'order.cancelled':
      await handleOrderCancelled(merchantId, payload.data);
      break;
    case 'product.created':
      await handleProductCreated(merchantId, payload.data, occurredAt);
      break;
    case 'product.updated':
      await handleProductUpdated(merchantId, payload.data, occurredAt);
      break;
    case 'product.deleted':
      await handleProductDeleted(merchantId, payload.data, occurredAt);
      break;
    case 'inventory.updated':
      await handleInventoryUpdated(merchantId, payload.data, occurredAt);
      break;
    default:
      return { success: true, message: 'Unsupported event ignored' };
  }
  return { success: true, message: 'Webhook processed successfully' };
}

/**
 * Handle order.created event
 */
async function handleOrderCreated(
  merchantId: number,
  orderData: any,
) {
  // Save order to zid_orders table
  await saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    zidOrderNumber: orderData.order_number || orderData.reference_id,
    customerName: orderData.customer?.name || orderData.billing_address?.name,
    customerEmail: orderData.customer?.email || orderData.billing_address?.email,
    customerPhone: orderData.customer?.mobile || orderData.customer?.phone || orderData.billing_address?.phone,
    totalAmount: String(orderData.total ?? orderData.total_amount),
    currency: orderData.currency || 'SAR',
    status: mapZidOrderStatus(orderData.status),
    paymentStatus: mapZidPaymentStatus(orderData.payment_status),
    items: orderData.items || orderData.line_items || [],
    shippingMethod: orderData.shipping_method?.name,
    shippingCost: orderData.shipping_cost ? String(orderData.shipping_cost) : undefined,
    orderDate: orderData.created_at,
  });

  // Send WhatsApp notification to merchant
  await sendOrderNotificationToMerchant(merchantId, orderData);

}

/**
 * Handle order.updated event
 */
async function handleOrderUpdated(
  merchantId: number,
  orderData: any,
) {
  // Update order in database
  await saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    zidOrderNumber: orderData.order_number || orderData.reference_id,
    customerName: orderData.customer?.name || orderData.billing_address?.name,
    customerEmail: orderData.customer?.email || orderData.billing_address?.email,
    customerPhone: orderData.customer?.mobile || orderData.customer?.phone || orderData.billing_address?.phone,
    totalAmount: String(orderData.total ?? orderData.total_amount),
    currency: orderData.currency || 'SAR',
    status: mapZidOrderStatus(orderData.status),
    paymentStatus: mapZidPaymentStatus(orderData.payment_status),
    items: orderData.items || orderData.line_items || [],
    shippingMethod: orderData.shipping_method?.name,
    shippingCost: orderData.shipping_cost ? String(orderData.shipping_cost) : undefined,
    orderDate: orderData.created_at,
  });

  // Send WhatsApp notification to customer about order update
  await sendOrderUpdateToCustomer(merchantId, orderData);

}

/**
 * Handle order.cancelled event
 */
async function handleOrderCancelled(
  merchantId: number,
  orderData: any,
) {
  // Update order status
  await saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    status: 'cancelled',
  });

  // Send cancellation notification
  await sendOrderCancellationToCustomer(merchantId, orderData);

}

/**
 * Handle product.created event
 */
async function handleProductCreated(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await upsertProductFromZid(merchantId, productData, occurredAt);
}

/**
 * Handle product.updated event
 */
async function handleProductUpdated(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await upsertProductFromZid(merchantId, productData, occurredAt);
}

/**
 * Handle product.deleted event
 */
async function handleProductDeleted(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await deactivateProductFromZid(merchantId, productData.id, occurredAt);
}

/**
 * Handle inventory.updated event
 */
async function handleInventoryUpdated(
  merchantId: number,
  inventoryData: any,
  occurredAt: Date,
) {
  await updateProductInventoryFromZid(merchantId, inventoryData, occurredAt);
}

/**
 * Map Zid order status to internal status
 */
function mapZidOrderStatus(status: string): 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded' {
  const statusMap: Record<string, any> = {
    'pending': 'pending',
    'processing': 'processing',
    'confirmed': 'processing',
    'shipped': 'processing',
    'delivered': 'completed',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

/**
 * Map Zid payment status to internal status
 */
function mapZidPaymentStatus(status: string): 'pending' | 'paid' | 'failed' | 'refunded' {
  const statusMap: Record<string, any> = {
    'pending': 'pending',
    'paid': 'paid',
    'completed': 'paid',
    'failed': 'failed',
    'refunded': 'refunded',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

/**
 * Send order notification to merchant via WhatsApp
 */
async function sendOrderNotificationToMerchant(merchantId: number, orderData: any) {
  try {
    const { sendMessageWithCredentials } = await import('../whatsapp');
    const merchant = await getMerchantById(merchantId);
    const whatsappConnection = await getWhatsAppConnection(merchantId);

    if (!merchant || !whatsappConnection) {
      console.log('[Zid Webhook] No WhatsApp connection found for merchant');
      return;
    }

    const message = `🛒 *طلب جديد من متجر زد*\n\n` +
      `رقم الطلب: ${orderData.order_number || orderData.reference_id}\n` +
      `العميل: ${orderData.customer?.name || 'غير محدد'}\n` +
      `الإجمالي: ${orderData.total} ${orderData.currency || 'ريال'}\n` +
      `الحالة: ${orderData.status}\n\n` +
      `يمكنك متابعة الطلب من لوحة التحكم.`;

    await (sendMessageWithCredentials as any)(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      merchant.phone || '',
      message,
      // @ts-ignore
      whatsappConnection.apiUrl
    );
  } catch {
    console.error('[Zid Webhook] Merchant notification delivery failed');
  }
}

/**
 * Send order update to customer via WhatsApp
 */
async function sendOrderUpdateToCustomer(merchantId: number, orderData: any) {
  try {
    const { sendMessageWithCredentials } = await import('../whatsapp');
    const whatsappConnection = await getWhatsAppConnection(merchantId);

    if (!whatsappConnection) {
      console.log('[Zid Webhook] No WhatsApp connection found');
      return;
    }

    const customerPhone = orderData.customer?.phone || orderData.billing_address?.phone;
    if (!customerPhone) {
      console.log('[Zid Webhook] No customer phone found');
      return;
    }

    const message = `مرحباً ${orderData.customer?.name || 'عزيزي العميل'},\n\n` +
      `تم تحديث حالة طلبك رقم ${orderData.order_number || orderData.reference_id}\n` +
      `الحالة الجديدة: ${orderData.status}\n\n` +
      `شكراً لثقتك بنا! 🌟`;

    await (sendMessageWithCredentials as any)(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      customerPhone,
      message,
      // @ts-ignore
      whatsappConnection.apiUrl
    );
  } catch {
    console.error('[Zid Webhook] Customer update delivery failed');
  }
}

/**
 * Send order cancellation to customer via WhatsApp
 */
async function sendOrderCancellationToCustomer(merchantId: number, orderData: any) {
  try {
    const { sendMessageWithCredentials } = await import('../whatsapp');
    const whatsappConnection = await getWhatsAppConnection(merchantId);

    if (!whatsappConnection) {
      console.log('[Zid Webhook] No WhatsApp connection found');
      return;
    }

    const customerPhone = orderData.customer?.phone || orderData.billing_address?.phone;
    if (!customerPhone) {
      console.log('[Zid Webhook] No customer phone found');
      return;
    }

    const message = `مرحباً ${orderData.customer?.name || 'عزيزي العميل'},\n\n` +
      `نأسف لإبلاغك بأنه تم إلغاء طلبك رقم ${orderData.order_number || orderData.reference_id}\n\n` +
      `إذا كان لديك أي استفسار، يرجى التواصل معنا.`;

    await (sendMessageWithCredentials as any)(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      customerPhone,
      message,
      // @ts-ignore
      whatsappConnection.apiUrl
    );
  } catch {
    console.error('[Zid Webhook] Cancellation notification delivery failed');
  }
}
