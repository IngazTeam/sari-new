// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
import MerchantShell from '../client/src/components/merchant/MerchantShell';
import { navigableMerchantTools } from '../client/src/components/merchant/navigation';
let language:'ar'|'en'='ar', integration='none';
const logout=vi.fn();
const translate=(key:string,args:Record<string,unknown>={})=>{
  const value=key.split('.').reduce((v:any,k)=>v?.[k],{ar,en}[(args.lng as 'ar'|'en')||language]);
  return typeof value==='string'?value.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(args[k]??'')):key;
};
vi.mock('react-i18next',()=>({useTranslation:()=>({t:translate,i18n:{language,dir:()=>language==='ar'?'rtl':'ltr'}})}));
vi.mock('../client/src/_core/hooks/useAuth',()=>({useAuth:()=>({user:{id:1,name:'Fixture',email:'fixture@example.test',role:'merchant'},logout})}));
vi.mock('../client/src/lib/trpc',()=>({trpc:{merchants:{getCurrent:{useQuery:()=>({data:{id:10,businessName:'Fixture store'}})}}}}));
vi.mock('../client/src/hooks/useIntegration',()=>({useIntegration:()=>({source:integration,term:(key:string)=>({products:'Catalog items',customers:'Store buyers',orders:'Store purchases'}[key]||key)})}));
vi.mock('../client/src/components/MerchantSelector',()=>({MerchantSelector:()=>null}));
vi.mock('../client/src/components/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('../client/src/components/LanguageSwitcher',()=>({LanguageSwitcher:()=>null}));
vi.mock('../client/src/components/ThemeSwitcher',()=>({ThemeSwitcher:()=>null}));
vi.mock('../client/src/components/EmergencyPhoneButton',()=>({EmergencyPhoneButton:()=>null}));
vi.mock('../client/src/components/SubscriptionBadge',()=>({SubscriptionBadge:()=>null}));
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
  language='ar';integration='none';logout.mockReset();localStorage.clear();sessionStorage.clear();
  vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const mount=async(path='/merchant/tools')=>{
  const memory=memoryLocation({path,record:true});
  await act(async()=>root.render(React.createElement(Router,{hook:memory.hook},React.createElement(MerchantShell,{children:React.createElement('h1',null,'Fixture page')}))));
  return memory;
};
const click=async(el:Element|null)=>{expect(el).toBeTruthy();await act(async()=>{(el as HTMLElement).click();});};
const key=async(el:Element,value:string,extra:KeyboardEventInit={})=>{await act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra})));};
const open=()=>click(document.querySelector('.mw-search-trigger'));
const input=()=>document.querySelector<HTMLInputElement>('#merchant-tool-search')!;
const results=()=>[...document.querySelectorAll<HTMLAnchorElement>('#merchant-tool-results a')];
const fill=async(value:string)=>{await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);
  input().dispatchEvent(new Event('input',{bubbles:true}));
});};
describe('merchant shell shared navigation and search',()=>{
  it.each(['ar','en'] as const)('keeps the tool directory active without also selecting Settings in %s',async lng=>{
    language=lng;await mount();
    expect(container.querySelector('.merchant-workspace')?.getAttribute('dir')).toBe(lng==='ar'?'rtl':'ltr');
    const current=container.querySelectorAll('.mw-sidebar .mw-nav a[aria-current=page]');
    expect([...current].map(a=>a.getAttribute('href'))).toEqual(['/merchant/tools']);
    expect(container.querySelector('.mw-store small')?.textContent).toBe(translate('merchantToolsUx.title'));
    expect(container.textContent).not.toMatch(/merchantShellUx|merchantNavigationUx/);
    if(lng==='en')expect(container.querySelector('.mw-nav')?.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });
  it('offers the exact real catalog and searches Arabic spelling, English names and old aliases',async()=>{
    await mount();await open();
    expect(results().map(a=>a.getAttribute('href'))).toEqual(navigableMerchantTools.map(t=>t.path));
    await fill('مُسَاعِد');expect(results()).toHaveLength(9);
    await fill('assistant language');expect(results().map(a=>a.getAttribute('href'))).toEqual(['/merchant/language-settings']);
    await fill('/merchant/sari-analytics');expect(results()).toHaveLength(1);expect(results()[0].href).toContain('/merchant/message-analytics');
    expect(document.querySelector('.mw-search-dialog [role=status]')?.textContent).toContain('1 من 93');
  });
  it('includes current integration terminology while retaining canonical destinations',async()=>{
    integration='salla';await mount('/merchant/products');await open();await fill('Catalog items');
    expect(results()).toHaveLength(1);expect(results()[0].getAttribute('href')).toBe('/merchant/products');
    expect(results()[0].textContent).toContain('Catalog items');
  });
  it('recovers from empty results without losing input focus or rendering injected markup',async()=>{
    await mount();await open();await fill('<img src=x onerror=alert(1)>');
    expect(results()).toHaveLength(0);expect(document.querySelector('.mw-search-dialog img')).toBeNull();
    const clear=[...document.querySelectorAll('button')].find(b=>b.textContent===translate('merchantShellUx.clearSearch'))!;
    await click(clear);expect(input().value).toBe('');expect(document.activeElement).toBe(input());expect(results()).toHaveLength(93);
  });
  it('moves between input and result links with arrows and respects text composition',async()=>{
    await mount();await open();input().focus();
    await key(input(),'ArrowDown',{isComposing:true});expect(document.activeElement).toBe(input());
    await key(input(),'ArrowDown');expect(document.activeElement).toBe(results()[0]);
    await key(results()[0],'ArrowDown');expect(document.activeElement).toBe(results()[1]);
    await key(results()[1],'End');expect(document.activeElement).toBe(results().at(-1));
    await key(results().at(-1)!,'Home');expect(document.activeElement).toBe(results()[0]);
    await key(results()[0],'ArrowUp');expect(document.activeElement).toBe(input());
  });
  it('opens with the shortcut, closes with Escape and returns focus to search',async()=>{
    await mount();await key(document.body,'k',{ctrlKey:true});expect(input()).toBeTruthy();
    await key(input(),'Escape');expect(input()).toBeNull();expect(document.activeElement).toBe(document.querySelector('.mw-search-trigger'));
    await key(document.body,'k',{ctrlKey:true,isComposing:true});expect(input()).toBeNull();
  });
  it.each(['ar','en'] as const)('returns drawer focus to the More button and localizes its close action in %s',async lng=>{
    language=lng;await mount();const more=document.querySelector('.mw-bottom-nav button')!;await click(more);
    const sheet=document.querySelector('.mw-mobile-sheet')!;expect(sheet.getAttribute('dir')).toBe(lng==='ar'?'rtl':'ltr');
    expect(sheet.className).toContain(lng==='ar'?'right-0':'left-0');
    const close=sheet.querySelector('[data-slot=sheet-close]');expect(close?.textContent).toBe(translate('merchantShellUx.close'));
    await click(close);expect(document.querySelector('.mw-mobile-sheet')).toBeNull();await vi.waitFor(()=>expect(document.activeElement).toBe(more));
  });
  it('navigates through a search result and clears the previous query on the destination',async()=>{
    const memory=await mount();await open();await fill('assistant language');await click(results()[0]);
    expect(memory.history.at(-1)).toBe('/merchant/language-settings');expect(input()).toBeNull();
    await open();expect(input().value).toBe('');expect(results()).toHaveLength(93);expect(logout).not.toHaveBeenCalled();
  });
});
