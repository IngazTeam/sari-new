import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { byaanSalesReviewAuthority, listByaanSalesOperations } from './byaan-sales-review';
import { enrollTrainee, createPaymentLink } from './byaan';
import { byaanRouter } from '../routers-byaan';

const transport = vi.hoisted(() => ({ request: vi.fn(), pin: vi.fn() }));
vi.mock('axios', () => ({ default: transport.request }));
vi.mock('./byaan-security', async original => ({ ...await original<typeof import('./byaan-security')>(), createPinnedByaanHttpsAgent: transport.pin }));

describe.skipIf(!process.env.DATABASE_URL)('Byaan sales review SQL and API security', () => {
  let merchant: number, user: number, users: number[], other: { merchantId: number; userId: number };
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const rows = () => q('SELECT * FROM byaan_sales_operations WHERE merchant_id=? ORDER BY id', [merchant]);
  const list = () => listByaanSalesOperations(merchant, user, {});
  const caller = (actor = user, selected = merchant) => byaanRouter.createCaller({ user: { id: actor, role: 'user', accountStatus: 'active' }, req: { headers: { 'x-merchant-id': String(selected) } }, res: {} } as any);
  const enrollment = { traineePhone: '0501234567', traineeName: 'عميل خاص', courseId: 'course-1', courseTitle: 'Private course' };
  const enroll = () => enrollTrainee(merchant, enrollment, { requestId: randomUUID() });
  const member = async (role: string, active = 1, actor = other.userId) => q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES(?,?,?,?)', [merchant, actor, role, active]);
  beforeEach(async () => {
    assertDisposableDatabase(); vi.restoreAllMocks(); vi.clearAllMocks(); users = [];
    const own = await createDisposableMerchant('byaan-review'); merchant = own.merchantId; user = own.userId; users.push(user);
    other = await createDisposableMerchant('byaan-foreign'); users.push(other.userId);
    const domain = `synthetic-${randomUUID()}.example.com`;
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,?,?,?,1,UTC_TIMESTAMP(),'active')`, [merchant, domain, `https://${domain}/api/sari`, 'synthetic-review-signing-secret-only']);
    transport.pin.mockResolvedValue({});
    transport.request.mockResolvedValue({ status: 200, data: { enrollment_id: 'enroll-1', invoice_id: 'invoice-1', payment_url: 'https://checkout.example.com/private-link' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);

  it('exposes minimal historical receipts through the actual protected router without another POST', async () => {
    expect(await enroll()).toMatchObject({ success: true });
    expect(await createPaymentLink(merchant, { traineePhone: enrollment.traineePhone, courseId: enrollment.courseId, amount: 50 }, { requestId: randomUUID() })).toMatchObject({ success: true });
    const before = await rows(), conversions = await q('SELECT * FROM sari_conversions WHERE merchant_id=?', [merchant]);
    expect(await caller().salesReviewAccess()).toEqual({ merchantId: merchant });
    const page = await caller().listSalesOperations({});
    expect(page.items.map(i => [i.kind, i.reference, i.evidence])).toEqual([['payment', 'invoice-1', 'consistent'], ['enrollment', 'enroll-1', 'consistent']]);
    for (const i of page.items) expect(i).toMatchObject({ paymentEvidence: 'not_verified', providerStatus: 'not_checked' });
    const encoded = JSON.stringify(page);
    for (const hidden of ['private-link', 'traineePhone', 'عميل خاص', 'webhook_secret', 'request_hash', 'attempt_token', 'authority_hash', 'conversionId', 'result_json', 'paymentUrl']) expect(encoded).not.toContain(hidden);
    await caller().listSalesOperations({}); expect(await rows()).toEqual(before);
    expect(await q('SELECT * FROM sari_conversions WHERE merchant_id=?', [merchant])).toEqual(conversions);
    expect(transport.request).toHaveBeenCalledTimes(2);
  });
  it.each(['preparing', 'dispatching', 'unknown', 'not_sent'])('reviews %s without retrying or changing a worker', async state => {
    if (state === 'unknown') transport.request.mockRejectedValue(Error('private timeout'));
    if (state === 'not_sent') transport.pin.mockRejectedValue(Error('private DNS'));
    await enroll();
    if (['preparing', 'dispatching'].includes(state)) await q('UPDATE byaan_sales_operations SET state=?,result_json=NULL,result_hash=NULL WHERE merchant_id=?', [state, merchant]);
    const before = await rows(), calls = transport.request.mock.calls.length;
    const page = await list();
    expect(page.items[0]).toMatchObject({ state, evidence: ['preparing', 'dispatching'].includes(state) ? 'pending' : 'consistent', reference: null });
    expect(await rows()).toEqual(before); expect(transport.request).toHaveBeenCalledTimes(calls);
  });
  it.each(['deleted', 'disabled', 'rotated', 'broken-secret'])('preserves historical review after connection is %s', async mode => {
    await enroll();
    if (mode === 'deleted') await q('DELETE FROM byaan_connections WHERE merchant_id=?', [merchant]);
    if (mode === 'disabled') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [merchant]);
    if (mode === 'rotated') await q('UPDATE byaan_connections SET webhook_secret=? WHERE merchant_id=?', ['synthetic-new-secret-with-no-external-call', merchant]);
    if (mode === 'broken-secret') await q('UPDATE byaan_connections SET webhook_secret=? WHERE merchant_id=?', ['enc:unreadable', merchant]);
    expect((await list()).items[0]).toMatchObject({ reference: 'enroll-1', evidence: 'consistent', providerStatus: 'not_checked' });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['hash', 'reference', 'private', 'identity', 'state'])('withholds acknowledgement details after %s corruption', async mode => {
    await enroll();
    if (mode === 'hash') await q('UPDATE byaan_sales_operations SET result_hash=? WHERE merchant_id=?', ['0'.repeat(64), merchant]);
    if (mode === 'reference') await q("UPDATE byaan_sales_operations SET result_json=JSON_SET(result_json,'$.enrollmentId','forged') WHERE merchant_id=?", [merchant]);
    if (mode === 'private') await q("UPDATE byaan_sales_operations SET result_json=JSON_SET(result_json,'$.token','private') WHERE merchant_id=?", [merchant]);
    if (mode === 'identity') await q('UPDATE byaan_sales_operations SET request_id=? WHERE merchant_id=?', [randomUUID(), merchant]);
    if (mode === 'state') await q("UPDATE byaan_sales_operations SET state='unknown' WHERE merchant_id=?", [merchant]);
    expect((await list()).items[0]).toMatchObject({ evidence: 'invalid', reference: null });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('does not expose another tenant receipt copied into the current operation', async () => {
    await enroll(); const original = (await rows())[0];
    await q(`INSERT INTO byaan_sales_operations(merchant_id,request_id,request_hash,operation_kind,authority_hash,attempt_token,state,result_json,result_hash)
      VALUES (?,?,?,?,?,?,?,?,?)`, [other.merchantId, randomUUID(), original.request_hash, original.operation_kind, original.authority_hash, randomUUID(), original.state, JSON.stringify(typeof original.result_json === 'string' ? JSON.parse(original.result_json) : original.result_json), original.result_hash]);
    const foreign = await listByaanSalesOperations(other.merchantId, other.userId, {});
    expect(foreign.items).toHaveLength(1); expect(foreign.items[0]).toMatchObject({ reference: null, evidence: 'invalid' });
    expect((await list()).items).toHaveLength(1);
  });
  it('uses bounded descending pages and tenant-scoped cursors', async () => {
    for (let n = 0; n < 23; n++) await enroll();
    const before = await rows(), first = await list();
    expect(first.items).toHaveLength(20); expect(first.nextCursor).toBe(first.items[19].id);
    const second = await listByaanSalesOperations(merchant, user, { beforeId: first.nextCursor! });
    expect(second.items).toHaveLength(3); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(i => i.id)).size).toBe(23);
    expect((await listByaanSalesOperations(other.merchantId, other.userId, { beforeId: first.nextCursor! })).items).toEqual([]);
    expect(await rows()).toEqual(before); expect(transport.request).toHaveBeenCalledTimes(23);
  });
  it.each(['foreign-user', 'merchant-suspended', 'actor-deletion-pending', 'owner-membership-disabled', 'owner-role-revoked', 'ownership-changed'])('denies stale access: %s', async mode => {
    await enroll();
    if (mode === 'merchant-suspended') await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]);
    if (mode === 'actor-deletion-pending') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [user]);
    if (mode === 'owner-membership-disabled') await member('owner', 0, user);
    if (mode === 'owner-role-revoked') await member('viewer', 1, user);
    if (mode === 'ownership-changed') await q('UPDATE merchants SET userId=? WHERE id=?', [other.userId, merchant]);
    const actor = mode === 'foreign-user' ? other.userId : user;
    await expect(byaanSalesReviewAuthority(merchant, actor)).rejects.toThrow('Byaan sales review unavailable');
    await expect(listByaanSalesOperations(merchant, actor, {})).rejects.toThrow('Byaan sales review unavailable');
    await expect(caller(actor).listSalesOperations({})).rejects.toBeDefined();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['manager', 'sales_supervisor', 'viewer', 'disabled', 'owner-deletion-pending', 'actor-deletion-pending'])('checks persisted team authority for %s', async mode => {
    await enroll(); await member(['manager', 'sales_supervisor', 'viewer'].includes(mode) ? mode : 'manager', mode === 'disabled' ? 0 : 1);
    if (mode === 'owner-deletion-pending' || mode === 'actor-deletion-pending') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [mode === 'owner-deletion-pending' ? user : other.userId]);
    if (['manager', 'sales_supervisor'].includes(mode)) expect((await caller(other.userId).listSalesOperations({})).items).toHaveLength(1);
    else {
      await expect(caller(other.userId).listSalesOperations({})).rejects.toBeDefined();
      await expect(listByaanSalesOperations(merchant, other.userId, {})).rejects.toThrow('Byaan sales review unavailable');
    }
  });
  it('rejects anonymous, tenant injection and cursor injection at the router boundary', async () => {
    const anonymous = byaanRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as any);
    await expect(anonymous.listSalesOperations({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    for (const value of [{ merchantId: other.merchantId }, { beforeId: '1 OR 1=1' }, { beforeId: 0 }, { limit: 10000 }]) {
      await expect(caller().listSalesOperations(value as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(transport.request).not.toHaveBeenCalled();
  });
});
