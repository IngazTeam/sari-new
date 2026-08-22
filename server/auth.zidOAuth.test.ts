import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { privacyHashExact } from './accounts/privacy-hash';
import { getPool } from './db';
import { beginZidOAuth, consumeZidOAuthState } from './integrations/zid-oauth';

describe.skipIf(!process.env.DATABASE_URL)('Zid OAuth state lifecycle (database integration)', () => {
  const createdUserIds: number[] = [];
  const originalEnvironment = {
    ZID_CLIENT_ID: process.env.ZID_CLIENT_ID,
    ZID_CLIENT_SECRET: process.env.ZID_CLIENT_SECRET,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  };

  beforeAll(() => {
    process.env.ZID_CLIENT_ID = 'database-test-client-id';
    process.env.ZID_CLIENT_SECRET = 'database-test-client-secret';
    process.env.PUBLIC_APP_URL = 'https://sary.live';
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const pool = await getPool();
    if (!pool || createdUserIds.length === 0) return;
    const placeholders = createdUserIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, createdUserIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
  });

  async function createMerchant() {
    const nonce = randomUUID().replaceAll('-', '');
    const account = await registerMerchantAccount({
      name: 'Zid OAuth Test',
      email: `zid-oauth-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: 'Zid OAuth Test Store',
      phone: '+966500000006',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
      merchantStatus: 'active',
    });
    createdUserIds.push(account.user.id);
    return account;
  }

  function stateFrom(authorizationUrl: string): string {
    const parsed = new URL(authorizationUrl);
    expect(parsed.origin + parsed.pathname).toBe('https://oauth.zid.sa/oauth/authorize');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://sary.live/merchant/zid/callback');
    return parsed.searchParams.get('state')!;
  }

  it('stores digests, rejects the wrong session, and consumes the correct state once', async () => {
    const account = await createMerchant();
    const sessionId = randomUUID();
    const { authorizationUrl } = await beginZidOAuth({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
    });
    const state = stateFrom(authorizationUrl);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute(
      'SELECT state_hash AS stateHash, session_hash AS sessionHash FROM zid_oauth_states WHERE merchant_id = ?',
      [account.merchantId],
    );
    expect((rows as any[])[0].stateHash).toBe(privacyHashExact(`zid-oauth-state:${state}`));
    expect((rows as any[])[0].stateHash).not.toContain(state);
    expect((rows as any[])[0].sessionHash).not.toContain(sessionId);

    await expect(consumeZidOAuthState({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId: 'wrong-session',
      state,
    })).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(consumeZidOAuthState({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
      state,
    })).resolves.toBeUndefined();
    await expect(consumeZidOAuthState({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
      state,
    })).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('rate-limits immediate restarts, then replaces prior attempts after the cooldown', async () => {
    const owner = await createMerchant();
    const other = await createMerchant();
    const sessionId = randomUUID();
    const firstState = stateFrom((await beginZidOAuth({
      merchantId: owner.merchantId,
      userId: owner.user.id,
      sessionId,
    })).authorizationUrl);
    await expect(beginZidOAuth({
      merchantId: owner.merchantId,
      userId: owner.user.id,
      sessionId,
    })).rejects.toMatchObject({ code: 'rate_limited' });
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      'UPDATE zid_oauth_states SET created_at = DATE_SUB(NOW(), INTERVAL 11 SECOND) WHERE merchant_id = ?',
      [owner.merchantId],
    );
    const secondState = stateFrom((await beginZidOAuth({
      merchantId: owner.merchantId,
      userId: owner.user.id,
      sessionId,
    })).authorizationUrl);
    expect(secondState).not.toBe(firstState);
    await expect(consumeZidOAuthState({
      merchantId: owner.merchantId,
      userId: owner.user.id,
      sessionId,
      state: firstState,
    })).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(consumeZidOAuthState({
      merchantId: other.merchantId,
      userId: other.user.id,
      sessionId,
      state: secondState,
    })).rejects.toMatchObject({ code: 'invalid_state' });

    await pool.execute(
      'UPDATE zid_oauth_states SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE state_hash = ?',
      [privacyHashExact(`zid-oauth-state:${secondState}`)],
    );
    await expect(consumeZidOAuthState({
      merchantId: owner.merchantId,
      userId: owner.user.id,
      sessionId,
      state: secondState,
    })).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('allows exactly one winner when multiple servers start OAuth concurrently', async () => {
    const account = await createMerchant();
    const sessionId = randomUUID();
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => beginZidOAuth({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
    })));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(5);
    for (const result of attempts) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'rate_limited' });
    }
  });

  it('allows exactly one winner under concurrent callback replay', async () => {
    const account = await createMerchant();
    const sessionId = randomUUID();
    const state = stateFrom((await beginZidOAuth({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
    })).authorizationUrl);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => consumeZidOAuthState({
      merchantId: account.merchantId,
      userId: account.user.id,
      sessionId,
      state,
    })));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(5);
  });
});
