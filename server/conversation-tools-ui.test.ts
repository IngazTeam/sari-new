// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { conversationToolsAr, conversationToolsEn } from '../client/src/locales/conversation-tools';
const m = vi.hoisted(() => ({ language: 'en', seen: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: m.language }, t: (key: string) => (m.language === 'ar' ? conversationToolsAr : conversationToolsEn)[key.split('.').at(-1) as keyof typeof conversationToolsAr] || key }) }));
vi.mock('../client/src/components/ConversationHandoff', () => ({ ConversationHandoff: (props: any) => { m.seen('handoff', props); return React.createElement('input', { 'data-tool-source': 'handoff', defaultValue: 'unsaved note' }); } }));
vi.mock('../client/src/components/EscalationReconciliation', () => ({ EscalationReconciliation: (props: any) => { m.seen('escalation', props); return React.createElement('div', { 'data-tool-source': 'escalation' }, 'Escalation'); } }));
vi.mock('../client/src/components/SalesOfferReview', () => ({ SalesOfferReview: (props: any) => { m.seen('offers', props); return React.createElement('div', { 'data-tool-source': 'offers' }, 'Offers'); } }));
vi.mock('../client/src/components/StaffAttemptReview', () => ({ StaffAttemptReview: (props: any) => { m.seen('attempts', props); return React.createElement('div', { 'data-tool-source': 'attempts' }, 'Attempts'); } }));
import { ConversationTools } from '../client/src/components/ConversationTools';
let root: Root, container: HTMLDivElement;
const render = (patch: Record<string, unknown> = {}) => act(async () => root.render(React.createElement(ConversationTools, { merchantId: 20, actorUserId: 7, conversationId: 51, ...patch })));
const open = () => act(async () => container.querySelector('button')!.click());
const tab = (name: string) => act(async () => Array.from(document.body.querySelectorAll('[role=tab]')).find(e => e.textContent === name)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
beforeEach(() => { vi.resetAllMocks(); m.language = 'en'; vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each(['en', 'ar'])('does not mount management reads until opening tools in %s', async language => { m.language = language; await render(); expect(m.seen).not.toHaveBeenCalled(); await open(); expect(m.seen).toHaveBeenCalledWith('handoff', { merchantId: 20, actorUserId: 7, conversationId: 51 }); expect(new Set(m.seen.mock.calls.map(c => c[0]))).toEqual(new Set(['handoff'])); expect(document.body.textContent).not.toContain('merchantUx.'); });
it('keeps all four real tools reachable with the same verified context', async () => {
  await render(); await open(); for (const name of [conversationToolsEn.escalation, conversationToolsEn.offers, conversationToolsEn.attempts]) await tab(name);
  expect(new Set(m.seen.mock.calls.map(c => c[0]))).toEqual(new Set(['handoff', 'escalation', 'offers', 'attempts']));
  for (const [tool, props] of m.seen.mock.calls) { expect(props).toMatchObject({ merchantId: 20, actorUserId: 7, conversationId: 51 }); if (tool === 'offers' || tool === 'attempts') expect(props.defaultOpen).toBe(true); }
});
it('retains an unsaved field when switching tabs within the open dialog', async () => {
  await render(); await open(); const field = document.body.querySelector('[data-tool-source=handoff]') as HTMLInputElement; field.value = 'retained note'; await tab(conversationToolsEn.offers); await tab(conversationToolsEn.handoff); expect(document.body.querySelector('[data-tool-source=handoff]')).toBe(field); expect(field.value).toBe('retained note');
});
it('unmounts tool reads when closing and restores focus to the toolbar', async () => {
  await render(); await open(); const trigger = container.querySelector('button'); await act(async () => Array.from(document.body.querySelectorAll('button')).find(e => e.textContent === conversationToolsEn.close)!.click()); expect(document.body.querySelector('[data-tool-source]')).toBeNull(); await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
it.each(['offers','escalation'])('retains unsaved %s notes across closing, but clears them on conversation change',async tool=>{
 await render();await open();await tab(tool==='offers'?conversationToolsEn.offers:conversationToolsEn.escalation);
 const current=()=>m.seen.mock.calls.filter(c=>c[0]===tool).at(-1)![1];await act(async()=>current().onDraftNotesChange({'12':'unsaved review note'}));
 await act(async()=>Array.from(document.body.querySelectorAll('button')).find(e=>e.textContent===conversationToolsEn.close)!.click());await open();await tab(tool==='offers'?conversationToolsEn.offers:conversationToolsEn.escalation);expect(current().draftNotes).toEqual({'12':'unsaved review note'});
 await render({conversationId:52});await open();await tab(tool==='offers'?conversationToolsEn.offers:conversationToolsEn.escalation);expect(current().draftNotes).toEqual({});
});
it.each(['merchantId', 'actorUserId', 'conversationId'])('closes stale tools and rebinds after %s changes', async field => {
  await render(); await open(); await tab(conversationToolsEn.offers); await render({ [field]: 99 }); expect(document.body.querySelector('[role=dialog]')).toBeNull(); m.seen.mockClear(); await open(); expect(m.seen).toHaveBeenCalledWith('handoff', { merchantId: 20, actorUserId: 7, conversationId: 51, [field]: 99 });
});
