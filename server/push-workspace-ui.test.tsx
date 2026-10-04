// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';import en from '../client/src/locales/en.json';
const state=vi.hoisted(()=>({lang:'en'}));
vi.mock('@/lib/trpc',()=>import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter',()=>import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.lang},t:(key:string)=>key.split('.').reduce((o:any,k)=>o?.[k],state.lang==='ar'?ar:en)||key})}));
import Page from '../client/src/pages/merchant/PushNotificationsSettings';
import {ServicePreviewContext} from '../prototypes/tenant-dashboard/src/service-preview-api';
import {ServicePreviewModel,type ServiceMode} from '../prototypes/tenant-dashboard/src/service-preview-model';
let root:Root,host:HTMLDivElement,model:ServicePreviewModel;
const c=()=>state.lang==='ar'?ar.pushWorkspaceUx:en.pushWorkspaceUx;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.lang='en';history.replaceState(null,'','/?path=/merchant/push-notifications');host=document.createElement('div');document.body.append(host);root=createRoot(host);model=new ServicePreviewModel(269);});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(<ServicePreviewContext.Provider value={model}><Page device={model.push.device}/></ServicePreviewContext.Provider>));
const mode=(v:ServiceMode)=>{model.dispose();model=new ServicePreviewModel(269,v);};
const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===text);
const click=(text:string)=>act(async()=>{const b=button(text);expect(b).toBeTruthy();b!.click();});
it.each(['ar','en'])('shows scope, distinct permission and registration, and honest acceptance in %s',async lang=>{
 state.lang=lang;await render();expect(host.querySelector('h1')?.textContent).toBe(c().title);expect(host.textContent).toContain(c().registered);expect(host.textContent).toContain(c().granted);expect(host.textContent).toContain(c().historyHelp);expect(host.textContent).not.toMatch(/pushWorkspaceUx\./);expect(model.operations).toBe(0);
});
it('reviews and tests one simulated device once; cancellation has no effect',async()=>{
 await render();await click(c().test);expect(document.querySelector('[role=dialog]')?.textContent).toContain(c().testReviewHelp);await click(c().cancel);expect(model.operations).toBe(0);
 await click(c().test);await click(c().confirm);expect(model.operations).toBe(1);expect(host.textContent).toContain(c().accepted);expect(button(c().test)?.disabled).toBe(true);
});
it('enables an unregistered browser only after explicit confirmation',async()=>{
 mode('empty');await render();expect(host.textContent).toContain(c().deviceDisabled);await click(c().enable);expect(model.operations).toBe(0);await click(c().confirm);expect(host.textContent).toContain(c().deviceEnabled);expect(model.operations).toBe(1);
});
it('unsubscribes the server before changing the simulated browser',async()=>{
 await render();const mutate=vi.spyOn(model,'mutate');const local=vi.spyOn(model.push.device,'disable');
 await click(c().disable);await click(c().confirm);expect(mutate).toHaveBeenCalledWith('push.unsubscribe',{deviceHash:'a'.repeat(64),reviewed:true});expect(local).toHaveBeenCalledOnce();expect(host.textContent).toContain(c().deviceDisabled);
});
it('does not remove the browser subscription if the server acknowledgement is untrusted',async()=>{
 await render();vi.spyOn(model,'mutate').mockResolvedValue({success:true,actorId:1,merchantId:270});const local=vi.spyOn(model.push.device,'disable');
 await click(c().disable);await click(c().confirm);expect(local).not.toHaveBeenCalled();expect(host.textContent).toContain(c().operationFailed);
});
it.each(['failure','stale-error','foreign','forbidden','session','loading'] as ServiceMode[])('hides private controls for %s',async v=>{
 mode(v);await render();expect(host.querySelector('[data-push-workspace]')).toBeNull();expect(model.operations).toBe(0);
});
it.each(['push-unsupported','push-denied','push-unconfigured','readonly'] as ServiceMode[])('does not enable the device under %s',async v=>{
 mode(v);await render();const enable=button(c().enable);if(enable)expect(enable.disabled).toBe(true);const test=button(c().test);if(v==='readonly'||v==='push-unconfigured')expect(test?.disabled).toBe(true);expect(model.operations).toBe(0);
});
it('keeps unknown outcomes distinct and does not repeat the test',async()=>{
 mode('uncertain-save');await render();await click(c().test);await click(c().confirm);expect(host.textContent).toContain(c().unknown);expect(host.textContent).not.toContain(c().accepted);expect(button(c().test)?.disabled).toBe(true);expect(model.operations).toBe(1);
});
it('rejects a forged receipt from another tenant',async()=>{
 await render();vi.spyOn(model,'mutate').mockImplementation(async(_n,i)=>({actorId:1269,merchantId:270,requestId:i.requestId,state:'accepted'}));await click(c().test);await click(c().confirm);expect(host.textContent).toContain(c().unknown);expect(host.textContent).not.toContain(c().accepted);
});
it('clears private review when switching the selected tenant',async()=>{
 await render();await click(c().test);model.dispose();model=new ServicePreviewModel(270);await render();expect(document.querySelector('[role=dialog]')).toBeNull();expect(model.operations).toBe(0);
});
it('shows browser unsubscription uncertainty without restoring the server connection',async()=>{
 await render();vi.spyOn(model.push.device,'disable').mockResolvedValue(false);await click(c().disable);await click(c().confirm);expect(host.textContent).toContain(c().serverDisabled);expect(host.textContent).toContain(c().unregistered);
});
it('disables every pending confirmation and does not run a duplicate test',async()=>{
 mode('pending-save');await render();await click(c().test);
 await act(async()=>{button(c().confirm)!.click();button(c().confirm)!.click();});
 expect(model.pending).toBe(1);expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).every(b=>b.disabled)).toBe(true);
 await act(async()=>model.finishPending());expect(model.operations).toBe(1);expect(host.textContent).toContain(c().accepted);
});
