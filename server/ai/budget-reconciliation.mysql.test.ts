import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { reserveAiBudget, markAiBudgetUnknown, settleAiBudget } from './budget-ledger';
import { reconcileAiReservation } from './budget-admin';

describe.skipIf(!process.env.DATABASE_URL)('manual budget settlement authority and audit on MySQL', () => {
  const query = async (sql: string, args: any[] = []): Promise<any[]> => (await (await getPool())!.execute<any[]>(sql, args))[0];
  let admin: number, other: number, model: string, reservation: Awaited<ReturnType<typeof reserveAiBudget>>;
  let evidence: { reservationKey: string; billedUsd: number; reference: string; confirmedProviderEvidence: true };
  const row = async () => (await query('SELECT * FROM ai_usage_reservations WHERE reservation_key=?', [reservation.reservationKey]))[0];
  beforeEach(async () => {
    admin = (await createDisposableMerchant('manual-admin')).userId; other = (await createDisposableMerchant('other-admin')).userId;
    await query("UPDATE users SET role='admin' WHERE id IN (?,?)", [admin, other]); model = 'manual-' + randomUUID();
    await query("INSERT INTO ai_price_cards(provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,max_input_tokens) VALUES ('openai',?,'v1',1000000,1000000,10000)", [model]);
    reservation = await reserveAiBudget({ merchantId: 'manual-' + randomUUID(), provider: 'openai', model, taskType: 'fixture.manual', inputTokens: 10, maxOutputTokens: 10 });
    await markAiBudgetUnknown(reservation);
    evidence = { reservationKey: reservation.reservationKey, billedUsd: 0.000007, reference: 'synthetic-provider-invoice', confirmedProviderEvidence: true };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const period of await query('SELECT * FROM ai_budget_periods WHERE scope_key=?', [reservation.scopeKey])) {
      await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-?,spent_micro_usd=spent_micro_usd-? WHERE scope_key='global' AND period_start=?", [period.reserved_micro_usd, period.spent_micro_usd, period.period_start]);
    }
    for (const table of ['ai_usage_reservations', 'ai_budget_periods', 'ai_budget_policies']) await query(`DELETE FROM ${table} WHERE scope_key=?`, [reservation.scopeKey]);
    await query('DELETE FROM ai_price_cards WHERE model=?', [model]); await cleanupDisposableMerchants([admin, other]);
  });
  afterAll(closeDb);
  it.each(['user', 'deletion_pending', 'missing'])('rejects %s authority without releasing held spend', async state => {
    if (state === 'missing') await cleanupDisposableMerchants([admin]);
    else await query(state === 'user' ? "UPDATE users SET role='user' WHERE id=?" : "UPDATE users SET account_status='deletion_pending' WHERE id=?", [admin]);
    await expect(reconcileAiReservation(evidence, admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await row()).toMatchObject({ state: 'unknown', reconciled_by: null, settled_micro_usd: null });
  });
  it('rechecks authority when it is revoked between reading a reservation and beginning its settlement', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection(), begin = connection.beginTransaction.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'beginTransaction').mockImplementationOnce(async () => { await query("UPDATE users SET role='user' WHERE id=?", [admin]); await begin(); });
    await expect(reconcileAiReservation(evidence, admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await row()).toMatchObject({ state: 'unknown', settled_micro_usd: null });
  });
  it('rechecks reservation eligibility under lock, including a fresh reserved row', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection(), begin = connection.beginTransaction.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'beginTransaction').mockImplementationOnce(async () => { await query("UPDATE ai_usage_reservations SET state='reserved',created_at=UTC_TIMESTAMP() WHERE reservation_key=?", [reservation.reservationKey]); await begin(); });
    await expect(reconcileAiReservation(evidence, admin)).rejects.toMatchObject({ code: 'reservation_conflict' });
    expect(await row()).toMatchObject({ state: 'reserved', settled_micro_usd: null });
  });
  it('accepts stale reserved evidence and preserves the original actor and reference across an exact retry', async () => {
    await query("UPDATE ai_usage_reservations SET state='reserved',created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 16 MINUTE) WHERE reservation_key=?", [reservation.reservationKey]);
    await reconcileAiReservation({ ...evidence, reference: '  ' + evidence.reference + '  ' }, admin);
    await reconcileAiReservation(evidence, admin);
    expect(await row()).toMatchObject({ state: 'settled', settled_micro_usd: 7, reconciled_by: admin, reconciliation_reference: evidence.reference });
    await expect(reconcileAiReservation(evidence, other)).rejects.toMatchObject({ code: 'reservation_conflict' });
    await expect(reconcileAiReservation({ ...evidence, reference: 'different-provider-reference' }, admin)).rejects.toMatchObject({ code: 'reservation_conflict' });
  });
  it('does not falsely acknowledge manual audit after automatic settlement at the same amount', async () => {
    await settleAiBudget(reservation, { prompt_tokens: 7, completion_tokens: 0 });
    await expect(reconcileAiReservation(evidence, admin)).rejects.toMatchObject({ code: 'reservation_conflict' });
    expect(await row()).toMatchObject({ settled_micro_usd: 7, reconciled_by: null, reconciliation_reference: null });
  });
  it('admits one of two different administrative claims and does not rewrite the winner', async () => {
    const results = await Promise.allSettled([reconcileAiReservation(evidence, admin), reconcileAiReservation({ ...evidence, reference: 'second-admin-evidence' }, other)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('reservation_conflict');
    const saved = await row(); expect([admin, other]).toContain(saved.reconciled_by); expect(saved.settled_micro_usd).toBe(7);
  });
});
