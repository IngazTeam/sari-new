// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
type Cache=typeof import('../client/src/lib/conversation-draft');
let cache:Cache,modules:Cache[];
const scope='7:20:4',now=1790848800000;
const fresh=async()=>{vi.resetModules();const next=await import('../client/src/lib/conversation-draft');modules.push(next);return next;};
beforeEach(async()=>{modules=[];sessionStorage.clear();cache=await fresh();});
afterEach(()=>{vi.restoreAllMocks();for(const item of modules)item.clearConversationDrafts();});
it('restores exact text from session storage and separates actor, merchant and conversation',async()=>{
  expect(cache.saveConversationDraft(scope,'  draft\nsecond line  ',false,cache.conversationDraftEpoch(),now)).toBe(true);
  const loaded=await fresh();expect(loaded.readConversationDraft(scope,now)).toMatchObject({state:'ready',persisted:true,record:{text:'  draft\nsecond line  ',review:false}});
  for(const other of ['8:20:4','7:21:4','7:20:5'])expect(loaded.readConversationDraft(other,now)).toEqual({state:'missing'});
});
it.each(['0:20:4','7:0:4','7:20:-1','7:20:1.1','7:20:9007199254740992','__proto__'])('rejects invalid scope %s',bad=>{
  expect(cache.saveConversationDraft(bad,'secret',false,cache.conversationDraftEpoch(),now)).toBe(false);expect(sessionStorage.length).toBe(0);expect(cache.readConversationDraft(bad,now).state).toBe('invalid');
});
it('refuses records transplanted into another scope',async()=>{
  cache.saveConversationDraft(scope,'private',false,cache.conversationDraftEpoch(),now);sessionStorage.setItem(cache.CONVERSATION_DRAFT_PREFIX+'8:20:4',sessionStorage.getItem(cache.CONVERSATION_DRAFT_PREFIX+scope)!);
  expect((await fresh()).readConversationDraft('8:20:4',now).state).toBe('invalid');
});
it('expires at 24 hours and removes expired text without returning it',async()=>{
  cache.saveConversationDraft(scope,'expired',false,cache.conversationDraftEpoch(),now);expect(cache.readConversationDraft(scope,now+86399999).state).toBe('ready');expect(cache.readConversationDraft(scope,now+86400000)).toEqual({state:'expired'});expect(sessionStorage.getItem(cache.CONVERSATION_DRAFT_PREFIX+scope)).toBeNull();
});
it.each(['{','{}',JSON.stringify({version:1,scope,savedAt:now+60001,text:'future',review:false}),JSON.stringify({version:1,scope,savedAt:now,text:'x',review:false,unexpected:true})])('rejects malformed or future data',async value=>{
  sessionStorage.setItem(cache.CONVERSATION_DRAFT_PREFIX+scope,value);expect(cache.readConversationDraft(scope,now).state).toBe('invalid');
});
it('keeps a memory draft and warns before unload when storage fails',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('private storage error');});expect(cache.saveConversationDraft(scope,'unsaved',false,cache.conversationDraftEpoch(),now)).toBe(false);
  expect(cache.readConversationDraft(scope,now)).toMatchObject({state:'ready',persisted:false,record:{text:'unsaved'}});const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
});
it('detects silent write loss and unreadable storage',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{});expect(cache.saveConversationDraft(scope,'unsaved',false,cache.conversationDraftEpoch(),now)).toBe(false);
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('denied');});expect(cache.readConversationDraft('7:20:9',now)).toEqual({state:'unavailable'});
});
it('restores a review marker when post-send clearing could not persist',async()=>{
  cache.saveConversationDraft(scope,'possibly sent',true,cache.conversationDraftEpoch(),now);
  const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});expect(cache.saveConversationDraft(scope,'',false,cache.conversationDraftEpoch(),now)).toBe(false);failure.mockRestore();
  expect((await fresh()).readConversationDraft(scope,now)).toMatchObject({state:'ready',record:{text:'possibly sent',review:true}});
});
it('persists an empty accepted draft instead of resurrecting the prior text',async()=>{
  cache.saveConversationDraft(scope,'sent',true,cache.conversationDraftEpoch(),now);cache.saveConversationDraft(scope,'',false,cache.conversationDraftEpoch(),now);
  expect((await fresh()).readConversationDraft(scope,now)).toMatchObject({state:'ready',record:{text:'',review:false}});
});
it('clears account drafts on logout and rejects delayed writes from the old epoch',()=>{
  const epoch=cache.conversationDraftEpoch();cache.saveConversationDraft(scope,'text',false,epoch,now);sessionStorage.setItem('unrelated','preserve');cache.clearConversationDrafts();
  expect(sessionStorage.getItem(cache.CONVERSATION_DRAFT_PREFIX+scope)).toBeNull();expect(sessionStorage.getItem('unrelated')).toBe('preserve');expect(cache.saveConversationDraft(scope,'late',false,epoch,now)).toBe(false);
});
