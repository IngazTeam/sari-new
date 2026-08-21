import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { emailVerificationTokens, users } from '../drizzle/schema';
import {
  consumeEmailVerificationToken,
  EMAIL_VERIFICATION_USER_LIMIT,
  issueEmailVerificationToken,
} from './accounts/email-verification-security';
import { privacyHash } from './accounts/privacy-hash';
import { createUser, getDb, getUserById } from './db';

describe.skipIf(!process.env.DATABASE_URL)('email verification security (database integration)', () => {
  const createdUserIds: number[] = [];

  async function createTestIdentity() {
    const nonce = randomUUID().replaceAll('-', '');
    const email = `verify-${nonce}@example.test`;
    const user = await createUser({
      openId: `verify_${nonce}`,
      name: 'Verification Test',
      email,
      password: 'not-a-login-hash',
      loginMethod: 'email',
      role: 'user',
    });
    if (!user) throw new Error('Failed to create verification test user');
    createdUserIds.push(user.id);
    return { user, email };
  }

  beforeEach(async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    await database.delete(emailVerificationTokens);
  });

  afterAll(async () => {
    const database = await getDb();
    if (!database) return;
    await database.delete(emailVerificationTokens);
    if (createdUserIds.length > 0) {
      await database.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it('stores only token and IP fingerprints and invalidates the previous live link', async () => {
    const { user, email } = await createTestIdentity();
    const ipAddress = '203.0.113.80';
    const first = await issueEmailVerificationToken({ userId: user.id, email, ipAddress });
    const second = await issueEmailVerificationToken({ userId: user.id, email, ipAddress });
    if (!first.allowed || first.alreadyVerified || !second.allowed || second.alreadyVerified) {
      throw new Error('Expected two issued tokens');
    }

    const database = await getDb();
    if (!database) throw new Error('Database not initialized');
    const records = await database.select().from(emailVerificationTokens);
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain(first.token);
    expect(JSON.stringify(records)).not.toContain(ipAddress);
    expect(records[0].requestIpHash).toBe(privacyHash(ipAddress));
    expect(records.map(record => record.tokenHash)).toContain(
      createHash('sha256').update(second.token).digest('hex'),
    );
    expect(records.filter(record => !record.isUsed)).toHaveLength(1);
  });

  it('serializes concurrent sends and admits exactly the per-user limit', async () => {
    const { user, email } = await createTestIdentity();
    const results = await Promise.all(
      Array.from({ length: EMAIL_VERIFICATION_USER_LIMIT + 2 }, () => issueEmailVerificationToken({
        userId: user.id,
        email,
        ipAddress: '203.0.113.81',
      })),
    );

    expect(results.filter(result => result.allowed)).toHaveLength(EMAIL_VERIFICATION_USER_LIMIT);
    expect(results.filter(result => !result.allowed && result.reason === 'user')).toHaveLength(2);
  });

  it('allows only one concurrent consumer and records verified ownership', async () => {
    const { user, email } = await createTestIdentity();
    const issued = await issueEmailVerificationToken({
      userId: user.id,
      email,
      ipAddress: '203.0.113.82',
    });
    if (!issued.allowed || issued.alreadyVerified) throw new Error('Expected an issued token');

    const results = await Promise.allSettled([
      consumeEmailVerificationToken(issued.token),
      consumeEmailVerificationToken(issued.token),
    ]);
    const successfulClaims = results.filter(
      (result): result is PromiseFulfilledResult<boolean> => result.status === 'fulfilled' && result.value,
    );
    expect(successfulClaims).toHaveLength(1);
    expect((await getUserById(user.id))?.emailVerifiedAt).toBeTruthy();
    expect(await consumeEmailVerificationToken(issued.token)).toBe(false);
  });

  it('refuses to issue a token for an address not owned by the authenticated account', async () => {
    const { user } = await createTestIdentity();
    await expect(issueEmailVerificationToken({
      userId: user.id,
      email: 'attacker@example.test',
      ipAddress: '203.0.113.83',
    })).rejects.toThrow('identity mismatch');
  });
});
