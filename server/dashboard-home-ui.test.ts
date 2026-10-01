// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
import merchantAr from '../client/src/locales/merchant-ux.ar';
import merchantEn from '../client/src/locales/merchant-ux.en';
import Dashboard from '../client/src/pages/merchant/Dashboard';
let language:'ar'|'en'='en';
const translate=(key:string,args:Record<string,unknown>={})=>{const dict=language==='ar'?{...ar,merchantUx:merchantAr}:{...en,merchantUx:merchantEn};const value=key.split('.').reduce((v:any,k)=>v?.[k],dict);return typeof value==='string'?value.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(args[k]??'')):key;};
vi.mock('react-i18next',()=>({useTranslation:()=>({t:translate,i18n:{language,dir:()=>language==='ar'?'rtl':'ltr'}})}));
const state=vi.hoisted(()=>({queries:{} as Record<string,any>,calls:[] as any[]}));
vi.mock('../client/src/lib/trpc',()=>({trpc:new Proxy({}, {get:(_,namespace:string)=>new Proxy({}, {get:(_,method:string)=>({useQuery:(input:any,options:any)=>{const key=namespace+'.'+method;state.calls.push({key,input,options});if(!state.queries[key])throw Error(key);return state.queries[key];}})})})}));
vi.mock('../client/src/components/TrialBanner',()=>({TrialBanner:()=>null}));
vi.mock('../client/src/components/QueryStateCard',()=>({QueryStateCard:({title,description}:any)=>React.createElement('div',{role:'alert'},title,description)}));
const query=(data:any)=>({data,isLoading:false,isFetching:false,isError:false,refetch:vi.fn(async()=>({data}))});
const emptyMetrics=()=>({totalOrders:0,validValueOrders:0,excludedValueOrders:0,totalValueMinor:0,deliveredOrders:0,deliveredValueMinor:0,excludedDeliveredValues:0,averageValueMinor:null});
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
 language='en';state.calls=[];state.queries={
  'merchants.getCurrent':query({id:20,businessName:'Test store'}),
  'merchants.getOnboardingStatus':query({setupCompleted:false,stage:'registered',channelState:'connected'}),
  'dashboard.workspace':query({version:1,merchantId:20,days:7,currency:'USD',timeZone:'UTC',from:'2026-09-24T12:00:00Z',through:'2026-10-01T12:00:00Z',previousFrom:'2026-09-17T12:00:00Z',current:emptyMetrics(),previous:emptyMetrics(),growth:{orders:null,value:null},trend:[],products:[],productSample:{eligibleOrders:0,inspectedOrders:0,omittedOrders:0,excludedOrders:0,excludedItems:0,includedItems:0,orderLimit:250}}),
  'conversations.listRecent':query([{id:1,customerName:'Example',customerPhone:'a+b?x',status:'unexpected'}]),
  'conversations.count':query(1),'campaigns.getStats':query({totalCampaigns:2}),
  'reviews.getStats':query({totalReviews:3,averageRating:4.7}),
  'botSettings.shouldRespond':query({merchantId:20,shouldRespond:false,reason:'Outside working hours',checkedAt:'2026-10-01T12:00:00Z'}),
  'sariBrain.getIntegrationSyncStatus':query({hasData:false,lastSyncAt:null}),
  'dashboard.getAiInsights':query([{title:'Fixture suggestion',body:'Read evidence',action:null}]),
  'sariBrain.getLearningDashboard':query({totalConversations:1,totalSignals:2,dnaInsights:[],learningEvidence:{proposalCount:0,verifiedPurchases:0,verifiedRefunds:0,proposals:[]}}),
 };
 vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const mount=async(searchPath='')=>{const memory=memoryLocation({path:'/merchant/dashboard',searchPath,record:true});await act(async()=>root.render(React.createElement(Router,{hook:memory.hook,searchHook:memory.searchHook},React.createElement(Dashboard))));return memory;};
