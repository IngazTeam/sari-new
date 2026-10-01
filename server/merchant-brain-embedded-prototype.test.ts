import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// @ts-expect-error local executable policy has no declaration
import { previewPolicy } from '../prototypes/tenant-dashboard/preview-policy.mjs';
let dom:JSDOM, w:any, frame:any;
beforeEach(()=>{
  dom=new JSDOM('<iframe data-brain-preview src="./knowledge-groups.html?embed=brain" title="Knowledge groups"></iframe>',{url:'http://127.0.0.1:4329/',runScripts:'outside-only'});
  w=dom.window;frame=w.document.querySelector('iframe');
  w.SaryBrainPreview={navigate:vi.fn(),openAdd:vi.fn()};
  runInContext(readFileSync('prototypes/tenant-dashboard/site/brain-embed.js','utf8'),dom.getInternalVMContext());
});
afterEach(()=>dom.window.close());
const send=(data:any,origin='http://127.0.0.1:4329',source=frame.contentWindow)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data}));
it.each(['sari-brain','virtual-team','human-takeover','language-settings','bot-settings','test-sari','sari-playground','quick-responses','ai-suggestions','voice-messages','scheduled-messages','whatsapp-auto-notifications','sari-analytics'])('opens %s only through the owned assistant hub frame',route=>{
  frame.setAttribute('src','./assistant-settings.html?embed=brain&page=hub');
  send({type:'sary-brain-preview',action:'assistantTool',route:'/merchant/'+route});
  expect(w.location.hash).toBe('#/page/merchant/'+route);
});
it('rejects arbitrary routes and assistant navigation from unrelated or altered frames',()=>{
  const message={type:'sary-brain-preview',action:'assistantTool',route:'/merchant/virtual-team'};
  frame.setAttribute('src','./assistant-settings.html?embed=brain&page=hub');
  send(message,'https://example.com');send(message,undefined,w);
  for(const route of ['/merchant/virtual-team?token=secret','/merchant/virtual-team#evil','/merchant/unknown','https://example.com','javascript:alert(1)',null])send({...message,route});
  for(const src of ['./assistant-settings.html?embed=brain','./personas.html?embed=brain&page=hub','./assistant-settings.html?embed=brain&page=hub&extra=true']){frame.setAttribute('src',src);send(message);}
  expect(w.location.hash).toBe('');
});
it('accepts only bounded measured height from an owned same-origin preview',()=>{
  send({type:'sary-brain-preview',action:'resize',height:900});expect(frame.style.height).toBe('900px');
  for(const height of [-1,NaN,Infinity,'800',20001]) send({type:'sary-brain-preview',action:'resize',height});
  expect(frame.style.height).toBe('900px');send({type:'sary-brain-preview',action:'resize',height:300});expect(frame.style.height).toBe('640px');
});
it.each(['pages','faqs','sections','conflicts','sales'])('connects the %s destination to the central router',destination=>{
  send({type:'sary-brain-preview',action:'navigate',destination});
  expect(w.SaryBrainPreview.navigate).toHaveBeenCalledWith(destination==='sales'?'sales':'knowledge',...destination==='sales'?[]:[{pages:'pages',faqs:'faq',sections:'sections',conflicts:'conflicts'}[destination]]);
});
it.each(['documents','upload'])('connects %s to the accessible upload workspace',destination=>{
  send({type:'sary-brain-preview',action:'navigate',destination});expect(w.SaryBrainPreview.openAdd).toHaveBeenCalledTimes(1);
});
it('rejects messages from other origins, unrelated windows, inactive frames and unlisted pages',()=>{
  const message={type:'sary-brain-preview',action:'navigate',destination:'upload'};
  send(message,'https://example.com');send(message,undefined,w);frame.removeAttribute('data-brain-preview');send(message);
  frame.setAttribute('data-brain-preview','');frame.src='./index.html?embed=brain';send(message);frame.src='./knowledge-groups.html';send(message);
  expect(w.SaryBrainPreview.openAdd).not.toHaveBeenCalled();
});
it('does not turn arbitrary message values into links or script destinations',()=>{
  for(const destination of ['__proto__','constructor','toString','javascript:alert(1)','https://example.com',null])send({type:'sary-brain-preview',action:'navigate',destination});
  expect(w.SaryBrainPreview.navigate).not.toHaveBeenCalled();expect(w.location.href).toBe('http://127.0.0.1:4329/');
});
it('retains independent question drafts across iframe replacement without persisting them',()=>{
  const cache=w.SaryBrainPrototypeCache, key='central:153:model', draft={name:'',content:'مسودة المثال',type:'custom'};
  cache.write(key,draft,cache.epoch());frame.remove();expect(cache.read(key)).toEqual(draft);
  draft.content='changed';expect(cache.read(key).content).toBe('مسودة المثال');expect(cache.read('central:154:model')).toBeNull();
  expect(w.localStorage.length+w.sessionStorage.length).toBe(0);
  const epoch=cache.epoch();cache.clear();cache.write(key,draft,epoch);expect(cache.read(key)).toBeNull();
  cache.write('tenant:real:123',draft,cache.epoch());expect(cache.read('tenant:real:123')).toBeNull();
});
it('opens the full test-session workspace outside the iframe',()=>{
  send({type:'sary-brain-preview',action:'navigate',destination:'testSession'});expect(w.location.hash).toBe('#/page/merchant/test-sari');
});
it('fits an embedded modal to the parent viewport and restores content height after close',()=>{
  frame.scrollIntoView=vi.fn();send({type:'sary-brain-preview',action:'resize',height:3400});
  send({type:'sary-brain-preview',action:'modal',open:true});expect(frame.dataset.modal).toBe('true');expect(parseInt(frame.style.height)).toBeLessThan(w.innerHeight);expect(frame.scrollIntoView).toHaveBeenCalledTimes(1);
  send({type:'sary-brain-preview',action:'resize',height:3600});expect(parseInt(frame.style.height)).toBeLessThan(w.innerHeight);
  send({type:'sary-brain-preview',action:'modal',open:'false'});expect(frame.dataset.modal).toBe('true');
  send({type:'sary-brain-preview',action:'modal',open:false});expect(frame.style.height).toBe('3600px');expect(frame.scrollIntoView).toHaveBeenCalledTimes(1);
});
it.each(['knowledge-groups','sales-knowledge','brain-preview','reply-quality','knowledge-activity','personas','assistant-options','assistant-settings'])('allows only same-origin embedding for the explicit %s preview',page=>{
  expect(previewPolicy('/'+page+'.html',new URLSearchParams('embed=brain'))).toContain("frame-ancestors 'self'");
  expect(previewPolicy('/'+page+'.html',new URLSearchParams())).toContain("frame-ancestors 'none'");
  const html=readFileSync('prototypes/tenant-dashboard/site/'+page+'.html','utf8');expect(html).toContain('brain-embed.js');expect(html).toContain('brain-embed.css');
});
it('routes the settings preview connection link into the central dashboard',()=>{
  frame.setAttribute('src','./assistant-settings.html?embed=brain');
  send({type:'sary-brain-preview',action:'navigate',destination:'whatsapp'});
  expect(w.location.hash).toBe('#/page/merchant/whatsapp');
});
it('routes persona settings from its owned frame into the central dashboard',()=>{
  frame.setAttribute('src','./personas.html?embed=brain');
  send({type:'sary-brain-preview',action:'navigate',destination:'assistantSettings'});
  expect(w.location.hash).toBe('#/page/merchant/bot-settings');
});
it('keeps simulated customer filters in the parent route and rejects arbitrary destinations',()=>{
  frame.setAttribute('src','./assistant-options.html?embed=brain&page=takeover');
  send({type:'sary-brain-preview',action:'conversation',phone:'ux-customer-062'});
  expect(w.location.hash).toBe('#/page/merchant/conversations?phone=ux-customer-062');
  for(const phone of ['actual-customer','ux-customer-063','ux-customer-051&token=secret','https://example.com',null])send({type:'sary-brain-preview',action:'conversation',phone});
  expect(w.location.hash).toBe('#/page/merchant/conversations?phone=ux-customer-062');
  frame.setAttribute('src','./personas.html?embed=brain');send({type:'sary-brain-preview',action:'conversation',phone:'ux-customer-051'});
  expect(w.location.hash).toBe('#/page/merchant/conversations?phone=ux-customer-062');
});
it.each(['/index.html','/','/elsewhere/knowledge-groups.html','/knowledge-removal.html'])('does not enable embedding or external connections for %s',path=>{
  const policy=previewPolicy(path,new URLSearchParams('embed=brain'));expect(policy).toContain("frame-ancestors 'none'");expect(policy).toContain("connect-src 'none'");expect(policy).toContain("object-src 'none'");
});
