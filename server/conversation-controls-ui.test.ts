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
  generateSuggestions: { useMutation: () => ({ mutateAsync: state.mutate, isPending: false }) },
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
  select.mockReturnValue(true);
  state.mutate.mockResolvedValue({context:{merchantId:20,actorUserId:7,conversationId:4,lastMessageId:81,version:0,evidenceHash:'a'.repeat(64)},suggestions:['friendly','professional','brief','detailed'].map((type,i)=>({id:i+1,type,label:type,text:i===0?'A useful complete reply':`Reply ${i}`}))});
  state.language = 'en';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const suggestions = (compact = false, patch:Record<string,unknown> = {}) => React.createElement(AISuggestions, { merchantId:20,actorUserId:7,conversationId:4,customerPhone:'local',version:0,draftText:'',messages:[{id:81,content:'Question',direction:'incoming'}],onSelectSuggestion: select, compact,...patch });
const generate = () => click(container.querySelector('[data-ai-generate]')!);
it('uses separate native selection and copy buttons without nested interactive targets', async () => {
  await render(suggestions());
  await generate();
  const choose = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('A useful complete reply'))!;
  expect(choose.type).toBe('button'); expect(choose.tabIndex).toBe(0);
  expect(choose.querySelector('button')).toBeNull();
  await click(choose); expect(select).toHaveBeenCalledWith('A useful complete reply','');
  select.mockClear(); await click(named('Copy Friendly'));
  expect(state.copy).toHaveBeenCalledWith('A useful complete reply'); expect(select).not.toHaveBeenCalled();
  expect(state.success).toHaveBeenLastCalledWith(en.compAISuggestionsPage.text0);
});
it('reports clipboard rejection without selecting the suggestion or claiming it copied', async () => {
  state.copy.mockRejectedValue(new Error('denied')); await render(suggestions()); await generate(); await click(named('Copy Friendly'));
  expect(state.error).toHaveBeenCalledWith(en.compAISuggestionsPage.copyFailed);
  expect(state.success).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
});
it('supports named generation and collapse controls without submitting a containing form', async () => {
  const submitted = vi.fn((e: React.FormEvent) => e.preventDefault());
  await render(React.createElement('form', { onSubmit: submitted }, suggestions(true)));
  await click(container.querySelector('button')!);
  await generate();
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 4, lastMessages: [] }));
  await click(named(en.compAISuggestionsPage.collapse));
  expect(container.querySelectorAll('button')).toHaveLength(1); expect(submitted).not.toHaveBeenCalled();
});
it.each(['en', 'ar'])('localizes every suggestion icon control in %s', async language => {
  state.language = language; await render(suggestions());
  await generate();
  for (const b of Array.from(container.querySelectorAll('button'))) {
    const name = b.getAttribute('aria-label') || b.textContent;
    expect(name).toBeTruthy(); expect(name).not.toMatch(/(?:merchantUx|compAISuggestionsPage)\./);
  }
});
it.each(['en','ar'])('shows generation failure in %s and supports retry without inserting a fallback',async language=>{
  state.language=language;state.mutate.mockRejectedValueOnce(Error('private provider details'));await render(suggestions());await generate();
  const copy=language==='ar'?merchantAr.replySuggestions:merchantEn.replySuggestions;expect(container.textContent).toContain(copy.failed);expect(container.textContent).not.toContain('private provider');expect(container.querySelector('[data-ai-select]')).toBeNull();expect(select).not.toHaveBeenCalled();
  await generate();expect(container.querySelectorAll('[data-ai-select]')).toHaveLength(4);
});
it.each(['merchantId','actorUserId','conversationId','lastMessageId','version'])('refuses suggestions with mismatched %s',async field=>{
  const value=await state.mutate();value.context[field]++;state.mutate.mockResolvedValue(value);await render(suggestions());await generate();
  expect(container.textContent).toContain(merchantEn.replySuggestions.stale);expect(container.querySelector('[data-ai-select]')).toBeNull();
});
it('rejects a malformed response and duplicate suggestion styles',async()=>{
  const value=await state.mutate();value.suggestions[1].type='friendly';state.mutate.mockResolvedValue(value);await render(suggestions());await generate();expect(container.textContent).toContain(merchantEn.replySuggestions.failed);expect(container.querySelector('[data-ai-select]')).toBeNull();
});
it.each([{merchantId:21},{actorUserId:8},{conversationId:5},{customerPhone:'changed'},{version:1},{messages:[{id:82,content:'Later',direction:'incoming'}]}])('discards late generation after context change %j',async patch=>{
  let resolve!:(v:any)=>void;const value=await state.mutate();state.mutate.mockReturnValue(new Promise(r=>resolve=r));await render(suggestions());await generate();await render(suggestions(false,patch));await act(async()=>resolve(value));expect(container.querySelector('[data-ai-select]')).toBeNull();expect(select).not.toHaveBeenCalled();expect(state.success).not.toHaveBeenCalled();
});
it('does not resurrect an old request when evidence changes and then changes back',async()=>{
  let resolve!:(v:any)=>void;const value=await state.mutate();state.mutate.mockReturnValue(new Promise(r=>resolve=r));await render(suggestions());await generate();await render(suggestions(false,{version:1}));await render(suggestions());await act(async()=>resolve(value));expect(container.querySelector('[data-ai-select]')).toBeNull();
});
it('collapsing invalidates an in-flight request and reopening starts empty',async()=>{
  let resolve!:(v:any)=>void;const value=await state.mutate();state.mutate.mockReturnValue(new Promise(r=>resolve=r));await render(suggestions(true));await click(container.querySelector('button')!);await generate();await click(named(en.compAISuggestionsPage.collapse));await act(async()=>resolve(value));await click(container.querySelector('button')!);expect(container.querySelector('[data-ai-select]')).toBeNull();
});
it('prevents repeated generation clicks and disables unavailable actions',async()=>{
  state.mutate.mockReturnValue(new Promise(()=>{}));await render(suggestions());await act(async()=>{const button=container.querySelector('[data-ai-generate]') as HTMLButtonElement;button.click();button.click();});expect(state.mutate).toHaveBeenCalledOnce();
  await render(suggestions(false,{disabled:true}));expect((container.querySelector('[data-ai-generate]') as HTMLButtonElement).disabled).toBe(true);
});
it.each(['append','replace'])('requires an explicit %s decision when a draft exists',async mode=>{
  await render(suggestions(false,{draftText:'Original exact draft'}));await generate();await click(container.querySelector('[data-ai-select="1"]')!);expect(select).not.toHaveBeenCalled();expect(container.querySelector('[data-ai-choice]')).toBeTruthy();
  await click(container.querySelector(`[data-ai-${mode}]`)!);expect(select).toHaveBeenCalledExactlyOnceWith(mode==='append'?'Original exact draft\n\nA useful complete reply':'A useful complete reply','Original exact draft');expect(container.textContent).toContain(merchantEn.replySuggestions.applied);
});
it('blocks replacement after the user edits their draft during review',async()=>{
  await render(suggestions(false,{draftText:'Original'}));await generate();await click(container.querySelector('[data-ai-select="1"]')!);await render(suggestions(false,{draftText:'Edited by user'}));await click(container.querySelector('[data-ai-replace]')!);expect(select).not.toHaveBeenCalled();expect(container.textContent).toContain(merchantEn.replySuggestions.draftChanged);
});
it('refuses append beyond the transport text limit while allowing explicit replacement',async()=>{
  await render(suggestions(false,{draftText:'x'.repeat(4090)}));await generate();await click(container.querySelector('[data-ai-select="1"]')!);expect((container.querySelector('[data-ai-append]') as HTMLButtonElement).disabled).toBe(true);expect((container.querySelector('[data-ai-replace]') as HTMLButtonElement).disabled).toBe(false);
});
it('does not claim insertion if the parent refuses the draft change',async()=>{
  select.mockReturnValue(false);await render(suggestions());await generate();await click(container.querySelector('[data-ai-select="1"]')!);expect(container.textContent).toContain(merchantEn.replySuggestions.applyFailed);expect(container.textContent).not.toContain(merchantEn.replySuggestions.applied);expect(state.success).not.toHaveBeenCalled();
});
it('clears generated suggestions when a stored message is edited',async()=>{
  await render(suggestions());await generate();await render(suggestions(false,{messages:[{id:81,content:'Edited source',direction:'incoming'}]}));expect(container.querySelector('[data-ai-select]')).toBeNull();
});
it.each(['resolve','reject'])('ignores a late clipboard %s after switching conversation',async outcome=>{
  let resolve!:()=>void,reject!:(v:any)=>void;state.copy.mockReturnValue(new Promise<void>((r,j)=>{resolve=r;reject=j;}));await render(suggestions());await generate();await click(named('Copy Friendly'));await render(suggestions(false,{conversationId:5}));await act(async()=>{if(outcome==='resolve')resolve();else reject(Error('late'));});expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
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
