import { createHmac, timingSafeEqual } from 'node:crypto';

const TAP_WEBHOOK_STATUSES = new Set([
  'INITIATED',
  'ABANDONED',
  'CANCELLED',
  'FAILED',
  'DECLINED',
  'RESTRICTED',
  'CAPTURED',
  'VOID',
  'TIMEDOUT',
  'UNKNOWN',
  'AUTHORIZED',
  'REFUNDED',
]);

const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  AED: 2,
  BHD: 3,
  EGP: 2,
  EUR: 2,
  GBP: 2,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  QAR: 2,
  SAR: 2,
  USD: 2,
};

function boundedScalar(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export function unwrapTapWebhookCharge(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, any>).data?.object ?? value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, any>;
}

export function readTapWebhookChargeId(value: unknown): string | null {
  const charge = unwrapTapWebhookCharge(value);
  const id = boundedScalar(charge?.id);
  return id && /^chg_[A-Za-z0-9_-]{3,250}$/.test(id) ? id : null;
}

/**
 * Tap signs a canonical field string, not the raw or re-serialized JSON body.
 * Field order and currency precision follow Tap's published webhook contract.
 */
export function buildTapWebhookHashString(value: unknown): string | null {
  const charge = unwrapTapWebhookCharge(value);
  if (!charge) return null;

  const id = readTapWebhookChargeId(charge);
  const currency = boundedScalar(charge.currency, 3)?.toUpperCase() ?? null;
  const decimals = currency ? CURRENCY_DECIMALS[currency] : undefined;
  const numericAmount = typeof charge.amount === 'number' || typeof charge.amount === 'string'
    ? Number(charge.amount)
    : Number.NaN;
  const gatewayReference = boundedScalar(charge.reference?.gateway);
  const paymentReference = boundedScalar(charge.reference?.payment);
  const status = boundedScalar(charge.status, 32)?.toUpperCase() ?? null;
  const created = boundedScalar(charge.transaction?.created ?? charge.created, 32);

  if (!id || decimals == null || !Number.isFinite(numericAmount) || numericAmount < 0) return null;
  if (!gatewayReference || !paymentReference || !status || !TAP_WEBHOOK_STATUSES.has(status) || !created) return null;
  if (!/^\d{10,17}$/.test(created)) return null;

  const amount = numericAmount.toFixed(decimals);
  return `x_id${id}x_amount${amount}x_currency${currency}`
    + `x_gateway_reference${gatewayReference}x_payment_reference${paymentReference}`
    + `x_status${status}x_created${created}`;
}

export function verifyTapWebhookHash(
  value: unknown,
  receivedHash: string,
  secretKey: string,
): boolean {
  const canonical = buildTapWebhookHashString(value);
  const normalizedHash = receivedHash.trim().toLowerCase();
  if (!canonical || !secretKey.trim() || !/^[0-9a-f]{64}$/.test(normalizedHash)) return false;

  const expected = createHmac('sha256', secretKey).update(canonical).digest();
  const received = Buffer.from(normalizedHash, 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}
