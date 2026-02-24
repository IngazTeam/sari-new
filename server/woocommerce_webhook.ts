/**
 * WooCommerce Webhook Handler
 * 
 * Handles incoming webhooks from WooCommerce for real-time synchronization
 */

import { Request, Response } from 'express';
import * as db from './db';
import crypto from 'node:crypto';

/**
 * Verify WooCommerce webhook signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    return hash === signature;
  } catch (error) {
    console.error('[WooCommerce Webhook] Error verifying signature:', error);
    return false;
  }
}

/**
 * Handle WooCommerce webhook
 */
export async function handleWooCommerceWebhook(req: Request, res: Response) {
  try {
    // Get webhook topic from header
    const topic = req.headers['x-wc-webhook-topic'] as string;
    const signature = req.headers['x-wc-webhook-signature'] as string;
    const webhookId = req.headers['x-wc-webhook-id'] as string;
    const deliveryId = req.headers['x-wc-webhook-delivery-id'] as string;

    if (!topic) {
      return res.status(400).json({ error: 'Missing webhook topic' });
    }

    console.log(`[WooCommerce Webhook] Received: ${topic} (ID: ${webhookId})`);

    // Get payload
    const payload = req.body;
    const payloadString = JSON.stringify(payload);

    // Extract merchant ID from webhook URL or payload
    // Assuming webhook URL format: /api/webhooks/woocommerce/:merchantId
    const merchantId = parseInt(req.params.merchantId || '0');

    if (!merchantId) {
      return res.status(400).json({ error: 'Missing merchant ID' });
    }

    // Get merchant's WooCommerce settings to verify signature
    const settings = await db.getWooCommerceSettings(merchantId);

    if (!settings) {
      return res.status(404).json({ error: 'WooCommerce settings not found' });
    }

    // Verify signature if webhook secret is configured
    if (settings.webhookSecret && signature) {
      const isValid = verifyWebhookSignature(payloadString, signature, settings.webhookSecret);

      if (!isValid) {
        console.error('[WooCommerce Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Log webhook event
    const webhookLogId = await db.createWooCommerceWebhook({
      merchantId,
      topic,
      payload: payloadString,
      status: 'pending',
      webhookId: webhookId || null,
      deliveryId: deliveryId || null,
    });

    // Process webhook based on topic
    try {
      switch (topic) {
        case 'order.created':
          await handleOrderCreated(merchantId, payload);
          break;

        case 'order.updated':
          await handleOrderUpdated(merchantId, payload);
          break;

        case 'order.deleted':
          await handleOrderDeleted(merchantId, payload);
          break;

        case 'product.created':
          await handleProductCreated(merchantId, payload);
          break;

        case 'product.updated':
          await handleProductUpdated(merchantId, payload);
          break;

        case 'product.deleted':
          await handleProductDeleted(merchantId, payload);
          break;

        default:
          console.log(`[WooCommerce Webhook] Unhandled topic: ${topic}`);
      }

      // Update webhook log status
      await db.updateWooCommerceWebhook(webhookLogId, {
        status: 'processed',
        processedAt: new Date().toISOString(),
      });

      return res.status(200).json({ success: true, message: 'Webhook processed' });

    } catch (error: any) {
      console.error('[WooCommerce Webhook] Processing error:', error);

      // Update webhook log with error
      await db.updateWooCommerceWebhook(webhookLogId, {
        status: 'failed',
        errorMessage: error.message,
        processedAt: new Date().toISOString(),
      });

      return res.status(500).json({ error: 'Webhook processing failed' });
    }

  } catch (error: any) {
    console.error('[WooCommerce Webhook] Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle order.created webhook
 */
async function handleOrderCreated(merchantId: number, order: any) {
  console.log(`[WooCommerce Webhook] Processing order.created: ${order.id}`);

  try {
    // Check if order already exists
    const existingOrder = await db.getWooCommerceOrderByWooId(merchantId, order.id);

    if (existingOrder) {
      console.log(`[WooCommerce Webhook] Order ${order.id} already exists, updating instead`);
      await handleOrderUpdated(merchantId, order);
      return;
    }

    // Create new order
    await db.createWooCommerceOrder({
      merchantId,
      wooOrderId: order.id,
      orderNumber: order.number,
      customerName: `${order.billing.first_name} ${order.billing.last_name}`,
      customerEmail: order.billing.email || null,
      customerPhone: order.billing.phone || null,
      status: order.status,
      currency: order.currency,
      total: order.total,
      subtotal: order.subtotal || '0',
      shippingTotal: order.shipping_total || '0',
      taxTotal: order.total_tax || '0',
      discountTotal: order.discount_total || '0',
      paymentMethod: order.payment_method || null,
      paymentMethodTitle: order.payment_method_title || null,
      shippingAddress: JSON.stringify(order.shipping),
      billingAddress: JSON.stringify(order.billing),
      lineItems: JSON.stringify(order.line_items),
      orderNotes: order.customer_note || null,
      notificationSent: 0,
      wooCreatedAt: order.date_created,
      wooUpdatedAt: order.date_modified || order.date_created,
    });

    console.log(`[WooCommerce Webhook] Order ${order.id} created successfully`);

    // Send WhatsApp notification to customer
    if (order.billing.phone) {
      await sendOrderNotificationToCustomer(merchantId, order);
    }

  } catch (error) {
    console.error('[WooCommerce Webhook] Error creating order:', error);
    throw error;
  }
}

/**
 * Handle order.updated webhook
 */
async function handleOrderUpdated(merchantId: number, order: any) {
  console.log(`[WooCommerce Webhook] Processing order.updated: ${order.id}`);

  try {
    const existingOrder = await db.getWooCommerceOrderByWooId(merchantId, order.id);

    if (!existingOrder) {
      console.log(`[WooCommerce Webhook] Order ${order.id} not found, creating instead`);
      await handleOrderCreated(merchantId, order);
      return;
    }

    // Update order
    await db.updateWooCommerceOrder(existingOrder.id, {
      status: order.status,
      total: order.total,
      subtotal: order.subtotal || '0',
      shippingTotal: order.shipping_total || '0',
      taxTotal: order.total_tax || '0',
      discountTotal: order.discount_total || '0',
      shippingAddress: JSON.stringify(order.shipping),
      billingAddress: JSON.stringify(order.billing),
      lineItems: JSON.stringify(order.line_items),
      orderNotes: order.customer_note || null,
      wooUpdatedAt: order.date_modified || new Date().toISOString(),
    });

    console.log(`[WooCommerce Webhook] Order ${order.id} updated successfully`);

    // Send status update notification if status changed
    if (existingOrder.status !== order.status && order.billing.phone) {
      await sendOrderStatusUpdateNotification(merchantId, order, existingOrder.status, order.status);
    }

  } catch (error) {
    console.error('[WooCommerce Webhook] Error updating order:', error);
    throw error;
  }
}

/**
 * Handle order.deleted webhook
 */
async function handleOrderDeleted(merchantId: number, order: any) {
  console.log(`[WooCommerce Webhook] Processing order.deleted: ${order.id}`);

  try {
    const existingOrder = await db.getWooCommerceOrderByWooId(merchantId, order.id);

    if (existingOrder) {
      await db.deleteWooCommerceOrder(existingOrder.id);
      console.log(`[WooCommerce Webhook] Order ${order.id} deleted successfully`);
    }

  } catch (error) {
    console.error('[WooCommerce Webhook] Error deleting order:', error);
    throw error;
  }
}

/**
 * Handle product.created webhook
 */
async function handleProductCreated(merchantId: number, product: any) {
  console.log(`[WooCommerce Webhook] Processing product.created: ${product.id}`);

  try {
    const existingProduct = await db.getWooCommerceProductByWooId(merchantId, product.id);

    if (existingProduct) {
      console.log(`[WooCommerce Webhook] Product ${product.id} already exists, updating instead`);
      await handleProductUpdated(merchantId, product);
      return;
    }

    await db.createWooCommerceProduct({
      merchantId,
      wooProductId: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      status: product.status,
      description: product.description || null,
      shortDescription: product.short_description || null,
      sku: product.sku || null,
      price: product.price || '0',
      regularPrice: product.regular_price || null,
      salePrice: product.sale_price || null,
      stockQuantity: product.stock_quantity || null,
      stockStatus: product.stock_status || null,
      categories: JSON.stringify(product.categories),
      tags: JSON.stringify(product.tags),
      images: JSON.stringify(product.images),
      attributes: JSON.stringify(product.attributes),
      variations: product.variations ? JSON.stringify(product.variations) : null,
      permalink: product.permalink || null,
      wooCreatedAt: product.date_created,
      wooUpdatedAt: product.date_modified || product.date_created,
    });

    console.log(`[WooCommerce Webhook] Product ${product.id} created successfully`);

  } catch (error) {
    console.error('[WooCommerce Webhook] Error creating product:', error);
    throw error;
  }
}

/**
 * Handle product.updated webhook
 */
async function handleProductUpdated(merchantId: number, product: any) {
  console.log(`[WooCommerce Webhook] Processing product.updated: ${product.id}`);

  try {
    const existingProduct = await db.getWooCommerceProductByWooId(merchantId, product.id);

    if (!existingProduct) {
      console.log(`[WooCommerce Webhook] Product ${product.id} not found, creating instead`);
      await handleProductCreated(merchantId, product);
      return;
    }

    await db.updateWooCommerceProduct(existingProduct.id, {
      name: product.name,
      slug: product.slug,
      type: product.type,
      status: product.status,
      description: product.description || null,
      shortDescription: product.short_description || null,
      sku: product.sku || null,
      price: product.price || '0',
      regularPrice: product.regular_price || null,
      salePrice: product.sale_price || null,
      stockQuantity: product.stock_quantity || null,
      stockStatus: product.stock_status || null,
      categories: JSON.stringify(product.categories),
      tags: JSON.stringify(product.tags),
      images: JSON.stringify(product.images),
      attributes: JSON.stringify(product.attributes),
      variations: product.variations ? JSON.stringify(product.variations) : null,
      permalink: product.permalink || null,
      wooUpdatedAt: product.date_modified || new Date().toISOString(),
    });

    console.log(`[WooCommerce Webhook] Product ${product.id} updated successfully`);

  } catch (error) {
    console.error('[WooCommerce Webhook] Error updating product:', error);
    throw error;
  }
}

/**
 * Handle product.deleted webhook
 */
async function handleProductDeleted(merchantId: number, product: any) {
  console.log(`[WooCommerce Webhook] Processing product.deleted: ${product.id}`);

  try {
    const existingProduct = await db.getWooCommerceProductByWooId(merchantId, product.id);

    if (existingProduct) {
      await db.deleteWooCommerceProduct(existingProduct.id);
      console.log(`[WooCommerce Webhook] Product ${product.id} deleted successfully`);
    }

  } catch (error) {
    console.error('[WooCommerce Webhook] Error deleting product:', error);
    throw error;
  }
}

/**
 * Send order notification to customer via WhatsApp
 */
async function sendOrderNotificationToCustomer(merchantId: number, order: any) {
  try {
    const whatsappConnection = await db.getWhatsAppConnectionByMerchantId(merchantId);

    if (!whatsappConnection || !whatsappConnection.isActive) {
      console.log('[WooCommerce Webhook] WhatsApp not connected, skipping notification');
      return;
    }

    const customerName = `${order.billing.first_name} ${order.billing.last_name}`;
    const message = `
مرحباً ${customerName}! 👋

شكراً لطلبك من متجرنا! 🎉

📦 رقم الطلب: #${order.number}
💰 المبلغ الإجمالي: ${order.total} ${order.currency}
📅 التاريخ: ${new Date(order.date_created).toLocaleDateString('ar-SA')}

المنتجات:
${order.line_items.map((item: any, index: number) => `${index + 1}. ${item.name} × ${item.quantity}`).join('\n')}

سنقوم بمعالجة طلبك في أقرب وقت ممكن.

شكراً لثقتك بنا! 🙏
    `.trim();

    const { sendWhatsAppMessage } = await import('./whatsapp');
    await sendWhatsAppMessage(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      order.billing.phone,
      message
    );

    console.log(`[WooCommerce Webhook] Order notification sent to ${order.billing.phone}`);

  } catch (error) {
    console.error('[WooCommerce Webhook] Error sending order notification:', error);
  }
}

/**
 * Send order status update notification to customer
 */
async function sendOrderStatusUpdateNotification(
  merchantId: number,
  order: any,
  oldStatus: string,
  newStatus: string
) {
  try {
    const whatsappConnection = await db.getWhatsAppConnectionByMerchantId(merchantId);

    if (!whatsappConnection || !whatsappConnection.isActive) {
      console.log('[WooCommerce Webhook] WhatsApp not connected, skipping notification');
      return;
    }

    const statusMap: Record<string, string> = {
      'pending': 'قيد الانتظار',
      'processing': 'قيد المعالجة',
      'on-hold': 'معلق',
      'completed': 'مكتمل',
      'cancelled': 'ملغي',
      'refunded': 'مسترجع',
      'failed': 'فاشل',
    };

    const customerName = `${order.billing.first_name} ${order.billing.last_name}`;
    const statusAr = statusMap[newStatus] || newStatus;

    const message = `
مرحباً ${customerName}! 👋

تم تحديث حالة طلبك #${order.number}

الحالة الجديدة: ${statusAr}

شكراً لثقتك بنا! 🙏
    `.trim();

    const { sendWhatsAppMessage } = await import('./whatsapp');
    await sendWhatsAppMessage(
      whatsappConnection.instanceId,
      whatsappConnection.apiToken,
      order.billing.phone,
      message
    );

    console.log(`[WooCommerce Webhook] Status update notification sent to ${order.billing.phone}`);

  } catch (error) {
    console.error('[WooCommerce Webhook] Error sending status update notification:', error);
  }
}
