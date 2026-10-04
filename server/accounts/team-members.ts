import { TRPCError } from '@trpc/server';
import { getPool } from '../db/connection';
import { hasPermission, type MerchantRole } from '../_core/permissions';
import type { PoolConnection } from 'mysql2/promise';
import { privacyHash } from './privacy-hash';
import {assertTeamSession} from './team-session';

/** Lock the store before members/invitations in every team mutation. */
export async function lockTeamManagement(connection: PoolConnection, merchantId: number, actorId: number) {
  const [stores] = await connection.execute<any[]>(
    "SELECT m.userId FROM merchants m JOIN users u ON u.id=m.userId WHERE m.id = ? AND m.status IN ('active','pending') AND u.account_status='active' FOR UPDATE", [merchantId]);
  if (!stores[0]) throw new TRPCError({ code: 'NOT_FOUND' });
  const [members] = await connection.execute<any[]>(
    'SELECT mm.id, mm.user_id, mm.role, mm.is_active, mm.accepted_at, u.account_status FROM merchant_members mm JOIN users u ON u.id=mm.user_id WHERE mm.merchant_id = ? ORDER BY mm.id LIMIT 5001 FOR UPDATE', [merchantId]);
  if(members.length>5000)throw new TRPCError({code:'PRECONDITION_FAILED',message:'team:history_limit'});
  const [users] = await connection.execute<any[]>('SELECT account_status FROM users WHERE id = ?', [actorId]);
  const actor = members.find(row => row.user_id === actorId);
  const legacyOwner = !actor && stores[0].userId === actorId;
  const actorRole = legacyOwner ? 'owner' : actor?.is_active === 1 ? actor.role as MerchantRole : undefined;
  if (users[0]?.account_status !== 'active' || !actorRole || !hasPermission(actorRole, 'team.manage')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية إدارة الفريق' });
  }
  return { store: stores[0], members, actorRole };
}

/** Serialize team changes per store, including the last-owner check and revocation. */
export async function changeTeamMember(input: {
  merchantId: number; actorId: number; memberId: number; sessionId?: string; expectedRole?: MerchantRole;
  change: { kind: 'remove' } | { kind: 'role'; role: MerchantRole };
}): Promise<{ success: true; actorId:number; merchantId:number; memberId:number }> {
  const pool = await getPool();
  if (!pool) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { store, members, actorRole } = await lockTeamManagement(connection, input.merchantId, input.actorId);
    if(input.sessionId!==undefined)await assertTeamSession(connection,input.actorId,input.sessionId);
    const target = members.find(row => row.id === input.memberId && row.is_active === 1);
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'العضو غير موجود' });
    if(input.expectedRole!==undefined&&target.role!==input.expectedRole)throw new TRPCError({code:'CONFLICT',message:'team:member_changed'});
    if ((target.role === 'owner' || (input.change.kind === 'role' && input.change.role === 'owner'))
      && !hasPermission(actorRole, 'team.add_owner')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'إدارة المالكين متاحة للمالك فقط' });
    }
    if (input.change.kind === 'remove' && target.user_id === input.actorId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك حذف نفسك — اطلب من مالك آخر' });
    }
    const losesOwnership = target.role === 'owner' && (input.change.kind === 'remove' || input.change.role !== 'owner');
    // Count a legacy owner only when no membership history exists for that owner.
    const hasLegacyOwner = !members.some(row => row.user_id === store.userId);
    const owners = members.filter(row => row.is_active === 1 && row.role === 'owner' && row.account_status === 'active').length + Number(hasLegacyOwner);
    if (losesOwnership && owners <= 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكن إزالة آخر مالك للمتجر' });
    }
    const [result] = input.change.kind === 'remove'
      ? await connection.execute<any>('UPDATE merchant_members SET is_active = 0 WHERE id = ? AND merchant_id = ? AND is_active = 1', [input.memberId, input.merchantId])
      : await connection.execute<any>('UPDATE merchant_members SET role = ? WHERE id = ? AND merchant_id = ? AND is_active = 1', [input.change.role, input.memberId, input.merchantId]);
    if (result.affectedRows !== 1) throw new TRPCError({ code: 'CONFLICT' });
    if (input.change.kind === 'remove') {
      const [users] = await connection.execute<any[]>('SELECT email FROM users WHERE id = ?', [target.user_id]);
      const recipientHash = users[0]?.email ? privacyHash(users[0].email) : null;
      await connection.execute(
        "UPDATE merchant_invitations SET status='revoked', recipient_hash=NULL WHERE merchant_id=? AND status='pending' AND (invited_by=? OR recipient_hash=?)",
        [input.merchantId, target.user_id, recipientHash]);
    } else if (!hasPermission(input.change.role, 'team.manage')) {
      await connection.execute(
        "UPDATE merchant_invitations SET status='revoked', recipient_hash=NULL WHERE merchant_id=? AND status='pending' AND invited_by=?",
        [input.merchantId, target.user_id]);
    }
    await connection.commit();
    return { success: true,actorId:input.actorId,merchantId:input.merchantId,memberId:input.memberId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
