import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getPool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: mocks.getPool }));
import { resolveMerchantAccess } from './accounts/merchant-access';
import { parseMerchantSelection, withMerchantRequest, currentMerchantRequest } from './accounts/merchant-context';
import { merchantProcedure, permissionProcedure, router } from './_core/trpc';

const accessRouter = router({
  read: merchantProcedure.query(({ ctx }) => ({ merchantId: ctx.merchantId, role: ctx.merchantRole })),
  write: permissionProcedure('products.manage').mutation(({ ctx }) => ({ merchantId: ctx.merchantId })),
});
const context = (userId = 10) => ({ user: { id: userId }, req: {}, res: {}, merchantId: 999 } as any);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPool.mockResolvedValue({ execute: mocks.execute });
});

describe('merchant access identity boundary', () => {
  it.each(['0', '-1', '1 OR 1=1', '1.2', '2147483648', ['1', '2']])('rejects malformed merchant selection %s', value => {
    expect(() => parseMerchantSelection(value)).toThrow('Invalid merchant selection');
  });
  it('keeps overlapping request selectors isolated', async () => {
    const values = await Promise.all([20, 30].map(selectedMerchantId => withMerchantRequest({ userId: 10, selectedMerchantId }, async () => {
      await new Promise(resolve => setTimeout(resolve, 2)); return currentMerchantRequest()?.selectedMerchantId;
    })));
    expect(values).toEqual([20, 30]); expect(currentMerchantRequest()).toBeUndefined();
  });
  it('uses authenticated membership and ignores a prepopulated/forged tenant', async () => {
    mocks.execute.mockResolvedValue([[{ merchantId: 20, memberId: 1, role: 'manager' }]]);
    await expect(accessRouter.createCaller(context()).write()).resolves.toEqual({ merchantId: 20 });
    expect(mocks.execute.mock.calls[0][1]).toEqual([10]);
  });
  it.each(['owner', 'manager', 'sales_supervisor'])('allows %s product writes', async role => {
    mocks.execute.mockResolvedValue([[{ merchantId: 20, memberId: 1, role }]]);
    await expect(accessRouter.createCaller(context()).write()).resolves.toEqual({ merchantId: 20 });
  });
  it('allows viewer reads and blocks writes before executing the handler', async () => {
    mocks.execute.mockResolvedValue([[{ merchantId: 20, memberId: 1, role: 'viewer' }]]);
    const caller = accessRouter.createCaller(context());
    await expect(caller.read()).resolves.toEqual({ merchantId: 20, role: 'viewer' });
    await expect(caller.write()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('does not fall back to owner after database or schema failure', async () => {
    mocks.execute.mockRejectedValue(new Error('table missing / connection unavailable'));
    await expect(accessRouter.createCaller(context()).write()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('blocks missing database and unauthenticated users', async () => {
    mocks.getPool.mockResolvedValue(null);
    await expect(resolveMerchantAccess(10)).rejects.toThrow('unavailable');
    await expect(accessRouter.createCaller({ ...context(), user: null }).read()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('limits legacy ownership to accounts with no membership history in that store', async () => {
    mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ merchantId: 20 }]]);
    await expect(resolveMerchantAccess(10)).resolves.toEqual({ merchantId: 20, memberId: null, role: 'owner' });
    const [sql, params] = mocks.execute.mock.calls[1];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('mm.merchant_id = m.id AND mm.user_id = ?');
    expect(sql).not.toContain('mm.is_active');
    expect(params).toEqual([10, 10]);
  });
  it('rejects missing/revoked membership and suspended or deleted stores', async () => {
    mocks.execute.mockResolvedValue([[]]);
    await expect(accessRouter.createCaller(context()).read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.execute.mock.calls[0][0]).toContain("m.status <> 'suspended'");
    expect(mocks.execute.mock.calls[0][0]).toContain('INNER JOIN merchants');
  });
  it('does not guess between multiple merchants or accept unknown roles', async () => {
    mocks.execute.mockResolvedValue([[{ merchantId: 20 }, { merchantId: 30 }]]);
    await expect(resolveMerchantAccess(10)).rejects.toThrow('selection required');
    mocks.execute.mockResolvedValue([[{ merchantId: 20, role: 'superadmin' }]]);
    await expect(resolveMerchantAccess(10)).resolves.toBeNull();
  });
});
