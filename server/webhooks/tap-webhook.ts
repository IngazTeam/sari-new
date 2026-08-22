/**
 * Tap Payments Webhook Handler
 * 
 * يعالج إشعارات Tap التلقائية عند تغيير حالة الدفع
 * - CAPTURED: دفع ناجح
 * - FAILED: دفع فاشل
 * - REFUNDED: استرجاع المبلغ
 */

import {
  getBookingById,
  getMerchantById,
  getOrderById,
  getServiceById,
  updateBookingStatus,
  updateOrderStatus,
} from '../db';
import * as dbPayments from '../db_payments';
import { readPaymentLinkId } from '../payment/payment-link-policy';
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
      status: 'INITIATED' | 'AUTHORIZED' | 'ABANDONED' | 'CANCELLED' | 'FAILED' | 'DECLINED' | 'RESTRICTED' | 'CAPTURED' | 'VOID' | 'TIMEDOUT' | 'UNKNOWN' | 'REFUNDED';
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
        gateway?: string;
      };
      transaction?: { created?: string | number };
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

export type StoredTapPaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded';
type TapTransitionStatus = 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export type TapWebhookTransition =
  | { kind: 'transition'; status: TapTransitionStatus }
  | { kind: 'noop' }
  | { kind: 'invalid' };

export function planTapWebhookTransition(
  current: StoredTapPaymentStatus,
  tapStatus: string,
): TapWebhookTransition {
  if (tapStatus === 'INITIATED') return { kind: 'noop' };
  if (tapStatus === 'AUTHORIZED') {
    if (current === 'pending') return { kind: 'transition', status: 'processing' };
    return current === 'authorized' || current === 'captured' || current === 'refunded'
      ? { kind: 'noop' }
      : { kind: 'invalid' };
  }
  if (tapStatus === 'CAPTURED') {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'completed' };
    return current === 'captured' || current === 'refunded' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (tapStatus === 'REFUNDED') {
    if (current === 'captured') return { kind: 'transition', status: 'refunded' };
    return current === 'refunded' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (['FAILED', 'DECLINED', 'TIMEDOUT', 'RESTRICTED', 'UNKNOWN'].includes(tapStatus)) {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'failed' };
    return current === 'failed' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (['CANCELLED', 'ABANDONED', 'VOID'].includes(tapStatus)) {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'cancelled' };
    return current === 'cancelled' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}

/**
 * معالجة webhook من Tap
 */
export async function processTapWebhook(
  payload: TapWebhookPayload,
  expected: { testMode: boolean },
): Promise<{ success: boolean; message: string }> {
  try {
    const charge = payload.data.object;
    const chargeId = charge.id;
    const status = charge.status;

    // البحث عن المعاملة في قاعدة البيانات
    const payment = await dbPayments.getPaymentByTapChargeId(chargeId);

    if (!payment) {
      console.warn('[TapWebhook] Payment not found for signed charge');
      return { success: false, message: 'Payment not found' };
    }

    const receivedAmountInHalalas = Number.isFinite(Number(charge.amount))
      ? Math.round(Number(charge.amount) * 100)
      : Number.NaN;
    if (
      receivedAmountInHalalas !== payment.amount
      || charge.currency !== payment.currency
      || typeof charge.live_mode !== 'boolean'
      || charge.live_mode !== !expected.testMode
    ) {
      console.warn('[TapWebhook] Tap amount, currency, or mode mismatch', {
        merchantId: payment.merchantId,
        paymentId: payment.id,
      });
      return { success: false, message: 'Tap payment identity mismatch' };
    }

    const transition = planTapWebhookTransition(payment.status, status);
    if (transition.kind === 'invalid') {
      console.warn('[TapWebhook] Ignored invalid or out-of-order Tap transition', {
        merchantId: payment.merchantId,
        paymentId: payment.id,
        currentStatus: payment.status,
        providerStatus: status,
      });
      return { success: true, message: 'Invalid Tap transition ignored' };
    }
    if (transition.kind === 'noop') {
      return { success: true, message: 'Webhook already reflected locally' };
    }

    const tapResponseSummary = JSON.stringify({
      status,
      amount: Number(charge.amount),
      currency: charge.currency,
      liveMode: charge.live_mode,
    });
    const transitioned = await dbPayments.transitionPaymentStatus(
      payment.id,
      payment.status,
      transition.status,
      { tapResponse: tapResponseSummary },
    );
    if (!transitioned) {
      return { success: true, message: 'Webhook already processed (concurrent duplicate)' };
    }

    const paymentLinkId = readPaymentLinkId(payment.metadata);
    if (paymentLinkId) {
      if (transition.status === 'completed') {
        await dbPayments.incrementPaymentLinkUsage(paymentLinkId, payment.amount, true, payment.merchantId);
      } else if (transition.status === 'failed' || transition.status === 'cancelled') {
        await dbPayments.incrementPaymentLinkUsage(paymentLinkId, payment.amount, false, payment.merchantId);
      }
    }

    // Resource identity comes from the tenant-scoped local payment intent, never
    // from merchant-controlled provider metadata echoed in the webhook.
    let localMetadata: Record<string, unknown> = {};
    try {
      const parsed = payment.metadata ? JSON.parse(payment.metadata) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) localMetadata = parsed;
    } catch {
      localMetadata = {};
    }
    const localConversationId = Number(localMetadata.conversationId);
    if (payment.orderId) {
      await handleOrderPayment(
        payment.orderId,
        status,
        payment.merchantId,
        payment.customerPhone,
        Number.isSafeInteger(localConversationId) && localConversationId > 0 ? localConversationId : undefined,
      );
    } else if (payment.bookingId) {
      await handleBookingPayment(
        payment.bookingId,
        status,
        payment.merchantId,
        payment.customerPhone,
      );
    }

    // حفظ سجل الـ webhook
    await dbPayments.createWebhookLog({
      merchantId: payment.merchantId,
      paymentId: payment.id,
      provider: 'tap',
      eventType: status,
      processedAt: new Date()
    });

    return { success: true, message: 'Webhook processed successfully' };
  } catch (error) {
    console.error('[TapWebhook] Error processing webhook:', error);
    return { success: false, message: 'Error processing webhook' };
  }
}

