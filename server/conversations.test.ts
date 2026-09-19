import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  getMerchantById: mocks.merchant, getConversationsByMerchantId: mocks.conversations,
  getConversationCountByMerchantId: mocks.count, getConversationById: mocks.conversation, getMessagesByConversationId: mocks.messages,
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
