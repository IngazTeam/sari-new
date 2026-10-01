import {readFileSync} from 'node:fs';
import {runInContext} from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
import {afterEach,beforeEach,expect,it} from 'vitest';
const base='prototypes/tenant-dashboard/site/';
let dom:JSDOM,w:any,errors:unknown[];
beforeEach(()=>{
  errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  dom=new JSDOM(readFileSync(base+'index.html','utf8'),{url:'http://127.0.0.1:4329/#/page/merchant/campaigns/3/report?lang=en',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});w=dom.window;
  w.structuredClone=structuredClone;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  for(const name of ['features.js','page-catalog.js','brain.js','brain-embed.js','brain-workbench.js','notifications.js','pages.js','app.js'])runInContext(readFileSync(base+name,'utf8'),dom.getInternalVMContext());
});
afterEach(()=>{expect(errors).toEqual([]);dom.window.close();});
it.each(['/merchant/campaigns','/merchant/campaigns/new','/merchant/campaigns/1/edit','/merchant/campaigns/3','/merchant/campaigns/3/report'])('updates title, context and standalone link without replacing the model at %s',path=>{
  const frame=w.document.querySelector('iframe'),main=w.document.getElementById('main'),initialDocument=frame.contentDocument;
  const search=new URLSearchParams({path,lang:'en',tenant:'259',scenario:'readonly'}).toString();
  w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:frame.contentWindow,data:{type:'sary-brain-preview',action:'campaignState',search}}));
  expect(w.document.title).toBe(w.TenantPages.find(path).title+' · ساري');expect(main.dataset.pageRoute).toBe(w.TenantPages.find(path).route);
  expect(w.document.querySelector('iframe')).toBe(frame);expect(frame.contentDocument).toBe(initialDocument);
  const standalone=new URL(main.querySelector('.page-local-note a').href);expect(Object.fromEntries(standalone.searchParams)).toEqual({path,lang:'en',tenant:'259',scenario:'readonly'});
  // A later shell rerender must use the destination, not the original report page.
  w.render();expect(new URL(w.document.querySelector('iframe').src).searchParams.get('path')).toBe(path);
});
it('does not alter page context for untrusted, unrelated or invalid frame updates',()=>{
  const frame=w.document.querySelector('iframe'),title=w.document.title,href=w.document.querySelector('.page-local-note a').href;
  const data={type:'sary-brain-preview',action:'campaignState',search:'path=/merchant/campaigns/new'};
  for(const event of [{origin:'https://example.test',source:frame.contentWindow,data},{origin:w.location.origin,source:w,data},{origin:w.location.origin,source:frame.contentWindow,data:{...data,search:'path=/merchant/campaigns/new&token=secret'}}])w.dispatchEvent(new w.MessageEvent('message',event));
  expect(w.document.title).toBe(title);expect(w.document.querySelector('.page-local-note a').href).toBe(href);
});
