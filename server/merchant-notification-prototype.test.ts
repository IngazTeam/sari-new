import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { TextEncoder, TextDecoder } from 'node:util';
import { MessageChannel } from 'node:worker_threads';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const base = 'prototypes/tenant-dashboard/site/';
const storageKey = 'sary-notification-preview-v1';
let dom: JSDOM, w: any, errors: Error[];
function boot(stored?: string) {
  errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', e => errors.push(e));
  dom = new JSDOM(readFileSync(base+'index.html','utf8'), {url:'http://127.0.0.1:4329/', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console});
  w = dom.window; w.structuredClone = structuredClone; w.scrollTo = () => {};
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.MessageChannel = class extends MessageChannel { constructor() { super(); this.port1.unref(); this.port2.unref(); } };
  w.fetch = vi.fn(() => { throw Error('A local prototype must not call a provider'); });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  if (stored) w.localStorage.setItem(storageKey,stored);
  // Load the same modules and order as the actual preview, including future modules.
  for (const script of [...w.document.querySelectorAll('script[src]')] as any[]) runInContext(readFileSync(base+script.getAttribute('src'),'utf8'),dom.getInternalVMContext());
}
beforeEach(() => boot());
afterEach(() => { expect(errors).toEqual([]); expect(w.fetch).not.toHaveBeenCalled(); dom.window.close(); });
const route = (path: string) => { w.history.replaceState(null,'',`#/page/merchant/${path}`); w.dispatchEvent(new w.HashChangeEvent('hashchange')); };
const node = (selector: string): any => { const el = w.document.querySelector(selector); expect(el,selector).toBeTruthy(); return el; };
const click = (action: string, extra = '') => node(`[data-nw-action="${action}"]${extra}`).click();
const primary = () => node('[data-page-action="primary"]').click();
function input(name: string, value: string | boolean) {
  const el = node('#nw-'+name);
  if (typeof value === 'boolean') el.checked = value; else el.value = value;
  el.dispatchEvent(new w.Event('input',{bubbles:true})); el.dispatchEvent(new w.Event('change',{bubbles:true}));
}
function option(name: string, value: string) { const el = node(`[data-nw-option="${name}"]`); el.value = value; el.dispatchEvent(new w.Event('change',{bubbles:true})); }
const submit = () => node('[data-nw-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const data = () => JSON.parse(w.localStorage.getItem(storageKey));
const main = () => node('#main').textContent;
const contents = ['includeConversations','includeOrders','includeRevenue','includeProducts','includeCustomers','includeAppointments'];
function report() { route('scheduled-reports'); primary(); input('name','تقرير اختبار'); input('recipientEmail','owner@example.test'); }

describe('detailed notification workspace preview', () => {
  it('shows actual report fields, conditional recipients, all six content switches and inline errors', () => {
    route('scheduled-reports'); primary();
    expect(node('#nw-reportType').options).toHaveLength(3);
    expect(node('#nw-scheduleDay').options).toHaveLength(7);
    expect(w.document.querySelectorAll('.nw-checks input')).toHaveLength(6);
    submit(); expect(node('#nw-name').getAttribute('aria-invalid')).toBe('true');
    expect(node('#nw-recipientEmail').getAttribute('aria-describedby')).toBe('nw-recipientEmail-error');
    expect(w.document.activeElement.id).toBe('nw-name');
    input('name','اسم محفوظ في المسودة'); input('reportType','monthly'); input('scheduleDay','29');
    input('deliveryMethod','both'); input('recipientEmail','bad-address'); input('recipientPhone','invalid'); submit();
    expect(w.document.querySelectorAll('[aria-invalid=true]')).toHaveLength(3);
    expect(node('#nw-name').value).toBe('اسم محفوظ في المسودة');
    input('scheduleDay','28'); input('recipientEmail','review@example.test'); input('recipientPhone','+966500000000'); submit();
    expect(data().reports[0]).toMatchObject({scheduleDay:28,deliveryMethod:'both',recipientPhone:'+966500000000'});
    expect(main()).toContain('review@example.test');
  });

  it('persists false settings, edits without duplicating and restores saved data on a fresh page load', () => {
    report(); contents.forEach(name => input(name,false)); submit();
    expect(data().reports).toHaveLength(2);
    click('edit','[data-id="2"]'); contents.forEach(name => expect(node('#nw-'+name).checked).toBe(false));
    input('name','تقرير معدّل'); input('reportType','daily'); input('deliveryMethod','whatsapp'); input('recipientPhone','+966500000000'); submit();
    expect(data().reports).toHaveLength(2);
    const saved = w.localStorage.getItem(storageKey); dom.window.close(); boot(saved); route('scheduled-reports');
    click('edit','[data-id="2"]'); expect(node('#nw-name').value).toBe('تقرير معدّل');
    expect(w.document.querySelector('#nw-recipientEmail')).toBeNull();
    contents.forEach(name => expect(node('#nw-'+name).checked).toBe(false));
  });

  it('keeps a failed save and its fields open without writing to local storage', () => {
    route('scheduled-reports'); option('failure','failure'); primary();
    input('name','مسودة لم تحفظ'); input('recipientEmail','owner@example.test'); input('includeOrders',false); submit();
    expect(node('.nw-save-error').textContent).toContain('تعذّر حفظ التغيير');
    expect(node('#nw-name').value).toBe('مسودة لم تحفظ'); expect(node('#nw-includeOrders').checked).toBe(false);
    expect(w.localStorage.getItem(storageKey)).toBeNull(); expect(node('#dialog').open).toBe(true);
  });

  it('preserves read-only report status and historical send information during editing', () => {
    report(); submit(); const seed = data();
    seed.reports[0].isActive = false; seed.reports[0].lastSentAt = '27 سبتمبر 2026 · 09:00';
    dom.window.close(); boot(JSON.stringify(seed)); route('scheduled-reports');
    expect(main()).toContain('إعداد معطّل'); expect(main()).toContain('27 سبتمبر 2026 · 09:00');
    click('edit','[data-id="2"]'); input('name','تقرير محفوظ'); submit();
    expect(data().reports[0]).toMatchObject({isActive:false,lastSentAt:'27 سبتمبر 2026 · 09:00'});
  });

  it('requires deletion confirmation, supports cancellation and does not delete after failure', () => {
    route('scheduled-reports'); click('delete'); expect(main()).toContain('ملخص الأسبوع'); click('close');
    expect(main()).toContain('ملخص الأسبوع'); option('failure','failure'); click('delete'); click('confirm-delete');
    expect(main()).toContain('ملخص الأسبوع'); expect(node('#dialog').open).toBe(true);
    click('close'); option('failure','success'); click('delete'); click('confirm-delete');
    expect(data().reports).toEqual([]); expect(main()).toContain('ابدأ بتقرير يناسب يومك');
  });

  it('covers nine events and preserves the custom message while changing event and reviewing variables', () => {
    route('whatsapp-auto-notifications'); primary(); expect(node('#nw-triggerType').options).toHaveLength(9);
    input('messageTemplate','مرحباً {{customerName}} {{newDate}} {{unknown}}');
    expect(node('#nw-message-preview').textContent).toContain('ريم');
    expect(node('.nw-variable-warning').textContent).toContain('newDate');
    input('triggerType','appointment_rescheduled'); expect(node('#nw-messageTemplate').value).toContain('{{unknown}}');
    expect(node('#nw-message-preview').textContent).toContain('1 أكتوبر');
    expect(node('.nw-variable-warning').textContent).not.toContain('newDate');
    expect(node('[data-nw-action="variable"][data-value="newTime"]')).toBeTruthy();
    click('restore-template'); expect(node('#nw-messageTemplate').value).toContain('{{newTime}}');
    expect(node('#nw-messageTemplate').value).not.toContain('{{unknown}}');
    input('isActive',false); submit(); expect(data().notifications[0].isActive).toBe(false);
    click('edit','[data-id="2"]'); expect(node('#nw-isActive').checked).toBe(false);
  });

  it('inserts variables at the caret and rejects empty or overlong templates', () => {
    route('whatsapp-auto-notifications'); primary(); input('messageTemplate','مرحبا ');
    node('#nw-messageTemplate').setSelectionRange(6,6); click('variable','[data-value="customerName"]');
    expect(node('#nw-messageTemplate').value).toBe('مرحبا {{customerName}}');
    input('messageTemplate',''); submit(); expect(node('#nw-messageTemplate').getAttribute('aria-invalid')).toBe('true');
    input('messageTemplate','x'.repeat(4001)); submit(); expect(node('#nw-messageTemplate').getAttribute('aria-invalid')).toBe('true');
    input('messageTemplate','x'.repeat(4000)); click('variable','[data-value="customerName"]');
    expect(node('#nw-messageTemplate').value.length).toBe(4000);
    submit(); expect(data().notifications[0].messageTemplate.length).toBe(4000);
  });

  it('renders user supplied text safely in editors, previews, list cards and confirmation dialogs', () => {
    route('whatsapp-auto-notifications'); primary(); input('messageTemplate','<img src=x onerror=alert(1)> {{customerName}}');
    expect(node('#nw-message-preview').textContent).toContain('<img src=x onerror=alert(1)> ريم');
    submit(); click('preview','[data-id="2"]'); expect(node('#dialog').textContent).toContain('<img src=x');
    expect(w.document.querySelector('img[src=x]')).toBeNull(); click('close');
    report(); input('name','<img src=x onerror=alert(1)>'); submit(); click('delete','[data-id="2"]');
    expect(node('#dialog').textContent).toContain('<img src=x'); expect(w.document.querySelector('img[src=x]')).toBeNull();
  });

  it('makes viewer actions read-only even if disabled attributes are tampered with', () => {
    route('scheduled-reports'); option('role','viewer'); expect(node('[data-page-action="primary"]').disabled).toBe(true);
    node('[data-page-action="primary"]').disabled = false; primary();
    node('[data-nw-action="edit"]').disabled = false; click('edit');
    node('[data-nw-action="delete"]').disabled = false; click('delete'); expect(node('#dialog').open).toBe(false);
    route('whatsapp-auto-notifications'); click('preview'); expect(node('#dialog').open).toBe(true); click('close');
    route('integrations-dashboard'); click('tab','[data-value="errors"]');
    node('[data-nw-action="resolve"]').disabled = false; click('resolve');
    expect(w.document.querySelectorAll('.nw-issue')).toHaveLength(2); expect(w.localStorage.getItem(storageKey)).toBeNull();
  });

  it('distinguishes measured samples from no data and reports failed resolutions without losing the issue', () => {
    route('integrations-dashboard'); expect(main()).toContain('83%'); expect(main()).toContain('10 من 12');
    click('tab','[data-value="stats"]'); expect(w.document.querySelectorAll('.nw-stat-row')).toHaveLength(2);
    option('sample','empty'); expect(main()).toContain('لا توجد عمليات مسجلة'); expect(main()).not.toContain('100%');
    option('sample','records'); option('failure','failure'); click('tab','[data-value="errors"]'); click('resolve');
    expect(w.document.querySelectorAll('.nw-issue')).toHaveLength(2);
    option('failure','success'); click('resolve'); expect(w.document.querySelectorAll('.nw-issue')).toHaveLength(1);
    expect(data().resolved).toEqual([1]); click('resolve'); expect(main()).toContain('لا توجد أخطاء غير محلولة');
  });

  it('discloses unavailable browser persistence without falsely claiming durable save', () => {
    report(); vi.spyOn(w.Storage.prototype,'setItem').mockImplementation(() => { throw Error('QuotaExceededError'); }); submit();
    expect(main()).toContain('تقرير اختبار'); expect(node('#toast').textContent).toContain('حُفظ في الجلسة فقط');
  });

  it('participates in the global demo reset and retains generic recovery states', () => {
    report(); submit(); expect(data().reports).toHaveLength(2);
    node('[data-action="prototype"]').click(); node('[data-action="reset-confirm"]').click();
    node('[data-action="reset"]').click(); expect(data().reports).toHaveLength(1);
    for (const page of ['scheduled-reports','whatsapp-auto-notifications','integrations-dashboard']) {
      route(page); node('[data-page-action="states"]').click();
      node('[data-page-action="state"][data-value="offline"]').click(); expect(main()).toContain('تعذّر الاتصال');
      node('[data-page-action="recover"]').click(); expect(w.document.querySelector('.nw-lab')).toBeTruthy();
    }
  });
});
