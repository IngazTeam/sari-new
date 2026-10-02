import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), workspace: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./discount-dashboard-store', async original => ({ ...await original<typeof import('./discount-dashboard-store')>(), listDashboardDiscounts: m.list, readDiscountWorkspace: m.workspace, getDashboardDiscount: m.get, createDashboardDiscount: m.create, updateDashboardDiscount: m.update, deleteDashboardDiscount: m.remove }));
import { discountsRouter } from './routers-discounts';
import { appRouter } from './routers';
import { DiscountDashboardError } from './discount-dashboard-store';
const draft = { code: 'LOCAL10', type: 'percentage' as const, value: 10 };
const calls = [['list', undefined, 'list'], ['getStats', undefined, 'list'], ['getById', { id: 4 }, 'get'], ['workspace', {}, 'workspace'], ['create', draft, 'create'], ['update', { id: 4, isActive: false }, 'update'], ['delete', { id: 4 }, 'remove']] as const;
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner' }); m.list.mockResolvedValue([{ id: 4, merchantId: 20, isActive: 1, usedCount: 2 }]); m.get.mockResolvedValue({ id: 4, merchantId: 20 }); m.create.mockResolvedValue({ id: 5, merchantId: 20 }); });
for (const mounted of [false, true]) describe(`discount tenant access mounted=${mounted}`, () => {
  const caller = (user: any = { id: 7, role: 'user' }, selection: any = '20') => {
    const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': selection } }, res: {} } as any;
    return mounted ? appRouter.createCaller(ctx).discounts : discountsRouter.createCaller(ctx);
  };
  const run = (name: string, input: any, api = caller()) => (api as any)[name](input);
  it.each(calls)('denies anonymous, revoked and malformed selection at %s', async (name, input, method) => {
    await expect(run(name, input, caller(null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(run(name, input, caller(undefined, '20x'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    m.access.mockResolvedValue(null); await expect(run(name, input)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(m[method]).not.toHaveBeenCalled();
  });
  it.each(['owner', 'manager'])('uses resolved %s scope for every procedure', async role => {
    m.access.mockResolvedValue({ merchantId: 20, role }); for (const [name, input, method] of calls) { await run(name, input); expect(m[method].mock.lastCall?.slice(0, 2)).toEqual([7, 20]); }
    expect(m.access).toHaveBeenCalledWith(7, 20);
  });
  it.each(['viewer', 'sales_supervisor'])('allows %s reads but blocks discount writes', async role => {
    m.access.mockResolvedValue({ merchantId: 20, role }); for (const [name, input] of calls.slice(0, 4)) await run(name, input);
    for (const [name, input, method] of calls.slice(4)) { await expect(run(name, input)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(m[method]).not.toHaveBeenCalled(); }
  });
  it.each(calls)('rejects browser scope injection at %s', async (name, input, method) => { await expect(run(name, { ...input, merchantId: 999 })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m[method]).not.toHaveBeenCalled(); });
  it('does not turn absent DB or private errors into successful empty data', async () => {
    m.list.mockRejectedValue(Error('PRIVATE SQL')); await expect(caller().list()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر تأكيد نتيجة العملية. حدّث القائمة قبل المحاولة مجددًا.' });
    m.get.mockRejectedValue(new DiscountDashboardError('missing')); await expect(caller().getById({ id: 9 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    m.create.mockRejectedValue(new DiscountDashboardError('duplicate')); await expect(caller().create(draft)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('requires selection instead of guessing the owner store', async () => { m.access.mockRejectedValue(Object.assign(Error(), { name: 'MerchantSelectionRequiredError' })); await expect(caller().list()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(m.list).not.toHaveBeenCalled(); });
  it.each([0, -1, 1.5, 2147483648, NaN])('rejects invalid ID %s before storage', async id => { await expect(caller().getById({ id })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m.get).not.toHaveBeenCalled(); });
  it.each([{ value: 10.5 }, { value: 101 }, { value: Infinity }, { minOrderAmount: 0.5 }, { maxUses: 2147483648 }, { expiresAt: '2026-02-30' }, { expiresAt: '2038-01-19' }, { code: 'AB\u0000CD' }])('rejects lossy or impossible fields %j', async patch => { await expect(caller().create({ ...draft, ...patch })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m.create).not.toHaveBeenCalled(); });
  it('rejects empty updates and preserves compatibility stats meaning', async () => { await expect(caller().update({ id: 4 })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(await caller().getStats()).toEqual({ total: 1, active: 1, used: 2 }); });
});
