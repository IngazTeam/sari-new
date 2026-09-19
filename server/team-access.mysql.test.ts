import { afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { teamRouter } from './routers-team';
import { resolveMerchantAccess } from './accounts/merchant-access';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('team privilege escalation and concurrent owner protection (MySQL)', () => {
  const userIds: number[] = [];
  async function account() {
    const result = await createDisposableMerchant('team-review');
    userIds.push(result.userId);
    return result;
  }
  async function member(merchantId: number, userId: number, role: string) {
    const [row] = await (await getPool())!.execute<any>('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)', [merchantId, userId, role]);
    return Number(row.insertId);
  }
  const caller = (id: number) => teamRouter.createCaller({ user: { id }, req: {}, res: {} } as any);
  afterAll(async () => { await cleanupDisposableMerchants(userIds); await closeDb(); });

  it('allows manager membership without legacy ownership, but refuses elevation or changing an owner', async () => {
    const owner = await account(), manager = await account();
    const ownerMember = await member(owner.merchantId, owner.userId, 'owner');
    const managerMember = await member(owner.merchantId, manager.userId, 'manager');
    expect((await caller(manager.userId).list()).members.map(row => row.userId)).toContain(owner.userId);
    await expect(caller(manager.userId).updateRole({ memberId: managerMember, role: 'owner' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(manager.userId).updateRole({ memberId: ownerMember, role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(manager.userId).remove({ memberId: ownerMember })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await resolveMerchantAccess(manager.userId)).toMatchObject({ merchantId: owner.merchantId, role: 'manager' });
  });
  it('blocks viewers and foreign member identifiers without changing the foreign row', async () => {
    const owner = await account(), viewer = await account(), foreign = await account();
    await member(owner.merchantId, viewer.userId, 'viewer');
    const foreignMember = await member(foreign.merchantId, foreign.userId, 'owner');
    await expect(caller(viewer.userId).list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(viewer.userId).updateRole({ memberId: foreignMember, role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(owner.userId).remove({ memberId: foreignMember })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await resolveMerchantAccess(foreign.userId)).toMatchObject({ role: 'owner' });
  });
  it('preserves a revoked legacy-owner membership so fallback cannot resurrect it', async () => {
    const first = await account(), second = await account();
    const firstMember = await member(first.merchantId, first.userId, 'owner');
    await member(first.merchantId, second.userId, 'owner');
    await caller(second.userId).remove({ memberId: firstMember });
    expect(await resolveMerchantAccess(first.userId)).toBeNull();
    const [rows] = await (await getPool())!.execute<any[]>('SELECT is_active FROM merchant_members WHERE id = ?', [firstMember]);
    expect(rows).toEqual([{ is_active: 0 }]);
  });
  it('serializes competing owner demotions and leaves at least one active owner', async () => {
    const first = await account(), second = await account();
    const firstMember = await member(first.merchantId, first.userId, 'owner');
    const secondMember = await member(first.merchantId, second.userId, 'owner');
    const results = await Promise.allSettled([
      caller(first.userId).updateRole({ memberId: secondMember, role: 'viewer' }),
      caller(second.userId).updateRole({ memberId: firstMember, role: 'viewer' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const [rows] = await (await getPool())!.execute<any[]>("SELECT COUNT(*) AS count FROM merchant_members WHERE merchant_id = ? AND role = 'owner' AND is_active = 1", [first.merchantId]);
    expect(Number(rows[0].count)).toBe(1);
  });
  it('cannot demote the only owner or remove oneself', async () => {
    const owner = await account();
    const ownMember = await member(owner.merchantId, owner.userId, 'owner');
    await expect(caller(owner.userId).updateRole({ memberId: ownMember, role: 'viewer' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(owner.userId).remove({ memberId: ownMember })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await resolveMerchantAccess(owner.userId)).toMatchObject({ role: 'owner' });
  });
});
