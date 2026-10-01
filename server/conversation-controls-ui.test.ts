// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';
import merchantEn from '../client/src/locales/merchant-ux.en';
import merchantAr from '../client/src/locales/merchant-ux.ar';
const state = vi.hoisted(() => ({ language: 'en', mutate: vi.fn(), copy: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  i18n: { language: state.language },
  t: (key: string, args: Record<string, unknown> = {}) => {
    const source = state.language === 'ar' ? {...ar, merchantUx: merchantAr} : {...en, merchantUx: merchantEn};
    const value = key.split('.').reduce((v: any, k) => v?.[k], source) || key;
    return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(args[k] ?? ''));
  },
}) }));
vi.mock('@/lib/trpc', () => ({ trpc: { aiSuggestions: {
  generateSuggestions: { useMutation: () => ({ mutate: state.mutate, isPending: false, data: { suggestions: [
    { id: 1, type: 'friendly', label: 'Friendly', text: 'A useful complete reply' },
  ] } }) },
} } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { AISuggestions } from '../client/src/components/AISuggestions';
import { WhatsAppPreview } from '../client/src/components/WhatsAppPreview';
let root: Root, container: HTMLDivElement;
const select = vi.fn(), send = vi.fn(), back = vi.fn();
const render = (element: React.ReactNode) => act(async () => root.render(element));
const click = (el: HTMLElement) => act(async () => el.click());
const named = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === label)!;
const fill = (value: string) => act(async () => {
  const input = container.querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: state.copy } });
  state.copy.mockResolvedValue(undefined);
  state.language = 'en';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const suggestions = (compact = false) => React.createElement(AISuggestions, { conversationId: 4, messages: [], onSelectSuggestion: select, compact });
it('uses separate native selection and copy buttons without nested interactive targets', async () => {
  await render(suggestions());
  const choose = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('A useful complete reply'))!;
  expect(choose.type).toBe('button'); expect(choose.tabIndex).toBe(0);
  expect(choose.querySelector('button')).toBeNull();
  await click(choose); expect(select).toHaveBeenCalledWith('A useful complete reply');
  select.mockClear(); await click(named('Copy Friendly'));
  expect(state.copy).toHaveBeenCalledWith('A useful complete reply'); expect(select).not.toHaveBeenCalled();
  expect(state.success).toHaveBeenLastCalledWith(en.compAISuggestionsPage.text0);
});
it('reports clipboard rejection without selecting the suggestion or claiming it copied', async () => {
  state.copy.mockRejectedValue(new Error('denied')); await render(suggestions()); await click(named('Copy Friendly'));
  expect(state.error).toHaveBeenCalledWith(en.compAISuggestionsPage.copyFailed);
  expect(state.success).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
});
it('supports named generation and collapse controls without submitting a containing form', async () => {
  const submitted = vi.fn((e: React.FormEvent) => e.preventDefault());
  await render(React.createElement('form', { onSubmit: submitted }, suggestions(true)));
  await click(container.querySelector('button')!);
  await click(named(en.compAISuggestionsPage.text4));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 4, lastMessages: [] }));
  await click(named(en.compAISuggestionsPage.collapse));
  expect(container.querySelectorAll('button')).toHaveLength(1); expect(submitted).not.toHaveBeenCalled();
});
it.each(['en', 'ar'])('localizes every suggestion icon control in %s', async language => {
  state.language = language; await render(suggestions());
  for (const b of Array.from(container.querySelectorAll('button'))) {
    const name = b.getAttribute('aria-label') || b.textContent;
    expect(name).toBeTruthy(); expect(name).not.toMatch(/(?:merchantUx|compAISuggestionsPage)\./);
  }
});
it('keeps decorative preview icons out of the keyboard order, including voice playback', async () => {
  await render(React.createElement(WhatsAppPreview, { messages: [{ id: 1, sender: 'sari', content: '', type: 'voice', duration: 65, timestamp: new Date() }] }));
  expect(container.querySelectorAll('button')).toHaveLength(0);
  expect(container.querySelector('input')!.disabled).toBe(true);
  expect(container.textContent).toContain('1:05');
  expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(en.compWhatsAppPreviewPage.voicePreview);
});
it('labels actual back and send actions and sends the full message once by click', async () => {
  await render(React.createElement(WhatsAppPreview, { messages: [], onBack: back, onSendMessage: send }));
  await click(named(en.common.back)); expect(back).toHaveBeenCalledOnce();
  await fill('  Complete reply  '); await click(named(merchantEn.actions.sendMessage));
  expect(send).toHaveBeenCalledExactlyOnceWith('Complete reply'); expect(container.querySelector('input')!.value).toBe('');
});
it('does not send during IME composition and handles Enter without submitting the parent form', async () => {
  await render(React.createElement(WhatsAppPreview, { messages: [], onSendMessage: send }));
  await fill('Message'); const input = container.querySelector('input')!;
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })); });
  expect(send).not.toHaveBeenCalled();
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => { input.dispatchEvent(event); });
  expect(send).toHaveBeenCalledExactlyOnceWith('Message'); expect(event.defaultPrevented).toBe(true);
});
it.each(['en', 'ar'])('uses translated defaults, message labels, and explicit unavailable dates in %s', async language => {
  state.language = language; const copy = language === 'ar' ? ar.compWhatsAppPreviewPage : en.compWhatsAppPreviewPage;
  await render(React.createElement(WhatsAppPreview, { messages: [{ id: 1, sender: 'sari', type: 'file', content: '', timestamp: 'invalid' }], showTypingIndicator: true }));
  for (const text of [copy.text0, copy.text1, copy.file, copy.dateUnavailable]) expect(container.textContent).toContain(text);
  expect(container.querySelector('input')!.getAttribute('aria-label')).toBe(copy.text3);
  expect(container.textContent).not.toContain('Invalid Date');
});
