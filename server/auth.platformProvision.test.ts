import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { privacyHashExact } from './accounts/privacy-hash';
import { getPool } from './db';

describe.skipIf(!process.env.DATABASE_URL)('platform provisioning lifecycle (database integration)', () => {
  const createdUserIds: number[] = [];

  afterAll(async () => {
    const pool = await getPool();
    if (!pool || createdUserIds.length === 0) return;
    const placeholders = createdUserIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, createdUserIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
  });

  function registrationInput(overrides: Partial<Parameters<typeof registerMerchantAccount>[0]> = {}) {
    const nonce = randomUUID().replaceAll('-', '');
    return {
      name: 'Byaan Provision Test',
      email: `platform-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: 'Byaan Test Academy',
      phone: '+966500000001',
      acceptedTerms: true as const,
      acceptedPrivacy: true as const,
      marketingConsent: false,
      ipAddress: '203.0.113.90',
      userAgent: 'sari-platform-integration-test',
      registrationSource: 'byaan_provision' as const,
      merchantStatus: 'active' as const,
      platformType: 'byaan' as const,
      integrationSource: 'byaan',
      provisionIdempotencyHash: privacyHashExact(`byaan\0${nonce}`),
      provisionPayloadHash: privacyHashExact(`payload\0${nonce}`),
      provisionTenantDomain: `${nonce}.example.test`,
      ...overrides,
    };
  }

  it('atomically creates the complete merchant graph and versioned receipts', async () => {
    const input = registrationInput();
    const registration = await registerMerchantAccount(input);
    createdUserIds.push(registration.user.id);
    expect(registration.user).not.toHaveProperty('password');

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute(
      `SELECT u.id AS userId, m.id AS merchantId, m.status, m.platform_type AS platformType,
              m.integration_source AS integrationSource,
              m.provision_idempotency_hash AS idempotencyHash,
              m.provision_payload_hash AS payloadHash,
              mm.role AS memberRole, mm.is_active AS memberActive,
              ms.id AS subscriptionId, ms.status AS subscriptionStatus,
              m.current_subscription_id AS currentSubscriptionId
         FROM users u
         INNER JOIN merchants m ON m.userId = u.id
         INNER JOIN merchant_members mm ON mm.merchant_id = m.id AND mm.user_id = u.id
         INNER JOIN merchant_subscriptions ms ON ms.merchant_id = m.id
        WHERE u.id = ?`,
      [registration.user.id],
    );
    expect((rows as any[])).toHaveLength(1);
    expect((rows as any[])[0]).toMatchObject({
      merchantId: registration.merchantId,
      status: 'active',
      platformType: 'byaan',
      integrationSource: 'byaan',
      idempotencyHash: input.provisionIdempotencyHash,
      payloadHash: input.provisionPayloadHash,
      memberRole: 'owner',
      memberActive: 1,
      subscriptionStatus: 'trial',
    });
    expect((rows as any[])[0].currentSubscriptionId).toBe((rows as any[])[0].subscriptionId);

    const [connections] = await pool.execute(
      `SELECT tenant_domain AS tenantDomain, sync_status AS syncStatus, is_active AS isActive
         FROM byaan_connections WHERE merchant_id = ?`,
      [registration.merchantId],
    );
    expect(connections as any[]).toEqual([{
      tenantDomain: input.provisionTenantDomain,
      syncStatus: 'pending_verification',
      isActive: 0,
    }]);

    const [receipts] = await pool.execute(
      `SELECT consent_type AS consentType, granted, source
         FROM consent_receipts WHERE user_id = ? ORDER BY consent_type`,
      [registration.user.id],
    );
    expect(receipts as any[]).toHaveLength(3);
    expect((receipts as any[]).every(receipt => receipt.source === 'byaan_provision')).toBe(true);
    expect((receipts as any[]).find(receipt => receipt.consentType === 'terms')?.granted).toBe(1);
    expect((receipts as any[]).find(receipt => receipt.consentType === 'privacy')?.granted).toBe(1);
    expect((receipts as any[]).find(receipt => receipt.consentType === 'marketing')?.granted).toBe(0);
  });

  it('enforces exactly-once provisioning and rolls back the losing account graph', async () => {
    const nonce = randomUUID().replaceAll('-', '');
    const provisionIdempotencyHash = privacyHashExact(`byaan\0shared-${nonce}`);
    const provisionPayloadHash = privacyHashExact(`payload\0shared-${nonce}`);
    const first = registrationInput({
      email: `platform-race-a-${nonce}@example.test`,
      provisionIdempotencyHash,
      provisionPayloadHash,
    });
    const second = registrationInput({
      email: `platform-race-b-${nonce}@example.test`,
      provisionIdempotencyHash,
      provisionPayloadHash,
    });

    const results = await Promise.allSettled([
      registerMerchantAccount(first),
      registerMerchantAccount(second),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof registerMerchantAccount>>> =>
        result.status === 'fulfilled',
    );
    if (!winner) throw new Error('Expected one successful provision');
    createdUserIds.push(winner.value.user.id);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email IN (?, ?)',
      [first.email, second.email],
    );
    expect(users as any[]).toHaveLength(1);
    const [merchants] = await pool.execute(
      'SELECT id FROM merchants WHERE provision_idempotency_hash = ?',
      [provisionIdempotencyHash],
    );
    expect(merchants as any[]).toHaveLength(1);
  });

  it('atomically reserves a Byaan tenant and leaves no losing user graph', async () => {
    const nonce = randomUUID().replaceAll('-', '');
    const tenantDomain = `shared-${nonce}.example.test`;
    const first = registrationInput({
      email: `tenant-race-a-${nonce}@example.test`,
      provisionTenantDomain: tenantDomain,
    });
    const second = registrationInput({
      email: `tenant-race-b-${nonce}@example.test`,
      provisionTenantDomain: tenantDomain,
    });

    const results = await Promise.allSettled([
      registerMerchantAccount(first),
      registerMerchantAccount(second),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof registerMerchantAccount>>> =>
        result.status === 'fulfilled',
    );
    if (!winner) throw new Error('Expected one tenant reservation winner');
    createdUserIds.push(winner.value.user.id);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email IN (?, ?)',
      [first.email, second.email],
    );
    expect(users as any[]).toHaveLength(1);
    const [connections] = await pool.execute(
      'SELECT merchant_id FROM byaan_connections WHERE tenant_domain = ?',
      [tenantDomain],
    );
    expect(connections as any[]).toHaveLength(1);
  });
});
