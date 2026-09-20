import { afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { resolveMerchantAccess } from './accounts/merchant-access';
import { productsRouter } from './routers-products';
import { getMerchantByUserId } from './db';
import { listMerchantAccess } from './accounts/merchant-access';
import { withMerchantRequest } from './accounts/merchant-context';
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
  it('selects only an active authorized store and never falls back to another owned store', async () => {
    const a = await fixture('selection-a'); const b = await fixture('selection-b'); const foreign = await fixture('selection-foreign');
    const pool = (await getPool())!;
    await pool.execute("INSERT INTO merchant_members (merchant_id, user_id, role, is_active) VALUES (?, ?, 'owner', 1), (?, ?, 'viewer', 1)",
      [a.merchantId, a.userId, b.merchantId, a.userId]);
    expect((await listMerchantAccess(a.userId)).map(row => row.merchantId)).toEqual([a.merchantId, b.merchantId]);
    await expect(resolveMerchantAccess(a.userId)).rejects.toThrow('selection required');
    expect(await resolveMerchantAccess(a.userId, b.merchantId)).toMatchObject({ merchantId: b.merchantId, role: 'viewer' });
    expect(await resolveMerchantAccess(a.userId, foreign.merchantId)).toBeNull();
    expect(await withMerchantRequest({ userId: a.userId, selectedMerchantId: b.merchantId }, () => getMerchantByUserId(a.userId))).toBeUndefined();
    expect(await withMerchantRequest({ userId: a.userId, selectedMerchantId: a.merchantId }, () => getMerchantByUserId(a.userId))).toMatchObject({ id: a.merchantId });
    await pool.execute('UPDATE merchant_members SET is_active = 0 WHERE merchant_id = ? AND user_id = ?', [b.merchantId, a.userId]);
    expect(await resolveMerchantAccess(a.userId, b.merchantId)).toBeNull();
    expect(await withMerchantRequest({ userId: a.userId, selectedMerchantId: b.merchantId }, () => getMerchantByUserId(a.userId))).toBeUndefined();
  });
  it('applies the selected store role at the actual product procedure boundary', async () => {
    const a = await fixture('selector-router-a'); const b = await fixture('selector-router-b');
    const pool = (await getPool())!;
    await pool.execute("INSERT INTO merchant_members (merchant_id, user_id, role, is_active) VALUES (?, ?, 'owner', 1), (?, ?, 'viewer', 1)",
      [a.merchantId, a.userId, b.merchantId, a.userId]);
    await pool.execute("INSERT INTO products (merchantId, name, price) VALUES (?, 'Selected product', 10)", [b.merchantId]);
    const caller = productsRouter.createCaller({ user: { id: a.userId }, req: { headers: { 'x-merchant-id': String(b.merchantId) } }, res: {} } as any);
    const result = await caller.list(); expect(result.items.map(item => item.name)).toEqual(['Selected product']);
    await expect(caller.delete({ productId: result.items[0].id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.execute('UPDATE merchant_members SET is_active = 0 WHERE merchant_id = ? AND user_id = ?', [b.merchantId, a.userId]);
    await expect(caller.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('requires a choice across a legacy owned store and a separate modern membership', async () => {
    const a = await fixture('mixed-owner'); const b = await fixture('mixed-member');
    await (await getPool())!.execute("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [b.merchantId, a.userId]);
    await expect(resolveMerchantAccess(a.userId)).rejects.toThrow('selection required');
    expect(await resolveMerchantAccess(a.userId, a.merchantId)).toMatchObject({ merchantId: a.merchantId, role: 'owner' });
    expect(await resolveMerchantAccess(a.userId, b.merchantId)).toMatchObject({ merchantId: b.merchantId, role: 'viewer' });
    const caller = productsRouter.createCaller({ user: { id: a.userId }, req: {}, res: {} } as any);
    await expect(caller.list()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
