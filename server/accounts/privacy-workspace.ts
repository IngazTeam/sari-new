import { getPool } from '../db/connection';
import { hashSessionId, isSessionId } from '../_core/session-security';
import {
  privacyWorkspace,
  privacyRequestTypes,
  privacyRequestStates,
} from '../../shared/privacy-workspace';
import {
  ACCOUNT_DELETION_GRACE_HOURS,
  DATA_SUBJECT_RESPONSE_DAYS,
} from '../../shared/legal';
import type { PoolConnection } from 'mysql2/promise';
export async function assertPrivacySession(
  tx: Pick<PoolConnection, 'execute'>,
  actorId: number,
  sessionId: string
) {
  if (!Number.isSafeInteger(actorId) || actorId < 1 || !isSessionId(sessionId))
    throw Error('ACCOUNT_UNAVAILABLE');
  const [rows] = await tx.execute<any[]>(
    "SELECT a.id FROM auth_sessions a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND a.token_id_hash=? AND a.revoked_at IS NULL AND a.expires_at>UTC_TIMESTAMP() AND u.account_status='active' LIMIT 2 FOR SHARE",
    [actorId, hashSessionId(sessionId)]
  );
  if (rows.length !== 1) throw Error('ACCOUNT_UNAVAILABLE');
}
function stamp(v: any) {
  if (v == null) return null;
  const value =
    v instanceof Date
      ? v
      : new Date(String(v).replace(' ', 'T').replace(/Z?$/, 'Z'));
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
export async function readPrivacyWorkspace(actorId: number, sessionId: string) {
  const pool = await getPool();
  if (!pool) throw Error('PRIVACY_UNAVAILABLE');
  const tx = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await tx.beginTransaction();
    const [users] = await tx.execute<any[]>(
      "SELECT id,role,(password IS NOT NULL AND password<>'') can_verify FROM users WHERE id=? AND account_status='active' FOR SHARE",
      [actorId]
    );
    if (users.length !== 1) throw Error('ACCOUNT_UNAVAILABLE');
    await assertPrivacySession(tx, actorId, sessionId);
    const [consents] = await tx.execute<any[]>(
      "SELECT granted,withdrawn_at FROM consent_receipts WHERE user_id=? AND consent_type='marketing' ORDER BY created_at DESC,id DESC LIMIT 1",
      [actorId]
    );
    const [requests] = await tx.execute<any[]>(
      'SELECT id,request_type,status,requested_at,due_at,completed_at,LEFT(rejection_reason,500) rejection_reason FROM data_subject_requests WHERE user_id=? ORDER BY requested_at DESC,id DESC LIMIT 20',
      [actorId]
    );
    const [stores] = await tx.execute<any[]>(
      'SELECT m.id,m.businessName,EXISTS(SELECT 1 FROM merchant_members mm WHERE mm.merchant_id=m.id AND mm.user_id<>? AND mm.is_active=1) shared FROM merchants m WHERE m.userId=? ORDER BY m.id LIMIT 51',
      [actorId, actorId]
    );
    const consent = consents[0],
      valid = !consent || [0, 1].includes(consent.granted);
    const data = privacyWorkspace.parse({
      actorId,
      scope: 'account',
      marketingConsent: !consent
        ? false
        : !valid
          ? null
          : !consent.withdrawn_at && consent.granted === 1,
      marketingStatus: !consent ? 'default' : valid ? 'saved' : 'invalid',
      canVerifyPassword: Number(users[0].can_verify) === 1,
      isAdmin: users[0].role === 'admin',
      responseDays: DATA_SUBJECT_RESPONSE_DAYS,
      graceHours: ACCOUNT_DELETION_GRACE_HOURS,
      ownedStores: stores.slice(0, 50).map(s => ({
        id: s.id,
        name: s.businessName,
        shared: Number(s.shared) === 1,
      })),
      hasMoreStores: stores.length > 50,
      requests: requests.map(r => ({
        id: r.id,
        requestType: privacyRequestTypes.includes(r.request_type)
          ? r.request_type
          : null,
        status: privacyRequestStates.includes(r.status) ? r.status : null,
        requestedAt: stamp(r.requested_at),
        dueAt: stamp(r.due_at),
        completedAt: stamp(r.completed_at),
        rejectionReason: r.rejection_reason || null,
      })),
    });
    committing = true;
    await tx.commit();
    return data;
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
    throw error;
  } finally {
    if (reusable) tx.release();
  }
}

export function privacyInsertId(result: unknown): number {
  const r = result as { affectedRows?: unknown; insertId?: unknown };
  if (
    r?.affectedRows !== 1 ||
    !Number.isSafeInteger(r.insertId) ||
    Number(r.insertId) < 1
  )
    throw Error('PRIVACY_WRITE_UNCONFIRMED');
  return Number(r.insertId);
}
