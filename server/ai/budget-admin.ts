import { z } from 'zod';
import { getPool } from '../db/connection';
import { settleAiBudget } from './budget-ledger';
import { aiMoney } from '../../shared/ai-price-contract';
import { assertAiBudgetAdmin, currentAiPrice } from './price-admin';
export { aiPriceCardInput } from '../../shared/ai-price-contract';
export { saveAiPriceCard } from './price-admin';

export async function readAiBudgetAdmin(actorId: number) {
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  await assertAiBudgetAdmin(pool, actorId);
  return readAiBudgetSnapshot();
}

/** Internal deployment inspection; never expose this without session authorization. */
export async function readAiBudgetSnapshot() {
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [policies] = await pool.execute<any[]>("SELECT daily_limit_micro_usd, enabled FROM ai_budget_policies WHERE scope_key='global'");
  const [periods] = await pool.execute<any[]>("SELECT limit_micro_usd, spent_micro_usd, reserved_micro_usd FROM ai_budget_periods WHERE scope_key='global' AND period_start=UTC_DATE()");
  const [cards] = await pool.execute<any[]>("SELECT * FROM ai_price_cards WHERE provider IN ('openai', 'zahypi') ORDER BY provider, model");
  const [unknown] = await pool.execute<any[]>("SELECT COUNT(*) AS count FROM ai_usage_reservations WHERE state='unknown'");
  const [pending] = await pool.execute<any[]>(`SELECT reservation_key, request_id, scope_key, provider, model, reserved_micro_usd, state, created_at
    FROM ai_usage_reservations WHERE state='unknown' OR (state='reserved' AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
    ORDER BY created_at ASC LIMIT 50`);
  const policy = policies[0];
  const period = periods[0];
  return {
    configured: Boolean(policy), enabled: Number(policy?.enabled) === 1,
    configuredLimitUsd: Number(policy?.daily_limit_micro_usd ?? 0) / 1_000_000,
    effectiveLimitUsd: Math.min(Number(policy?.daily_limit_micro_usd ?? 0), Number(period?.limit_micro_usd ?? policy?.daily_limit_micro_usd ?? 0)) / 1_000_000,
    spentUsd: Number(period?.spent_micro_usd ?? 0) / 1_000_000,
    reservedUsd: Number(period?.reserved_micro_usd ?? 0) / 1_000_000,
    unknownCount: Number(unknown[0]?.count ?? 0),
    pending: pending.map(row => ({ reservationKey: String(row.reservation_key), requestId: String(row.request_id),
      scope: String(row.scope_key), provider: String(row.provider), model: String(row.model), reservedUsd: Number(row.reserved_micro_usd) / 1_000_000 })),
    prices: cards.map(currentAiPrice),
  };
}

export const aiReconciliationInput = z.object({
  reservationKey: z.string().regex(/^[a-f0-9]{64}$/), billedUsd: aiMoney,
  reference: z.string().trim().min(8).max(160), confirmedProviderEvidence: z.literal(true),
}).strict();

export async function reconcileAiReservation(raw: z.infer<typeof aiReconciliationInput>, actorId: number) {
  const input = aiReconciliationInput.parse(raw);
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  await assertAiBudgetAdmin(pool, actorId);
  const [rows] = await pool.execute<any[]>(`SELECT scope_key, request_id, DATE_FORMAT(period_start, '%Y-%m-%d') AS period FROM ai_usage_reservations
    WHERE reservation_key = ? AND (state IN ('unknown', 'settled') OR (state='reserved' AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)))`, [input.reservationKey]);
  if (!rows[0]) throw new Error('Reservation unavailable or still in progress');
  await settleAiBudget({ reservationKey: input.reservationKey, requestId: rows[0].request_id, scopeKey: rows[0].scope_key, period: rows[0].period, created: false },
    { prompt_tokens: 0, completion_tokens: 0 }, { billedMicroUsd: Math.round(input.billedUsd * 1_000_000), reference: input.reference, actorId });
  return { success: true };
}
