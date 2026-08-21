import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../drizzle/schema';
import {
  createAuthSession,
  createUser,
  getDb,
  isAuthSessionActive,
  revokeAuthSession,
} from './db';
import { createSessionId } from './_core/session-security';

describe.skipIf(!process.env.DATABASE_URL)('server-side auth session registry (database integration)', () => {
  let userId = 0;

  beforeAll(async () => {
    const nonce = randomUUID();
    const user = await createUser({
      openId: `session-registry-${nonce}`,
      name: 'Session Registry Test',
      email: `session-registry-${nonce}@example.test`,
      loginMethod: 'email',
      role: 'user',
    });
    if (!user) throw new Error('Failed to create session-registry test user');
    userId = user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    const database = await getDb();
    if (database) await database.delete(users).where(eq(users.id, userId));
  });

  it('accepts a registered live session and rejects it immediately after logout', async () => {
    const sessionId = createSessionId();
    await createAuthSession(userId, sessionId, new Date(Date.now() + 60_000));

    expect(await isAuthSessionActive(userId, sessionId)).toBe(true);
    await revokeAuthSession(userId, sessionId);
    expect(await isAuthSessionActive(userId, sessionId)).toBe(false);
  });

  it('rejects an expired registered session', async () => {
    const sessionId = createSessionId();
    await createAuthSession(userId, sessionId, new Date(Date.now() - 1_000));

    expect(await isAuthSessionActive(userId, sessionId)).toBe(false);
  });

  it('binds a session id to exactly one user', async () => {
    const sessionId = createSessionId();
    await createAuthSession(userId, sessionId, new Date(Date.now() + 60_000));

    expect(await isAuthSessionActive(userId + 1, sessionId)).toBe(false);
  });
});
