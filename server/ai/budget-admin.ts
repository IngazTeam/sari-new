import { z } from 'zod';
import { getPool } from '../db/connection';
import { settleAiBudget } from './budget-ledger';

const money = z.number().finite().min(0).max(1_000_000).refine(value => {
  const scaled = value * 1_000_000;
  return Number.isSafeInteger(Math.round(scaled))
    && (value === 0 || Math.round(scaled) > 0)
    && Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, scaled) * 2;
}, 'المبلغ يجب أن يكون بدقة ست منازل عشرية كحد أقصى');
export const aiPriceCardInput = z.object({
  provider: z.enum(['openai', 'zahypi']),
  model: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  version: z.string().trim().min(1).max(80),
  inputUsdPerMillion: money,
  outputUsdPerMillion: money,
  flatUsd: money,
  maxInputTokens: z.number().int().positive().max(10_000_000),
  enabled: z.boolean(),
}).strict().refine(value => value.inputUsdPerMillion > 0 || value.outputUsdPerMillion > 0 || value.flatUsd > 0,
  'أدخل سعرًا معتمدًا؛ السعر الصفري لا يتيح تقدير سقف الإنفاق');

export async function readAiBudgetAdmin() {
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [policies] = await pool.execute<any[]>("SELECT daily_limit_micro_usd, enabled FROM ai_budget_policies WHERE scope_key='global'");
  const [periods] = await pool.execute<any[]>("SELECT limit_micro_usd, spent_micro_usd, reserved_micro_usd FROM ai_budget_periods WHERE scope_key='global' AND period_start=UTC_DATE()");
  const [cards] = await pool.execute<any[]>('SELECT * FROM ai_price_cards ORDER BY provider, model');
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
    prices: cards.map(card => ({ provider: card.provider as 'openai' | 'zahypi', model: String(card.model),
      version: String(card.version), inputUsdPerMillion: Number(card.input_micro_usd_per_million) / 1_000_000,
      outputUsdPerMillion: Number(card.output_micro_usd_per_million) / 1_000_000, flatUsd: Number(card.flat_micro_usd) / 1_000_000,
      maxInputTokens: Number(card.max_input_tokens), enabled: Number(card.enabled) === 1 })),
  };
}

export const aiReconciliationInput = z.object({
  reservationKey: z.string().regex(/^[a-f0-9]{64}$/), billedUsd: money,
  reference: z.string().trim().min(8).max(160), confirmedProviderEvidence: z.literal(true),
}).strict();

export async function reconcileAiReservation(input: z.infer<typeof aiReconciliationInput>, actorId: number) {
  aiReconciliationInput.parse(input);
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT scope_key, request_id, DATE_FORMAT(period_start, '%Y-%m-%d') AS period FROM ai_usage_reservations
    WHERE reservation_key = ? AND (state IN ('unknown', 'settled') OR (state='reserved' AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)))`, [input.reservationKey]);
  if (!rows[0]) throw new Error('Reservation unavailable or still in progress');
  await settleAiBudget({ reservationKey: input.reservationKey, requestId: rows[0].request_id, scopeKey: rows[0].scope_key, period: rows[0].period, created: false },
    { prompt_tokens: 0, completion_tokens: 0 }, { billedMicroUsd: Math.round(input.billedUsd * 1_000_000), reference: input.reference, actorId });
  return { success: true };
}

export async function saveAiPriceCard(raw: z.input<typeof aiPriceCardInput>) {
  const input = aiPriceCardInput.parse(raw);
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  await pool.execute(`INSERT INTO ai_price_cards (provider, model, version, input_micro_usd_per_million,
    output_micro_usd_per_million, flat_micro_usd, max_input_tokens, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE version=VALUES(version), input_micro_usd_per_million=VALUES(input_micro_usd_per_million),
    output_micro_usd_per_million=VALUES(output_micro_usd_per_million), flat_micro_usd=VALUES(flat_micro_usd),
    max_input_tokens=VALUES(max_input_tokens), enabled=VALUES(enabled)`,
    [input.provider, input.model, input.version, Math.round(input.inputUsdPerMillion * 1_000_000),
      Math.round(input.outputUsdPerMillion * 1_000_000), Math.round(input.flatUsd * 1_000_000), input.maxInputTokens, Number(input.enabled)]);
  return { success: true };
}
