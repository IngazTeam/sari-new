import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { createMerchantInvitation, getMerchantInvitation, reviewMerchantInvitation, applyMerchantInvitation, recordMerchantRewardClaim, readReferralLegacyStats } from './referral-program-store';
import { readReferralWorkspace } from './referral-workspace-store';
import { referralWorkspaceInput } from '../shared/referral-workspace';
describe.skipIf(!process.env.DATABASE_URL)('reviewed merchant referral program MySQL', () => {
 let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a;
 const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
 const create = (x = a) => createMerchantInvitation(x.userId, x.merchantId, { confirm: true });
 const workspace = (x = a, tab: 'rewards' | 'codes' = 'rewards') => readReferralWorkspace(x.userId, x.merchantId, referralWorkspaceInput.parse({ tab }));
 const apply = async () => { const invite = await create(), review = await reviewMerchantInvitation(b.userId, b.merchantId, { code: invite.code.code }); return applyMerchantInvitation(b.userId, b.merchantId, { code: review.code, expectedRevision: review.expectedRevision, acknowledgePendingReward: true }); };
 beforeEach(async () => { a = await createDisposableMerchant('referral-program-a'); b = await createDisposableMerchant('referral-program-b'); });
 afterEach(async () => { await q('DELETE r FROM referrals r JOIN referral_codes c ON c.id=r.referralCodeId WHERE c.merchantId IN (?,?)', [a.merchantId, b.merchantId]); await cleanupDisposableMerchants([a.userId, b.userId]); }); afterAll(closeDb);
 it('never creates on read and creates one explicit code under concurrent requests while preserving other merchant fields', async () => {
  await q('UPDATE merchants SET description=? WHERE id=?', ['Keep my description', a.merchantId]); expect(await getMerchantInvitation(a.userId, a.merchantId)).toBeNull();
  const results = await Promise.all([create(), create()]); expect(results.filter(r => r.created)).toHaveLength(1); expect(results[0].code.id).toBe(results[1].code.id); expect(await q('SELECT id FROM referral_codes WHERE merchantId=?', [a.merchantId])).toHaveLength(1);
  expect((await q('SELECT description FROM merchants WHERE id=?',[a.merchantId]))[0].description).toBe('Keep my description'); expect((await workspace(a, 'codes')).invitation).toMatchObject({ state: 'ready', codeId: results[0].code.id });
 });
 it('does not silently adopt an existing customer code or replace a broken program reference', async () => {
  await q('INSERT INTO referral_codes (merchantId,code,referrerName,referrerPhone) VALUES (?,? ,\'Customer\',\'+966500000000\')', [a.merchantId, 'CUSTOMER-' + a.merchantId]); const invitation = await create(); expect(invitation.code.code).toMatch(/^SARY-/); expect((await workspace(a, 'codes')).totals.codes).toBe(2);
  await q('INSERT INTO merchant_referral_programs (merchant_id,code_id) VALUES (?,2147483646)',[b.merchantId]); await expect(create(b)).rejects.toMatchObject({ reason: 'invalid' }); expect(await q('SELECT id FROM referral_codes WHERE merchantId=?', [b.merchantId])).toEqual([]);
 });
 it('atomically applies only once for a merchant, with one referral, pending reward and increment', async () => {
  const invite = await create(), review = await reviewMerchantInvitation(b.userId, b.merchantId, { code: invite.code.code }), input = { code: review.code, expectedRevision: review.expectedRevision, acknowledgePendingReward: true };
  const results = await Promise.all([applyMerchantInvitation(b.userId, b.merchantId, input), applyMerchantInvitation(b.userId, b.merchantId, input)]); expect(results.filter(r => !r.replayed)).toHaveLength(1); expect(results[0].referralId).toBe(results[1].referralId); expect(results.every(r => r.benefitGranted === false)).toBe(true);
  expect((await q('SELECT referralCount FROM referral_codes WHERE id=?', [invite.code.id]))[0].referralCount).toBe(1); expect((await workspace()).totals).toMatchObject({ referrals: 1, rewards: 1 }); expect((await workspace(b)).invitation.applied).toBe(true);
 });
 it('rejects self invitation, customer codes and stale reviewed identity without a referral', async () => {
  const invite = await create(); await expect(reviewMerchantInvitation(a.userId, a.merchantId, { code: invite.code.code })).rejects.toMatchObject({ reason: 'invalid' });
  const review = await reviewMerchantInvitation(b.userId, b.merchantId, { code: invite.code.code }); await q('UPDATE merchants SET businessName=? WHERE id=?', ['Changed after review', a.merchantId]); await expect(applyMerchantInvitation(b.userId, b.merchantId, { code: review.code, expectedRevision: review.expectedRevision, acknowledgePendingReward: true })).rejects.toMatchObject({ reason: 'stale' }); expect((await workspace()).totals.referrals).toBe(0);
  await q('INSERT INTO referral_codes (merchantId,code,referrerName,referrerPhone) VALUES (?,? ,\'Customer\',\'+966500000000\')', [a.merchantId, 'CUSTOMER-' + a.merchantId]); await expect(reviewMerchantInvitation(b.userId, b.merchantId, { code: 'CUSTOMER-' + a.merchantId })).rejects.toMatchObject({ reason: 'invalid' });
 });
 it('rolls back referral and reward together when the stored counter is invalid', async () => {
  const invite = await create(), review = await reviewMerchantInvitation(b.userId, b.merchantId, { code: invite.code.code }); await q('UPDATE referral_codes SET referralCount=-1 WHERE id=?', [invite.code.id]); await expect(applyMerchantInvitation(b.userId, b.merchantId, { code: review.code, expectedRevision: review.expectedRevision, acknowledgePendingReward: true })).rejects.toMatchObject({ reason: 'invalid' });
  expect((await workspace()).totals).toMatchObject({ referrals: 0, rewards: 0 }); expect((await workspace(b)).invitation.applied).toBe(false);
 });
 it('records only the explicitly reviewed reward, without promising a granted benefit', async () => {
  const receipt = await apply(), row = (await workspace()).rows[0]; await expect(recordMerchantRewardClaim(b.userId, b.merchantId, { rewardId: receipt.rewardId, expectedRevision: row.revision, recordOnly: true })).rejects.toMatchObject({ reason: 'missing' });
  expect(await recordMerchantRewardClaim(a.userId, a.merchantId, { rewardId: row.id, expectedRevision: row.revision, recordOnly: true })).toEqual({ success: true, rewardId: row.id, effect: 'record_only', benefitGranted: false }); expect((await workspace()).rows[0].state).toBe('claimed');
  await expect(recordMerchantRewardClaim(a.userId, a.merchantId, { rewardId: row.id, expectedRevision: row.revision, recordOnly: true })).rejects.toMatchObject({ reason: 'stale' }); expect((await readReferralLegacyStats(a.userId, a.merchantId)).claimedRewards).toBe(1);
 });
 it('rejects expired and changed rewards and all direct manager writes', async () => {
  await apply(); const row = (await workspace()).rows[0]; await q("UPDATE rewards SET expiresAt='2020-01-01 00:00:00' WHERE merchantId=? AND id=?", [a.merchantId, row.id]); await expect(recordMerchantRewardClaim(a.userId, a.merchantId, { rewardId: row.id, expectedRevision: row.revision, recordOnly: true })).rejects.toMatchObject({ reason: 'stale' }); const expired = (await workspace()).rows[0]; await expect(recordMerchantRewardClaim(a.userId, a.merchantId, { rewardId: row.id, expectedRevision: expired.revision, recordOnly: true })).rejects.toMatchObject({ reason: 'invalid' });
  await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [a.merchantId, b.userId]); await expect(createMerchantInvitation(b.userId, a.merchantId, { confirm: true })).rejects.toMatchObject({ reason: 'forbidden' }); await expect(recordMerchantRewardClaim(b.userId, a.merchantId, { rewardId: row.id, expectedRevision: expired.revision, recordOnly: true })).rejects.toMatchObject({ reason: 'forbidden' });
 });
});
