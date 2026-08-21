import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  processDueAccountDeletions,
  registerMerchantAccount,
  requestAccountDeletionByAdmin,
} from './accounts/lifecycle';
import { getPool } from './db';

describe.skipIf(!process.env.DATABASE_URL)('admin deletion lifecycle (database integration)', () => {
  const createdUserIds: number[] = [];
  let adminUserId: number | null = null;

  afterAll(async () => {
    const pool = await getPool();
    if (!pool) return;
    const userIds = [...createdUserIds, ...(adminUserId ? [adminUserId] : [])];
    if (adminUserId) {
      await pool.execute('DELETE FROM data_subject_requests WHERE handled_by_user_id = ?', [adminUserId]);
    }
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      await pool.execute(`DELETE FROM data_subject_requests WHERE user_id IN (${placeholders})`, userIds);
      await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, userIds);
      await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
    }
  });

  async function createAdmin(): Promise<number> {
    if (adminUserId) return adminUserId;
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const nonce = randomUUID().replaceAll('-', '');
    const [result] = await pool.execute(
      `INSERT INTO users
        (openId, name, email, loginMethod, role, account_status, email_verified_at)
       VALUES (?, 'Deletion Test Admin', ?, 'email', 'admin', 'active', NOW())`,
      [`admin-${nonce}`, `admin-${nonce}@example.test`],
    );
    adminUserId = Number((result as { insertId: number }).insertId);
    return adminUserId;
  }

  async function createAccount(label: string) {
    const nonce = randomUUID().replaceAll('-', '');
    const account = await registerMerchantAccount({
      name: `${label} Test`,
      email: `${label}-${nonce}@example.test`,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: `${label} Store`,
      phone: '+966500000003',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
    });
    createdUserIds.push(account.user.id);
    return account;
  }

  it('suspends atomically, revokes sessions, is idempotent, then lets only the worker complete', async () => {
    const adminId = await createAdmin();
    const target = await createAccount('admin-delete-target');
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      `INSERT INTO auth_sessions (user_id, token_id_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))`,
      [target.user.id, randomBytes(32).toString('hex')],
    );

    const first = await requestAccountDeletionByAdmin({
      merchantId: target.merchantId,
      adminUserId: adminId,
      confirmation: `DELETE-${target.merchantId}`,
      reasonCode: 'customer_request',
    });
    const replay = await requestAccountDeletionByAdmin({
      merchantId: target.merchantId,
      adminUserId: adminId,
      confirmation: `DELETE-${target.merchantId}`,
      reasonCode: 'customer_request',
    });
    expect(replay).toMatchObject({ id: first.id, alreadyScheduled: true });

    const [users] = await pool.execute(
      'SELECT account_status AS accountStatus, password FROM users WHERE id = ?',
      [target.user.id],
    );
    expect((users as any[])[0]).toMatchObject({ accountStatus: 'deletion_pending', password: null });
    const [merchants] = await pool.execute('SELECT status FROM merchants WHERE id = ?', [target.merchantId]);
    expect((merchants as any[])[0].status).toBe('suspended');
    const [sessions] = await pool.execute(
      'SELECT revoked_at AS revokedAt FROM auth_sessions WHERE user_id = ?',
      [target.user.id],
    );
    expect((sessions as any[])[0].revokedAt).toBeTruthy();
    const [requestsBefore] = await pool.execute(
      `SELECT status, handled_by_user_id AS handledByUserId, request_metadata AS requestMetadata
         FROM data_subject_requests WHERE id = ?`,
      [first.id],
    );
    const requestBefore = (requestsBefore as any[])[0];
    expect(requestBefore).toMatchObject({ status: 'pending', handledByUserId: adminId });
    expect(JSON.parse(requestBefore.requestMetadata)).toMatchObject({
      source: 'admin_console',
      reasonCode: 'customer_request',
      targetMerchantId: target.merchantId,
    });

    await pool.execute(
      'UPDATE data_subject_requests SET processing_scheduled_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
      [first.id],
    );
    const processed = await processDueAccountDeletions(10);
    expect(processed.processed).toBeGreaterThanOrEqual(1);
    const [deletedUsers] = await pool.execute('SELECT id FROM users WHERE id = ?', [target.user.id]);
    const [deletedMerchants] = await pool.execute('SELECT id FROM merchants WHERE id = ?', [target.merchantId]);
    expect(deletedUsers as any[]).toHaveLength(0);
    expect(deletedMerchants as any[]).toHaveLength(0);
    const [requestsAfter] = await pool.execute(
      'SELECT status, user_id AS userId FROM data_subject_requests WHERE id = ?',
      [first.id],
    );
    expect((requestsAfter as any[])[0]).toMatchObject({ status: 'completed', userId: null });
  });

  it('refuses scheduling while an active teammate still depends on the owner', async () => {
    const adminId = await createAdmin();
    const owner = await createAccount('shared-delete-owner');
    const teammate = await createAccount('shared-delete-member');
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      `INSERT INTO merchant_members
        (merchant_id, user_id, role, invited_by, invited_at, accepted_at, is_active)
       VALUES (?, ?, 'viewer', ?, NOW(), NOW(), 1)`,
      [owner.merchantId, teammate.user.id, owner.user.id],
    );

    await expect(requestAccountDeletionByAdmin({
      merchantId: owner.merchantId,
      adminUserId: adminId,
      confirmation: `DELETE-${owner.merchantId}`,
      reasonCode: 'legal_requirement',
    })).rejects.toThrow('MERCHANT_OWNERSHIP_TRANSFER_REQUIRED');

    const [users] = await pool.execute('SELECT account_status AS accountStatus FROM users WHERE id = ?', [owner.user.id]);
    expect((users as any[])[0].accountStatus).toBe('active');
    const [requests] = await pool.execute(
      `SELECT id FROM data_subject_requests
        WHERE user_id = ? AND request_type = 'deletion' AND status = 'pending'`,
      [owner.user.id],
    );
    expect(requests as any[]).toHaveLength(0);
  });
});
