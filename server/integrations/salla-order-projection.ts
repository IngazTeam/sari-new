import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { decryptSecret } from '../security/secrets';
import { sallaExternalId, sallaObservedState } from '../../shared/salla-sales-observations';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';

const internalId = z.number().int().positive().max(2147483647);
export const sallaAuthoritySchema = z.object({ merchantId: internalId, connectionId: internalId,
  storeId: sallaExternalId, accessToken: z.string().min(1) }).strict();
export type SallaOrderAuthority = z.infer<typeof sallaAuthoritySchema>;
export function sallaOrderProjectionId(storeId: string, orderId: string) {
  return `salla:${sallaExternalId.parse(storeId)}:${sallaExternalId.parse(orderId)}`;
}
export async function assertSallaOrderProjectionSchema() {
  await assertRuntimeSchema('Salla order store identity', [{ table: 'salla_order_projections',
    columns: ['merchant_id','store_id','external_order_id','local_order_id','connection_id','created_at'],
    uniqueIndexes: [{ name: 'salla_projection_scope', columns: ['merchant_id','store_id','external_order_id'] },
      { name: 'salla_projection_local', columns: ['local_order_id'] }], checkConstraints: ['chk_salla_projection_ids'],
  }]);
}
export async function assertSallaOrderAuthority(c: Pick<PoolConnection, 'execute'>, raw: SallaOrderAuthority, lock = false) {
  const a = sallaAuthoritySchema.parse(raw);
  const [rows] = await c.execute<any[]>(`SELECT id,salla_store_id,accessToken,syncStatus FROM salla_connections WHERE merchantId=?${lock ? ' FOR UPDATE' : ''}`, [a.merchantId]);
  if (rows.length !== 1 || rows[0].id !== a.connectionId || rows[0].salla_store_id !== a.storeId
    || rows[0].syncStatus !== 'active' || decryptSecret(rows[0].accessToken) !== a.accessToken) throw Error('Salla order authority changed');
}
export async function preflightSallaOrderAuthority(authority: SallaOrderAuthority) {
  await assertSallaOrderProjectionSchema(); const pool = await getPool(); if (!pool) throw Error('Database unavailable');
  await assertSallaOrderAuthority(pool,authority);
}
const projectionInput = z.object({ externalOrderId: sallaExternalId, orderNumber: sallaExternalId,
  customerPhone: z.string().min(1).max(50), customerName: z.string().min(1).max(255),
  address: z.string().max(4000), city: z.string().max(100).optional(), items: z.string().min(2).max(64000),
  totalAmount: z.number().int().nonnegative().max(2147483647), paymentUrl: z.string().url().max(2048).nullable(),
  isGift: z.union([z.literal(0),z.literal(1)]), giftRecipientName: z.string().max(255).optional(),
  giftMessage: z.string().max(4000).optional(), discountCode: z.string().max(50).nullable(),
}).strict();

/** Only an accepted authenticated create response may establish a new store binding.
 * Never upgrade a historical bare ID by guessing from today's connection. */
export async function persistSallaOrderProjection(authority: SallaOrderAuthority, raw: z.infer<typeof projectionInput>) {
  const a = sallaAuthoritySchema.parse(authority), input = projectionInput.parse(raw);
  const alias = sallaOrderProjectionId(a.storeId,input.externalOrderId);
  await assertSallaOrderProjectionSchema(); const pool = await getPool(); if (!pool) throw Error('Database unavailable');
  const c = await pool.getConnection(); let reusable = true, committing = false;
  try {
    await c.beginTransaction(); await assertSallaOrderAuthority(c,a,true);
    // Duplicate identities are ambiguous here, not permission to overwrite the original customer or total.
    const [result] = await c.execute<any>(`INSERT INTO orders
      (merchantId,sallaOrderId,orderNumber,customerPhone,customerName,address,city,items,totalAmount,currency,status,payment_status,paymentUrl,isGift,giftRecipientName,giftMessage,discountCode)
      VALUES (?,?,?,?,?,?,?,?,?,'SAR','pending','unpaid',?,?,?,?,?)`,
    [a.merchantId,alias,input.orderNumber,input.customerPhone,input.customerName,input.address,input.city??null,input.items,input.totalAmount,
      input.paymentUrl,input.isGift,input.giftRecipientName??null,input.giftMessage??null,input.discountCode]);
    const id = Number(result.insertId);
    await c.execute(`INSERT INTO salla_order_projections(merchant_id,store_id,external_order_id,local_order_id,connection_id,created_at)
      VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))`,[a.merchantId,a.storeId,input.externalOrderId,id,a.connectionId]);
    committing = true; await c.commit(); committing = false;
    return { id, orderNumber: input.orderNumber };
  } catch (error) {
    if (committing) { reusable = false; c.destroy(); }
    else { try { await c.rollback(); } catch { reusable = false; c.destroy(); } }
    throw error;
  } finally { if (reusable) c.release(); }
}

