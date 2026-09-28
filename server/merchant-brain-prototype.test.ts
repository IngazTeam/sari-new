import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { beforeEach, afterEach, expect, it } from 'vitest';

let dom: JSDOM, w: any;
let errors: Error[];
const base = 'prototypes/tenant-dashboard/site/';
beforeEach(() => {
  errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  dom = new JSDOM(readFileSync(base + 'index.html', 'utf8'), { url: 'http://127.0.0.1:4329/#/page/merchant/sari-brain', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  w = dom.window; w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  for (const file of ['features.js', 'page-catalog.js', 'brain.js', 'assistant.js', 'pages.js', 'app.js']) runInContext(readFileSync(base + file, 'utf8'), dom.getInternalVMContext());
});
afterEach(() => { expect(errors).toEqual([]); dom.window.close(); });
const node = (selector: string) => { const element = w.document.querySelector(selector); expect(element, selector).toBeTruthy(); return element; };
const click = (action: string, id?: string) => node(`[data-brain-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).click();
const text = () => w.document.querySelector('#main').textContent;
const dialog = () => w.document.querySelector('#dialog').textContent;
const saved = () => JSON.parse(w.localStorage.getItem('sary-brain-preview-v1'));
function submit(type: string) { node(`[data-brain-form="${type}"]`).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
function set(selector: string, value: string, event = 'input') { const el = node(selector); el.value = value; el.dispatchEvent(new w.Event(event, { bubbles: true })); }
function draftReturn(answer = 'يمكن استرجاع المنتج غير المفتوح خلال 7 أيام من الاستلام.') {
  click('navigate', 'gaps'); click('gap', 'returns');
  set('#brain-answer', answer); set('#brain-source', 'policy', 'change'); submit('gap-draft');
}

it('separates results, source files, actionable gaps and a sourced sales rubric', () => {
  expect(w.document.querySelectorAll('#main h1')).toHaveLength(1);
  expect(w.document.querySelectorAll('.brain-nav button')).toHaveLength(4);
  expect(text()).toContain('نتائج مرتبطة بمصادرها');
  click('file', 'catalog'); expect(dialog()).toContain('ورقة المنتجات · صف 2');
  click('navigate', 'sales'); expect(node('[data-brain-score]').textContent).toBe('74%');
  const meters = [...w.document.querySelectorAll('meter')].map((m: any) => Number(m.value));
  expect(meters).toEqual([80, 85, 65, 70, 75, 60]);
  expect(text()).toContain('لا تمثل نسبة العملاء الذين اشتروا');
  click('evidence', 'objection'); expect(dialog()).toContain('26 ÷ 40');
});

it('hides the assessment when the selected sample is insufficient', () => {
  click('navigate', 'sales'); set('#brain-period', '7', 'change');
  expect(node('[data-brain-score]').textContent).toBe('—');
  expect(w.document.querySelectorAll('meter')).toHaveLength(0);
  expect(text()).toContain('12 محادثة');
  set('#brain-period', '30', 'change'); expect(node('[data-brain-score]').textContent).toBe('74%');
});

it('filters files and distinguishes extraction failure from pending review and activation', () => {
  click('navigate', 'files'); expect(w.document.querySelectorAll('[data-brain-file]')).toHaveLength(5);
  set('#brain-search', 'المصوّر'); expect(w.document.querySelectorAll('[data-brain-file]')).toHaveLength(1);
  click('file', 'scan'); expect(dialog()).toContain('لم نتمكن من قراءة');
  expect(w.document.querySelector('[data-brain-form="approve-file"]')).toBeNull();
  set('#brain-search', ''); set('#brain-file-filter', 'review', 'change');
  expect(w.document.querySelectorAll('[data-brain-file]')).toHaveLength(1);
  click('file', 'guide'); submit('approve-file');
  expect(saved()).toBeNull();
  node('[data-brain-form="approve-file"] input').checked = true; submit('approve-file');
  expect(saved().files.find((f: any) => f.id === 'guide')).toMatchObject({ status: 'ready', active: true });
  click('navigate', 'sales'); expect(node('[data-brain-score]').textContent).toBe('74%');
});

it('requires a reviewed source, approval, test and confirmation to close a gap', () => {
  click('navigate', 'gaps'); click('gap', 'returns'); submit('gap-draft');
  expect(saved()).toBeNull();
  set('#brain-answer', 'يمكن استرجاع المنتج غير المفتوح خلال 7 أيام من الاستلام.'); set('#brain-source', 'policy', 'change'); submit('gap-draft');
  expect(saved().gaps[0].state).toBe('draft'); expect(saved().files[0].active).toBe(false);
  submit('approve-gap'); expect(saved().gaps[0].state).toBe('draft');
  node('[data-brain-form="approve-gap"] input').checked = true; submit('approve-gap');
  expect(saved().gaps[0].state).toBe('retest');
  expect(saved().files.find((f: any) => f.id === 'legacy').active).toBe(false);
  expect(w.document.querySelector('[data-brain-form="resolve-gap"]')).toBeNull();
  click('run-gap', 'returns'); submit('resolve-gap'); expect(saved().gaps[0].state).toBe('retest');
  node('[data-brain-form="resolve-gap"] input').checked = true; submit('resolve-gap');
  expect(saved().gaps[0].state).toBe('resolved');
  click('navigate', 'sales'); expect(node('[data-brain-score]').textContent).toBe('74%');
  click('navigate', 'gaps'); click('filter-gaps', 'resolved'); expect(w.document.querySelectorAll('.brain-gap')).toHaveLength(1);
});

it('renders edits as text and preserves the draft across navigation', () => {
  const answer = '<img src=x onerror=alert(1)> إجابة للمراجعة من المصدر.';
  draftReturn(answer);
  expect(dialog()).toContain(answer); expect(w.document.querySelector('#dialog img')).toBeNull();
  w.document.querySelector('#dialog').close();
  w.history.replaceState(null, '', '#/page/merchant/products'); w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  w.history.replaceState(null, '', '#/page/merchant/sari-brain'); w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  click('navigate', 'gaps'); click('gap', 'returns'); expect(dialog()).toContain(answer);
});

it('stops source-backed answers after a source is disabled and requests help for unknown questions', () => {
  click('test'); set('#brain-question', 'كم سعر بن كولومبيا؟'); submit('test'); expect(dialog()).toContain('64 ريالًا');
  click('file', 'catalog'); click('toggle-file', 'catalog'); click('confirm-toggle', 'catalog');
  click('test'); set('#brain-question', 'كم سعر بن كولومبيا؟'); submit('test');
  expect(dialog()).toContain('نحتاج معلومة مؤكدة'); expect(dialog()).not.toContain('64 ريالًا');
  set('#brain-question', 'سؤال ليس في مصادر المعرفة'); submit('test'); expect(dialog()).toContain('مساعدة الفريق');
});

it('adds only local file metadata and never fabricates extraction or sales progress', () => {
  node('[data-page-action="primary"]').click();
  const input = node('#brain-upload');
  Object.defineProperty(input, 'files', { configurable: true, value: [new w.File(['sample text'], 'new-policy.txt', { type: 'text/plain' })] });
  node('[data-brain-form="upload"]').reportValidity = () => true; submit('upload');
  const added = saved().files[0]; expect(added).toMatchObject({ name: 'new-policy.txt', status: 'queued', active: false, facts: [] });
  expect(JSON.stringify(added)).not.toContain('sample text');
  click('file', added.id); expect(dialog()).toContain('لم تُقرأ محتوياته');
  click('navigate', 'sales'); expect(node('[data-brain-score]').textContent).toBe('74%');
});

it.each([{ name: 'payload.html', size: 20 }, { name: 'large.pdf', size: 6 * 1024 * 1024 }, { name: 'empty.txt', size: 0 }])('rejects an unsupported, oversized or empty attachment: $name', ({ name, size }) => {
  node('[data-page-action="primary"]').click();
  Object.defineProperty(node('#brain-upload'), 'files', { value: [{ name, size }] });
  node('[data-brain-form="upload"]').reportValidity = () => true; submit('upload');
  expect(saved()).toBeNull(); expect(node('#brain-upload-error').textContent).toContain('لا يتجاوز 5 ميغابايت');
});
