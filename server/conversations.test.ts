import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn(), pool: vi.fn(), execute: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  getMerchantById: mocks.merchant, getConversationsByMerchantId: mocks.conversations,
  getConversationCountByMerchantId: mocks.count, getConversationById: mocks.conversation, getMessagesByConversationId: mocks.messages,
  getPool: mocks.pool,
}));
import { appRouter } from './routers';
const caller = (authenticated = true) => appRouter.createCaller({ user: authenticated ? { id: 7, role: 'user' } : null, req: {}, res: {} } as any);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer', memberId: 3 });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.conversations.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.count.mockResolvedValue(1);
  mocks.conversation.mockResolvedValue({ id: 4, merchantId: 20 });
  mocks.messages.mockResolvedValue([{ id: 8, conversationId: 4, content: 'fixture' }]);
  mocks.pool.mockResolvedValue({ execute: mocks.execute });
});
describe('conversations router', () => {
  describe('conversations.list', () => {
    it('should return conversations for authenticated merchant', async () => {
      expect(await caller().conversations.list()).toMatchObject({ items: [{ id: 4, merchantId: 20 }], total: 1, page: 1, pageSize: 50 });
      expect(mocks.conversations).toHaveBeenCalledWith(20, { limit: 50, offset: 0 });
    });
    it('should reject unauthenticated requests', async () => {
      await expect(caller(false).conversations.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mocks.conversations).not.toHaveBeenCalled();
    });
    it('searches all tenant conversations with bound literal input and paginates the result', async () => {
      const search = "عميل %_' OR 1=1";
      mocks.execute.mockResolvedValueOnce([[{ total: '65' }]]).mockResolvedValueOnce([[{ id: 64, merchantId: 20 }]]);
      const result = await caller().conversations.list({ search, page: 2, pageSize: 50 });
      expect(result).toMatchObject({ total: 65, totalPages: 2, page: 2, items: [{ id: 64, merchantId: 20 }] });
      const [countSql, countParams] = mocks.execute.mock.calls[0];
      const [rowsSql, rowsParams] = mocks.execute.mock.calls[1];
      expect(countSql).toContain('c.merchantId = ?');
      expect(countSql).toContain('LOCATE(?, c.customerName)');
      expect(countSql).not.toContain(search);
      expect(countParams).toEqual([20, search, search]);
      expect(rowsSql).toContain('LIMIT ? OFFSET ?');
      expect(rowsParams).toEqual([20, search, search, 50, 50]);
      expect(mocks.conversations).not.toHaveBeenCalled();
    });
    it('combines search with tenant-scoped human escalation filtering', async () => {
      mocks.execute.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
      await caller().conversations.list({ search: 'نورة', needsHuman: true });
      expect(mocks.execute.mock.calls[0][0]).toContain('merchant_id = ?');
      expect(mocks.execute.mock.calls[0][1]).toEqual([20, 'نورة', 'نورة', 20]);
    });
    it('rejects oversized search and non-integral pagination before querying', async () => {
      await expect(caller().conversations.list({ search: 'x'.repeat(201) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller().conversations.list({ page: 1.5 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mocks.execute).not.toHaveBeenCalled();
    });
    it('reports unavailable search storage as an error, not an empty inbox', async () => {
      mocks.pool.mockResolvedValue(null);
      await expect(caller().conversations.list({ search: 'عميل' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });
    it('ignores an invalid stage without bypassing the merchant boundary', async () => {
      await caller().conversations.list({ stage: "' OR 1=1 --" });
      expect(mocks.conversations).toHaveBeenCalledWith(20, { limit: 50, offset: 0 });
      expect(mocks.execute).not.toHaveBeenCalled();
      mocks.execute.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
      await caller().conversations.list({ stage: "' OR 1=1 --", search: 'literal' });
      expect(mocks.execute.mock.calls[0][1]).toEqual([20, 'literal', 'literal']);
      expect(mocks.execute.mock.calls[0][0]).not.toContain('deal_stage');
    });
    it('rejects a forged merchant header before reading any conversation', async () => {
      mocks.access.mockResolvedValue(null);
      await expect(appRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': '999' } }, res: {} } as any)
        .conversations.list({ search: 'secret' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.access).toHaveBeenCalledWith(7, 999);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.conversations).not.toHaveBeenCalled();
    });
  });
  describe('conversations.getMessages', () => {
    it('should return messages for valid conversation', async () => {
      expect(await caller().conversations.getMessages({ conversationId: 4 })).toEqual([{ id: 8, conversationId: 4, content: 'fixture' }]);
      expect(mocks.messages).toHaveBeenCalledWith(4);
    });
    it("should reject access to other merchant's conversations", async () => {
      mocks.conversation.mockResolvedValue({ id: 999999, merchantId: 30 });
      await expect(caller().conversations.getMessages({ conversationId: 999999 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.messages).not.toHaveBeenCalled();
    });
    it('should reject unauthenticated requests', async () => {
      await expect(caller(false).conversations.getMessages({ conversationId: 4 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mocks.messages).not.toHaveBeenCalled();
    });
  });
});
