// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { whatsappWorkspaceEn as copy } from '../client/src/locales/whatsapp-workspace';
const api = vi.hoisted(() => ({ merchant:{} as any, instances:{} as any, usage:{} as any, requests:{} as any, qr:{} as any, check:{} as any, callback:{} as any, pending:false, reconnect:vi.fn(), create:vi.fn(), toggle:vi.fn(), primary:vi.fn(), refresh:vi.fn(), meta:vi.fn() }));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'},t:(key:string)=>copy[key.split('.').at(-1) as keyof typeof copy]||key})}));
vi.mock('@/lib/meta-embedded-signup',()=>({launchMetaEmbeddedSignup:api.meta}));
vi.mock('@/lib/trpc',()=>({trpc:{
  merchants:{getCurrent:{useQuery:()=>api.merchant}},
  whatsappWorkspace:{requests:{useQuery:()=>({...api.requests,refetch:api.refresh})},qr:{useQuery:()=>({...api.qr,refetch:api.refresh})},confirm:{useQuery:()=>({...api.check,refetch:api.refresh})}},
  whatsappInstances:{listSafe:{useQuery:()=>({...api.instances,refetch:api.refresh})},getUsage:{useQuery:()=>({...api.usage,refetch:api.refresh})},
    toggleStatus:{useMutation:(cb:any)=>({mutate:api.toggle,isPending:api.pending})},setPrimary:{useMutation:()=>({mutate:api.primary,isPending:false})},
    reconnect:{useMutation:(cb:any)=>{api.callback=cb;return{mutate:api.reconnect,isPending:api.pending};}},refreshInstance:{useMutation:()=>({mutate:vi.fn(),isPending:false})},completeMetaEmbeddedSignup:{useMutation:()=>({mutateAsync:api.meta})},
    getReconnectQR:{useQuery:()=>({...api.qr,refetch:api.refresh})},confirmReconnect:{useQuery:()=>({...api.check,refetch:api.refresh})}},
  whatsappRequests:{create:{useMutation:()=>({mutate:api.create,isPending:false})}},
}}));
import WhatsAppInstancesPage from '../client/src/pages/merchant/WhatsAppInstancesPage';
let root:Root, container:HTMLDivElement;
const instance={id:5,merchantId:10,provider:'green_api',phoneNumber:'966500000001',status:'active',isPrimary:1,createdAt:'2026-09-01'};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);api.pending=false;api.merchant={data:{id:10}};api.instances={data:[instance]};api.usage={data:{known:true,total:1,max:2,remaining:1}};api.requests={data:[]};api.qr={};api.check={};container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(React.createElement(WhatsAppInstancesPage)));
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent===label)!;
const click=(label:string)=>act(async()=>{expect(button(label)).toBeTruthy();button(label).click();});
it('includes pending and expired instances and does not label stored status as live connection',async()=>{
  api.instances.data=[instance,{...instance,id:6,status:'pending'},{...instance,id:7,status:'expired'}];await render();
  expect(container.textContent).toContain(copy.pending);expect(container.textContent).toContain(copy.expired);expect(container.textContent).toContain(copy.instancesHint);
});
it('does not replace data failures with an empty store or permit unverified new connections',async()=>{
  api.instances={isError:true};api.requests={isError:true};api.usage={isError:true};await render();
  expect(container.textContent).toContain(copy.instancesError);expect(container.textContent).toContain(copy.requestsError);expect(container.textContent).not.toContain(copy.empty);
  expect(button(copy.qrRequest).disabled).toBe(true);expect(button(copy.meta).disabled).toBe(true);
});
it('includes legacy request status and blocks another request while approval is outstanding',async()=>{
  api.requests.data=[{id:8,source:'legacy',status:'approved',phoneNumber:'966500000002',createdAt:'2026-09-01'}];await render();
  expect(container.textContent).toContain(copy.legacy);expect(container.textContent).toContain(copy.approved);expect(button(copy.qrRequest).disabled).toBe(true);
});
it('requires explicit confirmation before logging out the chosen number and restores focus when kept',async()=>{
  await render();await click(copy.changeNumber);expect(api.reconnect).not.toHaveBeenCalled();expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('966500000001');
  await click(copy.keep);expect(api.reconnect).not.toHaveBeenCalled();expect(document.activeElement?.textContent).toBe(copy.changeNumber);
  await click(copy.changeNumber);await click(copy.confirm);expect(api.reconnect).toHaveBeenCalledExactlyOnceWith({instanceId:5});
});
it('retains failed action review and prevents duplicate actions and dismissal while pending',async()=>{
  await render();await click(copy.changeNumber);await act(async()=>api.callback.onError(new Error('private provider URL')));expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(copy.actionFailed);
  expect(document.body.textContent).not.toContain('private provider');api.pending=true;await render();await click(copy.saving);await click(copy.keep);expect(api.reconnect).not.toHaveBeenCalled();expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
});
it('opens responsive QR with retryable verification errors instead of an endless waiting spinner',async()=>{
  api.qr={isError:true};api.check={isError:true};await render();await click(copy.reconnect);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(copy.qrCheckError);expect(button(copy.checkAgain)).toBeTruthy();expect(button(copy.qrRefresh)).toBeTruthy();
});
it('does not close the QR dialog using a previous cached connection result',async()=>{
  api.check={data:{connected:true},isFetchedAfterMount:false,isFetching:true};await render();await click(copy.reconnect);
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  api.check={data:{connected:true},isFetchedAfterMount:true,isFetching:false,isError:true};await render();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  api.check={data:{connected:true},isFetchedAfterMount:true,isFetching:false,isError:false};await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('validates each request field without submitting invalid data and retains the typed values',async()=>{
  await render();await click(copy.qrRequest);
  await act(async()=>{const input=document.querySelector<HTMLInputElement>('#wa-phone')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'invalid');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(copy.sendRequest);expect(document.querySelector('#wa-phone-error')?.textContent).toBe(copy.phoneError);expect(api.create).not.toHaveBeenCalled();expect((document.querySelector('#wa-phone') as HTMLInputElement).value).toBe('invalid');
});
