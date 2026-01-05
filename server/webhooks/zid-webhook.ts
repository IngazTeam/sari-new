/**
 * Zid Webhook Handler
 * معالج Webhooks من منصة زد
 */

import * as db from '../db';
import * as dbZid from '../db_zid';
import { verifyZidWebhookSignature } from '../_core/zidApi';

interface ZidWebhookPayload {
  event: string;
  data: any;
  created_at: string;
  webhook_id?: string;
}

/**
 * Process Zid webhook event
 */
export async function processZidWebhook(
  payload: ZidWebhookPayload,
  merchantId: number,
  signature?: string,
  secret?: string
): Promise<{ success: boolean; message: string }> {
  console.log('[Zid Webhook] Processing event:', payload.event);

  try {
    // Verify signature if provided
    if (signature && secret) {
      const isValid = await verifyZidWebhookSignature(
        JSON.stringify(payload),
        signature,
        secret
      );

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Save webhook event to database
    const webhookRecord = await db.saveZidWebhook(merchantId, {
      webhookId: payload.webhook_id,
      eventType: payload.event,
      payload: JSON.stringify(payload),
      status: 'pending',
    });

    try {
      // Process based on event type
      switch (payload.event) {
        case 'order.created':
          await handleOrderCreated(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'order.updated':
          await handleOrderUpdated(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'order.cancelled':
          await handleOrderCancelled(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'product.created':
          await handleProductCreated(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'product.updated':
          await handleProductUpdated(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'product.deleted':
          await handleProductDeleted(merchantId, payload.data, webhookRecord!.id);
          break;

        case 'inventory.updated':
          await handleInventoryUpdated(merchantId, payload.data, webhookRecord!.id);
          break;

        default:
          console.log('[Zid Webhook] Unknown event type:', payload.event);
          await db.updateZidWebhookStatus(webhookRecord!.id, 'processed', 'Unknown event type');
          return { success: true, message: 'Unknown event type' };
      }

      // Mark webhook as processed
      await db.updateZidWebhookStatus(webhookRecord!.id, 'processed');

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error: any) {
      console.error('[Zid Webhook] Processing error:', error);
      await db.updateZidWebhookStatus(webhookRecord!.id, 'failed', error.message);
      throw error;
    }
  } catch (error: any) {
    console.error('[Zid Webhook] Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Handle order.created event
 */
async function handleOrderCreated(
  merchantId: number,
  orderData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling order.created:', orderData.id);

  // Save order to zid_orders table
  await db.saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    zidOrderNumber: orderData.order_number || orderData.reference_id,
    customerName: orderData.customer?.name || orderData.billing_address?.name,
    customerEmail: orderData.customer?.email || orderData.billing_address?.email,
    customerPhone: orderData.customer?.phone || orderData.billing_address?.phone,
    totalAmount: String(orderData.total || orderData.total_amount),
    currency: orderData.currency || 'SAR',
    status: mapZidOrderStatus(orderData.status),
    paymentStatus: mapZidPaymentStatus(orderData.payment_status),
    items: JSON.stringify(orderData.items || orderData.line_items || []),
    shippingAddress: JSON.stringify(orderData.shipping_address || {}),
    shippingMethod: orderData.shipping_method?.name,
    shippingCost: orderData.shipping_cost ? String(orderData.shipping_cost) : undefined,
    orderDate: orderData.created_at,
    zidData: JSON.stringify(orderData),
  });

  // Send WhatsApp notification to merchant
  await sendOrderNotificationToMerchant(merchantId, orderData);

  console.log('[Zid Webhook] Order created successfully');
}

/**
 * Handle order.updated event
 */
async function handleOrderUpdated(
  merchantId: number,
  orderData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling order.updated:', orderData.id);

  // Update order in database
  await db.saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    zidOrderNumber: orderData.order_number || orderData.reference_id,
    customerName: orderData.customer?.name || orderData.billing_address?.name,
    customerEmail: orderData.customer?.email || orderData.billing_address?.email,
    customerPhone: orderData.customer?.phone || orderData.billing_address?.phone,
    totalAmount: String(orderData.total || orderData.total_amount),
    currency: orderData.currency || 'SAR',
    status: mapZidOrderStatus(orderData.status),
    paymentStatus: mapZidPaymentStatus(orderData.payment_status),
    items: JSON.stringify(orderData.items || orderData.line_items || []),
    shippingAddress: JSON.stringify(orderData.shipping_address || {}),
    shippingMethod: orderData.shipping_method?.name,
    shippingCost: orderData.shipping_cost ? String(orderData.shipping_cost) : undefined,
    orderDate: orderData.created_at,
    zidData: JSON.stringify(orderData),
  });

  // Send WhatsApp notification to customer about order update
  await sendOrderUpdateToCustomer(merchantId, orderData);

  console.log('[Zid Webhook] Order updated successfully');
}

/**
 * Handle order.cancelled event
 */
async function handleOrderCancelled(
  merchantId: number,
  orderData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling order.cancelled:', orderData.id);

  // Update order status
  await db.saveZidOrder(merchantId, {
    zidOrderId: String(orderData.id),
    status: 'cancelled',
    zidData: JSON.stringify(orderData),
  });

  // Send cancellation notification
  await sendOrderCancellationToCustomer(merchantId, orderData);

  console.log('[Zid Webhook] Order cancelled successfully');
}

/**
 * Handle product.created event
 */
async function handleProductCreated(
  merchantId: number,
  productData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling product.created:', productData.id);

  // Save product to zid_products table
  await db.saveZidProduct(merchantId, {
    zidProductId: String(productData.id),
    zidSku: productData.sku,
    nameAr: productData.name?.ar || productData.name,
    nameEn: productData.name?.en,
    descriptionAr: productData.description?.ar || productData.description,
    descriptionEn: productData.description?.en,
    price: String(productData.price),
    salePrice: productData.sale_price ? String(productData.sale_price) : undefined,
    currency: productData.currency || 'SAR',
    quantity: productData.quantity || 0,
    isInStock: productData.is_available ? 1 : 0,
    mainImage: productData.main_image || productData.image?.url,
    images: JSON.stringify(productData.images || []),
    categoryId: productData.category?.id ? String(productData.category.id) : undefined,
    categoryName: productData.category?.name,
    isActive: productData.is_active ? 1 : 0,
    isPublished: productData.is_published ? 1 : 0,
    zidData: JSON.stringify(productData),
  });

  console.log('[Zid Webhook] Product created successfully');
}

/**
 * Handle product.updated event
 */
async function handleProductUpdated(
  merchantId: number,
  productData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling product.updated:', productData.id);

  // Update product in database
  await db.saveZidProduct(merchantId, {
    zidProductId: String(productData.id),
    zidSku: productData.sku,
    nameAr: productData.name?.ar || productData.name,
    nameEn: productData.name?.en,
    descriptionAr: productData.description?.ar || productData.description,
    descriptionEn: productData.description?.en,
    price: String(productData.price),
    salePrice: productData.sale_price ? String(productData.sale_price) : undefined,
    currency: productData.currency || 'SAR',
    quantity: productData.quantity || 0,
    isInStock: productData.is_available ? 1 : 0,
    mainImage: productData.main_image || productData.image?.url,
    images: JSON.stringify(productData.images || []),
    categoryId: productData.category?.id ? String(productData.category.id) : undefined,
    categoryName: productData.category?.name,
    isActive: productData.is_active ? 1 : 0,
    isPublished: productData.is_published ? 1 : 0,
    zidData: JSON.stringify(productData),
  });

  console.log('[Zid Webhook] Product updated successfully');
}

/**
 * Handle product.deleted event
 */
async function handleProductDeleted(
  merchantId: number,
  productData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling product.deleted:', productData.id);

  // Mark product as inactive
  const product = await db.getZidProductByZidId(merchantId, String(productData.id));
  if (product) {
    await db.saveZidProduct(merchantId, {
      zidProductId: String(productData.id),
      isActive: 0,
      isPublished: 0,
    });
  }

  console.log('[Zid Webhook] Product deleted successfully');
}

/**
 * Handle inventory.updated event
 */
async function handleInventoryUpdated(
  merchantId: number,
  inventoryData: any,
  webhookId: number
) {
  console.log('[Zid Webhook] Handling inventory.updated:', inventoryData.product_id);

  // Update product quantity
  const product = await db.getZidProductByZidId(merchantId, String(inventoryData.product_id));
  if (product) {
    await db.saveZidProduct(merchantId, {
      zidProductId: String(inventoryData.product_id),
      quantity: inventoryData.quantity || 0,
      isInStock: (inventoryData.quantity || 0) > 0 ? 1 : 0,
    });
  }

  console.log('[Zid Webhook] Inventory updated successfully');
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
    const { sendWhatsAppMessage } = await import('../whatsapp');
    const merchant = await db.getMerchantById(merchantId);
    const whatsappConnection = await db.getWhatsAppConnection(merchantId);

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

    await sendWhatsAppMessage(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      merchant.phone || '',
      message,
      whatsappConnection.apiUrl
    );
  } catch (error) {
    console.error('[Zid Webhook] Error sending merchant notification:', error);
  }
}

/**
 * Send order update to customer via WhatsApp
 */
async function sendOrderUpdateToCustomer(merchantId: number, orderData: any) {
  try {
    const { sendWhatsAppMessage } = await import('../whatsapp');
    const whatsappConnection = await db.getWhatsAppConnection(merchantId);

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

    await sendWhatsAppMessage(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      customerPhone,
      message,
      whatsappConnection.apiUrl
    );
  } catch (error) {
    console.error('[Zid Webhook] Error sending customer update:', error);
  }
}

/**
 * Send order cancellation to customer via WhatsApp
 */
async function sendOrderCancellationToCustomer(merchantId: number, orderData: any) {
  try {
    const { sendWhatsAppMessage } = await import('../whatsapp');
    const whatsappConnection = await db.getWhatsAppConnection(merchantId);

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

    await sendWhatsAppMessage(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      customerPhone,
      message,
      whatsappConnection.apiUrl
    );
  } catch (error) {
    console.error('[Zid Webhook] Error sending cancellation notification:', error);
  }
}

/**
 * Verify Zid webhook signature (wrapper for compatibility)
 */
export function verifyZidSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  return verifyZidWebhookSignature(payload, signature, secret);
}
