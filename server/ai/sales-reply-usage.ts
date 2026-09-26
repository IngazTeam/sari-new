import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { assertReplyUsageSchema, lockReplyUsageCapacity } from './reply-usage-quota';

const id = z.number().int().positive().safe();
const timestamp = (value: any) => {
  const epoch = databaseTimeEpoch(value);
  if (!Number.isFinite(epoch)) throw Error('Reply usage evidence unavailable');
  return new Date(epoch).toISOString();
};
const sqlTime = (value: string) => value.slice(0, 23).replace('T', ' ');
const unavailable = (): never => { throw Error('Reply usage evidence unavailable'); };

export async function assertSalesReplyUsageSchema() {
  await assertReplyUsageSchema();
  await assertRuntimeSchema('reviewed reply subscription usage', [{ table: 'ai_sales_reply_deliveries',
    columns: ['usage_state','usage_subscription_id','usage_period_start','usage_units','usage_reserved_at','usage_digest','usage_settled_at'],
    checkConstraints: ['ck_sales_reply_usage'] }]);
}

function evidence(row: any) {
  return { version: 'sales-reply-usage.v1', merchantId: id.parse(Number(row.merchant_id)), deliveryId: id.parse(Number(row.id)),
    authorizationDigest: z.string().regex(/^[a-f0-9]{64}$/).parse(row.authorization_digest),
    subscriptionId: id.parse(Number(row.usage_subscription_id)), periodStart: timestamp(row.usage_period_start),
    units: z.literal(2).parse(Number(row.usage_units)), reservedAt: timestamp(row.usage_reserved_at) };
}
/** The caller owns the merchant and delivery rows. Subscription rows serialize quota reservations. */
export async function reserveSalesReplyUsage(c: PoolConnection, row: any, expiresAt: string) {
  if (!['pending','legacy'].includes(row.usage_state)) return unavailable();
  const { subscriptionId, periodStart } = await lockReplyUsageCapacity(c, Number(row.merchant_id));
  const s = { id: subscriptionId };
  const reservation = { ...row, usage_subscription_id: Number(s.id), usage_period_start: periodStart, usage_units: 2,
    usage_reserved_at: row.dispatch_started_at };
  const proof = evidence(reservation);
  // Recheck expiry after the plan lock; no reservation or consumed authorization survives a failed check.
  const [saved] = await c.execute<any>(`UPDATE ai_sales_reply_deliveries SET usage_state='held',usage_subscription_id=?,usage_period_start=?,
    usage_units=2,usage_reserved_at=dispatch_started_at,usage_digest=? WHERE id=? AND merchant_id=? AND state='dispatching'
      AND usage_state IN ('pending','legacy') AND UTC_TIMESTAMP(3)>=dispatch_started_at AND UTC_TIMESTAMP(3)<?
      AND EXISTS (SELECT 1 FROM merchant_subscriptions WHERE id=? AND merchant_id=?
        AND status IN ('active','trial') AND start_date<=UTC_TIMESTAMP(3) AND end_date>UTC_TIMESTAMP(3)
        AND (status<>'trial' OR trial_ends_at>UTC_TIMESTAMP(3)) AND last_reset_at=?)`,
    [s.id,sqlTime(periodStart),policyArtifactDigest(proof),row.id,row.merchant_id,sqlTime(expiresAt),s.id,row.merchant_id,sqlTime(periodStart)]);
  if (Number(saved.affectedRows) !== 1) return unavailable();
}

/** Called only after validating the exact channel receipt. Does not send or choose a replacement subscription. */
export async function settleSalesReplyUsage(c: PoolConnection, row: any, transport: string, providerMessageId: string | null, recoveryToken?: string) {
  if (row.usage_state === 'legacy') return;
  if (row.usage_state === 'pending') {
    if (row.state !== 'authorized') return unavailable();
    return;
  }
  const proof = evidence(row);
  if (policyArtifactDigest(proof) !== row.usage_digest || proof.reservedAt !== timestamp(row.dispatch_started_at)) return unavailable();
  if (row.usage_state !== 'held') {
    if (!['charged','historical','released'].includes(row.usage_state)) return unavailable();
    if (row.usage_state === 'released' && ['accepted','delivered','read','failed'].includes(transport) && providerMessageId) return unavailable();
    return;
  }
  const accepted = !!providerMessageId && ['accepted','delivered','read','failed'].includes(transport);
  const rejected = ['rejected','suppressed'].includes(transport);
  if (!accepted && !rejected) return; // Ambiguity retains the reservation; it is not billable proof.
  let state = 'released';
  if (accepted) {
    const [subscriptions] = await c.execute<any[]>('SELECT merchant_id,last_reset_at,messages_used FROM merchant_subscriptions WHERE id=? FOR UPDATE', [proof.subscriptionId]);
    const s = subscriptions[0];
    if (s && Number(s.merchant_id) !== proof.merchantId) return unavailable();
    state = 'historical';
    if (s && timestamp(s.last_reset_at) === proof.periodStart) {
      const [updated] = await c.execute<any>(`UPDATE merchant_subscriptions SET messages_used=messages_used+2
        WHERE id=? AND merchant_id=? AND last_reset_at=? AND messages_used>=0 AND messages_used<=2147483645`,
        [proof.subscriptionId,proof.merchantId,sqlTime(proof.periodStart)]);
      if (Number(updated.affectedRows) !== 1) return unavailable(); state = 'charged';
    }
  }
  const [updated] = await c.execute<any>(`UPDATE ai_sales_reply_deliveries SET usage_state=?,usage_settled_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND usage_state='held' AND usage_digest=?
      AND (? IS NULL OR (projection_state='pending' AND projection_token=? AND projection_lease_until>UTC_TIMESTAMP(3)))`,
    [state,proof.deliveryId,proof.merchantId,row.usage_digest,recoveryToken ?? null,recoveryToken ?? null]);
  if (Number(updated.affectedRows) !== 1) return unavailable();
}