export type SallaNoticeOrder = { id: number; status: string; customerPhone: string; customerName: string; orderNumber: string | null; trackingNumber: string | null };
export function sallaOrderStatusMessage(order: SallaNoticeOrder, status: z.infer<typeof sallaObservedState>) {
  const label = { pending:'قيد المراجعة',paid:'تم تأكيد الدفع',processing:'قيد التجهيز',shipped:'تم الشحن',delivered:'تم التوصيل',cancelled:'تم الإلغاء' };
  return [`مرحباً ${String(order.customerName).trim().slice(0,100)}،`,
    `تحديث طلبك ${String(order.orderNumber || `#${order.id}`).slice(0,80)}: ${label[status]}.`,
    status === 'shipped' && order.trackingNumber ? `رقم التتبع: ${String(order.trackingNumber).slice(0,100)}` : '',
  ].filter(Boolean).join('\n');
}
const noticeGuard = z.object({ storeId:sallaExternalId, orderId:sallaExternalId, localOrderId:internalId,
  receiptId:internalId, processingToken:z.string().min(1).max(64), status:sallaObservedState }).strict();
export type SallaOrderNoticeGuard = z.infer<typeof noticeGuard>;
export function sallaOrderNoticeKey(merchantId: number, g: Pick<SallaOrderNoticeGuard,'storeId'|'orderId'|'status'>) {
  return `salla-order-v2:${internalId.parse(merchantId)}:${sallaExternalId.parse(g.storeId)}:${sallaExternalId.parse(g.orderId)}:${sallaObservedState.parse(g.status)}`;
}
/** Last check at the actual WhatsApp transport; retry cannot discard a persisted guard. */
export async function canDispatchSallaOrderNotice(input: SendMerchantWhatsAppInput) {
  try {
    const g = noticeGuard.parse(input.sallaOrderGuard);
    if (input.idempotencyKey !== sallaOrderNoticeKey(input.merchantId,g) || input.kind !== 'text') return false;
    const pool = await getPool(); if (!pool) return false;
    const [deliveries] = await pool.execute<any[]>('SELECT request_json FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? AND status=\'queued\'', [input.merchantId,input.idempotencyKey]);
    const raw = deliveries[0]?.request_json, saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const original = noticeGuard.parse(saved?.sallaOrderGuard);
    if (deliveries.length !== 1 || saved.to !== input.to || saved.kind !== input.kind || saved.text !== input.text
      || !['storeId','orderId','localOrderId','receiptId','status'].every(key => original[key as keyof typeof original] === g[key as keyof typeof g])) return false;
    const [rows] = await pool.execute<any[]>(`SELECT o.* FROM salla_order_projections p
      JOIN orders o ON o.id=p.local_order_id AND o.merchantId=p.merchant_id
      JOIN salla_connections c ON c.merchantId=p.merchant_id AND c.salla_store_id=p.store_id AND c.syncStatus='active'
      JOIN salla_webhook_receipts r ON r.id=? AND r.merchant_id=p.merchant_id AND r.salla_store_id=p.store_id AND r.resource_id=p.external_order_id
      WHERE p.merchant_id=? AND p.store_id=? AND p.external_order_id=? AND o.id=? AND o.sallaOrderId=? AND o.status=?
        AND r.event_type='order.updated' AND r.status='processing' AND r.effect_applied=1 AND r.notification_required=1
        AND r.notification_status=? AND r.processing_token=? AND r.claimed_at>DATE_SUB(NOW(3),INTERVAL 10 MINUTE)`,
    [g.receiptId,input.merchantId,g.storeId,g.orderId,g.localOrderId,sallaOrderProjectionId(g.storeId,g.orderId),g.status,g.status,g.processingToken]);
    return rows.length === 1 && input.to === rows[0].customerPhone && input.text === sallaOrderStatusMessage(rows[0],g.status);
  } catch { return false; }
}
