import crypto from 'node:crypto';

export const SALLA_WEBHOOK_EVENTS = [
  'product.updated',
  'product.deleted',
  'product.quantity.updated',
  'order.updated',
] as const;

export type SallaWebhookEventType = typeof SALLA_WEBHOOK_EVENTS[number];

export type ParsedSallaWebhook = {
  event: SallaWebhookEventType;
  storeId: string;
  resourceId: string;
};

const SALLA_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;
const SALLA_IDENTIFIER_PATTERN = /^[1-9][0-9]{0,19}$/;
const MAX_SALLA_WEBHOOK_BYTES = 2 * 1024 * 1024;
const SUPPORTED_EVENTS = new Set<string>(SALLA_WEBHOOK_EVENTS);

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Verify the signature against the exact bytes delivered by Salla. */
export function verifySallaWebhookSignature(input: {
  rawBody: Buffer;
  signature: string | string[] | undefined;
  strategy: string | string[] | undefined;
  secret: string;
}): boolean {
  const signature = firstHeader(input.signature)?.trim();
  const strategy = firstHeader(input.strategy)?.trim();
  if (!input.secret || strategy?.toLowerCase() !== 'signature') return false;
  if (!signature || !SALLA_SIGNATURE_PATTERN.test(signature)) return false;
  if (!Buffer.isBuffer(input.rawBody) || input.rawBody.length === 0) return false;
  if (input.rawBody.length > MAX_SALLA_WEBHOOK_BYTES) return false;

  const expected = crypto.createHmac('sha256', input.secret).update(input.rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function normalizeSallaIdentifier(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return SALLA_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

function merchantIdentifier(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeSallaIdentifier((value as Record<string, unknown>).id);
  }
  return normalizeSallaIdentifier(value);
}

/**
 * Parse the signed octets, not Express' mutable object. Only the fields needed
 * to fetch a canonical resource from Salla are retained; no customer PII is
 * persisted in the receipt queue.
 */
export function parseSallaWebhook(rawBody: Buffer): ParsedSallaWebhook | null {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > MAX_SALLA_WEBHOOK_BYTES) {
    return null;
  }

  let payload: unknown;
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
    payload = JSON.parse(source);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.event !== 'string' || !SUPPORTED_EVENTS.has(candidate.event)) return null;
  const storeId = merchantIdentifier(candidate.merchant);
  const data = candidate.data;
  if (!storeId || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const resourceId = normalizeSallaIdentifier((data as Record<string, unknown>).id);
  if (!resourceId) return null;

  return {
    event: candidate.event as SallaWebhookEventType,
    storeId,
    resourceId,
  };
}

export function hashSallaWebhook(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}
