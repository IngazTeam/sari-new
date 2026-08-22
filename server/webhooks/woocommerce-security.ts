import crypto from 'node:crypto';

export const WOOCOMMERCE_WEBHOOK_MAX_BYTES = 128 * 1024;
export const WOOCOMMERCE_ENDPOINT_PATTERN = /^[A-Za-z0-9_-]{32,48}$/;
export const WOOCOMMERCE_WEBHOOK_TOPICS = [
  'product.created',
  'product.updated',
  'product.deleted',
  'order.created',
  'order.updated',
  'order.deleted',
] as const;

export type WooCommerceWebhookTopic = typeof WOOCOMMERCE_WEBHOOK_TOPICS[number];

export type WooCommerceWebhookIdentity = {
  topic: WooCommerceWebhookTopic;
  resource: 'product' | 'order';
  event: 'created' | 'updated' | 'deleted';
  webhookId: string;
  deliveryId: string;
};

const topicSet = new Set<string>(WOOCOMMERCE_WEBHOOK_TOPICS);
const providerIdPattern = /^[1-9]\d{0,19}$/;

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 64 ? normalized : null;
}

export function parseWooCommerceWebhookIdentity(headers: Record<string, string | string[] | undefined>): WooCommerceWebhookIdentity | null {
  const topic = singleHeader(headers['x-wc-webhook-topic']);
  const resource = singleHeader(headers['x-wc-webhook-resource']);
  const event = singleHeader(headers['x-wc-webhook-event']);
  const webhookId = singleHeader(headers['x-wc-webhook-id']);
  const deliveryId = singleHeader(headers['x-wc-webhook-delivery-id']);
  if (!topic || !topicSet.has(topic) || !webhookId || !deliveryId) return null;
  if (!providerIdPattern.test(webhookId) || !providerIdPattern.test(deliveryId)) return null;
  const [expectedResource, expectedEvent] = topic.split('.');
  if (resource !== expectedResource || event !== expectedEvent) return null;
  return {
    topic: topic as WooCommerceWebhookTopic,
    resource: resource as 'product' | 'order',
    event: event as 'created' | 'updated' | 'deleted',
    webhookId,
    deliveryId,
  };
}

export function verifyWooCommerceWebhookSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  signingSecret: string;
}): boolean {
  if (!Buffer.isBuffer(input.rawBody) || input.rawBody.length === 0 || input.rawBody.length > WOOCOMMERCE_WEBHOOK_MAX_BYTES) return false;
  if (typeof input.signatureHeader !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(input.signatureHeader)) return false;
  if (typeof input.signingSecret !== 'string' || input.signingSecret.length < 32 || input.signingSecret.length > 512) return false;
  const supplied = Buffer.from(input.signatureHeader, 'base64');
  const expected = crypto.createHmac('sha256', input.signingSecret).update(input.rawBody).digest();
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function parseWooCommerceWebhookResourceId(rawBody: Buffer): number | null {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > WOOCOMMERCE_WEBHOOK_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).id;
  const id = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}
