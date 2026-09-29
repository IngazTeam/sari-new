import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyVirtualAgent, parseAgentKeywords, validateVirtualAgent, virtualAgentPayload } from '../shared/virtual-agent-form';

let dom: JSDOM, w: any, errors: Error[];
const base='prototypes/tenant-dashboard/site/';
beforeEach(()=>{
  errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  dom=new JSDOM(readFileSync(base+'index.html','utf8'),{url:'http://127.0.0.1:4329/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});w=dom.window;
  w.structuredClone=structuredClone;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  for(const name of ['features.js','page-catalog.js','brain.js','brain-workbench.js','assistant.js','notifications.js','pages.js','app.js'])runInContext(readFileSync(base+name,'utf8'),dom.getInternalVMContext());
});
afterEach(()=>{expect(errors).toEqual([]);dom.window.close();});
const route=(page:string)=>{w.history.replaceState(null,'',`#/page/merchant/${page}`);w.dispatchEvent(new w.HashChangeEvent('hashchange'));};
const click=(action:string,extra='')=>{const el=w.document.querySelector(`[data-as-action="${action}"]${extra}`);expect(el).toBeTruthy();el.click();};
const input=(name:string,value:string|boolean)=>{const el=w.document.getElementById(`as-${name}`)||w.document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);expect(el).toBeTruthy();if(el.type==='radio')el.checked=true;if(typeof value==='boolean')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const submit=(type:string)=>w.document.querySelector(`[data-as-form="${type}"]`).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const data=()=>JSON.parse(w.localStorage.getItem('sary-assistant-preview-v1'));
describe('assistant feature workflows',()=>{
  it('makes a routing sample an explicit design choice, retains dialogue and failures, then resets it',()=>{
    route('virtual-team');input('routing-message','لا أريد مبيعات');click('preview-routing');
    expect(w.document.getElementById('as-preview-sample').value).toBe('');
    click('preview-send');expect(w.document.getElementById('as-preview-result').textContent).toBe('');
    input('preview-sample','2');click('preview-send');expect(w.document.getElementById('as-preview-result').textContent).toContain('مثال ثابت');
    expect(w.document.getElementById('as-preview-question').value).toBe('');
    input('preview-question','<img src=x onerror=alert(1)>');click('preview-failure');
    expect(w.document.getElementById('as-preview-question').value).toContain('<img');
    expect(w.document.getElementById('dialog').textContent).toContain('لا أريد مبيعات');
    click('preview-send');expect(w.document.querySelector('#as-preview-result img')).toBeNull();
    expect(w.document.getElementById('dialog').textContent).toContain('الرسائل السابقة');
    click('preview-reset');expect(w.document.getElementById('as-preview-question').value).toBe('');
    expect(w.document.getElementById('as-preview-sample').value).toBe('');
    expect(w.document.getElementById('dialog').textContent).not.toContain('لا أريد مبيعات');
    expect(data()).toBeNull();
  });
  it('bounds the local dialogue and discloses omitted context without writing a session to storage',()=>{
    route('virtual-team');input('routing-message','افتتاح');click('preview-routing');input('preview-sample','2');click('preview-send');
    for(let i=0;i<11;i++){input('preview-question',`سؤال ${i}`);click('preview-send');}
    expect(w.document.getElementById('dialog').textContent).toContain('اقتُصر السياق');
    expect(w.document.getElementById('dialog').textContent).not.toContain('افتتاح');
    expect(data()).toBeNull();
  });
  it('reviews conflicting persona fields, merges untouched fields, and saves only after a separate confirmation',()=>{
    route('virtual-team');click('edit','[data-id="2"]');input('name','مسودتي');
    click('agent-external');submit('agent');expect(data().agents.find((a:any)=>a.id===2).name).toBe('اسم محفوظ من نافذة أخرى');
    click('agent-review');const form=w.document.querySelector('[data-as-form="agent-review"]');expect(form.reportValidity()).toBe(false);
    form.querySelector('input[name="name"][value="mine"]').checked=true;submit('agent-review');
    expect(w.document.getElementById('as-name').value).toBe('مسودتي');expect(w.document.getElementById('as-role').value).toBe('متابعة المبيعات');
    expect(data().agents.find((a:any)=>a.id===2).name).toBe('اسم محفوظ من نافذة أخرى');
    submit('agent');expect(data().agents.find((a:any)=>a.id===2)).toMatchObject({name:'مسودتي',role:'متابعة المبيعات'});
  });
  it('keeps the persona draft when another window deletes it and never recreates it',()=>{
    route('virtual-team');click('edit','[data-id="2"]');input('name','باقية');click('agent-external-delete');
    click('agent-review');expect(w.document.getElementById('dialog').textContent).toContain('لن نعيد إنشاءها');
    click('agent-review-back');expect(w.document.getElementById('as-name').value).toBe('باقية');submit('agent');
    expect(data().agents.some((a:any)=>a.id===2)).toBe(false);
  });
  it('preserves every legacy personality option in the settings draft and save',()=>{
    route('bot-settings');
    expect(w.document.getElementById('as-tone').options).toHaveLength(4);
    expect(w.document.getElementById('as-style').options).toHaveLength(4);
    expect(w.document.getElementById('as-emojiUsage').options).toHaveLength(4);
    input('tone','enthusiastic');input('style','formal_arabic');input('emojiUsage','none');input('brandVoice','brand');input('personalityInstructions','personality');
    click('section','[data-value="groups"]');input('customInstructions','operating');submit('settings');
    expect(data().settings).toMatchObject({tone:'enthusiastic',style:'formal_arabic',emojiUsage:'none',brandVoice:'brand',personalityInstructions:'personality',customInstructions:'operating'});
  });
  it('previews a specific persona, preserves a failed question, and labels the result as a static design example',()=>{
    route('virtual-team');click('preview-persona','[data-id="2"]');
    expect(w.document.getElementById('dialog').textContent).toContain('فهد · مسؤول مبيعات');
    input('preview-question','<img src=x onerror=alert(1)>');click('preview-failure');
    expect(w.document.querySelector('#as-preview-result [role="alert"]')).toBeTruthy();
    expect(w.document.getElementById('as-preview-question').value).toContain('<img');
    click('preview-send');expect(w.document.getElementById('as-preview-result').textContent).toContain('مثال ثابت');
    expect(w.document.querySelector('#as-preview-result img')).toBeNull();expect(data()).toBeNull();
  });
  it('does not claim a scheduled draft response when auto-reply or the schedule is disabled',()=>{
    route('bot-settings');input('autoReplyEnabled',false);click('section','[data-value="preview"]');
    expect(w.document.querySelector('.as-chat').textContent).toContain('الرد التلقائي متوقف');
    expect(w.document.querySelector('.as-chat').textContent).not.toContain('وصلتنا رسالتك');
    click('section','[data-value="basics"]');input('autoReplyEnabled',true);click('section','[data-value="preview"]');
    expect(w.document.querySelector('.as-chat').textContent).toContain('جدول العمل متوقف');
    click('preview-store');expect(w.document.getElementById('dialog').textContent).toContain('المعاينة المحفوظة فقط');
  });
  it('keeps all 12 avatars and five tones; validates required fields in both sections',()=>{
    route('virtual-team');w.document.querySelector('[data-page-action="primary"]').click();
    expect(w.document.querySelectorAll('[data-as-action="avatar"]')).toHaveLength(12);
    expect(w.document.querySelectorAll('[data-as-action="tone"]')).toHaveLength(5);
    submit('agent');expect(w.document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(3);
    input('name','ريم');input('role','مبيعات');input('personalityPrompt','ساعدي العميل من المصادر المعتمدة.');
    click('agent-tab','[data-value="routing"]');input('shiftStart','09:00');submit('agent');expect(w.document.getElementById('as-shiftStart').getAttribute('aria-invalid')).toBe('true');
    input('shiftEnd','17:00');submit('agent');expect(data().agents).toHaveLength(4);expect(data().agents.at(-1).shiftEnd).toBe('17:00');
  });
  it('retains unsaved fields across tabs, removes duplicates and clears persisted shifts',()=>{
    route('virtual-team');click('edit','[data-id="2"]');input('name','فهد المعدل');click('agent-tab','[data-value="routing"]');
    input('keyword','سعر');click('keyword');input('keyword','تجربة');click('keyword');input('shiftStart','09:00');input('shiftEnd','17:00');input('isDefault',true);submit('agent');
    expect(data().agents.filter((a:any)=>a.isDefault)).toHaveLength(1);expect(data().agents.find((a:any)=>a.id===2).name).toBe('فهد المعدل');
    expect(data().agents.find((a:any)=>a.id===2).triggerKeywords).toEqual(['سعر','شراء','عرض','تجربة']);
    click('edit','[data-id="2"]');click('agent-tab','[data-value="routing"]');click('clear-hours');input('isActive',false);submit('agent');
    expect(data().agents.find((a:any)=>a.id===2)).toMatchObject({shiftStart:'',shiftEnd:'',isActive:false});
  });
  it('does not delete on cancel and safely renders hostile persona text',()=>{
    route('virtual-team');click('delete','[data-id="1"]');click('close');expect(w.document.querySelectorAll('.as-persona')).toHaveLength(3);
    click('edit','[data-id="1"]');input('name','<img src=x onerror=alert(1)>');submit('agent');expect(w.document.querySelector('.as-team-grid img')).toBeNull();
    click('delete','[data-id="1"]');click('confirm-delete','[data-id="1"]');expect(data().agents).toHaveLength(2);
  });
  it('saves unchecked reply settings and preserves drafts across all five sections',()=>{
    route('bot-settings');input('autoReplyEnabled',false);input('language','fr');input('responseDelay','4');
    click('section','[data-value="groups"]');input('groupMode','keyword_only');input('groupKeywords','دورة، تسجيل');input('customInstructions','تعليمات اختبار');
    click('section','[data-value="schedule"]');input('welcomeMessage','أهلًا من المسودة');submit('settings');
    expect(data().settings).toMatchObject({autoReplyEnabled:false,language:'fr',responseDelay:4,groupMode:'keyword_only',groupKeywords:'دورة، تسجيل',customInstructions:'تعليمات اختبار',welcomeMessage:'أهلًا من المسودة'});
  });
  it('restores a draft after another settings page changes the saved language and reviews conflicting values',()=>{
    route('bot-settings');input('language','fr');click('section','[data-value="schedule"]');input('welcomeMessage','مسودتي');
    route('language-settings');input('language','en');submit('language');
    route('bot-settings');expect(w.document.body.textContent).toContain('لديك مسودة إعدادات');click('restore-reply');
    expect(w.document.getElementById('as-welcomeMessage').value).toBe('مسودتي');
    click('review-reply');const latest=w.document.querySelector('input[name="language"][value="latest"]');latest.checked=true;submit('reply-review');
    expect(data().settings.welcomeMessage).not.toBe('مسودتي');submit('settings');
    expect(data().settings).toMatchObject({welcomeMessage:'مسودتي',language:'en'});
  });
  it('matches the real schedule rules with inline errors, overnight shifts and an empty week',()=>{
    route('bot-settings');click('section','[data-value="schedule"]');input('workingHoursEnabled',true);
    input('workingHoursEnd','09:00');submit('settings');
    expect(w.document.getElementById('as-workingHoursEnd').getAttribute('aria-invalid')).toBe('true');
    expect(w.document.getElementById('as-workingHoursEnd-error').textContent).toContain('وقت نهاية يختلف');
    expect(data()).toBeNull();
    input('workingHoursStart','22:00');input('workingHoursEnd','02:00');
    for(const day of ['0','1','2','3','4'])click('day',`[data-value="${day}"]`);
    expect(w.document.body.textContent).toContain('لم تحدد أي يوم');
    submit('settings');
    expect(data().settings).toMatchObject({workingHoursStart:'22:00',workingHoursEnd:'02:00',workingDays:[]});
  });
  it('requires separate policy review and never saves sales authority through the general save',()=>{
    route('bot-settings');click('section','[data-value="sales"]');input('maxPercent','25');click('policy','[data-kind="discount"]');expect(data()).toBeNull();
    w.document.getElementById('as-review-discount').checked=true;input('maxPercent','20');expect(w.document.getElementById('as-review-discount').checked).toBe(false);
    click('section','[data-value="basics"]');submit('settings');expect(data().settings.maxPercent).toBe(10);
    click('section','[data-value="sales"]');w.document.getElementById('as-review-discount').checked=true;click('policy','[data-kind="discount"]');expect(data().settings.maxPercent).toBe(20);expect(data().history).toHaveLength(1);
  });
  it('exposes all group modes, templates and takeover controls with independent language saving',()=>{
    route('bot-settings');expect(w.document.querySelectorAll('[data-as-action="bot-template"]')).toHaveLength(9);
    click('section','[data-value="groups"]');expect(w.document.getElementById('as-groupMode').options).toHaveLength(4);
    input('groupMode','private_redirect');input('groupRedirectMessage','تابع في الخاص');submit('settings');
    route('human-takeover');input('takeoverTimeoutMinutes','90');expect(w.document.getElementById('as-takeoverResumeMessage')).toBeNull();input('takeoverCommandsEnabled',false);submit('takeover');
    route('language-settings');expect(w.document.querySelectorAll('input[type="radio"][name="language"]')).toHaveLength(7);input('language','both');expect(w.document.querySelectorAll('p[lang="ar"]')).toHaveLength(4);expect(w.document.querySelectorAll('[lang="en"]')).toHaveLength(4);submit('language');expect(data().settings).toMatchObject({language:'both',groupRedirectMessage:'تابع في الخاص',takeoverTimeoutMinutes:90,takeoverCommandsEnabled:false,takeoverResumeMessage:'مرحبًا! عدت لخدمتك.'});
  });
  it('reviews option conflicts, merges unedited fields, and requires a separate save',()=>{
    route('human-takeover');input('takeoverTimeoutMinutes','90');click('option-external');submit('takeover');expect(data().settings.takeoverTimeoutMinutes).toBe(60);
    click('option-review');const review=w.document.querySelector('[data-as-form="option-review"]');expect(review.reportValidity()).toBe(false);review.querySelector('input[value="mine"]').checked=true;submit('option-review');
    expect(w.document.getElementById('as-takeoverTimeoutMinutes').value).toBe('90');expect(w.document.getElementById('as-takeoverCommandsEnabled').checked).toBe(false);expect(data().settings.takeoverTimeoutMinutes).toBe(60);
    submit('takeover');expect(data().settings.takeoverTimeoutMinutes).toBe(90);
    route('language-settings');input('language','fr');click('option-failure');expect(w.document.querySelector('input[name="language"]:checked').value).toBe('fr');expect(data().settings.language).toBe('ar');submit('language');expect(data().settings.language).toBe('fr');
  });
  it('links brain, personas and all assistant tools from the hub',()=>{route('ai-hub');expect(w.document.querySelectorAll('.as-hub-card')).toHaveLength(13);for(const a of w.document.querySelectorAll('.as-hub-card'))expect(w.TenantPages.find(a.getAttribute('href').slice(6))).toBeTruthy();});
});
describe('production persona form contract',()=>{
  it('rejects whitespace, incomplete/equal shifts and oversized instructions; accepts overnight shifts',()=>{
    const draft={...emptyVirtualAgent,name:' ',role:'مبيعات',personalityPrompt:'تعليمات',shiftStart:'09:00'};
    expect(validateVirtualAgent(draft)).toMatchObject({name:'required',shiftStart:'schedule'});
    expect(validateVirtualAgent({...draft,name:'فهد',shiftStart:'22:00',shiftEnd:'06:00'})).toEqual({});
    expect(validateVirtualAgent({...draft,name:'فهد',shiftEnd:'09:00',personalityPrompt:'x'.repeat(2001)})).toMatchObject({shiftStart:'schedule',personalityPrompt:'tooLong'});
  });
  it('normalizes malformed keywords and explicitly retains an empty department in the payload',()=>{
    expect(parseAgentKeywords('{broken')).toEqual([]);expect(parseAgentKeywords('[" سعر ","سعر",3,null,""]')).toEqual(['سعر']);
    expect(virtualAgentPayload({...emptyVirtualAgent,name:' فهد ',role:' مبيعات ',personalityPrompt:' تعليمات '})).toMatchObject({name:'فهد',role:'مبيعات',department:'',personalityPrompt:'تعليمات'});
    const source=readFileSync('client/src/pages/merchant/VirtualTeamPage.tsx','utf8');expect(source).toContain('shiftStart: draft.shiftStart || null');expect(source).toContain('shiftEnd: draft.shiftEnd || null');
  });
});


it('shows only availability before the model and persists priority changes',()=>{
  route('virtual-team');input('routing-message','لا أريد مبيعات ولا دعم');expect(w.document.getElementById('as-routing-result').textContent).toContain('3');expect(w.document.getElementById('as-routing-result').textContent).not.toContain('فهد');
  click('move-up','[data-id="2"]');expect(data().agents.map((a:any)=>a.id)).toEqual([2,1,3]);
  click('edit','[data-id="2"]');click('agent-tab','[data-value="routing"]');input('shiftStart','22:00');input('shiftEnd','06:00');submit('agent');
  input('routing-time','12:00');expect(w.document.getElementById('as-routing-result').textContent).toContain('2');
  input('routing-time','23:00');expect(w.document.getElementById('as-routing-result').textContent).toContain('3');
});
