import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it } from 'vitest';
let dom: JSDOM, w: any;
const base = 'prototypes/tenant-dashboard/site/';
beforeEach(() => {
  dom = new JSDOM('<main></main>', { url: 'http://localhost/', runScripts: 'outside-only' }); w = dom.window;
  runInContext(readFileSync(base + 'campaigns.js', 'utf8'), dom.getInternalVMContext());
  w.render = () => { w.document.querySelector('main').innerHTML = w.CampaignPreview.render({ route: '/merchant/campaigns' }, '<p>Campaign list fixture</p>'); };
  w.render();
});
afterEach(() => dom.window.close());
const click = (action: string, value: string) => w.document.querySelector(`[data-cp-action="${action}"][data-value="${value}"]`).click();
const state = (value: string) => { const el = w.document.getElementById('cp-state'); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
it('switches between the existing list and performance without replacing list actions', () => {
  expect(w.document.body.textContent).toContain('Campaign list fixture');
  click('tab', 'performance'); expect(w.document.body.textContent).toContain('ما الذي وصل إلى مزود واتساب؟');
  click('tab', 'list'); expect(w.document.body.textContent).toContain('Campaign list fixture');
});
it('changes the daily rows for every period and restores keyboard focus', () => {
  click('tab', 'performance');
  for (const days of ['7', '90', '30']) {
    click('period', days);
    expect(w.document.querySelectorAll('tbody tr')).toHaveLength(Number(days));
    expect(w.document.activeElement.dataset.value).toBe(days);
    expect(w.document.body.textContent).toContain('من أصل 200');
  }
});
it('models empty, failed, loading and recovery without claiming successful delivery', () => {
  click('tab', 'performance'); state('empty');
  expect(w.document.body.textContent).toContain('لا توجد عينة'); expect(w.document.querySelector('svg')).toBeNull();
  state('error'); expect(w.document.querySelector('table')).toBeNull(); expect(w.document.querySelector('[role="alert"]')).toBeTruthy();
  click('retry', 'ready'); expect(w.document.querySelector('table')).toBeTruthy();
  state('loading'); expect(w.document.querySelector('[aria-busy="true"]')).toBeTruthy(); expect(w.document.querySelector('dl')).toBeNull();
});
