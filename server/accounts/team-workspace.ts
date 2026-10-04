import type { PoolConnection } from 'mysql2/promise';
import { TRPCError } from '@trpc/server';
import { getPool } from '../db/connection';
import { assertTeamSession } from './team-session';
import { lockTeamManagement } from './team-members';
import { teamRoles, teamWorkspaceSchema } from '../../shared/team-workspace';
import { hasPermission } from '../_core/permissions';
export type TeamScope = {
  actorId: number;
  merchantId: number;
  sessionId: string;
};
export async function withTeamScope<T>(
  scope: TeamScope,
  action: (
    tx: PoolConnection,
    authority: Awaited<ReturnType<typeof lockTeamManagement>>
  ) => Promise<T>
) {
  const pool = await getPool();
  if (!pool)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'team:unavailable',
    });
  const tx = await pool.getConnection();
  let committing = false,
    reusable = true;
  try {
    await tx.beginTransaction();
    const authority = await lockTeamManagement(
      tx,
      scope.merchantId,
      scope.actorId
    );
    await assertTeamSession(tx, scope.actorId, scope.sessionId);
    const value = await action(tx, authority);
    committing = true;
    await tx.commit();
    return value;
  } catch (error) {
    if (committing) {
      reusable = false;
      tx.destroy();
    } else
      try {
        await tx.rollback();
      } catch {
        reusable = false;
        tx.destroy();
      }
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'team:unavailable',
    });
  } finally {
    if (reusable) tx.release();
  }
}
function date(value: any) {
  if (value == null) return null;
  const d =
    value instanceof Date
      ? value
      : new Date(String(value).replace(' ', 'T') + 'Z');
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
export async function readTeamWorkspace(scope: TeamScope) {
  return withTeamScope(scope, async (tx, { store, members, actorRole }) => {
    const active = members.filter(m => m.is_active === 1),
      legacy = !members.some(m => m.user_id === store.userId);
    const ids = active.slice(0, 500).map(m => m.user_id);
    if (legacy) ids.unshift(store.userId);
    const [users] = await tx.execute<any[]>(
      'SELECT id,name,email,account_status FROM users WHERE id IN (' +
        ids.map(() => '?').join(',') +
        ')',
      ids
    );
    const byId = new Map(users.map(u => [u.id, u]));
    const rows = active
      .slice(0, 500)
      .map(m => ({
        id: m.id,
        userId: m.user_id,
        role: teamRoles.includes(m.role) ? m.role : null,
        userName: byId.get(m.user_id)?.name || null,
        userEmail: byId.get(m.user_id)?.email || null,
        isActive: 1 as const,
        accountActive: byId.get(m.user_id)?.account_status === 'active',
        legacy: false,
        acceptedAt: date(m.accepted_at),
      }));
    if (legacy) {
      const u = byId.get(store.userId);
      rows.unshift({
        id: null as any,
        userId: store.userId,
        role: 'owner',
        userName: u?.name || null,
        userEmail: u?.email || null,
        isActive: 1,
        accountActive: true,
        legacy: true,
        acceptedAt: null,
      });
    }
    const [counts] = await tx.execute<any[]>(
      "SELECT SUM(expires_at>UTC_TIMESTAMP()) pending,SUM(expires_at<=UTC_TIMESTAMP()) expired FROM merchant_invitations WHERE merchant_id=? AND status='pending'",
      [scope.merchantId]
    );
    const [invitations] = await tx.execute<any[]>(
      "SELECT id,email,role,expires_at,created_at,(expires_at>UTC_TIMESTAMP()) live FROM merchant_invitations WHERE merchant_id=? AND status='pending' ORDER BY id DESC LIMIT 101",
      [scope.merchantId]
    );
    return teamWorkspaceSchema.parse({
      actorId: scope.actorId,
      merchantId: scope.merchantId,
      actorRole,
      canManageOwners: hasPermission(actorRole, 'team.add_owner'),
      members: rows.slice(0, 500),
      hasMoreMembers: rows.length > 500 || active.length + Number(legacy) > 500,
      invitations: invitations
        .slice(0, 100)
        .map(i => ({
          id: i.id,
          email: i.email,
          role: teamRoles.includes(i.role) ? i.role : null,
          status: Number(i.live) === 1 ? 'pending' : 'expired',
          expiresAt: date(i.expires_at),
          createdAt: date(i.created_at),
        })),
      hasMoreInvitations: invitations.length > 100,
      counts: {
        members: active.length + Number(legacy),
        owners:
          active.filter(
            m => m.role === 'owner' && m.account_status === 'active'
          ).length + Number(legacy),
        pending: Number(counts[0]?.pending || 0),
        expired: Number(counts[0]?.expired || 0),
      },
    });
  });
}
export async function revokeTeamInvitation(
  scope: TeamScope,
  invitationId: number
) {
  return withTeamScope(scope, async tx => {
    const [result] = await tx.execute<any>(
      "UPDATE merchant_invitations SET status='revoked',recipient_hash=NULL WHERE id=? AND merchant_id=? AND status='pending'",
      [invitationId, scope.merchantId]
    );
    if (result.affectedRows !== 1)
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'team:invitation_unavailable',
      });
    return {
      success: true as const,
      actorId: scope.actorId,
      merchantId: scope.merchantId,
      invitationId,
    };
  });
}
