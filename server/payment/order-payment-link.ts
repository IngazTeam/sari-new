import { randomBytes } from 'node:crypto';
import type { PaymentLink } from '../../drizzle/schema';
import { getMerchantPaymentSettings, getOrderById, updateOrder } from '../db';
import { createPaymentLink, getPaymentLinkByOrderId } from '../db_payments';
import { getPaymentLinkAvailability, isTapPaymentReady } from './payment-link-policy';
import { publicPaymentUrls } from '../utils/public-url';

const ORDER_PAYMENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const ORDER_PAYMENT_LINK_MAX_TTL_MS = 7 * ORDER_PAYMENT_LINK_TTL_MS;

export type OrderPaymentLinkUnavailableReason =
  | 'gateway_not_ready'
  | 'order_not_payable'
  | 'link_unavailable';

export type OrderPaymentLinkIssueResult =
  | { issued: true; link: PaymentLink; paymentUrl: string; reused: boolean }
  | { issued: false; reason: OrderPaymentLinkUnavailableReason };

export class OrderPaymentLinkIntegrityError extends Error {
  constructor() {
    super('Order payment-link identity conflict');
    this.name = 'OrderPaymentLinkIntegrityError';
  }
}

function formatMysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function resolveExpiry(value: string | undefined, now = Date.now()): string {
  const expiresAt = value ? new Date(value) : new Date(now + ORDER_PAYMENT_LINK_TTL_MS);
  const expiresAtMs = expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now || expiresAtMs > now + ORDER_PAYMENT_LINK_MAX_TTL_MS) {
    throw new OrderPaymentLinkIntegrityError();
  }
  return formatMysqlTimestamp(expiresAt);
}

function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062;
}

function assertOrderLinkIdentity(
  link: PaymentLink,
  expected: { merchantId: number; orderId: number; amount: number; currency: 'SAR' },
): void {
  if (
    link.merchantId !== expected.merchantId
    || link.orderId !== expected.orderId
    || link.bookingId != null
    || link.amount !== expected.amount
    || link.currency !== expected.currency
    || !link.isFixedAmount
    || link.maxUsageCount !== 1
    || link.tapPaymentUrl !== publicPaymentUrls.link(link.linkId)
  ) {
    throw new OrderPaymentLinkIntegrityError();
  }
}

async function reuseOrderLink(
  link: PaymentLink,
  expected: { merchantId: number; orderId: number; amount: number; currency: 'SAR' },
): Promise<OrderPaymentLinkIssueResult> {
  assertOrderLinkIdentity(link, expected);
  if (!getPaymentLinkAvailability(link).available) {
    return { issued: false, reason: 'link_unavailable' };
  }
  await updateOrder(expected.orderId, { paymentUrl: link.tapPaymentUrl });
  return { issued: true, link, paymentUrl: link.tapPaymentUrl, reused: true };
}

/**
 * Issues a local, single-use payment link for a persisted order.
 * The customer checkout — not the conversation worker — creates the Tap charge.
 */
export async function issueCanonicalOrderPaymentLink(input: {
  merchantId: number;
  orderId: number;
  requestedAmountInHalalas?: number;
  title?: string;
  description?: string | null;
  expiresAt?: string;
}): Promise<OrderPaymentLinkIssueResult> {
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0
    || !Number.isSafeInteger(input.orderId) || input.orderId <= 0) {
    throw new OrderPaymentLinkIntegrityError();
  }

  const order = await getOrderById(input.orderId);
  if (!order || order.merchantId !== input.merchantId) {
    throw new OrderPaymentLinkIntegrityError();
  }
  if (
    !['pending', 'processing'].includes(order.status)
    || !Number.isSafeInteger(order.totalAmount)
    || order.totalAmount < 100
    || order.currency !== 'SAR'
    || (input.requestedAmountInHalalas != null && input.requestedAmountInHalalas !== order.totalAmount)
  ) {
    return { issued: false, reason: 'order_not_payable' };
  }

  const paymentSettings = await getMerchantPaymentSettings(input.merchantId);
  if (!paymentSettings || !isTapPaymentReady(paymentSettings)) {
    return { issued: false, reason: 'gateway_not_ready' };
  }

  const expected = {
    merchantId: input.merchantId,
    orderId: input.orderId,
    amount: order.totalAmount,
    currency: 'SAR' as const,
  };
  const existing = await getPaymentLinkByOrderId(input.orderId);
  if (existing) return reuseOrderLink(existing, expected);

  const linkId = `link_${randomBytes(16).toString('hex')}`;
  const paymentUrl = publicPaymentUrls.link(linkId);
  let link: PaymentLink | null;
  try {
    link = await createPaymentLink({
      merchantId: input.merchantId,
      linkId,
      title: (input.title?.trim() || `طلب #${input.orderId}`).slice(0, 255),
      description: input.description?.trim().slice(0, 1000) || null,
      amount: order.totalAmount,
      currency: 'SAR',
      isFixedAmount: 1,
      minAmount: null,
      maxAmount: null,
      tapPaymentUrl: paymentUrl,
      maxUsageCount: 1,
      expiresAt: resolveExpiry(input.expiresAt),
      status: 'active',
      isActive: 1,
      orderId: input.orderId,
      bookingId: null,
      metadata: JSON.stringify({ source: 'order_checkout' }),
    });
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
    const winner = await getPaymentLinkByOrderId(input.orderId);
    if (!winner) throw error;
    return reuseOrderLink(winner, expected);
  }

  if (!link) throw new Error('Order payment link was not persisted');
  assertOrderLinkIdentity(link, expected);
  await updateOrder(input.orderId, { paymentUrl });
  return { issued: true, link, paymentUrl, reused: false };
}
