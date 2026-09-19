import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { privacyHash } from './privacy-hash';
import { isFutureDatabaseTime } from '../db/time';
import { lockTeamManagement } from './team-members';

export type TeamInvitationRole = 'manager' | 'sales_supervisor' | 'viewer';

type InvitationRow = RowDataPacket & {
  id: number;
  merchantId: number;
  email: string;
  recipientHash: string | null;
  role: TeamInvitationRole;
  invitedBy: number;
  expiresAt: Date | string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedByUserId: number | null;
  merchantName?: string;
};

type UserIdentityRow = RowDataPacket & {
  email: string | null;
  emailVerifiedAt: Date | string | null;
  accountStatus: string;
};

export class TeamInvitationError extends Error {
  constructor(public readonly code: 'unavailable' | 'recipient_mismatch' | 'verification_required') {
    super(code);
  }
}

function mysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function tokenDigest(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function inviteLockName(merchantId: number, recipientHash: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${merchantId}:${recipientHash}`)
    .digest('hex')
    .slice(0, 48);
  return `team-invite:${digest}`;
}

async function releaseLock(connection: PoolConnection, lockName: string, acquired: boolean): Promise<void> {
  if (!acquired) return;
  await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
}

export async function issueTeamInvitation(input: {
  merchantId: number;
  email: string;
  role: TeamInvitationRole;
  invitedBy: number;
}): Promise<{ token: string; expiresAt: Date; email: string }> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const email = normalizeEmail(input.email);
  const recipientHash = privacyHash(email);
  const token = crypto.randomBytes(32).toString('hex');
  const digest = tokenDigest(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const connection = await pool.getConnection();
  const lockName = inviteLockName(input.merchantId, recipientHash);
  let acquired = false;

  try {
    const [lockRows] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, 3) AS acquired', [lockName]);
    acquired = Number(lockRows[0]?.acquired) === 1;
    if (!acquired) throw new Error('TEAM_INVITATION_LOCK_UNAVAILABLE');

    await connection.beginTransaction();
    await lockTeamManagement(connection, input.merchantId, input.invitedBy);
    await connection.execute(
      `UPDATE merchant_invitations
          SET status = 'expired', recipient_hash = NULL
        WHERE merchant_id = ? AND recipient_hash = ? AND status = 'pending' AND expires_at <= NOW()`,
      [input.merchantId, recipientHash],
    );
    const [pending] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM merchant_invitations
        WHERE merchant_id = ? AND recipient_hash = ? AND status = 'pending' LIMIT 1 FOR UPDATE`,
      [input.merchantId, recipientHash],
    );
    if (pending[0]) throw new Error('TEAM_INVITATION_ALREADY_PENDING');

    await connection.execute(
      `INSERT INTO merchant_invitations
        (merchant_id, email, role, token, recipient_hash, invited_by, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [input.merchantId, email, input.role, digest, recipientHash, input.invitedBy, mysqlTimestamp(expiresAt)],
    );
    await connection.commit();
    return { token, expiresAt, email };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await releaseLock(connection, lockName, acquired);
    connection.release();
  }
}

export async function revokeIssuedTeamInvitation(token: string): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  await pool.execute(
    `UPDATE merchant_invitations SET status = 'revoked', recipient_hash = NULL
      WHERE token = ? AND status = 'pending'`,
    [tokenDigest(token)],
  );
}

export async function inspectTeamInvitation(token: string): Promise<{
  merchantName: string;
  role: TeamInvitationRole;
}> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const [rows] = await pool.execute<InvitationRow[]>(
    `SELECT mi.role, mi.status, mi.expires_at AS expiresAt, m.businessName AS merchantName
       FROM merchant_invitations mi
       INNER JOIN merchants m ON m.id = mi.merchant_id
      WHERE mi.token = ? LIMIT 1`,
    [tokenDigest(token)],
  );
  const invitation = rows[0];
  if (!invitation || invitation.status !== 'pending' || !isFutureDatabaseTime(invitation.expiresAt)) {
    throw new TeamInvitationError('unavailable');
  }
  return { merchantName: invitation.merchantName || '', role: invitation.role };
}

export async function acceptTeamInvitation(input: {
  token: string;
  userId: number;
}): Promise<{ merchantId: number; alreadyAccepted: boolean }> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Discover the store, then acquire locks in the same order as issuance and
    // revocation. Re-read the invitation under its lock before claiming it.
    const [identity] = await connection.execute<InvitationRow[]>(
      'SELECT merchant_id AS merchantId, invited_by AS invitedBy FROM merchant_invitations WHERE token = ? LIMIT 1', [tokenDigest(input.token)]);
    if (!identity[0]) throw new TeamInvitationError('unavailable');
    const { store, members } = await lockTeamManagement(connection, identity[0].merchantId, identity[0].invitedBy);
    const [invitations] = await connection.execute<InvitationRow[]>(
      `SELECT id, merchant_id AS merchantId, email, recipient_hash AS recipientHash, role,
              invited_by AS invitedBy, expires_at AS expiresAt, status,
              accepted_by_user_id AS acceptedByUserId
         FROM merchant_invitations WHERE token = ? LIMIT 1 FOR UPDATE`,
      [tokenDigest(input.token)],
    );
    const invitation = invitations[0];
    if (!invitation) throw new TeamInvitationError('unavailable');
    if (invitation.status === 'accepted' && invitation.acceptedByUserId === input.userId) {
      await connection.commit();
      return { merchantId: invitation.merchantId, alreadyAccepted: true };
    }
    if (invitation.status !== 'pending' || !isFutureDatabaseTime(invitation.expiresAt)) {
      throw new TeamInvitationError('unavailable');
    }

    const [users] = await connection.execute<UserIdentityRow[]>(
      `SELECT email, email_verified_at AS emailVerifiedAt, account_status AS accountStatus
         FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.userId],
    );
    const user = users[0];
    if (!user || user.accountStatus !== 'active' || !user.email) {
      throw new TeamInvitationError('unavailable');
    }
    if (!user.emailVerifiedAt) throw new TeamInvitationError('verification_required');
    const authenticatedRecipientHash = privacyHash(normalizeEmail(user.email));
    if (!invitation.recipientHash || invitation.recipientHash !== authenticatedRecipientHash) {
      throw new TeamInvitationError('recipient_mismatch');
    }

    const acceptedAt = mysqlTimestamp(new Date());
    if (!['manager', 'sales_supervisor', 'viewer'].includes(invitation.role)) throw new TeamInvitationError('unavailable');
    // Invitations must never demote a legacy owner implicitly. An active member
    // retains their role; a newly invited revoked member gets the new invite role.
    const role = store.userId === input.userId && !members.some(row => row.user_id === input.userId) ? 'owner' : invitation.role;
    await connection.execute(
      `INSERT INTO merchant_members
        (merchant_id, user_id, role, invited_by, invited_at, accepted_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
         role = IF(is_active = 0, VALUES(role), role),
         invited_by = IF(is_active = 0, VALUES(invited_by), invited_by),
         accepted_at = IF(is_active = 0, VALUES(accepted_at), accepted_at),
         is_active = 1`,
      [
        invitation.merchantId,
        input.userId,
        role,
        invitation.invitedBy,
        acceptedAt,
        acceptedAt,
      ],
    );
    const [claim] = await connection.execute(
      `UPDATE merchant_invitations
          SET status = 'accepted', accepted_at = ?, accepted_by_user_id = ?, recipient_hash = NULL
        WHERE id = ? AND status = 'pending'`,
      [acceptedAt, input.userId, invitation.id],
    );
    if (Number((claim as { affectedRows?: number }).affectedRows || 0) !== 1) {
      throw new TeamInvitationError('unavailable');
    }
    await connection.commit();
    return { merchantId: invitation.merchantId, alreadyAccepted: false };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
