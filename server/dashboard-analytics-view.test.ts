// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
import { DashboardAnalytics } from '../client/src/components/merchant/DashboardAnalytics';
import type { DashboardWorkspace } from '../shared/dashboard-workspace';
let language:'ar'|'en'='en';
const translate=(key:string,args:Record<string,unknown>={})=>{
 const value=key.split('.').reduce((v:any,k)=>v?.[k],{ar,en}[language]);
 return typeof value==='string'?value.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(args[k]??'')):key;
};
vi.mock('react-i18next',()=>({useTranslation:()=>({t:translate,i18n:{language,dir:()=>language==='ar'?'rtl':'ltr'}})}));
let container:HTMLDivElement,root:Root;
beforeEach(()=>{language='en';vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const zero=()=>({totalOrders:0,validValueOrders:0,excludedValueOrders:0,totalValueMinor:0,deliveredOrders:0,deliveredValueMinor:0,excludedDeliveredValues:0,averageValueMinor:null});
const fixture=():DashboardWorkspace=>({version:1,merchantId:20,days:7,currency:'USD',timeZone:'UTC',from:'2026-09-24T12:00:00Z',through:'2026-10-01T12:00:00Z',previousFrom:'2026-09-17T12:00:00Z',current:{...zero(),totalOrders:2,validValueOrders:2,totalValueMinor:250,deliveredOrders:1,deliveredValueMinor:150,averageValueMinor:125},previous:zero(),growth:{orders:null,value:null},trend:[{date:'2026-09-30',orders:2,deliveredOrders:1,valueMinor:250,deliveredValueMinor:150,excludedValues:0}],products:[{name:'Fixture product',quantity:3,valueMinor:150,averageUnitMinor:50}],productSample:{eligibleOrders:1,inspectedOrders:1,omittedOrders:0,excludedOrders:0,excludedItems:0,includedItems:1,orderLimit:250}});
const retry=vi.fn();
const mount=async(props:Partial<React.ComponentProps<typeof DashboardAnalytics>>={})=>{retry.mockClear();await act(async()=>root.render(React.createElement(Router,{hook:memoryLocation({path:'/merchant/dashboard'}).hook},React.createElement(DashboardAnalytics,{merchantId:20,days:7,data:fixture(),onRetry:retry,...props}))));};
describe('dashboard analytics evidence and interaction',()=>{
 it.each(['ar','en'] as const)('renders the same minor-unit data, accessible table and routes in %s',async lng=>{language=lng;await mount();expect(container.querySelector('section')?.dir).toBe(lng==='ar'?'rtl':'ltr');expect(container.textContent).not.toMatch(/dashboardAnalyticsUx|NaN|Infinity/);expect(container.querySelectorAll('.mw-metric')).toHaveLength(4);expect(container.querySelectorAll('tbody tr')).toHaveLength(8);expect(container.querySelector('time[datetime="2026-09-30"]')).toBeTruthy();expect(container.querySelectorAll('thead th[scope=col]')).toHaveLength(3);expect(container.querySelector('a[href="/merchant/products"]')).toBeTruthy();if(lng==='en'){expect(container.textContent).toContain('US$2.50');expect(container.textContent).toContain('US$0.50');expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);}});
 it.each([{failed:true},{loading:true},{merchantId:21},{days:30 as const},{data:undefined}])('hides stale metrics and products for invalid/loading scope %j',async props=>{await mount(props);expect(container.querySelector('.mw-metric')).toBeNull();expect(container.textContent).not.toContain('Fixture product');});
 it('allows recovery without treating an error as zero',async()=>{await mount({failed:true});await act(async()=>container.querySelector('button')!.click());expect(retry).toHaveBeenCalledOnce();await mount();expect(container.querySelectorAll('.mw-metric')).toHaveLength(4);});
 it('switches the plot without changing the full daily table',async()=>{await mount();const count=container.querySelector('tbody')!.textContent;const first=container.querySelector('[aria-pressed=true]')!.textContent;await act(async()=>container.querySelectorAll<HTMLButtonElement>('.mw-chart-switch button')[1].click());expect(container.querySelector('[aria-pressed=true]')!.textContent).not.toBe(first);expect(container.querySelector('tbody')!.textContent).toBe(count);});
 it('separates no orders from missing product evidence and labels a partial sample',async()=>{const d=fixture();d.products=[];d.productSample={...d.productSample,excludedOrders:1,excludedItems:2,includedItems:0};await mount({data:d});expect(container.textContent).toContain('no reliable items');expect(container.textContent).toContain('Partial sample');expect(container.textContent).not.toContain('No delivered orders');d.current=zero();d.trend=[];d.productSample={...d.productSample,eligibleOrders:0,inspectedOrders:0,excludedOrders:0,excludedItems:0};await mount({data:d});expect(container.textContent).toContain('No orders in this period');expect(container.textContent).toContain('No delivered orders');expect(container.textContent).toContain('Unavailable');expect(container.textContent).not.toContain('100%');});
 it('renders invalid-value exclusions and literal untrusted names safely',async()=>{const d=fixture();d.current.validValueOrders=1;d.current.excludedValueOrders=1;d.trend[0].excludedValues=1;d.products[0].name='<img src=x onerror=alert(1)>';await mount({data:d});expect(container.textContent).toContain('Values for 1 orders were excluded');expect(container.querySelector('img')).toBeNull();expect(container.textContent).toContain('<img src=x');});
 it('rejects malformed and inconsistent snapshots',async()=>{const d=fixture();d.trend[0].orders=7;await mount({data:d});expect(container.querySelector('[role=alert]')).toBeTruthy();expect(container.querySelector('table')).toBeNull();});
});
