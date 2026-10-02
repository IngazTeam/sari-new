import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { ALL_ROLES, hasPermission, type MerchantRole } from './_core/permissions';
import { projectReferralWorkspace } from './referral-workspace-source';
import { referralWorkspaceInput, type ReferralSelection } from '../shared/referral-workspace';
export class ReferralWorkspaceError extends Error { constructor(readonly reason: 'forbidden' | 'unavailable') { super(`referrals:${reason}`); } }
async function rows(tx: PoolConnection, sql: string, args: any[]) { const [data] = await tx.execute(sql, args); if (!Array.isArray(data)) throw new ReferralWorkspaceError('unavailable'); return data as any[]; }
export async function readReferralWorkspace(actorId: number, merchantId: number, input: ReferralSelection) {
  const selection = referralWorkspaceInput.parse(input); let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (![actorId, merchantId].every(n => Number.isInteger(n) && n > 0 && n <= 2147483647)) throw new ReferralWorkspaceError('forbidden');
    const pool = await getPool(); if (!pool) throw new ReferralWorkspaceError('unavailable');
    tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
    const merchants = await rows(tx, 'SELECT userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
    const users = await rows(tx, 'SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
    const members = await rows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : members.length === 0 && merchants[0]?.userId === actorId ? 'owner' : null;
    if (merchants.length !== 1 || merchants[0].status === 'suspended' || users.length !== 1 || users[0].account_status !== 'active' || !ALL_ROLES.includes(role)) throw new ReferralWorkspaceError('forbidden');
    const codes = await rows(tx, 'SELECT id,merchantId,code,referralCount,isActive,createdAt,updatedAt,referrerPhone,referrerName,rewardGiven FROM referral_codes WHERE merchantId=? ORDER BY createdAt DESC,id DESC', [merchantId]);
    const referrals = await rows(tx, 'SELECT r.id,c.merchantId,r.referralCodeId,c.code,r.referredPhone,r.referredName,r.orderCompleted,r.createdAt,r.updatedAt FROM referrals r JOIN referral_codes c ON c.id=r.referralCodeId WHERE c.merchantId=? ORDER BY r.createdAt DESC,r.id DESC', [merchantId]);
    const rewards = await rows(tx, 'SELECT w.id,w.merchantId,w.referralId,w.rewardType,w.status,w.claimedAt,w.expiresAt,w.description,w.createdAt,w.updatedAt,CASE WHEN c.merchantId=? THEN r.id ELSE NULL END AS scopedReferralId FROM rewards w LEFT JOIN referrals r ON r.id=w.referralId LEFT JOIN referral_codes c ON c.id=r.referralCodeId WHERE w.merchantId=? ORDER BY w.createdAt DESC,w.id DESC', [merchantId, merchantId]);
    const result = projectReferralWorkspace(actorId, merchantId, hasPermission(role as MerchantRole, 'campaigns.manage'), selection, { codes, referrals, rewards });
    committing = true; await tx.commit(); return result;
  } catch (error) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof ReferralWorkspaceError) throw error; throw new ReferralWorkspaceError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
