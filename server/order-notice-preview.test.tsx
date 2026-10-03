// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {orderNoticeWorkspaceAr as ar,orderNoticeWorkspaceEn as en} from '../client/src/locales/order-notice-workspace';
import {orderNoticeWorkspace,orderNoticeDetail,orderNoticeState,orderNoticeEvidence,orderNoticeStatus,orderNoticeSelection} from '../shared/order-notification-workspace';
import {saveOrderNoticeTemplateResult,acknowledgeOrderNoticesResult} from '../shared/order-notification-actions';
import {scopedOrderNoticeWorkspace,scopedOrderNoticeDetail} from '../client/src/lib/order-notice-workspace';
const state=vi.hoisted(()=>({language:'en'}));
vi.mock('@/lib/trpc',()=>import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter',()=>import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.language},t:(key:string)=>(state.language==='ar'?ar:en)[key.split('.').pop() as keyof typeof en]??'Localized status'})}));
import OrderNotificationsSettings from '../client/src/pages/merchant/OrderNotificationsSettings';
import {ServicePreviewContext} from '../prototypes/tenant-dashboard/src/service-preview-api';
import {ServicePreviewModel,serviceModes} from '../prototypes/tenant-dashboard/src/service-preview-model';
let root:Root,container:HTMLDivElement,model:ServicePreviewModel;
beforeEach(()=>{Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});state.language='en';container=document.createElement('div');document.body.append(container);root=createRoot(container);model=new ServicePreviewModel(269);history.replaceState(null,'','/?path=/merchant/order-notifications');});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();container.remove();vi.restoreAllMocks();});
const render=()=>act(async()=>root.render(<ServicePreviewContext.Provider value={model}><OrderNotificationsSettings/></ServicePreviewContext.Provider>));
const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim().startsWith(text))!;
const click=(text:string)=>act(async()=>{expect(button(text)).toBeTruthy();button(text).click();});
const fill=(text:string)=>act(async()=>{const el=document.getElementById('on-message') as HTMLTextAreaElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});
const read=(input:object={},instance=model)=>{const r=instance.read('orderNotifications.workspace',input);expect(r.error).toBeFalsy();return orderNoticeWorkspace.parse(r.data);};
const detail=(id=32,instance=model)=>{const r=instance.read('orderNotifications.detail',{id});expect(r.error).toBeFalsy();return orderNoticeDetail.parse(r.data);};
const saveInput=(instance=model)=>{const t=read({},instance).templates[0];return {status:t.canonicalStatus!,revision:t.revision,template:'A clearer order {{orderNumber}} message',enabled:false};};
const historyView=()=>history.replaceState(null,'','/?path=/merchant/order-notifications&view=history');

