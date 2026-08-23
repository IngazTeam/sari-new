import {
  getDb,
  getNotificationTemplateByStatus,
  getNotificationTemplatesByMerchantId,
} from '../db';
import { notificationTemplates } from '../../drizzle/schema';
import { assertRuntimeSchema } from '../db/schema-readiness';

export const ORDER_NOTIFICATION_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type OrderNotificationStatus = typeof ORDER_NOTIFICATION_STATUSES[number];

async function ensureTemplateSchema(): Promise<void> {
  await assertRuntimeSchema('Order notification templates', [{
    table: 'notification_templates',
    columns: ['merchant_id', 'status', 'template', 'enabled'],
    uniqueIndexes: [{ name: 'uq_notification_template_merchant_status', columns: ['merchant_id', 'status'] }],
  }]);
}

// Default notification templates in Arabic
export const defaultTemplates: Record<OrderNotificationStatus, string> = {
  pending: `مرحباً {{customerName}}! 🎉

شكراً لطلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} ريال

سنقوم بمراجعة طلبك والتأكيد عليه قريباً.

شكراً لثقتك بنا! 💙`,

  paid: `مرحباً {{customerName}}! ✅

تم تأكيد دفع طلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} ريال

سيبدأ تجهيز طلبك وفق حالة المتجر.

شكراً لثقتك بنا! 💙`,

  processing: `مرحباً {{customerName}}! 📦

بدأ تجهيز طلبك من {{storeName}}

رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} ريال

شكراً لثقتك بنا! 💙`,

  shipped: `مرحباً {{customerName}}! 🚚

طلبك في الطريق إليك!

📦 *تفاصيل الشحن:*
رقم الطلب: #{{orderNumber}}
رقم التتبع: {{trackingNumber}}

يمكنك متابعة الشحنة باستخدام رقم التتبع المتاح.

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
  await ensureTemplateSchema();
  const template = await getNotificationTemplateByStatus(merchantId, status);
  return template?.enabled ? template.template : null;
}

export async function getOrderNotificationTemplateSettings(merchantId: number) {
  await ensureTemplateSchema();
  const stored = await getNotificationTemplatesByMerchantId(merchantId);
  const byStatus = new Map(stored.map(template => [template.status, template]));
  return ORDER_NOTIFICATION_STATUSES.map(status => {
    const template = byStatus.get(status);
    return {
      status,
      template: template?.template || defaultTemplates[status],
      enabled: template?.enabled === 1,
      updatedAt: template?.updatedAt || null,
    };
  });
}

export async function saveOrderNotificationTemplate(input: {
  merchantId: number;
  status: OrderNotificationStatus;
  template: string;
  enabled: boolean;
}) {
  await ensureTemplateSchema();
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db
    .insert(notificationTemplates)
    .values({
      merchantId: input.merchantId,
      status: input.status,
      template: input.template,
      enabled: input.enabled ? 1 : 0,
      updatedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        template: input.template,
        enabled: input.enabled ? 1 : 0,
        updatedAt,
      },
    });
  return {
    status: input.status,
    template: input.template,
    enabled: input.enabled,
    updatedAt,
  };
}

export async function prepareOrderStatusNotification(
  merchantId: number,
  customerPhone: string,
  status: string,
  orderData: {
    customerName: string;
    storeName: string;
    orderNumber: string;
    total: number;
    trackingNumber?: string;
  },
): Promise<{ customerPhone: string; message: string } | null> {
  const template = await getNotificationTemplate(merchantId, status);
  if (!template) return null;
  const message = fillTemplate(template, orderData);
  if (!message.trim() || message.length > 4096) {
    throw new Error('Order notification template exceeds the WhatsApp text limit');
  }
  return {
    customerPhone,
    message,
  };
}
