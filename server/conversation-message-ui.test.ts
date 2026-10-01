// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { conversationMessageAr, conversationMessageEn } from '../client/src/locales/conversation-message';
const m = vi.hoisted(() => ({ language: 'en' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: m.language }, t: (key: string) => (m.language === 'ar' ? conversationMessageAr : conversationMessageEn)[key.split('.').at(-1) as keyof typeof conversationMessageAr] || key }) }));
import { ConversationMessage } from '../client/src/components/ConversationMessage';
import { conversationMediaUrl, conversationTimestamp } from '../client/src/lib/conversation-message';
let root: Root, container: HTMLDivElement;
const sample = () => ({ id: 123, direction: 'incoming', senderType: 'customer', messageType: 'text', content: 'نص عميل <script>alert(1)</script>', createdAt: '2026-10-01 12:30:00', voiceUrl: null, imageUrl: null, mediaUrl: null });
const render = async (patch: Record<string, unknown> = {}, timezone = 'Asia/Riyadh') => act(async () => root.render(React.createElement(ConversationMessage, { message: { ...sample(), ...patch } as any, timezone })));
beforeEach(() => { m.language = 'en'; vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each(['en', 'ar'])('renders localized author, full text and accessible timestamp in %s', async language => {
  m.language = language; await render(); expect(container.textContent).not.toMatch(/merchantUx\.|Invalid Date/); expect(container.querySelector('script')).toBeNull(); expect(container.textContent).toContain('<script>alert(1)</script>'); expect(container.querySelector('time')?.dateTime).toBe('2026-10-01T12:30:00.000Z'); expect(container.querySelector('article')?.getAttribute('aria-label')).toBe(language === 'en' ? 'Customer' : 'العميل'); expect(container.querySelector('article')?.dir).toBe(language === 'en' ? 'ltr' : 'rtl');
});
it.each([['merchant', 'employee'], ['assistant', 'assistant'], ['unknown', 'unknown'], [undefined, 'unknown'], ['invented', 'unknown']])('does not invent the identity of outgoing %s', async (senderType, expected) => {
  await render({ direction: 'outgoing', senderType }); expect(container.querySelector('article')?.getAttribute('data-message-sender')).toBe(expected);
});
it.each(['javascript:alert(1)', 'data:image/png;base64,abc', 'http://example.test/a.png', '//example.test/a.png', 'https://user:secret@example.test/file', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://host.internal/a', '/api/delete?id=1', '/uploads/../api/action', '/uploads/%2e%2e/action', '/uploads/\\evil', 'https://example.test/a\nfile'])('rejects unsafe attachment %s without creating a resource/link', async url => {
  expect(conversationMediaUrl(url)).toBeNull(); await render({ messageType: 'image', imageUrl: url }); expect(container.querySelector('[src], a')).toBeNull(); expect(container.querySelector('[data-media-unavailable]')).toBeTruthy();
});
it.each(['https://files.green-api.com/a.png', 'https://cdn.example.test/a?signature=value', '/uploads/local-fixture.png'])('preserves a usable attachment %s', url => expect(conversationMediaUrl(url)).toBe(url));
it.each(['image', 'voice', 'document'])('explains a missing %s attachment while preserving its caption', async messageType => {
  await render({ messageType, content: 'تفاصيل لا تضيع' }); expect(container.querySelector('[data-media-unavailable]')).toBeTruthy(); expect(container.textContent).toContain('تفاصيل لا تضيع');
});
it('opens documents safely in a new tab, retains the full filename and does not infer images from extensions', async () => {
  const text = '[ملف: ' + 'عنوان-طويل'.repeat(80) + '.jpg]'; await render({ messageType: 'document', mediaUrl: 'https://cdn.example.test/file.jpg', content: text });
  const a = container.querySelector('a')!; expect(a.target).toBe('_blank'); expect(a.rel).toBe('noopener noreferrer'); expect(a.getAttribute('referrerpolicy')).toBe('no-referrer'); expect(a.getAttribute('aria-label')).toBe(conversationMessageEn.openDocument); expect(container.textContent).toContain(text); expect(container.querySelector('img')).toBeNull();
});
it('supports native voice controls without autoplay or eager downloads', async () => {
  await render({ messageType: 'voice', voiceUrl: 'https://cdn.example.test/voice.ogg' }); const audio = container.querySelector('audio')!;
  expect(audio.controls).toBe(true); expect(audio.preload).toBe('none'); expect(audio.autoplay).toBe(false); expect(audio.getAttribute('aria-label')).toBe(conversationMessageEn.voicePlayer);
});
it.each(['voice', 'image'])('shows %s load failure and permits explicit retry', async messageType => {
  await render({ messageType, voiceUrl: 'https://cdn.example.test/fixture', imageUrl: messageType === 'image' ? 'https://cdn.example.test/fixture' : null });
  await act(async () => container.querySelector(messageType === 'voice' ? 'audio' : 'img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('[data-media-failed]')).toBeTruthy(); expect(container.textContent).toContain(conversationMessageEn.failed);
  await act(async () => (container.querySelector('button') as HTMLButtonElement).click()); expect(container.querySelector(messageType === 'voice' ? 'audio' : 'img')).toBeTruthy(); expect(container.querySelector('[data-media-failed]')).toBeNull();
});
it('retains the legacy image-in-voiceUrl fallback without misclassifying audio', async () => {
  await render({ messageType: 'image', voiceUrl: 'https://cdn.example.test/legacy.png' }); expect(container.querySelector('img')?.src).toBe('https://cdn.example.test/legacy.png'); expect(container.querySelector('audio')).toBeNull();
});
it('keeps preview failure recoverable and returns keyboard focus on close', async () => {
  await render({ messageType: 'image', imageUrl: 'https://cdn.example.test/image.png' }); const trigger = container.querySelector('button')!; trigger.focus(); await act(async () => trigger.click()); expect(document.body.querySelector('[role=dialog]')).toBeTruthy();
  await act(async () => document.body.querySelector('[data-preview-image]')!.dispatchEvent(new Event('error'))); expect(document.body.querySelector('[data-preview-failed]')).toBeTruthy();
  const close = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === conversationMessageEn.close)!; await act(async () => close.click()); expect(document.body.querySelector('[role=dialog]')).toBeNull(); await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
it('drops the previous preview and failure state when the attachment changes', async () => {
  await render({ messageType: 'image', imageUrl: 'https://cdn.example.test/one.png' }); await act(async () => container.querySelector('button')!.click()); await render({ id: 124, messageType: 'image', imageUrl: 'https://cdn.example.test/two.png' }); expect(document.body.querySelector('[role=dialog]')).toBeNull(); expect(container.querySelector('img')?.src).toBe('https://cdn.example.test/two.png');
});
it.each([null, '', 'not-a-date', '2026-99-99'])('shows an unavailable timestamp for %s without crashing', async createdAt => { await render({ createdAt }); expect(container.querySelector('time')).toBeNull(); expect(container.textContent).toContain(conversationMessageEn.timeUnavailable); });
it('uses the merchant zone for UTC database dates and clearly discloses invalid-zone fallback', async () => {
  expect(conversationTimestamp('2026-10-01 12:30:00', 'en', 'Asia/Riyadh')?.label).toContain('15:30');
  await render({}, 'not/a/zone'); expect(container.querySelector('time')?.textContent).toContain('12:30'); expect(container.textContent).toContain(conversationMessageEn.utcFallback);
});
