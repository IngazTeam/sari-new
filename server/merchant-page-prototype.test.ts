import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextEncoder, TextDecoder } from 'node:util';
import { MessageChannel } from 'node:worker_threads';

const base = 'prototypes/tenant-dashboard/site/';
let dom: JSDOM, w: any;
let errors: Error[];
beforeEach(() => {
  errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  dom = new JSDOM(readFileSync(base + 'index.html', 'utf8'), { url: 'http://127.0.0.1:4329/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  w = dom.window;
  w.structuredClone = structuredClone;
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.MessageChannel = class extends MessageChannel { constructor() { super(); this.port1.unref(); this.port2.unref(); } };
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  for (const script of [...w.document.querySelectorAll('script[src]')] as any[]) runInContext(readFileSync(base + script.getAttribute('src'), 'utf8'), dom.getInternalVMContext());
});
afterEach(() => { w.ImportPreview?.unmount(); w.ProductPreview?.unmount(); w.CustomerPreview?.unmount(); w.ReportPreview?.unmount(); w.OrderPreview?.unmount(); w.QuotationPreview?.unmount(); dom.window.close(); });
function route(path: string) { w.history.replaceState(null, '', w.TenantPages.href(path)); w.dispatchEvent(new w.HashChangeEvent('hashchange')); }
function click(action: string) { const node = w.document.querySelector(`[data-page-action="${action}"]`); expect(node, action).toBeTruthy(); node.click(); }
function input(selector: string, value: string) { const node = w.document.querySelector(selector); node.value = value; node.dispatchEvent(new w.Event('input', { bubbles: true })); }
function submit(type: string) { w.document.querySelector(`[data-page-form="${type}"]`).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
const text = () => w.document.getElementById('main').textContent;

describe('complete tenant page prototype', () => {
  it('opens actual order notifications with all filters and without the retired settings form', () => {
    route('/merchant/order-notifications?view=history&state=manual_review&evidence=accepted&integrity=linked&sort=oldest&page=2&tenant=270&lang=en');
    const frame=w.document.querySelector('#main iframe[data-brain-preview]'),url=new URL(frame.getAttribute('src'),w.location.href);
    expect(url.pathname).toBe('/service-workspace.html');expect(Object.fromEntries(url.searchParams)).toEqual({view:'history',state:'manual_review',evidence:'accepted',integrity:'linked',sort:'oldest',page:'2',tenant:'270',lang:'en',embed:'brain',path:'/merchant/order-notifications'});
    expect(w.document.querySelector('[data-page-form="settings"]')).toBeNull();expect(errors).toEqual([]);
  });
  it.each(['#/inbox','#/inbox?lang=en&conversationId=51','#/inbox/old?phone=ux-customer-051'])('retires the manual inbox at %s without losing its query',hash=>{
    w.history.replaceState(null,'','/'+hash);w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    expect(w.location.hash).toBe('#/page/merchant/conversations'+(hash.includes('?')?hash.slice(hash.indexOf('?')):''));
    const frame=w.document.querySelector('#main iframe');expect(frame.getAttribute('src')).toContain('./inbox.html?embed=brain');expect(w.document.querySelector('[data-form="message"]')).toBeNull();expect(w.document.querySelector('.chat-body')).toBeNull();expect(errors).toEqual([]);
  });
  it.each(['#/analytics', '#/analytics/', '#/analytics?lang=en', '#/analytics/overview?lang=ar'])('opens the actual analytics hub for the legacy URL %s', async hash => {
    w.history.replaceState(null, '', '/' + hash); w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    expect(w.location.hash).toBe('#/page/merchant/analytics-hub' + (hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''));
    await vi.waitFor(() => expect(w.document.querySelectorAll('.mw-analytics-hub h3')).toHaveLength(11));
    expect(w.document.querySelectorAll('.mw-analytics-hub section')).toHaveLength(3);
    expect(text()).not.toContain('الإيراد المحصّل');
    expect(w.document.querySelector('[data-action="export-orders"]')).toBeNull();
    expect(errors).toEqual([]);
  });
  it.each(['','#','#/','#/overview'])('opens the actual dashboard for the legacy home URL %s',hash=>{
    w.history.replaceState(null,'','/'+hash);w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    expect(w.location.hash).toBe('#/page/merchant/dashboard');expect(w.document.querySelector('#main iframe')?.getAttribute('src')).toBe('./dashboard.html?embed=brain');expect(text()).not.toContain('صباح الخير، أحمد');expect(w.document.querySelector('[data-action="quick"]')).toBeNull();
  });
  it('renders every route and recovery state with one heading or one dedicated application frame and valid links', async () => {
    const inventory = JSON.parse(readFileSync('docs/audits/tenant-pages-2026-09-27/inventory.json', 'utf8'));
    const routes = inventory.routes;
    for (const page of routes) expect(w.TenantPages.find(page.route), page.route).toBeTruthy();
    expect(w.TENANT_PAGES.length).toBe(133);
    for (const page of w.TENANT_PAGES) {
      route(page.route);
      const embeddedPages = new Map([
        ["/merchant/dashboard", "dashboard.html?embed=brain"],
        ["/merchant/conversations", "inbox.html?embed=brain"],
        ["/merchant/analytics", "sales-analytics.html?embed=brain"],
        ...["message-analytics","sari-analytics","advanced-analytics","analytics-dashboard","voice-messages","analysis"].map(name=>["/merchant/"+name,"messages-analytics.html?embed=brain"] as const),
        ["/merchant/ai-hub", "assistant-settings.html?embed=brain&page=hub"],
        ["/merchant/bot-settings", "assistant-settings.html?embed=brain"],
        [
          "/merchant/human-takeover",
          "assistant-options.html?embed=brain&page=takeover",
        ],
        [
          "/merchant/language-settings",
          "assistant-options.html?embed=brain&page=language",
        ],
        ["/merchant/virtual-team", "personas.html?embed=brain"],
      ]);
      const destination = page.redirect || page.route;
      if (/^\/merchant\/campaigns(?:\/|$)/.test(destination)) embeddedPages.set(destination, 'campaign-workspace.html?embed=brain&path=' + encodeURIComponent(destination));
      if (/^\/merchant\/(?:services(?:\/|$)|order-notifications$|reviews$|booking-reviews$|scheduled-messages$|media-library$|promotions$|discounts$|referrals$|abandoned-carts$|occasion-campaigns$|service-categories$|service-packages$|staff$|bookings$|integrations\/(?:byaan|zid|calendly)$|zid\/(?:settings|products|sync-logs|callback)$|woocommerce\/(?:settings|products|orders|analytics)$|byaan-dashboard$|salla$|platform-integrations$|calendar(?:\/settings)?$)/.test(destination)) embeddedPages.set(destination, 'service-workspace.html?embed=brain&path=' + encodeURIComponent(destination));
      if (embeddedPages.has(destination)) {
        await vi.waitFor(() =>
          expect(
            w.document.querySelectorAll("#main iframe[data-brain-preview]")
              .length,
            page.route
          ).toBe(1)
        );
        const frames = w.document.querySelectorAll(
          "#main iframe[data-brain-preview]"
        );
        expect(frames, page.route).toHaveLength(1);
        expect(frames[0].getAttribute("src")).toBe(
          "./" + embeddedPages.get(destination)
        );
        expect(frames[0].getAttribute("title")).toBeTruthy();
        expect(
          readFileSync(
            base + embeddedPages.get(destination)!.split("?")[0],
            "utf8"
          )
        ).toContain("<script");
        expect(w.document.querySelectorAll("#main h1")).toHaveLength(0);
      } else
        await vi.waitFor(() =>
          expect(
            w.document.querySelectorAll("#main h1").length,
            page.route
          ).toBe(1)
        );
      if (!embeddedPages.has(destination) && page.kind === 'result' && page.route.includes('/zid/')) {
        expect(text()).toContain('التحقق من ربط زد');
        expect(text()).not.toContain('تأكيد الدفع');
      }
      for (const anchor of w.document.querySelectorAll('#main a[href^="#/page/"]')) {
        const path = decodeURIComponent(anchor.getAttribute('href').slice(6).split('?')[0]);
        expect(w.TenantPages.find(path), anchor.getAttribute('href')).toBeTruthy();
      }
    }
    expect(errors).toEqual([]);
  });

  it('searches the actual order list, clears empty results and opens details without creating an order', async () => {
    route('/merchant/orders');
    await vi.waitFor(() => expect(w.document.querySelectorAll('.ow-list > li')).toHaveLength(25));
    const search = async (value: string) => {
      const field = w.document.querySelector('#ow-search');
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new w.Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      field.closest('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    };
    await search('does-not-exist');
    await vi.waitFor(() => expect(w.document.querySelectorAll('.ow-list > li')).toHaveLength(0));
    await search('');
    await vi.waitFor(() => expect(w.document.querySelectorAll('.ow-list > li')).toHaveLength(25));
    w.document.querySelector('.ow-open').click();
    await vi.waitFor(() => expect(w.document.querySelector('.ow-detail')).not.toBeNull());
    expect(text()).toContain('سجل تغييرات الحالة');
    expect(w.document.querySelector('[data-page-form="create"]')).toBeNull();
    (Array.from(w.document.querySelectorAll('.qt-tools button')) as any[]).find(b=>b.textContent==='قائمة الطلبات').click();
    await vi.waitFor(() => expect(w.document.querySelectorAll('.ow-list > li')).toHaveLength(25));
  });

  it('opens the actual category editor and retains its filters without the retired create form', () => {
    route('/merchant/service-categories?edit=new&q=test');
    const frame = w.document.querySelector('#main iframe');
    const url = new URL(frame.getAttribute('src'), w.location.href);
    expect(url.pathname).toBe('/service-workspace.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({ edit: 'new', q: 'test', embed: 'brain', path: '/merchant/service-categories' });
    expect(w.document.querySelector('[data-page-form="create"]')).toBeNull();
    expect(errors).toEqual([]);
  });

  it('preserves unchecked form settings after save and reopening', () => {
    const page = w.TENANT_PAGES.find((p: any) => p.kind === 'form' && p.labels.some((l: string) => /تفعيل|تنبيه|إشعارات/.test(l)));
    route(page.route);
    const checkbox = w.document.querySelector('input[type=checkbox]');
    expect(checkbox).toBeTruthy(); checkbox.checked = false;
    submit('settings'); route('/merchant/tools'); route(page.route);
    expect(w.document.querySelector('input[type=checkbox]').checked).toBe(false);
    expect(text()).toContain('تم حفظ التغييرات');
  });

  it('uses the real import workspace and blocks approval when a row is invalid', async () => {
    route('/merchant/products/upload');
    await vi.waitFor(() => expect(w.document.querySelector('.pi-approval')).not.toBeNull());
    const mode = w.document.querySelector('.pp-controls select');
    mode.value = 'errors'; mode.dispatchEvent(new w.Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(w.document.querySelector('.pi-errors')).not.toBeNull());
    expect(w.document.querySelector('.pi-approval button').disabled).toBe(true);
    expect(w.document.querySelector('[data-page-action="confirm-import"]')).toBeNull();
  });

  it('carries the selected plan into checkout instead of always showing the middle plan', () => {
    route('/merchant/subscription/plans');
    w.document.querySelector('[data-page-action="choose-plan"][data-plan="0"]').click();
    route('/merchant/checkout');
    expect(text()).toContain('البداية');
    expect(text()).toContain('99 ر.س');
    expect(text()).not.toContain('249 ر.س');
  });

  it('opens actual Salla recovery controls and preserves context instead of fake connection state', () => {
    route('/merchant/salla?connection=salla-error&tenant=270&lang=en&scenario=failure');
    const frame=w.document.querySelector('#main iframe[data-brain-preview]');
    const url=new URL(frame.getAttribute('src'),w.location.href);
    expect(url.pathname).toBe('/service-workspace.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({connection:'salla-error',tenant:'270',lang:'en',scenario:'failure',embed:'brain',path:'/merchant/salla'});
    expect(w.document.querySelector('[data-page-action="connect"]')).toBeNull();
    expect(errors).toEqual([]);
  });

  it('opens the actual campaign editor with its scenario and language instead of the retired wizard', () => {
    route('/merchant/campaigns/new?lang=en&scenario=empty');
    const frame = w.document.querySelector('#main iframe');
    const url = new URL(frame.getAttribute('src'), w.location.href);
    expect(url.pathname).toBe('/campaign-workspace.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lang: 'en', scenario: 'empty', embed: 'brain', path: '/merchant/campaigns/new' });
    expect(w.document.querySelector('[data-page-form="compose"]')).toBeNull();
    expect(errors).toEqual([]);
  });
});
