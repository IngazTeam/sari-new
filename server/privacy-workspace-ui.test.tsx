// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';import en from '../client/src/locales/en.json';
const state=vi.hoisted(()=>({lang:'en'}));
vi.mock('@/lib/trpc',()=>import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter',()=>import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.lang},t:(key:string)=>key.split('.').reduce((o:any,k)=>o?.[k],state.lang==='ar'?ar:en)||key})}));
import Page from '../client/src/pages/merchant/PrivacyCenter';
import {ServicePreviewContext} from '../prototypes/tenant-dashboard/src/service-preview-api';
import {ServicePreviewModel,type ServiceMode} from '../prototypes/tenant-dashboard/src/service-preview-model';
let root:Root,host:HTMLDivElement,model:ServicePreviewModel;
const c=()=>state.lang==='ar'?ar.privacyWorkspaceUx:en.privacyWorkspaceUx;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.lang='en';history.replaceState(null,'','/?path=/merchant/privacy-center');host=document.createElement('div');document.body.append(host);root=createRoot(host);model=new ServicePreviewModel(269);});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(<ServicePreviewContext.Provider value={model}><Page actions={model.privacy.actions}/></ServicePreviewContext.Provider>));
const mode=(v:ServiceMode)=>{model.dispose();model=new ServicePreviewModel(269,v);};
const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===text);
const click=(text:string)=>act(async()=>{const b=button(text);expect(b).toBeTruthy();b!.click();});
const fill=(id:string,value:string)=>act(async()=>{const el=document.getElementById(id) as HTMLInputElement;expect(el).toBeTruthy();Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
it.each(['ar','en'])('renders four actions, account scope and translated history in %s',async lang=>{
 state.lang=lang;await render();expect(host.querySelector('h1')?.textContent).toBe(c().title);expect(host.querySelectorAll('.privacy-tile')).toHaveLength(4);expect(host.textContent).toContain(c().scopeHelp);expect(host.textContent).not.toMatch(/privacyWorkspaceUx\./);expect(model.operations).toBe(0);
});
it.each(['failure','stale-error','foreign','forbidden','session','loading'] as ServiceMode[])('hides private data and actions for %s',async v=>{
 mode(v);await render();expect(host.querySelector('[data-privacy-workspace]')).toBeNull();expect(model.operations).toBe(0);
});
it('does not present invalid legacy consent as an opt-out',async()=>{
 mode('legacy');await render();expect(host.textContent).toContain(c().unknown);expect(host.textContent).not.toContain(c().consentOff);expect(button(c().consentAction)?.disabled).toBe(true);
});
it('changes consent only after review and explicit submission',async()=>{
 await render();await click(c().consentAction);await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());expect(model.operations).toBe(0);
 await click(c().confirm);expect(host.textContent).toContain(c().consentSaved);expect(host.textContent).toContain(c().consentOn);expect(model.operations).toBe(1);
});
it('validates details inline and reports duplicate requests honestly',async()=>{
 await render();await click(c().requestAction);await click(c().confirm);expect(document.getElementById('privacy-field-error')?.textContent).toBe(c().detailsInvalid);expect(model.operations).toBe(0);
 await fill('privacy-details','Please provide my data');await click(c().confirm);expect(host.textContent).toContain(c().requestSaved);
 await click(c().requestAction);await fill('privacy-details','Other details');await click(c().confirm);expect(host.textContent).toContain(c().requestExists);expect(model.privacy.read().requests).toHaveLength(1);
});
it('verifies export ownership and requests a local download without claiming disk completion',async()=>{
 await render();await click(c().exportAction);await fill('privacy-password','demo-password');await click(c().confirm);expect(model.privacy.downloadCount).toBe(1);expect(host.textContent).toContain(c().exportStarted);
});
it('never downloads a forged export for another account',async()=>{
 await render();const payload=model.privacy.mutate('accountData.exportPersonalData',{});vi.spyOn(model,'mutate').mockResolvedValue({...payload,account:{id:888}});
 await click(c().exportAction);await fill('privacy-password','demo-password');await click(c().confirm);expect(model.privacy.downloadCount).toBe(0);expect(host.textContent).toContain(c().operationUnknown);
});
it('maps password rejection to the field and clears the attempted secret',async()=>{
 await render();vi.spyOn(model,'mutate').mockRejectedValue({message:'privacy:password_invalid',data:{code:'BAD_REQUEST'}});
 await click(c().exportAction);await fill('privacy-password','wrong-password');await click(c().confirm);expect(document.getElementById('privacy-field-error')?.textContent).toBe(c().passwordInvalid);expect((document.getElementById('privacy-password') as HTMLInputElement).value).toBe('');expect(document.body.textContent).not.toContain('wrong-password');
});
it('requires an exact deletion phrase and shows all affected owned stores',async()=>{
 await render();await click(c().deleteAction);expect(document.querySelector('[role=dialog]')?.textContent).toContain('Madar store');
 await fill('privacy-password','demo-password');await fill('privacy-confirmation','delete');await click(c().deleteConfirm);expect(model.operations).toBe(0);expect(document.getElementById('privacy-field-error')?.textContent).toBe(c().confirmationInvalid);
 await fill('privacy-confirmation','DELETE_MY_ACCOUNT');await click(c().deleteConfirm);expect(model.privacy.deleted).toBe(true);expect(host.textContent).toContain(c().deletionSaved);
});
it('keeps uncertain deletion locked and never runs the success handoff',async()=>{
 mode('uncertain-save');await render();await click(c().deleteAction);await fill('privacy-password','demo-password');await fill('privacy-confirmation','DELETE_MY_ACCOUNT');await click(c().deleteConfirm);
 expect(model.privacy.deleted).toBe(false);expect(host.textContent).toContain(c().deleteUnknown);expect(button(c().deleteAction)?.disabled).toBe(true);
});
it('blocks shared ownership and clears secrets on cancel',async()=>{
 mode('readonly');await render();expect(button(c().deleteAction)?.disabled).toBe(true);
 await click(c().exportAction);await fill('privacy-password','demo-password');await click(c().cancel);await click(c().exportAction);expect((document.getElementById('privacy-password') as HTMLInputElement).value).toBe('');
});
it('prevents duplicate writes while pending',async()=>{
 mode('pending-save');await render();await click(c().requestAction);await fill('privacy-details','My data request');
 await act(async()=>{button(c().confirm)!.click();button(c().confirm)!.click();});expect(model.pending).toBe(1);expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).every(b=>b.disabled)).toBe(true);
 await act(async()=>model.finishPending());expect(model.operations).toBe(1);expect(host.textContent).toContain(c().requestSaved);
});
it('clears a private review when the account changes',async()=>{
 await render();await click(c().exportAction);await fill('privacy-password','demo-password');model.dispose();model=new ServicePreviewModel(270);await render();expect(document.querySelector('[role=dialog]')).toBeNull();expect(model.operations).toBe(0);
});
