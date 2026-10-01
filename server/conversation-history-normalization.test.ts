import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { normalizeHistoryChats, normalizeHistoryMessages } from './whatsapp/history-normalization';
import { historyMessageId, inboundEventKey, inboundMessageId } from './messaging/message-identity';
import { greenHistoryCall } from './whatsapp/tenant-workspace';
const chatId = '99900000001@c.us';
const credentials = { instanceId: '7105123456', token: 'test-only-secret', apiUrl: 'https://7105.api.greenapi.com' };
const sample = { idMessage: 'ABC', chatId, type: 'incoming', typeMessage: 'textMessage', textMessage: 'رسالة كاملة', timestamp: 1700000000 };
const fetcher = vi.fn();
const parse = (patch: Record<string, unknown> = {}) => normalizeHistoryMessages([{ ...sample, ...patch }], chatId);
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetcher); fetcher.mockResolvedValue({ ok: true, json: async () => [] }); });
afterEach(() => vi.unstubAllGlobals());
it('uses GET for chats and POST with exactly 50 for history, protected redirects and timeout', async () => {
  await greenHistoryCall(credentials); await greenHistoryCall(credentials, chatId);
  expect(fetcher.mock.calls[0][0]).toContain('/getChats/'); expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', redirect: 'error', signal: expect.any(AbortSignal), body: JSON.stringify({ chatId, count: 50 }) });
});
it.each(['http://api.green-api.com', 'https://127.0.0.1', 'https://api.green-api.com.evil.test', 'https://user:pass@api.green-api.com', 'https://api.green-api.com:8443', 'https://api.green-api.com/path', 'https://api.green-api.com/?secret=x'])('rejects unsafe history origin %s', async apiUrl => {
  await expect(greenHistoryCall({ ...credentials, apiUrl }, chatId)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(fetcher).not.toHaveBeenCalled();
});
it.each(['123@g.us', '../getSettings', '', 'test@c.us'])('rejects invalid personal chat %s before fetch', async id => {
  await expect(greenHistoryCall(credentials, id)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it.each([null, {}, '[]', { error: 'test-only-secret' }])('rejects non-array provider response %j', async body => {
  fetcher.mockResolvedValue({ ok: true, json: async () => body }); await expect(greenHistoryCall(credentials)).rejects.toMatchObject({ message: expect.not.stringContaining('secret') });
});
it('redacts network and HTTP failures', async () => {
  fetcher.mockRejectedValueOnce(new Error('test-only-secret')).mockResolvedValueOnce({ ok: false });
  for (let i = 0; i < 2; i++) await expect(greenHistoryCall(credentials)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: expect.not.stringContaining('test-only-secret') });
});
it('deduplicates personal chats and counts malformed entries while excluding groups', () => {
  expect(normalizeHistoryChats([{ id: chatId, name: 'عميل' }, { id: chatId, contact: { name: 'العميل' } }, { id: '123@g.us' }, null, { id: 'bad' }])).toEqual({ chats: [{ id: chatId, phone: '99900000001', name: 'العميل' }], rejected: 2 });
});
it('keeps canonical incoming identity byte-for-byte compatible and isolates accounts, tenants and directions', () => {
  const old = createHash('sha256').update(JSON.stringify([7, 'green_api', '12345', 'ABC'])).digest('hex');
  expect(inboundEventKey(7, 'green_api', '12345', 'ABC')).toBe(old);
  expect(historyMessageId(7, '12345', 'ABC', 'incoming')).toBe(inboundMessageId(old));
  expect(new Set([historyMessageId(7, '12345', 'ABC', 'incoming'), historyMessageId(8, '12345', 'ABC', 'incoming'), historyMessageId(7, '12346', 'ABC', 'incoming'), historyMessageId(7, '12345', 'ABC', 'outgoing')]).size).toBe(4);
});
it('preserves text longer than the former 5000-character truncation and its actual UTC date', () => {
  const text = 'م'.repeat(9000); expect(parse({ textMessage: text })).toMatchObject({ rejected: 0, messages: [{ content: text, senderType: 'customer', createdAt: '2023-11-14 22:13:20' }] });
});
it.each([0, -1, 2147483648, NaN, '1700000000', undefined, Math.floor(Date.now() / 1000) + 600])('rejects invalid/future timestamp %s', timestamp => expect(parse({ timestamp })).toEqual({ messages: [], rejected: 1 }));
it.each([{ chatId: '99900000002@c.us' }, { type: 'invented' }, { idMessage: '' }, { isDeleted: true }, { deletedMessageId: 'original' }, { editedMessageId: 'original' }, { typeMessage: 'invented' }, { textMessage: ' ' }, { textMessage: 'م'.repeat(33000) }])('rejects unsupported evidence %j', patch => expect(parse(patch)).toEqual({ messages: [], rejected: 1 }));
it.each(['pending', 'failed', 'yellowCard', undefined])('does not claim uncertain outgoing %s was sent', statusMessage => expect(parse({ type: 'outgoing', statusMessage })).toEqual({ messages: [], rejected: 1 }));
it.each(['sent', 'delivered', 'read'])('keeps accepted outgoing %s with unknown author rather than inventing an AI/staff role', statusMessage => expect(parse({ type: 'outgoing', statusMessage, sendByApi: true }).messages[0]).toMatchObject({ senderType: 'unknown', direction: 'outgoing' }));
it.each(['imageMessage', 'audioMessage', 'documentMessage', 'videoMessage', 'stickerMessage'])('preserves %s attachment and caption', typeMessage => expect(parse({ typeMessage, caption: 'التفاصيل', downloadUrl: 'https://files.green-api.com/example.jpg' })).toMatchObject({ rejected: 0, messages: [{ content: 'التفاصيل', mediaUrl: 'https://files.green-api.com/example.jpg' }] }));
it.each(['javascript:alert(1)', 'http://files.green-api.com/x', 'https://localhost/x', 'https://files.green-api.com.evil.test/x', 'https://user:pass@files.green-api.com/x', 'https://files.green-api.com:8443/x'])('rejects unsafe attachment %s', downloadUrl => expect(parse({ typeMessage: 'imageMessage', downloadUrl })).toEqual({ rejected: 1, messages: [] }));
it('collapses identical duplicates and rejects conflicting copies without favoring an arbitrary response order', () => {
  expect(normalizeHistoryMessages([sample, sample], chatId).messages).toHaveLength(1);
  for (const rows of [[sample, { ...sample, textMessage: 'different' }], [{ ...sample, textMessage: 'different' }, sample]]) expect(normalizeHistoryMessages(rows, chatId)).toEqual({ rejected: 1, messages: [] });
});
it('sorts messages chronologically and handles extended text without inventing dates', () => {
  const next = { ...sample, idMessage: 'DEF', timestamp: sample.timestamp + 1, typeMessage: 'extendedTextMessage', textMessage: undefined, extendedTextMessage: { text: 'تفاصيل' } };
  expect(normalizeHistoryMessages([next, sample], chatId).messages.map(m => [m.providerId, m.content])).toEqual([['ABC', 'رسالة كاملة'], ['DEF', 'تفاصيل']]);
});
