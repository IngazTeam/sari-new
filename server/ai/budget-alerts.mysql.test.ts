import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { reserveAiBudget, settleAiBudget, markAiBudgetUnknown, withAiBudget } from './budget-ledger';
import { captureCurrentAiBudgetAlerts, readAiBudgetAlerts, recordAiBudgetAlerts, assertAiBudgetAlertSchema } from './budget-alerts';
import { persistAiProviderUsage, runAiSettlementBatch } from './budget-settlement';

describe.skipIf(!process.env.DATABASE_URL)('global budget alerts on MySQL', () => {
  const query = async (sql: string, args: any[] = []): Promise<any[]> => (await (await getPool())!.execute<any[]>(sql, args))[0];
  let identity: string, other: string, model: string, actor: number, dates: string[], policies: any[], periods: any[], alerts: any[];
  const events = () => query('SELECT * FROM ai_budget_alerts WHERE period_start=? ORDER BY threshold_percent', [dates[0]]);
  const request = (amount: number, merchantId = identity) => ({ merchantId, provider: 'openai', model, taskType: 'fixture.alert', inputTokens: amount, maxOutputTokens: 0 });
  beforeEach(async () => {
    assertDisposableDatabase(); identity = 'alert-' + randomUUID(); other = 'alert-other-' + randomUUID(); model = 'alert-' + randomUUID();
    const [clock] = await query("SELECT DATE_FORMAT(UTC_DATE(),'%Y-%m-%d') AS today,DATE_FORMAT(DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),'%Y-%m-%d') AS yesterday,DATE_FORMAT(DATE_ADD(UTC_DATE(),INTERVAL 1 DAY),'%Y-%m-%d') AS tomorrow");
    dates = [clock.today, clock.yesterday, clock.tomorrow];
    policies = await query("SELECT * FROM ai_budget_policies WHERE scope_key='global'");
    periods = await query("SELECT * FROM ai_budget_periods WHERE scope_key='global' AND period_start IN (?,?,?)", dates);
    alerts = await query('SELECT * FROM ai_budget_alerts WHERE period_start IN (?,?,?)', dates);
    await query('DELETE FROM ai_budget_alerts WHERE period_start IN (?,?,?)', dates);
    await query("UPDATE ai_budget_policies SET daily_limit_micro_usd=100000000,enabled=1 WHERE scope_key='global'");
    await query("INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd) VALUES ('global',?,'fixture',100000000) ON DUPLICATE KEY UPDATE limit_micro_usd=100000000,spent_micro_usd=0,reserved_micro_usd=0", [dates[0]]);
    await query("INSERT INTO ai_price_cards(provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,max_input_tokens) VALUES ('openai',?,'v1',1000000,0,100000000)", [model]);
    actor = (await createDisposableMerchant('alert-admin')).userId;
    await query("UPDATE users SET role='admin' WHERE id=?", [actor]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const scope of [identity, other]) for (const table of ['ai_usage_reservations', 'ai_budget_periods']) await query(`DELETE FROM ${table} WHERE scope_key=?`, ['platform:' + scope]);
    await query('DELETE FROM ai_price_cards WHERE model=?', [model]); await cleanupDisposableMerchants([actor]);
    await query('DELETE FROM ai_budget_alerts WHERE period_start IN (?,?,?)', dates);
    await query("DELETE FROM ai_budget_periods WHERE scope_key='global' AND period_start IN (?,?,?)", dates);
    const restore = async (table: string, rows: any[]) => { for (const row of rows) {
      const columns = Object.keys(row); await query(`INSERT INTO ${table} (${columns.map(k => '`' + k + '`').join(',')}) VALUES (${columns.map(() => '?').join(',')})`, Object.values(row));
    } };
    await restore('ai_budget_periods', periods); await restore('ai_budget_alerts', alerts);
    await query("UPDATE ai_budget_policies SET version=?,daily_limit_micro_usd=?,enabled=?,updated_at=? WHERE scope_key='global'", [policies[0].version, policies[0].daily_limit_micro_usd, policies[0].enabled, policies[0].updated_at]);
  });
  afterAll(closeDb);
  it('records exactly at 70%, without rounding one micro-dollar up', async () => {
    await assertAiBudgetAlertSchema(); await reserveAiBudget(request(69999999)); expect(await events()).toHaveLength(0);
    await reserveAiBudget(request(1)); expect(await events()).toMatchObject([{ threshold_percent: 70, spent_micro_usd: 0, reserved_micro_usd: 70000000, limit_micro_usd: 100000000 }]);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 70, reservedUsd: 70, limitUsd: 100 });
  });
  it('aggregates different scopes and both providers against the one platform budget', async () => {
    await query("INSERT INTO ai_price_cards(provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,max_input_tokens) VALUES ('zahypi',?,'v1',1000000,0,100000000)", [model]);
    await reserveAiBudget(request(40000000)); await reserveAiBudget({ ...request(50000000, other), provider: 'zahypi' });
    expect((await events()).map(e => e.threshold_percent)).toEqual([70, 90]);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 90, reservedUsd: 90 });
  });
  it('crosses 90% at the exact micro-dollar and combines confirmed spend with reservations', async () => {
    const r = await reserveAiBudget(request(40000000)); await settleAiBudget(r, { prompt_tokens: 20000000, completion_tokens: 0 });
    await reserveAiBudget(request(69999999)); expect((await events()).map(e => e.threshold_percent)).toEqual([70]);
    await reserveAiBudget(request(1)); expect(await events()).toMatchObject([{ threshold_percent: 70 }, { threshold_percent: 90, spent_micro_usd: 20000000, reserved_micro_usd: 70000000 }]);
  });
  it('records both thresholds on a leap past 90 and retains the original snapshots after settlement', async () => {
    const r = await reserveAiBudget(request(95000000)), first = await events(); expect(first).toHaveLength(2);
    await settleAiBudget(r, { prompt_tokens: 1, completion_tokens: 0 }); await captureCurrentAiBudgetAlerts();
    expect(await events()).toEqual(first); expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 0, reservedUsd: 0, spentUsd: 0.000001 });
    await reserveAiBudget(request(95000000)); expect(await events()).toEqual(first);
  });
  it('captures a higher actual settlement without changing its billed amount', async () => {
    const r = await reserveAiBudget(request(1000000)); await settleAiBudget(r, { prompt_tokens: 95000000, completion_tokens: 0 });
    expect(await events()).toMatchObject([{ spent_micro_usd: 95000000, reserved_micro_usd: 0 }, { spent_micro_usd: 95000000, reserved_micro_usd: 0 }]);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 90, spentUsd: 95 });
  });
  it('admits concurrent reservations up to $100 with one event per threshold and blocks the next provider call', async () => {
    const result = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => reserveAiBudget(request(5000000, i % 2 ? identity : other))));
    expect(result.every(r => r.status === 'fulfilled')).toBe(true); expect(await events()).toHaveLength(2);
    const operation = vi.fn(); await expect(withAiBudget(request(1), operation, () => undefined)).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(operation).not.toHaveBeenCalled(); expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 100, reservedUsd: 100 });
  });
  it('retains unknown reservations across repeated scans without duplicate notices', async () => {
    const r = await reserveAiBudget(request(90000000)); await markAiBudgetUnknown(r); const before = await events();
    await Promise.all(Array.from({ length: 8 }, () => captureCurrentAiBudgetAlerts())); expect(await events()).toEqual(before);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ reservedUsd: 90, level: 90 });
  });
  it('recovers an already-high day at startup and honors a reduced effective limit', async () => {
    await query("UPDATE ai_budget_periods SET spent_micro_usd=36000000,limit_micro_usd=40000000 WHERE scope_key='global' AND period_start=?", [dates[0]]);
    expect(await events()).toHaveLength(0); await captureCurrentAiBudgetAlerts();
    expect(await events()).toMatchObject([{ limit_micro_usd: 40000000 }, { limit_micro_usd: 40000000 }]);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ limitUsd: 40, level: 90 });
  });
  it('uses a newly lowered global policy without raising the frozen period cap', async () => {
    await query("UPDATE ai_budget_periods SET spent_micro_usd=72000000 WHERE scope_key='global' AND period_start=?", [dates[0]]);
    await query("UPDATE ai_budget_policies SET daily_limit_micro_usd=80000000 WHERE scope_key='global'");
    await captureCurrentAiBudgetAlerts(); expect(await readAiBudgetAlerts(actor)).toMatchObject({ limitUsd: 80, level: 90 });
    expect(await events()).toMatchObject([{ limit_micro_usd: 80000000 }, { limit_micro_usd: 80000000 }]);
  });
  it('does not manufacture notifications when no global period exists or the limit is zero', async () => {
    await query("DELETE FROM ai_budget_periods WHERE scope_key='global' AND period_start=?", [dates[0]]);
    await captureCurrentAiBudgetAlerts(); expect(await events()).toHaveLength(0);
    await query("INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd) VALUES ('global',?,'zero',0)", [dates[0]]);
    await captureCurrentAiBudgetAlerts(); expect(await events()).toHaveLength(0); expect(await readAiBudgetAlerts(actor)).toMatchObject({ level: 100, limitUsd: 0 });
  });
  it('atomically rolls back both the reservation and alert after alert storage fails', async () => {
    const pool = (await getPool())!, c = await pool.getConnection(), execute = c.execute.bind(c);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(c);
    vi.spyOn(c, 'execute').mockImplementation((async (sql: string, args: any[]) => {
      const result = await execute(sql, args); if (sql.startsWith('INSERT INTO ai_budget_alerts')) throw Error('synthetic alert storage failure'); return result;
    }) as any);
    const operation = vi.fn(); await expect(withAiBudget(request(90000000), operation, () => undefined)).rejects.toMatchObject({ code: 'budget_unavailable' });
    vi.restoreAllMocks(); expect(operation).not.toHaveBeenCalled(); expect(await events()).toHaveLength(0);
    expect(await query('SELECT * FROM ai_usage_reservations WHERE scope_key=?', ['platform:' + identity])).toHaveLength(0);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ reservedUsd: 0, level: 0 });
  });
  it('replays a lost commit acknowledgement without another charge or alert', async () => {
    const pool = (await getPool())!, c = await pool.getConnection(), commit = c.commit.bind(c);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(c); vi.spyOn(c, 'commit').mockImplementationOnce(async () => { await commit(); throw Error('lost acknowledgement'); });
    const input = { ...request(90000000), requestId: randomUUID() }; await expect(reserveAiBudget(input)).rejects.toThrow('lost acknowledgement');
    vi.restoreAllMocks(); const before = await events(); expect((await reserveAiBudget(input)).created).toBe(false);
    expect(await events()).toEqual(before); expect(await readAiBudgetAlerts(actor)).toMatchObject({ reservedUsd: 90 });
  });
  it('recovers a settlement alert failure from stored usage without losing held cost', async () => {
    const r = await reserveAiBudget(request(1000000)), usage = { prompt_tokens: 95000000, completion_tokens: 0 };
    await persistAiProviderUsage({ ...r, provider: 'openai', model, taskType: 'fixture.alert' }, usage);
    const pool = (await getPool())!, c = await pool.getConnection(), execute = c.execute.bind(c);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(c);
    vi.spyOn(c, 'execute').mockImplementation((async (sql: string, args: any[]) => {
      const result = await execute(sql, args); if (sql.startsWith('INSERT INTO ai_budget_alerts')) throw Error('synthetic alert failure'); return result;
    }) as any);
    await expect(settleAiBudget(r, usage)).rejects.toThrow('synthetic alert failure'); vi.restoreAllMocks();
    expect(await events()).toHaveLength(0); expect(await readAiBudgetAlerts(actor)).toMatchObject({ reservedUsd: 1, spentUsd: 0 });
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE reservation_key=?', [r.reservationKey]);
    expect((await runAiSettlementBatch()).settled).toBe(1); expect(await events()).toHaveLength(2);
    expect(await readAiBudgetAlerts(actor)).toMatchObject({ reservedUsd: 0, spentUsd: 95 });
  });
  it('attributes a late settlement to its original UTC day without exhausting today', async () => {
    const r = await reserveAiBudget(request(1000000));
    for (const scope of ['global', r.scopeKey]) {
      await query("INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd,reserved_micro_usd) VALUES (?,?,'fixture',100000000,1000000) ON DUPLICATE KEY UPDATE reserved_micro_usd=1000000,spent_micro_usd=0", [scope, dates[1]]);
      await query('UPDATE ai_budget_periods SET reserved_micro_usd=0 WHERE scope_key=? AND period_start=?', [scope, dates[0]]);
    }
    await query('UPDATE ai_usage_reservations SET period_start=? WHERE reservation_key=?', [dates[1], r.reservationKey]);
    await settleAiBudget(r, { prompt_tokens: 95000000, completion_tokens: 0 });
    const result = await readAiBudgetAlerts(actor); expect(result).toMatchObject({ level: 0, spentUsd: 0, reservedUsd: 0 });
    expect(result.events).toHaveLength(2); expect(result.events.every(e => e.period === dates[1] && e.spentUsd === 95)).toBe(true);
  });
  it('keeps yesterday and tomorrow independent and reports only the bounded history', async () => {
    const pool = (await getPool())!, c = await pool.getConnection();
    try { await c.beginTransaction();
      for (const period of dates.slice(1)) {
        await c.execute("INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd,spent_micro_usd) VALUES ('global',?,'fixture',100000000,95000000) ON DUPLICATE KEY UPDATE spent_micro_usd=95000000", [period]);
        await recordAiBudgetAlerts(c, period);
      }
      await c.commit();
    } finally { c.release(); }
    await reserveAiBudget(request(70000000)); const result = await readAiBudgetAlerts(actor);
    expect(result.level).toBe(70); expect(result.events).toHaveLength(3);
    expect(result.events.filter(e => e.period === dates[1])).toHaveLength(2); expect(result.events.some(e => e.period === dates[2])).toBe(false);
  });
  it.each(['user', 'deletion_pending', 'missing'])('rejects %s persisted authority and reveals no financial records', async mode => {
    if (mode === 'missing') await cleanupDisposableMerchants([actor]);
    else await query(mode === 'user' ? "UPDATE users SET role='user' WHERE id=?" : "UPDATE users SET account_status='deletion_pending' WHERE id=?", [actor]);
    await expect(readAiBudgetAlerts(actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
