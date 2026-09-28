import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { enrollTrainee, createPaymentLink } from './byaan';
import { runByaanSalesOperation } from './byaan-sales-operations';
import { byaanSalesFailure } from './byaan-sales-contract';

const transport = vi.hoisted(() => ({ request: vi.fn(), pin: vi.fn() }));
vi.mock('axios', () => ({ default: transport.request }));
vi.mock('./byaan-security', async original => ({ ...await original<typeof import('./byaan-security')>(), createPinnedByaanHttpsAgent: transport.pin }));

describe.skipIf(!process.env.DATABASE_URL)('Byaan durable sales operations on MySQL', () => {
  let merchant: number, user: number, users: number[], request: { requestId: string };
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const enrollment = { traineePhone: '0501234567', traineeName: 'عميل تجريبي', courseId: 'c-1', courseTitle: 'دورة اختبار' };
  const payment = { traineePhone: enrollment.traineePhone, courseId: 'c-1', amount: 125.5, description: enrollment.courseTitle };
  const link = 'https://checkout.example.com/receipt';
  const enroll = () => enrollTrainee(merchant, enrollment, request);
  const pay = () => createPaymentLink(merchant, payment, request);
  const operations = () => q('SELECT * FROM byaan_sales_operations WHERE merchant_id=?', [merchant]);
  const conversions = () => q('SELECT * FROM sari_conversions WHERE merchant_id=?', [merchant]);
  const connect = async (owner: number) => {
    const domain = `synthetic-${randomUUID()}.example.com`;
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,?,?,?,1,UTC_TIMESTAMP(),'active')`, [owner, domain, `https://${domain}/api/sari`, 'synthetic-operation-signing-secret-only']);
  };
  beforeEach(async () => {
    assertDisposableDatabase(); vi.restoreAllMocks(); vi.clearAllMocks(); users = [];
    const fixture = await createDisposableMerchant('byaan-operation'); merchant = fixture.merchantId; user = fixture.userId; users.push(user);
    request = { requestId: randomUUID() }; await connect(merchant);
    transport.pin.mockResolvedValue({});
    transport.request.mockResolvedValue({ status: 200, data: { enrollment_id: 'enroll-1', invoice_id: 'invoice-1', payment_url: link } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);
  it.each(['enrollment', 'payment'])('replays %s with one POST, one conversion and one stable receipt', async kind => {
    const run = kind === 'enrollment' ? enroll : pay;
    const first = await run(), second = await run();
    expect(first).toMatchObject({ success: true, replayed: false, tracking: 'recorded' });
    expect(second).toEqual({ ...first, replayed: true });
    expect(transport.request).toHaveBeenCalledTimes(1); expect(await operations()).toHaveLength(1); expect(await conversions()).toHaveLength(1);
    const serialized = JSON.stringify((await operations())[0]);
    expect(serialized).not.toContain(enrollment.traineeName); expect(serialized).not.toContain('synthetic-operation-signing-secret-only');
  });
  it('serializes concurrent callers without holding a database lock during HTTP', async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
    transport.request.mockImplementation(async () => { entered(); await gate; return { status: 200, data: { enrollment_id: 'enroll-1' } }; });
    const first = enroll(); await waiting;
    try {
      const duplicates = await Promise.all(Array.from({ length: 3 }, () => enroll()));
      expect(duplicates.every(v => !v.success && v.outcome === 'unknown')).toBe(true);
      expect(transport.request).toHaveBeenCalledTimes(1);
      await q('UPDATE merchants SET businessName=businessName WHERE id=?', [merchant]);
    } finally { release(); }
    expect(await first).toMatchObject({ success: true }); expect(await enroll()).toMatchObject({ success: true, replayed: true });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['phone', 'course', 'name', 'title', 'kind', 'amount'])('rejects a changed %s under the same request identity', async field => {
    if (field === 'amount') await pay(); else await enroll();
    const before = await operations();
    const changed = field === 'amount' ? await createPaymentLink(merchant, { ...payment, amount: 126 }, request)
      : field === 'kind' ? await pay() : await enrollTrainee(merchant, { ...enrollment,
        ...(field === 'phone' ? { traineePhone: '0509999999' } : field === 'course' ? { courseId: 'c-2' } : field === 'name' ? { traineeName: 'آخر' } : { courseTitle: 'آخر' }) }, request);
    expect(changed).toMatchObject({ success: false, outcome: 'unknown' });
    expect(await operations()).toEqual(before); expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('normalizes equivalent phone formats and UUID case while preserving request binding', async () => {
    const first = await enroll();
    expect(await enrollTrainee(merchant, { ...enrollment, traineePhone: '+966501234567' }, { requestId: request.requestId.toUpperCase() })).toEqual({ ...first, replayed: true });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, {}, { requestId: 'not-a-uuid' }, { requestId: randomUUID(), actorId: 1 }])('requires a valid operation identity before dispatch: %j', async identity => {
    expect(await enrollTrainee(merchant, enrollment, identity as any)).toMatchObject({ success: false, outcome: 'not_sent' });
    expect(await operations()).toEqual([]); expect(transport.request).not.toHaveBeenCalled();
  });
  it('leaves a timed-out request unknown through subsequent independent invocations', async () => {
    transport.request.mockRejectedValue(Error('lost response'));
    expect(await pay()).toMatchObject({ success: false, outcome: 'unknown' });
    transport.request.mockResolvedValue({ status: 200, data: { invoice_id: 'new', payment_url: link } });
    expect(await pay()).toMatchObject({ success: false, outcome: 'unknown', replayed: true });
    expect((await operations())[0].state).toBe('unknown'); expect(await conversions()).toEqual([]); expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('does not reactivate a pre-dispatch failure when DNS becomes available', async () => {
    transport.pin.mockRejectedValueOnce(Error('DNS unavailable'));
    expect(await enroll()).toMatchObject({ success: false, outcome: 'not_sent' });
    expect(await enroll()).toMatchObject({ success: false, outcome: 'not_sent', replayed: true });
    expect(transport.request).not.toHaveBeenCalled(); expect(transport.pin).toHaveBeenCalledTimes(1);
  });
  it('resumes neither a crashed preparation nor a dispatch left without a receipt', async () => {
    const first = await enroll();
    for (const state of ['preparing', 'dispatching']) {
      await q('UPDATE byaan_sales_operations SET state=?,result_json=NULL,result_hash=NULL WHERE id=?', [state, first.operationId]);
      expect(await enroll()).toMatchObject({ success: false, outcome: 'unknown', replayed: true });
    }
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['key', 'connection', 'domain', 'owner', 'merchant'])('does not expose an old result under changed %s authority', async field => {
    await enroll();
    if (field === 'key') await q("UPDATE byaan_connections SET webhook_secret='replacement-synthetic-signing-secret-only' WHERE merchant_id=?", [merchant]);
    if (field === 'connection') { await q('DELETE FROM byaan_connections WHERE merchant_id=?', [merchant]); await connect(merchant); }
    if (field === 'domain') await q("UPDATE byaan_connections SET tenant_domain='changed.example.com',api_base_url='https://changed.example.com/api/sari' WHERE merchant_id=?", [merchant]);
    if (field === 'owner') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [user]);
    if (field === 'merchant') await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]);
    const result = await enroll(); expect(result.success).toBe(false); expect(result).not.toHaveProperty('paymentUrl');
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['result', 'hash', 'request', 'token', 'history', 'conversion'])('rejects corrupted %s without re-dispatching', async field => {
    const first = await enroll();
    if (field === 'result') await q("UPDATE byaan_sales_operations SET result_json=JSON_SET(result_json,'$.enrollmentId','forged') WHERE merchant_id=?", [merchant]);
    if (field === 'hash') await q("UPDATE byaan_sales_operations SET result_hash=REPEAT('0',64) WHERE merchant_id=?", [merchant]);
    if (field === 'request') await q("UPDATE byaan_sales_operations SET request_hash=REPEAT('0',64) WHERE merchant_id=?", [merchant]);
    if (field === 'token') await q('UPDATE byaan_sales_operations SET attempt_token=? WHERE merchant_id=?', [randomUUID(), merchant]);
    if (field === 'history') await q('DELETE FROM api_conversion_observations WHERE merchant_id=?', [merchant]);
    if (field === 'conversion') await q('DELETE FROM sari_conversions WHERE merchant_id=?', [merchant]);
    expect(await enroll()).toMatchObject({ success: false, outcome: 'unknown' });
    expect(transport.request).toHaveBeenCalledTimes(1); expect(await operations()).toHaveLength(1);
  });
  it('preserves acknowledgement and tracking failure after suspension without re-sending on reactivation', async () => {
    transport.request.mockImplementation(async () => { await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]); return { status: 200, data: { invoice_id: 'i', payment_url: link } }; });
    const first = await pay(); expect(first).toMatchObject({ success: true, tracking: 'unavailable' });
    await q("UPDATE merchants SET status='active' WHERE id=?", [merchant]);
    expect(await pay()).toEqual({ ...first, replayed: true }); expect(await conversions()).toEqual([]); expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('isolates equal operation IDs and provider references between merchants', async () => {
    const first = await enroll(), other = await createDisposableMerchant('byaan-other'); users.push(other.userId); await connect(other.merchantId);
    const second = await enrollTrainee(other.merchantId, enrollment, request);
    expect(second).toMatchObject({ success: true, replayed: false }); expect(second.operationId).not.toBe(first.operationId);
    expect(transport.request).toHaveBeenCalledTimes(2);
  });
  it.each(['reserve-rollback', 'reserve-commit', 'dispatch-commit', 'finish-rollback', 'finish-commit'])('survives %s without an extra provider POST', async phase => {
    const pool = (await getPool())!, get = pool.getConnection.bind(pool); let hit = false, destroyed = 0;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await get(), execute = c.execute.bind(c), commit = c.commit.bind(c), destroy = c.destroy.bind(c); let stage = '';
      vi.spyOn(c, 'destroy').mockImplementation(() => { destroyed++; destroy(); });
      vi.spyOn(c, 'execute').mockImplementation((async (sql: string, args: any[]) => {
        if (sql.includes('INSERT INTO byaan_sales_operations')) stage = 'reserve';
        if (sql.includes("SET state='dispatching'")) stage = 'dispatch';
        if (sql.includes('SET state=?,result_json=?')) stage = 'finish';
        const result = await execute(sql, args);
        if (phase === stage + '-rollback' && !hit) { hit = true; throw Error('lost write'); }
        return result;
      }) as any);
      vi.spyOn(c, 'commit').mockImplementation(async () => { await commit(); if (phase === stage + '-commit' && !hit) { hit = true; throw Error('lost commit acknowledgement'); } });
      return c;
    });
    const first = await enroll(); expect(first.success).toBe(false); expect(hit).toBe(true);
    vi.restoreAllMocks();
    const retried = await enroll();
    if (phase === 'reserve-rollback') expect(retried).toMatchObject({ success: true });
    else if (phase === 'finish-commit') expect(retried).toMatchObject({ success: true, replayed: true });
    else expect(retried).toMatchObject({ success: false, outcome: 'unknown' });
    expect(transport.request).toHaveBeenCalledTimes(phase === 'reserve-commit' || phase === 'dispatch-commit' ? 0 : 1);
    if (phase.endsWith('-commit')) expect(destroyed).toBeGreaterThan(0);
  });
  it('allows only one dispatch marker even when the same worker calls it again', async () => {
    const [snapshot] = await q('SELECT * FROM byaan_connections WHERE merchant_id=?', [merchant]); let count = 0;
    const result = await runByaanSalesOperation(merchant, 'enrollment', request, enrollment, async beforeDispatch => {
      await beforeDispatch(snapshot); count++;
      await expect(beforeDispatch(snapshot)).rejects.toThrow();
      return byaanSalesFailure('unknown');
    });
    expect(result).toMatchObject({ success: false, outcome: 'unknown' }); expect(count).toBe(1);
    expect(await enroll()).toMatchObject({ success: false, outcome: 'unknown', replayed: true }); expect(transport.request).not.toHaveBeenCalled();
  });
});
