// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import copy from '../client/src/locales/merchant-ux.ar';
const m=vi.hoisted(()=>({query:{} as any,calls:vi.fn(),check:vi.fn(),invalidate:vi.fn(),refetch:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{staffAttemptSnapshot:{useQuery:(input:any,options:any)=>{m.calls(input,options);return m.query;}},checkStaffAttempt:{useMutation:()=>({mutateAsync:m.check,isPending:false})}},useUtils:()=>({conversations:new Proxy({},{get:()=>({invalidate:m.invalidate})})})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar'},t:(key:string,args:Record<string,unknown>={})=>{
  const value=key.split('.').reduce((v:any,k)=>v?.[k],{merchantUx:copy})??key;
  return value.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>String(args[key]??''));
}})}));
import {StaffAttemptReview} from '../client/src/components/StaffAttemptReview';
let root:Root,container:HTMLDivElement;
const item={id:20,createdAt:'2026-10-01T09:00:00.000Z',state:'pending',persisted:null};
const snapshot=(patch:any={})=>({merchantId:20,actorUserId:7,conversationId:4,kind:'text',beforeId:null,page:{items:[item],nextCursor:null},...patch});
const render=(patch:any={})=>act(async()=>root.render(React.createElement(StaffAttemptReview,{merchantId:20,actorUserId:7,conversationId:4,...patch})));
const open=()=>act(async()=>{const el=container.querySelector('details')!;el.open=true;el.dispatchEvent(new Event('toggle'));});
const click=(selector:string)=>act(async()=>{(container.querySelector(selector) as HTMLButtonElement).click();});
beforeEach(()=>{
  vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  m.query={data:snapshot(),isLoading:false,isFetching:false,isError:false,dataUpdatedAt:1,refetch:m.refetch};m.check.mockResolvedValue({success:false,status:'pending',persisted:false});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('keeps queries disabled until opened and requests a fresh read',async()=>{
  await render();expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,kind:'text',beforeId:undefined},expect.objectContaining({enabled:false,staleTime:0,refetchOnMount:'always'}));expect(container.querySelector('[data-staff-attempt]')).toBeNull();
  await open();expect(m.calls).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({enabled:true}));expect(container.querySelector('[data-staff-attempt="20"]')).toBeTruthy();
});
it.each([{merchantId:99},{actorUserId:8},{conversationId:9},{kind:'voice'},{beforeId:10}])('hides mismatched snapshot %j',async patch=>{
  m.query.data=snapshot(patch);await render();await open();expect(container.querySelector('[data-staff-attempt]')).toBeNull();expect(container.textContent).toContain(copy.staffAttempts.invalid);
});
it.each(['loading','fetching','error'])('hides prior rows during %s and keeps an explicit state',async condition=>{
  m.query[condition==='loading'?'isLoading':condition==='fetching'?'isFetching':'isError']=true;await render();await open();expect(container.querySelector('[data-staff-attempt]')).toBeNull();expect(container.textContent).toContain(condition==='error'?copy.staffAttempts.loadFailed:copy.staffAttempts.loading);
});
it('does not show text rows under the voice tab while a new response is pending',async()=>{
  await render();await open();await click('[data-attempt-kind=voice]');expect(container.querySelector('[data-staff-attempt]')).toBeNull();m.query.data=snapshot({kind:'voice'});await render();expect(container.querySelector('[data-staff-attempt]')).toBeTruthy();
});
it('resets an open panel on actor changes and rejects the previous cached snapshot',async()=>{
  await render();await open();await render({actorUserId:8});expect(container.querySelector('details')?.open).toBe(false);await open();expect(container.querySelector('[data-staff-attempt]')).toBeNull();
});
it('suppresses a late review result after changing conversations',async()=>{
  let release!:(result:any)=>void;m.check.mockReturnValue(new Promise(resolve=>release=resolve));await render();await open();await click('[data-attempt-check]');await render({conversationId:5});await act(async()=>release({success:true,status:'accepted',persisted:true}));expect(m.invalidate).not.toHaveBeenCalled();expect(container.querySelector('[data-attempt-notice]')).toBeNull();
});
it('checks a source only once and invalidates both compatible and snapshot readers',async()=>{
  let release!:(result:any)=>void;m.check.mockReturnValue(new Promise(resolve=>release=resolve));await render();await open();await click('[data-attempt-check]');await click('[data-attempt-check]');expect(m.check).toHaveBeenCalledExactlyOnceWith({conversationId:4,kind:'text',sourceId:20});await act(async()=>release({success:false,status:'pending',persisted:false}));expect(m.invalidate).toHaveBeenCalledTimes(4);expect(container.textContent).toContain(copy.staffAttempts.unresolved);
});
it('keeps a failed check blocked until an explicit fresh response arrives',async()=>{
  m.check.mockRejectedValue(Error('private'));await render();await open();await click('[data-attempt-check]');expect((container.querySelector('[data-attempt-check]') as HTMLButtonElement).disabled).toBe(true);expect(container.textContent).not.toContain('private');
  await click('[data-attempt-refresh]');expect(m.refetch).toHaveBeenCalledOnce();m.query.dataUpdatedAt=2;await render();expect((container.querySelector('[data-attempt-check]') as HTMLButtonElement).disabled).toBe(false);
});
it('rejects the previous cursor page while browsing older attempts and returns to latest',async()=>{
  m.query.data=snapshot({page:{items:Array.from({length:20},(_,index)=>({...item,id:40-index})),nextCursor:21}});await render();await open();await click('[data-attempt-older]');
  expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,kind:'text',beforeId:21},expect.anything());expect(container.querySelector('[data-staff-attempt]')).toBeNull();
  m.query.data=snapshot({beforeId:21});await render();expect(container.querySelector('[data-staff-attempt="20"]')).toBeTruthy();await click('[data-attempt-refresh]');expect(m.calls).toHaveBeenLastCalledWith({conversationId:4,kind:'text',beforeId:undefined},expect.anything());expect(container.querySelector('[data-staff-attempt]')).toBeNull();
});
