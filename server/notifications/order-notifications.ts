export const ORDER_NOTIFICATION_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type OrderNotificationStatus = typeof ORDER_NOTIFICATION_STATUSES[number];

// Default notification templates in Arabic
export const defaultTemplates: Record<OrderNotificationStatus, string> = {
  pending: `مرحباً {{customerName}}! 🎉

شكراً لطلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} {{currency}}

سنقوم بمراجعة طلبك والتأكيد عليه قريباً.

شكراً لثقتك بنا! 💙`,

  paid: `مرحباً {{customerName}}! ✅

تم تأكيد دفع طلبك من {{storeName}}

📦 *تفاصيل الطلب:*
رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} {{currency}}

سيبدأ تجهيز طلبك وفق حالة المتجر.

شكراً لثقتك بنا! 💙`,

  processing: `مرحباً {{customerName}}! 📦

بدأ تجهيز طلبك من {{storeName}}

رقم الطلب: #{{orderNumber}}
الإجمالي: {{total}} {{currency}}

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
