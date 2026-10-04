// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
const state=vi.hoisted(()=>({language:'en'}));
vi.mock('@/lib/trpc',()=>import('../prototypes/tenant-dashboard/src/service-preview-api'));
vi.mock('wouter',()=>import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:state.language},t:(key:string)=>key.split('.').reduce((o:any,k)=>o?.[k],state.language==='ar'?ar:en)||key})}));
import Page from '../client/src/pages/merchant/AcquisitionReport';
import {ServicePreviewContext} from '../prototypes/tenant-dashboard/src/service-preview-api';
import {ServicePreviewModel,type ServiceMode} from '../prototypes/tenant-dashboard/src/service-preview-model';
import {acquisitionSelection,scopedAcquisition} from '../client/src/lib/acquisition-workspace-view';
import {acquisitionPreview} from '../prototypes/tenant-dashboard/src/acquisition-preview-model';
let root:Root,host:HTMLDivElement,model:ServicePreviewModel;
const c=()=>state.language==='ar'?ar.acquisitionUx:en.acquisitionUx;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.language='en';history.replaceState(null,'','/?path=/merchant/acquisition-report');host=document.createElement('div');document.body.append(host);root=createRoot(host);model=new ServicePreviewModel(269);});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=()=>act(async()=>root.render(<ServicePreviewContext.Provider value={model}><Page/></ServicePreviewContext.Provider>));
const mode=(value:ServiceMode)=>{model.dispose();model=new ServicePreviewModel(269,value);};
const click=(label:string)=>act(async()=>{const b=Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(e=>e.textContent===label);expect(b).toBeTruthy();b!.click();});
it.each(['ar','en'])('uses the actual translated page, separates missing attribution and offers all details in %s',async lang=>{
 state.language=lang;await render();expect(host.querySelector('h1')?.textContent).toBe(c().title);expect(host.querySelectorAll('.acq-stats dd')).toHaveLength(3);expect(host.querySelectorAll('.acq-sources li')).toHaveLength(5);
 expect(host.textContent).toContain(c().evidence);expect(host.textContent).toContain(c().source_unattributed);expect(host.textContent).toContain(c().missingHint);expect(host.textContent).toContain(c().otherHint);expect(host.textContent).toContain(c().top);expect(host.textContent).toContain(c().trackingBody);
 expect(host.querySelectorAll('.acq-top li')).toHaveLength(3);expect(host.querySelectorAll('progress')).toHaveLength(5);expect(host.querySelector('a[href$="/merchant/customers"]')).not.toBeNull();expect(host.textContent).not.toMatch(/acquisitionUx\.|NaN/);expect(model.operations).toBe(0);
});
it('binds period changes to the URL and the source denominator',async()=>{
 const read=vi.spyOn(model,'read');await render();expect(host.querySelector('.acq-stats dd')?.textContent).toBe('57');
 await act(async()=>{const select=host.querySelector<HTMLSelectElement>('select')!;select.value='30d';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(location.search).toContain('period=30d');expect(read).toHaveBeenCalledWith('analytics.acquisitionWorkspace',{period:'30d'});expect(host.querySelector('.acq-stats dd')?.textContent).toBe('19');expect(model.operations).toBe(0);
 await click(c().refresh);expect(model.retries).toBe(1);expect(host.querySelector('.acq-stats dd')?.textContent).toBe('19');
});
it.each(['loading','failure','stale-error','foreign','session','forbidden'] as ServiceMode[])('hides stale metrics for %s',async value=>{mode(value);await render();expect(host.querySelector('.acq-stats')).toBeNull();expect(host.querySelector('progress')).toBeNull();expect(host.textContent).not.toContain(c().emptyBody);expect(model.operations).toBe(0);});
it('reports a genuinely empty successful read and preserves the method',async()=>{mode('empty');await render();expect(host.textContent).toContain(c().emptyBody);expect(host.querySelectorAll('.acq-stats dd')[0].textContent).toBe('0');expect(host.querySelector('progress')).toBeNull();expect(host.textContent).toContain(c().methodBody);});
it('keeps unknown-only evidence distinct from empty or direct traffic even after refresh',async()=>{mode('legacy');await render();expect(host.querySelectorAll('.acq-sources li')).toHaveLength(2);expect(host.querySelector('.acq-top')).toBeNull();expect(host.textContent).not.toContain(c().source_direct);expect(host.textContent).not.toContain(c().emptyBody);await click(c().refresh);expect(host.querySelectorAll('.acq-sources li')).toHaveLength(2);});
it('allows analytics reads for a read-only member without adding write controls',async()=>{mode('readonly');await render();expect(host.querySelectorAll('progress')).toHaveLength(5);expect(host.querySelectorAll('button')).toHaveLength(1);expect(model.operations).toBe(0);});
it.each(['period=bad','period=30d&period=90d'])('rejects invalid query %s before reading metrics and can reset it',async search=>{
 history.replaceState(null,'','/?path=/merchant/acquisition-report&'+search);const read=vi.spyOn(model,'read');await render();expect(host.textContent).toContain(c().invalidPeriodBody);expect(read.mock.calls.some(([name])=>name==='analytics.acquisitionWorkspace')).toBe(false);
 await click(c().reset);expect(host.querySelectorAll('progress')).toHaveLength(5);expect(location.search).toContain('period=all');
});
it.each(['period','actor','counts','private','fetching'])('does not display source evidence with mismatched or stale %s',async reason=>{
 const read=model.read.bind(model);vi.spyOn(model,'read').mockImplementation((name,input)=>{const r=read(name,input);if(name!=='analytics.acquisitionWorkspace')return r;return reason==='fetching'?{...r,isFetching:true}:{...r,data:{...r.data,...(reason==='period'?{period:'30d'}:reason==='actor'?{actorId:999}:reason==='counts'?{totalProfiles:999}:{secret:'PRIVATE'})}};});await render();expect(host.querySelector('.acq-stats')).toBeNull();expect(host.textContent).not.toContain('PRIVATE');
});
it('replaces the visible report when switching the tenant identity',async()=>{await render();expect(host.querySelector('.acq-stats dd')?.textContent).toBe('57');model.dispose();model=new ServicePreviewModel(270);await render();expect(host.querySelector('.acq-stats dd')?.textContent).toBe('45');});
it.each(['','period=all','period=30d','period=90d'])('accepts supported period %s',search=>expect(acquisitionSelection(search)).not.toBeNull());
it('requires the exact actor, merchant and period for a well-formed snapshot',()=>{const data=acquisitionPreview(1269,269,new Date().toISOString(),'normal',{});expect(scopedAcquisition(data,1269,269,'all')).not.toBeNull();expect(scopedAcquisition(data,1270,269,'all')).toBeNull();expect(scopedAcquisition(data,1269,270,'all')).toBeNull();expect(scopedAcquisition(data,1269,269,'30d')).toBeNull();});
