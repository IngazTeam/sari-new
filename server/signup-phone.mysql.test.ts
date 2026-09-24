import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import { getPool } from './db';
import { SignupConflictError } from './accounts/signup-errors';

describe.skipIf(!process.env.DATABASE_URL)('signup identity conflicts (isolated MySQL)', () => {
  const userIds: number[] = [];
  const makeInput = () => ({ name: 'Signup Field Test', businessName: 'Signup Field Fixture', email: `signup-fields-${randomUUID()}@example.test`, phone: `9665${randomInt(10000000, 99999999)}`, passwordHash: 'test-only-not-a-login-hash', acceptedTerms: true as const, acceptedPrivacy: true as const, marketingConsent: false });
  afterAll(async () => {
    const pool = await getPool();
    if (!pool || !userIds.length) return;
    const placeholders = userIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, userIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  });
  async function create(input: ReturnType<typeof makeInput>) {
    const created = await registerMerchantAccount(input);
    userIds.push(created.user.id);
    return created;
  }
  it('detects email and formatted phone together without creating a partial account', async () => {
    const original = makeInput();
    await create(original);
    for (const phone of [`+${original.phone}`, `00${original.phone}`, `0${original.phone.slice(3)}`]) {
      await expect(registerMerchantAccount({ ...original, email: original.email.toUpperCase(), phone })).rejects.toMatchObject({ fieldErrors: { email: 'emailUsed', phone: 'phoneUsed' } });
    }
    const pool = (await getPool())!;
    const [before] = await pool.execute<any[]>('SELECT COUNT(*) AS total FROM users');
    await expect(registerMerchantAccount({ ...makeInput(), phone: original.phone })).rejects.toMatchObject({ fieldErrors: { phone: 'phoneUsed' } });
    const [after] = await pool.execute<any[]>('SELECT COUNT(*) AS total FROM users');
    expect(after[0].total).toBe(before[0].total);
  });
  it('matches legacy formatting in stored merchant numbers', async () => {
    const original = makeInput(); const account = await create(original);
    const pool = (await getPool())!;
    for (const formatted of [`+${original.phone.slice(0, 3)} (${original.phone.slice(3, 5)}) ${original.phone.slice(5, 8)}-${original.phone.slice(8)}`, `00${original.phone}`, `0${original.phone.slice(3)}`]) {
      await pool.execute('UPDATE merchants SET phone = ? WHERE id = ?', [formatted, account.merchantId]);
      await expect(registerMerchantAccount({ ...makeInput(), phone: original.phone })).rejects.toMatchObject({ fieldErrors: { phone: 'phoneUsed' } });
    }
  });
  it('admits exactly one concurrent signup for the same phone and releases its lock', async () => {
    const first = makeInput(); const second = { ...makeInput(), phone: `+${first.phone}` };
    const results = await Promise.allSettled([create(first), create(second)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SignupConflictError);
    expect(rejected.reason.fieldErrors).toEqual({ phone: 'phoneUsed' });
    await expect(registerMerchantAccount({ ...makeInput(), phone: first.phone })).rejects.toMatchObject({ fieldErrors: { phone: 'phoneUsed' } });
  });
  it('returns the email field conflict for concurrent requests with different phones', async () => {
    const first = makeInput(); const second = { ...makeInput(), email: first.email };
    const results = await Promise.allSettled([create(first), create(second)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SignupConflictError);
    expect(rejected.reason.fieldErrors).toEqual({ email: 'emailUsed' });
  });
});
