import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { createIntegration, getPool } from './db';
import { getValidZidApiCredentials } from './integrations/zid-token-manager';

describe.skipIf(!process.env.DATABASE_URL)('Zid token refresh lifecycle (database integration)', () => {
  const createdUserIds: number[] = [];
  const originalEnvironment = {
    FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY,
    ZID_CLIENT_ID: process.env.ZID_CLIENT_ID,
    ZID_CLIENT_SECRET: process.env.ZID_CLIENT_SECRET,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  };

  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = 'zid-refresh-test-encryption-key-32-bytes';
    process.env.ZID_CLIENT_ID = 'database-refresh-client';
    process.env.ZID_CLIENT_SECRET = 'database-refresh-client-secret';
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
      name: 'Zid Refresh Test',
      email: `zid-refresh-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: 'Zid Refresh Store',
      phone: '+966500000008',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
      merchantStatus: 'active',
    });
    createdUserIds.push(account.user.id);
    return account;
  }

  it('lets one of six concurrent callers rotate and all receive the new credentials', async () => {
    const account = await createMerchant();
    const nowMs = Date.now();
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      accessToken: 'old-authorization-token',
      refreshToken: 'old-refresh-token-value',
      settings: JSON.stringify({
        managerToken: 'old-manager-token-value',
        tokenExpiresAt: new Date(nowMs - 60_000).toISOString(),
      }),
    });
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      Authorization: 'new-authorization-token',
      access_token: 'new-manager-token-value',
      refresh_token: 'new-refresh-token-value',
      expires_in: 3600,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    const credentials = await Promise.all(Array.from({ length: 6 }, () => getValidZidApiCredentials({
      merchantId: account.merchantId,
      fetchImpl: mockFetch,
      nowMs,
    })));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(credentials).toHaveLength(6);
    expect(credentials.every(value => value.authorizationToken === 'new-authorization-token')).toBe(true);
    expect(credentials.every(value => value.managerToken === 'new-manager-token-value')).toBe(true);
    expect(credentials.every(value => value.refreshToken === 'new-refresh-token-value')).toBe(true);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute(
      "SELECT access_token AS accessToken, refresh_token AS refreshToken, settings FROM platform_integrations WHERE merchant_id = ? AND platform_type = 'zid'",
      [account.merchantId],
    );
    const raw = (rows as any[])[0];
    expect(raw.accessToken).toMatch(/^enc:v1:/);
    expect(raw.refreshToken).toMatch(/^enc:v1:/);
    expect(JSON.parse(raw.settings).managerToken).toMatch(/^enc:v1:/);
  });

  it('does not refresh a non-expiring manual connection', async () => {
    const account = await createMerchant();
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      accessToken: 'manual-authorization-token',
      settings: JSON.stringify({ managerToken: 'manual-manager-token-value' }),
    });
    const mockFetch = vi.fn() as unknown as typeof fetch;
    await expect(getValidZidApiCredentials({
      merchantId: account.merchantId,
      fetchImpl: mockFetch,
    })).resolves.toMatchObject({
      authorizationToken: 'manual-authorization-token',
      managerToken: 'manual-manager-token-value',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails closed when an expired connection has no refresh token', async () => {
    const account = await createMerchant();
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      accessToken: 'expired-authorization-token',
      settings: JSON.stringify({
        managerToken: 'expired-manager-token-value',
        tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    });
    await expect(getValidZidApiCredentials({ merchantId: account.merchantId })).rejects.toThrow(
      'ZID_REAUTH_REQUIRED',
    );
  });
});
