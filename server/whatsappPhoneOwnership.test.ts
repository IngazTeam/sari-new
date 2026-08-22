import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createWhatsAppInstance,
  getPool,
  setWhatsAppInstanceAsPrimary,
  updateWhatsAppInstance,
} from './db';
import { WhatsAppPhoneOwnershipConflictError } from './channels/whatsapp/instance-ownership';

const TEST_PREFIX = 'ci-wa-own-';

async function cleanup() {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  await pool.execute('DELETE FROM users WHERE openId LIKE ?', [`${TEST_PREFIX}%`]);
}

async function createMerchant(label: string): Promise<number> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const suffix = `${label}-${crypto.randomUUID().slice(0, 12)}`;
  const [userResult] = await pool.execute<any>(
    `INSERT INTO users (openId, name, email, loginMethod, role, account_status)
     VALUES (?, ?, ?, 'local', 'user', 'active')`,
    [`${TEST_PREFIX}${suffix}`, 'WA ownership contract', `${TEST_PREFIX}${suffix}@example.test`],
  );
  const [merchantResult] = await pool.execute<any>(
    `INSERT INTO merchants (userId, businessName, status)
     VALUES (?, ?, 'active')`,
    [Number(userResult.insertId), `${TEST_PREFIX}${suffix}`],
  );
  return Number(merchantResult.insertId);
}

async function createInstance(
  merchantId: number,
  label: string,
  phoneNumber: string,
  status: 'active' | 'pending' = 'active',
) {
  const instance = await createWhatsAppInstance({
    merchantId,
    provider: 'mock',
    instanceId: `${TEST_PREFIX}${label}-${crypto.randomUUID().slice(0, 12)}`,
    token: `test-token-${label}`,
    apiUrl: 'https://example.test',
    phoneNumber,
    status,
    isPrimary: 0,
  });
  if (!instance) throw new Error('Failed to create test instance');
  return instance;
}

describe.skipIf(!process.env.DATABASE_URL)('WhatsApp phone ownership (MySQL integration)', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('admits only one concurrent create across canonical phone formats', async () => {
    const [merchantA, merchantB] = await Promise.all([
      createMerchant('create-a'),
      createMerchant('create-b'),
    ]);
    const results = await Promise.allSettled([
      createInstance(merchantA, 'create-a', '+966 50-111-2233'),
      createInstance(merchantB, 'create-b', '00966501112233'),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WhatsAppPhoneOwnershipConflictError);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute<any[]>(
      `SELECT merchant_id AS merchantId
         FROM whatsapp_instances
        WHERE status = 'active'
          AND REGEXP_REPLACE(phone_number, '[^0-9]', '') IN ('966501112233', '00966501112233')`,
    );
    expect(rows).toHaveLength(1);
  });

  it('admits only one concurrent activation and never mutates the loser', async () => {
    const [merchantA, merchantB] = await Promise.all([
      createMerchant('update-a'),
      createMerchant('update-b'),
    ]);
    const [instanceA, instanceB] = await Promise.all([
      createInstance(merchantA, 'update-a', '+966 50 222 3344', 'pending'),
      createInstance(merchantB, 'update-b', '00966502223344', 'pending'),
    ]);

    const results = await Promise.allSettled([
      updateWhatsAppInstance(instanceA.id, { status: 'active' }),
      updateWhatsAppInstance(instanceB.id, { status: 'active' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WhatsAppPhoneOwnershipConflictError);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute<any[]>(
      `SELECT id, status, is_primary AS isPrimary
         FROM whatsapp_instances
        WHERE id IN (?, ?)
        ORDER BY id`,
      [instanceA.id, instanceB.id],
    );
    expect(rows.filter(row => row.status === 'active')).toHaveLength(1);
    expect(rows.filter(row => row.status === 'pending')).toHaveLength(1);
  });

  it('serializes primary selection and rejects tenant reassignment through update', async () => {
    const merchantId = await createMerchant('primary');
    const otherMerchantId = await createMerchant('primary-other');
    const [first, second] = await Promise.all([
      createInstance(merchantId, 'primary-a', '+966503334455'),
      createInstance(merchantId, 'primary-b', '+966503334466'),
    ]);

    await Promise.all([
      setWhatsAppInstanceAsPrimary(first.id, merchantId),
      setWhatsAppInstanceAsPrimary(second.id, merchantId),
    ]);
    await expect(updateWhatsAppInstance(first.id, { merchantId: otherMerchantId } as any))
      .rejects.toThrow('Invalid WhatsApp instance update');

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute<any[]>(
      `SELECT id, merchant_id AS merchantId, is_primary AS isPrimary
         FROM whatsapp_instances
        WHERE merchant_id = ? AND status = 'active'`,
      [merchantId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter(row => Number(row.isPrimary) === 1)).toHaveLength(1);
    expect(rows.every(row => Number(row.merchantId) === merchantId)).toBe(true);
  });
});
