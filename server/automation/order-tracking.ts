import {
  createOrderTrackingLog,
  getAllSallaConnections,
  getOrderById,
  getOrderTrackingLogs,
  getOrdersByMerchantId,
  getSallaConnectionByMerchantId,
  updateOrderStatus,
} from '../db';
import { sendTextMessage } from '../whatsapp';
import { SallaIntegration } from '../integrations/salla';

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

/**
 * إرسال إشعار تحديث حالة الطلب للعميل
 */
export async function sendOrderStatusUpdate(
  orderId: number,
  newStatus: string,
  trackingNumber?: string
): Promise<boolean> {
  try {
    // الحصول على تفاصيل الطلب
    const order = await getOrderById(orderId);
    if (!order) {
      console.error(`[Order Tracking] Order ${orderId} not found`);
      return false;
    }

    // التحقق من أن الحالة تغيرت
    if (order.status === newStatus) {
      console.log(`[Order Tracking] Order ${orderId} status unchanged: ${newStatus}`);
      return false;
    }

    // توليد رسالة التتبع
    const message = generateTrackingMessage(
      order.orderNumber || `#${order.id}`,
      newStatus,
      order.customerName,
      trackingNumber
    );

    // إرسال الرسالة عبر واتساب
    const result = await sendTextMessage(order.customerPhone, message);

    if (result.success) {
      console.log(`[Order Tracking] Status update sent to ${order.customerPhone} for order ${orderId}`);
      
      // تحديث حالة الطلب في قاعدة البيانات
      await updateOrderStatus(orderId, newStatus as any, trackingNumber);
      
      // تسجيل الإشعار
      await createOrderTrackingLog({
        orderId,
        oldStatus: order.status,
        newStatus,
        trackingNumber,
        notificationSent: 1,
        notificationMessage: message,
      });

      return true;
    } else {
      console.error(`[Order Tracking] Failed to send notification: ${result.error}`);
      
      // تسجيل الفشل
      await createOrderTrackingLog({
        orderId,
        oldStatus: order.status,
        newStatus,
        trackingNumber,
        notificationSent: 0,
        errorMessage: result.error,
      });

      return false;
    }
  } catch (error: any) {
    console.error('[Order Tracking] Error sending status update:', error);
    return false;
  }
}

/**
 * التحقق من حالة الطلب في Salla
 */
export async function checkOrderStatus(
  merchantId: number,
  sallaOrderId: string
): Promise<{ status: string; trackingNumber?: string } | null> {
  try {
    const sallaConnection = await getSallaConnectionByMerchantId(merchantId);
    if (!sallaConnection || sallaConnection.syncStatus !== 'active') {
      console.error(`[Order Tracking] No active Salla connection for merchant ${merchantId}`);
      return null;
    }

    // الحصول على حالة الطلب من Salla
    const sallaIntegration = new SallaIntegration(
      merchantId,
      sallaConnection.accessToken
    );
    
    const orderStatus = await sallaIntegration.getOrderStatus(sallaOrderId);
    return orderStatus;
  } catch (error: any) {
    console.error('[Order Tracking] Error checking order status:', error);
    return null;
  }
}

/**
 * تحديد متى يجب إرسال إشعار للعميل
 */
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

/**
 * معالجة تحديث حالة الطلب
 */
export async function processOrderStatusUpdate(
  orderId: number,
  newStatus: string,
  trackingNumber?: string
): Promise<boolean> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      console.error(`[Order Tracking] Order ${orderId} not found`);
      return false;
    }

    // التحقق من الحاجة لإشعار العميل
    if (shouldNotifyCustomer(order.status, newStatus)) {
      return await sendOrderStatusUpdate(orderId, newStatus, trackingNumber);
    } else {
      // تحديث الحالة فقط بدون إشعار
      await updateOrderStatus(orderId, newStatus as any, trackingNumber);
      
      // تسجيل التحديث
      await createOrderTrackingLog({
        orderId,
        oldStatus: order.status,
        newStatus,
        trackingNumber,
        notificationSent: 0,
      });

      console.log(`[Order Tracking] Order ${orderId} status updated to ${newStatus} (no notification)`);
      return true;
    }
  } catch (error: any) {
    console.error('[Order Tracking] Error processing status update:', error);
    return false;
  }
}

/**
 * التحقق من جميع الطلبات النشطة وتحديث حالتها
 */
export async function checkAllActiveOrders(): Promise<{
  checked: number;
  updated: number;
  notified: number;
  errors: number;
}> {
  const stats = {
    checked: 0,
    updated: 0,
    notified: 0,
    errors: 0,
  };

  try {
    // الحصول على جميع الاتصالات النشطة بـ Salla
    const connections = await getAllSallaConnections();
    
    for (const connection of connections) {
      if (connection.syncStatus !== 'active') continue;

      // الحصول على الطلبات النشطة لهذا التاجر
      const orders = await getOrdersByMerchantId(connection.merchantId);
      const activeOrders = orders.filter(
        order => !['delivered', 'cancelled'].includes(order.status) && order.sallaOrderId
      );

      for (const order of activeOrders) {
        stats.checked++;

        try {
          // التحقق من الحالة في Salla
          const sallaStatus = await checkOrderStatus(
            connection.merchantId,
            order.sallaOrderId!
          );

          if (sallaStatus && sallaStatus.status !== order.status) {
            // الحالة تغيرت - معالجة التحديث
            const notified = await processOrderStatusUpdate(
              order.id,
              sallaStatus.status,
              sallaStatus.trackingNumber
            );

            stats.updated++;
            if (notified) {
              stats.notified++;
            }
          }
        } catch (error) {
          console.error(`[Order Tracking] Error checking order ${order.id}:`, error);
          stats.errors++;
        }

        // تأخير صغير لتجنب Rate Limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('[Order Tracking] Check completed:', stats);
    return stats;
  } catch (error: any) {
    console.error('[Order Tracking] Error checking active orders:', error);
    return stats;
  }
}

/**
 * الحصول على سجل التتبع لطلب معين
 */
export async function getOrderTrackingHistory(orderId: number) {
  return await getOrderTrackingLogs(orderId);
}
