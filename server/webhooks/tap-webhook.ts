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
  getPool,
  getOrderById,
  getServiceById,
} from '../db';
import * as dbPayments from '../db_payments';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import {
  applyTapOrderPaymentState,
  TapOrderPaymentIntegrityError,
  type AppliedTapOrderPaymentState,
} from '../payment/order-payment-state';

export { planTapWebhookTransition } from '../payment/tap-transition';

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

/**
 * معالجة webhook من Tap
 */
export async function processTapWebhook(
  payload: TapWebhookPayload,
  expected: { testMode: boolean },
): Promise<{ success: boolean; message: string }> {
  const charge = payload.data.object;
  const chargeId = charge.id;
  const status = charge.status;
  const payment = await dbPayments.getOrderPaymentByTapChargeId(chargeId);

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

  let applied: AppliedTapOrderPaymentState;
  try {
    applied = await applyTapOrderPaymentState({
      paymentId: payment.id,
      tapChargeId: chargeId,
      providerStatus: status,
      expectedMerchantId: payment.merchantId,
      expectedAmount: payment.amount,
      expectedCurrency: payment.currency,
    });
  } catch (error) {
    if (error instanceof TapOrderPaymentIntegrityError) {
      console.error('[TapWebhook] Local payment target integrity mismatch', {
        merchantId: payment.merchantId,
        paymentId: payment.id,
      });
      return { success: false, message: 'Tap payment target mismatch' };
    }
    console.error('[TapWebhook] Atomic payment transition failed', {
      merchantId: payment.merchantId,
      paymentId: payment.id,
    });
    throw error;
  }

  if (applied.kind === 'invalid') {
    console.warn('[TapWebhook] Ignored invalid or out-of-order Tap transition', {
      merchantId: payment.merchantId,
      paymentId: payment.id,
      currentStatus: applied.status,
      providerStatus: status,
    });
    return { success: true, message: 'Invalid Tap transition ignored' };
  }

  if (status === 'CAPTURED' && applied.status === 'captured') {
    await projectCapturedConversation(payment.merchantId, applied.conversationId);
    await notifyPaymentOutcome(payment, applied, 'captured');
  } else if (status === 'REFUNDED' && applied.status === 'refunded') {
    await notifyPaymentOutcome(payment, applied, 'refunded');
  }

  return {
    success: true,
    message: applied.kind === 'noop' ? 'Webhook already reflected locally' : 'Webhook processed successfully',
  };
}

async function projectCapturedConversation(merchantId: number, conversationId?: number): Promise<void> {
  if (!conversationId) return;
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.execute(
      `UPDATE conversations SET deal_stage = 'paid', loss_reason = NULL WHERE id = ? AND merchantId = ?`,
      [conversationId, merchantId],
    );
    await pool.execute(
      `UPDATE sari_strategy_metrics SET led_to_purchase = 1
       WHERE merchant_id = ? AND conversation_id = ? AND led_to_purchase = 0
       ORDER BY created_at DESC LIMIT 1`,
      [merchantId, conversationId],
    );
  } catch (error) {
    console.warn('[TapWebhook] Conversion projection failed (non-blocking)', {
      merchantId,
      conversationId,
    });
  }
}

async function notifyPaymentOutcome(
  payment: NonNullable<Awaited<ReturnType<typeof dbPayments.getOrderPaymentByTapChargeId>>>,
  applied: AppliedTapOrderPaymentState,
  outcome: 'captured' | 'refunded',
): Promise<void> {
  if (!applied.target) return;
  try {
    let text: string | null = null;
    if (applied.target.kind === 'order') {
      const order = await getOrderById(applied.target.id);
      if (!order || order.merchantId !== payment.merchantId) return;
      text = outcome === 'captured'
        ? `✅ *تم استلام الدفع بنجاح!*\n\n📦 *رقم الطلب:* ${order.orderNumber || order.id}\n💰 *المبلغ:* ${(payment.amount / 100).toFixed(2)} ${payment.currency}\n\nطلبك قيد المعالجة الآن.`
        : `↩️ *تم تأكيد استرجاع الدفع*\n\n📦 *رقم الطلب:* ${order.orderNumber || order.id}\n💰 *المبلغ:* ${(payment.amount / 100).toFixed(2)} ${payment.currency}`;
    } else {
      const booking = await getBookingById(applied.target.id);
      if (!booking || booking.merchantId !== payment.merchantId) return;
      const service = await getServiceById(booking.serviceId);
      if (!service || service.merchantId !== payment.merchantId) return;
      text = outcome === 'captured'
        ? `✅ *تم تأكيد حجزك!*\n\n📅 *الخدمة:* ${service.name}\n📆 *التاريخ:* ${booking.bookingDate}\n⏰ *الوقت:* ${booking.startTime}`
        : `↩️ *تم تأكيد استرجاع دفع الحجز*\n\n📅 *الخدمة:* ${service.name}\n📆 *التاريخ:* ${booking.bookingDate}`;
    }
    await sendMerchantWhatsApp({
      merchantId: payment.merchantId,
      to: payment.customerPhone,
      kind: 'text',
      text,
      idempotencyKey: `tap:${payment.id}:${outcome}`,
      retryFailed: true,
    });
  } catch (error) {
    console.warn('[TapWebhook] Idempotent customer notification failed (non-blocking)', {
      merchantId: payment.merchantId,
      paymentId: payment.id,
      outcome,
    });
  }
}