/**
 * معالجة دفع الطلب
 * P0-FIX: Now accepts conversationId from charge metadata for accurate attribution
 */
async function handleOrderPayment(
  orderId: number,
  status: string,
  merchantId: number,
  customerPhone: string,
  metadataConversationId?: number
): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    if (!order || order.merchantId !== merchantId) {
      console.warn(`[TapWebhook] Order target is missing or outside the payment tenant`);
      return;
    }

    // P0-FIX: Resolve conversation ID — prefer metadata, fallback to phone lookup
    let convId: number | null = metadataConversationId || null;

    if (status === 'CAPTURED') {
      // دفع ناجح
      await updateOrderStatus(orderId, 'paid');

      // ENH: Mark sales strategy as REAL success (payment confirmed, not just intent)
      try {
        const { getPool } = await import('../db');
        const pool = await getPool();
        if (pool) {
          // P0-FIX: Use metadata conversationId first, fallback to phone-based lookup
          if (!convId) {
            const [convRows] = await pool.execute(
              `SELECT id FROM conversations WHERE merchantId = ? AND customerPhone = ? ORDER BY lastMessageAt DESC LIMIT 1`,
              [merchantId, customerPhone]
            );
            convId = (convRows as any[])[0]?.id || null;
            if (convId) {
              console.log(`[TapWebhook] ⚠️ No conversationId in metadata — resolved by phone lookup: conv #${convId}`);
            }
          } else {
            console.log(`[TapWebhook] ✅ Using conversationId from payment metadata: conv #${convId}`);
          }

          if (convId) {
            // Mark strategy as led_to_purchase (real conversion)
            await pool.execute(
              `UPDATE sari_strategy_metrics SET led_to_purchase = 1
               WHERE merchant_id = ? AND conversation_id = ? AND led_to_purchase = 0
               ORDER BY created_at DESC LIMIT 1`,
              [merchantId, convId]
            );
            // Update conversation dealStage to 'paid' + clear loss_reason (multi-tenant guard)
            await pool.execute(
              `UPDATE conversations SET deal_stage = 'paid', loss_reason = NULL WHERE id = ? AND merchantId = ?`,
              [convId, merchantId]
            );
            console.log(`[TapWebhook] 📊 Strategy marked as REAL success + dealStage=paid for conv #${convId}`);
          }
        }
      } catch (stratErr) {
        console.warn(`[TapWebhook] Strategy success tracking failed (non-blocking):`, stratErr);
      }

      // إرسال إشعار للعميل
      const successMessage = `✅ *تم استلام الدفع بنجاح!*\n\n📦 *رقم الطلب:* ${order.orderNumber}\n💰 *المبلغ:* ${order.totalAmount} ريال\n\n🎉 طلبك قيد المعالجة الآن\n📱 سنرسل لك تحديثات عن حالة الشحن\n\nشكراً لثقتك بنا! 🌟`;

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

      // P0-FIX: Track payment_failed deal stage + loss_reason
      try {
        const { getPool } = await import('../db');
        const pool = await getPool();
        if (pool) {
          if (!convId) {
            const [convRows] = await pool.execute(
              `SELECT id FROM conversations WHERE merchantId = ? AND customerPhone = ? ORDER BY lastMessageAt DESC LIMIT 1`,
              [merchantId, customerPhone]
            );
            convId = (convRows as any[])[0]?.id || null;
          }
          if (convId) {
            await pool.execute(
              `UPDATE conversations SET deal_stage = 'payment_failed', loss_reason = 'payment_failed' WHERE id = ? AND merchantId = ?`,
              [convId, merchantId]
            );
            console.log(`[TapWebhook] 📊 dealStage=payment_failed + loss_reason set for conv #${convId}`);
          }
        }
      } catch (err) { console.warn(`[TapWebhook] Failed to update payment_failed stage:`, err); }

      const failureMessage = `❌ *فشلت عملية الدفع*\n\n📦 *رقم الطلب:* ${order.orderNumber}\n\nيرجى المحاولة مرة أخرى أو التواصل معنا للمساعدة.\n\nنعتذر عن الإزعاج 🙏`;

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
    if (!booking || booking.merchantId !== merchantId) {
      console.warn(`[TapWebhook] Booking target is missing or outside the payment tenant`);
      return;
    }

    const service = await getServiceById(booking.serviceId);
    if (!service || service.merchantId !== merchantId) {
      console.warn('[TapWebhook] Booking service is missing or outside the payment tenant');
      return;
    }
    const serviceName = service?.name || 'الخدمة';

    if (status === 'CAPTURED') {
      // دفع ناجح
      await updateBookingStatus(bookingId, 'confirmed');

      const successMessage = `✅ *تم تأكيد حجزك!*\n\n📅 *الخدمة:* ${serviceName}\n📆 *التاريخ:* ${booking.bookingDate}\n⏰ *الوقت:* ${booking.startTime}\n💰 *المبلغ:* ${booking.finalPrice} ريال\n\n🎉 حجزك مؤكد الآن\n📱 سنرسل لك تذكير قبل الموعد\n\nنتطلع لخدمتك! 💚`;

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

      const failureMessage = `❌ *فشلت عملية الدفع*\n\n📅 *الحجز:* ${serviceName}\n📆 *التاريخ:* ${booking.bookingDate}\n\nيرجى المحاولة مرة أخرى أو التواصل معنا للمساعدة.\n\nنعتذر عن الإزعاج 🙏`;

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
