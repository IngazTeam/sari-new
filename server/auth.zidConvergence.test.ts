import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { createIntegration, getPool } from './db';
import {
  createZidSettings,
  deleteAllZidConnections,
  getZidSettings,
} from './db_zid';
import { checkExistingIntegrations } from './integrations/platform-checker';

describe.skipIf(!process.env.DATABASE_URL)('Zid canonical/legacy convergence (database integration)', () => {
  const createdUserIds: number[] = [];
  const originalEncryptionKey = process.env.FIELD_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = 'zid-convergence-test-encryption-key-32-bytes';
  });

  afterAll(async () => {
    if (originalEncryptionKey === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
    else process.env.FIELD_ENCRYPTION_KEY = originalEncryptionKey;
    const pool = await getPool();
    if (!pool || createdUserIds.length === 0) return;
    const placeholders = createdUserIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, createdUserIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
  });

  async function createMerchant() {
    const nonce = randomUUID().replaceAll('-', '');
    const account = await registerMerchantAccount({
      name: 'Zid Convergence Test',
      email: `zid-convergence-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: 'Zid Convergence Store',
      phone: '+966500000007',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
      merchantStatus: 'active',
    });
    createdUserIds.push(account.user.id);
    return account;
  }

  it('encrypts legacy rows at rest while returning plaintext to server callers', async () => {
    const account = await createMerchant();
    await createZidSettings({
      merchantId: account.merchantId,
      clientId: 'legacy-client',
      clientSecret: 'legacy-client-secret-value',
      accessToken: 'legacy-manager-token-value',
      managerToken: 'legacy-authorization-token-value',
      refreshToken: 'legacy-refresh-token-value',
      isActive: 1,
    });
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rawRows] = await pool.execute(
      'SELECT client_secret, access_token, manager_token, refresh_token FROM zid_settings WHERE merchant_id = ?',
      [account.merchantId],
    );
    expect(Object.values((rawRows as any[])[0]).every(value => String(value).startsWith('enc:v1:'))).toBe(true);
    await expect(getZidSettings(account.merchantId)).resolves.toMatchObject({
      clientSecret: 'legacy-client-secret-value',
      accessToken: 'legacy-manager-token-value',
      managerToken: 'legacy-authorization-token-value',
      refreshToken: 'legacy-refresh-token-value',
    });
  });

  it('prefers canonical credentials, exposes the right token orientation, and detects Zid once', async () => {
    const account = await createMerchant();
    await createZidSettings({
      merchantId: account.merchantId,
      accessToken: 'stale-legacy-manager-token',
      managerToken: 'stale-legacy-authorization-token',
      isActive: 1,
    });
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      storeName: 'Canonical Zid Store',
      storeUrl: 'https://canonical.zid.store',
      accessToken: 'canonical-authorization-token',
      refreshToken: 'canonical-refresh-token',
      settings: JSON.stringify({
        managerToken: 'canonical-manager-token',
        syncProducts: true,
        syncOrders: true,
      }),
    });

    await expect(getZidSettings(account.merchantId)).resolves.toMatchObject({
      accessToken: 'canonical-manager-token',
      managerToken: 'canonical-authorization-token',
      refreshToken: 'canonical-refresh-token',
      clientSecret: null,
    });
    const platforms = await checkExistingIntegrations(account.merchantId);
    expect(platforms.filter(platform => platform.platform === 'zid')).toEqual([expect.objectContaining({
      storeUrl: 'https://canonical.zid.store',
    })]);
  });

  it('disconnects canonical and legacy records in one transaction', async () => {
    const account = await createMerchant();
    await createZidSettings({
      merchantId: account.merchantId,
      accessToken: 'legacy-manager-token-value',
      managerToken: 'legacy-authorization-token-value',
      isActive: 1,
    });
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      accessToken: 'canonical-authorization-token',
      settings: JSON.stringify({ managerToken: 'canonical-manager-token' }),
    });
    await deleteAllZidConnections(account.merchantId);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [legacy] = await pool.execute('SELECT id FROM zid_settings WHERE merchant_id = ?', [account.merchantId]);
    const [canonical] = await pool.execute(
      "SELECT id FROM platform_integrations WHERE merchant_id = ? AND platform_type = 'zid'",
      [account.merchantId],
    );
    expect(legacy as any[]).toHaveLength(0);
    expect(canonical as any[]).toHaveLength(0);
  });
});
