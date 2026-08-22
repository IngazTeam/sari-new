import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { createIntegration, getPool } from './db';
import {
  authenticateZidWebhook,
  claimZidWebhook,
  completeZidWebhook,
  createZidBasicAuthorization,
  failZidWebhook,
  rotateZidWebhookCredentials,
} from './webhooks/zid-security';

describe.skipIf(!process.env.DATABASE_URL)('Zid webhook authentication and replay lifecycle (database integration)', () => {
  const createdUserIds: number[] = [];

  afterAll(async () => {
    const pool = await getPool();
    if (!pool || createdUserIds.length === 0) return;
    const placeholders = createdUserIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, createdUserIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
  });

  async function createActiveZidMerchant() {
    const nonce = randomUUID().replaceAll('-', '');
    const account = await registerMerchantAccount({
      name: 'Zid Webhook Test',
      email: `zid-webhook-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: 'Zid Webhook Test Store',
      phone: '+966500000004',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
    });
    createdUserIds.push(account.user.id);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute("UPDATE merchants SET status = 'active' WHERE id = ?", [account.merchantId]);
    await createIntegration({
      merchantId: account.merchantId,
      type: 'zid',
      storeName: 'Integration Test Store',
      storeUrl: 'https://example.zid.store',
      accessToken: `test-${nonce}`,
      settings: JSON.stringify({ syncOrders: true, managerToken: `manager-${nonce}` }),
    });
    return account;
  }

  it('rotates one-time Basic credentials and rejects missing, wrong, old, and cross-endpoint auth', async () => {
    const account = await createActiveZidMerchant();
    const first = await rotateZidWebhookCredentials(account.merchantId);
    const firstEndpoint = first.endpointPath.split('/').pop()!;
    const firstAuthorization = createZidBasicAuthorization(first.password);

    await expect(authenticateZidWebhook(firstEndpoint, undefined)).resolves.toBeNull();
    await expect(authenticateZidWebhook(firstEndpoint, createZidBasicAuthorization('wrong'))).resolves.toBeNull();
    await expect(authenticateZidWebhook('a'.repeat(48), firstAuthorization)).resolves.toBeNull();
    await expect(authenticateZidWebhook(firstEndpoint, firstAuthorization)).resolves.toEqual({
      merchantId: account.merchantId,
      policy: {
        valid: true,
        autoSync: true,
        syncProducts: true,
        syncOrders: true,
      },
    });

    const second = await rotateZidWebhookCredentials(account.merchantId);
    const secondEndpoint = second.endpointPath.split('/').pop()!;
    await expect(authenticateZidWebhook(firstEndpoint, firstAuthorization)).resolves.toBeNull();
    await expect(
      authenticateZidWebhook(secondEndpoint, createZidBasicAuthorization(second.password)),
    ).resolves.toEqual({
      merchantId: account.merchantId,
      policy: {
        valid: true,
        autoSync: true,
        syncProducts: true,
        syncOrders: true,
      },
    });
  });

  it('claims concurrent deliveries once, minimizes payload storage, and retries a failed receipt once', async () => {
    const account = await createActiveZidMerchant();
    const rawBody = Buffer.from(JSON.stringify({
      event: 'order.create',
      data: { id: `order-${randomUUID()}`, customer: { phone: '+966500000000' } },
    }));
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimZidWebhook({
      merchantId: account.merchantId,
      rawBody,
      eventType: 'order.create',
    })));
    expect(claims.filter(claim => claim.claimed)).toHaveLength(1);
    const receiptId = claims[0].receiptId;
    await completeZidWebhook(receiptId, claims[0].attemptCount);
    const replay = await claimZidWebhook({ merchantId: account.merchantId, rawBody, eventType: 'order.create' });
    expect(replay).toMatchObject({ claimed: false, previousStatus: 'processed' });

    const failedBody = Buffer.from(JSON.stringify({ event: 'product.update', data: { id: randomUUID() } }));
    const failed = await claimZidWebhook({
      merchantId: account.merchantId,
      rawBody: failedBody,
      eventType: 'product.update',
    });
    await failZidWebhook(failed.receiptId, failed.attemptCount);
    const retries = await Promise.all(Array.from({ length: 6 }, () => claimZidWebhook({
      merchantId: account.merchantId,
      rawBody: failedBody,
      eventType: 'product.update',
    })));
    expect(retries.filter(claim => claim.claimed)).toHaveLength(1);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute(
      `SELECT payload, attempt_count AS attemptCount, error_message AS errorMessage
         FROM zid_webhooks WHERE id = ?`,
      [failed.receiptId],
    );
    expect((rows as any[])[0]).toMatchObject({ payload: '{}', attemptCount: 2, errorMessage: null });
  });
});
