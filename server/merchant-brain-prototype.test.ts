import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { MessageChannel } from 'node:worker_threads';

let dom: JSDOM, w: any;
let errors: Error[];
const base = 'prototypes/tenant-dashboard/site/';
beforeEach(() => {
  errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  dom = new JSDOM(readFileSync(base + 'index.html', 'utf8'), { url: 'http://127.0.0.1:4329/#/page/merchant/sari-brain', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  w = dom.window; w.scrollTo = () => {}; w.structuredClone = structuredClone; w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MessageChannel = class extends MessageChannel { constructor() { super(); this.port1.unref(); this.port2.unref(); } };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  for (const script of [...w.document.querySelectorAll('script[src]')] as any[]) runInContext(readFileSync(base + script.getAttribute('src'), 'utf8'), dom.getInternalVMContext());
});
afterEach(() => { expect(errors).toEqual([]); dom.window.close(); });
const node = (selector: string) => { const element = w.document.querySelector(selector); expect(element, selector).toBeTruthy(); return element; };
const click = (action: string, id?: string) => node(`[data-brain-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).click();
const text = () => w.document.querySelector('#main').textContent;
const dialog = () => w.document.querySelector('#dialog').textContent;
const saved = () => JSON.parse(w.localStorage.getItem('sary-brain-preview-v1'));
function submit(type: string) { node(`[data-brain-form="${type}"]`).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
function set(selector: string, value: string, event = 'input') { const el = node(selector); el.value = value; el.dispatchEvent(new w.Event(event, { bubbles: true })); }

it('matches the six application views without the retired sales score or fabricated gap controls',()=>{
  expect([...w.document.querySelectorAll('.brain-nav button')].map(b=>b.dataset.id)).toEqual(['overview','sources','knowledge','sales','testing','history']);
  expect(w.document.querySelectorAll('#main h1')).toHaveLength(1);
  expect(w.document.querySelectorAll('[data-source-inventory]')).toHaveLength(4);
  for(const view of ['overview','sources','knowledge','sales','testing','history']){
    click('navigate',view);expect(w.document.querySelector('meter,[data-brain-score],[data-brain-file],[data-gap-state]')).toBeNull();
    expect(text()).not.toContain('74%');
  }
});
it.each(['loading','error'])('keeps source failures distinct from empty data: %s',state=>{
  set('[data-si-state]',state,'change');expect(w.document.querySelectorAll('[data-source-inventory]')).toHaveLength(0);
  node('[data-si-action="retry"]').click();expect(w.document.querySelectorAll('[data-source-inventory]')).toHaveLength(4);
});
it('navigates each overview source to the correct editor workspace',()=>{
  node('[data-si-action="faqs"]').click();expect(text()).toContain('هل يتوفر طحن للتقطير؟');expect(w.location.hash).toContain('pane=faq');
  click('navigate','overview');node('[data-si-action="pages"]').click();expect(w.location.hash).toContain('pane=pages');
  click('navigate','overview');node('[data-si-action="documents"]').click();expect(node('[data-kl-library]')).toBeTruthy();expect(w.location.hash).toContain('view=sources');
});
it('moves upload and content review into sources while retaining the library and extraction states',()=>{
  node('[data-page-action="primary"]').click();
  expect(w.location.hash).toContain('view=sources');expect(node('[data-kl-library]')).toBeTruthy();expect(node('[data-kd-document]')).toBeTruthy();expect(node('[data-bk-action="intake"]')).toBeTruthy();
  expect(w.document.querySelector('#brain-upload,[data-brain-form="approve-file"]')).toBeNull();
});
it('preserves the four actual knowledge panes and their deep links',()=>{
  click('navigate','knowledge');
  expect([...w.document.querySelectorAll('[data-bw-action="knowledge-tab"]')].map(b=>b.dataset.value)).toEqual(['sections','faq','conflicts','website']);
  node('[data-bw-action="knowledge-tab"][data-value="website"]').click();expect(w.location.hash).toContain('pane=pages');
  click('navigate','sales');click('navigate','knowledge');expect(node('[data-bw-action="knowledge-tab"][data-value="website"]').getAttribute('aria-pressed')).toBe('true');
  w.history.replaceState(null,'','#/page/merchant/sari-brain?view=knowledge&pane=faq');w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  expect(node('[data-bw-action="knowledge-tab"][data-value="faq"]').getAttribute('aria-pressed')).toBe('true');
});
it('validates deep-link destinations and escapes untrusted query values',()=>{
  w.history.replaceState(null,'','#/page/merchant/sari-brain?view=%3Cimg%20src=x%3E&pane=unknown');w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  expect(node('#brain-nav-overview').getAttribute('aria-pressed')).toBe('true');expect(w.document.querySelector('#main img[src=x]')).toBeNull();
});
it('does not add duplicate history entries when the same view is selected',()=>{
  click('navigate','sources');const length=w.history.length;click('navigate','sources');expect(w.history.length).toBe(length);
});
it.each([
 ['overview',['website-analysis.html']],
 ['sources',['knowledge-groups.html','knowledge-removal.html']],
 ['sales',['sales-knowledge.html']],
 ['testing',['brain-preview.html','reply-quality.html']],
 ['history',['knowledge-activity.html']],
])('keeps actual-component previews reachable from %s', (view, paths)=>{
  click('navigate',view);for(const path of paths)expect(node('a[href="./'+path+'"]').textContent).toBe('فتح الشاشة التفاعلية');
});
it('keeps sales policies, experiments, reply reviews and evaluations reachable without a score',()=>{
  click('navigate','sales');for(const value of ['sector','followup','experiments','replies','evaluation'])expect(node('[data-bw-action="ops-tab"][data-value="'+value+'"]')).toBeTruthy();
  expect(text()).toContain('غير متاح حاليًا');expect(w.document.querySelector('[data-brain-score]')).toBeNull();
});
it('retains the eight-case learning review and prevents it from inflating proficiency',()=>{
  click('navigate','sales');click('navigate','learning');click('review-open');
  for(let i=0;i<8;i++){
    set('#brain-review-baseline','Current '+i);set('#brain-review-candidate','Candidate '+i);set('#brain-review-reason','راجعت الإجابة والمصدر وتأكدت من دقة رد الحالة '+i);
    set('#brain-review-baselineVerdict','pass','change');set('#brain-review-candidateVerdict',i===7?'fail':'pass','change');if(i<7)click('review-next');
  }
  node('#brain-review-attest').checked=true;submit('review');expect(saved().review.cases).toHaveLength(8);expect(saved().review.outcome).toContain('لم يجتز');
  expect(text()).not.toContain('74%');expect(w.document.querySelector('meter')).toBeNull();
});
