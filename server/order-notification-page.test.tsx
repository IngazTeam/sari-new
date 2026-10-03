// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { orderNoticeWorkspaceEn as en, orderNoticeWorkspaceAr as ar } from '../client/src/locales/order-notice-workspace';
import { orderNoticeSelection, orderNoticeStatus, orderNoticeState, orderNoticeEvidence } from '../shared/order-notification-workspace';
const m=vi.hoisted(()=>({actor:7,merchant:20,language:'en',templates:[] as any[],rows:[] as any[],selection:{} as any,override:{} as any,writable:true,error:null as any,fetching:false,
  refresh:vi.fn(),fetch:vi.fn(),detail:vi.fn(),save:vi.fn(),ack:vi.fn()}));
vi.mock('@/lib/trpc',()=>({trpc:{auth:{me:{useQuery:()=>({data:{id:m.actor}})}},merchants:{getCurrent:{useQuery:()=>({data:{id:m.merchant}})}},orderNotifications:{
  workspace:{useQuery:(selection:any)=>{m.selection=selection;return{data:snapshot(),error:m.error,isFetching:m.fetching,refetch:m.refresh};}},
  saveTemplate:{useMutation:()=>({mutateAsync:m.save})},acknowledgeReviewed:{useMutation:()=>({mutateAsync:m.ack})}},
  useUtils:()=>({orderNotifications:{workspace:{fetch:m.fetch},detail:{fetch:m.detail}}})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:m.language},t:(key:string)=>(m.language==='ar'?ar:en)[key.split('.').pop() as keyof typeof en]??key})}));
import Page from '../client/src/pages/merchant/OrderNotificationsSettings';
const row=(id=1)=>({id,revision:'a'.repeat(64),integrity:'linked',status:'paid',state:'manual_review',order:{id:3,number:'TEST-ORDER'},customerPhone:'+966500000000',
  message:'<img src=x onerror=alert(1)>',attempts:1,evidence:'unverified',provider:null,providerMessageId:null,evidenceAt:null,createdAt:'2026-10-03T09:00:00.000Z',
  updatedAt:'2026-10-03T09:00:00.000Z',availableAt:'2026-10-03T09:00:00.000Z',claimedAt:null,sentAt:null,reviewedAt:null,reviewedByUserId:null,hasEvent:true,issues:[],salesVerification:'not_verified'});
