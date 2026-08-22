import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  planTapWebhookTransition,
  type StoredTapPaymentStatus,
  type TapTransitionStatus,
} from './tap-transition';

type PaymentRow = {
  id: number;
  merchant_id: number;
  order_id: number | null;
  booking_id: number | null;
  amount: number;
  currency: string;
  status: StoredTapPaymentStatus;
  metadata: string | null;
};

type Target = { kind: 'order' | 'booking'; id: number };

export type AppliedTapOrderPaymentState = {
  kind: 'transitioned' | 'noop' | 'invalid';
  status: StoredTapPaymentStatus;
  target?: Target;
  conversationId?: number;
};

export class TapOrderPaymentIntegrityError extends Error {
  readonly code = 'TAP_ORDER_PAYMENT_INTEGRITY';

  constructor(message = 'Tap order payment target failed integrity checks') {
    super(message);
    this.name = 'TapOrderPaymentIntegrityError';
  }
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readLocalMetadata(value: string | null): { paymentLinkId?: number; conversationId?: number } {
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return {
      paymentLinkId: positiveInteger((parsed as Record<string, unknown>).paymentLinkId),
      conversationId: positiveInteger((parsed as Record<string, unknown>).conversationId),
    };
  } catch {
    return {};
  }
}

function storedStatus(status: TapTransitionStatus): StoredTapPaymentStatus {
  if (status === 'completed') return 'captured';
  if (status === 'processing') return 'authorized';
  return status;
}

function affectedRows(result: unknown): number {
  return Number((result as { affectedRows?: unknown })?.affectedRows || 0);
}

function assertPaymentIdentity(
  payment: PaymentRow | undefined,
  input: {
    expectedMerchantId: number;
    expectedAmount: number;
    expectedCurrency: string;
  },
): asserts payment is PaymentRow {
  if (
    !payment
    || payment.merchant_id !== input.expectedMerchantId
    || payment.amount !== input.expectedAmount
    || payment.currency !== input.expectedCurrency
  ) {
    throw new TapOrderPaymentIntegrityError('Local payment disappeared or changed identity');
  }
}

function paymentTarget(payment: PaymentRow): Target {
  const hasOrder = positiveInteger(payment.order_id) !== undefined;
  const hasBooking = positiveInteger(payment.booking_id) !== undefined;
  if (hasOrder === hasBooking) {
    throw new TapOrderPaymentIntegrityError('Payment must own exactly one local target');
  }
  return hasOrder
    ? { kind: 'order', id: Number(payment.order_id) }
    : { kind: 'booking', id: Number(payment.booking_id) };
}

/**
 * Applies the payment state, local target projection, and payment-link counters
 * in one MySQL transaction. Provider calls and customer notifications are kept
 * outside this boundary and use their own idempotency ledger.
 */
