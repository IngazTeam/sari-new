import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it } from 'vitest';
let dom: JSDOM, w: any;
beforeEach(() => {
  dom=new JSDOM('<main></main><dialog id="dialog"></dialog>',{url:'http://localhost/',runScripts:'outside-only'});w=dom.window;
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.openDialog=(title:string,content:string)=>{const dialog=w.document.querySelector('dialog');dialog.innerHTML=`<h2>${title}</h2>${content}`;dialog.setAttribute('open','');};
  runInContext(readFileSync('prototypes/tenant-dashboard/site/subscription.js','utf8'),dom.getInternalVMContext());
  w.render=()=>{w.document.querySelector('main').innerHTML=w.SubscriptionPreview.render();};w.render();
});
afterEach(()=>dom.window.close());
const click=(name:string)=>w.document.querySelector(`[data-sb-action="${name}"]`).click();
const state=(id:string,value:string)=>{const el=w.document.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
it('covers all subscription aliases',()=>{for(const route of ['/merchant/subscription','/merchant/subscriptions','/merchant/my-subscription'])expect(w.SubscriptionPreview.handles({route})).toBe(true);});
it('keeps payment history independent from trial, no subscription, and failure',()=>{
  state('sb-state','trial');expect(w.document.querySelector('[aria-label="الرسائل الصوتية"]').textContent).toContain('17');
  expect(w.document.querySelector('[data-sb-action="cancel"]')).toBeNull();
  state('sb-state','error');expect(w.document.querySelector('[role="alert"]')).toBeTruthy();expect(w.document.querySelector('.sb-payments')).toBeTruthy();
  click('retry');state('sb-payments','error');expect(w.document.querySelector('.sb-usage')).toBeTruthy();expect(w.document.querySelector('.sb-payments')).toBeNull();
  click('retry-payments');expect(w.document.querySelector('.sb-payments')).toBeTruthy();
});
it('requires a separate confirmation and simulates cancellation without changing real data',()=>{
  click('cancel');expect(w.document.querySelector('dialog').textContent).toContain('فورًا');
  expect(w.document.querySelector('dialog [autofocus]')?.getAttribute('data-sb-action')).toBe('keep');
  click('keep');expect(w.document.querySelector('.sb-usage')).toBeTruthy();
  click('cancel');click('confirm');expect(w.document.querySelector('main').textContent).toContain('لم يتغير أي حساب حقيقي');
  expect(w.document.querySelector('.sb-payments')).toBeTruthy();
});
