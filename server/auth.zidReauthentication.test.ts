import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { privacyHash } from './accounts/privacy-hash';
import { createAuthSession, getPool } from './db';
import { assertRecentReauthentication } from './security/reauthentication';

describe.skipIf(!process.env.DATABASE_URL)('Zid sensitive-action reauthentication (database integration)', () => {
  const createdUsers: Array<{ id: number; email: string }> = [];
  const password = 'ValidPassword123!';

  afterAll(async () => {
    const pool = await getPool();
    if (!pool || createdUsers.length === 0) return;
    for (const user of createdUsers) {
      await pool.execute('DELETE FROM auth_login_attempts WHERE email_hash = ?', [privacyHash(user.email)]);
    }
    const ids = createdUsers.map(user => user.id);
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, ids);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
  });

  async function createAccount() {
    const nonce = randomUUID().replaceAll('-', '');
    const email = `zid-reauth-${nonce}@example.test`;
    const account = await registerMerchantAccount({
      name: 'Zid Reauthentication Test',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      businessName: 'Zid Reauthentication Store',
      phone: '+966500000008',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
      merchantStatus: 'active',
    });
    createdUsers.push({ id: account.user.id, email });
    const sessionId = randomBytes(32).toString('hex');
    await createAuthSession(account.user.id, sessionId, new Date(Date.now() + 60 * 60_000));
    return { ...account, email, sessionId };
  }

  async function ageSession(userId: number): Promise<void> {
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(
      'UPDATE auth_sessions SET created_at = DATE_SUB(NOW(), INTERVAL 6 MINUTE) WHERE user_id = ?',
      [userId],
    );
  }

  it('accepts a freshly minted session, then requires and verifies the current password', async () => {
    const account = await createAccount();
    const base = {
      userId: account.user.id,
      sessionId: account.sessionId,
      ipAddress: '203.0.113.8',
    };
    await expect(assertRecentReauthentication(base)).resolves.toBeUndefined();
    await ageSession(account.user.id);
    await expect(assertRecentReauthentication(base)).rejects.toMatchObject({ code: 'required' });
    await expect(assertRecentReauthentication({ ...base, password: 'WrongPassword123!' }))
      .rejects.toMatchObject({ code: 'failed' });
    await expect(assertRecentReauthentication({ ...base, password })).resolves.toBeUndefined();

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [attempts] = await pool.execute(
      'SELECT id FROM auth_login_attempts WHERE email_hash = ?',
      [privacyHash(account.email)],
    );
    expect(attempts).toHaveLength(0);
  });

  it('rejects a session owned by a different account or an unknown session', async () => {
    const owner = await createAccount();
    const other = await createAccount();
    await expect(assertRecentReauthentication({
      userId: other.user.id,
      sessionId: owner.sessionId,
      ipAddress: '203.0.113.9',
    })).rejects.toMatchObject({ code: 'invalid_session' });
    await expect(assertRecentReauthentication({
      userId: owner.user.id,
      sessionId: randomBytes(32).toString('hex'),
      ipAddress: '203.0.113.9',
    })).rejects.toMatchObject({ code: 'invalid_session' });
  });

  it('blocks password guessing after the distributed account limit', async () => {
    const account = await createAccount();
    await ageSession(account.user.id);
    const base = {
      userId: account.user.id,
      sessionId: account.sessionId,
      ipAddress: '203.0.113.10',
      password: 'WrongPassword123!',
    };
    for (let index = 0; index < 10; index += 1) {
      await expect(assertRecentReauthentication(base)).rejects.toMatchObject({ code: 'failed' });
    }
    await expect(assertRecentReauthentication(base)).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
