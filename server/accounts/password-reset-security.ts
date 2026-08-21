import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { RowDataPacket } from 'mysql2/promise';
import { authSessions, passwordResetTokens, users } from '../../drizzle/schema';
import { getDb, getPool } from '../db';
import { privacyHash } from './privacy-hash';

interface PasswordResetAttemptRow extends RowDataPacket {
  attemptedAt: Date | string;
}

interface PasswordResetLockRow extends RowDataPacket {
  acquired: number | null;
}

export interface PasswordResetAttemptReservation {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: 'email' | 'ip';
}

function mysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function passwordResetLockName(kind: 'email' | 'ip', value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 48);
  return `pwreset:${kind}:${digest}`;
}

/**
 * Atomically reserves a password-reset attempt across all application instances.
 * MySQL named locks serialize requests for both the normalized email and client IP,
 * while the table keeps the limit durable across restarts.
 */
export async function reservePasswordResetAttempt(data: {
  email: string;
  ipAddress: string;
}): Promise<PasswordResetAttemptReservation> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  const emailFingerprint = privacyHash(data.email);
  const ipFingerprint = privacyHash(data.ipAddress).slice(0, 45);
  const connection = await pool.getConnection();
  const lockNames = [
    passwordResetLockName('email', emailFingerprint),
    passwordResetLockName('ip', ipFingerprint),
  ].sort();
  const acquiredLocks: string[] = [];

  try {
    for (const lockName of lockNames) {
      const [lockRows] = await connection.execute<PasswordResetLockRow[]>(
        'SELECT GET_LOCK(?, 3) AS acquired',
        [lockName],
      );
      if (Number(lockRows[0]?.acquired) !== 1) {
        throw new Error('Password reset rate-limit lock unavailable');
      }
      acquiredLocks.push(lockName);
    }

    const [emailAttempts] = await connection.execute<PasswordResetAttemptRow[]>(
      `SELECT attempted_at AS attemptedAt
         FROM password_reset_attempts
        WHERE email = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        ORDER BY attempted_at ASC`,
      [emailFingerprint],
    );
    if (emailAttempts.length >= 3) {
      const oldestAttempt = new Date(emailAttempts[0].attemptedAt).getTime();
      return {
        allowed: false,
        reason: 'email',
        retryAfterSeconds: Math.max(1, Math.ceil((10 * 60 * 1000 - (Date.now() - oldestAttempt)) / 1000)),
      };
    }

    const [ipAttempts] = await connection.execute<PasswordResetAttemptRow[]>(
      `SELECT attempted_at AS attemptedAt
         FROM password_reset_attempts
        WHERE ip_address = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        ORDER BY attempted_at ASC`,
      [ipFingerprint],
    );
    if (ipAttempts.length >= 5) {
      const oldestAttempt = new Date(ipAttempts[0].attemptedAt).getTime();
      return {
        allowed: false,
        reason: 'ip',
        retryAfterSeconds: Math.max(1, Math.ceil((60 * 60 * 1000 - (Date.now() - oldestAttempt)) / 1000)),
      };
    }

    await connection.execute(
      'INSERT INTO password_reset_attempts (email, ip_address) VALUES (?, ?)',
      [emailFingerprint, ipFingerprint],
    );
    await connection.execute(
      'DELETE FROM password_reset_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 1000',
    );
    return { allowed: true };
  } finally {
    for (const lockName of acquiredLocks.reverse()) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
    }
    connection.release();
  }
}

/**
 * Claims a live, unused reset token and changes the password in one transaction.
 * The conditional claim prevents two concurrent requests from reusing one token.
 */
export async function consumePasswordResetTokenAndUpdatePassword(
  token: string,
  hashedPassword: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const tokenDigest = createHash('sha256').update(token).digest('hex');

  return db.transaction(async (tx) => {
    const [resetToken] = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, tokenDigest))
      .limit(1);

    if (!resetToken || resetToken.used || new Date(resetToken.expiresAt).getTime() <= Date.now()) {
      return false;
    }

    const now = mysqlTimestamp(new Date());
    const claimResult = await tx
      .update(passwordResetTokens)
      .set({ used: 1, usedAt: now })
      .where(and(
        eq(passwordResetTokens.id, resetToken.id),
        eq(passwordResetTokens.used, 0),
        gt(passwordResetTokens.expiresAt, now),
      ));
    const affectedRows = Number((claimResult[0] as { affectedRows?: number }).affectedRows || 0);
    if (affectedRows !== 1) return false;

    await tx
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, resetToken.userId));

    await tx
      .update(authSessions)
      .set({ revokedAt: now })
      .where(and(
        eq(authSessions.userId, resetToken.userId),
        isNull(authSessions.revokedAt),
      ));

    await tx
      .update(passwordResetTokens)
      .set({ used: 1, usedAt: now })
      .where(and(
        eq(passwordResetTokens.userId, resetToken.userId),
        eq(passwordResetTokens.used, 0),
      ));
    return true;
  });
}
