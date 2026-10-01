// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import merchantAr from '../client/src/locales/merchant-ux.ar';
import { clearConversationDrafts, CONVERSATION_DRAFT_PREFIX, conversationDraftScope, conversationDraftEpoch, saveConversationDraft, readConversationDraft } from '../client/src/lib/conversation-draft';
const m=vi.hoisted(()=>({queries:{} as Record<string,any>,suggestionProps:null as any,calls:vi.fn(),send:vi.fn(),voice:vi.fn(),attempt:vi.fn(),voiceAttempt:vi.fn(),complete:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('@/lib/trpc',()=>{
  const query=(name:string)=>({useQuery:(input:any,options:any)=>{
    m.calls(name,input,options);return options?.enabled===false?{data:undefined,isLoading:false,isFetching:false,error:null,refetch:vi.fn()}:typeof m.queries[name]==='function'?m.queries[name](input,options):m.queries[name];
  }});
  const mutation=(call=vi.fn())=>({useMutation:()=>({mutateAsync:call,isPending:false})});
  const util=new Proxy({}, {get:()=>({invalidate:m.invalidate})});
  return {trpc:{auth:{me:query('user')},merchants:{getCurrent:query('merchant')},conversations:{list:query('list'),messageHistory:query('history'),connectionStatus:query('connection'),sendReply:mutation(m.send),sendVoiceReply:mutation(m.voice),syncFromWhatsApp:mutation(),diagnoseWebhook:mutation()},useUtils:()=>({conversations:util})}};
});
describe('restorable conversation navigation',()=>{
  const go=(path:string)=>act(async()=>memory.navigate(path));
  const button=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.trim()===text)!;
  it('loads search, page and both filters from a link without resetting page after the debounce',async()=>{
    vi.useFakeTimers();memory.navigate('/merchant/conversations?phone=local&page=2&stage=ready&needs_human=1');await render();await act(async()=>vi.advanceTimersByTime(350));
    expect(m.calls.mock.calls.filter(c=>c[0]==='list').every(c=>c[1].page===2&&c[1].stage==='ready'&&c[1].needsHuman===true&&c[1].search==='local')).toBe(true);
    expect(container.textContent).toContain('جاهزون للدفع');expect(container.textContent).toContain('تحتاج تدخل بشري');
  });
  it('opens a quotation deep link even when its owned conversation is outside the list page',async()=>{
    memory.navigate('/merchant/conversations?conversationId=9');m.queries.history=query({...m.queries.history.data,conversationId:9,conversation:{id:9,merchantId:20,customerName:'Outside list',customerPhone:'local-nine',status:'active'},items:[]});
    await render();expect(container.textContent).toContain('Outside list');expect(draft()).toBeTruthy();
  });
  it('does not show an unavailable or foreign conversation from a direct link',async()=>{
    memory.navigate('/merchant/conversations?conversationId=9');m.queries.history=query({...m.queries.history.data,conversationId:9,conversation:{id:9,merchantId:99,customerName:'FOREIGN'},items:[]});
    await render();expect(container.textContent).not.toContain('FOREIGN');expect(draft()).toBeNull();expect(container.textContent).toContain(ar.conversationNavigation.unavailable);
    await click(button(ar.conversationNavigation.backToList));expect(memory.history?.at(-1)).not.toContain('conversationId');expect(container.querySelector('[data-staff-conversation]')).toBeTruthy();
  });
  it('restores URL selection and per-conversation drafts on browser navigation',async()=>{
    const base=m.queries.history.data;m.queries.history=({conversationId}:any)=>query({...base,conversationId,items:[]});
    await render();await choose();await fill('Draft 4');const four=memory.history!.at(-1)!;await choose(5);expect(draft().value).toBe('');await fill('Draft 5');const five=memory.history!.at(-1)!;
    await go(four);expect(draft().value).toBe('Draft 4');await go(five);expect(draft().value).toBe('Draft 5');
  });
  it('clears stage and human filters while preserving search, selection and unrelated parameters',async()=>{
    memory.navigate('/merchant/conversations?phone=local&stage=ready&needs_human=1&page=2&conversationId=4&lang=en');await render();await click(button('✕ إزالة الفلتر'));
    const params=new URL(memory.history!.at(-1)!,'https://local.test').searchParams;expect(params.get('phone')).toBe('local');expect(params.get('conversationId')).toBe('4');expect(params.get('lang')).toBe('en');expect(params.has('stage')).toBe(false);expect(params.has('needs_human')).toBe(false);expect(params.has('page')).toBe(false);
  });
  it('updates debounced search without losing filters, then restores a prior query without a stale timer',async()=>{
    vi.useFakeTimers();memory.navigate('/merchant/conversations?page=2&stage=ready');await render();
    const input=container.querySelector('input[aria-label="البحث في جميع المحادثات"]')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'local-5');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>vi.advanceTimersByTime(301));
    expect(memory.history?.at(-1)).toContain('phone=local-5');expect(memory.history?.at(-1)).toContain('stage=ready');expect(memory.history?.at(-1)).not.toContain('page=');
    await go('/merchant/conversations?page=2&stage=ready');await act(async()=>vi.advanceTimersByTime(350));expect((input as HTMLInputElement).value).toBe('');expect(memory.history?.at(-1)).toBe('/merchant/conversations?page=2&stage=ready');
    await go('/merchant/conversations?phone=other&page=3');await act(async()=>vi.advanceTimersByTime(350));expect((input as HTMLInputElement).value).toBe('other');expect(memory.history?.at(-1)).toBe('/merchant/conversations?phone=other&page=3');
  });
  it('recovers an out-of-range page without discarding its search',async()=>{
    memory.navigate('/merchant/conversations?phone=local&page=999');await render();await click(button(ar.conversationNavigation.firstPage));expect(memory.history?.at(-1)).toBe('/merchant/conversations?phone=local');
  });
  it('does not notify or clear the current draft for a late send in another conversation',async()=>{
    const base=m.queries.history.data;m.queries.history=({conversationId}:any)=>query({...base,conversationId,items:[]});let release!:(v:any)=>void;m.send.mockReturnValue(new Promise(resolve=>release=resolve));
    await render();await choose();await fill('Accepted 4');await click(send());await go('/merchant/conversations?conversationId=5');await fill('Keep 5');await act(async()=>release({success:true,persisted:true}));
    expect(draft().value).toBe('Keep 5');expect(m.success).not.toHaveBeenCalled();expect(m.complete).toHaveBeenCalledOnce();await go('/merchant/conversations?conversationId=4');expect(draft().value).toBe('');
  });
});
describe('saved reply drafts and interrupted send recovery',()=>{
  const scope=()=>conversationDraftScope(7,20,4);
  const button=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.trim()===text)!;
  it('restores a stored draft only after confirming its account and store',async()=>{
    sessionStorage.setItem(CONVERSATION_DRAFT_PREFIX+scope(),JSON.stringify({version:1,scope:scope(),savedAt:Date.now(),text:'Stored exact reply',review:false}));memory.navigate('/merchant/conversations?conversationId=4');await render();expect(draft().value).toBe('Stored exact reply');expect(container.textContent).toContain(ar.conversationDraft.saved);
    m.queries.user.data={id:8};await render();expect(draft().value).toBe('');
  });
  it('does not send when the draft review marker cannot be saved and retains typed text',async()=>{
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});await render();await choose();await fill('Do not lose me');expect(container.querySelector('[data-draft-storage-error]')).toBeTruthy();await click(send());expect(m.send).not.toHaveBeenCalled();expect(draft().value).toBe('Do not lose me');
  });
  it('persists a review marker before the request and blocks a blind retry after failure',async()=>{
    m.send.mockImplementation(async()=>{expect(readConversationDraft(scope())).toMatchObject({state:'ready',record:{review:true}});throw Error('connection dropped');});
    await render();await choose();await fill('Uncertain reply');await click(send());expect(container.querySelector('[data-draft-review]')).toBeTruthy();expect(send().disabled).toBe(true);expect(draft().disabled).toBe(true);
    await click(button(ar.conversationDraft.reviewed));expect(m.send).toHaveBeenCalledTimes(1);expect(draft().disabled).toBe(false);expect(draft().value).toBe('Uncertain reply');
  });
  it('restores a possibly sent reply for review instead of permitting an immediate resend',async()=>{
    saveConversationDraft(scope(),'Review first',true,conversationDraftEpoch());memory.navigate('/merchant/conversations?conversationId=4');await render();expect(draft().value).toBe('Review first');expect(send().disabled).toBe(true);expect(container.querySelector('[data-draft-review]')).toBeTruthy();expect(m.send).not.toHaveBeenCalled();
  });
  it('shows invalid saved data without restoring it and allows an explicit empty draft',async()=>{
    sessionStorage.setItem(CONVERSATION_DRAFT_PREFIX+scope(),'{malformed');memory.navigate('/merchant/conversations?conversationId=4');await render();expect(draft().value).toBe('');expect(draft().disabled).toBe(true);expect(container.textContent).toContain(ar.conversationDraft.invalid);
    await click(button(ar.conversationDraft.startEmpty));expect(draft().disabled).toBe(false);
  });
  it('restores text after a storage retry without sending it',async()=>{
    const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});await render();await choose();await fill('Recover this');failure.mockRestore();await click(button(ar.conversationDraft.retry));expect(container.querySelector('[data-draft-storage-error]')).toBeNull();expect(draft().value).toBe('Recover this');expect(m.send).not.toHaveBeenCalled();
  });
});
vi.mock('@/lib/staff-dashboard-attempt',()=>({staffDashboardAttempt:m.attempt}));
vi.mock('@/lib/staff-voice-attempt',()=>({staffVoiceAttempt:m.voiceAttempt}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,warning:m.warning,info:vi.fn()}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar',dir:()=> 'rtl'},t:(key:string)=>{
  const source={...ar,merchantUx:merchantAr};return key.split('.').reduce((v:any,k)=>v?.[k],source)??key;
}})}));
vi.mock('@/components/StaffTeamReview',()=>({StaffTeamReview:()=>null}));
vi.mock('@/components/ConversationConnection',()=>({ConversationConnection:()=>null}));
vi.mock('@/components/StaffAttemptReview',()=>({StaffAttemptReview:()=>null}));
vi.mock('@/components/ConversationHandoff',()=>({ConversationHandoff:()=>null}));
vi.mock('@/components/EscalationReconciliation',()=>({EscalationReconciliation:()=>null}));
vi.mock('@/components/SalesOfferReview',()=>({SalesOfferReview:()=>null}));
vi.mock('@/components/AISuggestions',()=>({AISuggestions:(props:any)=>{m.suggestionProps=props;return null;}}));
vi.mock('@/components/QuickActions',()=>({QuickActionsBar:()=>null}));
vi.mock('@/components/ConversationPreviewMode',()=>({ConversationPreviewMode:()=>null}));
vi.mock('@/components/VoiceRecorder',()=>({VoiceRecorder:({disabled,onRecordingComplete}:any)=>React.createElement('button',{'data-test-voice':true,disabled,onClick:()=>void onRecordingComplete(new Blob(['local fixture']),1)},'Voice fixture')}));
import Conversations from '../client/src/pages/merchant/Conversations';
let root:Root,container:HTMLDivElement,memory:ReturnType<typeof memoryLocation>;
const query=(data:any)=>({data,error:null,isLoading:false,isFetching:false,refetch:vi.fn()});
const render=()=>act(async()=>root.render(React.createElement(Router,{hook:memory.hook,searchHook:memory.searchHook},React.createElement(Conversations))));
const click=(element:Element)=>act(async()=>{(element as HTMLElement).click();});
const choose=(id=4)=>click(container.querySelector(`[data-staff-conversation="${id}"]`)!);
const draft=()=>container.querySelector('[data-staff-draft]') as HTMLTextAreaElement;
const send=()=>container.querySelector('[data-staff-send]') as HTMLButtonElement;
const fill=(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(draft(),value);draft().dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  m.suggestionProps=null;
  clearConversationDrafts();sessionStorage.clear();
  memory=memoryLocation({path:'/merchant/conversations',record:true});
  vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  const items=[4,5].map(id=>({id,merchantId:20,customerName:`Customer ${id}`,customerPhone:`local-${id}`,status:'active',lastMessageAt:'2026-10-01 10:00:00'}));
  m.queries={user:query({id:7}),merchant:query({id:20,timezone:'Asia/Riyadh'}),list:query({merchantId:20,items,total:2,page:1,totalPages:1,pageSize:50}),history:query({merchantId:20,conversationId:4,items:[{id:8,conversationId:4,content:'Private example',direction:'incoming',messageType:'text',createdAt:'2026-10-01 10:00:00'}],hasMore:false,nextBeforeId:null}),connection:query(undefined)};
  m.attempt.mockResolvedValue({requestId:'00000000-0000-4000-8000-000000000001',complete:m.complete,confirmOwner:vi.fn()});m.send.mockResolvedValue({success:true,persisted:true});
  m.voiceAttempt.mockResolvedValue({input:{conversationId:4,requestId:'00000000-0000-4000-8000-000000000002'},complete:m.complete,confirmOwner:vi.fn()});m.voice.mockResolvedValue({success:true,persisted:true});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();clearConversationDrafts();vi.unstubAllGlobals();vi.useRealTimers();});
