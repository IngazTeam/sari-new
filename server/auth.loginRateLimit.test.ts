import { beforeEach, describe, expect, it } from 'vitest';
import { authLoginAttempts } from '../drizzle/schema';
import {
  clearSuccessfulLoginAttempts,
  LOGIN_EMAIL_ATTEMPT_LIMIT,
  LOGIN_IP_ATTEMPT_LIMIT,
  reserveLoginAttempt,
} from './accounts/login-security';
import { privacyHash } from './accounts/privacy-hash';
import { getDb } from './db';

describe.skipIf(!process.env.DATABASE_URL)('distributed login rate limiting (database integration)', () => {
  beforeEach(async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    await database.delete(authLoginAttempts);
  });

  it('serializes concurrent guesses and admits exactly the email limit', async () => {
    const results = await Promise.all(
      Array.from({ length: LOGIN_EMAIL_ATTEMPT_LIMIT + 2 }, () => reserveLoginAttempt({
        email: 'Concurrent.Login@Example.Test',
        ipAddress: '203.0.113.10',
      })),
    );

    expect(results.filter(result => result.allowed)).toHaveLength(LOGIN_EMAIL_ATTEMPT_LIMIT);
    expect(results.filter(result => !result.allowed && result.reason === 'email')).toHaveLength(2);
  });

  it('enforces the IP limit across different account identities', async () => {
    for (let index = 0; index < LOGIN_IP_ATTEMPT_LIMIT; index += 1) {
      const result = await reserveLoginAttempt({
        email: `distributed-${index}@example.test`,
        ipAddress: '203.0.113.20',
      });
      expect(result.allowed).toBe(true);
    }

    const blocked = await reserveLoginAttempt({
      email: 'distributed-overflow@example.test',
      ipAddress: '203.0.113.20',
    });
    expect(blocked).toMatchObject({ allowed: false, reason: 'ip' });
  });

  it('stores only HMAC fingerprints and clears only the successful identity', async () => {
    const successfulEmail = 'Successful.Login@Example.Test';
    const otherEmail = 'other-login@example.test';
    const ipAddress = '203.0.113.30';
    await reserveLoginAttempt({ email: successfulEmail, ipAddress });
    await reserveLoginAttempt({ email: otherEmail, ipAddress });

    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const before = await database.select().from(authLoginAttempts);
    expect(before).toHaveLength(2);
    expect(JSON.stringify(before)).not.toContain(successfulEmail);
    expect(JSON.stringify(before)).not.toContain(ipAddress);
    expect(before.every(row => /^[a-f0-9]{64}$/.test(row.emailHash))).toBe(true);
    expect(before.every(row => /^[a-f0-9]{64}$/.test(row.ipHash))).toBe(true);

    await clearSuccessfulLoginAttempts(successfulEmail);
    const after = await database.select().from(authLoginAttempts);
    expect(after.some(row => row.emailHash === privacyHash(successfulEmail))).toBe(false);
    expect(after.some(row => row.emailHash === privacyHash(otherEmail))).toBe(true);
  });
});
