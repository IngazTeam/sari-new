// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import copy from '../client/src/locales/merchant-ux.ar';
const m=vi.hoisted(()=>({query:{} as any,calls:vi.fn(),write:vi.fn(),refetch:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{salesOfferReviewSnapshot:{useQuery:(input:any,options:any)=>{m.calls(input,options);return m.query;}},reviewSalesOffer:{useMutation:()=>({mutateAsync:m.write})}},useUtils:()=>({conversations:new Proxy({},{get:()=>({invalidate:m.invalidate})})})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar'},t:(key:string,args:Record<string,unknown>={})=>{const value=key.split('.').reduce((v:any,k)=>v?.[k],{merchantUx:copy})??key;return value.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>String(args[key]??''));}})}));
import {SalesOfferReview} from '../client/src/components/SalesOfferReview';
const item=()=>({id:'00000000-0000-4000-8000-000000000019',revision:0,evidence:'a'.repeat(64),state:'pending',accepted:false,projected:false,projectionConflict:false,attemptState:'unknown',sourceMessageId:81,sourceText:'طلب خصم تجريبي',text:'عرض تجريبي',createdAt:'2026-10-01T09:00:00.000Z',receipt:null,lastReview:null});
const snapshot=()=>({merchantId:20,actorUserId:7,conversationId:4,beforeSourceId:null,canManage:true,page:{items:[item()],nextCursor:null}});
const outcome={accepted:false,projected:false,deliveryState:'pending',outcome:'unresolved'};
let root:Root,container:HTMLDivElement;
const render=(patch:any={})=>act(async()=>root.render(React.createElement(SalesOfferReview,{merchantId:20,actorUserId:7,conversationId:4,...patch})));
const toggle=(open:boolean)=>act(async()=>{const el=container.querySelector('[data-offer-panel]') as HTMLDetailsElement;el.open=open;el.dispatchEvent(new Event('toggle'));});
const start=async()=>{await render();await toggle(true);};
const click=(s:string)=>act(async()=>{(container.querySelector(s) as HTMLElement).click();});
const type=(value:string)=>act(async()=>{const el=container.querySelector('[data-offer-note]') as HTMLTextAreaElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const note=()=> (container.querySelector('[data-offer-note]') as HTMLTextAreaElement)?.value;
const checked=()=> (container.querySelector('[data-offer-reviewed]') as HTMLInputElement)?.checked;
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);m.query={data:snapshot(),isLoading:false,isFetching:false,isError:false,isFetchedAfterMount:true,dataUpdatedAt:1,refetch:m.refetch};m.write.mockResolvedValue(outcome);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('defers private reads until opening and requires a fresh read every time it reopens',async()=>{
 await render();expect(m.calls).not.toHaveBeenCalled();await toggle(true);expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,beforeSourceId:undefined},expect.objectContaining({refetchOnMount:'always',staleTime:0}));await type('مسودة مستمرة');await toggle(false);m.query.isFetchedAfterMount=false;m.query.isFetching=true;await toggle(true);expect(container.querySelector('[data-offer-id]')).toBeNull();m.query.isFetchedAfterMount=true;m.query.isFetching=false;await render();expect(note()).toBe('مسودة مستمرة');expect(checked()).toBe(false);
});
it.each(['merchant','actor','conversation','cursor','error','cached'])('hides %s offer rows and actions',async kind=>{
 if(kind==='merchant')m.query.data.merchantId=99;if(kind==='actor')m.query.data.actorUserId=9;if(kind==='conversation')m.query.data.conversationId=5;if(kind==='cursor')m.query.data.beforeSourceId=82;if(kind==='error')m.query.isError=true;if(kind==='cached'){m.query.isFetchedAfterMount=false;m.query.isFetching=true;}await start();expect(container.querySelector('[data-offer-id]')).toBeNull();expect(container.textContent).not.toContain('طلب خصم تجريبي');
});
it('retains the note through background reads and read-error recovery without retaining attestation',async()=>{
 await start();await type('ملاحظة لم تحفظ');await click('[data-offer-reviewed]');m.query.isFetching=true;await render();expect(note()).toBe('ملاحظة لم تحفظ');expect((container.querySelector('[data-offer-save]') as HTMLButtonElement).disabled).toBe(true);m.query.isFetching=false;m.query.isError=true;await render();expect(container.querySelector('[data-offer-id]')).toBeNull();m.query.isError=false;await render();expect(note()).toBe('ملاحظة لم تحفظ');expect(checked()).toBe(false);
});
it.each(['evidence','revision','source','permission'])('invalidates attestation when %s changes',async kind=>{
 await start();await type('راجعت الحالة');await click('[data-offer-reviewed]');if(kind==='evidence')m.query.data.page.items[0].evidence='b'.repeat(64);if(kind==='revision')m.query.data.page.items[0].revision++;if(kind==='source')m.query.data.page.items[0].sourceText='طلب مختلف';if(kind==='permission')m.query.data.canManage=false;await render();expect(checked()??false).toBe(false);if(kind!=='permission'){expect(note()).toBe('راجعت الحالة');await click('[data-offer-save]');}else expect(container.querySelector('[data-offer-save]')).toBeNull();expect(m.write).not.toHaveBeenCalled();
});
it('preserves page notes and cursor while closing, and returns to latest without refetching the old cursor',async()=>{
 const page=Array.from({length:10},(_,i)=>({...item(),id:'00000000-0000-4000-8000-'+String(19-i).padStart(12,'0'),sourceMessageId:81-i}));m.query.data.page={items:page,nextCursor:72};await start();await type('مسودة أحدث صفحة');await click('[data-offer-older]');expect(container.querySelector('[data-offer-id]')).toBeNull();m.query.data={...snapshot(),beforeSourceId:72,page:{items:[{...item(),sourceMessageId:71,id:'00000000-0000-4000-8000-000000000009'}],nextCursor:null}};await render();await type('مسودة أقدم صفحة');await toggle(false);await toggle(true);expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,beforeSourceId:72},expect.anything());expect(note()).toBe('مسودة أقدم صفحة');await click('[data-offer-refresh]');expect(m.refetch).not.toHaveBeenCalled();m.query.data=snapshot();m.query.data.page={items:page,nextCursor:72};await render();expect(note()).toBe('مسودة أحدث صفحة');
});
it.each(['actor','merchant','conversation'])('isolates notes and ignores pending writes after %s changes',async kind=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await start();await type('خاص بالسياق الأول');await click('[data-offer-reviewed]');await click('[data-offer-save]');const key=kind==='actor'?'actorUserId':kind==='merchant'?'merchantId':'conversationId';m.query.data[key]++;await render({[key]:m.query.data[key]});expect((container.querySelector('[data-offer-panel]') as HTMLDetailsElement).open).toBe(false);await toggle(true);expect(note()).toBe('');await act(async()=>release(outcome));expect(m.invalidate).not.toHaveBeenCalled();expect(m.refetch).not.toHaveBeenCalled();expect(container.querySelector('[data-offer-saved]')).toBeNull();
});
it('ignores a response after closing the panel and retains its unconfirmed note',async()=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await start();await type('ملاحظة الطلب الجاري');await click('[data-offer-reviewed]');await click('[data-offer-save]');await toggle(false);await act(async()=>release(outcome));expect(m.invalidate).not.toHaveBeenCalled();await toggle(true);expect(note()).toBe('ملاحظة الطلب الجاري');expect(checked()).toBe(false);
});
it('writes once, clears the confirmed note and refreshes the affected readers',async()=>{
 let release!:(value:any)=>void;m.write.mockReturnValue(new Promise(resolve=>release=resolve));await start();await type('  راجعت الحالة  ');await click('[data-offer-reviewed]');await click('[data-offer-save]');await click('[data-offer-save]');expect(m.write).toHaveBeenCalledExactlyOnceWith({conversationId:4,attemptId:item().id,expectedRevision:0,evidence:item().evidence,reviewed:true,note:'راجعت الحالة'});await act(async()=>release(outcome));expect(note()).toBe('');expect(m.refetch).toHaveBeenCalledOnce();expect(m.invalidate).toHaveBeenCalledTimes(6);expect(container.textContent).toContain(copy.offerReview.unresolved);
});
it.each(['rejected','contradictory'])('retains a failed note and requires a new read after %s results',async kind=>{
 if(kind==='rejected')m.write.mockRejectedValue(Error('lost'));else m.write.mockResolvedValue({...outcome,projected:true,outcome:'recorded'});await start();await type('راجعت الحالة');await click('[data-offer-reviewed]');await click('[data-offer-save]');expect(note()).toBe('راجعت الحالة');expect(container.textContent).toContain(copy.offerReview.saveFailed);await type('عدلت الملاحظة');await click('[data-offer-reviewed]');expect(checked()).toBe(false);await click('[data-offer-retry]');expect(m.refetch).toHaveBeenCalledOnce();m.query.dataUpdatedAt=2;await render();await click('[data-offer-reviewed]');expect((container.querySelector('[data-offer-save]') as HTMLButtonElement).disabled).toBe(false);
});
it('requires a read after failure when background refresh completes during the write',async()=>{
 let reject!:(error:Error)=>void;m.write.mockReturnValue(new Promise((_,fail)=>reject=fail));await start();await type('راجعت الحالة');await click('[data-offer-reviewed]');await click('[data-offer-save]');m.query.dataUpdatedAt=2;await render();await act(async()=>reject(Error('lost response')));await click('[data-offer-reviewed]');expect(checked()).toBe(false);m.query.dataUpdatedAt=3;await render();await click('[data-offer-reviewed]');expect(checked()).toBe(true);
});
it('shows prior accepted receipts and projection conflicts without claiming successful recording',async()=>{
 m.query.data.page.items[0]={...item(),state:'failed',accepted:true,receipt:'receipt-1',projectionConflict:true};await start();expect(container.querySelector('[data-offer-projection=conflict]')).toBeTruthy();expect(container.textContent).toContain(copy.offerReview.priorAcceptance);expect(container.textContent).toContain(copy.offerReview.projectionConflict);expect(container.textContent).not.toContain(copy.offerReview.projected);
});
