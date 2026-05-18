import {
  createNotificationTemplate,
  createOrderNotification,
  getNotificationTemplateByStatus,
  updateOrderNotification,
} from '../db';
import { sendTextMessage } from '../whatsapp';

// Default notification templates in Arabic
export const defaultTemplates = {
  pending: `مرحباً {{customerName}}! 🎉

شكراً لطلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} ريال

سنقوم بمراجعة طلبك والتأكيد عليه قريباً.

شكراً لثقتك بنا! 💙`,

  confirmed: `مرحباً {{customerName}}! ✅

تم تأكيد طلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} ريال

سنبدأ بتجهيز طلبك الآن!

شكراً لثقتك بنا! 💙`,

  shipped: `مرحباً {{customerName}}! 🚚

طلبك في الطريق إليك!

📦 *تفاصيل الشحن:*
رقم الطلب: #{{orderNumber}}
رقم التتبع: {{trackingNumber}}

سيصلك الطلب خلال 2-3 أيام عمل.

شكراً لثقتك بنا! 💙`,

  delivered: `مرحباً {{customerName}}! 🎁

تم توصيل طلبك بنجاح!

📦 رقم الطلب: #{{orderNumber}}

نتمنى أن تكون راضياً عن منتجاتنا!
نسعد بتقييمك لتجربتك معنا 🌟

شكراً لثقتك بنا! 💙`,

  cancelled: `مرحباً {{customerName}}

تم إلغاء طلبك من {{storeName}}

📦 رقم الطلب: #{{orderNumber}}

إذا كان هناك أي استفسار، نحن هنا لمساعدتك!

نتطلع لخدمتك قريباً 💙`
};

// Replace template variables with actual values
export function fillTemplate(template: string, data: {
  customerName: string;
  storeName: string;
  orderNumber: string;
  total: number;
  trackingNumber?: string;
}): string {
  return template
    .replace(/{{customerName}}/g, data.customerName)
    .replace(/{{storeName}}/g, data.storeName)
    .replace(/{{orderNumber}}/g, data.orderNumber)
    .replace(/{{total}}/g, data.total.toString())
    .replace(/{{trackingNumber}}/g, data.trackingNumber || 'غير متوفر');
}

// Get notification template for a specific status
export async function getNotificationTemplate(merchantId: number, status: string): Promise<string | null> {
  const template = await getNotificationTemplateByStatus(merchantId, status);
  
  if (template && template.enabled) {
    return template.template;
  }
  
  // Return default template if no custom template found
  return defaultTemplates[status as keyof typeof defaultTemplates] || null;
}

// Send order notification via WhatsApp
export async function sendOrderNotification(
  orderId: number,
  merchantId: number,
  customerPhone: string,
  status: string,
  orderData: {
    customerName: string;
    storeName: string;
    orderNumber: string;
    total: number;
    trackingNumber?: string;
  }
): Promise<boolean> {
  try {
    // Get template
    const template = await getNotificationTemplate(merchantId, status);
    
    if (!template) {
      console.log(`[Order Notification] No template found for status: ${status}`);
      return false;
    }
    
    // Fill template with data
    const message = fillTemplate(template, orderData);
    
    // Create notification record
    const notification = await createOrderNotification({
      orderId,
      merchantId,
      customerPhone,
      status,
      message,
      sent: false,
    });
    
    if (!notification) {
      console.error('[Order Notification] Failed to create notification record');
      return false;
    }
    
    // Send WhatsApp message
    const result = await sendTextMessage(customerPhone, message);
    const sent = result.success;
    
    // Update notification status
    await updateOrderNotification(notification.id, {
      sent,
      sentAt: sent ? new Date() : undefined,
      error: sent ? undefined : result.error || 'Failed to send WhatsApp message',
    });
    
    console.log(`[Order Notification] Sent ${status} notification for order #${orderData.orderNumber}: ${sent}`);
    
    return sent;
  } catch (error) {
    console.error('[Order Notification] Error:', error);
    return false;
  }
}

// Initialize default templates for a merchant
export async function initializeDefaultTemplates(merchantId: number): Promise<void> {
  const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  
  for (const status of statuses) {
    const existing = await getNotificationTemplateByStatus(merchantId, status);
    
    if (!existing) {
      await createNotificationTemplate({
        merchantId,
        status,
        template: defaultTemplates[status as keyof typeof defaultTemplates],
        enabled: true,
      });
    }
  }
  
  console.log(`[Order Notification] Initialized default templates for merchant ${merchantId}`);
}
