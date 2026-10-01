// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { conversationPreviewAr, conversationPreviewEn } from '../client/src/locales/conversation-preview';
import { conversationMessageAr, conversationMessageEn } from '../client/src/locales/conversation-message';
const m = vi.hoisted(() => ({ language: 'en' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: m.language }, t: (key: string) => {
  const texts = key.includes('conversationPreview.') ? (m.language === 'ar' ? conversationPreviewAr : conversationPreviewEn) : (m.language === 'ar' ? conversationMessageAr : conversationMessageEn);
  return (texts as Record<string, string>)[key.split('.').at(-1)!] || key;
} }) }));
import { ConversationPreviewMode, InlineConversationPreview } from '../client/src/components/ConversationPreviewMode';
import { ConversationMessage } from '../client/src/components/ConversationMessage';
let root: Root, container: HTMLDivElement;
const message = (patch: Record<string, unknown> = {}) => ({ id: 123, direction: 'outgoing', senderType: 'merchant', messageType: 'text', content: 'Full message <script>literal</script>', createdAt: '2026-10-01 12:30:00', ...patch });
const props = () => ({ actorUserId: 7, merchantId: 20, conversationId: 51, messages: [message()], customerName: 'Customer 51', customerPhone: 'test-only-51', timezone: 'Asia/Riyadh' });
const render = (patch: Record<string, unknown> = {}) => act(async () => root.render(React.createElement(ConversationPreviewMode, { ...props(), ...patch })));
const open = () => act(async () => container.querySelector('button')!.click());
const button = (name: string) => Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === name)!;
const click = (name: string) => act(async () => button(name).click());
beforeEach(() => { m.language = 'en'; vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each(['en', 'ar'])('explains the loaded window and renders a labelled read-only preview in %s', async language => {
  m.language = language; await render(); expect(document.body.querySelector('article')).toBeNull(); await open();
  const dictionary = language === 'ar' ? conversationPreviewAr : conversationPreviewEn;
  const dialog = document.body.querySelector('[role=dialog]')!;
  expect(dialog.getAttribute('aria-describedby')).toBeTruthy(); expect(dialog.textContent).toContain(dictionary.description);
  expect(dialog.textContent).not.toMatch(/merchantUx\.|Invalid Date/); expect(dialog.querySelector('script')).toBeNull();
  expect(dialog.querySelector('[role=region]')?.getAttribute('aria-label')).toBe(dictionary.messages);
  expect(dialog.querySelector('input, textarea')).toBeNull();
});
it.each([['merchant','employee'],['assistant','assistant'],['unknown','unknown'],[null,'unknown']])('retains the actual author %s without invented receipts',async(senderType,sender)=>{
  await render({messages:[message({senderType})]}); await open(); const article=document.body.querySelector('article')!;
  expect(article.getAttribute('data-message-sender')).toBe(sender); expect(article.textContent).toContain('Full message <script>literal</script>');
  expect(article.querySelector('.lucide-check-check, .lucide-check')).toBeNull(); expect(article.textContent).not.toMatch(/read|delivered|online/i);
  expect(article.querySelector('time')?.textContent).toContain('15:30');
});
it.each(['voice','image','document'])('retains %s attachment sources and captions',async messageType=>{
  await render({messages:[message({messageType,mediaUrl:'/uploads/test-only-preview',voiceUrl:null,imageUrl:null})]}); await open(); const article=document.body.querySelector('article')!;
  const element=article.querySelector(messageType==='voice'?'audio':messageType==='image'?'img':'a')!;
  expect(element.getAttribute(messageType==='document'?'href':'src')).toBe('/uploads/test-only-preview'); expect(article.textContent).toContain('Full message');
});
it('does not reload media, reset scroll or change document theme when preview options change',async()=>{
  await render({messages:[message({messageType:'voice',voiceUrl:'/uploads/test-only-preview.wav'})]}); await open();
  const audio=document.body.querySelector('audio');const region=document.body.querySelector('[data-preview-messages]')!;region.scrollTop=40;
  const theme=document.documentElement.className;await click(conversationPreviewEn.desktop);await click(conversationPreviewEn.dark);
  expect(document.body.querySelector('audio')).toBe(audio);expect(document.body.querySelector('[data-preview-messages]')).toBe(region);expect(region.scrollTop).toBe(40);expect(document.documentElement.className).toBe(theme);
  expect(button(conversationPreviewEn.desktop).getAttribute('aria-pressed')).toBe('true');expect(button(conversationPreviewEn.mobile).getAttribute('aria-pressed')).toBe('false');expect(button(conversationPreviewEn.dark).getAttribute('aria-pressed')).toBe('true');
});
it('closes nested image preview before the conversation preview and restores focus',async()=>{
  await render({messages:[message({messageType:'image',imageUrl:'/uploads/test-only-preview.png'})]});await open();const trigger=button(conversationMessageEn.openImage);await act(async()=>trigger.click());expect(document.body.querySelectorAll('[role=dialog]').length).toBe(2);
  await click(conversationMessageEn.close);expect(document.body.querySelectorAll('[role=dialog]').length).toBe(1);await vi.waitFor(()=>expect(document.activeElement).toBe(trigger));
  const outerTrigger=container.querySelector('button');await click(conversationPreviewEn.close);expect(document.body.querySelector('[role=dialog]')).toBeNull();await vi.waitFor(()=>expect(document.activeElement).toBe(outerTrigger));
});
it.each(['actorUserId','merchantId','conversationId'])('closes old media and resets preview when %s changes',async field=>{
  await render();await open();await click(conversationPreviewEn.dark);await render({[field]:99,messages:[message({content:'New scope'})]});expect(document.body.querySelector('[role=dialog]')).toBeNull();await open();expect(document.body.textContent).not.toContain('Full message');expect(button(conversationPreviewEn.dark).getAttribute('aria-pressed')).toBe('false');
});
it('never duplicates live message anchors across embedded and dialog previews',async()=>{
  const shared=props();await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(ConversationMessage,{message:message(),timezone:shared.timezone}),React.createElement(InlineConversationPreview,shared),React.createElement(ConversationPreviewMode,shared))));
  await act(async()=>container.querySelector<HTMLButtonElement>('[data-conversation-preview-trigger]')!.click());const ids=Array.from(document.body.querySelectorAll('article')).map(e=>e.id);expect(ids.length).toBe(3);expect(new Set(ids).size).toBe(3);expect(ids).toContain('conversation-message-123');
});
it('shows an empty window instead of implying a complete or delivered history',async()=>{await render({messages:[]});await open();expect(document.body.textContent).toContain(conversationPreviewEn.empty);expect(document.body.querySelector('article')).toBeNull();});
