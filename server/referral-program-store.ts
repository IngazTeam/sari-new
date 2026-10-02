import { assertRuntimeSchema } from './db/schema-readiness';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { referralCreateInput, referralClaimInput, referralProgramProfile, referralInvitationInput, referralApplyInput } from '../shared/referral-program';
import { projectReferralWorkspace } from './referral-workspace-source';
import { referralWorkspaceInput } from '../shared/referral-workspace';
export const REFERRAL_PROGRAM_REQUIREMENTS = [{table:'merchant_referral_programs',columns:['merchant_id','code_id','applied_code_id','applied_referral_id','applied_reward_id','created_at','updated_at'],uniqueIndexes:[{name:'uq_merchant_referral_code',columns:['code_id']},{name:'uq_merchant_referral_application',columns:['applied_referral_id']},{name:'uq_merchant_referral_reward',columns:['applied_reward_id']}],checkConstraints:['chk_merchant_referral_application']}];
export class ReferralProgramError extends Error { constructor(readonly reason: 'forbidden' | 'unavailable' | 'stale' | 'missing' | 'invalid') { super(`referral_program:${reason}`); } }
export async function referralRows(tx: PoolConnection, sql: string, args: any[]) { const [data] = await tx.execute(sql, args); if (!Array.isArray(data)) throw new ReferralProgramError('unavailable'); return data as any[]; }
export const referralRewardProjection = 'w.id,w.merchantId,w.referralId,w.rewardType,w.status,w.claimedAt,w.expiresAt,w.description,w.createdAt,w.updatedAt,CASE WHEN c.merchantId=? THEN r.id ELSE NULL END AS scopedReferralId';
export async function withReferralAuthority<T>(actorId: number, merchantId: number, write: boolean, operation: (tx: PoolConnection, merchant: any, canManage: boolean) => Promise<T>): Promise<T> {
 let tx: PoolConnection | undefined, committing = false, reusable = true;
 try {
  if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new ReferralProgramError('forbidden');
  const pool = await getPool(); if (!pool) throw new ReferralProgramError('unavailable'); await assertRuntimeSchema('Merchant referral program', REFERRAL_PROGRAM_REQUIREMENTS, {cacheSuccess:false}); tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
  const merchants = await referralRows(tx, 'SELECT userId,status,businessName,phone FROM merchants WHERE id=? ' + (write ? 'FOR UPDATE' : 'FOR SHARE'), [merchantId]);
  const users = await referralRows(tx, 'SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
  const members = await referralRows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
  const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : members.length === 0 && merchants[0]?.userId === actorId ? 'owner' : null, canManage = hasPermission(role as MerchantRole, 'subscription.manage');
  if (merchants.length !== 1 || merchants[0].status === 'suspended' || users.length !== 1 || users[0].account_status !== 'active' || !ALL_ROLES.includes(role) || write && !canManage) throw new ReferralProgramError('forbidden');
  const profiles = await referralRows(tx, 'SELECT code_id,applied_code_id,applied_referral_id,applied_reward_id FROM merchant_referral_programs WHERE merchant_id=?'+(write?' FOR UPDATE':''),[merchantId]);
  const result = await operation(tx, {...merchants[0],program:profiles[0]??null}, canManage); committing = true; await tx.commit(); return result;
 } catch (error) { if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; } if (error instanceof ReferralProgramError) throw error; throw new ReferralProgramError('unavailable'); }
 finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
export function getMerchantInvitation(actorId: number, merchantId: number) {
 return withReferralAuthority(actorId, merchantId, false, async (tx, merchant) => {
  const profile = referralProgramProfile(merchant.program); if (!profile.codeId) return null;
  const found = await referralRows(tx, 'SELECT id,merchantId,code,isActive FROM referral_codes WHERE merchantId=? AND id=?', [merchantId, profile.codeId]);
  if (found.length !== 1) throw new ReferralProgramError('invalid'); return found[0];
 });
}
export function createMerchantInvitation(actorId: number, merchantId: number, input: unknown) {
 referralCreateInput.parse(input);
 return withReferralAuthority(actorId, merchantId, true, async (tx, merchant) => {
  const profile = referralProgramProfile(merchant.program);
  if (profile.codeId) { const found = await referralRows(tx, 'SELECT id,merchantId,code,isActive FROM referral_codes WHERE merchantId=? AND id=? FOR UPDATE', [merchantId, profile.codeId]); if (found.length !== 1) throw new ReferralProgramError('invalid'); return { code: found[0], created: false }; }
  // Explicit program identity in its own table prevents adopting an arbitrary customer referral code.
  const code = `SARY-${merchantId}-${randomBytes(8).toString('hex').toUpperCase()}`;
  const existing = await referralRows(tx, 'SELECT id FROM referral_codes WHERE code=? LIMIT 1', [code]); if (existing.length) throw new ReferralProgramError('stale');
  const [saved] = await tx.execute<any>('INSERT INTO referral_codes (merchantId,code,referrerName,referrerPhone,referralCount,isActive,rewardGiven) VALUES (?,?,?,?,0,1,0)', [merchantId, code, merchant.businessName, merchant.phone || '']);
  const id = Number(saved.insertId); if (saved.affectedRows !== 1 || !Number.isInteger(id) || id <= 0) throw new ReferralProgramError('unavailable');
  await tx.execute('INSERT INTO merchant_referral_programs (merchant_id,code_id) VALUES (?,?) ON DUPLICATE KEY UPDATE code_id=VALUES(code_id)',[merchantId,id]);
  return { code: { id, merchantId, code, isActive: 1 }, created: true };
 });
}
export function recordMerchantRewardClaim(actorId: number, merchantId: number, input: unknown) {
 const value = referralClaimInput.parse(input);
 return withReferralAuthority(actorId, merchantId, true, async tx => {
  const found = await referralRows(tx, `SELECT ${referralRewardProjection} FROM rewards w LEFT JOIN referrals r ON r.id=w.referralId LEFT JOIN referral_codes c ON c.id=r.referralCodeId WHERE w.merchantId=? AND w.id=? FOR UPDATE`, [merchantId, merchantId, value.rewardId]);
  if (found.length !== 1) throw new ReferralProgramError('missing');
  const row = projectReferralWorkspace(actorId, merchantId, true, referralWorkspaceInput.parse({ tab: 'rewards' }), { codes: [], referrals: [], rewards: found }).rows[0];
  if (row.revision !== value.expectedRevision) throw new ReferralProgramError('stale');
  if (row.state !== 'pending') throw new ReferralProgramError('invalid');
  const [saved] = await tx.execute<any>("UPDATE rewards SET status='claimed',claimedAt=UTC_TIMESTAMP(),updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND status='pending' AND expiresAt>UTC_TIMESTAMP()", [merchantId, value.rewardId]);
  if (saved.affectedRows !== 1) throw new ReferralProgramError('stale');
  return { success: true as const, rewardId: value.rewardId, effect: 'record_only' as const, benefitGranted: false as const };
 });
}

async function invitation(tx: PoolConnection, merchantId: number, code: string) {
 const codes = await referralRows(tx, 'SELECT id,merchantId,code,isActive FROM referral_codes WHERE code=? LIMIT 2 FOR UPDATE', [code]);
 if (codes.length !== 1 || codes[0].isActive !== 1 || codes[0].merchantId === merchantId) throw new ReferralProgramError('invalid');
 const found = await referralRows(tx, 'SELECT userId,businessName,status FROM merchants WHERE id=? FOR SHARE', [codes[0].merchantId]);
 const profiles = await referralRows(tx, 'SELECT code_id,applied_code_id,applied_referral_id,applied_reward_id FROM merchant_referral_programs WHERE merchant_id=? FOR SHARE',[codes[0].merchantId]);
 if (found.length !== 1 || found[0].status === 'suspended' || referralProgramProfile(profiles[0]).codeId !== codes[0].id) throw new ReferralProgramError('invalid');
 const revision = createHash('sha256').update(JSON.stringify([codes[0].id, codes[0].merchantId, codes[0].code, codes[0].isActive, found[0].businessName, found[0].status])).digest('hex');
 return { code: codes[0], businessName: found[0].businessName, revision };
}
export function reviewMerchantInvitation(actorId: number, merchantId: number, input: unknown) {
 const value = referralInvitationInput.parse(input);
 return withReferralAuthority(actorId, merchantId, true, async (tx, merchant) => {
  const profile = referralProgramProfile(merchant.program), target = await invitation(tx, merchantId, value.code);
  if (profile.applied && profile.applied.codeId !== target.code.id) throw new ReferralProgramError('stale');
  return { actorId, merchantId, code: target.code.code, referrerName: target.businessName, expectedRevision: target.revision, alreadyApplied: profile.applied?.codeId === target.code.id, effect: 'pending_reward_record' as const, benefitGranted: false as const };
 });
}
export function applyMerchantInvitation(actorId: number, merchantId: number, input: unknown) {
 const value = referralApplyInput.parse(input);
 return withReferralAuthority(actorId, merchantId, true, async (tx, merchant) => {
  const profile = referralProgramProfile(merchant.program), target = await invitation(tx, merchantId, value.code);
  if (target.revision !== value.expectedRevision) throw new ReferralProgramError('stale');
  if (profile.applied) { if (profile.applied.codeId !== target.code.id) throw new ReferralProgramError('stale'); return { success: true as const, replayed: true, ...profile.applied, referrerMerchantId: target.code.merchantId, benefitGranted: false as const }; }
  const [referral] = await tx.execute<any>('INSERT INTO referrals (referralCodeId,referredPhone,referredName,orderCompleted) VALUES (?,?,?,0)', [target.code.id, merchant.phone || '', merchant.businessName]);
  const referralId = Number(referral.insertId); if (referral.affectedRows !== 1 || !Number.isInteger(referralId) || referralId <= 0) throw new ReferralProgramError('unavailable');
  const [reward] = await tx.execute<any>("INSERT INTO rewards (merchantId,referralId,rewardType,status,expiresAt,description) VALUES (?,?,'discount_10','pending',DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 DAY),?)", [target.code.merchantId, referralId, `خصم 10% على الاشتراك القادم لإحالة ${merchant.businessName}`]);
  const rewardId = Number(reward.insertId); if (reward.affectedRows !== 1 || !Number.isInteger(rewardId) || rewardId <= 0) throw new ReferralProgramError('unavailable');
  const [counter] = await tx.execute<any>('UPDATE referral_codes SET referralCount=referralCount+1,updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND referralCount>=0 AND referralCount<2147483647', [target.code.merchantId, target.code.id]);
  if (counter.affectedRows !== 1) throw new ReferralProgramError('invalid');
  const applied = { codeId: target.code.id, referralId, rewardId };
  await tx.execute('INSERT INTO merchant_referral_programs (merchant_id,applied_code_id,applied_referral_id,applied_reward_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE applied_code_id=VALUES(applied_code_id),applied_referral_id=VALUES(applied_referral_id),applied_reward_id=VALUES(applied_reward_id)',[merchantId,applied.codeId,applied.referralId,applied.rewardId]);
  return { success: true as const, replayed: false, ...applied, referrerMerchantId: target.code.merchantId, benefitGranted: false as const };
 });
}

export function readReferralLegacy(actorId: number, merchantId: number, tab: 'referrals' | 'rewards') {
 return withReferralAuthority(actorId, merchantId, false, async tx => {
  if (tab === 'referrals') return referralRows(tx, 'SELECT r.* FROM referrals r JOIN referral_codes c ON c.id=r.referralCodeId WHERE c.merchantId=? ORDER BY r.createdAt DESC,r.id DESC', [merchantId]);
  const source = await referralRows(tx, `SELECT ${referralRewardProjection} FROM rewards w LEFT JOIN referrals r ON r.id=w.referralId LEFT JOIN referral_codes c ON c.id=r.referralCodeId WHERE w.merchantId=? ORDER BY w.createdAt DESC,w.id DESC`, [merchantId, merchantId]);
  const result: Array<ReturnType<typeof projectReferralWorkspace>['rows'][number]> = [];
  for (let page = 1; page <= Math.ceil(source.length / 25); page++) result.push(...projectReferralWorkspace(actorId, merchantId, true, referralWorkspaceInput.parse({ tab: 'rewards' }), { codes: [], referrals: [], rewards: source.slice((page - 1) * 25, page * 25) }).rows);
  return result.filter(row => row.kind === 'reward').map(row => ({ ...row, rewardType: row.type, status: row.state }));
 });
}
export function readReferralLegacyStats(actorId: number, merchantId: number) {
 return withReferralAuthority(actorId, merchantId, false, async tx => {
  const referrals = await referralRows(tx, 'SELECT COUNT(*) AS total,SUM(r.orderCompleted=1) AS completed,SUM(r.orderCompleted=0) AS pending FROM referrals r JOIN referral_codes c ON c.id=r.referralCodeId WHERE c.merchantId=?', [merchantId]);
  const rewards = await referralRows(tx, "SELECT COUNT(*) AS total,SUM(status='pending' AND expiresAt>UTC_TIMESTAMP()) AS pending,SUM(status='claimed') AS claimed FROM rewards WHERE merchantId=?", [merchantId]);
  const number = (value: any) => { const n = Number(value ?? 0); if (!Number.isSafeInteger(n) || n < 0) throw new ReferralProgramError('unavailable'); return n; };
  return { totalReferrals: number(referrals[0]?.total), completedReferrals: number(referrals[0]?.completed), pendingReferrals: number(referrals[0]?.pending), totalRewards: number(rewards[0]?.total), pendingRewards: number(rewards[0]?.pending), claimedRewards: number(rewards[0]?.claimed) };
 });
}
