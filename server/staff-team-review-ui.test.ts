// @vitest-environment jsdom
import React,{act} from 'react';
import {webcrypto} from 'node:crypto';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import copy from '../client/src/locales/merchant-ux.ar';
import ar from '../client/src/locales/ar.json';
const m=vi.hoisted(()=>({access:{} as any,query:{} as any,accessCalls:vi.fn(),calls:vi.fn(),check:vi.fn(),invalidate:vi.fn(),refetch:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{staffTeamContext:{useQuery:(input:any,options:any)=>{m.accessCalls(input,options);return m.access;}},staffTeamSnapshot:{useQuery:(input:any,options:any)=>{m.calls(input,options);return m.query;}},checkTeamStaffAttempt:{useMutation:()=>({mutateAsync:m.check,isPending:false})}},useUtils:()=>({conversations:new Proxy({},{get:()=>({invalidate:m.invalidate})})})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'ar'},t:(key:string,args:Record<string,unknown>={})=>{
  const value=key.split('.').reduce((v:any,k)=>v?.[k],{...ar,merchantUx:copy})??key;return value.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>String(args[key]??''));
}})}));
import {StaffTeamReview} from '../client/src/components/StaffTeamReview';
let root:Root,container:HTMLDivElement;
const item={attempt:{id:20,createdAt:'2026-10-01T09:00:00.000Z',state:'pending',persisted:null},conversationId:4,authorUserId:8};
const snapshot=(patch:any={})=>({merchantId:20,actorUserId:7,kind:'text',mode:'attempts',conversationId:null,authorUserId:null,beforeId:null,page:{items:[item],nextCursor:null},...patch});
const render=(patch:any={})=>act(async()=>root.render(React.createElement(StaffTeamReview,{merchantId:20,actorUserId:7,...patch})));
const open=()=>act(async()=>{const el=container.querySelector('details')!;el.open=true;el.dispatchEvent(new Event('toggle'));});
const click=(selector:string)=>act(async()=>{(container.querySelector(selector) as HTMLButtonElement).click();});
const input=(selector:string,value:string)=>act(async()=>{const el=container.querySelector(selector) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const reason=()=>act(async()=>{const el=container.querySelector('select')!;el.value='delivery_check';el.dispatchEvent(new Event('change',{bubbles:true}));});
const ready=(data:any)=>({data,isLoading:false,isFetching:false,isError:false,dataUpdatedAt:1,refetch:m.refetch});
beforeEach(()=>{
  sessionStorage.clear();
  vi.resetAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('crypto',webcrypto);
  m.access=ready({merchantId:20,actorUserId:7,canReview:true});m.query=ready(snapshot());m.check.mockResolvedValue({reviewId:1,result:{success:false,status:'pending',persisted:false}});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('opens the compact team dialog only on demand and restores trigger focus',async()=>{
 await render({compact:true});expect(m.calls).not.toHaveBeenCalled();const trigger=container.querySelector('[data-team-compact]') as HTMLButtonElement;await act(async()=>trigger.click());expect(document.body.querySelector('[role=dialog]')).toBeTruthy();expect(m.calls).toHaveBeenCalled();
 await act(async()=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent===copy.conversationTools.close)!.click());expect(document.body.querySelector('[role=dialog]')).toBeNull();await vi.waitFor(()=>expect(document.activeElement).toBe(trigger));
});
it.each(['fetching','error','foreign','denied'])('compact mode protects review reads with %s access',async state=>{
 if(state==='fetching')m.access.isFetching=true;if(state==='error')m.access.isError=true;if(state==='foreign')m.access.data.actorUserId=99;if(state==='denied')m.access.data.canReview=false;
 await render({compact:true});const trigger=container.querySelector('[data-team-compact]') as HTMLButtonElement|null;if(trigger&&!trigger.disabled)await act(async()=>trigger.click());expect(m.calls).not.toHaveBeenCalled();
 if(state==='denied')expect(trigger).toBeNull();
});
it.each(['loading','fetching','error','merchant','actor','denied'])('does not mount review reads with %s permission state',async state=>{
  if(state==='loading')m.access.isLoading=true;if(state==='fetching')m.access.isFetching=true;if(state==='error')m.access.isError=true;
  if(state==='merchant')m.access.data.merchantId=99;if(state==='actor')m.access.data.actorUserId=8;if(state==='denied')m.access.data.canReview=false;
  await render();expect(container.querySelector('details')).toBeNull();expect(m.calls).not.toHaveBeenCalled();
});
it('requests fresh access and keeps data reads deferred until the disclosure opens',async()=>{
  await render();expect(m.accessCalls).toHaveBeenLastCalledWith(undefined,expect.objectContaining({refetchOnMount:'always',staleTime:0}));expect(m.calls).not.toHaveBeenCalled();await open();expect(m.calls).toHaveBeenLastCalledWith({kind:'text',mode:'attempts',beforeId:undefined},expect.objectContaining({refetchOnMount:'always'}));expect(container.querySelector('[data-team-attempt="20"]')).toBeTruthy();
});
it.each([{merchantId:99},{actorUserId:8},{kind:'voice'},{conversationId:4},{authorUserId:8},{beforeId:30}])('hides another snapshot context %j',async patch=>{
  m.query.data=snapshot(patch);await render();await open();expect(container.querySelector('[data-team-attempt]')).toBeNull();expect(container.textContent).toContain(copy.teamAttempts.invalid);
});
it.each(['loading','fetching','error'])('hides old rows during a %s snapshot state',async state=>{
  m.query[state==='loading'?'isLoading':state==='fetching'?'isFetching':'isError']=true;await render();await open();expect(container.querySelector('[data-team-attempt]')).toBeNull();expect(container.textContent).toContain(state==='error'?copy.teamAttempts.loadFailed:copy.teamAttempts.loading);
});
it('separates audit and attempt modes and verifies the audit kind',async()=>{
  await render();await open();await click('[data-team-mode=history]');expect(container.querySelector('[data-team-attempt]')).toBeNull();
  const audit={id:30,kind:'text',sourceId:20,conversationId:4,authorUserId:8,reviewerUserId:7,reason:'delivery_check',createdAt:'2026-10-01T09:00:00.000Z',result:{success:false,status:'pending',persisted:false}};
  m.query.data=snapshot({mode:'history',page:{items:[audit],nextCursor:null}});await render();expect(container.querySelector('[data-team-audit="30"]')).toBeTruthy();m.query.data.page.items[0].kind='voice';await render();expect(container.querySelector('[data-team-audit]')).toBeNull();
});
it('applies both exact filters and rejects stale or invalid results',async()=>{
  await render();await open();await input('[data-team-conversation]','4');await input('[data-team-author]','8');await click('[data-team-apply]');expect(m.calls).toHaveBeenLastCalledWith(expect.objectContaining({conversationId:4,authorUserId:8}),expect.anything());expect(container.querySelector('[data-team-attempt]')).toBeNull();
  m.query.data=snapshot({conversationId:4,authorUserId:8});await render();expect(container.querySelector('[data-team-attempt]')).toBeTruthy();await input('[data-team-conversation]','-1');await click('[data-team-apply]');expect(container.textContent).toContain(copy.teamAttempts.filtersInvalid);expect(m.calls).toHaveBeenLastCalledWith(expect.objectContaining({conversationId:4,authorUserId:8}),expect.anything());
});
it('resets the panel after account changes and ignores a late check result',async()=>{
  let release!:(result:any)=>void;m.check.mockReturnValue(new Promise(resolve=>release=resolve));await render();await open();await reason();await click('[data-team-check]');m.access.data.actorUserId=9;await render({actorUserId:9});expect(container.querySelector('details')?.open).toBe(false);await act(async()=>release({reviewId:1,result:{success:true,status:'accepted',persisted:true}}));expect(m.invalidate).not.toHaveBeenCalled();
});
it('checks once and refreshes the new and compatible readers after success',async()=>{
  let release!:(result:any)=>void;m.check.mockReturnValue(new Promise(resolve=>release=resolve));await render();await open();await reason();await click('[data-team-check]');await click('[data-team-check]');expect(m.check).toHaveBeenCalledOnce();expect(m.check).toHaveBeenCalledWith(expect.objectContaining({kind:'text',sourceId:20,conversationId:4,authorUserId:8,reason:'delivery_check'}));await act(async()=>release({reviewId:1,result:{success:false,status:'pending',persisted:false}}));expect(m.invalidate).toHaveBeenCalledTimes(7);
});
it('lets a failed access read retry without mounting private rows',async()=>{
  m.access.isError=true;await render();await click('button');expect(m.refetch).toHaveBeenCalledOnce();expect(m.calls).not.toHaveBeenCalled();
});
const close=()=>act(async()=>{const el=container.querySelector('details')!;el.open=false;el.dispatchEvent(new Event('toggle'));});
it('restores an uncertain administrative request and reason after closing the panel',async()=>{
  m.check.mockRejectedValue(Error('response lost'));await render();await open();await reason();await click('[data-team-check]');const first=m.check.mock.calls[0][0];
  expect(Object.keys(first).sort()).toEqual(['authorUserId','conversationId','kind','reason','requestId','sourceId']);
  await close();await open();expect(container.querySelector('[data-team-restored]')).toBeTruthy();expect(container.querySelector('select')?.value).toBe('delivery_check');expect(container.querySelector('select')?.disabled).toBe(true);
  await click('[data-team-check]');expect(m.check.mock.calls[1][0]).toEqual(first);
});
it('retains an old pending request when its late response arrives after closing',async()=>{
  let release!:(result:any)=>void;m.check.mockReturnValue(new Promise(resolve=>release=resolve));await render();await open();await reason();await click('[data-team-check]');const first=m.check.mock.calls[0][0];await close();await act(async()=>release({reviewId:1,result:{success:false,status:'pending',persisted:false}}));expect(m.invalidate).not.toHaveBeenCalled();
  await open();m.check.mockResolvedValue({reviewId:1,result:{success:false,status:'pending',persisted:false}});await click('[data-team-check]');expect(m.check.mock.calls[1][0]).toEqual(first);expect(container.querySelector('[data-team-restored]')).toBeNull();
});
it('does not start a server review until the local reference is durably saved',async()=>{
  await render();await open();await reason();const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{});await click('[data-team-check]');expect(m.check).not.toHaveBeenCalled();expect(container.querySelector('[data-team-storage-error]')).toBeTruthy();failure.mockRestore();
  const retry=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===ar.conversationReview.retryStorage)!;await act(async()=>retry.click());await click('[data-team-check]');expect(m.check).toHaveBeenCalledOnce();
});
