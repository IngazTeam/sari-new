/**
 * Zid Webhook Handler
 * معالج Webhooks من منصة زد
 */

import {
  cancelOrderFromZid,
  deactivateProductFromZid,
  updateProductInventoryFromZid,
  upsertOrderFromZid,
  upsertProductFromZid,
} from '../db';

export interface ZidWebhookPayload {
  event: string;
  data: any;
  created_at?: string;
  webhook_id?: string;
}

const EVENT_ALIASES: Readonly<Record<string, string>> = {
  'order.create': 'order.created',
  'order.update': 'order.updated',
  'order.status.update': 'order.updated',
  'order.payment_status.update': 'order.updated',
  'order.cancel': 'order.cancelled',
  'product.create': 'product.created',
  'product.update': 'product.updated',
  'product.publish': 'product.updated',
  'product.delete': 'product.deleted',
  'inventory.update': 'inventory.updated',
};

const MIN_EVENT_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function normalizeZidWebhookOccurredAt(value: unknown, now = new Date()): Date | null {
  if (value === undefined) return now;
  if (typeof value !== 'string' || value.length > 64) return null;
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp)
    || timestamp < MIN_EVENT_TIME_MS
    || timestamp > now.getTime() + MAX_FUTURE_SKEW_MS
  ) return null;
  return new Date(timestamp);
}

export function parseZidWebhookPayload(value: unknown, now = new Date()): ZidWebhookPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.event !== 'string' || !/^[a-z0-9_.-]{1,100}$/i.test(candidate.event)) return null;
  if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) return null;
  if (candidate.webhook_id !== undefined && typeof candidate.webhook_id !== 'string') return null;
  const occurredAt = normalizeZidWebhookOccurredAt(candidate.created_at, now);
  if (!occurredAt) return null;
  return {
    event: candidate.event,
    data: candidate.data,
    created_at: occurredAt.toISOString(),
    webhook_id: candidate.webhook_id,
  };
}

export async function processZidWebhook(
  payload: ZidWebhookPayload,
  merchantId: number,
): Promise<{ success: boolean; message: string }> {
  const event = EVENT_ALIASES[payload.event] || payload.event;
  const occurredAt = normalizeZidWebhookOccurredAt(payload.created_at);
  if (!occurredAt) throw new Error('INVALID_ZID_WEBHOOK_TIME');
  switch (event) {
    case 'order.created':
      await handleOrderCreated(merchantId, payload.data, occurredAt);
      break;
    case 'order.updated':
      await handleOrderUpdated(merchantId, payload.data, occurredAt);
      break;
    case 'order.cancelled':
      await handleOrderCancelled(merchantId, payload.data, occurredAt);
      break;
    case 'product.created':
      await handleProductCreated(merchantId, payload.data, occurredAt);
      break;
    case 'product.updated':
      await handleProductUpdated(merchantId, payload.data, occurredAt);
      break;
    case 'product.deleted':
      await handleProductDeleted(merchantId, payload.data, occurredAt);
      break;
    case 'inventory.updated':
      await handleInventoryUpdated(merchantId, payload.data, occurredAt);
      break;
    default:
      return { success: true, message: 'Unsupported event ignored' };
  }
  return { success: true, message: 'Webhook processed successfully' };
}

/**
 * Handle order.created event
 */
async function handleOrderCreated(
  merchantId: number,
  orderData: any,
  occurredAt: Date,
) {
  await upsertOrderFromZid(merchantId, orderData, occurredAt);
}

/**
 * Handle order.updated event
 */
async function handleOrderUpdated(
  merchantId: number,
  orderData: any,
  occurredAt: Date,
) {
  await upsertOrderFromZid(merchantId, orderData, occurredAt);
}

/**
 * Handle order.cancelled event
 */
async function handleOrderCancelled(
  merchantId: number,
  orderData: any,
  occurredAt: Date,
) {
  await cancelOrderFromZid(merchantId, orderData.id, occurredAt);
}

/**
 * Handle product.created event
 */
async function handleProductCreated(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await upsertProductFromZid(merchantId, productData, occurredAt);
}

/**
 * Handle product.updated event
 */
async function handleProductUpdated(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await upsertProductFromZid(merchantId, productData, occurredAt);
}

/**
 * Handle product.deleted event
 */
async function handleProductDeleted(
  merchantId: number,
  productData: any,
  occurredAt: Date,
) {
  await deactivateProductFromZid(merchantId, productData.id, occurredAt);
}

/**
 * Handle inventory.updated event
 */
async function handleInventoryUpdated(
  merchantId: number,
  inventoryData: any,
  occurredAt: Date,
) {
  await updateProductInventoryFromZid(merchantId, inventoryData, occurredAt);
}
