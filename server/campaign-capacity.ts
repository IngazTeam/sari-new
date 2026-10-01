import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { assertRuntimeSchema } from './db/schema-readiness';
import { TRIAL_USAGE_LIMITS } from '../shared/subscription-usage';

export class CampaignCapacityUnavailableError extends Error {
  constructor() { super('Campaign message capacity is unavailable'); this.name = 'CampaignCapacityUnavailableError'; }
}

export const campaignCapacitySql = `SELECT s.id AS subscriptionId, s.status, s.plan_id AS planId, p.id AS resolvedPlanId,
  s.messages_used AS used, s.last_reset_at AS periodStart, p.message_limit AS messageLimit,
  ((SELECT COALESCE(SUM(usage_units),0) FROM ai_sales_reply_deliveries
     WHERE merchant_id=s.merchant_id AND usage_subscription_id=s.id AND usage_period_start=s.last_reset_at AND usage_state='held') +
   (SELECT COALESCE(SUM(usage_units),0) FROM ai_interaction_jobs
     WHERE merchant_id=s.merchant_id AND usage_subscription_id=s.id AND usage_period_start=s.last_reset_at AND usage_state='held')) AS held
  FROM merchants m JOIN merchant_subscriptions s ON s.merchant_id=m.id AND s.id=m.current_subscription_id
  LEFT JOIN subscription_plans p ON p.id=s.plan_id
  WHERE m.id=? AND m.status='active' AND s.status IN ('active','trial')
    AND s.start_date<=UTC_TIMESTAMP(3) AND s.end_date>UTC_TIMESTAMP(3) AND s.last_reset_at<=UTC_TIMESTAMP(3)
    AND (s.status<>'trial' OR s.trial_ends_at>UTC_TIMESTAMP(3))`;

const number = (value: unknown, min: number) => {
  if (!(typeof value === 'number' || typeof value === 'string' && /^-?\d+$/.test(value))) throw new CampaignCapacityUnavailableError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > 2_147_483_647) throw new CampaignCapacityUnavailableError();
  return parsed;
};

export function campaignCapacityFromRows(rows: Record<string, unknown>[]) {
  if (rows.length !== 1) throw new CampaignCapacityUnavailableError();
  const row = rows[0], subscriptionId = number(row.subscriptionId, 1), used = number(row.used, 0), held = number(row.held, 0);
  if (!(row.periodStart instanceof Date || typeof row.periodStart === 'string')) throw new CampaignCapacityUnavailableError();
  const period = databaseTimeEpoch(row.periodStart);
  if (!Number.isFinite(period) || !['active','trial'].includes(String(row.status))) throw new CampaignCapacityUnavailableError();
  let limit: number;
  if (row.planId === null && row.status === 'trial') limit = TRIAL_USAGE_LIMITS.maxMessages;
  else {
    if (number(row.planId, 1) !== number(row.resolvedPlanId, 1)) throw new CampaignCapacityUnavailableError();
    limit = number(row.messageLimit, -1);
  }
  if (used + held > 2_147_483_647) throw new CampaignCapacityUnavailableError();
  // INT storage capacity remains finite even for a commercially unlimited plan.
  const remaining = Math.max(0, (limit === -1 ? 2_147_483_647 : Math.min(limit,2_147_483_647)) - used - held);
  return { subscriptionId, used, held, limit, unlimited: limit === -1, remaining, periodStart: new Date(period).toISOString() };
}

/** One read-only statement keeps the selected subscription, its plan and both hold ledgers consistent.
 * Campaign reservations are already reflected in messages_used; reply holds are not.
 * This is availability evidence, not a reservation. The worker must recheck under its write locks.
 */
export async function readCampaignCapacity(merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new CampaignCapacityUnavailableError();
  try {
    await assertRuntimeSchema('campaign admission capacity', [
      { table:'merchants', columns:['current_subscription_id'] },
      { table:'merchant_subscriptions', columns:['messages_used','last_reset_at'] },
      { table:'ai_sales_reply_deliveries', columns:['usage_state','usage_units','usage_period_start','usage_subscription_id'] },
      { table:'ai_interaction_jobs', columns:['usage_state','usage_units','usage_period_start','usage_subscription_id'] },
    ]);
    const pool = await getPool();
    if (!pool) throw new CampaignCapacityUnavailableError();
    const [rows] = await pool.execute<RowDataPacket[]>(campaignCapacitySql, [merchantId]);
    return campaignCapacityFromRows(rows);
  } catch { throw new CampaignCapacityUnavailableError(); }
}