it.each(['ar','en'])('uses the actual templates page, preview and local save in %s',async language=>{
 state.language=language;const c=language==='ar'?ar:en;await render();expect(container.querySelectorAll('.on-card')).toHaveLength(6);
 await click(c.edit);await fill('  طلب {{orderNumber}} · {{total}} {{currency}}  ');expect(document.querySelector('.on-preview')?.textContent).toContain('125.00 SAR');await click(c.save);
 expect(document.body.textContent).toContain(c.saved);expect(document.activeElement?.textContent).toBe(c.saved);expect(read().templates[0].template).toBe('طلب {{orderNumber}} · {{total}} {{currency}}');expect(model.operations).toBe(1);expect(container.textContent).not.toContain('merchantUx.');
});
it.each(serviceModes)('handles mode %s without writing or displaying stale rows',async mode=>{
 model=new ServicePreviewModel(269,mode);await render();expect(container.querySelectorAll('.on-card').length>0).toBe(!['loading','failure','forbidden','session','foreign','stale-error'].includes(mode));expect(model.operations).toBe(0);
});
it.each([269,270])('retains all rows, complete independent counts, and scope for tenant %s',id=>{
 const other=new ServicePreviewModel(id);try{const one=read({},other),two=read({page:2},other);expect(one.stats).toMatchObject({total:32,linked:31,unlinked:1});expect(one.rows).toHaveLength(25);expect(two.rows).toHaveLength(7);expect(new Set([...one.rows,...two.rows].map(r=>r.id)).size).toBe(32);
 expect(read({page:99},other).currentPage).toBe(2);expect(read({query:'%'},other).rows.map(r=>r.id)).toEqual([1]);expect(read({sort:'oldest'},other).rows[0].id).toBe(1);expect(two.stats).toEqual(one.stats);
 expect(scopedOrderNoticeWorkspace(one,id+1000,id,orderNoticeSelection.parse({}))).not.toBeNull();expect(scopedOrderNoticeWorkspace(one,id+1000,id===269?270:269,orderNoticeSelection.parse({}))).toBeNull();expect(scopedOrderNoticeDetail(detail(32,other),id+1000,id,31)).toBeNull();
 }finally{other.dispose();}
});
it.each(orderNoticeState.options)('filters worker state %s without changing totals',value=>{const r=read({state:value});expect(r.matched).toBeGreaterThan(0);expect(r.rows.every(row=>row.state===value)).toBe(true);expect(r.stats).toEqual(read().stats);});
it.each(orderNoticeEvidence.options)('keeps %s receipt evidence distinct from order or sale completion',value=>{const r=read({evidence:value});expect(r.matched).toBeGreaterThan(0);expect(r.rows.every(row=>row.evidence===value&&row.salesVerification==='not_verified')).toBe(true);expect(r.stats).toEqual(read().stats);});
it.each(orderNoticeStatus.options)('retains status %s in the history filter',value=>{const r=read({status:value});expect(r.matched).toBeGreaterThan(0);expect(r.rows.every(row=>row.status===value)).toBe(true);});
it('requires confirmation and closes only the displayed incident without changing its receipt',async()=>{
 historyView();await render();await click(en.details);expect(button(en.acknowledge).disabled).toBe(true);const before=detail().row,other=detail(25).row;
 await act(async()=>{(document.querySelector('.on-check input') as HTMLInputElement).click();});await click(en.acknowledge);
 expect(document.body.textContent).toContain(en.acknowledged);expect(detail().row).toMatchObject({state:'suppressed',evidence:before.evidence,providerMessageId:before.providerMessageId});expect(detail(25).row).toEqual(other);expect(model.operations).toBe(1);await click(en.check);expect(document.body.textContent).toContain(en.checked);expect(button(en.acknowledge)).toBeUndefined();
});
it('validates the entire close selection before any local change',async()=>{
 const a=detail(32).row,b=detail(25).row;await expect(model.mutate('orderNotifications.acknowledgeReviewed',{records:[{id:a.id,revision:a.revision},{id:b.id,revision:'0'.repeat(64)}]})).rejects.toMatchObject({data:{code:'CONFLICT'}});expect(model.operations).toBe(0);expect(detail().row.state).toBe('manual_review');
 const result=acknowledgeOrderNoticesResult.parse(await model.mutate('orderNotifications.acknowledgeReviewed',{records:[a,b].map(r=>({id:r.id,revision:r.revision}))}));expect(result.acknowledgedIds).toEqual([25,32]);expect(result.sendsMessage).toBe(false);expect(model.operations).toBe(1);
 await expect(model.mutate('orderNotifications.acknowledgeReviewed',{records:[{id:a.id,revision:a.revision}]})).rejects.toMatchObject({data:{code:'CONFLICT'}});expect(model.operations).toBe(1);
});
it('rejects stale and foreign template revisions; same state has no repeated write',async()=>{
 const v=saveInput(),saved=saveOrderNoticeTemplateResult.parse(await model.mutate('orderNotifications.saveTemplate',v));expect(saved.sendsMessage).toBe(false);expect((await model.mutate('orderNotifications.saveTemplate',v)).effect).toBe('already_current');expect(model.operations).toBe(1);
 await expect(model.mutate('orderNotifications.saveTemplate',{...v,template:'Different'})).rejects.toMatchObject({data:{code:'CONFLICT'}});
 const other=new ServicePreviewModel(270);try{await expect(other.mutate('orderNotifications.saveTemplate',v)).rejects.toMatchObject({data:{code:'CONFLICT'}});expect(other.operations).toBe(0);}finally{other.dispose();}
});
it('redacts conflicting references and never permits closing them',async()=>{
 const r=detail(30).row;expect(r).toMatchObject({integrity:'unlinked',order:null,message:null,customerPhone:null,provider:null,providerMessageId:null,evidence:'unverified'});expect(read({query:'NAWA-30'}).matched).toBe(0);
 await expect(model.mutate('orderNotifications.acknowledgeReviewed',{records:[{id:r.id,revision:r.revision}]})).rejects.toMatchObject({data:{code:'PRECONDITION_FAILED'}});expect(model.operations).toBe(0);
});
it('preserves read-only authority when refreshed and hides both writes',async()=>{
 model=new ServicePreviewModel(269,'readonly');await render();await click(en.refresh);expect(read().canManage).toBe(false);await click(en.details);expect(button(en.save)).toBeUndefined();expect((document.getElementById('on-message') as HTMLTextAreaElement).disabled).toBe(true);
});
it('reads an uncertain save without writing again',async()=>{
 model=new ServicePreviewModel(269,'uncertain-save');await render();await click(en.edit);await fill('Stored once');await click(en.save);expect(document.body.textContent).toContain(en.uncertain);expect(button(en.save)).toBeUndefined();expect(model.operations).toBe(1);
 await click(en.check);expect(document.body.textContent).toContain(en.checked);expect((document.getElementById('on-message') as HTMLTextAreaElement).value).toBe('Stored once');expect(model.operations).toBe(1);
});
it('reads an uncertain incident closure without resending or closing another row',async()=>{
 model=new ServicePreviewModel(269,'uncertain-save');historyView();await render();await click(en.details);await act(async()=>{(document.querySelector('.on-check input') as HTMLInputElement).click();});await click(en.acknowledge);expect(document.body.textContent).toContain(en.uncertain);expect(model.operations).toBe(1);await click(en.check);expect(button(en.acknowledge)).toBeUndefined();expect(detail(25).row.state).toBe('manual_review');
});
it('shows missing detail as an error with no stale content',async()=>{
 model=new ServicePreviewModel(269,'choices-error');historyView();await render();await click(en.details);expect(document.body.textContent).toContain(en.failed);expect(document.querySelector('.on-facts')).toBeNull();expect(model.operations).toBe(0);
});
it('keeps malformed templates literal, focuses validation, and retains unknown statuses',async()=>{
 model=new ServicePreviewModel(269,'legacy');await render();expect(read().templates).toHaveLength(7);await click(en.edit);expect(document.querySelector('img')).toBeNull();await click(en.save);expect(document.body.textContent).toContain(en.fieldError);expect(document.activeElement?.id).toBe('on-message');expect(model.operations).toBe(0);await fill('Repaired {{orderNumber}}');await click(en.save);expect(read().templates[0].issues).toEqual([]);
});
it('holds a pending save and cancels it on disposal',async()=>{
 model=new ServicePreviewModel(269,'pending-save');const pending=model.mutate('orderNotifications.saveTemplate',saveInput());expect(model.pending).toBe(1);expect(model.operations).toBe(0);model.dispose();await expect(pending).rejects.toMatchObject({data:{code:'CONFLICT'}});expect(model.operations).toBe(0);
});
it('stores missing suggestions only through an explicit save',async()=>{
 model=new ServicePreviewModel(269,'empty');const before=read();expect(before.stats.total).toBe(0);expect(before.templates.every(t=>!t.stored&&!t.enabled)).toBe(true);await model.mutate('orderNotifications.saveTemplate',saveInput());expect(read().templates[0].stored).toBe(true);expect(read().stats.total).toBe(0);
});
