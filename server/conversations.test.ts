import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ inbox: vi.fn(), access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn(), pool: vi.fn(), execute: vi.fn() }));
vi.mock('./conversation-inbox', () => ({ readConversationInbox: mocks.inbox }));
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
  mocks.inbox.mockResolvedValue({merchantId:20,items:[{id:4,merchantId:20}],total:1,page:1,pageSize:50,totalPages:1});
  mocks.conversation.mockResolvedValue({ id: 4, merchantId: 20 });
  mocks.messages.mockResolvedValue([{ id: 8, conversationId: 4, content: 'fixture' }]);
  mocks.pool.mockResolvedValue({ execute: mocks.execute });
});
describe('conversations router', () => {
  describe('conversations.list', () => {
    it('reads one snapshot in the authenticated membership', async () => {
      expect(await caller().conversations.list()).toMatchObject({merchantId:20,items:[{id:4,merchantId:20}],total:1,page:1,pageSize:50});
      expect(mocks.inbox).toHaveBeenCalledWith(20,{});
      expect(mocks.conversations).not.toHaveBeenCalled();
    });
    it('passes literal search, pagination and both filters together',async()=>{
      const input={search:"عميل %_' OR 1=1",page:2,pageSize:50,stage:'ready',needsHuman:true};
      await caller().conversations.list(input);
      expect(mocks.inbox).toHaveBeenCalledWith(20,input);
    });
    it.each([{search:'x'.repeat(201)},{page:1.5},{page:0},{page:100001},{pageSize:101},{stage:'unknown'},{stage:"' OR 1=1 --"},{merchantId:999}])('rejects invalid or forged selection %j',async input=>{
      await expect(caller().conversations.list(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
      expect(mocks.inbox).not.toHaveBeenCalled();
    });
    it.each([{}, {search:'عميل'}])('reports failed storage for selection %j without returning an empty inbox',async input=>{
      mocks.inbox.mockRejectedValue(Error('private SQL detail'));
      await expect(caller().conversations.list(input)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'Conversation data is temporarily unavailable'});
    });
    it('rejects an unauthenticated caller before reading',async()=>{
      await expect(caller(false).conversations.list()).rejects.toMatchObject({code:'UNAUTHORIZED'});
      expect(mocks.inbox).not.toHaveBeenCalled();
    });
    it('rejects a forged merchant header before reading',async()=>{
      mocks.access.mockResolvedValue(null);
      await expect(appRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':'999'}},res:{}} as any).conversations.list({search:'secret'})).rejects.toMatchObject({code:'FORBIDDEN'});
      expect(mocks.access).toHaveBeenCalledWith(7,999);
      expect(mocks.inbox).not.toHaveBeenCalled();
    });
    it('does not read a deleted merchant',async()=>{
      mocks.merchant.mockResolvedValue(null);
      await expect(caller().conversations.list()).rejects.toMatchObject({code:'NOT_FOUND'});
      expect(mocks.inbox).not.toHaveBeenCalled();
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
