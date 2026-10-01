import {readFileSync} from 'node:fs';
import {runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {MessageChannel} from 'node:worker_threads';
import {TextEncoder,TextDecoder} from 'node:util';
import {JSDOM,VirtualConsole} from 'jsdom';
import {it,expect,afterEach,vi,describe} from 'vitest';
import {campaignModes} from '../prototypes/tenant-dashboard/src/campaign-preview-model';
const base='prototypes/tenant-dashboard/site/';
let dom:JSDOM|undefined,w:any,errors:unknown[]=[];
afterEach(()=>{dom?.window.close();dom=undefined;vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(search='lang=en'){
  errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));dom=new JSDOM(readFileSync(base+'campaign-workspace.html','utf8'),{url:'http://127.0.0.1:4329/campaign-workspace.html?'+search,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});w=dom.window;
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.MessageChannel=class extends MessageChannel{constructor(){super();this.port1.unref();this.port2.unref();}};
  Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});w.crypto.randomUUID=()=>webcrypto.randomUUID();
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.URL.createObjectURL=()=> 'blob:local-sample';w.URL.revokeObjectURL=()=>{};
  w.fetch=()=>{throw Error('Forbidden network request');};w.XMLHttpRequest=class{constructor(){throw Error('Forbidden XHR');}};Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>{throw Error('Real microphone must not open');}}});
  runInContext(readFileSync(base+'campaign-preview.js','utf8'),dom.getInternalVMContext());await vi.waitFor(()=>expect(w.document.querySelector('aside')).toBeTruthy());
}
const text=()=>w.document.body.textContent;
const el=(selector:string)=>w.document.querySelector(selector);
async function click(selector:string){expect(el(selector)).toBeTruthy();el(selector).click();await new Promise(resolve=>setTimeout(resolve,30));}
async function change(selector:string,value:string){const target=el(selector);Object.getOwnPropertyDescriptor(target.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:target.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value')!.set!.call(target,value);target.dispatchEvent(new w.Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,40));}

async function button(label:string){const found=Array.from(w.document.querySelectorAll('button')).find((node:any)=>node.textContent.trim()===label) as any;expect(found,label).toBeTruthy();found.click();await new Promise(r=>setTimeout(r,40));}
async function link(label:string){const found=Array.from(w.document.querySelectorAll('a')).find((node:any)=>node.textContent.trim()===label) as any;expect(found,label).toBeTruthy();found.click();await new Promise(r=>setTimeout(r,40));}
describe('actual bundled campaign pages',()=>{
  const paths=['/merchant/campaigns','/merchant/campaigns/new','/merchant/campaigns/1/edit','/merchant/campaigns/3','/merchant/campaigns/3/report'];
  it.each(paths)('embeds the actual page at the central route %s with its query intact',path=>{
    dom=new JSDOM('<main id="main"></main>',{url:'http://127.0.0.1:4329/#/page'+path+'?lang=en&tenant=259&scenario=readonly',runScripts:'outside-only'});w=dom.window;
    for(const file of ['page-catalog.js','pages.js'])runInContext(readFileSync(base+file,'utf8'),dom.getInternalVMContext());
    w.document.querySelector('main').innerHTML=w.TenantPages.render(w.TenantPages.find(path));
    const frame=w.document.querySelector('iframe[data-brain-preview]');expect(frame).toBeTruthy();
    const url=new URL(frame.src);expect(url.pathname).toBe('/campaign-workspace.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({path,lang:'en',tenant:'259',scenario:'readonly',embed:'brain'});
    expect(w.document.querySelector('[data-page-form=compose]')).toBeNull();
  });
  it.each(campaignModes.flatMap(mode=>paths.map(path=>({mode,path}))))('renders $mode at $path without runtime or translation failures',async({mode,path})=>{
    await mount('lang=en&scenario='+mode+'&path='+path);expect(text()).toContain('Actual campaign preview');expect(errors).toEqual([]);expect(text()).not.toMatch(/merchantUx\.|common\./);
    if(['failure','forbidden','session','foreign','stale-error','loading'].includes(mode)){expect(el('#ce-name')).toBeNull();expect(el('.cr-records')).toBeNull();expect(el('.cw-records')).toBeNull();}
  });
  it.each(['ar','en'])('mounts performance and changes all periods in %s',async lang=>{
    await mount('lang='+lang+'&tab=performance');for(const days of [7,90,30]){const buttons=Array.from(w.document.querySelectorAll('button'));const target=buttons.find((b:any)=>b.textContent.includes(String(days))) as any;expect(target).toBeTruthy();target.click();await new Promise(r=>setTimeout(r,40));expect(w.document.querySelectorAll('tbody tr')).toHaveLength(days);}
    expect(errors).toEqual([]);expect(text()).not.toContain('merchantUx.');
  });
  it('validates inline, saves only after review, and reopens the same draft from actual details',async()=>{
    await mount('lang=en&path=/merchant/campaigns/new');await button('Review and save');expect(el('#ce-name').getAttribute('aria-invalid')).toBe('true');expect(w.document.activeElement.id).toBe('ce-name');
    await change('#ce-name','Local reviewed draft');await change('#ce-message','Message saved through the actual form');await button('Review and save');expect(el('[role=dialog]')).toBeTruthy();expect(text()).toContain('Local operations: 0');await button('Save draft');
    await vi.waitFor(()=>expect(w.location.search).toContain('campaigns%2F32'));expect(text()).toContain('Local reviewed draft');expect(text()).toContain('Local operations: 1');await link('Edit campaign');expect(el('#ce-message').value).toBe('Message saved through the actual form');expect(errors).toEqual([]);
  });
  it('paginates all report records, filters results and exports through the actual CSV adapter',async()=>{
    await mount('lang=en&path=/merchant/campaigns/3/report');expect(w.document.querySelectorAll('.cr-records>li')).toHaveLength(25);await button('Next');expect(w.document.querySelectorAll('.cr-records>li')).toHaveLength(6);expect(w.location.search).toContain('page=2');
    await button('Result records');expect(w.location.search).toContain('view=results');expect(w.document.querySelectorAll('.cr-records>li')).toHaveLength(25);const captured:any[]=[];w.URL.createObjectURL=(blob:any)=>{captured.push(blob);return 'blob:local-sample';};const original=w.HTMLAnchorElement.prototype.click;w.HTMLAnchorElement.prototype.click=function(){if(!this.download)return original.call(this);};await button('Export matching results');expect(captured).toHaveLength(1);expect(captured[0].size).toBeGreaterThan(1000);expect(errors).toEqual([]);
  });
  it('does not leak a pending save when the selected tenant changes',async()=>{
    await mount('lang=en&scenario=pending-save&path=/merchant/campaigns/new');await change('#ce-name','Pending A');await change('#ce-message','Unfinished local draft');await button('Review and save');await button('Save draft');expect(el('[data-campaign-complete]')).toBeTruthy();await change('[data-campaign-tenant]','259');expect(el('#ce-name').value).toBe('');expect(text()).toContain('Local operations: 0');expect(w.location.search).not.toContain('campaigns%2F32');expect(errors).toEqual([]);
  });
  it('keeps the completion control inside the active modal so a pending simulation is usable',async()=>{
    await mount('lang=en&scenario=pending-save&path=/merchant/campaigns/new');await change('#ce-name','Complete locally');await change('#ce-message','A locally delayed save');await button('Review and save');await button('Save draft');expect(el('[role=dialog] [data-campaign-complete]')).toBeTruthy();await click('[data-campaign-complete]');await vi.waitFor(()=>expect(w.location.search).toContain('campaigns%2F32'));expect(text()).toContain('Local operations: 1');expect(errors).toEqual([]);
  });
});
