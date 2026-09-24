import { createHash, randomUUID } from 'node:crypto';
import { getPool } from '../db/connection';

export class AiBudgetError extends Error {
  constructor(readonly code: 'identity_required' | 'policy_required' | 'price_required' | 'budget_exceeded'
    | 'budget_unavailable' | 'duplicate_request' | 'reservation_conflict' | 'invalid_usage') {
    super(`AI budget: ${code}`);
    this.name = 'AiBudgetError';
  }
}
type Identity = number | string | undefined;
type Price = { version: string; input_micro_usd_per_million: number; output_micro_usd_per_million: number;
  flat_micro_usd: number; max_input_tokens: number };
type Reservation = { reservationKey: string; requestId: string; scopeKey: string; period: string; created: boolean };
export type BudgetRequest = { merchantId: Identity; provider: string; model: string; taskType: string;
  requestId?: string; inputTokens: number; maxOutputTokens: number; hasExternalMedia?: boolean };
export type AiBudgetAttempt = Readonly<Pick<Reservation, 'reservationKey' | 'requestId' | 'scopeKey'>
  & Pick<BudgetRequest, 'provider' | 'model' | 'taskType'>>;
/** Internal durable handoff hooks; neither hook authorizes another provider attempt. */
export type AiBudgetLifecycle<T> = {
  beforeDispatch(attempt: AiBudgetAttempt): Promise<void>;
  afterResponse(result: T, attempt: AiBudgetAttempt): Promise<void>;
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function integer(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new AiBudgetError('invalid_usage');
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new AiBudgetError('invalid_usage');
  return result;
}
export function pricedMicroUsd(inputTokens: number, outputTokens: number, inputRate: number, outputRate: number, flat = 0): number {
  const numerator = BigInt(integer(inputTokens)) * BigInt(integer(inputRate)) + BigInt(integer(outputTokens)) * BigInt(integer(outputRate));
  return integer(Number((numerator + BigInt(999_999)) / BigInt(1_000_000) + BigInt(integer(flat))));
}
export function aiBudgetScope(identity: Identity): string {
  if (typeof identity === 'number' && Number.isSafeInteger(identity) && identity > 0) return `merchant:${identity}`;
  if (typeof identity === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(identity)) return `platform:${identity}`;
  throw new AiBudgetError('identity_required');
}

async function policyFor(identity: Identity) {
  const scopeKey = aiBudgetScope(identity);
  const pool = await getPool();
  if (!pool) throw new AiBudgetError('budget_unavailable');
  let inheritedPolicy = scopeKey;
  if (typeof identity === 'number') {
    const [rows] = await pool.execute<any[]>(
      `SELECT s.plan_id, s.status FROM merchant_subscriptions s
       INNER JOIN merchants m ON m.id = s.merchant_id AND m.current_subscription_id = s.id
       WHERE s.merchant_id = ? AND m.status <> 'suspended' AND s.status IN ('trial','active')
         AND s.start_date <= UTC_TIMESTAMP() AND s.end_date > UTC_TIMESTAMP()
         AND (s.status <> 'trial' OR s.trial_ends_at > UTC_TIMESTAMP()) LIMIT 1`, [identity],
    );
    if (!rows[0]) throw new AiBudgetError('policy_required');
    inheritedPolicy = rows[0].status === 'trial' ? 'trial' : `plan:${rows[0].plan_id}`;
  }
  const [globalRows] = await pool.execute<any[]>(
    "SELECT version, daily_limit_micro_usd, enabled FROM ai_budget_policies WHERE scope_key = 'global'",
  );
  const global = globalRows[0];
  if (!global || Number(global.enabled) !== 1) throw new AiBudgetError('policy_required');
  const globalLimit = integer(global.daily_limit_micro_usd);
  if (globalLimit === 0) throw new AiBudgetError('budget_exceeded');
  const [rows] = await pool.execute<any[]>(
    `SELECT scope_key, version, daily_limit_micro_usd, enabled, DATE_FORMAT(UTC_DATE(), '%Y-%m-%d') AS period
     FROM ai_budget_policies WHERE scope_key IN (?, ?, 'global')
     ORDER BY (scope_key = ?) DESC, (scope_key = ?) DESC LIMIT 1`,
    [scopeKey, inheritedPolicy, scopeKey, inheritedPolicy],
  );
  if (!rows[0] || Number(rows[0].enabled) !== 1) throw new AiBudgetError('policy_required');
  const limit = integer(rows[0].daily_limit_micro_usd);
  if (limit === 0) throw new AiBudgetError('budget_exceeded');
  return { pool, scopeKey, version: rows[0].version as string, limit, period: rows[0].period as string,
    globalLimit, globalVersion: String(global.version) };
}

/** A request ID is one provider attempt. Reusing it never authorizes another call. */
export async function reserveAiBudget(input: BudgetRequest): Promise<Reservation> {
  const policy = await policyFor(input.merchantId);
  if (!input.provider || input.provider.length > 40 || !input.model || input.model.length > 128
    || !input.taskType || input.taskType.length > 96) throw new AiBudgetError('invalid_usage');
  integer(input.inputTokens);
  integer(input.maxOutputTokens);
  const requestId = input.requestId ?? randomUUID();
  if (!requestId || requestId.length > 160) throw new AiBudgetError('invalid_usage');
  const [cards] = await policy.pool.execute<any[]>(
    'SELECT * FROM ai_price_cards WHERE provider = ? AND model = ? AND enabled = 1 LIMIT 1', [input.provider, input.model],
  );
  const price = cards[0] as Price | undefined;
  if (!price) throw new AiBudgetError('price_required');
  const maxInput = integer(price.max_input_tokens);
  const promptTokens = input.hasExternalMedia ? maxInput : integer(input.inputTokens);
  if (promptTokens > maxInput || maxInput === 0) throw new AiBudgetError('invalid_usage');
  const amount = pricedMicroUsd(promptTokens, input.maxOutputTokens,
    price.input_micro_usd_per_million, price.output_micro_usd_per_million, price.flat_micro_usd);
  if (amount === 0) throw new AiBudgetError('price_required');
  const reservationKey = digest([policy.scopeKey, requestId]);
  const fingerprint = digest([input.provider, input.model, input.taskType, input.inputTokens, input.maxOutputTokens, Boolean(input.hasExternalMedia)]);
  const connection = await policy.pool.getConnection();
  try {
    await connection.beginTransaction();
    // All attempts lock the platform period first, then the tenant period.
    await connection.execute(
      `INSERT INTO ai_budget_periods (scope_key, period_start, policy_version, limit_micro_usd)
       VALUES ('global', ?, ?, ?) ON DUPLICATE KEY UPDATE scope_key = VALUES(scope_key)`,
      [policy.period, policy.globalVersion, policy.globalLimit],
    );
    await connection.execute("SELECT scope_key FROM ai_budget_periods WHERE scope_key = 'global' AND period_start = ? FOR UPDATE", [policy.period]);
    await connection.execute(
      `INSERT INTO ai_budget_periods (scope_key, period_start, policy_version, limit_micro_usd)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE scope_key = VALUES(scope_key)`,
      [policy.scopeKey, policy.period, policy.version, policy.limit],
    );
    await connection.execute('SELECT scope_key FROM ai_budget_periods WHERE scope_key = ? AND period_start = ? FOR UPDATE', [policy.scopeKey, policy.period]);
    const [existing] = await connection.execute<any[]>('SELECT fingerprint, period_start FROM ai_usage_reservations WHERE reservation_key = ?', [reservationKey]);
    if (existing[0]) {
      if (existing[0].fingerprint !== fingerprint) throw new AiBudgetError('reservation_conflict');
      await connection.commit();
      return { reservationKey, requestId, scopeKey: policy.scopeKey, period: String(existing[0].period_start), created: false };
    }
    const [updated] = await connection.execute<any>(
      `UPDATE ai_budget_periods SET reserved_micro_usd = reserved_micro_usd + ?
       WHERE scope_key = ? AND period_start = ?
         AND spent_micro_usd + reserved_micro_usd + ? <= LEAST(limit_micro_usd, ?)`,
      [amount, policy.scopeKey, policy.period, amount, policy.limit],
    );
    if (Number(updated.affectedRows) !== 1) throw new AiBudgetError('budget_exceeded');
    const [globalUpdated] = await connection.execute<any>(
      `UPDATE ai_budget_periods SET reserved_micro_usd = reserved_micro_usd + ?
       WHERE scope_key = 'global' AND period_start = ?
         AND spent_micro_usd + reserved_micro_usd + ? <= LEAST(limit_micro_usd, ?)`,
      [amount, policy.period, amount, policy.globalLimit],
    );
    if (Number(globalUpdated.affectedRows) !== 1) throw new AiBudgetError('budget_exceeded');
    await connection.execute(
      `INSERT INTO ai_usage_reservations (reservation_key, request_id, scope_key, period_start, fingerprint, provider, model, task_type,
        price_version, input_rate, output_rate, flat_micro_usd, reserved_micro_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reservationKey, requestId, policy.scopeKey, policy.period, fingerprint, input.provider, input.model, input.taskType,
        price.version, price.input_micro_usd_per_million, price.output_micro_usd_per_million, price.flat_micro_usd, amount],
    );
    await connection.commit();
    return { reservationKey, requestId, scopeKey: policy.scopeKey, period: policy.period, created: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

/** Unknown reservations remain held across restarts and UTC boundaries until reconciled. */
export async function markAiBudgetUnknown(reservation: Reservation): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new AiBudgetError('budget_unavailable');
  await pool.execute("UPDATE ai_usage_reservations SET state = 'unknown' WHERE reservation_key = ? AND scope_key = ? AND state = 'reserved'",
    [reservation.reservationKey, reservation.scopeKey]);
}

export async function settleAiBudget(reservation: Reservation, usage: { prompt_tokens: number; completion_tokens: number },
  evidence?: { billedMicroUsd: number; reference: string; actorId: number }): Promise<void> {
  if (evidence && (!Number.isSafeInteger(evidence.actorId) || evidence.actorId <= 0 || evidence.reference.trim().length < 8 || evidence.reference.length > 160)) {
    throw new AiBudgetError('invalid_usage');
  }
  const pool = await getPool();
  if (!pool) throw new AiBudgetError('budget_unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Match reserve's lock order (period, then reservation) to avoid lock inversion.
    const [lookup] = await connection.execute<any[]>('SELECT DATE_FORMAT(period_start, \'%Y-%m-%d\') AS period FROM ai_usage_reservations WHERE reservation_key = ? AND scope_key = ?', [reservation.reservationKey, reservation.scopeKey]);
    if (!lookup[0]) throw new AiBudgetError('reservation_conflict');
    const period = lookup[0].period;
    await connection.execute("SELECT scope_key FROM ai_budget_periods WHERE scope_key = 'global' AND period_start = ? FOR UPDATE", [period]);
    await connection.execute('SELECT scope_key FROM ai_budget_periods WHERE scope_key = ? AND period_start = ? FOR UPDATE', [reservation.scopeKey, period]);
    const [rows] = await connection.execute<any[]>('SELECT * FROM ai_usage_reservations WHERE reservation_key = ? AND scope_key = ? FOR UPDATE', [reservation.reservationKey, reservation.scopeKey]);
    const row = rows[0];
    const amount = evidence ? integer(evidence.billedMicroUsd)
      : pricedMicroUsd(usage.prompt_tokens, usage.completion_tokens, row.input_rate, row.output_rate, row.flat_micro_usd);
    if (row.state === 'settled') {
      if (integer(row.settled_micro_usd) !== amount) throw new AiBudgetError('reservation_conflict');
    } else {
      if (!['reserved', 'unknown'].includes(row.state)) throw new AiBudgetError('reservation_conflict');
      // Record real usage even if a provider violated the quote; later reservations will stop.
      const [updated] = await connection.execute<any>(
        `UPDATE ai_budget_periods SET reserved_micro_usd = reserved_micro_usd - ?, spent_micro_usd = spent_micro_usd + ?
         WHERE scope_key = ? AND period_start = ? AND reserved_micro_usd >= ?`,
        [row.reserved_micro_usd, amount, reservation.scopeKey, period, row.reserved_micro_usd],
      );
      if (Number(updated.affectedRows) !== 1) throw new AiBudgetError('reservation_conflict');
      const [globalUpdated] = await connection.execute<any>(
        `UPDATE ai_budget_periods SET reserved_micro_usd = reserved_micro_usd - ?, spent_micro_usd = spent_micro_usd + ?
         WHERE scope_key = 'global' AND period_start = ? AND reserved_micro_usd >= ?`,
        [row.reserved_micro_usd, amount, period, row.reserved_micro_usd],
      );
      if (Number(globalUpdated.affectedRows) !== 1) throw new AiBudgetError('reservation_conflict');
      await connection.execute(`UPDATE ai_usage_reservations SET state = 'settled', settled_micro_usd = ?,
        reconciliation_reference = ?, reconciled_by = ? WHERE reservation_key = ?`,
        [amount, evidence?.reference ?? null, evidence?.actorId ?? null, reservation.reservationKey]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function getAiBudgetStatus(identity: Identity) {
  const policy = await policyFor(identity);
  const [rows] = await policy.pool.execute<any[]>('SELECT reserved_micro_usd, spent_micro_usd, limit_micro_usd FROM ai_budget_periods WHERE scope_key = ? AND period_start = ?', [policy.scopeKey, policy.period]);
  const row = rows[0];
  const used = row ? integer(row.reserved_micro_usd) + integer(row.spent_micro_usd) : 0;
  const limit = row ? Math.min(integer(row.limit_micro_usd), policy.limit) : policy.limit;
  const [globalRows] = await policy.pool.execute<any[]>("SELECT reserved_micro_usd, spent_micro_usd, limit_micro_usd FROM ai_budget_periods WHERE scope_key = 'global' AND period_start = ?", [policy.period]);
  const globalRow = globalRows[0];
  const globalUsed = globalRow ? integer(globalRow.reserved_micro_usd) + integer(globalRow.spent_micro_usd) : 0;
  const globalLimit = globalRow ? Math.min(integer(globalRow.limit_micro_usd), policy.globalLimit) : policy.globalLimit;
  return { used, limit, globalUsed, globalLimit, exceeded: used >= limit || globalUsed >= globalLimit,
    percentUsed: Math.min(100, Math.max(Math.floor(used * 100 / limit), Math.floor(globalUsed * 100 / globalLimit))) };
}

export async function withAiBudget<T>(input: BudgetRequest, operation: (attempt: { requestId: string }) => Promise<T>, usageOf: (result: T) => { prompt_tokens: number; completion_tokens: number } | undefined,
  lifecycle?: AiBudgetLifecycle<T>): Promise<T> {
  // Snapshot metadata before awaiting storage; callbacks never share a mutable authority object.
  input = { ...input };
  const route = { provider: input.provider, model: input.model, taskType: input.taskType };
  let reservation: Reservation;
  try { reservation = await reserveAiBudget(input); }
  catch (error) { if (error instanceof AiBudgetError) throw error; throw new AiBudgetError('budget_unavailable'); }
  if (!reservation.created) throw new AiBudgetError('duplicate_request');
  const attempt: AiBudgetAttempt = Object.freeze({ reservationKey: reservation.reservationKey,
    requestId: reservation.requestId, scopeKey: reservation.scopeKey, ...route });
  let providerCompleted = false;
  try {
    if (lifecycle) {
      try { await lifecycle.beforeDispatch(attempt); }
      catch { throw new AiBudgetError('budget_unavailable'); }
    }
    const result = await operation({ requestId: reservation.requestId });
    providerCompleted = true;
    if (lifecycle) {
      try { await lifecycle.afterResponse(result, attempt); }
      catch { throw new AiBudgetError('budget_unavailable'); }
    }
    const usage = usageOf(result);
    if (usage) await settleAiBudget(reservation, usage);
    else await markAiBudgetUnknown(reservation);
    return result;
  } catch (error) {
    // A failed settlement must not free potentially billed usage or trigger an ungoverned fallback.
    try { await markAiBudgetUnknown(reservation); } catch { /* the reserved amount remains held */ }
    if (error instanceof AiBudgetError) throw error;
    if (providerCompleted) throw new AiBudgetError('budget_unavailable');
    throw error;
  }
}

export function promptBudgetShape(payload: unknown): { inputTokens: number; hasExternalMedia: boolean } {
  const json = JSON.stringify(payload);
  if (!json || Buffer.byteLength(json, 'utf8') > 2 * 1024 * 1024) throw new AiBudgetError('invalid_usage');
  // UTF-8 bytes plus framing are a conservative bound for text, not a typical token estimate.
  return { inputTokens: Buffer.byteLength(json, 'utf8') + 4096, hasExternalMedia: /"(?:image_url|file_url|file)"\s*:/.test(json) };
}
