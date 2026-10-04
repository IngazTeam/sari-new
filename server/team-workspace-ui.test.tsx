// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';import en from '../client/src/locales/en.json';
const state=vi.hoisted(()=>({lang:'en'}));
vi.mock('@/lib/trpc',()=>import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter',()=>import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.lang},t:(key:string)=>key.split('.').reduce((o:any,k)=>o?.[k],state.lang==='ar'?ar:en)||key})}));
import Page from '../client/src/pages/merchant/TeamManagement';
import {ServicePreviewContext} from '../prototypes/tenant-dashboard/src/service-preview-api';
import {ServicePreviewModel,type ServiceMode} from '../prototypes/tenant-dashboard/src/service-preview-model';
let root:Root,host:HTMLDivElement,model:ServicePreviewModel;
const c=()=>state.lang==='ar'?ar.teamWorkspaceUx:en.teamWorkspaceUx;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.lang='en';history.replaceState(null,'','/?path=/merchant/team');host=document.createElement('div');document.body.append(host);root=createRoot(host);model=new ServicePreviewModel(269);});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(<ServicePreviewContext.Provider value={model}><Page/></ServicePreviewContext.Provider>));
const mode=(v:ServiceMode)=>{model.dispose();model=new ServicePreviewModel(269,v);};
const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===text);
const click=(text:string)=>act(async()=>{const b=button(text);expect(b).toBeTruthy();b!.click();});
const fill=(selector:string,value:string)=>act(async()=>{const el=document.querySelector(selector) as HTMLInputElement;Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
const inviteReview=async()=>{await click(c().invite);await fill('#team-invite-email','new@example.test');await click(c().review);};
it.each(['ar','en'])('renders scoped team and accurate role descriptions in %s',async lang=>{
 state.lang=lang;await render();expect(host.querySelector('h1')?.textContent).toBe(c().title);expect(host.textContent).toContain(c().viewerHelp);expect(host.textContent).not.toMatch(/teamWorkspaceUx\./);expect(model.operations).toBe(0);
});
it.each(['failure','stale-error','foreign','forbidden','session','loading'] as ServiceMode[])('hides members and controls for %s',async v=>{
 mode(v);await render();expect(host.querySelector('[data-team-workspace]')).toBeNull();expect(model.operations).toBe(0);
});
it('reviews email and role before issuing an invitation, then allows revocation',async()=>{
 await render();await inviteReview();expect(document.querySelector('[role=dialog]')?.textContent).toContain('new@example.test');expect(model.operations).toBe(0);await click(c().confirm);expect(host.textContent).toContain(c().invitationAccepted);
 await click(c().invitations);expect(host.textContent).toContain('new@example.test');await click(c().revoke);expect(model.operations).toBe(1);await click(c().confirm);expect(host.textContent).toContain(c().invitationRevoked);expect(model.operations).toBe(2);
});
it('cancels invitation review without issuing anything',async()=>{
 await render();await inviteReview();await click(c().cancel);expect(model.operations).toBe(0);
});
it('filters members without altering team totals',async()=>{
 await render();await fill('input[type=search]','no-match@example.test');expect(host.textContent).toContain(c().noMatches);expect(host.querySelectorAll('.team-stats strong')[0].textContent).toBe('2');expect(model.operations).toBe(0);
});
it('reviews role change with the old role and only changes the selected member',async()=>{
 await render();const row=Array.from(host.querySelectorAll('.team-row')).find(r=>r.textContent?.includes('member@example.test'))!;
 await act(async()=>Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===c().changeRole)!.click());await fill('#team-role','manager');await click(c().review);expect(model.operations).toBe(0);await click(c().confirm);expect(model.team.read().members.find(m=>m.id===2)?.role).toBe('manager');expect(host.textContent).toContain(c().roleSaved);
});
it('removes store access after review while preventing self-removal',async()=>{
 await render();expect(Array.from(host.querySelectorAll<HTMLButtonElement>('.team-row button')).find(b=>b.textContent===c().remove)?.disabled).toBe(true);
 const row=Array.from(host.querySelectorAll('.team-row')).find(r=>r.textContent?.includes('member@example.test'))!;
 await act(async()=>Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===c().remove)!.click());expect(document.querySelector('[role=dialog]')?.textContent).toContain(c().removeImpact);expect(model.operations).toBe(0);await click(c().confirm);expect(model.team.read().members).toHaveLength(1);
});
it('does not offer owner grants to a manager',async()=>{
 mode('readonly');await render();await click(c().invite);expect(Array.from(document.querySelectorAll('select#team-role option')).map(o=>(o as HTMLOptionElement).value)).not.toContain('owner');
});
it('does not claim acceptance for an untrusted tenant receipt',async()=>{
 await render();vi.spyOn(model,'mutate').mockResolvedValue({success:true,actorId:1269,merchantId:999,email:'new@example.test',role:'viewer',delivered:true});
 await inviteReview();await click(c().confirm);expect(host.textContent).toContain(c().uncertain);expect(host.textContent).not.toContain(c().invitationAccepted);expect(button(c().invite)?.disabled).toBe(true);
});
it('locks uncertain operations and prevents repeated mutations',async()=>{
 mode('uncertain-save');await render();await inviteReview();await click(c().confirm);expect(host.textContent).toContain(c().uncertain);expect(button(c().invite)?.disabled).toBe(true);
});
it('prevents duplicate writes while an invitation is pending',async()=>{
 mode('pending-save');await render();await inviteReview();await act(async()=>{button(c().confirm)!.click();button(c().confirm)!.click();});expect(model.pending).toBe(1);expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).every(b=>b.disabled)).toBe(true);await act(async()=>model.finishPending());expect(model.operations).toBe(1);
});
it('discards private review state when changing tenant',async()=>{
 await render();await inviteReview();model.dispose();model=new ServicePreviewModel(270);await render();expect(document.querySelector('[role=dialog]')).toBeNull();expect(model.operations).toBe(0);
});
it('shows an inline email error and protects the last owner before review',async()=>{
 await render();await click(c().invite);await fill('#team-invite-email','invalid');await click(c().review);expect(document.getElementById('team-field-error')?.textContent).toBe(c().emailInvalid);expect(model.operations).toBe(0);await click(c().cancel);
 await click(c().changeRole);await fill('#team-role','viewer');await click(c().review);expect(document.getElementById('team-field-error')?.textContent).toBe(c().lastOwner);expect(model.operations).toBe(0);
});
