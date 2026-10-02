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
it('syncs booking detail and complete filters only from the owned preview frame',()=>{
 frame.setAttribute('src','./service-workspace.html?embed=brain');w.history.replaceState(null,'','#/page/merchant/bookings');w.syncServicePreviewContext=vi.fn();
 const message={type:'sary-brain-preview',action:'serviceState',search:'path=/merchant/bookings&booking=7&status=pending&payment=unpaid&from=2026-10-02&to=2026-10-20&service=1&staff=2&page=2&tenant=270&lang=en'};
 for(const search of ['path=/merchant/bookings/7','path=/merchant/bookings&booking=0','path=/merchant/bookings&from=2026-02-30','path=/merchant/bookings&payment=settled','path=/merchant/bookings&service=2147483648','path=/merchant/bookings&booking=1&booking=2'])send({...message,search});
 send(message,'https://evil.test');send(message,undefined,w);expect(w.location.hash).toBe('#/page/merchant/bookings');send(message);expect(w.location.hash).toContain('/merchant/bookings?booking=7&status=pending&payment=unpaid');expect(w.syncServicePreviewContext).toHaveBeenCalledOnce();expect(frame.isConnected).toBe(true);
});
it('syncs provider editing in the same service frame without allowing extra paths or scopes',()=>{
 frame.setAttribute('src','./service-workspace.html?embed=brain');w.history.replaceState(null,'','#/page/merchant/staff');w.syncServicePreviewContext=vi.fn();
 const message={type:'sary-brain-preview',action:'serviceState',search:'path=/merchant/staff&edit=31&q=provider&tenant=270&lang=en'};
 send({...message,search:'path=/merchant/staff/31&edit=31'});send(message,'https://evil.test');send(message,undefined,w);expect(w.location.hash).toBe('#/page/merchant/staff');send(message);expect(w.location.hash).toBe('#/page/merchant/staff?edit=31&q=provider&tenant=270&lang=en');expect(w.syncServicePreviewContext).toHaveBeenCalledOnce();expect(frame.isConnected).toBe(true);
});
it('syncs service routes and editor queries only from the owned service frame',()=>{
 frame.setAttribute('src','./service-workspace.html?embed=brain');w.history.replaceState(null,'','#/page/merchant/services');w.syncServicePreviewContext=vi.fn();
 const message={type:'sary-brain-preview',action:'serviceState',search:'path=/merchant/service-packages&edit=new&q=sample&tenant=270&lang=en'};
 for(const search of ['path=/merchant/services/2147483648','path=/merchant/settings','edit=0','edit=2147483648','status=draft','tenant=258','page=1000001','q=a&q=b','token=secret','path=https://evil.test','path=/merchant/services/1/report'])send({...message,search});
 send(message,'https://evil.test');send(message,undefined,w);expect(w.location.hash).toBe('#/page/merchant/services');send(message);expect(w.location.hash).toBe('#/page/merchant/service-packages?edit=new&q=sample&tenant=270&lang=en');expect(w.syncServicePreviewContext).toHaveBeenCalledOnce();expect(frame.isConnected).toBe(true);
 frame.setAttribute('src','./campaign-workspace.html?embed=brain');send({...message,search:'path=/merchant/services/new'});expect(w.location.hash).toContain('service-packages');
 expect(previewPolicy('/service-workspace.html',new URLSearchParams('embed=brain'))).toContain("frame-ancestors 'self'");expect(previewPolicy('/service-workspace.html',new URLSearchParams())).toContain("frame-ancestors 'none'");expect(previewPolicy('/service-workspace.html',new URLSearchParams())).toContain("connect-src 'none'");
});
it('restricts service external tools to bookings and recovery destinations',()=>{frame.setAttribute('src','./service-workspace.html?embed=brain');const message={type:'sary-brain-preview',action:'serviceTool',route:'/merchant/bookings'};send(message,'https://evil.test');send(message,undefined,w);send({...message,route:'/merchant/settings'});expect(w.location.hash).toBe('');send(message);expect(w.location.hash).toBe('#/page/merchant/bookings');});
it('syncs campaign pages and filters only from the owned frame without replacing its local model',()=>{
  frame.setAttribute('src','./campaign-workspace.html?embed=brain');w.history.replaceState(null,'','#/page/merchant/campaigns');
  const message={type:'sary-brain-preview',action:'campaignState',search:'path=%2Fmerchant%2Fcampaigns%2F3%2Freport&view=results&page=2&tenant=259&lang=en'};
  for(const search of ['path=https://example.com','path=/merchant/settings','tenant=999','token=secret','page=1000001','q=a&q=b','view=bad','q='+ 'x'.repeat(201)])send({...message,search});
  send(message,'https://example.com');send(message,undefined,w);expect(w.location.hash).toBe('#/page/merchant/campaigns');send(message);expect(w.location.hash).toBe('#/page/merchant/campaigns/3/report?view=results&page=2&tenant=259&lang=en');expect(frame.isConnected).toBe(true);
  frame.setAttribute('src','./dashboard.html?embed=brain');send({...message,search:'path=/merchant/campaigns/new'});expect(w.location.hash).toContain('/3/report');
  const policy=previewPolicy('/campaign-workspace.html',new URLSearchParams('embed=brain'));expect(policy).toContain("frame-ancestors 'self'");expect(policy).toContain("connect-src 'none'");expect(previewPolicy('/campaign-workspace.html',new URLSearchParams())).toContain("frame-ancestors 'none'");
});
it('allows campaign recovery tools only from the owned frame and fixed destinations',()=>{
  frame.setAttribute('src','./campaign-workspace.html?embed=brain');const message={type:'sary-brain-preview',action:'campaignTool',route:'/merchant/tools'};
  send(message,'https://example.com');send(message,undefined,w);send({...message,route:'/merchant/settings'});expect(w.location.hash).toBe('');send(message);expect(w.location.hash).toBe('#/page/merchant/tools');
});
it('allows the actual inbox frame and local audio previews while continuing to block connections and foreign frames',()=>{
  const policy=previewPolicy('/inbox.html',new URLSearchParams('embed=brain'));
  expect(policy).toContain("frame-ancestors 'self'");expect(policy).toContain("media-src 'self' blob:");expect(policy).toContain("connect-src 'none'");
  expect(previewPolicy('/inbox.html',new URLSearchParams())).toContain("frame-ancestors 'none'");
  expect(previewPolicy('/unknown.html',new URLSearchParams('embed=brain'))).not.toContain('blob:');
});
it('syncs only an owned inbox query without replacing its live frame or accepting unrelated parameters',()=>{
  frame.setAttribute('src','./inbox.html?embed=brain');w.history.replaceState(null,'','#/page/merchant/conversations');
  const msg={type:'sary-brain-preview',action:'inboxState',search:'lang=en&tenant=235&conversationId=51&history=51016&phone=ux-customer-051'};
  for(const query of ['token=secret','tenant=999','phone=x&phone=y','conversationId=9007199254740992','page=100001','phone='+ 'x'.repeat(201)])send({...msg,search:query});
  send(msg,'https://example.com');send(msg,undefined,w);expect(w.location.hash).toBe('#/page/merchant/conversations');
  send(msg);expect(w.location.hash).toBe('#/page/merchant/conversations?'+msg.search);expect(frame.isConnected).toBe(true);
  frame.setAttribute('src','./dashboard.html?embed=brain');send({...msg,search:'tenant=236'});expect(w.location.hash).toContain('tenant=235');
});
it('allows inbox recovery navigation only from its owned frame and a fixed destination',()=>{
  frame.setAttribute('src','./inbox.html?embed=brain');const msg={type:'sary-brain-preview',action:'inboxTool',route:'/merchant/whatsapp-instances'};
  send(msg,'https://example.com');send(msg,undefined,w);send({...msg,route:'/merchant/settings'});send({...msg,route:'/merchant/whatsapp-instances?token=x'});expect(w.location.hash).toBe('');
  send(msg);expect(w.location.hash).toBe('#/page/merchant/whatsapp-instances');
});
it('waits for the document body before attaching embedded layout observers',()=>{
  const child=new JSDOM('<html><head></head><body></body></html>',{url:'http://127.0.0.1:4329/messages-analytics.html?embed=brain',runScripts:'outside-only',pretendToBeVisual:true});
  Object.defineProperty(child.window,'parent',{value:{postMessage:vi.fn()}});child.window.document.body.remove();
  expect(()=>runInContext(readFileSync('prototypes/tenant-dashboard/site/brain-embed.js','utf8'),child.getInternalVMContext())).not.toThrow();
  const body=child.window.document.createElement('body');body.innerHTML='<main>Preview</main>';child.window.document.documentElement.append(body);
  child.window.document.dispatchEvent(new child.window.Event('DOMContentLoaded'));child.window.close();
});
it('opens message recovery tools outside the owned frame and rejects forged routes',()=>{
  frame.setAttribute('src','./messages-analytics.html?embed=brain');
  const message={type:'sary-brain-preview',action:'messagesTool',route:'/merchant/tools'};
  send(message,'https://example.com');send(message,undefined,w);send({...message,route:'/merchant/settings'});expect(w.location.hash).toBe('');
  send(message);expect(w.location.hash).toBe('#/page/merchant/tools');
  frame.setAttribute('src','./dashboard.html?embed=brain');send({...message,route:'/merchant/dashboard'});expect(w.location.hash).toBe('#/page/merchant/tools');
});
it.each(['/merchant/reports','/merchant/products','/merchant/campaigns','/merchant/customers','/merchant/sari-brain?view=sales','/merchant/analytics-hub'])('routes sales destination %s only from its owned local frame',route=>{
  frame.setAttribute('src','./sales-analytics.html?embed=brain&lang=en');
  send({type:'sary-brain-preview',action:'salesTool',route});
  expect(w.location.hash).toBe('#/page'+route);
});
it('rejects forged sales navigation and unrelated frame messages',()=>{
  frame.setAttribute('src','./sales-analytics.html?embed=brain');
  const message={type:'sary-brain-preview',action:'salesTool',route:'/merchant/reports'};
  send(message,'https://example.com');send(message,undefined,w);
  for(const route of ['/merchant/settings','/merchant/reports?token=secret','https://example.com','javascript:alert(1)',null])send({...message,route});
  for(const src of ['./dashboard.html?embed=brain','./sales-analytics.html']){frame.setAttribute('src',src);send(message);}
  expect(w.location.hash).toBe('');
});
it('intercepts sales links before navigating inside the frame',()=>{
  const child=new JSDOM('<main><a href="./#/page/merchant/customers">Customers</a></main>',{url:'http://127.0.0.1:4329/sales-analytics.html?embed=brain',runScripts:'outside-only',pretendToBeVisual:true});
  const postMessage=vi.fn();Object.defineProperty(child.window,'parent',{value:{postMessage}});
  runInContext(readFileSync('prototypes/tenant-dashboard/site/brain-embed.js','utf8'),child.getInternalVMContext());
  const click=new child.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});child.window.document.querySelector('a')!.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);expect(postMessage).toHaveBeenCalledWith({type:'sary-brain-preview',action:'salesTool',route:'/merchant/customers'},'http://127.0.0.1:4329');child.window.close();
});
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
it.each(['knowledge-groups','sales-knowledge','brain-preview','reply-quality','knowledge-activity','personas','assistant-options','assistant-settings','dashboard'])('allows only same-origin embedding for the explicit %s preview',page=>{
  expect(previewPolicy('/'+page+'.html',new URLSearchParams('embed=brain'))).toContain("frame-ancestors 'self'");
  expect(previewPolicy('/'+page+'.html',new URLSearchParams())).toContain("frame-ancestors 'none'");
  const html=readFileSync('prototypes/tenant-dashboard/site/'+page+'.html','utf8');expect(html).toContain('brain-embed.js');expect(html).toContain('brain-embed.css');
});
it('routes only displayed dashboard destinations from its owned same-origin frame',()=>{
  frame.setAttribute('src','./dashboard.html?embed=brain');
  for(const route of ['/merchant/sari-brain?view=knowledge&pane=conflicts','/merchant/subscription/compare','/merchant/conversations?phone=ux-customer-051']){
    send({type:'sary-brain-preview',action:'dashboardTool',route});expect(w.location.hash).toBe('#/page'+route);
  }
  const previous=w.location.hash,message={type:'sary-brain-preview',action:'dashboardTool',route:'/merchant/products'};
  send(message,'https://example.com');send(message,undefined,w);
  for(const route of ['/merchant/unknown','/merchant/products?token=secret','https://example.com','javascript:alert(1)','__proto__'])send({...message,route});
  frame.setAttribute('src','./assistant-settings.html?embed=brain');send(message);expect(w.location.hash).toBe(previous);
});
it('intercepts dashboard child links before they navigate inside the frame',()=>{
  const child=new JSDOM('<main><a href="./#/page/merchant/sari-brain?view=knowledge&pane=conflicts">Gaps</a></main>',{url:'http://127.0.0.1:4329/dashboard.html?embed=brain',runScripts:'outside-only',pretendToBeVisual:true});
  const postMessage=vi.fn();Object.defineProperty(child.window,'parent',{value:{postMessage}});
  runInContext(readFileSync('prototypes/tenant-dashboard/site/brain-embed.js','utf8'),child.getInternalVMContext());
  const click=new child.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});child.window.document.querySelector('a')!.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);expect(postMessage).toHaveBeenCalledWith({type:'sary-brain-preview',action:'dashboardTool',route:'/merchant/sari-brain?view=knowledge&pane=conflicts'},'http://127.0.0.1:4329');child.window.close();
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
