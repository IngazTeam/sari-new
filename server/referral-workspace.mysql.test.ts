import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { referralsRouter } from './routers-referrals';
import { readReferralWorkspace } from './referral-workspace-store';
describe.skipIf(!process.env.DATABASE_URL)('complete referral workspace MySQL snapshot', () => {
 let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, referralIds: number[];
 const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
 const caller = (merchantId = other.merchantId) => referralsRouter.createCaller({ user: { id: owner.userId, role: 'user' }, req: { headers: { 'x-merchant-id': String(merchantId) } }, res: {} } as any);
 const selection = { tab: 'referrals' as const, query: '', state: 'all' as const, page: 1 };
 const code = async (merchantId: number, name: string) => Number((await q('INSERT INTO referral_codes (merchantId,code,referrerName,referrerPhone) VALUES (?,?,?,?)', [merchantId, 'LOCAL-' + merchantId + '-' + name, name, '+966500000000'])).insertId);
 const referral = async (codeId: number, name: string, completed = 0) => { const id = Number((await q('INSERT INTO referrals (referralCodeId,referredName,referredPhone,orderCompleted) VALUES (?,?,?,?)', [codeId, name, '+966500000000', completed])).insertId); referralIds.push(id); return id; };
 beforeEach(async () => { referralIds = []; owner = await createDisposableMerchant('referral-source-owner'); other = await createDisposableMerchant('referral-source-other'); await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [other.merchantId, owner.userId]); });
 afterEach(async () => { if (referralIds.length) await q(`DELETE FROM referrals WHERE id IN (${referralIds.map(() => '?').join(',')})`, referralIds); await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
 it('reads every code and referral in the selected tenant without an implicit creation', async () => {
  expect((await caller().workspace({})).totals).toEqual({ codes: 0, referrals: 0, rewards: 0 }); expect(await q('SELECT id FROM referral_codes WHERE merchantId=?', [other.merchantId])).toEqual([]);
  const a = await code(other.merchantId, 'A'), b = await code(other.merchantId, 'B'), foreign = await code(owner.merchantId, 'FOREIGN'); await referral(foreign, 'SECRET');
  for (let i = 1; i <= 31; i++) await referral(i % 2 ? a : b, 'Friend ' + i, i % 2);
  await q('UPDATE referral_codes SET referralCount=900 WHERE merchantId=?', [other.merchantId]);
  const first = await caller().workspace({}), second = await caller().workspace({ page: 2 }), found = await caller().workspace({ query: 'Friend 1', state: 'completed' });
  expect(first).toMatchObject({ merchantId: other.merchantId, actorId: owner.userId, canManage: false, totals: { codes: 2, referrals: 31, rewards: 0 }, counts: { completed: 16, pending: 15 }, matched: 31, pages: 2 }); expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(6); expect(found.rows.every(row => row.state === 'completed')).toBe(true); expect(JSON.stringify(first)).not.toContain('SECRET');
 });
 it('separates expired, claimed and foreign-link reward evidence', async () => {
  const ownReferral = await referral(await code(other.merchantId, 'A'), 'Own'), foreignReferral = await referral(await code(owner.merchantId, 'FOREIGN'), 'SECRET');
  for (const [id, state, expiry, claimed] of [[ownReferral, 'pending', '2020-01-01 00:00:00', null], [ownReferral, 'claimed', '2030-01-01 00:00:00', '2026-01-01 00:00:00'], [foreignReferral, 'pending', '2030-01-01 00:00:00', null]]) await q('INSERT INTO rewards (merchantId,referralId,rewardType,status,expiresAt,claimedAt) VALUES (?,?,\'discount_10\',?,?,?)', [other.merchantId, id, state, expiry, claimed]);
  const value = await caller().workspace({ tab: 'rewards' }); expect(value).toMatchObject({ totals: { rewards: 3 }, counts: { expired: 1, claimed: 1, invalid: 1 }, rewardFulfillment: 'not_verified' }); expect(JSON.stringify(value)).not.toContain('SECRET'); expect(value.rows.find(row => row.state === 'invalid')).toMatchObject({ referralAvailable: false, issues: ['referral'] });
 });
 it('enforces current role, membership, tenant and account at the storage boundary', async () => {
  await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]); expect((await readReferralWorkspace(owner.userId, other.merchantId, selection)).canManage).toBe(false);
  await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]); await expect(readReferralWorkspace(owner.userId, other.merchantId, selection)).rejects.toMatchObject({ reason: 'forbidden' });
  await q("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]); await expect(readReferralWorkspace(owner.userId, owner.merchantId, selection)).rejects.toMatchObject({ reason: 'forbidden' });
  await q("UPDATE merchants SET status='active' WHERE id=?", [owner.merchantId]); await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]); await expect(readReferralWorkspace(owner.userId, owner.merchantId, selection)).rejects.toMatchObject({ reason: 'forbidden' });
 });
 it('rechecks membership after waiting for the tenant lock', async () => {
  const pool = (await getPool())!, blocker = await pool.getConnection(), waiting = await pool.getConnection(), execute = waiting.execute.bind(waiting); let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  await blocker.beginTransaction(); await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [other.merchantId]); const acquired = vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(waiting);
  (waiting as any).execute = async (sql: any, args: any) => { if (String(sql).includes('FROM merchants')) entered(); return execute(sql, args); };
  const result = readReferralWorkspace(owner.userId, other.merchantId, selection).then(() => 'unexpected success', e => e.reason);
  try { await started; await blocker.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]); await blocker.commit(); expect(await result).toBe('forbidden'); } finally { acquired.mockRestore(); (waiting as any).execute = execute; await blocker.rollback(); blocker.release(); await result; }
 });
});
