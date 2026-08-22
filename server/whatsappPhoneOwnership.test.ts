import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createWhatsAppInstance,
  deleteWhatsAppInstance,
  getPool,
  markWhatsAppInstanceExpired,
  setWhatsAppInstanceAsPrimary,
  updateWhatsAppInstance,
} from './db';
import {
  activeWhatsAppPhoneIdentityHash,
  WhatsAppPhoneOwnershipConflictError,
} from './channels/whatsapp/instance-ownership';
import { mutateRestWhatsAppInstance } from './api/instance-lifecycle';

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

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('WhatsApp connection-affinity timeout')), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  it('rejects a conflicting active owner even when SQL bypasses application locks', async () => {
    const merchantA = await createMerchant('db-unique-a');
    const merchantB = await createMerchant('db-unique-b');
    const phoneNumber = '+966504445566';
    await createInstance(merchantA, 'db-unique-a', phoneNumber);
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');

    await expect(pool.execute(
      `INSERT INTO whatsapp_instances (
         merchant_id, provider, instance_id, token, phone_number,
         active_phone_identity_hash, status, is_primary
       ) VALUES (?, 'mock', ?, 'direct-sql-token', ?, ?, 'active', 0)`,
      [
        merchantB,
        `${TEST_PREFIX}db-bypass-${crypto.randomUUID().slice(0, 12)}`,
        '00966504445566',
        activeWhatsAppPhoneIdentityHash(phoneNumber),
      ],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('releases merchant and phone locks after a transaction failure so retry succeeds', async () => {
    const merchantA = await createMerchant('failure-owner');
    const merchantB = await createMerchant('failure-retry');
    const duplicateInstanceId = `${TEST_PREFIX}failure-${crypto.randomUUID().slice(0, 12)}`;
    const first = await createWhatsAppInstance({
      merchantId: merchantA,
      provider: 'mock',
      instanceId: duplicateInstanceId,
      token: 'test-token-failure-owner',
      apiUrl: 'https://example.test',
      phoneNumber: '+966505556677',
      status: 'active',
      isPrimary: 0,
    });
    expect(first).toBeDefined();

    const retryPhone = '+966505556688';
    await expect(createWhatsAppInstance({
      merchantId: merchantB,
      provider: 'mock',
      instanceId: duplicateInstanceId,
      token: 'test-token-failed-insert',
      apiUrl: 'https://example.test',
      phoneNumber: retryPhone,
      status: 'active',
      isPrimary: 0,
    })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await expect(createWhatsAppInstance({
      merchantId: merchantB,
      provider: 'mock',
      instanceId: `${TEST_PREFIX}failure-retry-${crypto.randomUUID().slice(0, 12)}`,
      token: 'test-token-successful-retry',
      apiUrl: 'https://example.test',
      phoneNumber: retryPhone,
      status: 'active',
      isPrimary: 0,
    })).resolves.toMatchObject({ merchantId: merchantB, status: 'active' });
  });

  it('uses the lock-owning connection when only one pool slot remains', async () => {
    const merchantId = await createMerchant('connection-affinity');
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const heldConnections = await Promise.all(
      Array.from({ length: 24 }, () => pool.getConnection()),
    );
    const operation = createWhatsAppInstance({
      merchantId,
      provider: 'mock',
      instanceId: `${TEST_PREFIX}affinity-${crypto.randomUUID().slice(0, 12)}`,
      token: 'test-token-connection-affinity',
      apiUrl: 'https://example.test',
      phoneNumber: '+966505556699',
      status: 'active',
      isPrimary: 0,
    });

    let result;
    let timeoutError: unknown;
    try {
      result = await within(operation, 3_000);
    } catch (error) {
      timeoutError = error;
    } finally {
      for (const connection of heldConnections) connection.release();
    }
    await operation.catch(() => undefined);
    if (timeoutError) throw timeoutError;
    expect(result).toMatchObject({ merchantId, status: 'active' });
  });

  it('serializes primary deletion and expiry and promotes the final active instance', async () => {
    const merchantId = await createMerchant('primary-failover');
    const [first, second, third] = await Promise.all([
      createInstance(merchantId, 'failover-a', '+966505556701'),
      createInstance(merchantId, 'failover-b', '+966505556702'),
      createInstance(merchantId, 'failover-c', '+966505556703'),
    ]);
    await setWhatsAppInstanceAsPrimary(first.id, merchantId);

    await Promise.all([
      deleteWhatsAppInstance(first.id),
      markWhatsAppInstanceExpired(second.id),
    ]);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute<any[]>(
      `SELECT id, status, is_primary AS isPrimary, active_phone_identity_hash AS activePhoneIdentityHash
         FROM whatsapp_instances
        WHERE merchant_id = ?
        ORDER BY id`,
      [merchantId],
    );
    expect(rows.find(row => Number(row.id) === first.id)).toBeUndefined();
    expect(rows.find(row => Number(row.id) === second.id)).toMatchObject({
      status: 'expired',
      isPrimary: 0,
      activePhoneIdentityHash: null,
    });
    expect(rows.find(row => Number(row.id) === third.id)).toMatchObject({
      status: 'active',
      isPrimary: 1,
    });
    expect(rows.filter(row => row.status === 'active')).toHaveLength(1);
    expect(rows.filter(row => row.status === 'active' && Number(row.isPrimary) === 1)).toHaveLength(1);
  });

  it('elects the first active instance and repairs a zero-primary REST transition', async () => {
    const merchantId = await createMerchant('primary-invariant');
    const first = await createInstance(merchantId, 'invariant-a', '+966505556711');
    expect(first.isPrimary).toBe(1);
    const second = await createInstance(merchantId, 'invariant-b', '+966505556712');
    expect(second.isPrimary).toBe(0);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      'UPDATE whatsapp_instances SET is_primary = 0 WHERE merchant_id = ?',
      [merchantId],
    );
    await expect(mutateRestWhatsAppInstance(merchantId, first.id, { isActive: false }))
      .resolves.toMatchObject({ kind: 'updated', instance: { status: 'inactive', isPrimary: false } });

    const [rows] = await pool.execute<any[]>(
      `SELECT id, status, is_primary AS isPrimary
         FROM whatsapp_instances
        WHERE merchant_id = ?
        ORDER BY id`,
      [merchantId],
    );
    expect(rows.filter(row => row.status === 'active')).toHaveLength(1);
    expect(rows.find(row => Number(row.id) === second.id)).toMatchObject({
      status: 'active',
      isPrimary: 1,
    });
    expect(rows.filter(row => row.status === 'active' && Number(row.isPrimary) === 1)).toHaveLength(1);
  });

  it('rejects direct SQL attempts to create a second active primary or an inactive primary', async () => {
    const merchantId = await createMerchant('primary-db-constraint');
    const first = await createInstance(merchantId, 'primary-db-a', '+966505556721');
    const second = await createInstance(merchantId, 'primary-db-b', '+966505556722');
    expect(first.isPrimary).toBe(1);
    expect(second.isPrimary).toBe(0);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await expect(pool.execute(
      'UPDATE whatsapp_instances SET is_primary = 1 WHERE id = ?',
      [second.id],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await expect(pool.execute(
      "UPDATE whatsapp_instances SET status = 'inactive' WHERE id = ?",
      [first.id],
    )).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await expect(pool.execute(
      'UPDATE whatsapp_instances SET is_primary = 2 WHERE id = ?',
      [second.id],
    )).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

    const [rows] = await pool.execute<any[]>(
      `SELECT id, status, is_primary AS isPrimary
         FROM whatsapp_instances
        WHERE merchant_id = ?
        ORDER BY id`,
      [merchantId],
    );
    expect(rows.filter(row => row.status === 'active')).toHaveLength(2);
    expect(rows.filter(row => row.status === 'active' && Number(row.isPrimary) === 1)).toHaveLength(1);
  });
});
