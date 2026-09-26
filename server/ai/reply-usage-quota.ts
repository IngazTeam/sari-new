import type { PoolConnection } from 'mysql2/promise';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';

export async function assertReplyUsageSchema() {
  await assertRuntimeSchema('shared reply subscription usage', [
    { table: 'ai_sales_reply_deliveries', columns: ['usage_state','usage_subscription_id','usage_period_start','usage_units'], checkConstraints: ['ck_sales_reply_usage'] },
    { table: 'ai_interaction_jobs', columns: ['usage_state','usage_subscription_id','usage_period_start','usage_units','usage_reserved_at',
      'usage_digest','usage_settled_at','usage_outbox_id','usage_provider','usage_request_digest','usage_recovery_at','usage_attempts','usage_last_error'],
      checkConstraints: ['ck_ordinary_reply_usage'] },
  ]);
}

export const replyUsageUnavailable = (): never => { throw Error('Reply usage evidence unavailable'); };
export const replyUsageTime = (value: any) => {
  const epoch = databaseTimeEpoch(value);
  if (!Number.isFinite(epoch)) return replyUsageUnavailable();
  return new Date(epoch).toISOString();
};
export const replyUsageSqlTime = (value: string) => value.slice(0, 23).replace('T', ' ');

/** Caller locks the merchant first. Both reply paths serialize on this subscription. */
export async function lockReplyUsageCapacity(c: PoolConnection, merchantId: number) {
  const [subscriptions] = await c.execute<any[]>(`SELECT s.* FROM merchant_subscriptions s
    JOIN merchants m ON m.id=s.merchant_id AND m.current_subscription_id=s.id
    WHERE m.id=? AND s.status IN ('active','trial') AND s.start_date<=UTC_TIMESTAMP(3) AND s.end_date>UTC_TIMESTAMP(3)
      AND s.last_reset_at<=UTC_TIMESTAMP(3) AND (s.status<>'trial' OR s.trial_ends_at>UTC_TIMESTAMP(3)) FOR UPDATE`, [merchantId]);
  if (subscriptions.length !== 1) return replyUsageUnavailable();
  const s = subscriptions[0], used = Number(s.messages_used), periodStart = replyUsageTime(s.last_reset_at);
  if (!Number.isSafeInteger(used) || used < 0 || used > 2147483645) return replyUsageUnavailable();
  let limit = -1;
  if (s.plan_id !== null) {
    const [plans] = await c.execute<any[]>('SELECT message_limit FROM subscription_plans WHERE id=? FOR SHARE', [s.plan_id]);
    if (plans.length !== 1) return replyUsageUnavailable();
    limit = Number(plans[0].message_limit);
  } else if (s.status !== 'trial') return replyUsageUnavailable();
  if (!Number.isSafeInteger(limit) || limit < -1) return replyUsageUnavailable();
  const args = [merchantId, s.id, replyUsageSqlTime(periodStart)];
  const [holds] = await c.execute<any[]>(`SELECT (
    (SELECT COALESCE(SUM(usage_units),0) FROM ai_sales_reply_deliveries
      WHERE merchant_id=? AND usage_subscription_id=? AND usage_period_start=? AND usage_state='held') +
    (SELECT COALESCE(SUM(usage_units),0) FROM ai_interaction_jobs
      WHERE merchant_id=? AND usage_subscription_id=? AND usage_period_start=? AND usage_state='held')) AS held`, [...args, ...args]);
  const held = Number(holds[0].held);
  if (!Number.isSafeInteger(held) || held < 0 || used + held + 2 > 2147483647
      || limit !== -1 && used + held + 2 > limit) return replyUsageUnavailable();
  return { subscriptionId: Number(s.id), periodStart };
}
