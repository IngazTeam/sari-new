// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import merchantAr from '../client/src/locales/merchant-ux.ar';
const m=vi.hoisted(()=>({queries:{} as Record<string,any>,calls:vi.fn(),send:vi.fn(),voice:vi.fn(),attempt:vi.fn(),voiceAttempt:vi.fn(),complete:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('@/lib/trpc',()=>{
  const query=(name:string)=>({useQuery:(input:any,options:any)=>{
    m.calls(name,input,options);return options?.enabled===false?{data:undefined,isLoading:false,isFetching:false,error:null,refetch:vi.fn()}:typeof m.queries[name]==='function'?m.queries[name](input,options):m.queries[name];
  }});
  const mutation=(call=vi.fn())=>({useMutation:()=>({mutateAsync:call,isPending:false})});
  const util=new Proxy({}, {get:()=>({invalidate:m.invalidate})});
  return {trpc:{auth:{me:query('user')},merchants:{getCurrent:query('merchant')},conversations:{list:query('list'),messageHistory:query('history'),connectionStatus:query('connection'),sendReply:mutation(m.send),sendVoiceReply:mutation(m.voice),syncFromWhatsApp:mutation(),diagnoseWebhook:mutation()},useUtils:()=>({conversations:util})}};
});
vi.mock('@/lib/staff-dashboard-attempt',()=>({staffDashboardAttempt:m.attempt}));
vi.mock('@/lib/staff-voice-attempt',()=>({staffVoiceAttempt:m.voiceAttempt}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,warning:m.warning,info:vi.fn()}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar',dir:()=> 'rtl'},t:(key:string)=>{
  const source={...ar,merchantUx:merchantAr};return key.split('.').reduce((v:any,k)=>v?.[k],source)??key;
}})}));
vi.mock('@/components/StaffTeamReview',()=>({StaffTeamReview:()=>null}));
vi.mock('@/components/StaffAttemptReview',()=>({StaffAttemptReview:()=>null}));
vi.mock('@/components/ConversationHandoff',()=>({ConversationHandoff:()=>null}));
vi.mock('@/components/EscalationReconciliation',()=>({EscalationReconciliation:()=>null}));
vi.mock('@/components/SalesOfferReview',()=>({SalesOfferReview:()=>null}));
vi.mock('@/components/AISuggestions',()=>({AISuggestions:()=>null}));
vi.mock('@/components/QuickActions',()=>({QuickActionsBar:()=>null}));
vi.mock('@/components/ConversationPreviewMode',()=>({ConversationPreviewMode:()=>null}));
vi.mock('@/components/VoiceRecorder',()=>({VoiceRecorder:({disabled,onRecordingComplete}:any)=>React.createElement('button',{'data-test-voice':true,disabled,onClick:()=>void onRecordingComplete(new Blob(['local fixture']),1)},'Voice fixture')}));
import Conversations from '../client/src/pages/merchant/Conversations';
let root:Root,container:HTMLDivElement;
const query=(data:any)=>({data,error:null,isLoading:false,isFetching:false,refetch:vi.fn()});
const render=()=>act(async()=>root.render(React.createElement(Conversations)));
const click=(element:Element)=>act(async()=>{(element as HTMLElement).click();});
const choose=(id=4)=>click(container.querySelector(`[data-staff-conversation="${id}"]`)!);
const draft=()=>container.querySelector('[data-staff-draft]') as HTMLTextAreaElement;
const send=()=>container.querySelector('[data-staff-send]') as HTMLButtonElement;
const fill=(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(draft(),value);draft().dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(()=>{
  vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  const items=[4,5].map(id=>({id,merchantId:20,customerName:`Customer ${id}`,customerPhone:`local-${id}`,status:'active',lastMessageAt:'2026-10-01 10:00:00'}));
  m.queries={user:query({id:7}),merchant:query({id:20,timezone:'Asia/Riyadh'}),list:query({merchantId:20,items,total:2,page:1,totalPages:1,pageSize:50}),history:query({merchantId:20,conversationId:4,items:[{id:8,conversationId:4,content:'Private example',direction:'incoming',messageType:'text',createdAt:'2026-10-01 10:00:00'}],hasMore:false,nextBeforeId:null}),connection:query(undefined)};
  m.attempt.mockResolvedValue({requestId:'00000000-0000-4000-8000-000000000001',complete:m.complete});m.send.mockResolvedValue({success:true,persisted:true});
  m.voiceAttempt.mockResolvedValue({input:{conversationId:4,requestId:'00000000-0000-4000-8000-000000000002'},complete:m.complete});m.voice.mockResolvedValue({success:true,persisted:true});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe('verified inbox scope and draft lifetime',()=>{
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
    expect(m.send).toHaveBeenCalledTimes(1);expect(m.complete).toHaveBeenCalledTimes(1);expect(draft().value).toBe('');await choose(5);await choose();expect(draft().value).toBe('');expect(m.invalidate).toHaveBeenCalledWith({conversationId:4});
  });
  it('keeps the draft when preparation fails before the request',async()=>{
    m.attempt.mockRejectedValue(Error('storage unavailable'));await render();await choose();await fill('Keep me');await click(send());expect(m.send).not.toHaveBeenCalled();expect(draft().value).toBe('Keep me');
  });
  it('does not send after the user changes while request identity is being prepared',async()=>{
    let release!:(v:any)=>void;m.attempt.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await fill('Old user');await click(send());
    m.queries.user.data={id:8};await render();await choose();await fill('New user');await act(async()=>release({requestId:'old',complete:m.complete}));expect(m.send).not.toHaveBeenCalled();expect(draft().value).toBe('New user');
  });
  it('ignores late send results after scope change without clearing another draft or showing success',async()=>{
    let release!:(v:any)=>void;m.send.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await fill('Old request');await click(send());
    m.queries.user.data={id:8};await render();await choose();await fill('New draft');await act(async()=>release({success:true,persisted:true}));expect(draft().value).toBe('New draft');expect(m.success).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
  });
  it('does not upload voice after the scope changes during preparation',async()=>{
    let release!:(v:any)=>void;m.voiceAttempt.mockReturnValue(new Promise(resolve=>release=resolve));await render();await choose();await click(container.querySelector('[data-test-voice]')!);
    m.queries.user.data={id:8};await render();await act(async()=>release({input:{conversationId:4},complete:m.complete}));expect(m.voice).not.toHaveBeenCalled();
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
