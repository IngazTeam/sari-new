/**
 * Tap Payments Webhook Handler
 * 
 * يعالج إشعارات Tap التلقائية عند تغيير حالة الدفع
 * - CAPTURED: دفع ناجح
 * - FAILED: دفع فاشل
 * - REFUNDED: استرجاع المبلغ
 */

import * as crypto from 'node:crypto';
import {
  getBookingById,
  getMerchantById,
  getOrderById,
  getServiceById,
  updateBookingStatus,
  updateOrderStatus,
} from '../db';
import * as dbPayments from '../db_payments';
import { sendMessageWithCredentials } from '../whatsapp';

interface TapWebhookPayload {
  id: string;
  object: string;
  live_mode: boolean;
  api_version: string;
  created: number;
  data: {
    object: {
      id: string;
      object: string;
      live_mode: boolean;
      customer: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        phone: {
          country_code: string;
          number: string;
        };
      };
      amount: number;
      currency: string;
      status: 'INITIATED' | 'ABANDONED' | 'CANCELLED' | 'FAILED' | 'DECLINED' | 'RESTRICTED' | 'CAPTURED' | 'VOID' | 'TIMEDOUT' | 'UNKNOWN';
      description: string;
      metadata: {
        orderId?: string;
        bookingId?: string;
        orderNumber?: string;
        type?: 'order' | 'booking';
        [key: string]: any;
      };
      reference: {
        transaction: string;
        order: string;
        payment: string;
      };
      receipt: {
        id: string;
        email: boolean;
        sms: boolean;
      };
      source: {
        id: string;
        object: string;
        type: string;
        payment_method: string;
      };
      redirect: {
        status: string;
        url: string;
      };
      post: {
        status: string;
        url: string;
      };
      response: {
        code: string;
        message: string;
      };
      created: number;
    };
  };
}

/**
 * التحقق من توقيع Tap Webhook
 */
export function verifyTapSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const computedSignature = hmac.digest('hex');
    // SEC-05 FIX: Use timingSafeEqual to prevent timing attacks
    if (computedSignature.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(signature));
  } catch (error) {
    console.error('[TapWebhook] Error verifying signature:', error);
    return false;
  }
}

/**
 * معالجة webhook من Tap
 */
export async function processTapWebhook(
  payload: TapWebhookPayload
): Promise<{ success: boolean; message: string }> {
  try {
    const charge = payload.data.object;
    const chargeId = charge.id;
    const status = charge.status;
    const metadata = charge.metadata;

    console.log(`[TapWebhook] Processing webhook for charge ${chargeId}, status: ${status}`);

    // البحث عن المعاملة في قاعدة البيانات
    const payment = await dbPayments.getPaymentByTapChargeId(chargeId);

    if (!payment) {
      console.warn(`[TapWebhook] Payment not found for charge ${chargeId}`);
      return { success: false, message: 'Payment not found' };
    }

    // تحديث حالة المعاملة
    const newStatus = mapTapStatusToPaymentStatus(status);
    await dbPayments.updatePaymentStatus(payment.id, newStatus, {
      tapResponse: JSON.stringify(charge)
    });

    // معالجة حسب نوع المعاملة
    if (metadata.type === 'order' && metadata.orderId) {
      await handleOrderPayment(
        parseInt(metadata.orderId),
        status,
        payment.merchantId,
        charge.customer.phone.country_code + charge.customer.phone.number
      );
    } else if (metadata.type === 'booking' && metadata.bookingId) {
      await handleBookingPayment(
        parseInt(metadata.bookingId),
        status,
        payment.merchantId,
        charge.customer.phone.country_code + charge.customer.phone.number
      );
    }

    // حفظ سجل الـ webhook
    await dbPayments.createWebhookLog({
      merchantId: payment.merchantId,
      paymentId: payment.id,
      provider: 'tap',
      eventType: status,
      payload: JSON.stringify(payload),
      processedAt: new Date()
    });

    return { success: true, message: 'Webhook processed successfully' };
  } catch (error) {
    console.error('[TapWebhook] Error processing webhook:', error);
    return { success: false, message: 'Error processing webhook' };
  }
}

/**
 * تحويل حالة Tap إلى حالة الدفع في النظام
 */
function mapTapStatusToPaymentStatus(
  tapStatus: string
): 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled' {
  switch (tapStatus) {
    case 'CAPTURED':
      return 'completed';
    case 'FAILED':
    case 'DECLINED':
    case 'TIMEDOUT':
      return 'failed';
    case 'CANCELLED':
    case 'ABANDONED':
      return 'cancelled';
    case 'VOID':
      return 'refunded';
    case 'INITIATED':
      return 'processing';
    default:
      return 'pending';
  }
}

/**
 * معالجة دفع الطلب
 */
