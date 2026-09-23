import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { upsertNormalizedOrdersFromZid } from '../db';
import { normalizeZidOrder } from '../integrations/zid-commerce-normalization';
import { checkoutTransaction } from './checkout-agreements';
import { validateZidCheckoutResult, zidCheckoutProvider, type ZidCheckoutSnapshot, type ZidCheckoutResult } from './zid-checkout-agreements';

const decode = <T>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) : value as T;
const id = z.number().int().positive().safe();
const requestSchema = z.object({ merchantId: id, actorUserId: id, quotationId: id, orderId: id, reviewed: z.literal(true) }).strict();
const detailSchema = z.object({ order: z.object({
  products: z.array(z.object({ id: z.string().min(1), sku: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(10),
  histories: z.array(z.object({ comment: z.string().nullable().optional(),
    changed_by_details: z.object({ comment: z.string().nullable().optional() }).nullable().optional() })).max(1000).optional(),
}).passthrough() });

/** Only a GET against merchant credentials can supply reconciliation evidence.
 * Correlation must survive in the documented order-history comments. If Zid omits
 * it, leave the effect unknown; matching only a phone and a similar cart is unsafe. */
export function verifyZidReconciliation(raw: unknown, expected: {
  snapshot: ZidCheckoutSnapshot; phone: string; attemptId: string; orderId: number;
}): ZidCheckoutResult {
  const { order } = detailSchema.parse(raw);
  const result = validateZidCheckoutResult(order, expected.snapshot.options.storeId, expected.phone);
  if (result.id !== expected.orderId) throw new Error('Zid order identity mismatch');
  const reference = `SARY-CHECKOUT:${expected.attemptId}`;
  if (!z.string().uuid().safeParse(expected.attemptId).success || !order.histories?.some(h =>
    [h.comment, h.changed_by_details?.comment].some(value => value?.split(/\r?\n/).some(line => line.trim() === reference)))) {
    throw new Error('Zid correlation unavailable');
  }
  const expectedItems = expected.snapshot.items;
  if (order.products.length !== expectedItems.length || new Set(order.products.map(p => p.sku)).size !== order.products.length
    || order.products.some(p => !expectedItems.some(i => i.sku === p.sku && i.zidProductId === p.id && i.quantity === p.quantity))) {
    throw new Error('Zid cart mismatch');
  }
  return result;
}

export async function listZidReconciliations(merchantId: number, beforeId?: number) {
  id.parse(merchantId); if (beforeId !== undefined) id.parse(beforeId);
  const pool = await getPool(); if (!pool) throw new Error('Checkout storage unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT id, quotation_number, customer_name, customer_phone, execution_state,
    execution_attempt_id, external_result, projection_pending, execution_started_at,
    (execution_state <> 'processing' OR execution_started_at < TIMESTAMPADD(MINUTE, -2, UTC_TIMESTAMP(3))) AS can_review
    FROM sales_quotations WHERE merchant_id = ? AND external_provider = 'zid' AND id < ?
    AND (execution_state IN ('unknown', 'processing') OR (execution_state = 'succeeded' AND projection_pending = 1))
    ORDER BY id DESC LIMIT 26`, [merchantId, beforeId ?? Number.MAX_SAFE_INTEGER]);
  return { items: rows.slice(0, 25).map(row => ({ id: row.id, number: row.quotation_number, customerName: row.customer_name,
    phone: row.customer_phone, state: row.execution_state as 'unknown' | 'processing' | 'succeeded',
    reference: row.execution_attempt_id ? `SARY-CHECKOUT:${row.execution_attempt_id}` : null,
    orderId: row.external_result ? decode<ZidCheckoutResult>(row.external_result).id : null,
    canReview: Boolean(row.can_review && row.execution_attempt_id), projectionPending: Boolean(row.projection_pending) })),
    nextCursor: rows.length > 25 ? rows[24].id as number : null };
}

export async function reconcileZidCheckout(rawInput: z.infer<typeof requestSchema>) {
  const input = requestSchema.parse(rawInput);
  const pool = await getPool(); if (!pool) throw new Error('Checkout storage unavailable');
  // Scope before touching provider credentials or making any request.
  const [rows] = await pool.execute<any[]>(`SELECT *,
    (execution_state <> 'processing' OR execution_started_at < TIMESTAMPADD(MINUTE, -2, UTC_TIMESTAMP(3))) AS can_review
    FROM sales_quotations WHERE merchant_id = ? AND id = ? AND external_provider = 'zid'`, [input.merchantId, input.quotationId]);
  const initial = rows[0];
  if (!initial?.execution_attempt_id || !initial.can_review || !['unknown', 'processing', 'succeeded'].includes(initial.execution_state)) {
    throw new Error('Checkout cannot be reconciled');
  }
  const snapshot = decode<ZidCheckoutSnapshot>(initial.external_snapshot);
  if (initial.execution_state === 'succeeded' && decode<ZidCheckoutResult>(initial.external_result).id !== input.orderId) {
    throw new Error('Checkout result is immutable');
  }
  const provider = await zidCheckoutProvider(input.merchantId);
  if (provider.storeId !== snapshot.options.storeId) throw new Error('Checkout store changed');
  const fetchedAt = new Date();
  const detail = await provider.client.getOrderForReconciliation(input.orderId);
  const result = verifyZidReconciliation(detail, { snapshot, phone: initial.customer_phone,
    attemptId: initial.execution_attempt_id, orderId: input.orderId });
  // Preserve current payment/status during projection repair, never invent 'pending'.
  const normalized = normalizeZidOrder((detail as { order: unknown }).order, fetchedAt);
  const proof = { version: 1, actorUserId: input.actorUserId, verifiedAt: fetchedAt.toISOString(),
    orderId: result.id, attemptId: initial.execution_attempt_id,
    evidenceHash: createHash('sha256').update(JSON.stringify(detail)).digest('hex') };
  await checkoutTransaction(async connection => {
    const [current] = await connection.execute<any[]>('SELECT * FROM sales_quotations WHERE id = ? AND merchant_id = ? FOR UPDATE',
      [input.quotationId, input.merchantId]);
    const q = current[0];
    if (!q || q.execution_attempt_id !== initial.execution_attempt_id || decode<ZidCheckoutSnapshot>(q.external_snapshot).digest !== snapshot.digest) {
      throw new Error('Checkout changed during reconciliation');
    }
    if (q.execution_state === 'succeeded') {
      if (decode<ZidCheckoutResult>(q.external_result).id !== result.id) throw new Error('Checkout result is immutable');
      return;
    }
    if (!['unknown', 'processing'].includes(q.execution_state)) throw new Error('Checkout cannot be reconciled');
    // Unique merchant/provider/store/order key also prevents reuse across agreements.
    await connection.execute(`UPDATE sales_quotations SET execution_state = 'succeeded', external_result = ?, external_order_key = ?,
      external_reconciliation = ?, projection_pending = 1 WHERE id = ? AND merchant_id = ?`,
    [JSON.stringify(result), `${snapshot.options.storeId}:${result.id}`, JSON.stringify(proof), input.quotationId, input.merchantId]);
  });
  let projectionPending = true;
  try {
    const projection = await upsertNormalizedOrdersFromZid(input.merchantId, [normalized]);
    if (projection.sourceOrders !== 1) throw new Error('Projection unavailable');
    await pool.execute('UPDATE sales_quotations SET projection_pending = 0 WHERE id = ? AND merchant_id = ?', [input.quotationId, input.merchantId]);
    projectionPending = false;
  } catch {
    console.warn('[ZidCheckout] Verified order projection pending', { merchantId: input.merchantId, quotationId: input.quotationId });
  }
  return { verified: true as const, orderId: result.id, orderCode: result.code, projectionPending };
}