describe('verified inbox scope and draft lifetime',()=>{
  it('binds suggestions to the account and merchant and preserves a concurrent saved draft',async()=>{
    await render();await choose();await fill('Existing draft');expect(m.suggestionProps).toMatchObject({merchantId:20,actorUserId:7,conversationId:4,draftText:'Existing draft'});
    const apply=m.suggestionProps.onSelectSuggestion;saveConversationDraft(conversationDraftScope(7,20,4),'Newer saved draft',false,conversationDraftEpoch());
    expect(apply('Suggestion','Existing draft')).toBe(false);expect(readConversationDraft(conversationDraftScope(7,20,4))).toMatchObject({record:{text:'Newer saved draft'}});expect(m.send).not.toHaveBeenCalled();
  });
  it('adds an explicitly reviewed suggestion to the saved draft without sending',async()=>{
    await render();await choose();await fill('Original');await act(async()=>{expect(m.suggestionProps.onSelectSuggestion('Original\n\nSuggestion','Original')).toBe(true);});expect(draft().value).toBe('Original\n\nSuggestion');expect(m.send).not.toHaveBeenCalled();
  });
  it('rejects suggestion insertion after a send review marker is saved',async()=>{
    await render();await choose();const apply=m.suggestionProps.onSelectSuggestion;saveConversationDraft(conversationDraftScope(7,20,4),'',true,conversationDraftEpoch());expect(apply('Suggestion','')).toBe(false);expect(m.send).not.toHaveBeenCalled();
  });
  it.each(['user','merchant'])('does not mount inbox reads while %s is being reverified',async name=>{
    m.queries[name].isFetching=true;await render();expect(container.querySelector('[data-state=loading]')).toBeTruthy();expect(m.calls.mock.calls.some(c=>c[0]==='list')).toBe(false);
  });
  it('shows an error instead of cached identity content',async()=>{
    m.queries.merchant.error={data:{code:'FORBIDDEN'}};await render();expect(container.querySelector('[data-state=forbidden]')).toBeTruthy();expect(container.textContent).not.toContain('Customer');
  });
  it.each(['snapshot','row'])('hides %s belonging to another tenant',async kind=>{
    if(kind==='snapshot')m.queries.list.data.merchantId=30;else m.queries.list.data.items[0].merchantId=30;
    await render();expect(container.querySelector('[data-staff-conversation]')).toBeNull();expect(container.textContent).toContain('تعذر تحميل المحادثات');
  });
  it.each(['snapshot','conversation','row'])('rejects mismatched message %s and blocks Enter submission',async kind=>{
    if(kind==='snapshot')m.queries.history.data.merchantId=30;
    if(kind==='conversation')m.queries.history.data.conversationId=5;
    if(kind==='row')m.queries.history.data.items[0].conversationId=5;
    await render();await choose();await fill('Keep this draft');
    expect(container.textContent).not.toContain('Private example');expect(send().disabled).toBe(true);
    await act(async()=>{draft().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});expect(m.send).not.toHaveBeenCalled();
  });
  it('keeps drafts separate between conversations and restores them after an identity refresh',async()=>{
    await render();await choose();await fill('Draft four');await choose(5);expect(draft().value).toBe('');await fill('Draft five');await choose();expect(draft().value).toBe('Draft four');
    m.queries.merchant.isFetching=true;await render();expect(draft()).toBeNull();m.queries.merchant.isFetching=false;await render();await choose();expect(draft().value).toBe('Draft four');
  });
  it('does not leak the same conversation draft to another confirmed user',async()=>{
    await render();await choose();await fill('User seven draft');m.queries.user.data={id:8};await render();await choose();expect(draft().value).toBe('');
    m.queries.user.data={id:7};await render();await choose();expect(draft().value).toBe('User seven draft');
  });
  it('does not lose the draft when list polling fails',async()=>{
    await render();await choose();await fill('Preserve through failure');m.queries.list.error=Error('failed');await render();expect(draft()).toBeNull();m.queries.list.error=null;await render();expect(draft().value).toBe('Preserve through failure');
  });
  it('hides failed stale messages from preview and suggestions',async()=>{
    m.queries.history.error=Error('failed');await render();await choose();expect(container.textContent).not.toContain('Private example');expect(container.textContent).toContain('تعذر تحميل الرسائل');
  });
  it('blocks duplicate clicks and clears the saved draft only after acceptance',async()=>{
    await render();await choose();await fill('Send once');await act(async()=>{send().click();send().click();});
    expect(m.attempt).toHaveBeenCalledWith(7,20,4,'Send once');expect(m.send).toHaveBeenCalledTimes(1);expect(m.complete).toHaveBeenCalledTimes(1);expect(draft().value).toBe('');await choose(5);await choose();expect(draft().value).toBe('');expect(m.invalidate).toHaveBeenCalledWith({conversationId:4});
  });
  it('keeps the draft when preparation fails before the request',async()=>{
    m.attempt.mockRejectedValue(Error('storage unavailable'));await render();await choose();await fill('Keep me');await click(send());expect(m.send).not.toHaveBeenCalled();expect(draft().value).toBe('Keep me');
  });
  it('does not send after the user changes while request identity is being prepared',async()=>{
    let release!:(v:any)=>void;m.attempt.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await fill('Old user');await click(send());
    m.queries.user.data={id:8};await render();await choose();await fill('New user');await act(async()=>release({requestId:'old',complete:m.complete,confirmOwner:vi.fn()}));expect(m.send).not.toHaveBeenCalled();expect(draft().value).toBe('New user');
  });
  it('ignores late send results after scope change without clearing another draft or showing success',async()=>{
    let release!:(v:any)=>void;m.send.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await fill('Old request');await click(send());
    m.queries.user.data={id:8};await render();await choose();await fill('New draft');await act(async()=>release({success:true,persisted:true}));expect(draft().value).toBe('New draft');expect(m.success).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
  });
  it('does not upload voice after the scope changes during preparation',async()=>{
    let release!:(v:any)=>void;m.voiceAttempt.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await click(container.querySelector('[data-test-voice]')!);
    m.queries.user.data={id:8};await render();await act(async()=>release({input:{conversationId:4},complete:m.complete,confirmOwner:vi.fn()}));expect(m.voice).not.toHaveBeenCalled();
  });
  it('ignores late voice success and refreshes only the current scope',async()=>{
    let release!:(v:any)=>void;m.voice.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await click(container.querySelector('[data-test-voice]')!);
    m.queries.user.data={id:8};await render();await choose();await fill('New voice context');await act(async()=>release({success:true,persisted:true}));expect(draft().value).toBe('New voice context');expect(m.invalidate).not.toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();
  });
  it('browses earlier windows and back, preserving the draft but requiring the latest context before sending',async()=>{
    const base=m.queries.history.data;
    m.queries.history=({beforeId,conversationId}:any)=>query({...base,conversationId,items:[{...base.items[0],conversationId,id:beforeId===8?3:beforeId===3?1:8,content:beforeId?'Older '+beforeId:'Latest example'}],hasMore:beforeId!==3,nextBeforeId:beforeId===8?3:beforeId===3?null:8});
    const named=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text)!;
    await render();await choose();await fill('Keep while reading');
    await click(named(ar.conversationHistory.older));expect(container.textContent).toContain('Older 8');expect(draft().value).toBe('Keep while reading');expect(draft().disabled).toBe(true);expect(send().disabled).toBe(true);
    expect(m.calls).toHaveBeenCalledWith('history',expect.objectContaining({beforeId:8,limit:50}),expect.objectContaining({refetchInterval:false}));
    await click(named(ar.conversationHistory.older));expect(container.textContent).toContain('Older 3');expect(named(ar.conversationHistory.older).disabled).toBe(true);
    await click(named(ar.conversationHistory.newer));expect(container.textContent).toContain('Older 8');
    await click(named(ar.conversationHistory.latest));expect(container.textContent).toContain('Latest example');expect(draft().disabled).toBe(false);expect(draft().value).toBe('Keep while reading');expect(m.send).not.toHaveBeenCalled();
  });
  it('lets a failed earlier page return to latest without losing its draft',async()=>{
    const base=m.queries.history.data;
    m.queries.history=({beforeId}:any)=>beforeId?{...query(undefined),error:Error('Earlier failed')}:query({...base,hasMore:true,nextBeforeId:8});
    const named=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text)!;
    await render();await choose();await fill('Read failure draft');await click(named(ar.conversationHistory.older));expect(container.textContent).toContain('تعذر تحميل الرسائل');expect(send().disabled).toBe(true);
    await click(named(ar.conversationHistory.latest));expect(draft().value).toBe('Read failure draft');expect(send().disabled).toBe(false);
  });
});
