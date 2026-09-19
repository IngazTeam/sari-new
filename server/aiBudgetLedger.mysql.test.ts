import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { getPool, closeDb } from './db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { reserveAiBudget, settleAiBudget, markAiBudgetUnknown, withAiBudget, getAiBudgetStatus, pricedMicroUsd } from './ai/budget-ledger';
import { reconcileAiReservation } from './ai/budget-admin';

describe.skipIf(!process.env.DATABASE_URL)('atomic AI budget on disposable MySQL', () => {
  const users: number[] = [];
  const scopes: string[] = [];
  const model = `test-${randomUUID()}`;
  const children: ChildProcess[] = [];
  afterEach(async () => {
    for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGKILL'); await ended;
    }
  });
  async function reserveInProcess(input: ReturnType<typeof request>, hold = false) {
    const child = fork(resolve('server/tests/helpers/budget-process-child.ts'), [JSON.stringify(input), hold ? 'hold' : 'exit'],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    children.push(child);
    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Budget child did not finish')), 20_000);
      child.once('message', message => { clearTimeout(timer); resolve(message); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
    });
    return { child, result };
  }
  const request = (merchantId: number | string, requestId = randomUUID()) => ({
    merchantId, provider: 'fixture', model, taskType: 'test.budget', requestId,
    inputTokens: 1, maxOutputTokens: 1,
  });
  async function cleanLedger() {
    assertDisposableDatabase();
    const pool = (await getPool())!;
    for (const scope of scopes) {
      await pool.execute('DELETE FROM ai_usage_reservations WHERE scope_key = ?', [scope]);
      await pool.execute('DELETE FROM ai_budget_periods WHERE scope_key = ?', [scope]);
      await pool.execute('DELETE FROM ai_budget_policies WHERE scope_key = ?', [scope]);
    }
    // This file exclusively owns the global budget fixture in the disposable database.
    await pool.execute("DELETE FROM ai_budget_periods WHERE scope_key = 'global'");
  }
  beforeEach(async () => {
    await cleanLedger();
    const pool = (await getPool())!;
    await pool.execute("UPDATE ai_budget_policies SET daily_limit_micro_usd = 100, enabled = 1 WHERE scope_key = 'global'");
    await pool.execute(`INSERT INTO ai_price_cards (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens)
      VALUES ('fixture',?,'v1',10000000,10000000,0,10000) ON DUPLICATE KEY UPDATE version='v1', input_micro_usd_per_million=10000000`, [model]);
  });
  afterAll(async () => {
    await cleanLedger();
    const pool = (await getPool())!;
    await pool.execute('DELETE FROM ai_price_cards WHERE provider = ? AND model = ?', ['fixture', model]);
    await pool.execute("UPDATE ai_budget_policies SET daily_limit_micro_usd = 100000000, enabled = 1 WHERE scope_key = 'global'");
    await cleanupDisposableMerchants(users);
    await closeDb();
  });
  function platform() {
    const id = `fixture-${randomUUID()}`;
    scopes.push(`platform:${id}`);
    return id;
  }
  it('admits only five of sixteen concurrent 20-micro-dollar reservations across tenants', async () => {
    const ids = Array.from({ length: 16 }, platform);
    const results = await Promise.allSettled(ids.map(id => reserveAiBudget(request(id))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
    for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('budget_exceeded');
    expect(await getAiBudgetStatus(ids[0])).toMatchObject({ globalUsed: 100, globalLimit: 100, exceeded: true });
  });
  it('enforces one global ceiling across six independent processes', async () => {
    const ids = Array.from({ length: 6 }, platform);
    const outcomes = await Promise.all(ids.map(id => reserveInProcess(request(id))));
    expect(outcomes.filter(item => item.result.accepted)).toHaveLength(5);
    expect(outcomes.filter(item => !item.result.accepted).map(item => item.result.code)).toEqual(['budget_exceeded']);
    expect(await getAiBudgetStatus(ids[0])).toMatchObject({ globalUsed: 100, globalLimit: 100 });
  }, 30_000);
  it('keeps a reservation charged after killing its owning process and blocks provider replay', async () => {
    const input = request(platform());
    const { child, result } = await reserveInProcess(input, true);
    expect(result.accepted).toBe(true);
    const ended = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGKILL'); await ended;
    const operation = vi.fn();
    await expect(withAiBudget(input, operation, () => undefined)).rejects.toMatchObject({ code: 'duplicate_request' });
    expect(operation).not.toHaveBeenCalled();
    expect(await getAiBudgetStatus(input.merchantId)).toMatchObject({ globalUsed: 20 });
  }, 25_000);
  it('does not charge duplicate admission or settlement, and uses the original price version', async () => {
    const input = request(platform());
    const reservation = await reserveAiBudget(input);
    const duplicate = await reserveAiBudget(input);
    expect(duplicate.created).toBe(false);
    await (await getPool())!.execute("UPDATE ai_price_cards SET version = 'v2', input_micro_usd_per_million = 99000000 WHERE model = ?", [model]);
    await settleAiBudget(reservation, { prompt_tokens: 1, completion_tokens: 0 });
    await settleAiBudget(reservation, { prompt_tokens: 1, completion_tokens: 0 });
    expect(await getAiBudgetStatus(input.merchantId)).toMatchObject({ used: 10, globalUsed: 10 });
    await expect(settleAiBudget(reservation, { prompt_tokens: 2, completion_tokens: 0 })).rejects.toMatchObject({ code: 'reservation_conflict' });
  });
  it('keeps ambiguous provider spend held after reconnect and rejects duplicate provider execution', async () => {
    const input = request(platform());
    const operation = vi.fn().mockRejectedValue(new Error('response lost'));
    await expect(withAiBudget(input, operation, () => undefined)).rejects.toThrow('response lost');
    await closeDb();
    await expect(withAiBudget(input, operation, () => undefined)).rejects.toMatchObject({ code: 'duplicate_request' });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(await getAiBudgetStatus(input.merchantId)).toMatchObject({ used: 20, globalUsed: 20 });
  });
  it('blocks a provider call when the global limit or model price is missing', async () => {
    const id = platform();
    const operation = vi.fn();
    await expect(withAiBudget({ ...request(id), model: 'unpriced' }, operation, () => undefined)).rejects.toMatchObject({ code: 'price_required' });
    await (await getPool())!.execute("UPDATE ai_budget_policies SET enabled = 0 WHERE scope_key = 'global'");
    await expect(withAiBudget(request(id), operation, () => undefined)).rejects.toMatchObject({ code: 'policy_required' });
    expect(operation).not.toHaveBeenCalled();
  });
  it('honors the canonical subscription and never falls back through a disabled merchant policy', async () => {
    const account = await createDisposableMerchant('budget');
    users.push(account.userId);
    scopes.push(`merchant:${account.merchantId}`);
    const pool = (await getPool())!;
    await expect(reserveAiBudget(request(account.merchantId))).rejects.toMatchObject({ code: 'policy_required' });
    const [sub] = await pool.execute<any>(`INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date,trial_ends_at)
      VALUES (?,'trial','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))`, [account.merchantId]);
    await pool.execute('UPDATE merchants SET current_subscription_id = ? WHERE id = ?', [sub.insertId, account.merchantId]);
    await reserveAiBudget(request(account.merchantId));
    await pool.execute("INSERT INTO ai_budget_policies (scope_key,version,daily_limit_micro_usd,enabled) VALUES (?,'v1',100,0)", [`merchant:${account.merchantId}`]);
    await expect(reserveAiBudget(request(account.merchantId))).rejects.toMatchObject({ code: 'policy_required' });
    await pool.execute('DELETE FROM ai_budget_policies WHERE scope_key = ?', [`merchant:${account.merchantId}`]);
    await pool.execute("UPDATE merchant_subscriptions SET status = 'cancelled' WHERE id = ?", [sub.insertId]);
    await expect(reserveAiBudget(request(account.merchantId))).rejects.toMatchObject({ code: 'policy_required' });
  });
  it('settles yesterday reservations against their original UTC day', async () => {
    const input = request(platform());
    const reservation = await reserveAiBudget(input);
    const pool = (await getPool())!;
    // Move both periods and the linked reservation as a fixture, without disabling foreign keys.
    await pool.execute(`INSERT INTO ai_budget_periods (scope_key,period_start,policy_version,limit_micro_usd,reserved_micro_usd)
      SELECT scope_key,DATE_SUB(period_start,INTERVAL 1 DAY),policy_version,limit_micro_usd,reserved_micro_usd FROM ai_budget_periods WHERE scope_key IN (?, 'global')`, [reservation.scopeKey]);
    await pool.execute('UPDATE ai_usage_reservations SET period_start = DATE_SUB(period_start, INTERVAL 1 DAY) WHERE reservation_key = ?', [reservation.reservationKey]);
    await pool.execute("UPDATE ai_budget_periods SET reserved_micro_usd = 0 WHERE scope_key IN (?, 'global') AND period_start = UTC_DATE()", [reservation.scopeKey]);
    await markAiBudgetUnknown(reservation);
    await settleAiBudget(reservation, { prompt_tokens: 1, completion_tokens: 0 });
    expect(await getAiBudgetStatus(input.merchantId)).toMatchObject({ used: 0, globalUsed: 0 });
    const [rows] = await pool.execute<any[]>("SELECT spent_micro_usd FROM ai_budget_periods WHERE scope_key='global' AND period_start=DATE_SUB(UTC_DATE(),INTERVAL 1 DAY)");
    expect(Number(rows[0].spent_micro_usd)).toBe(10);
  });
  it('rounds fractional micro-dollars up and rejects unsafe accounting inputs', () => {
    expect(pricedMicroUsd(1, 0, 1, 0)).toBe(1);
    expect(() => pricedMicroUsd(-1, 0, 1, 0)).toThrow('invalid_usage');
    expect(() => pricedMicroUsd(1.2, 0, 1, 0)).toThrow('invalid_usage');
    expect(() => pricedMicroUsd(null as any, 0, 1, 0)).toThrow('invalid_usage');
    expect(() => pricedMicroUsd(true as any, 0, 1, 0)).toThrow('invalid_usage');
  });
  it('records operator evidence and real billed cost exactly once for an unknown reservation', async () => {
    const input = request(platform());
    const reservation = await reserveAiBudget(input);
    await markAiBudgetUnknown(reservation);
    const evidence = { reservationKey: reservation.reservationKey, billedUsd: 0.000007,
      reference: 'provider-statement-fixture-1', confirmedProviderEvidence: true as const };
    await reconcileAiReservation(evidence, 77);
    await reconcileAiReservation(evidence, 77);
    expect(await getAiBudgetStatus(input.merchantId)).toMatchObject({ used: 7, globalUsed: 7 });
    const [rows] = await (await getPool())!.execute<any[]>('SELECT request_id, reconciled_by, reconciliation_reference, state FROM ai_usage_reservations WHERE reservation_key=?', [reservation.reservationKey]);
    expect(rows[0]).toMatchObject({ request_id: input.requestId, reconciled_by: 77, reconciliation_reference: evidence.reference, state: 'settled' });
    await expect(reconcileAiReservation({ ...evidence, billedUsd: 0.000008 }, 77)).rejects.toMatchObject({ code: 'reservation_conflict' });
  });
  it('initializes UTC on physical connections before SQL is executed', async () => {
    const [rows] = await (await getPool())!.execute<any[]>('SELECT @@session.time_zone AS zone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS drift');
    expect(rows[0]).toMatchObject({ zone: '+00:00', drift: 0 });
  });
});
