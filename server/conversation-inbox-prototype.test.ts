import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';
import { TextEncoder, TextDecoder } from 'node:util';
import { JSDOM, VirtualConsole } from 'jsdom';
import { it, expect, afterEach, vi, describe } from 'vitest';
import { InboxPreviewModel, inboxModes, inboxQueries, inboxMutations } from '../prototypes/tenant-dashboard/src/inbox-preview-model';
import { conversationNavigation } from '../client/src/lib/conversation-navigation';
import { handoffSnapshot, handoffSourceSnapshot } from '../shared/conversation-handoff';
import { escalationReviewSnapshot } from '../shared/escalation-review';
import { salesOfferReviewSnapshot } from '../shared/sales-offer-review';
import { staffAttemptSnapshot } from '../shared/staff-attempt-review';
import { staffTeamSnapshot } from '../shared/staff-team-review';
import { generatedSuggestions } from '../shared/reply-suggestions';
import { silentWav, voiceRecording } from '../prototypes/tenant-dashboard/src/inbox-preview-voice';
import en from '../client/src/locales/en.json';
import { voiceRecording as browserRecording } from '../client/src/lib/voice-recording';
const base='prototypes/tenant-dashboard/site/';
describe('local inbox fixture contracts',()=>{
  it('maps every current conversation read and mutation instead of dropping internal features',()=>{
    const route=JSON.parse(readFileSync('docs/audits/tenant-features-2026-09-30/coverage.json','utf8')).routes.find((r:any)=>r.route==='/merchant/conversations');
    expect([...inboxQueries].sort()).toEqual([...route.queries].sort());expect([...inboxMutations].sort()).toEqual([...route.mutations].sort());
  });
  it.each(inboxModes)('keeps %s fixtures local and bound to their simulated account',mode=>{
    for(const id of [235,236]){const m=new InboxPreviewModel(id,mode);expect(m.read('auth.me').data?.id??null).toBe(mode==='session'?null:id+1000);const list=m.read('conversations.list',{page:1,pageSize:50});expect(list).toHaveProperty('isFetchedAfterMount');expect(m.operations).toBe(0);expect(m.retries).toBe(0);}
  });
  it.each([235,236])('paginates all lists, messages and reviews with strict scope %s',merchant=>{
    const m=new InboxPreviewModel(merchant),input={conversationId:51,kind:'text'};
    expect(m.read('conversations.list',{page:2,pageSize:50}).data.items).toHaveLength(15);
    const first=m.read('conversations.messageHistory',input).data;const older=m.read('conversations.messageHistory',{...input,beforeId:first.nextBeforeId}).data;
    expect(first.items).toHaveLength(50);expect(older.items).toHaveLength(15);expect(new Set([...first.items,...older.items].map((r:any)=>r.id)).size).toBe(65);
    for(const [name,schema,cursor,size] of [['handoffSnapshot',handoffSnapshot,null,0],['escalationReviewSnapshot',escalationReviewSnapshot,'beforeId',2],['salesOfferReviewSnapshot',salesOfferReviewSnapshot,'beforeSourceId',2],['staffAttemptSnapshot',staffAttemptSnapshot,'beforeId',5]] as const){
      const one=m.read('conversations.'+name,input).data;expect(schema.safeParse(one).success).toBe(true);expect(one).toMatchObject({merchantId:merchant,actorUserId:merchant+1000});
      if(cursor){const two=m.read('conversations.'+name,{...input,[cursor]:one.page.nextCursor}).data;expect(schema.safeParse(two).success).toBe(true);expect(two.page.items).toHaveLength(size);}
    }
    const team=m.read('conversations.staffTeamSnapshot',{kind:'voice',mode:'attempts'}).data;expect(staffTeamSnapshot.safeParse(team).success).toBe(true);expect(team.page.items).toHaveLength(20);
    expect(m.read('conversations.staffTeamSnapshot',{kind:'voice',mode:'attempts',beforeId:team.page.nextCursor}).data.page.items).toHaveLength(5);
    expect(handoffSourceSnapshot.safeParse(m.read('conversations.handoffSourceSnapshot',{conversationId:51,messageId:51011}).data).success).toBe(true);
  });
  it('searches and combines filters and preserves stable cached snapshot identity',()=>{
    const m=new InboxPreviewModel(235),input={page:1,search:'ux-customer-051',stage:'ready',needsHuman:true};const one=m.read('conversations.list',input);expect(one).toBe(m.read('conversations.list',input));expect(one.data.items.map((r:any)=>r.id)).toEqual([51]);
    expect(m.read('conversations.list',{...input,stage:'paid'}).data.items).toEqual([]);
  });
  it('deduplicates local text/voice operations and isolates tenants with the same conversation id',async()=>{
    const a=new InboxPreviewModel(235),b=new InboxPreviewModel(236),input={conversationId:51,message:'Only A',requestId:'local-request'};
    for(const name of ['conversations.sendReply','conversations.sendVoiceReply']){await a.mutate(name,input);await a.mutate(name,input);}await a.invalidate();
    expect(a.read('conversations.messageHistory',{conversationId:51}).data.items.at(-2).content).toBe('Only A');expect(a.read('conversations.messageHistory',{conversationId:51}).data.items.at(-1).messageType).toBe('voice');expect(b.read('conversations.messageHistory',{conversationId:51}).data.items.at(-1).id).toBe(51065);
  });
  it('keeps pending and uncertain replies distinct from successful local appends',async()=>{
    const pending=new InboxPreviewModel(235,'pending-send'),input={conversationId:51,message:'Delayed',requestId:'pending'};const promise=pending.mutate('conversations.sendReply',input);expect(pending.pending).toBe(1);expect(pending.read('conversations.messageHistory',{conversationId:51}).data.items.at(-1).id).toBe(51065);pending.finishPending();expect(await promise).toMatchObject({success:true});
    const uncertain=new InboxPreviewModel(235,'uncertain-send');expect(await uncertain.mutate('conversations.sendReply',input)).toMatchObject({success:false,status:'pending'});expect(uncertain.read('conversations.messageHistory',{conversationId:51}).data.items.at(-1).id).toBe(51065);
  });
  it('supports local handoff, source evidence, reviewed relays, offers and team audit',async()=>{
    const m=new InboxPreviewModel(235);await m.mutate('conversations.setOwnership',{conversationId:51,expectedVersion:0,expectedLastMessageId:51065,action:'takeover'});await m.invalidate();expect(m.read('conversations.handoffSnapshot',{conversationId:51}).data.summary.humanOwned).toBe(true);
    const relay=m.read('conversations.escalationReviewSnapshot',{conversationId:51}).data.page.items[0];await m.mutate('conversations.reviewEscalationRelay',{conversationId:51,relayId:relay.id,expectedRevision:relay.revision,evidence:relay.evidence,note:'Reviewed locally'});
    const offer=m.read('conversations.salesOfferReviewSnapshot',{conversationId:51}).data.page.items[0];await m.mutate('conversations.reviewSalesOffer',{conversationId:51,attemptId:offer.id,expectedRevision:offer.revision,evidence:offer.evidence,note:'Reviewed offer'});await m.invalidate();
    expect(m.read('conversations.escalationReviewSnapshot',{conversationId:51}).data.page.items[0].lastReview.note).toBe('Reviewed locally');expect(m.read('conversations.salesOfferReviewSnapshot',{conversationId:51}).data.page.items[0].projected).toBe(true);
    const teamInput={conversationId:52,sourceId:225,authorUserId:1236,kind:'text',requestId:'test-review',reason:'delivery_check'};const first=await m.mutate('conversations.checkTeamStaffAttempt',teamInput);expect(await m.mutate('conversations.checkTeamStaffAttempt',teamInput)).toEqual(first);await m.invalidate();const audit=m.read('conversations.staffTeamSnapshot',{kind:'text',mode:'history'}).data;expect(staffTeamSnapshot.safeParse(audit).success).toBe(true);expect(audit.page.items).toHaveLength(1);
    expect(generatedSuggestions.safeParse(await m.mutate('aiSuggestions.generateSuggestions',{conversationId:51})).success).toBe(true);
  });
  it('generates valid silent WAV bytes and never uses browser capture',async()=>{
    const bytes=silentWav();expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('RIFF');expect(new DataView(bytes.buffer).getUint32(40,true)).toBe(16000);const stream=await voiceRecording.capture();const recorder=voiceRecording.create();let size=0;recorder.ondataavailable=(e:any)=>{size=e.data.size;};recorder.start();expect(recorder.state).toBe('recording');recorder.stop();expect(size).toBe(16044);expect(stream.getTracks()).toHaveLength(1);
  });
});
let dom:JSDOM|undefined,w:any,errors:unknown[]=[];
afterEach(()=>{dom?.window.close();dom=undefined;vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(search='lang=en&conversationId=51'){
  errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));dom=new JSDOM(readFileSync(base+'inbox.html','utf8'),{url:'http://127.0.0.1:4329/inbox.html?'+search,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});w=dom.window;
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.MessageChannel=class extends MessageChannel{constructor(){super();this.port1.unref();this.port2.unref();}};
  Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});w.crypto.randomUUID=()=>webcrypto.randomUUID();
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.URL.createObjectURL=()=> 'blob:local-sample';w.URL.revokeObjectURL=()=>{};
  w.fetch=()=>{throw Error('Forbidden network request');};w.XMLHttpRequest=class{constructor(){throw Error('Forbidden XHR');}};Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>{throw Error('Real microphone must not open');}}});
  runInContext(readFileSync(base+'inbox-preview.js','utf8'),dom.getInternalVMContext());await vi.waitFor(()=>expect(w.document.querySelector('aside')).toBeTruthy());
}
const text=()=>w.document.body.textContent;
const el=(selector:string)=>w.document.querySelector(selector);
async function click(selector:string){expect(el(selector)).toBeTruthy();el(selector).click();await new Promise(resolve=>setTimeout(resolve,30));}
async function change(selector:string,value:string){const target=el(selector);Object.getOwnPropertyDescriptor(target.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:target.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype,'value')!.set!.call(target,value);target.dispatchEvent(new w.Event(target.tagName==='SELECT'?'change':'input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,40));}
async function tab(index:number){w.document.querySelectorAll('[role=tab]')[index].dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,30));}
describe('actual bundled conversation screen',()=>{
  it('shows an unavailable conversation for a non-fixture link instead of crashing or leaking another scope',async()=>{
    await mount('lang=en&conversationId=999');expect(el('[data-staff-draft]')).toBeNull();expect(text()).toContain(en.conversationNavigation.unavailable);expect(errors).toEqual([]);
  });
  it('retains native browser capture constraints and MIME selection through the production adapter',async()=>{
    const stream={getTracks:()=>[]},capture=vi.fn().mockResolvedValue(stream),construct=vi.fn(),supports=vi.fn(type=>type==='audio/mp4');
    vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:capture}});vi.stubGlobal('MediaRecorder',class{static isTypeSupported=supports;constructor(...args:unknown[]){construct(...args);}});
    expect(await browserRecording.capture()).toBe(stream);expect(capture).toHaveBeenCalledWith({audio:{echoCancellation:true,noiseSuppression:true}});
    expect(browserRecording.supports('audio/mp4')).toBe(true);browserRecording.create(stream as MediaStream,'audio/mp4');expect(construct).toHaveBeenCalledWith(stream,{mimeType:'audio/mp4'});
  });
  it('completes handoff, source inspection, relay, offer and personal review through real controls',async()=>{
    await mount();await click('[data-conversation-tools]');await click('[data-handoff-save]');await vi.waitFor(()=>expect(el('[data-handoff-owner]').dataset.handoffOwner).toBe('human'));
    await click('a[href="#conversation-message-51011"]');expect(el('[data-handoff-source="51011"]')).toBeTruthy();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,50));
    await click('[data-handoff-reviewed]');await click('[data-handoff-save]');await vi.waitFor(()=>expect(el('[data-handoff-owner]').dataset.handoffOwner).toBe('bot'));
    await tab(1);await change('[data-relay-note]','Checked locally');await click('[data-relay-reviewed]');await click('[data-relay-save]');await vi.waitFor(()=>expect(el('[data-relay-review]').textContent).toContain('Checked locally'));await click('[data-relay-older]');expect(w.document.querySelectorAll('[data-relay-id]')).toHaveLength(2);
    await tab(2);await change('[data-offer-note]','Checked offer locally');await click('[data-offer-reviewed]');await click('[data-offer-save]');await vi.waitFor(()=>expect(el('[data-offer-last-review]').textContent).toContain('Checked offer locally'));await click('[data-offer-older]');expect(w.document.querySelectorAll('[data-offer-id]')).toHaveLength(2);
    await tab(3);await click('[data-attempt-check]');await vi.waitFor(()=>expect(el('[data-staff-attempt]').dataset.attemptState).toBe('accepted'));await click('[data-attempt-kind="voice"]');expect(el('[data-staff-attempt]').dataset.attemptState).toBe('pending');expect(errors).toEqual([]);
  });
  it('reviews another staff member with a reason and exposes the resulting local audit',async()=>{
    await mount();await click('[data-team-compact]');expect(el('[data-team-check]').disabled).toBe(true);await change('[data-team-reason]','delivery_check');await click('[data-team-check]');await vi.waitFor(()=>expect(el('[data-team-attempt]').dataset.teamState).toBe('accepted'));
    await click('[data-team-mode="history"]');expect(w.document.querySelectorAll('[data-team-audit]')).toHaveLength(1);await click('[data-team-mode="attempts"]');await click('[data-team-older]');expect(w.document.querySelectorAll('[data-team-attempt]')).toHaveLength(5);expect(errors).toEqual([]);
  });
  it('makes repair and partial import independent actions and retains the partial warning',async()=>{
    await mount('lang=en&conversationId=51&scenario=partial-import');await click('[data-connection-open]');await click('[data-connection-repair]');await vi.waitFor(()=>expect(el('[data-connection-notice]').dataset.connectionNotice).toBe('fixed'));
    await click('[data-connection-import]');await vi.waitFor(()=>expect(el('[data-connection-notice]').dataset.connectionNotice).toBe('partial'));expect(errors).toEqual([]);
  });
  it('generates suggestions only on request and lets the user append then replace the draft',async()=>{
    await mount();await change('[data-staff-draft]','My draft');const toggle=Array.from(w.document.querySelectorAll('button')).find((b:any)=>b.textContent===en.aISuggestions.auto_0) as any;expect(toggle).toBeTruthy();toggle.click();await new Promise(r=>setTimeout(r,30));expect(el('[data-ai-select]')).toBeNull();await click('[data-ai-generate]');await click('[data-ai-select="1"]');await click('[data-ai-append]');expect(el('[data-staff-draft]').value).toBe('My draft\n\nHappy to help. Which details would you like?');await click('[data-ai-select="3"]');await click('[data-ai-replace]');expect(el('[data-staff-draft]').value).toBe('Which product do you mean?');expect(errors).toEqual([]);
  });
  it.each(inboxModes)('renders %s without unexpected runtime errors or missing translation keys',async mode=>{
    await mount('lang=en&conversationId=51&scenario='+mode);await vi.waitFor(()=>expect(text()).toContain('Actual conversation preview'));
    expect(text()).not.toMatch(/merchantUx\.|conversationsPage\.|staffVoice\.|conversationHistory\.|conversationInbox\./);expect(errors).toEqual([]);
    if(['list-error','stale-error','foreign','forbidden','session'].includes(mode))expect(el('[data-staff-draft]')).toBeNull();
    if(mode==='history-error')expect(el('article[data-message-sender]')).toBeNull();
  });
  it.each(['ar','en'])('opens all internal tools and their older pages in %s',async lang=>{
    await mount('lang='+lang+'&conversationId=51');await click('[data-conversation-tools]');expect(el('[data-handoff-owner]')).toBeTruthy();
    const tabs=()=>Array.from(w.document.querySelectorAll('[role=tab]')) as any[];
    for(const index of [1,2,3]){tabs()[index].dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,30));}
    expect(el('[data-relay-id]')).toBeTruthy();expect(el('[data-offer-id]')).toBeTruthy();expect(w.document.querySelectorAll('[data-staff-attempt]')).toHaveLength(20);await click('[data-attempt-older]');expect(w.document.querySelectorAll('[data-staff-attempt]')).toHaveLength(5);expect(el('[data-staff-attempt]').getAttribute('data-staff-attempt')).toBe('105');expect(errors).toEqual([]);expect(text()).not.toContain('merchantUx.');
  });
  it('keeps a draft across history windows, restores URL state and isolates another tenant',async()=>{
    await mount();await change('[data-staff-draft]','Keep A');const older=Array.from(w.document.querySelectorAll('button')).find((b:any)=>b.textContent===en.conversationHistory.older) as any;
    if(!older)throw Error('Missing earlier history button');older.click();await vi.waitFor(()=>expect(conversationNavigation(w.location.search).historyTrail.length).toBe(1));expect(el('[data-staff-draft]').value).toBe('Keep A');expect(el('[data-staff-draft]').disabled).toBe(true);
    await change('[data-inbox-tenant]','236');expect(el('[data-staff-draft]').value).toBe('');await change('[data-inbox-tenant]','235');expect(el('[data-staff-draft]').value).toBe('Keep A');
  });
  it('simulates text sending and an uncertain result without network access',async()=>{
    await mount();await change('[data-staff-draft]','Local reply example');await click('[data-staff-send]');await vi.waitFor(()=>expect(el('[data-staff-draft]').value).toBe(''));expect(text()).toContain('Local reply example');
    await change('[data-inbox-scenario]','uncertain-send');await change('[data-staff-draft]','Keep uncertain');await click('[data-staff-send]');await vi.waitFor(()=>expect(el('[data-draft-review]')).toBeTruthy());expect(el('[data-staff-draft]').value).toBe('Keep uncertain');expect(el('[data-staff-send]').disabled).toBe(true);expect(errors).toEqual([]);
  });
  it('uses the actual recorder with a synthetic capture and permits cancel without opening a microphone',async()=>{
    await mount();await click('[data-voice-start]');expect(el('[data-voice-recorder]').getAttribute('data-voice-phase')).toBe('recording');await click('[data-voice-stop]');expect(el('[data-voice-recorder]').getAttribute('data-voice-phase')).toBe('draft');expect(el('[data-voice-preview]')).toBeTruthy();await click('[data-voice-cancel]');expect(el('[data-voice-recorder]').getAttribute('data-voice-phase')).toBe('idle');expect(errors).toEqual([]);
  });
});
