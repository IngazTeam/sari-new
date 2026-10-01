// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
import merchantAr from '../client/src/locales/merchant-ux.ar';
import merchantEn from '../client/src/locales/merchant-ux.en';
const m=vi.hoisted(()=>({query:{} as any,language:'en',repair:vi.fn(),sync:vi.fn(),refresh:vi.fn(),invalidate:vi.fn(),calls:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:m.language},t:(key:string,args:any={})=>{const source=m.language==='ar'?{...ar,merchantUx:merchantAr}:{...en,merchantUx:merchantEn};const value=key.split('.').reduce((v:any,k)=>v?.[k],source)??key;return value.replace(/\{\{(\w+)\}\}/g,(_:string,k:string)=>String(args[k]??''));}})}));
vi.mock('@/lib/trpc',()=>({trpc:{conversations:{connectionStatus:{useQuery:(input:any,options:any)=>{m.calls(input,options);return m.query;}},diagnoseWebhook:{useMutation:()=>({mutateAsync:m.repair})},syncFromWhatsApp:{useMutation:()=>({mutateAsync:m.sync})}},useUtils:()=>({conversations:new Proxy({},{get:(_,name)=>({invalidate:()=>m.invalidate(name)})})})}}));
import {ConversationConnection} from '../client/src/components/ConversationConnection';
const at='2026-10-01T09:00:00.000Z';
const status=()=>({merchantId:20,actorUserId:7,instanceId:4,provider:'green_api',checkedAt:at,canManage:true,connected:true,state:'authorized',phoneNumber:'966500000227',message:'SERVER_MESSAGE_NOT_UI_COPY'});
const diagnosis=()=>({merchantId:20,actorUserId:7,instanceId:4,provider:'green_api',checkedAt:at,status:'fixed',fixed:true,instanceState:'authorized',issues:['webhook_auth'],details:{webhookConfigured:true,webhookAuthenticated:true,webhookEventsEnabled:true},message:'SECRET_PROVIDER_RESPONSE'});
let root:Root,container:HTMLDivElement;
const render=async(patch:any={})=>{await act(async()=>root.render(React.createElement(ConversationConnection,{merchantId:20,actorUserId:7,...patch})));if(!document.body.querySelector('[role=dialog]'))await click(button('open'));};
const button=(name:string)=>document.body.querySelector(`[data-connection-${name}]`) as HTMLButtonElement;
const click=(element:HTMLElement)=>act(async()=>element.click());
beforeEach(()=>{vi.resetAllMocks();m.language='en';vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);m.query={data:status(),isLoading:false,isFetching:false,isFetchedAfterMount:true,error:null,refetch:m.refresh};m.refresh.mockImplementation(async()=>({data:m.query.data,isError:false}));m.repair.mockResolvedValue(diagnosis());m.sync.mockResolvedValue({success:true,chatsImported:2,messagesImported:5,totalChats:2});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it.each(['en','ar'])('renders localized connection status and a separately disclosed management area in %s',async language=>{
  m.language=language;await render();expect(document.body.textContent).not.toMatch(/SERVER_MESSAGE|merchantUx\./);expect(document.body.querySelector('[role=dialog]')).toBeTruthy();expect(document.body.querySelector('details')).toBeNull();expect(m.repair).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled();expect(document.body.querySelector('a')?.getAttribute('href')).toBe('/merchant/whatsapp-instances');
});
it.each(['error','cached','foreign-tenant','foreign-actor','contradiction'])('hides stale or invalid %s status and management controls',async kind=>{
  if(kind==='error')m.query.error=Error('private');if(kind==='cached'){m.query.isFetchedAfterMount=false;m.query.isFetching=true;}if(kind==='foreign-tenant')m.query.data.merchantId=99;if(kind==='foreign-actor')m.query.data.actorUserId=8;if(kind==='contradiction')m.query.data.state='check_failed';
  await render();expect(button('repair')).toBeNull();expect(document.body.textContent).not.toContain('966500000227');expect(document.body.querySelector('[data-connection-state]')?.getAttribute('data-connection-state')).not.toBe('authorized');
});
it.each(['disconnected','no_instance','check_failed','configuration_missing','unsupported'])('shows %s distinctly and blocks mutation',async state=>{
  m.query.data={...status(),connected:false,state};await render();expect(document.body.querySelector('[data-connection-state]')?.getAttribute('data-connection-state')).toBe(state);expect(button('import').disabled).toBe(true);expect(button('repair').disabled).toBe(true);await click(button('import'));expect(m.sync).not.toHaveBeenCalled();
});
it('allows read-only refresh but no management action for a viewer',async()=>{
  m.query.data.canManage=false;await render();expect(button('repair')).toBeNull();expect(button('import')).toBeNull();await click(button('refresh'));expect(m.refresh).toHaveBeenCalledOnce();expect(document.body.textContent).toContain(merchantEn.conversationConnection.readOnly);
});
it('disables Green-specific actions for a connected Meta primary',async()=>{
  m.query.data.provider='meta_cloud';await render();expect(button('import').disabled).toBe(true);expect(button('repair').disabled).toBe(true);expect(document.body.textContent).toContain(merchantEn.conversationConnection.greenOnly);
});
it('imports explicitly without repairing, refreshes messages and shows the actual counts',async()=>{
  await render();await click(button('import'));expect(m.sync).toHaveBeenCalledOnce();expect(m.repair).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Imported 2 new conversations and 5 messages');expect(m.invalidate.mock.calls.map(c=>c[0])).toEqual(expect.arrayContaining(['list','listRecent','count','getMessages','messageHistory','handoffSnapshot']));
});
it('reports a successful empty import instead of leaving the result unstated',async()=>{
  m.sync.mockResolvedValue({success:true,chatsImported:0,messagesImported:0,totalChats:0});await render();await click(button('import'));expect(document.body.textContent).toContain('Imported 0 new conversations and 0 messages');
});
it('repairs only on the explicit action and never starts an import automatically',async()=>{
  await render();await click(button('repair'));expect(m.repair).toHaveBeenCalledOnce();expect(m.sync).not.toHaveBeenCalled();expect(document.body.textContent).toContain(merchantEn.conversationConnection.fixed);expect(document.body.textContent).not.toContain('SECRET_PROVIDER_RESPONSE');
});
it.each(['merchantId','actorUserId','instanceId','provider'])('rejects a repair result for the wrong %s',async field=>{
  const value:any=diagnosis();value[field]=field==='provider'?'meta_cloud':99;m.repair.mockResolvedValue(value);await render();await click(button('repair'));expect(document.body.querySelector('[data-connection-notice]')?.getAttribute('data-connection-notice')).toBe('failed');expect(button('repair').disabled).toBe(true);
});
it.each(['false-success','negative-count','mismatched-count'])('rejects an invalid import result: %s',async kind=>{
  const value:any={success:true,chatsImported:2,messagesImported:5,totalChats:2};if(kind==='false-success')value.success=false;if(kind==='negative-count')value.messagesImported=-1;if(kind==='mismatched-count')value.totalChats=3;m.sync.mockResolvedValue(value);await render();await click(button('import'));expect(document.body.querySelector('[data-connection-notice]')?.getAttribute('data-connection-notice')).toBe('failed');expect(button('import').disabled).toBe(true);
});
it('keeps partial import distinct, redacts per-customer provider failures and requires a new check',async()=>{
  m.sync.mockResolvedValue({success:true,chatsImported:1,messagesImported:4,totalChats:1,errors:['PRIVATE_NUMBER_PRIVATE_TOKEN']});await render();await click(button('import'));expect(document.body.querySelector('[data-connection-notice]')?.getAttribute('data-connection-notice')).toBe('partial');expect(document.body.textContent).not.toContain('PRIVATE');expect(button('import').disabled).toBe(true);await click(button('refresh'));expect(button('import').disabled).toBe(false);
});
it('keeps retries blocked if a manual check returns an error or another account',async()=>{
  m.sync.mockRejectedValue(Error('private'));await render();await click(button('import'));m.refresh.mockResolvedValueOnce({data:status(),isError:true});await click(button('refresh'));expect(button('import').disabled).toBe(true);m.refresh.mockResolvedValueOnce({data:{...status(),actorUserId:99}});await click(button('refresh'));expect(button('import').disabled).toBe(true);
});
it.each(['repair','import'])('prevents double %s clicks and ignores late results after account change',async action=>{
  let release!:(v:any)=>void;const call=action==='repair'?m.repair:m.sync;call.mockReturnValue(new Promise(resolve=>release=resolve));await render();await act(async()=>{button(action).click();button(action).click();});expect(call).toHaveBeenCalledOnce();await render({actorUserId:8});await act(async()=>release(action==='repair'?diagnosis():{success:true,chatsImported:1,messagesImported:1,totalChats:1}));expect(document.body.querySelector('[data-connection-notice]')).toBeNull();expect(m.invalidate).not.toHaveBeenCalled();
});
it('ignores a late import after primary changes and returns to the previous primary',async()=>{
  let release!:(v:any)=>void;m.sync.mockReturnValue(new Promise(resolve=>release=resolve));await render();await click(button('import'));m.query.data={...status(),instanceId:5};await render();m.query.data=status();await render();await act(async()=>release({success:true,chatsImported:1,messagesImported:1,totalChats:1}));expect(document.body.querySelector('[data-connection-notice]')).toBeNull();expect(m.invalidate).not.toHaveBeenCalled();
});
it('returns keyboard focus to the compact trigger after closing the dialog',async()=>{
  await render();await click(button('close'));await vi.waitFor(()=>expect(document.activeElement).toBe(button('open')));expect(document.body.querySelector('[role=dialog]')).toBeNull();
});
it('retains the result of an explicitly started import across closing and reopening without retrying it',async()=>{
  let release!:(v:any)=>void;m.sync.mockReturnValue(new Promise(resolve=>release=resolve));await render();await click(button('import'));await click(button('close'));await act(async()=>release({success:true,chatsImported:1,messagesImported:3,totalChats:1}));await click(button('open'));expect(document.body.textContent).toContain('Imported 1 new conversations and 3 messages');expect(m.sync).toHaveBeenCalledOnce();
});
