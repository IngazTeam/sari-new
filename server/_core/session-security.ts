import { createHmac, timingSafeEqual } from 'node:crypto';
import type { User } from '../../drizzle/schema';

export type SessionCredentialSubject = Pick<User, 'id' | 'openId' | 'password'>;

const SESSION_CREDENTIAL_DOMAIN = 'sari/session-credential/v1';
const SESSION_CREDENTIAL_VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Derive a one-way session version from the credential that currently owns the
 * account. A password change therefore revokes every token minted for the old
 * hash without putting the password hash itself inside the JWT.
 */
export function deriveSessionCredentialVersion(
  user: SessionCredentialSubject,
  secret: string,
): string {
  const credential = user.password
    ? `password:${user.password}`
    : `openid:${user.openId}`;

  return createHmac('sha256', secret)
    .update(SESSION_CREDENTIAL_DOMAIN, 'utf8')
    .update('\0', 'utf8')
    .update(String(user.id), 'utf8')
    .update('\0', 'utf8')
    .update(credential, 'utf8')
    .digest('base64url');
}

export function isSessionCredentialVersion(value: unknown): value is string {
  return typeof value === 'string' && SESSION_CREDENTIAL_VERSION_PATTERN.test(value);
}

/**
 * Constant-time comparison prevents credential-version probing from becoming a
 * useful timing oracle. Invalid or legacy claims fail closed.
 */
export function sessionCredentialVersionMatches(
  actual: unknown,
  user: SessionCredentialSubject,
  secret: string,
): boolean {
  if (!isSessionCredentialVersion(actual)) return false;

  const expected = deriveSessionCredentialVersion(user, secret);
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');

  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}
