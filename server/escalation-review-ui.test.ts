// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import copy from '../client/src/locales/merchant-ux.ar';
const m=vi.hoisted(()=>({query:{} as any,calls:vi.fn(),write:vi.fn(),refetch:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{escalationReviewSnapshot:{useQuery:(input:any,options:any)=>{m.calls(input,options);return m.query;}},reviewEscalationRelay:{useMutation:()=>({mutateAsync:m.write})}},useUtils:()=>({conversations:new Proxy({},{get:()=>({invalidate:m.invalidate})})})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar'},t:(key:string,args:Record<string,unknown>={})=>{const value=key.split('.').reduce((v:any,k)=>v?.[k],{merchantUx:copy})??key;return value.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>String(args[key]??''));}})}));
import {EscalationReconciliation} from '../client/src/components/EscalationReconciliation';
const item=()=>({id:19,revision:0,evidence:'a'.repeat(64),state:'pending',outcome:'unresolved',projected:false,sourceMessageId:81,question:'سؤال عميل تجريبي',reply:'إجابة تجريبية',authorPhone:'966500000000',createdAt:'2026-10-01T09:00:00.000Z',receipt:null,lastReview:null});
const snapshot=()=>({merchantId:20,actorUserId:7,conversationId:4,beforeId:null,canManage:true,page:{items:[item()],nextCursor:null}});
let root:Root,container:HTMLDivElement;
const render=(patch:any={})=>act(async()=>root.render(React.createElement(EscalationReconciliation,{merchantId:20,actorUserId:7,conversationId:4,...patch})));
const click=(s:string)=>act(async()=>{(container.querySelector(s) as HTMLElement).click();});
const type=(value:string,s='[data-relay-note]')=>act(async()=>{const el=container.querySelector(s) as HTMLTextAreaElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const note=()=> (container.querySelector('[data-relay-note]') as HTMLTextAreaElement)?.value;
const checked=()=> (container.querySelector('[data-relay-reviewed]') as HTMLInputElement)?.checked;
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);m.query={data:snapshot(),isLoading:false,isFetching:false,isError:false,isFetchedAfterMount:true,dataUpdatedAt:1,refetch:m.refetch};m.write.mockResolvedValue({outcome:'unresolved',customerPhone:'966500000083'});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it.each(['merchant','actor','conversation','cursor','error','cached'])('hides %s rows and actions',async kind=>{
 if(kind==='merchant')m.query.data.merchantId=99;if(kind==='actor')m.query.data.actorUserId=9;if(kind==='conversation')m.query.data.conversationId=5;if(kind==='cursor')m.query.data.beforeId=20;if(kind==='error')m.query.isError=true;if(kind==='cached'){m.query.isFetchedAfterMount=false;m.query.isFetching=true;}await render();expect(container.querySelector('[data-relay-id]')).toBeNull();expect(container.textContent).not.toContain('سؤال عميل تجريبي');expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,beforeId:undefined},expect.objectContaining({refetchOnMount:'always',staleTime:0}));
});
it('retains the note during background updates and read failure recovery without preserving attestation',async()=>{
 await render();await type('ملاحظة لم تحفظ');await click('[data-relay-reviewed]');m.query.isFetching=true;await render();expect(note()).toBe('ملاحظة لم تحفظ');expect((container.querySelector('[data-relay-save]') as HTMLButtonElement).disabled).toBe(true);m.query.isFetching=false;m.query.isError=true;await render();expect(container.querySelector('[data-relay-id]')).toBeNull();m.query.isError=false;await render();expect(note()).toBe('ملاحظة لم تحفظ');expect(checked()).toBe(false);
});
it.each(['evidence','revision','question','permission'])('invalidates attestation when %s changes',async kind=>{
 await render();await type('راجعت الحالة');await click('[data-relay-reviewed]');if(kind==='evidence')m.query.data.page.items[0].evidence='b'.repeat(64);if(kind==='revision')m.query.data.page.items[0].revision++;if(kind==='question')m.query.data.page.items[0].question='سؤال معدل';if(kind==='permission')m.query.data.canManage=false;await render();expect(checked()??false).toBe(false);if(kind!=='permission'){expect(note()).toBe('راجعت الحالة');await click('[data-relay-save]');}else expect(container.querySelector('[data-relay-save]')).toBeNull();expect(m.write).not.toHaveBeenCalled();
});
it('retains page notes when navigating older and back, without refreshing the old cursor',async()=>{
 const page=Array.from({length:10},(_,i)=>({...item(),id:19-i}));m.query.data.page={items:page,nextCursor:10};await render();await type('مسودة الصفحة الأولى');await click('[data-relay-older]');expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,beforeId:10},expect.anything());expect(container.querySelector('[data-relay-id]')).toBeNull();m.query.data={...snapshot(),beforeId:10,page:{items:[{...item(),id:9}],nextCursor:null}};await render();await type('مسودة قديمة');await click('[data-relay-refresh]');expect(m.refetch).not.toHaveBeenCalled();m.query.data=snapshot();m.query.data.page={items:page,nextCursor:10};await render();expect(note()).toBe('مسودة الصفحة الأولى');expect(checked()).toBe(false);
});
it.each(['actor','merchant','conversation'])('isolates notes and ignores pending writes after %s changes',async kind=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await render();await type('خاص بالسياق الأول');await click('[data-relay-reviewed]');await click('[data-relay-save]');const key=kind==='actor'?'actorUserId':kind==='merchant'?'merchantId':'conversationId';m.query.data[key]++;await render({[key]:m.query.data[key]});expect(note()).toBe('');await act(async()=>release({outcome:'unresolved',customerPhone:'966500000083'}));expect(m.invalidate).not.toHaveBeenCalled();expect(m.refetch).not.toHaveBeenCalled();expect(container.querySelector('[data-relay-saved]')).toBeNull();
});
it('prevents repeated writes, clears only the saved note, and updates all affected readers',async()=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await render();await type('  راجعت الحالة  ');await click('[data-relay-reviewed]');await click('[data-relay-save]');await click('[data-relay-save]');expect(m.write).toHaveBeenCalledExactlyOnceWith({conversationId:4,relayId:19,expectedRevision:0,evidence:'a'.repeat(64),reviewed:true,note:'راجعت الحالة'});await act(async()=>release({outcome:'unresolved',customerPhone:'966500000083'}));expect(note()).toBe('');expect(m.refetch).toHaveBeenCalledOnce();expect(m.invalidate).toHaveBeenCalledTimes(6);expect(container.textContent).toContain(copy.relay.unresolved);
});
it.each(['rejected','malformed'])('keeps the note after a %s write and blocks retry until a successful new read',async kind=>{
 if(kind==='rejected')m.write.mockRejectedValue(Error('lost response'));else m.write.mockResolvedValue({outcome:'invented',customerPhone:'private'});await render();await type('راجعت الحالة');await click('[data-relay-reviewed]');await click('[data-relay-save]');expect(note()).toBe('راجعت الحالة');expect(container.textContent).toContain(copy.relay.saveFailed);await type('عدلت الملاحظة');await click('[data-relay-reviewed]');expect(checked()).toBe(false);expect((container.querySelector('[data-relay-save]') as HTMLButtonElement).disabled).toBe(true);await click('[data-relay-retry]');expect(m.refetch).toHaveBeenCalledOnce();m.query.dataUpdatedAt=2;await render();await click('[data-relay-reviewed]');expect((container.querySelector('[data-relay-save]') as HTMLButtonElement).disabled).toBe(false);
});
it('does not erase a note or show success when evidence changes during its save',async()=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await render();await type('راجعت الدليل الأول');await click('[data-relay-reviewed]');await click('[data-relay-save]');m.query.data.page.items[0].evidence='b'.repeat(64);await render();await act(async()=>release({outcome:'unresolved',customerPhone:'966500000083'}));expect(note()).toBe('راجعت الدليل الأول');expect(checked()).toBe(false);expect(m.invalidate).not.toHaveBeenCalled();
});
it('requires a read after failure even if a background read completed during the pending request',async()=>{
 let reject!:(error:Error)=>void;m.write.mockReturnValue(new Promise((_,fail)=>reject=fail));await render();await type('راجعت الحالة');await click('[data-relay-reviewed]');await click('[data-relay-save]');m.query.dataUpdatedAt=2;await render();await act(async()=>reject(Error('response lost after background read')));await click('[data-relay-reviewed]');expect(checked()).toBe(false);m.query.dataUpdatedAt=3;await render();await click('[data-relay-reviewed]');expect(checked()).toBe(true);
});
