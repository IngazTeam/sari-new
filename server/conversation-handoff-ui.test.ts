// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import copy from '../client/src/locales/merchant-ux.ar';
const m=vi.hoisted(()=>({query:{} as any,source:{} as any,calls:vi.fn(),sourceCalls:vi.fn(),write:vi.fn(),invalidate:vi.fn(),refetch:vi.fn(),sourceRefetch:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{handoffSnapshot:{useQuery:(input:any,opts:any)=>{m.calls(input,opts);return m.query;}},handoffSourceSnapshot:{useQuery:(input:any,opts:any)=>{m.sourceCalls(input,opts);return m.source;}},setOwnership:{useMutation:()=>({mutateAsync:m.write})}},useUtils:()=>({conversations:{getHandoff:{invalidate:m.invalidate}}})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar',dir:()=> 'rtl'},t:(key:string,args:Record<string,unknown>={})=>{
 const value=key.split('.').reduce((v:any,k)=>v?.[k],{merchantUx:copy,common:{close:'إغلاق'}})??key;return value.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>String(args[key]??''));
}})}));
import {ConversationHandoff} from '../client/src/components/ConversationHandoff';
const at='2026-10-01T09:00:00.000Z';
const snapshot=()=>({merchantId:20,actorUserId:7,canManage:true,summary:{conversationId:4,version:1,lastMessageId:81,humanOwned:true,expiresAt:null,dealStage:null,lossReason:null,facts:[],messages:[{id:81,role:'customer',text:'مقتطف الدليل',at}],offers:[]}});
const ready=(data:any,refetch=m.refetch)=>({data,isLoading:false,isFetching:false,isError:false,isFetchedAfterMount:true,refetch});
let root:Root,container:HTMLDivElement;
const render=(patch:any={})=>act(async()=>root.render(React.createElement(ConversationHandoff,{merchantId:20,actorUserId:7,conversationId:4,...patch})));
const click=(selector:string)=>act(async()=>{(document.querySelector(selector) as HTMLElement).click();});
const text=()=>document.body.textContent;
beforeEach(()=>{
 vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 m.query=ready(snapshot());m.source=ready({merchantId:20,actorUserId:7,conversationId:4,message:{id:81,role:'customer',text:'النص الكامل للمصدر',at}},m.sourceRefetch);
 m.refetch.mockImplementation(async()=>m.query);m.sourceRefetch.mockImplementation(async()=>m.source);m.write.mockResolvedValue({changed:true,merchantId:20,version:2});
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('waits for a fresh mount read and defers exact-source reads until opened',async()=>{
 m.query.isFetchedAfterMount=false;m.query.isFetching=true;await render();expect(text()).not.toContain('مقتطف الدليل');expect(document.querySelector('[data-handoff-save]')).toBeNull();expect(m.sourceCalls).not.toHaveBeenCalled();expect(m.calls).toHaveBeenLastCalledWith({conversationId:4},expect.objectContaining({refetchOnMount:'always',staleTime:0}));
});
it.each(['merchant','actor','conversation','error','malformed'])('hides %s snapshots including ownership controls',async kind=>{
 if(kind==='merchant')m.query.data.merchantId=99;if(kind==='actor')m.query.data.actorUserId=8;if(kind==='conversation')m.query.data.summary.conversationId=5;if(kind==='error')m.query.isError=true;if(kind==='malformed')m.query.data.summary.messages[0].at='invalid';await render();expect(text()).not.toContain('مقتطف الدليل');expect(document.querySelector('[data-handoff-save]')).toBeNull();expect(text()).toContain(copy.handoff.loadFailed);await click('[data-handoff-refresh]');expect(m.refetch).toHaveBeenCalledOnce();
});
it('keeps current evidence readable during background updates and disables the action',async()=>{
 await render();await click('[data-handoff-reviewed]');m.query.isFetching=true;await render();expect(text()).toContain('مقتطف الدليل');expect((document.querySelector('[data-handoff-save]') as HTMLButtonElement).disabled).toBe(true);await click('[data-handoff-save]');expect(m.write).not.toHaveBeenCalled();m.query.isFetching=false;await render();expect((document.querySelector('[data-handoff-reviewed]') as HTMLInputElement).checked).toBe(true);
});
it.each(['version','lastMessage','facts','permission'])('requires reviewing again when %s changes',async kind=>{
 await render();await click('[data-handoff-reviewed]');if(kind==='version')m.query.data.summary.version++;if(kind==='lastMessage')m.query.data.summary.lastMessageId++;if(kind==='facts')m.query.data.summary.messages[0].text='دليل معدل';if(kind==='permission')m.query.data.canManage=false;await render();expect((document.querySelector('[data-handoff-reviewed]') as HTMLInputElement|null)?.checked??false).toBe(false);await clickIfPresent('[data-handoff-save]');expect(m.write).not.toHaveBeenCalled();
});
async function clickIfPresent(selector:string){if(document.querySelector(selector))await click(selector);}
it('sends one reviewed transition and refreshes before enabling another action',async()=>{
 let release!:(data:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await render();await click('[data-handoff-reviewed]');await click('[data-handoff-save]');await click('[data-handoff-save]');expect(m.write).toHaveBeenCalledExactlyOnceWith({conversationId:4,expectedVersion:1,expectedLastMessageId:81,reviewed:true,action:'resume'});await act(async()=>release({changed:true,merchantId:20,version:2}));expect(m.invalidate).toHaveBeenCalledExactlyOnceWith({conversationId:4});expect((document.querySelector('[data-handoff-save]') as HTMLButtonElement).disabled).toBe(true);
 m.query.data.summary.version=2;m.query.data.summary.humanOwned=false;await render();await click('[data-handoff-refresh]');expect((document.querySelector('[data-handoff-save]') as HTMLButtonElement).disabled).toBe(false);
});
it.each(['merchant','version','lost-response'])('requires a fresh read after %s write failure',async kind=>{
 if(kind==='lost-response')m.write.mockRejectedValue(Error('lost'));else m.write.mockResolvedValue({changed:true,merchantId:kind==='merchant'?99:20,version:kind==='version'?9:2});await render();await click('[data-handoff-reviewed]');await click('[data-handoff-save]');expect(text()).toContain(copy.handoff.failed);expect((document.querySelector('[data-handoff-reviewed]') as HTMLInputElement).disabled).toBe(true);expect(m.invalidate).not.toHaveBeenCalled();m.refetch.mockResolvedValue({...m.query,isError:true});await click('[data-handoff-refresh]');expect((document.querySelector('[data-handoff-save]') as HTMLButtonElement).disabled).toBe(true);m.refetch.mockResolvedValue(m.query);await click('[data-handoff-refresh]');await click('[data-handoff-reviewed]');expect((document.querySelector('[data-handoff-save]') as HTMLButtonElement).disabled).toBe(false);
});
it.each(['actor','conversation','evidence'])('ignores a late result after %s changes',async kind=>{
 let release!:(data:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await render();await click('[data-handoff-reviewed]');await click('[data-handoff-save]');const patch:any={};if(kind==='actor'){patch.actorUserId=9;m.query.data.actorUserId=9;}if(kind==='conversation'){patch.conversationId=5;m.query.data.summary.conversationId=5;}if(kind==='evidence')m.query.data.summary.lastMessageId=82;await render(patch);await act(async()=>release({changed:true,merchantId:20,version:2}));expect(m.invalidate).not.toHaveBeenCalled();expect(text()).not.toContain(copy.handoff.saved);
});
it.each(['merchant','actor','conversation','message','error','fetching','cached'])('does not show %s source content',async kind=>{
 if(kind==='merchant')m.source.data.merchantId=99;if(kind==='actor')m.source.data.actorUserId=8;if(kind==='conversation')m.source.data.conversationId=5;if(kind==='message')m.source.data.message.id=82;if(kind==='error')m.source.isError=true;if(kind==='fetching')m.source.isFetching=true;if(kind==='cached')m.source.isFetchedAfterMount=false;await render();await click('a[href="#conversation-message-81"]');expect(text()).not.toContain('النص الكامل للمصدر');expect(m.sourceCalls).toHaveBeenLastCalledWith({conversationId:4,messageId:81},expect.objectContaining({refetchOnMount:'always',gcTime:0}));
});
it('opens full source text, closes accessibly, and rereads when reopened',async()=>{
 await render();await click('a[href="#conversation-message-81"]');expect(document.querySelector('[role=dialog]')).toBeTruthy();expect(text()).toContain('النص الكامل للمصدر');await click('[data-slot=dialog-close]');expect(document.querySelector('[data-handoff-source]')).toBeNull();m.source.isFetching=true;await click('a[href="#conversation-message-81"]');expect(text()).not.toContain('النص الكامل للمصدر');
});
