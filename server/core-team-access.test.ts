import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn(),
  zidList: vi.fn(), zidReconcile: vi.fn(), sectorRead: vi.fn(), sectorWrite: vi.fn() }));
vi.mock('./ai/zid-checkout-reconciliation', () => ({ listZidReconciliations: mocks.zidList, reconcileZidCheckout: mocks.zidReconcile }));
vi.mock('./ai/sales-sector-settings', async original => ({ ...await original<typeof import('./ai/sales-sector-settings')>(),
  getSalesSectorSettings: mocks.sectorRead, updateSalesSectorSettings: mocks.sectorWrite }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  getMerchantById: mocks.merchant, getConversationsByMerchantId: mocks.conversations,
  getConversationCountByMerchantId: mocks.count, getConversationById: mocks.conversation, getMessagesByConversationId: mocks.messages,
}));
import { appRouter } from './routers';
const caller = () => appRouter.createCaller({ user: { id: 7, role: 'user' }, req: {}, res: {}, merchantId: 999 } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer', memberId: 3 });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.conversations.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.count.mockResolvedValue(1);
  mocks.zidList.mockResolvedValue({ items: [], nextCursor: null }); mocks.zidReconcile.mockResolvedValue({ verified: true });
  mocks.sectorRead.mockResolvedValue({ revision: 0, playbook: { id: 'general' } }); mocks.sectorWrite.mockResolvedValue({ revision: 1 });
});
describe('real app router team boundaries', () => {
  it('scopes reconciliation reads to membership and forbids viewer writes', async () => {
    expect(await caller().orders.listZidReconciliations()).toMatchObject({ canManage: false });
    expect(mocks.zidList).toHaveBeenCalledWith(20, undefined);
    await expect(caller().orders.reconcileZidCheckout({ quotationId: 1, orderId: 2, reviewed: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.zidReconcile).not.toHaveBeenCalled();
  });
  it('attributes reconciliation to the authenticated actor and rejects identity injection', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    const input = { quotationId: 1, orderId: 2, reviewed: true as const };
    await caller().orders.reconcileZidCheckout(input);
    expect(mocks.zidReconcile).toHaveBeenCalledWith({ ...input, merchantId: 20, actorUserId: 7 });
    for (const attack of [{ merchantId: 30 }, { actorUserId: 1 }, { reviewed: false }, { orderId: -1 }, { orderId: "1' OR 1=1" }]) {
      await expect(caller().orders.reconcileZidCheckout({ ...input, ...attack } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(mocks.zidReconcile).toHaveBeenCalledTimes(1);
  });
  it('requires bot settings permission for sales guide changes, independently of order permissions', async () => {
    expect(await caller().sariBrain.getSalesSector()).toMatchObject({ canManage: false });
    for (const role of ['viewer', 'sales_supervisor']) {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(caller().sariBrain.updateSalesSector({ playbookId: 'training', expectedRevision: 0 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(mocks.sectorWrite).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    await caller().sariBrain.updateSalesSector({ playbookId: 'training', expectedRevision: 0 });
    expect(mocks.sectorWrite).toHaveBeenCalledWith({ merchantId: 20, actorUserId: 7, playbookId: 'training', expectedRevision: 0 });
  });
  it('uses active membership for conversation reads and ignores a forged context tenant', async () => {
    const result = await caller().conversations.list();
    expect(result.items).toHaveLength(1);
    expect(mocks.merchant).toHaveBeenCalledWith(20);
    expect(mocks.conversations).toHaveBeenCalledWith(20, expect.any(Object));
  });
  it('does not expose foreign conversation messages', async () => {
    mocks.conversation.mockResolvedValue({ id: 80, merchantId: 30 });
    await expect(caller().conversations.getMessages({ conversationId: 80 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it('blocks viewer sends, sync and order mutations before handlers run', async () => {
    await expect(caller().conversations.sendReply({ conversationId: 4, message: 'forged' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().conversations.syncFromWhatsApp()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().orders.cancel({ orderId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().orders.updateStatus({ orderId: 1, status: 'paid' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('fails closed after membership revocation or identity database failure', async () => {
    mocks.access.mockResolvedValue(null);
    await expect(caller().orders.listByMerchant()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.access.mockRejectedValue(new Error('fixture connection failure'));
    await expect(caller().conversations.list()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('blocks viewer payment configuration in the mounted router', async () => {
    await expect(caller().merchantPayments.getSettings()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().merchantPayments.testConnection()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(['manager', 'viewer'])('refuses analytics tenant substitution by a %s', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
    mocks.merchant.mockResolvedValue({ id: 30 });
    await expect(caller().analytics.getDashboardKPIs({ merchantId: 30, startDate: '2026-09-01', endDate: '2026-09-19' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
