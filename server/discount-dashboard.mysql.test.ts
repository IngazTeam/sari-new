import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { discountsRouter } from './routers-discounts';
import { createDashboardDiscount, listDashboardDiscounts, readDiscountWorkspace } from './discount-dashboard-store';
describe.skipIf(!process.env.DATABASE_URL)('discount dashboard selected-tenant storage', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const caller = (merchantId = other.merchantId) => discountsRouter.createCaller({ user: { id: owner.userId, role: 'user' }, req: { headers: { 'x-merchant-id': String(merchantId) } }, res: {} } as any);
  const draft = { code: 'LOCAL10', type: 'percentage' as const, value: 10, minOrderAmount: 0 };
  beforeEach(async () => {
    owner = await createDisposableMerchant('discount-owner'); other = await createDisposableMerchant('discount-other');
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [other.merchantId, owner.userId]);
  });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
  it('creates and reads only the explicitly selected store for a manager with another owned store', async () => {
    const own = await caller(owner.merchantId).create(draft), selected = await caller().create(draft);
    expect(selected.discountCode).toMatchObject({ merchantId: other.merchantId, code: 'LOCAL10', value: 10, minOrderAmount: 0 });
    expect((await caller().list()).map(row => row.id)).toEqual([selected.discountCode.id]);
    await expect(caller().getById({ id: own.discountCode.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().update({ id: own.discountCode.id, expectedRevision: 'a'.repeat(64), isActive: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().delete({ id: own.discountCode.id, expectedRevision: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await caller(owner.merchantId).list())[0].isActive).toBe(1);
  });
  it('scopes updates/deletion and preserves the other tenant and zero minimum', async () => {
    const own = await caller(owner.merchantId).create(draft), selected = await caller().create(draft);
    await caller().update({ id: selected.discountCode.id, expectedRevision: (await caller().getById({id:selected.discountCode.id})).revision, isActive: false, maxUses: 3, expiresAt: '2030-02-28' });
    expect(await caller().getById({ id: selected.discountCode.id })).toMatchObject({ isActive: 0, maxUses: 3, expiresAt: '2030-02-28 00:00:00', minOrderAmount: 0 });
    expect(await caller().getStats()).toEqual({ total: 1, active: 0, used: 0 });
    await caller().delete({ id: selected.discountCode.id, expectedRevision: (await caller().getById({id:selected.discountCode.id})).revision }); expect(await caller().list()).toEqual([]); expect((await caller(owner.merchantId).list())[0].id).toBe(own.discountCode.id);
  });
  it('serializes duplicate creation and reports conflict without inserting twice', async () => {
    const result = await Promise.allSettled([caller().create(draft), caller().create({ ...draft, code: 'local10' })]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'CONFLICT' } });
    expect(await caller().list()).toHaveLength(1);
  });
  it.each(['viewer', 'sales_supervisor'])('allows %s reads but refuses direct store writes after a role downgrade', async role => {
    await caller().create(draft); await q('UPDATE merchant_members SET role=? WHERE merchant_id=? AND user_id=?', [role, other.merchantId, owner.userId]);
    expect(await listDashboardDiscounts(owner.userId, other.merchantId)).toHaveLength(1);
    await expect(createDashboardDiscount(owner.userId, other.merchantId, { ...draft, code: 'NOPE10' })).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('blocks explicitly revoked membership even for a legacy owner', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [owner.merchantId, owner.userId]);
    await expect(listDashboardDiscounts(owner.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('rechecks membership after waiting for the merchant lock instead of using admission-time authority', async () => {
    const pool = (await getPool())!, blocker = await pool.getConnection(), waiting = await pool.getConnection();
    const execute = waiting.execute.bind(waiting); let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    await blocker.beginTransaction(); await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [other.merchantId]);
    const acquired = vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(waiting);
    (waiting as any).execute = async (sql: any, args: any) => { if (String(sql).includes('FROM merchants')) entered(); return execute(sql, args); };
    const result = createDashboardDiscount(owner.userId, other.merchantId, draft).then(() => 'unexpected success', error => error.reason);
    try {
      await started;
      await blocker.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]);
      await blocker.commit(); expect(await result).toBe('forbidden');
      expect(await q('SELECT id FROM discount_codes WHERE merchantId=?', [other.merchantId])).toEqual([]);
    } finally { acquired.mockRestore(); (waiting as any).execute = execute; await blocker.rollback(); blocker.release(); await result; }
  });
  it('blocks suspended tenant and blocked account at the transaction boundary', async () => {
    await q("UPDATE merchants SET status='suspended' WHERE id=?", [other.merchantId]); await expect(createDashboardDiscount(owner.userId, other.merchantId, draft)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchants SET status='active' WHERE id=?", [other.merchantId]); await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]); await expect(listDashboardDiscounts(owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('refuses fractional amounts and impossible dates without a row', async () => {
    for (const patch of [{ value: 10.5 }, { expiresAt: '2026-02-30' }]) await expect(caller().create({ ...draft, ...patch })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await caller().list()).toEqual([]);
  });
  it('rejects stale activation and deletion after usage changes, and supports explicit clearing', async () => {
    const { discountCode } = await caller().create({ ...draft, maxUses: 3, expiresAt: '2030-02-28' });
    const before = await caller().getById({ id: discountCode.id });
    await q('UPDATE discount_codes SET usedCount=1 WHERE merchantId=? AND id=?', [other.merchantId, before.id]);
    await expect(caller().update({ id: before.id, expectedRevision: before.revision, isActive: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(caller().delete({ id: before.id, expectedRevision: before.revision })).rejects.toMatchObject({ code: 'CONFLICT' });
    const latest = await caller().getById({ id: before.id }); expect(latest.isActive).toBe(1);
    await caller().update({ id: latest.id, expectedRevision: latest.revision, maxUses: null, expiresAt: null });
    expect(await caller().getById({ id: before.id })).toMatchObject({ maxUses: null, expiresAt: null, usedCount: 1 });
  });
  it('refuses legacy unreviewed update and deletion inputs before modifying the code', async () => {
    const { discountCode } = await caller().create(draft);
    await expect(caller().update({ id: discountCode.id, isActive: false } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().delete({ id: discountCode.id } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await caller().list())[0].isActive).toBe(1);
  });
  it('reads complete paged workspace counts and legacy faults without disclosing the other merchant', async () => {
    for (let i = 1; i <= 31; i++) await q("INSERT INTO discount_codes (merchantId,code,type,value,isActive,usedCount) VALUES (?,?,'percentage',10,1,?)", [other.merchantId, 'SEARCH' + String(i).padStart(2, '0'), i]);
    await q("INSERT INTO discount_codes (merchantId,code,type,value,isActive,usedCount) VALUES (?,'FOREIGN','percentage',10,1,100)", [owner.merchantId]);
    await q("UPDATE discount_codes SET usedCount=-1 WHERE merchantId=? AND code='SEARCH01'", [other.merchantId]);
    const first = await caller().workspace({ page: 1 }), last = await caller().workspace({ page: 2 }), found = await caller().workspace({ query: 'search01' });
    expect(first).toMatchObject({ actorId: owner.userId, merchantId: other.merchantId, canManage: true, total: 31, matched: 31, pages: 2, counts: { available: 30, invalid: 1 }, usage: { recorded: 495, invalidRows: 1 } });
    expect(first.rows).toHaveLength(25); expect(last.rows).toHaveLength(6); expect(found.rows[0]).toMatchObject({ code: 'SEARCH01', state: 'invalid', usedCount: null });
    expect([...first.rows, ...last.rows].every(row => row.code !== 'FOREIGN')).toBe(true);
    await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]);
    expect((await caller().workspace({})).canManage).toBe(false);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]);
    await expect(readDiscountWorkspace(owner.userId, other.merchantId, { page: 1, query: '', status: 'all', origin: 'all' })).rejects.toMatchObject({ reason: 'forbidden' });
  });
});
