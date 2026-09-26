import type { PoolConnection } from 'mysql2/promise';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { salesPaymentFact } from './sales-payment-fact-contract';

export async function assertSalesPaymentFactSchema() {
  await assertRuntimeSchema('verified sales payment facts', [{ table: 'ai_sales_payment_facts',
    columns: ['merchant_id','payment_id','event_type','target_kind','target_id','customer_key','fact_digest','snapshot',
      'attribution_state','attribution_digest','attribution','attempts','next_at','last_error'],
    uniqueIndexes: [{ name: 'uq_sales_payment_event', columns: ['merchant_id','payment_id','event_type'] },
      { name: 'uq_sales_target_event', columns: ['merchant_id','target_kind','target_id','event_type'] }],
    checkConstraints: ['ck_sales_payment_attribution'] }]);
}
/** Called only for a NEW verified Tap transition inside its existing target/payment transaction.
 * The small outbox write is atomic with finance. No experiment locks, analysis or provider I/O here.
 * A replay of a pre-upgrade capture cannot manufacture a prospective observation timestamp.
 */
export async function recordTapSalesPaymentFact(c: PoolConnection, merchantId: number, paymentId: number) {
  const [rows] = await c.execute<any[]>(`SELECT p.id,p.merchant_id,p.order_id,p.booking_id,p.status,p.amount,p.currency,
    COALESCE(o.customerPhone,b.customer_phone) AS phone,UTC_TIMESTAMP(3) AS observed_at
    FROM order_payments p
    LEFT JOIN orders o ON o.id=p.order_id AND o.merchantId=p.merchant_id
    LEFT JOIN bookings b ON b.id=p.booking_id AND b.merchant_id=p.merchant_id
    WHERE p.id=? AND p.merchant_id=? AND p.status IN ('captured','refunded')`, [paymentId,merchantId]);
  if (rows.length !== 1 || Boolean(rows[0].order_id) === Boolean(rows[0].booking_id)) throw Error('Canonical payment fact unavailable');
  const p = rows[0], phone = String(p.phone || '').replace(/^\+/, '');
  // Uncanonicalizable legacy identities remain financially valid, but cannot be attributed to a customer.
  const customerKey = /^[0-9]{8,15}$/.test(phone)
    ? policyArtifactDigest({ version: 'sales-experiment-customer.v1', merchantId, phone }) : null;
  const s = salesPaymentFact.parse({ version: 'tap-sales-payment-fact.v1', merchantId, paymentId, event: p.status,
    targetKind: p.order_id ? 'order' : 'booking', targetId: Number(p.order_id || p.booking_id), customerKey,
    amountMinor: Number(p.amount), currency: String(p.currency), verifiedAt: new Date(databaseTimeEpoch(p.observed_at)).toISOString(),
    timeBasis: 'local_verified_transition', refundExtent: p.status === 'refunded' ? 'full' : 'none', source: 'canonical_tap_payment' });
  await c.execute(`INSERT INTO ai_sales_payment_facts
    (merchant_id,payment_id,event_type,target_kind,target_id,customer_key,fact_digest,snapshot)
    VALUES (?,?,?,?,?,?,?,?)`, [merchantId,paymentId,s.event,s.targetKind,s.targetId,customerKey,policyArtifactDigest(s),JSON.stringify(s)]);
}
