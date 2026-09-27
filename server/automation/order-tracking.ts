import { getOrderTrackingLogs } from '../db';
import { enqueueSallaOrderPolls } from '../integrations/salla-webhook-receipts';

/**
 * قوالب رسائل التتبع لكل حالة طلب
 */
export function generateTrackingMessage(
  orderNumber: string,
  status: string,
  customerName: string,
  trackingNumber?: string
): string {
  const messages = {
    paid: `مرحباً ${customerName}! 💳

تم استلام طلبك بنجاح وتأكيد الدفع! ✅

📦 رقم الطلب: ${orderNumber}

سنبدأ بتجهيز طلبك الآن، وسنرسل لك إشعار عند الشحن.

شكراً لثقتك بنا! 🙏`,

    processing: `مرحباً ${customerName}! 📦

طلبك الآن قيد التجهيز! 🔄

📦 رقم الطلب: ${orderNumber}

فريقنا يعمل على تجهيز طلبك بعناية، وسيتم شحنه قريباً.

نقدر صبرك! ⏳`,

    shipped: `مرحباً ${customerName}! 🚚

طلبك في الطريق إليك! 🎉

📦 رقم الطلب: ${orderNumber}
${trackingNumber ? `🔢 رقم التتبع: ${trackingNumber}` : ''}

يمكنك تتبع شحنتك عبر رقم التتبع أعلاه.

سيصلك الطلب خلال 2-3 أيام عمل إن شاء الله. 📅`,

    delivered: `مرحباً ${customerName}! 🎊

تم توصيل طلبك بنجاح! ✅

📦 رقم الطلب: ${orderNumber}

نتمنى أن تكون راضياً عن طلبك! 😊

هل يمكنك تقييم تجربتك معنا؟ نحن نقدر رأيك! ⭐`,

    cancelled: `مرحباً ${customerName}،

للأسف، تم إلغاء طلبك. ❌

📦 رقم الطلب: ${orderNumber}

إذا كان لديك أي استفسار، لا تتردد في التواصل معنا.

نأسف للإزعاج. 🙏`,
  };

  return messages[status as keyof typeof messages] || 
    `تحديث على طلبك ${orderNumber}: الحالة الجديدة هي ${status}`;
}


export function shouldNotifyCustomer(oldStatus: string, newStatus: string): boolean {
  // الحالات التي تتطلب إشعار العميل
  const notifiableTransitions = [
    { from: 'pending', to: 'paid' },
    { from: 'paid', to: 'processing' },
    { from: 'processing', to: 'shipped' },
    { from: 'shipped', to: 'delivered' },
    { from: 'pending', to: 'cancelled' },
    { from: 'paid', to: 'cancelled' },
    { from: 'processing', to: 'cancelled' },
  ];

  return notifiableTransitions.some(
    transition => transition.from === oldStatus && transition.to === newStatus
  );
}


/** Salla polling now shares webhook ownership checks, idempotency and notification delivery. */
export async function checkAllActiveOrders() {
  return enqueueSallaOrderPolls();
}

export async function getOrderTrackingHistory(orderId: number) {
  return getOrderTrackingLogs(orderId);
}
