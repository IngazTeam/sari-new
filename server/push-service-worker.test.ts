import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const source=readFileSync('client/public/sw.js','utf8');
let listeners:Record<string,Function>,worker:any,cache:any,log:any;
const origin='https://sary.live', home=origin+'/merchant/dashboard';
async function fire(name:string,data:any={}){
  const jobs:Promise<any>[]=[];listeners[name]({...data,waitUntil:(p:Promise<any>)=>jobs.push(p)});await Promise.all(jobs);
}
beforeEach(()=>{
  listeners={};cache={keys:vi.fn(),delete:vi.fn()};log={log:vi.fn(),error:vi.fn()};
  worker={location:{origin},skipWaiting:vi.fn(async()=>{}),addEventListener:(n:string,cb:Function)=>listeners[n]=cb,
    clients:{claim:vi.fn(async()=>{}),matchAll:vi.fn(async()=>[]),openWindow:vi.fn(async()=>{})},registration:{showNotification:vi.fn(async()=>{})}};
  vm.runInNewContext(source,{self:worker,URL,caches:cache,console:log});
});
const click=(url:any,action='')=>fire('notificationclick',{action,notification:{data:{url},close:vi.fn()}});
const push=(data:any)=>fire('push',{data:{json:()=>data}});
describe('Browser worker boundary and PWA entry point',()=>{
  it('keeps install/activation alive without deleting any cache',async()=>{
    await fire('install');await fire('activate');expect(worker.skipWaiting).toHaveBeenCalledOnce();expect(worker.clients.claim).toHaveBeenCalledOnce();expect(cache.keys).not.toHaveBeenCalled();expect(cache.delete).not.toHaveBeenCalled();
  });
  it.each(['//evil.test/x','https://evil.test/x','javascript:alert(1)','data:text/html,x','https://sary.live@evil.test/','https://u:p@sary.live/merchant/orders','/api/trpc/delete','/merchant/../api/trpc','/merchant/%2e%2e/api','/merchant/orders#x','/merchant\\evil','/merchant/encoded%2fpath',null,{},'x'.repeat(501)])('blocks untrusted click navigation %s',async value=>{
    await click(value);expect(worker.clients.openWindow).toHaveBeenCalledWith(home);
  });
  it.each(['/merchant/orders?status=pending','https://sary.live/merchant/conversations','/merchant/knowledge-base'])('accepts safe tenant destination %s',async url=>{
    await click(url);expect(worker.clients.openWindow).toHaveBeenCalledWith(new URL(url,origin).href);
  });
  it('focuses an exact open window using a resolved absolute URL',async()=>{
    const focus=vi.fn(async()=>{});worker.clients.matchAll.mockResolvedValue([{url:origin+'/merchant/orders',focus}]);
    await click('/merchant/orders');expect(focus).toHaveBeenCalledOnce();expect(worker.clients.openWindow).not.toHaveBeenCalled();
  });
  it('can open a destination if an existing window cannot be focused',async()=>{
    worker.clients.matchAll.mockResolvedValue([{url:home,focus:async()=>{throw Error('closed');}}]);await click('/merchant/dashboard');expect(worker.clients.openWindow).toHaveBeenCalledOnce();
  });
  it.each(['close','unknown'])('does not navigate on the %s action',async action=>{
    await click('/merchant/orders',action);expect(worker.clients.matchAll).not.toHaveBeenCalled();expect(worker.clients.openWindow).not.toHaveBeenCalled();
  });
  it('projects bounded text and fixed local assets instead of payload options',async()=>{
    await push({title:'x'.repeat(500),body:'y'.repeat(5000),icon:'https://evil.test/i',badge:'https://evil.test/b',url:'https://evil.test/',actions:[{action:'steal',title:'Bad'}],requireInteraction:'true',tag:{secret:1}});
    const [title,options]=worker.registration.showNotification.mock.calls[0];expect(title).toHaveLength(150);expect(options.body).toHaveLength(1000);expect(options).toMatchObject({icon:'/favicon.png',badge:'/favicon.png',tag:'sari-notification',requireInteraction:false,data:{url:home}});
    expect(options.actions.map((a:any)=>a.action)).toEqual(['open','close']);expect(JSON.stringify(options)).not.toMatch(/evil|steal|secret/);
    expect(log.log).not.toHaveBeenCalled();expect(log.error).not.toHaveBeenCalled();
  });
  it.each([null,[],false,{},'text'])('shows a safe fallback for malformed structured payload %s',async data=>{
    await push(data);expect(worker.registration.showNotification).toHaveBeenCalledWith('ساري | Sary',expect.objectContaining({body:'لديك إشعار جديد'}));
  });
  it('preserves bounded plain text notifications when JSON is absent',async()=>{
    await fire('push',{data:{json:()=>{throw Error();},text:()=>'<p>Plain text</p>'}});expect(worker.registration.showNotification.mock.calls[0][1].body).toBe('<p>Plain text</p>');
  });
  it('supports English notification language without guessing the browser',async()=>{
    await push({lang:'en'});expect(worker.registration.showNotification.mock.calls[0][1]).toMatchObject({lang:'en',dir:'ltr',body:'You have a new notification'});
  });
  it.each(['https://evil.test/merchant/','https://sary.live/public','invalid'])('ignores worker control from %s',async url=>{
    await fire('message',{source:{url},data:{type:'SKIP_WAITING'}});expect(worker.skipWaiting).not.toHaveBeenCalled();
  });
  it('accepts worker activation messages from a tenant client',async()=>{
    await fire('message',{source:{url:home},data:{type:'SKIP_WAITING'}});expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
  it('links a standalone tenant manifest with existing local icon assets',()=>{
    const manifest=JSON.parse(readFileSync('client/public/merchant.webmanifest','utf8'));
    expect(manifest).toMatchObject({start_url:'/merchant/dashboard',scope:'/merchant/',display:'standalone'});
    expect(readFileSync('client/index.html','utf8')).toContain('href="/merchant.webmanifest"');
    for(const icon of manifest.icons)expect(existsSync('client/public'+icon.src)).toBe(true);
  });
});
