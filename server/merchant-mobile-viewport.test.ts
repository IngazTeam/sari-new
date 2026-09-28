import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMerchantViewport, visibleMerchantViewport } from '../client/src/lib/merchant-viewport';

describe('merchant visible viewport', () => {
  let dom: JSDOM, win: Window, visual: EventTarget & {height: number; offsetTop: number; scale: number};
  const cleanups: Array<() => void> = [];
  beforeEach(() => {
    dom = new JSDOM('<meta name="viewport" content="width=device-width, initial-scale=1"><body><input><input type="checkbox"><textarea></textarea></body>', {pretendToBeVisual: true});
    win = dom.window as unknown as Window;
    Object.defineProperty(win, 'innerHeight', {value: 812, configurable: true});
    visual = Object.assign(new dom.window.EventTarget(), {height: 812, offsetTop: 0, scale: 1});
    Object.defineProperty(win, 'visualViewport', {value: visual, configurable: true});
  });
  afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); dom.window.close();});
  const install = () => {const dispose = installMerchantViewport(win); cleanups.push(dispose); return dispose;};
  const resize = () => visual.dispatchEvent(new dom.window.Event('resize'));

  it('tracks the keyboard-visible area and scroll offset while typing', () => {
    install();
    win.document.querySelector('input')!.focus();
    Object.assign(visual, {height: 420, offsetTop: 38}); resize();
    expect(win.document.body.style.getPropertyValue('--mw-visible-height')).toBe('420px');
    expect(win.document.body.style.getPropertyValue('--mw-viewport-top')).toBe('38px');
    expect(win.document.body.hasAttribute('data-mw-keyboard')).toBe(true);
    Object.assign(visual, {height: 812, offsetTop: 0}); resize();
    expect(win.document.body.hasAttribute('data-mw-keyboard')).toBe(false);
  });
  it('does not treat browser chrome, a checkbox or an unfocused page as a keyboard', () => {
    install(); visual.height = 700; win.document.querySelector('textarea')!.focus(); resize();
    expect(win.document.body.hasAttribute('data-mw-keyboard')).toBe(false);
    visual.height = 420; win.document.querySelector<HTMLInputElement>('[type="checkbox"]')!.focus(); resize();
    expect(win.document.body.hasAttribute('data-mw-keyboard')).toBe(false);
    win.document.querySelector<HTMLInputElement>('[type="checkbox"]')!.blur(); resize();
    expect(win.document.body.hasAttribute('data-mw-keyboard')).toBe(false);
  });
  it('preserves pinch zoom and ignores transient zero-sized viewport events', () => {
    install(); visual.height = 400; visual.scale = 2; resize();
    expect(win.document.body.style.getPropertyValue('--mw-visible-height')).toBe('812px');
    expect(visibleMerchantViewport(812, {height: 0, offsetTop: 0, scale: 1}, true)).toBeNull();
    expect(visibleMerchantViewport(812, {height: 600, offsetTop: -20, scale: 1}, false)?.top).toBe(0);
  });
  it('restores page metadata/styles only after the last owner exits; disposal is idempotent', () => {
    const body = win.document.body, meta = win.document.querySelector('meta')!;
    body.style.setProperty('--mw-visible-height', '75vh');
    const first = install(), second = install();
    expect(meta.content).toContain('viewport-fit=cover');
    expect(meta.content).not.toContain('user-scalable=no');
    first(); first();
    expect(body.classList.contains('merchant-surface')).toBe(true);
    second();
    expect(body.classList.contains('merchant-surface')).toBe(false);
    expect(body.style.getPropertyValue('--mw-visible-height')).toBe('75vh');
    expect(meta.content).toBe('width=device-width, initial-scale=1');
    visual.height = 400; resize();
    expect(body.style.getPropertyValue('--mw-visible-height')).toBe('75vh');
  });
  it('preserves prior surface ownership and later metadata changes', () => {
    win.document.body.classList.add('merchant-surface');
    const dispose = install();
    win.document.querySelector('meta')!.content = 'width=device-width, initial-scale=2';
    dispose();
    expect(win.document.body.classList.contains('merchant-surface')).toBe(true);
    expect(win.document.querySelector('meta')!.content).toBe('width=device-width, initial-scale=2');
  });
  it('falls back to window height when VisualViewport is unavailable', () => {
    Object.defineProperty(win, 'visualViewport', {value: undefined});
    install();
    expect(win.document.body.style.getPropertyValue('--mw-visible-height')).toBe('812px');
    Object.defineProperty(win, 'innerHeight', {value: 600});
    win.dispatchEvent(new dom.window.Event('resize'));
    expect(win.document.body.style.getPropertyValue('--mw-visible-height')).toBe('600px');
  });
});
