import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ history:vi.fn(), inbox: vi.fn(), access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn(), pool: vi.fn(), execute: vi.fn() }));
vi.mock('./conversation-history', async original => ({...await original<typeof import('./conversation-history')>(), readConversationHistory:mocks.history}));
import {ConversationHistoryNotFound} from './conversation-history';
vi.mock('./conversation-inbox', () => ({ readConversationInbox: mocks.inbox }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  getMerchantById: mocks.merchant, getConversationsByMerchantId: mocks.conversations,
  getConversationCountByMerchantId: mocks.count, getConversationById: mocks.conversation, getMessagesByConversationId: mocks.messages,
  getPool: mocks.pool,
}));
import { appRouter } from './routers';
import { conversationsRouter } from './routers-conversations';
const routerCallers = { main: (ctx: any) => appRouter.createCaller(ctx).conversations, standalone: (ctx: any) => conversationsRouter.createCaller(ctx) };
let createConversationCaller = routerCallers.main;
const caller = (authenticated = true) => ({ conversations: createConversationCaller({ user: authenticated ? { id: 7, role: 'user' } : null, req: {}, res: {} }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer', memberId: 3 });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.conversations.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.count.mockResolvedValue(1);
  mocks.history.mockResolvedValue({items:[{id:8,conversationId:4,content:'fixture'}],merchantId:20,conversationId:4,hasMore:false,nextBeforeId:null});
  mocks.inbox.mockResolvedValue({merchantId:20,items:[{id:4,merchantId:20}],total:1,page:1,pageSize:50,totalPages:1});
  mocks.conversation.mockResolvedValue({ id: 4, merchantId: 20 });
  mocks.messages.mockResolvedValue([{ id: 8, conversationId: 4, content: 'fixture' }]);
  mocks.pool.mockResolvedValue({ execute: mocks.execute });
});
describe.each(['main', 'standalone'] as const)('%s conversations router', kind => {
  beforeEach(() => { createConversationCaller = routerCallers[kind]; });
  it('uses the same audited inbox and history procedures at both entry points', () => {
    for (const name of ['list','getMessages','messageHistory'] as const)
      expect(appRouter._def.procedures[`conversations.${name}`]).toBe(conversationsRouter._def.procedures[name]);
  });
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
      await expect(createConversationCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':'999'}},res:{}}).list({search:'secret'})).rejects.toMatchObject({code:'FORBIDDEN'});
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
      expect(mocks.history).toHaveBeenCalledWith(20,{conversationId:4,limit:500});
    });
    it("should reject access to other merchant's conversations", async () => {
      mocks.history.mockRejectedValue(new ConversationHistoryNotFound());
      await expect(caller().conversations.getMessages({ conversationId: 999999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mocks.messages).not.toHaveBeenCalled();
    });
    it('should reject unauthenticated requests', async () => {
      await expect(caller(false).conversations.getMessages({ conversationId: 4 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mocks.history).not.toHaveBeenCalled();
    });
  });
  describe('message history authority', () => {
    it('resolves the selected membership instead of trusting a prefilled context',async()=>{
      await createConversationCaller({user:{id:7,role:'user'},merchantId:999,req:{headers:{'x-merchant-id':'20'}},res:{}}).messageHistory({conversationId:4,beforeId:80});
      expect(mocks.access).toHaveBeenCalledWith(7,20);expect(mocks.history).toHaveBeenCalledWith(20,{conversationId:4,beforeId:80,limit:50});
    });
    it('rejects revoked membership before reading either list or history',async()=>{
      mocks.access.mockResolvedValue(null);
      await expect(caller().conversations.list()).rejects.toMatchObject({code:'FORBIDDEN'});
      await expect(caller().conversations.messageHistory({conversationId:4})).rejects.toMatchObject({code:'FORBIDDEN'});
      expect(mocks.inbox).not.toHaveBeenCalled();expect(mocks.history).not.toHaveBeenCalled();
    });
    it('hides storage errors and does not invent an empty history',async()=>{
      mocks.history.mockRejectedValue(Error('PRIVATE_DATABASE_DETAILS'));
      await expect(caller().conversations.messageHistory({conversationId:4})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'Conversation history unavailable'});
    });
    it.each([{conversationId:4,merchantId:999},{conversationId:4,beforeId:0},{conversationId:4,limit:501}])('rejects forged history input %j',async input=>{
      await expect(caller().conversations.messageHistory(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.history).not.toHaveBeenCalled();
    });
  });
});
