import { afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { resolveMerchantAccess } from './accounts/merchant-access';
import { productsRouter } from './routers-products';
import { getMerchantByUserId } from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('merchant identity and products (MySQL)', () => {
  const users: number[] = [];
  async function fixture(label: string) { const result = await createDisposableMerchant(label); users.push(result.userId); return result; }
  afterAll(async () => { await cleanupDisposableMerchants(users); await closeDb(); });

  it('honors active roles, rejects revocation and never regrants owner through the legacy column', async () => {
    const account = await fixture('access');
    const pool = (await getPool())!;
    expect(await resolveMerchantAccess(account.userId)).toMatchObject({ merchantId: account.merchantId, role: 'owner', memberId: null });
    await pool.execute("INSERT INTO merchant_members (merchant_id, user_id, role, is_active) VALUES (?, ?, 'viewer', 1)", [account.merchantId, account.userId]);
    expect(await resolveMerchantAccess(account.userId)).toMatchObject({ role: 'viewer' });
    expect(await getMerchantByUserId(account.userId)).toBeUndefined();
    await pool.execute('UPDATE merchant_members SET is_active = 0 WHERE merchant_id = ? AND user_id = ?', [account.merchantId, account.userId]);
    expect(await resolveMerchantAccess(account.userId)).toBeNull();
    expect(await getMerchantByUserId(account.userId)).toBeUndefined();
    await pool.execute('UPDATE merchant_members SET is_active = 1 WHERE merchant_id = ? AND user_id = ?', [account.merchantId, account.userId]);
    await pool.execute("UPDATE merchants SET status = 'suspended' WHERE id = ?", [account.merchantId]);
    expect(await resolveMerchantAccess(account.userId)).toBeNull();
  });
  it('keeps reading stock and duplicate names side-effect free and blocks foreign product mutations', async () => {
    const own = await fixture('products-a');
    const foreign = await fixture('products-b');
    const pool = (await getPool())!;
    await pool.execute("INSERT INTO merchant_members (merchant_id, user_id, role, is_active) VALUES (?, ?, 'viewer', 1)", [own.merchantId, own.userId]);
    await pool.execute('INSERT INTO products (merchantId, name, price, stock, track_inventory) VALUES (?, ?, 10, 0, 1), (?, ?, 20, 0, 1)',
      [own.merchantId, 'Same name', own.merchantId, 'Same name']);
    const [inserted] = await pool.execute<any>('INSERT INTO products (merchantId, name, price) VALUES (?, ?, 30)', [foreign.merchantId, 'Foreign product']);
    const caller = productsRouter.createCaller({ user: { id: own.userId }, req: {}, res: {} } as any);
    expect((await caller.list()).items).toHaveLength(2);
    const [stock] = await pool.execute('SELECT stock, track_inventory FROM products WHERE merchantId = ?', [own.merchantId]);
    expect(stock).toEqual([{ stock: 0, track_inventory: 1 }, { stock: 0, track_inventory: 1 }]);
    await expect(caller.delete({ productId: inserted.insertId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute("UPDATE merchant_members SET role = 'manager' WHERE merchant_id = ? AND user_id = ?", [own.merchantId, own.userId]);
    await expect(caller.update({ productId: inserted.insertId, name: 'Stolen' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [unchanged] = await pool.execute('SELECT name FROM products WHERE id = ? AND merchantId = ?', [inserted.insertId, foreign.merchantId]);
    expect(unchanged).toEqual([{ name: 'Foreign product' }]);
  });
});
