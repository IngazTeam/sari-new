import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), list: vi.fn(), count: vi.fn(),
  getProduct: vi.fn(), update: vi.fn(), remove: vi.fn(), pool: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', () => ({
  getMerchantById: mocks.merchant, getProductsByMerchantId: mocks.list, getProductCountByMerchantId: mocks.count,
  getProductById: mocks.getProduct, updateProduct: mocks.update, deleteProduct: mocks.remove, getPool: mocks.pool,
}));
import { productsRouter } from './routers-products';
const caller = () => productsRouter.createCaller({ user: { id: 7 }, req: {}, res: {} } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, memberId: 3, role: 'manager' });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.list.mockResolvedValue([{ id: 1, name: 'Same name', stock: 0 }, { id: 2, name: 'Same name', stock: 0 }]);
  mocks.count.mockResolvedValue(2);
});
describe('product reads and team permissions', () => {
  it('lists stock-zero and same-name products without repairing or deleting anything', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, memberId: 3, role: 'viewer' });
    const result = await caller().list({ page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.items.map(item => item.stock)).toEqual([0, 0]);
    expect(mocks.list).toHaveBeenCalledWith(20, { offset: 0, limit: 10, search: undefined });
    expect(mocks.pool).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects viewer writes before loading a product', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, memberId: 3, role: 'viewer' });
    await expect(caller().delete({ productId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.getProduct).not.toHaveBeenCalled();
  });
  it('lets a manager mutate their own product without needing merchants.userId ownership', async () => {
    mocks.getProduct.mockResolvedValue({ id: 1, merchantId: 20 });
    await expect(caller().delete({ productId: 1 })).resolves.toEqual({ success: true });
    expect(mocks.merchant).toHaveBeenCalledWith(20);
    expect(mocks.remove).toHaveBeenCalledWith(1);
  });
  it('blocks cross-tenant read, write and delete before side effects', async () => {
    mocks.getProduct.mockResolvedValue({ id: 1, merchantId: 30 });
    for (const request of [caller().getById({ productId: 1 }), caller().update({ productId: 1, name: 'changed' }), caller().delete({ productId: 1 })]) {
      await expect(request).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
