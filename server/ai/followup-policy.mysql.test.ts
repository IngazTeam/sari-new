import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), instance: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mock.send }) }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(),
  getPrimaryWhatsAppInstance: mock.instance, getWhatsAppInstanceById: mock.instance }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getFollowupPolicy, updateFollowupPolicy } from './followup-policy';
import { canDispatchSalesFollowup, settleSalesFollowupDispatch } from './followup-send-guard';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { defaultFollowupPolicy as defaults } from '../../shared/followup-policy';

describe.skipIf(!process.env.DATABASE_URL)('follow-up policy and durable transport quota', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, userIds: number[];
  const phone = '966500000085';
  const query = async (sql: string, params: any[] = []) => (await (await getPool())!.execute<any>(sql, params))[0];
  const update = async (patch: Partial<typeof defaults>, expectedRevision?: number) => updateFollowupPolicy({ merchantId: fixture.merchantId,
    actorUserId: fixture.userId, expectedRevision: expectedRevision ?? (await getFollowupPolicy(fixture.merchantId)).revision,
    policy: { ...defaults, ...patch } });
  const job = async (to = phone, merchantId = fixture.merchantId) => {
    const c = await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')", [merchantId, to]);
    const m = await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','ذكرني لاحقاً')", [c.insertId]);
    const f = await query(`INSERT INTO sales_followups (merchant_id,conversation_id,customer_phone,follow_up_type,scheduled_at,message_text,anchor_message_id,processing_token,claimed_at)
      VALUES (?,?,?,'customer_requested',TIMESTAMPADD(MINUTE,-1,UTC_TIMESTAMP()),'fixture',?,'claim_fixture',UTC_TIMESTAMP(3))`, [merchantId, c.insertId, to, m.insertId]);
    return { merchantId, to, kind: 'text' as const, text: 'fixture', idempotencyKey: `sales_followup:${merchantId}:${f.insertId}`,
      followUpGuard: { id: Number(f.insertId), token: 'claim_fixture' } };
  };
  const admit = async (input: Awaited<ReturnType<typeof job>>) => canDispatchSalesFollowup((await getPool())!, input);
  const ledger = () => query('SELECT * FROM sales_followup_dispatches WHERE merchant_id=? ORDER BY followup_id', [fixture.merchantId]);
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-23T09:00:00Z'));
    fixture = await createDisposableMerchant('followup-policy'); userIds = [fixture.userId];
    mock.send.mockReset().mockImplementation(async (_config, input) => ({ accepted: true, outcome: 'accepted', providerMessageId: `fixture-${input.followUpGuard.id}` }));
    const instance = await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)", [fixture.merchantId, `fixture-${fixture.merchantId}`]);
    mock.instance.mockReset().mockResolvedValue({ id: instance.insertId, merchantId: fixture.merchantId, status: 'active', provider: 'green_api', instanceId: 'fixture', token: 'fixture' });
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await cleanupDisposableMerchants(userIds); });
  afterAll(closeDb);

  it('inherits the merchant timezone until an explicit policy is saved and fails closed for invalid stored settings', async () => {
    await query("UPDATE merchants SET timezone='Asia/Dubai' WHERE id=?", [fixture.merchantId]);
    expect(await getFollowupPolicy(fixture.merchantId)).toEqual({ revision: 0, policy: { ...defaults, timeZone: 'Asia/Dubai' } });
    await update({ timeZone: 'Europe/London' });
    expect(await getFollowupPolicy(fixture.merchantId)).toMatchObject({ revision: 1, policy: { timeZone: 'Europe/London' } });
    await query('UPDATE sales_followup_policies SET weekly_limit=999 WHERE merchant_id=?', [fixture.merchantId]);
    await expect(getFollowupPolicy(fixture.merchantId)).rejects.toThrow();
    await expect(admit(await job())).rejects.toThrow();
    expect(await ledger()).toHaveLength(0);
  });
  it('uses revision compare-and-swap for competing first saves and existing updates', async () => {
    for (const revision of [0, 1]) {
      const results = await Promise.allSettled([update({ weeklyLimit: 1 }, revision), update({ weeklyLimit: 2 }, revision)]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
      expect((await getFollowupPolicy(fixture.merchantId)).revision).toBe(revision + 1);
    }
    const [saved] = await query('SELECT updated_by FROM sales_followup_policies WHERE merchant_id=?', [fixture.merchantId]);
    expect(saved.updated_by).toBe(fixture.userId);
  });
  it('atomically admits exactly three concurrent requests across conversations and equivalent phone formats', async () => {
    const inputs = await Promise.all([phone, `+${phone}`, `00${phone}`, '0500000085', '500000085', phone].map(to => job(to)));
    expect((await Promise.all(inputs.map(admit))).filter(Boolean)).toHaveLength(3);
    expect(await ledger()).toHaveLength(3);
    expect((await ledger()).every((d: any) => d.customer_phone === phone && d.state === 'reserved')).toBe(true);
  });
  it('reuses a crash reservation without double-counting and refuses released attempts', async () => {
    await update({ weeklyLimit: 1 }); const first = await job();
    expect(await admit(first)).toBe(true); expect(await admit(first)).toBe(true); expect(await ledger()).toHaveLength(1);
    expect(await admit(await job())).toBe(false);
    await settleSalesFollowupDispatch((await getPool())!, fixture.merchantId, first.followUpGuard.id, 'rejected');
    expect(await admit(first)).toBe(false); expect(await admit(await job())).toBe(true);
  });
  it.each(['reserved', 'unknown', 'accepted'])('retains %s capacity even after deleting the original follow-up', async state => {
    await update({ weeklyLimit: 1 }); const first = await job(); await admit(first);
    await query('UPDATE sales_followup_dispatches SET state=? WHERE followup_id=?', [state, first.followUpGuard.id]);
    await query('DELETE FROM sales_followups WHERE id=?', [first.followUpGuard.id]);
    expect(await admit(await job())).toBe(false);
    await query('UPDATE sales_followup_dispatches SET admitted_at=TIMESTAMPADD(DAY,-8,UTC_TIMESTAMP()) WHERE followup_id=?', [first.followUpGuard.id]);
    expect(await admit(await job())).toBe(true);
  });
  it('counts historical messages by sent time, including cancelled rows, without double-counting new ledger rows', async () => {
    await update({ weeklyLimit: 2 }); const first = await job('0500000085');
    await query('UPDATE sales_followups SET sent_at=UTC_TIMESTAMP(),cancelled_at=UTC_TIMESTAMP(),created_at=TIMESTAMPADD(DAY,-30,UTC_TIMESTAMP()) WHERE id=?', [first.followUpGuard.id]);
    const next = await job(); expect(await admit(next)).toBe(true);
    await settleSalesFollowupDispatch((await getPool())!, fixture.merchantId, next.followUpGuard.id, 'accepted');
    await query('UPDATE sales_followups SET sent_at=UTC_TIMESTAMP() WHERE id=?', [next.followUpGuard.id]);
    expect(await admit(await job())).toBe(false);
    await query('UPDATE sales_followups SET sent_at=TIMESTAMPADD(DAY,-8,UTC_TIMESTAMP()) WHERE id=?', [first.followUpGuard.id]);
    expect(await admit(await job())).toBe(true);
  });
  it('isolates equal phone numbers across tenants and customer numbers within a tenant', async () => {
    await update({ weeklyLimit: 1 }); await admit(await job());
    const other = await createDisposableMerchant('followup-other'); userIds.push(other.userId);
    expect(await admit(await job(phone, other.merchantId))).toBe(true);
    expect(await admit(await job('966500000084'))).toBe(true);
    const first = (await ledger())[0];
    await settleSalesFollowupDispatch((await getPool())!, other.merchantId, first.followup_id, 'rejected');
    expect(await admit(await job())).toBe(false);
  });
  it('sees a policy disabled during account loading before any external send or quota admission', async () => {
    const input = await job(), instance = await mock.instance();
    mock.instance.mockImplementationOnce(async () => { await update({ enabled: false }); return instance; });
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false, errorCode: 'followup_suppressed' });
    expect(mock.send).not.toHaveBeenCalled(); expect(await ledger()).toHaveLength(0);
  });
  it('takes the policy lock before admission and observes a concurrent committed edit', async () => {
    const input = await job(); const connection = await (await getPool())!.getConnection();
    await connection.beginTransaction();
    try {
      await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [fixture.merchantId]);
      const pending = admit(input);
      await connection.execute(`INSERT INTO sales_followup_policies (merchant_id,enabled,time_zone,updated_by) VALUES (?,0,'Asia/Riyadh',?)`, [fixture.merchantId, fixture.userId]);
      await connection.commit(); expect(await pending).toBe(false);
    } finally { await connection.rollback(); connection.release(); }
  });
  it('always releases a checkout connection even when transaction rollback fails', async () => {
    const input = await job(), pool = (await getPool())!;
    const connection = { query: vi.fn().mockResolvedValue([]), beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue([[]]), rollback: vi.fn().mockRejectedValue(new Error('fixture rollback loss')), release: vi.fn() };
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection as any);
    await expect(admit(input)).rejects.toThrow('fixture rollback loss');
    expect(connection.release).toHaveBeenCalledTimes(1); expect(mock.send).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'accepted', result: { accepted: true, outcome: 'accepted', providerMessageId: 'fixture-accepted' }, state: 'accepted', free: false },
    { name: 'rejected', result: { accepted: false, outcome: 'rejected', errorCode: 'http_400' }, state: 'released', free: true },
    { name: 'unknown', result: { accepted: false, outcome: 'unknown' }, state: 'unknown', free: false },
    { name: 'accepted without receipt', result: { accepted: true, outcome: 'accepted' }, state: 'unknown', free: false },
    { name: 'contradictory rejection', result: { accepted: false, outcome: 'rejected', errorCode: 'provider_unreachable' }, state: 'unknown', free: false },
  ])('settles $name conservatively after the real durable transport writes its outcome', async scenario => {
    await update({ weeklyLimit: 1 }); const input = await job(); mock.send.mockResolvedValueOnce(scenario.result);
    await sendMerchantWhatsApp(input);
    expect((await ledger())[0].state).toBe(scenario.state);
    await sendMerchantWhatsApp({ ...input, retryFailed: true }); expect(mock.send).toHaveBeenCalledTimes(1);
    expect(await admit(await job())).toBe(scenario.free);
  });
  it('retains capacity when the provider throws and never sends twice on replay', async () => {
    await update({ weeklyLimit: 1 }); const input = await job(); mock.send.mockRejectedValueOnce(new Error('fixture socket loss'));
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false, status: 'queued' });
    await sendMerchantWhatsApp({ ...input, retryFailed: true });
    expect(mock.send).toHaveBeenCalledTimes(1); expect((await ledger())[0].state).toBe('unknown');
    expect(await admit(await job())).toBe(false);
  });
  it('retains a reservation after provider success when persisting delivery fails', async () => {
    await update({ weeklyLimit: 1 }); const input = await job(); const pool = (await getPool())!, original = pool.execute.bind(pool);
    const spy = vi.spyOn(pool, 'execute').mockImplementation(((sql: string, values: any[]) => {
      if (sql.includes('SET provider_message_id = ?')) return Promise.reject(new Error('fixture persistence loss'));
      return original(sql, values);
    }) as any);
    await expect(sendMerchantWhatsApp(input)).rejects.toMatchObject({ code: 'delivery_outcome_unknown' }); spy.mockRestore();
    expect((await ledger())[0].state).toBe('reserved');
    await sendMerchantWhatsApp({ ...input, retryFailed: true }); expect(mock.send).toHaveBeenCalledTimes(1);
    expect(await admit(await job())).toBe(false);
  });
  it('keeps the reservation counted if settlement itself fails after a durable rejection', async () => {
    await update({ weeklyLimit: 1 }); const input = await job(); const pool = (await getPool())!, original = pool.execute.bind(pool);
    const spy = vi.spyOn(pool, 'execute').mockImplementation(((sql: string, values: any[]) => {
      if (sql.includes('UPDATE sales_followup_dispatches SET state=')) return Promise.reject(new Error('fixture settlement loss'));
      return original(sql, values);
    }) as any);
    mock.send.mockResolvedValueOnce({ accepted: false, outcome: 'rejected', errorCode: 'http_400' });
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false, status: 'failed' }); spy.mockRestore();
    expect((await ledger())[0].state).toBe('reserved'); expect(await admit(await job())).toBe(false);
  });
});