export async function applyTapOrderPaymentState(input: {
  paymentId: number;
  tapChargeId: string;
  providerStatus: string;
  expectedMerchantId: number;
  expectedAmount: number;
  expectedCurrency: string;
}): Promise<AppliedTapOrderPaymentState> {
  if (
    !Number.isSafeInteger(input.paymentId) || input.paymentId <= 0
    || !Number.isSafeInteger(input.expectedMerchantId) || input.expectedMerchantId <= 0
    || !Number.isSafeInteger(input.expectedAmount) || input.expectedAmount <= 0
    || !/^[A-Z]{3}$/.test(input.expectedCurrency)
    || !/^chg_[A-Za-z0-9_-]{6,255}$/.test(input.tapChargeId)
  ) {
    throw new TapOrderPaymentIntegrityError('Invalid local payment identity');
  }
  await assertRuntimeSchema('Tap order payment state', [
    { table: 'orders', columns: ['payment_status'] },
    { table: 'order_payments', columns: ['last_webhook_status', 'last_webhook_at'] },
  ], { cacheSuccess: false });

  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  let inTransaction = false;
  let connectionReusable = true;

  try {
    await connection.beginTransaction();
    inTransaction = true;

    // Discover the target without locking the payment first. Every competing
    // payment for the same target then takes the target lock before its own
    // payment lock, avoiding the payment-A -> target -> payment-B deadlock.
    const [paymentRows] = await connection.execute(
      `SELECT id, merchant_id, order_id, booking_id, amount, currency, status, metadata
         FROM order_payments
        WHERE id = ? AND tap_charge_id = ?
        LIMIT 1`,
      [input.paymentId, input.tapChargeId],
    );
    let payment = (paymentRows as PaymentRow[])[0];
    assertPaymentIdentity(payment, input);
    const target = paymentTarget(payment);
    if (target.kind === 'order') {
      const [targetRows] = await connection.execute(
        `SELECT id FROM orders
          WHERE id = ? AND merchantId = ?
          LIMIT 1 FOR UPDATE`,
        [target.id, payment.merchant_id],
      );
      if (!(targetRows as Array<{ id: number }>)[0]) throw new TapOrderPaymentIntegrityError();
    } else {
      const [targetRows] = await connection.execute(
        `SELECT b.id
           FROM bookings b
           JOIN services s ON s.id = b.service_id AND s.merchant_id = b.merchant_id
          WHERE b.id = ? AND b.merchant_id = ?
          LIMIT 1 FOR UPDATE`,
        [target.id, payment.merchant_id],
      );
      if (!(targetRows as Array<{ id: number }>)[0]) throw new TapOrderPaymentIntegrityError();
    }

    const [lockedPaymentRows] = await connection.execute(
      `SELECT id, merchant_id, order_id, booking_id, amount, currency, status, metadata
         FROM order_payments
        WHERE id = ? AND tap_charge_id = ?
        LIMIT 1 FOR UPDATE`,
      [input.paymentId, input.tapChargeId],
    );
    const lockedPayment = (lockedPaymentRows as PaymentRow[])[0];
    assertPaymentIdentity(lockedPayment, input);
    const lockedTarget = paymentTarget(lockedPayment);
    if (lockedTarget.kind !== target.kind || lockedTarget.id !== target.id) {
      throw new TapOrderPaymentIntegrityError('Local payment target changed while acquiring locks');
    }
    payment = lockedPayment;

    const metadata = readLocalMetadata(payment.metadata);
    if (metadata.paymentLinkId) {
      const [linkRows] = await connection.execute(
        `SELECT id, merchant_id, order_id, booking_id, amount, currency
           FROM payment_links
          WHERE id = ?
          LIMIT 1 FOR UPDATE`,
        [metadata.paymentLinkId],
      );
      const link = (linkRows as Array<Record<string, unknown>>)[0];
      if (
        !link
        || Number(link.merchant_id) !== payment.merchant_id
        || Number(link.amount) !== payment.amount
        || String(link.currency) !== payment.currency
        || (target.kind === 'order'
          ? Number(link.order_id) !== target.id || link.booking_id != null
          : Number(link.booking_id) !== target.id || link.order_id != null)
      ) {
        throw new TapOrderPaymentIntegrityError('Payment link no longer matches its local target');
      }
    }

    const transition = planTapWebhookTransition(payment.status, input.providerStatus);
    if (transition.kind !== 'transition') {
      await connection.commit();
      inTransaction = false;
      return {
        kind: transition.kind,
        status: payment.status,
        target,
        conversationId: metadata.conversationId,
      };
    }

    const nextStatus = storedStatus(transition.status);
    if (nextStatus === 'captured' || nextStatus === 'refunded') {
      const [settledRows] = target.kind === 'order'
        ? await connection.execute(
          `SELECT id FROM order_payments
            WHERE merchant_id = ? AND order_id = ? AND id <> ?
              AND status IN ('captured', 'refunded')
            LIMIT 1 FOR UPDATE`,
          [payment.merchant_id, target.id, payment.id],
        )
        : await connection.execute(
          `SELECT id FROM order_payments
            WHERE merchant_id = ? AND booking_id = ? AND id <> ?
              AND status IN ('captured', 'refunded')
            LIMIT 1 FOR UPDATE`,
          [payment.merchant_id, target.id, payment.id],
        );
      if ((settledRows as Array<{ id: number }>)[0]) {
        throw new TapOrderPaymentIntegrityError('Target already has another settled payment');
      }
    }
    const timestampColumn = nextStatus === 'authorized'
      ? 'authorized_at'
      : nextStatus === 'captured'
        ? 'captured_at'
        : nextStatus === 'failed'
          ? 'failed_at'
          : nextStatus === 'refunded'
            ? 'refunded_at'
            : null;
    const timestampAssignment = timestampColumn ? `, ${timestampColumn} = COALESCE(${timestampColumn}, NOW())` : '';
    const [paymentUpdate] = await connection.execute(
      `UPDATE order_payments
          SET status = ?, last_webhook_status = ?, last_webhook_at = NOW(), updated_at = NOW()
              ${timestampAssignment}
        WHERE id = ? AND status = ?`,
      [nextStatus, input.providerStatus.slice(0, 32), payment.id, payment.status],
    );
    if (affectedRows(paymentUpdate) !== 1) throw new Error('Concurrent Tap payment transition conflict');

    if (target.kind === 'order' && (nextStatus === 'captured' || nextStatus === 'refunded')) {
      await connection.execute(
        `UPDATE orders
            SET payment_status = ?,
                status = CASE
                  WHEN ? = 'captured' AND status = 'pending' THEN 'paid'
                  WHEN ? = 'refunded' AND status IN ('pending', 'paid', 'processing') THEN 'cancelled'
                  ELSE status
                END,
                updatedAt = NOW()
          WHERE id = ? AND merchantId = ?`,
        [
          nextStatus === 'captured' ? 'paid' : nextStatus === 'refunded' ? 'refunded' : 'unpaid',
          nextStatus,
          nextStatus,
          target.id,
          payment.merchant_id,
        ],
      );
    } else if (target.kind === 'booking' && (nextStatus === 'captured' || nextStatus === 'refunded')) {
      await connection.execute(
        `UPDATE bookings
            SET payment_status = ?,
                confirmed_at = CASE WHEN ? = 'captured' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
                cancelled_at = CASE WHEN ? = 'refunded' AND status IN ('pending', 'confirmed') THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
                status = CASE
                  WHEN ? = 'captured' AND status = 'pending' THEN 'confirmed'
                  WHEN ? = 'refunded' AND status IN ('pending', 'confirmed') THEN 'cancelled'
                  ELSE status
                END,
                updated_at = NOW()
          WHERE id = ? AND merchant_id = ?`,
        [
          nextStatus === 'captured' ? 'paid' : nextStatus === 'refunded' ? 'refunded' : 'unpaid',
          nextStatus,
          nextStatus,
          nextStatus,
          nextStatus,
          target.id,
          payment.merchant_id,
        ],
      );
    }

    if (metadata.paymentLinkId) {
      if (nextStatus === 'captured') {
        await connection.execute(
          `UPDATE payment_links
              SET usage_count = usage_count + 1,
                  successful_payments = successful_payments + 1,
                  total_collected = total_collected + ?,
                  status = CASE WHEN max_usage_count IS NOT NULL AND usage_count + 1 >= max_usage_count THEN 'completed' ELSE status END,
                  is_active = CASE WHEN max_usage_count IS NOT NULL AND usage_count + 1 >= max_usage_count THEN 0 ELSE is_active END,
                  updated_at = NOW()
            WHERE id = ? AND merchant_id = ?`,
          [payment.amount, metadata.paymentLinkId, payment.merchant_id],
        );
      } else if (nextStatus === 'failed' || nextStatus === 'cancelled') {
        await connection.execute(
          `UPDATE payment_links
              SET failed_payments = failed_payments + 1, updated_at = NOW()
            WHERE id = ? AND merchant_id = ?`,
          [metadata.paymentLinkId, payment.merchant_id],
        );
      } else if (nextStatus === 'refunded') {
        await connection.execute(
          `UPDATE payment_links
              SET successful_payments = GREATEST(successful_payments - 1, 0),
                  total_collected = GREATEST(total_collected - ?, 0),
                  updated_at = NOW()
            WHERE id = ? AND merchant_id = ?`,
          [payment.amount, metadata.paymentLinkId, payment.merchant_id],
        );
      }
    }

    try {
      await connection.commit();
      inTransaction = false;
    } catch (error) {
      connectionReusable = false;
      throw error;
    }
    return {
      kind: 'transitioned',
      status: nextStatus,
      target,
      conversationId: metadata.conversationId,
    };
  } catch (error) {
    if (inTransaction && connectionReusable) {
      try {
        await connection.rollback();
        inTransaction = false;
      } catch {
        connectionReusable = false;
      }
    }
    throw error;
  } finally {
    if (connectionReusable) connection.release();
    else connection.destroy();
  }
}