function snapshot(){
  const s=m.selection,source=m.rows,filtered=source.filter(r=>(!s.query||r.message?.includes(s.query))&&(!s.status||r.status===s.status)&&(!s.state||r.state===s.state)&&(!s.evidence||r.evidence===s.evidence)&&(s.integrity==='all'||r.integrity===s.integrity));
  const pages=Math.ceil(filtered.length/25),currentPage=Math.min(s.page,Math.max(1,pages)),linked=source.filter(r=>r.integrity==='linked').length;
  return{actorId:m.actor,merchantId:m.merchant,canManage:m.writable,checkedAt:new Date().toISOString(),selection:s,templates:m.templates,
    stats:{total:source.length,linked,unlinked:source.length-linked,states:Object.fromEntries(orderNoticeState.options.map(v=>[v,source.filter(r=>r.state===v).length])),evidence:Object.fromEntries(orderNoticeEvidence.options.map(v=>[v,source.filter(r=>r.evidence===v).length]))},
    rows:filtered.slice((currentPage-1)*25,currentPage*25),matched:filtered.length,pages,currentPage,pageSize:25,evidenceScope:'matching_provider_receipts',...m.override};
}
const detail=(id=1)=>({actorId:m.actor,merchantId:m.merchant,canManage:m.writable,checkedAt:new Date().toISOString(),row:m.rows.find(r=>r.id===id)});
let root:Root,container:HTMLDivElement,memory:ReturnType<typeof memoryLocation>;
const render=()=>act(async()=>{root.render(<Router hook={memory.hook} searchHook={memory.searchHook}><Page/></Router>);});
const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(n=>n.textContent?.trim().startsWith(text));
const click=(text:string)=>act(async()=>{expect(button(text)).toBeTruthy();button(text)!.click();});
const fill=(value:string)=>act(async()=>{const el=document.getElementById('on-message') as HTMLTextAreaElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const history=()=>click(m.language==='ar'?ar.history:en.history);
beforeEach(()=>{
  Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});vi.resetAllMocks();Object.assign(m,{actor:7,merchant:20,language:'en',selection:orderNoticeSelection.parse({}),override:{},writable:true,error:null,fetching:false,rows:[row()],
    templates:orderNoticeStatus.options.map((status,i)=>({id:i+1,status,canonicalStatus:status,stored:true,template:'Order {{orderNumber}}',enabled:false,revision:'a'.repeat(64),updatedAt:'2026-10-03T09:00:00.000Z',issues:[]}))});
  m.fetch.mockImplementation(async()=>snapshot());m.detail.mockImplementation(async({id})=>detail(id));m.refresh.mockImplementation(async()=>({data:snapshot()}));
  m.save.mockImplementation(async v=>{const template=m.templates.find(r=>r.status===v.status);Object.assign(template,{template:v.template,enabled:v.enabled,revision:'b'.repeat(64)});return{actorId:m.actor,merchantId:m.merchant,template,effect:'saved',sendsMessage:false};});
  m.ack.mockImplementation(async v=>{for(const r of v.records)Object.assign(m.rows.find(n=>n.id===r.id),{state:'suppressed',revision:'b'.repeat(64)});return{actorId:m.actor,merchantId:m.merchant,acknowledgedIds:v.records.map((r:any)=>r.id),sendsMessage:false};});
  memory=memoryLocation({path:'/merchant/order-notifications',record:true});container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it.each(['ar','en'])('renders six templates and a literal message with translated labels in %s',async language=>{
  m.language=language;const c=language==='ar'?ar:en;await render();expect(container.querySelectorAll('.on-card')).toHaveLength(6);expect(container.textContent).toContain(c.title);expect(container.textContent).not.toContain('merchantUx.');
  await history();await click(c.details);expect(document.querySelector('[role=dialog]')?.textContent).toContain(m.rows[0].message);expect(document.querySelector('img')).toBeNull();expect(document.body.textContent).toContain(c.evidenceHelp);
});
it('previews variables without sending and keeps field errors beside the input',async()=>{
  await render();await click(en.edit);expect(document.querySelector('.on-preview')?.textContent).toContain('DEMO-1042');await fill('{{private}}');await click(en.save);
  expect(document.body.textContent).toContain(en.fieldError);expect(document.activeElement?.id).toBe('on-message');expect(m.save).not.toHaveBeenCalled();
});
it('saves the reviewed status, revision, trimmed text and enabled flag',async()=>{
  await render();await click(en.edit);await fill('  Reviewed {{customerName}}  ');await act(async()=>{document.querySelector<HTMLInputElement>('.on-check input')!.click();});await click(en.save);
  expect(m.save).toHaveBeenCalledWith({status:'pending',revision:'a'.repeat(64),template:'Reviewed {{customerName}}',enabled:true});expect(document.body.textContent).toContain(en.saved);
});
it('checks a landed but uncertain save through a read instead of sending again',async()=>{
  m.save.mockImplementation(async v=>{Object.assign(m.templates[0],{template:v.template,revision:'c'.repeat(64)});throw Error('lost');});
  await render();await click(en.edit);await fill('Landed');await click(en.save);expect(document.body.textContent).toContain(en.uncertain);expect(document.getElementById('on-message')).toHaveProperty('disabled',true);
  await click(en.check);expect(document.getElementById('on-message')).toHaveProperty('value','Landed');expect(m.save).toHaveBeenCalledOnce();expect(document.body.textContent).toContain(en.checked);
});
it('requires a fresh read after a conflict and preserves the changed template',async()=>{
  m.save.mockImplementation(async()=>{m.templates[0].template='Another editor';throw{data:{code:'CONFLICT'}};});await render();await click(en.edit);await fill('My edit');await click(en.save);
  expect(document.body.textContent).toContain(en.stale);await click(en.check);expect(document.getElementById('on-message')).toHaveProperty('value','Another editor');expect(m.save).toHaveBeenCalledOnce();
});
it('requires explicit acknowledgement and sends only the displayed record revision',async()=>{
  m.rows.push(row(2));await render();await history();await click(en.details);expect(button(en.acknowledge)).toHaveProperty('disabled',true);
  await act(async()=>{document.querySelector<HTMLInputElement>('.on-check input')!.click();});await click(en.acknowledge);
  expect(m.ack).toHaveBeenCalledWith({records:[{id:1,revision:'a'.repeat(64)}]});expect(m.rows[1].state).toBe('manual_review');expect(document.body.textContent).toContain(en.acknowledged);
});
it('blocks a second acknowledgement until the current record is read after ambiguity',async()=>{
  m.ack.mockImplementation(async()=>{m.rows[0].state='suppressed';throw Error('lost');});await render();await history();await click(en.details);await act(async()=>{document.querySelector<HTMLInputElement>('.on-check input')!.click();});await click(en.acknowledge);
  expect(document.body.textContent).toContain(en.uncertain);await click(en.check);expect(button(en.acknowledge)).toBeUndefined();expect(m.ack).toHaveBeenCalledOnce();
});
it('keeps tracking details available behind a compact disclosure on mobile',async()=>{
  await render();await history();await click(en.details);const disclosure=document.querySelector('dialog details, [role=dialog] details') as HTMLDetailsElement;
  expect(disclosure.open).toBe(false);expect(disclosure.querySelector('summary')?.textContent).toBe(en.recordDetails);
  await act(async()=>disclosure.querySelector('summary')!.click());expect(disclosure.open).toBe(true);expect(disclosure.textContent).toContain(en.providerId);expect(disclosure.textContent).toContain(en.reviewedBy);
});
it('allows viewers to read both areas without write controls',async()=>{
  m.writable=false;await render();await click(en.details);expect(button(en.save)).toBeUndefined();expect(document.getElementById('on-message')).toHaveProperty('disabled',true);
  await click(en.close);await history();await click(en.details);expect(button(en.acknowledge)).toBeUndefined();
});
it('rejects foreign or stale list data and source errors instead of showing successful empty totals',async()=>{
  m.override={merchantId:999};await render();expect(container.querySelector('.sc-summary')).toBeNull();m.override={};m.error=Error('private');await render();expect(container.querySelector('.sc-summary')).toBeNull();expect(container.textContent).not.toContain('private');
});
it('rejects foreign detail and mutation results',async()=>{
  m.fetch.mockImplementation(async()=>({...snapshot(),merchantId:999}));await render();await click(en.edit);expect(document.getElementById('on-message')).toBeNull();
  m.fetch.mockImplementation(async()=>snapshot());await click(en.check);m.save.mockResolvedValue({actorId:999,merchantId:20,template:m.templates[0],effect:'saved',sendsMessage:false});await click(en.save);expect(document.body.textContent).toContain(en.uncertain);
});
it('preserves history and page in the URL and resets page on a filter change',async()=>{
  m.rows=Array.from({length:30},(_,i)=>row(i+1));await render();await history();await click(en.next);expect(m.selection.page).toBe(2);expect(container.querySelectorAll('.on-card')).toHaveLength(5);
  const select=container.querySelectorAll('select')[2];await act(async()=>{select.value='accepted';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(m.selection).toMatchObject({page:1,evidence:'accepted'});expect(container.textContent).toContain(en.noResults);
});
it('keeps unsupported template content readable without offering to write its status',async()=>{
  m.templates=[{...m.templates[0],status:'confirmed',canonicalStatus:null,issues:['status']}];await render();await click(en.details);expect(document.body.textContent).toContain(en.unsupported);expect(button(en.save)).toBeUndefined();
});
it('closes stale detail on tenant changes and ignores its late response',async()=>{
  let resolve!:(v:any)=>void;m.detail.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await history();await click(en.details);const old=detail();m.merchant=30;await render();await act(async()=>resolve(old));expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('blocks duplicate saves and closing the dialog while a save is pending',async()=>{
  let resolve!:(v:any)=>void;m.save.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await click(en.edit);await click(en.save);await click(en.close);expect(document.querySelector('[role=dialog]')).not.toBeNull();expect(button(en.saving)).toHaveProperty('disabled',true);
  await act(async()=>resolve({actorId:7,merchantId:20,template:m.templates[0],effect:'already_current',sendsMessage:false}));expect(m.save).toHaveBeenCalledOnce();
});
