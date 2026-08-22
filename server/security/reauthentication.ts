import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { DUMMY_PASSWORD_HASH, clearSuccessfulLoginAttempts, reserveLoginAttempt } from '../accounts/login-security';
import { hashSessionId } from '../_core/session-security';
import { getPool } from '../db';

export const RECENT_REAUTHENTICATION_MS = 5 * 60_000;

interface ReauthenticationRow extends RowDataPacket {
  email: string | null;
  password: string | null;
  sessionCreatedAt: Date | string;
}

export class ReauthenticationError extends Error {
  constructor(public readonly code:
    | 'invalid_session'
    | 'required'
    | 'failed'
    | 'rate_limited') {
    super(code);
  }
}

/**
 * Requires either a session minted in the last five minutes or the account's
 * current password. Password attempts reuse the distributed login limiter so
 * parallel guesses cannot bypass the bound on another application instance.
 */
export async function assertRecentReauthentication(input: {
  userId: number;
  sessionId: string;
  password?: string;
  ipAddress: string;
}): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  const [rows] = await pool.execute<ReauthenticationRow[]>(
    `SELECT u.email, u.password, s.created_at AS sessionCreatedAt
       FROM users u
       JOIN auth_sessions s ON s.user_id = u.id
      WHERE u.id = ? AND u.account_status = 'active'
        AND s.token_id_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
      LIMIT 1`,
    [input.userId, hashSessionId(input.sessionId)],
  );
  const row = rows[0];
  if (!row) throw new ReauthenticationError('invalid_session');

  const sessionAgeMs = Date.now() - new Date(row.sessionCreatedAt).getTime();
  if (Number.isFinite(sessionAgeMs) && sessionAgeMs >= 0 && sessionAgeMs <= RECENT_REAUTHENTICATION_MS) {
    return;
  }

  if (!input.password) throw new ReauthenticationError('required');
  const accountFingerprint = row.email || `user:${input.userId}`;
  const reservation = await reserveLoginAttempt({
    email: accountFingerprint,
    ipAddress: input.ipAddress,
  });
  if (!reservation.allowed) throw new ReauthenticationError('rate_limited');

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(input.password, row.password || DUMMY_PASSWORD_HASH);
  } catch {
    passwordMatches = false;
  }
  if (!row.password || !passwordMatches) throw new ReauthenticationError('failed');
  await clearSuccessfulLoginAttempts(accountFingerprint);
}
