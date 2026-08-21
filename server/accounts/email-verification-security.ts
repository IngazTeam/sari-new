import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { emailVerificationTokens, users } from '../../drizzle/schema';
import { getDb, getPool } from '../db';
import { privacyHash } from './privacy-hash';

export const EMAIL_VERIFICATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
export const EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = 60;
export const EMAIL_VERIFICATION_USER_LIMIT = 3;
export const EMAIL_VERIFICATION_IP_LIMIT = 10;
export const EMAIL_VERIFICATION_WINDOW_MINUTES = 60;

interface VerificationAttemptRow extends RowDataPacket {
  createdAt: Date | string;
}

interface VerificationUserRow extends RowDataPacket {
  email: string | null;
  emailVerifiedAt: Date | string | null;
}

interface VerificationLockRow extends RowDataPacket {
  acquired: number | null;
}

export type EmailVerificationIssueResult =
  | { allowed: true; token: string; expiresAt: Date; alreadyVerified?: false }
  | { allowed: true; alreadyVerified: true }
  | { allowed: false; reason: 'user' | 'ip'; retryAfterSeconds: number };

function mysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function verificationLockName(kind: 'user' | 'ip', value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 44);
  return `emailverify:${kind}:${digest}`;
}

function retryAfterSeconds(attempts: VerificationAttemptRow[]): number {
  const oldestAttempt = new Date(attempts[0].createdAt).getTime();
  return Math.max(
    1,
    Math.ceil((EMAIL_VERIFICATION_WINDOW_MINUTES * 60 * 1000 - (Date.now() - oldestAttempt)) / 1000),
  );
}

export function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Reserves a verification send across every application instance and stores only
 * a SHA-256 digest of the bearer token plus an HMAC fingerprint of the client IP.
 * The database ownership check prevents this primitive from being reused to
 * verify or replace an address that is not already attached to the account.
 */
export async function issueEmailVerificationToken(data: {
  userId: number;
  email: string;
  ipAddress: string;
}): Promise<EmailVerificationIssueResult> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  const normalizedEmail = normalizeVerificationEmail(data.email);
  const ipHash = privacyHash(data.ipAddress.slice(0, 45));
  const connection = await pool.getConnection();
  const lockNames = [
    verificationLockName('user', String(data.userId)),
    verificationLockName('ip', ipHash),
  ].sort();
  const acquiredLocks: string[] = [];

  try {
    for (const lockName of lockNames) {
      const [lockRows] = await connection.execute<VerificationLockRow[]>(
        'SELECT GET_LOCK(?, 3) AS acquired',
        [lockName],
      );
      if (Number(lockRows[0]?.acquired) !== 1) {
        throw new Error('Email verification rate-limit lock unavailable');
      }
      acquiredLocks.push(lockName);
    }

    await connection.beginTransaction();
    try {
      const [accountRows] = await connection.execute<VerificationUserRow[]>(
        `SELECT email, email_verified_at AS emailVerifiedAt
           FROM users
          WHERE id = ? AND account_status = 'active'
          FOR UPDATE`,
        [data.userId],
      );
      const account = accountRows[0];
      if (!account?.email || normalizeVerificationEmail(account.email) !== normalizedEmail) {
        throw new Error('Email verification identity mismatch');
      }
      if (account.emailVerifiedAt) {
        await connection.commit();
        return { allowed: true, alreadyVerified: true };
      }

      const [userAttempts] = await connection.execute<VerificationAttemptRow[]>(
        `SELECT created_at AS createdAt
           FROM email_verification_tokens
          WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
          ORDER BY created_at ASC`,
        [data.userId],
      );
      if (userAttempts.length >= EMAIL_VERIFICATION_USER_LIMIT) {
        await connection.rollback();
        return {
          allowed: false,
          reason: 'user',
          retryAfterSeconds: retryAfterSeconds(userAttempts),
        };
      }

      const [ipAttempts] = await connection.execute<VerificationAttemptRow[]>(
        `SELECT created_at AS createdAt
           FROM email_verification_tokens
          WHERE request_ip_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
          ORDER BY created_at ASC`,
        [ipHash],
      );
      if (ipAttempts.length >= EMAIL_VERIFICATION_IP_LIMIT) {
        await connection.rollback();
        return {
          allowed: false,
          reason: 'ip',
          retryAfterSeconds: retryAfterSeconds(ipAttempts),
        };
      }

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
      await connection.execute(
        `UPDATE email_verification_tokens
            SET is_used = 1, used_at = NOW()
          WHERE user_id = ? AND is_used = 0`,
        [data.userId],
      );
      await connection.execute(
        `INSERT INTO email_verification_tokens
          (user_id, email, token, request_ip_hash, expires_at, is_used, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        [data.userId, normalizedEmail, tokenDigest(token), ipHash, mysqlTimestamp(expiresAt)],
      );
      await connection.commit();

      await connection.execute(
        `DELETE FROM email_verification_tokens
          WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
          LIMIT 1000`,
      ).catch(() => undefined);
      return { allowed: true, token, expiresAt };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    for (const lockName of acquiredLocks.reverse()) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
    }
    connection.release();
  }
}

/** Revokes a just-issued token when the email provider rejects the delivery. */
export async function revokeEmailVerificationToken(token: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const now = mysqlTimestamp(new Date());
  await db
    .update(emailVerificationTokens)
    .set({ isUsed: 1, usedAt: now })
    .where(and(
      eq(emailVerificationTokens.tokenHash, tokenDigest(token)),
      eq(emailVerificationTokens.isUsed, 0),
    ));
}

/**
 * Claims a live token exactly once and records verification in the same database
 * transaction. Concurrent consumers race on the conditional update; only one can
 * change `is_used` from zero to one.
 */
export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
  if (!EMAIL_VERIFICATION_TOKEN_PATTERN.test(token)) return false;
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const digest = tokenDigest(token);

  return db.transaction(async tx => {
    const [verificationToken] = await tx
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, digest))
      .limit(1);
    if (
      !verificationToken ||
      verificationToken.isUsed ||
      new Date(verificationToken.expiresAt).getTime() <= Date.now()
    ) {
      return false;
    }

    const now = mysqlTimestamp(new Date());
    const claimResult = await tx
      .update(emailVerificationTokens)
      .set({ isUsed: 1, usedAt: now })
      .where(and(
        eq(emailVerificationTokens.id, verificationToken.id),
        eq(emailVerificationTokens.isUsed, 0),
        gt(emailVerificationTokens.expiresAt, now),
      ));
    const claimed = Number((claimResult[0] as ResultSetHeader).affectedRows || 0);
    if (claimed !== 1) return false;

    const userResult = await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(and(
        eq(users.id, verificationToken.userId),
        eq(users.email, verificationToken.email),
        eq(users.accountStatus, 'active'),
      ));
    const verified = Number((userResult[0] as ResultSetHeader).affectedRows || 0);
    if (verified !== 1) return false;

    await tx
      .update(emailVerificationTokens)
      .set({ isUsed: 1, usedAt: now })
      .where(and(
        eq(emailVerificationTokens.userId, verificationToken.userId),
        eq(emailVerificationTokens.isUsed, 0),
      ));
    return true;
  });
}

export async function markVerifiedIdentityProviderEmail(userId: number, email: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db
    .update(users)
    .set({ emailVerifiedAt: mysqlTimestamp(new Date()) })
    .where(and(
      eq(users.id, userId),
      eq(users.email, normalizeVerificationEmail(email)),
      eq(users.accountStatus, 'active'),
    ));
}
