import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { privacyHash } from './privacy-hash';

export const DUMMY_PASSWORD_HASH = '$2b$10$fVOwZcQWdzNR.ww5/4Zs6O1aDJp15eCjUebVOxs073z9y3b4gzofS';
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_EMAIL_ATTEMPT_LIMIT = 10;
export const LOGIN_IP_ATTEMPT_LIMIT = 20;

interface LoginAttemptRow extends RowDataPacket {
  attemptedAt: Date | string;
}

interface LoginLockRow extends RowDataPacket {
  acquired: number | null;
}

export interface LoginAttemptReservation {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: 'email' | 'ip';
}

export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}

function loginLockName(kind: 'email' | 'ip', fingerprint: string): string {
  const digest = createHash('sha256').update(fingerprint).digest('hex').slice(0, 44);
  return `login:${kind}:${digest}`;
}

function retryAfterSeconds(oldestAttempt: Date | string): number {
  const age = Date.now() - new Date(oldestAttempt).getTime();
  return Math.max(1, Math.ceil((LOGIN_WINDOW_MINUTES * 60_000 - age) / 1000));
}

/**
 * Reserves an attempt under per-email and per-IP MySQL named locks. Counting
 * before credential lookup prevents parallel guesses from racing past limits.
 */
export async function reserveLoginAttempt(data: {
  email: string;
  ipAddress: string;
}): Promise<LoginAttemptReservation> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  const emailHash = privacyHash(normalizeLoginEmail(data.email));
  const ipHash = privacyHash(data.ipAddress.slice(0, 45));
  const connection = await pool.getConnection();
  const lockNames = [
    loginLockName('email', emailHash),
    loginLockName('ip', ipHash),
  ].sort();
  const acquiredLocks: string[] = [];

  try {
    for (const lockName of lockNames) {
      const [rows] = await connection.execute<LoginLockRow[]>(
        'SELECT GET_LOCK(?, 3) AS acquired',
        [lockName],
      );
      if (Number(rows[0]?.acquired) !== 1) {
        throw new Error('Login rate-limit lock unavailable');
      }
      acquiredLocks.push(lockName);
    }

    const [emailAttempts] = await connection.execute<LoginAttemptRow[]>(
      `SELECT attempted_at AS attemptedAt
         FROM auth_login_attempts
        WHERE email_hash = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        ORDER BY attempted_at ASC`,
      [emailHash],
    );
    if (emailAttempts.length >= LOGIN_EMAIL_ATTEMPT_LIMIT) {
      return {
        allowed: false,
        reason: 'email',
        retryAfterSeconds: retryAfterSeconds(emailAttempts[0].attemptedAt),
      };
    }

    const [ipAttempts] = await connection.execute<LoginAttemptRow[]>(
      `SELECT attempted_at AS attemptedAt
         FROM auth_login_attempts
        WHERE ip_hash = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        ORDER BY attempted_at ASC`,
      [ipHash],
    );
    if (ipAttempts.length >= LOGIN_IP_ATTEMPT_LIMIT) {
      return {
        allowed: false,
        reason: 'ip',
        retryAfterSeconds: retryAfterSeconds(ipAttempts[0].attemptedAt),
      };
    }

    await connection.execute(
      'INSERT INTO auth_login_attempts (email_hash, ip_hash) VALUES (?, ?)',
      [emailHash, ipHash],
    );
    await connection.execute(
      'DELETE FROM auth_login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 1000',
    );
    return { allowed: true };
  } finally {
    for (const lockName of acquiredLocks.reverse()) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
    }
    connection.release();
  }
}

/** A correct password clears only that account fingerprint, never the IP history. */
export async function clearSuccessfulLoginAttempts(email: string): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');

  await pool.execute(
    'DELETE FROM auth_login_attempts WHERE email_hash = ?',
    [privacyHash(normalizeLoginEmail(email))],
  );
}