async function handleOrderPayment(
  orderId: number,
  status: string,
  merchantId: number,
  customerPhone: string
): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      console.warn(`[TapWebhook] Order ${orderId} not found`);
      return;
    }

    if (status === 'CAPTURED') {
      // دفع ناجح
      await updateOrderStatus(orderId, 'paid');

      // إرسال إشعار للعميل
      const successMessage = `✅ *تم استلام الدفع بنجاح!*

📦 *رقم الطلب:* ${order.orderNumber}
💰 *المبلغ:* ${order.totalAmount} ريال

🎉 طلبك قيد المعالجة الآن
📱 سنرسل لك تحديثات عن حالة الشحن

شكراً لثقتك بنا! 🌟`;

      // Send payment success WhatsApp notification
      try {
        const merchant = await getMerchantById(merchantId);
        if ((merchant as any)?.instanceId && (merchant as any)?.apiToken) {
          await sendMessageWithCredentials((merchant as any).instanceId, (merchant as any).apiToken, 'https://api.green-api.com', customerPhone, successMessage);
          console.log(`[TapWebhook] ✅ Payment success message sent for order ${orderId}`);
        }
      } catch (msgErr) {
        console.warn(`[TapWebhook] Failed to send success message: ${msgErr}`);
      }

    } else if (status === 'FAILED' || status === 'DECLINED') {
      // دفع فاشل
      await updateOrderStatus(orderId, 'cancelled');

      const failureMessage = `❌ *فشلت عملية الدفع*

📦 *رقم الطلب:* ${order.orderNumber}

يرجى المحاولة مرة أخرى أو التواصل معنا للمساعدة.

نعتذر عن الإزعاج 🙏`;

      // Send payment failure WhatsApp notification
      try {
        const merchant = await getMerchantById(merchantId);
        if ((merchant as any)?.instanceId && (merchant as any)?.apiToken) {
          await sendMessageWithCredentials((merchant as any).instanceId, (merchant as any).apiToken, 'https://api.green-api.com', customerPhone, failureMessage);
          console.log(`[TapWebhook] ⚠️ Payment failure message sent for order ${orderId}`);
        }
      } catch (msgErr) {
        console.warn(`[TapWebhook] Failed to send failure message: ${msgErr}`);
      }
    }
  } catch (error) {
    console.error('[TapWebhook] Error handling order payment:', error);
  }
}

/**
 * معالجة دفع الحجز
 */
async function handleBookingPayment(
  bookingId: number,
  status: string,
  merchantId: number,
  customerPhone: string
): Promise<void> {
  try {
    const booking = await getBookingById(bookingId);
    if (!booking) {
      console.warn(`[TapWebhook] Booking ${bookingId} not found`);
      return;
    }

    const service = await getServiceById(booking.serviceId);
    const serviceName = service?.name || 'الخدمة';

    if (status === 'CAPTURED') {
      // دفع ناجح
      await updateBookingStatus(bookingId, 'confirmed');

      const successMessage = `✅ *تم تأكيد حجزك!*

📅 *الخدمة:* ${serviceName}
📆 *التاريخ:* ${booking.bookingDate}
⏰ *الوقت:* ${booking.startTime}
💰 *المبلغ:* ${booking.finalPrice} ريال

🎉 حجزك مؤكد الآن
📱 سنرسل لك تذكير قبل الموعد

نتطلع لخدمتك! 💚`;

      // Send booking confirmation WhatsApp notification
      try {
        const merchant = await getMerchantById(merchantId);
        if ((merchant as any)?.instanceId && (merchant as any)?.apiToken) {
          await sendMessageWithCredentials((merchant as any).instanceId, (merchant as any).apiToken, 'https://api.green-api.com', customerPhone, successMessage);
          console.log(`[TapWebhook] ✅ Booking confirmation sent for booking ${bookingId}`);
        }
      } catch (msgErr) {
        console.warn(`[TapWebhook] Failed to send booking confirmation: ${msgErr}`);
      }

    } else if (status === 'FAILED' || status === 'DECLINED') {
      // دفع فاشل
      await updateBookingStatus(bookingId, 'cancelled');

      const failureMessage = `❌ *فشلت عملية الدفع*

📅 *الحجز:* ${serviceName}
📆 *التاريخ:* ${booking.bookingDate}

يرجى المحاولة مرة أخرى أو التواصل معنا للمساعدة.

نعتذر عن الإزعاج 🙏`;

      // Send booking failure WhatsApp notification
      try {
        const merchant = await getMerchantById(merchantId);
        if ((merchant as any)?.instanceId && (merchant as any)?.apiToken) {
          await sendMessageWithCredentials((merchant as any).instanceId, (merchant as any).apiToken, 'https://api.green-api.com', customerPhone, failureMessage);
          console.log(`[TapWebhook] ⚠️ Booking payment failure sent for booking ${bookingId}`);
        }
      } catch (msgErr) {
        console.warn(`[TapWebhook] Failed to send booking failure message: ${msgErr}`);
      }
    }
  } catch (error) {
    console.error('[TapWebhook] Error handling booking payment:', error);
  }
}