const click=async(el:Element|null)=>{expect(el).toBeTruthy();await act(async()=>{(el as HTMLElement).click();});};
const button=(text:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;
const details=async()=>{const el=container.querySelector<HTMLDetailsElement>('details.mw-panel')!;await act(async()=>{el.open=true;el.dispatchEvent(new Event('toggle'));});};
describe('merchant home scope, evidence, access and requests',()=>{
 it('hides failed stale suggestions and requires a fresh request after changing language',async()=>{await mount();await details();await click(button('Request suggestions'));expect(container.textContent).toContain('Fixture suggestion');state.queries['dashboard.getAiInsights'].isError=true;await mount();expect(container.textContent).not.toContain('Fixture suggestion');state.queries['dashboard.getAiInsights'].isError=false;language='ar';await mount();expect(container.textContent).not.toContain('Fixture suggestion');expect(state.calls.filter(c=>c.key==='dashboard.getAiInsights').at(-1).input.language).toBe('ar');await click(button('طلب اقتراحات'));expect(container.textContent).toContain('Fixture suggestion');});
 it.each(['ar','en'] as const)('retains all key destinations and translations in %s',async lng=>{language=lng;await mount();expect(container.querySelectorAll('h1')).toHaveLength(1);expect(container.querySelector('.mw-home')?.getAttribute('dir')).toBe(lng==='ar'?'rtl':'ltr');expect(container.querySelectorAll('.mw-home-brain-links a')).toHaveLength(4);expect(Array.from(container.querySelectorAll('.mw-home-brain-links a')).map(a=>a.getAttribute('href'))).toContain('/merchant/sari-brain?view=knowledge&pane=conflicts');expect(container.textContent).not.toMatch(/dashboardHomeUx|assistantScheduleStatusUx|botSettingsPage/);if(lng==='en')expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);expect(container.querySelector('a[href="/merchant/conversations?phone=a%2Bb%3Fx"]')).toBeTruthy();expect(container.textContent).toContain(translate('dashboardHomeUx.unknownStatus'));});
 it.each([{isFetching:true},{isError:true},{data:undefined}])('does not start tenant queries before a current store is confirmed %j',async change=>{Object.assign(state.queries['merchants.getCurrent'],change);await mount();expect(state.calls.map(x=>x.key)).toEqual(['merchants.getCurrent']);expect(container.querySelector('.mw-home')).toBeNull();});
 it('shows the saved schedule independently from channel connection and setup completion',async()=>{await mount();expect(container.textContent).toContain('Channel connected');expect(container.textContent).toContain(translate('botSettingsPage.reasonOutsideHours'));expect(container.textContent).toContain('Complete your business setup');expect(container.querySelector('a[href="/merchant/bot-settings"]')).toBeTruthy();});
 it('does not declare completion or retain stale count/review information after failed reads',async()=>{for(const name of ['merchants.getOnboardingStatus','campaigns.getStats','reviews.getStats','conversations.listRecent','conversations.count'])state.queries[name].isError=true;await mount();expect(container.textContent).not.toContain('Channel connected');expect(container.textContent).not.toContain('Complete your business setup');expect(container.textContent).not.toContain('4.7');expect(container.textContent).not.toContain('Example');expect(container.textContent).not.toContain('No reviews to calculate');expect(container.textContent).toContain('Channel state unavailable');});
 it('delays knowledge queries until expansion and generates suggestions only on explicit request',async()=>{await mount();expect(state.calls.some(c=>c.key==='dashboard.getAiInsights'||c.key==='sariBrain.getLearningDashboard')).toBe(false);await details();const calls=state.calls.filter(c=>c.key==='dashboard.getAiInsights');expect(calls.length).toBeGreaterThan(0);expect(calls.every(c=>c.options.enabled===false)).toBe(true);expect(container.textContent).not.toContain('Fixture suggestion');expect(state.queries['dashboard.getAiInsights'].refetch).not.toHaveBeenCalled();await click(button('Request suggestions'));expect(state.queries['dashboard.getAiInsights'].refetch).toHaveBeenCalledOnce();expect(container.textContent).toContain('Fixture suggestion');});
 it('suppresses stale learning evidence and treats an absent sync result as failure',async()=>{state.queries['sariBrain.getIntegrationSyncStatus'].data=null;state.queries['sariBrain.getLearningDashboard'].isError=true;await mount();await details();expect(container.textContent).not.toContain('No reliable sync time available');expect(container.querySelectorAll('[role=alert]').length).toBeGreaterThanOrEqual(2);expect(container.textContent).not.toContain(translate('merchantUx.learningEvidence.verifiedPurchases'));});
 it('keeps the period in navigation and restores it after history changes',async()=>{const memory=await mount('days=30&source=fixture');expect((container.querySelector('#dashboard-period') as HTMLSelectElement).value).toBe('30');await act(async()=>{const el=container.querySelector<HTMLSelectElement>('#dashboard-period')!;el.value='90';el.dispatchEvent(new Event('change',{bubbles:true}));});expect(memory.history.at(-1)).toBe('/merchant/dashboard?days=90&source=fixture');await act(async()=>memory.navigate('/merchant/dashboard?days=30'));expect((container.querySelector('#dashboard-period') as HTMLSelectElement).value).toBe('30');expect(state.calls.filter(c=>c.key==='dashboard.workspace').at(-1).input.days).toBe(30);});
 it('opens all quick actions with direction, closes with Escape and restores focus',async()=>{await mount();const opener=button('Quick action');await click(opener);const dialog=document.querySelector('[role=dialog]')!;expect(dialog.getAttribute('dir')).toBe('ltr');expect(dialog.querySelectorAll('a')).toHaveLength(5);expect(dialog.querySelector('a[href="/merchant/services/new"]')).toBeTruthy();await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await vi.waitFor(()=>expect(document.querySelector('[role=dialog]')).toBeNull());await vi.waitFor(()=>expect(document.activeElement).toBe(opener));});
});
