import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ history: vi.fn(), workspace: vi.fn() }));
vi.mock('./whatsapp/tenant-workspace', () => ({ greenHistoryCall: provider.history, greenWorkspaceCall: provider.workspace }));
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, createDisposableTrialSubscription, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { importConversationHistory } from './conversation-import';
import { historyMessageId } from './messaging/message-identity';
import { enqueueInbound } from './messaging/inbound-jobs';
import { manualMessageExternalId } from './messaging/manual-message-identity';
import { createMessage, DuplicateMessageError } from './db';
describe.skipIf(!process.env.DATABASE_URL)('history import with real local MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, instanceId: number, account: string, subscriptionId: number;
  const phone = '99900000001', chatId = `${phone}@c.us`, ownPhone = '99900000009';
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const msg = (idMessage = randomUUID(), patch: Record<string, unknown> = {}) => ({ idMessage, chatId, type: 'incoming', typeMessage: 'textMessage', textMessage: 'سجل تجريبي كامل', timestamp: 1700000000, ...patch });
  const stored = () => q('SELECT msg.*, c.customerPhone, c.merchantId FROM messages msg JOIN conversations c ON c.id=msg.conversationId WHERE c.merchantId=? ORDER BY msg.id', [owner.merchantId]);
  const conversations = () => q('SELECT * FROM conversations WHERE merchantId=?', [owner.merchantId]);
  const setupHistory = (history: unknown[]) => provider.history.mockImplementation(async (_: unknown, id?: string) => id ? history : [{ id: chatId, name: 'عميل تجريبي' }]);
  beforeEach(async () => {
    vi.resetAllMocks(); owner = await createDisposableMerchant('history-import'); other = await createDisposableMerchant('history-other');
    subscriptionId = await createDisposableTrialSubscription(owner.merchantId);
    await q("UPDATE merchants SET subscription_status='trial', max_customers_allowed=100 WHERE id=?", [owner.merchantId]);
    account = `7999${owner.merchantId}`;
    instanceId = Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary,phone_number) VALUES (?,?,'test-only-secret','green_api','active',1,?)", [owner.merchantId, account, ownPhone])).insertId);
    provider.workspace.mockImplementation(async (_: unknown, method: string) => method === 'getStateInstance' ? { stateInstance: 'authorized' } : { wid: `${ownPhone}@c.us` });
    setupHistory([msg()]);
  });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
  it('imports complete text with UTC timestamp and customer role, preserves media, then safely retries without duplicates', async () => {
    const first = msg(), image = msg(randomUUID(), { typeMessage: 'imageMessage', caption: 'الصورة', downloadUrl: 'https://files.green-api.com/test.jpg', timestamp: 1700000001 });
    first.textMessage = 'م'.repeat(9000); setupHistory([image, first]);
    expect(await importConversationHistory(owner.merchantId)).toEqual({ success: true, chatsImported: 1, messagesImported: 2, totalChats: 1, errors: undefined });
    const rows = await stored(); expect(rows[0]).toMatchObject({ content: first.textMessage, sender_type: 'customer', isProcessed: 1, externalId: historyMessageId(owner.merchantId, account, first.idMessage, 'incoming') });
    expect(new Date(rows[0].createdAt).toISOString()).toBe('2023-11-14T22:13:20.000Z'); expect(rows[1].imageUrl).toBe(image.downloadUrl);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: undefined }); expect(await stored()).toHaveLength(2);
  });
  it('does not hide another tenant message with the same raw provider ID', async () => {
    const incoming = msg(); setupHistory([incoming]); const c = await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)", [other.merchantId, phone]);
    await q("INSERT INTO messages (conversationId,direction,content,externalId,isProcessed) VALUES (?,'incoming','other tenant private',?,1)", [c.insertId, incoming.idMessage]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 1 }); expect((await stored())[0].content).toBe(incoming.textMessage);
    expect((await q('SELECT content FROM messages WHERE conversationId=?', [c.insertId]))[0].content).toBe('other tenant private');
  });
  it.each(['legacy', 'canonical'])('deduplicates a processed %s inbound receipt', async kind => {
    const incoming = msg(); setupHistory([incoming]); const c = await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const externalId = kind === 'legacy' ? incoming.idMessage : historyMessageId(owner.merchantId, account, incoming.idMessage, 'incoming');
    await q("INSERT INTO messages (conversationId,direction,content,externalId,isProcessed) VALUES (?,'incoming','existing',?,1)", [c.insertId, externalId]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: undefined }); expect(await stored()).toHaveLength(1);
  });
  it('does not overwrite names, handoff state or newer activity when importing older history', async () => {
    await q("INSERT INTO conversations (merchantId,customerPhone,customerName,lastMessageAt,human_takeover,handoff_version) VALUES (?,?,'اسم عدّله التاجر','2026-09-01 12:00:00',1,9)", [owner.merchantId, phone]);
    await importConversationHistory(owner.merchantId); const c = (await conversations())[0]; expect(c.customerName).toBe('اسم عدّله التاجر'); expect(c.human_takeover).toBe(1); expect(c.handoff_version).toBe(9); expect(new Date(c.lastMessageAt).toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });
  it('reports invalid records as partial and persists only verifiable messages', async () => {
    setupHistory([msg(), msg(randomUUID(), { timestamp: undefined }), msg(randomUUID(), { type: 'outgoing', statusMessage: 'failed' })]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 1, errors: [expect.any(String)] }); expect(await stored()).toHaveLength(1);
  });
  it.each(['pending', 'review'])('does not consume an inbound job in %s', async status => {
    const incoming = msg(); setupHistory([incoming]); const job = await enqueueInbound({ source: 'webhook', expectedMerchantId: owner.merchantId, payload: { typeWebhook: 'incomingMessageReceived', instanceData: { idInstance: account }, idMessage: incoming.idMessage, timestamp: incoming.timestamp, senderData: { chatId }, messageData: { typeMessage: 'textMessage' } } });
    await q('UPDATE whatsapp_inbound_jobs SET status=? WHERE id=?', [status, job.id]); expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: [expect.any(String)] }); expect(await stored()).toHaveLength(0); expect(await conversations()).toHaveLength(0);
  });
  it('rolls back the entire chat and its counters on insert failure without touching the conflicting tenant', async () => {
    const first = msg(), second = msg(randomUUID(), { timestamp: 1700000001 }); setupHistory([first, second]);
    const c = await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [other.merchantId, phone]);
    await q("INSERT INTO messages (conversationId,direction,content,externalId,isProcessed) VALUES (?,'incoming','unchanged',?,1)", [c.insertId, historyMessageId(owner.merchantId, account, second.idMessage, 'incoming')]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: [expect.any(String)] }); expect(await conversations()).toHaveLength(0); expect(await stored()).toHaveLength(0);
    expect((await q('SELECT content FROM messages WHERE conversationId=?', [c.insertId]))[0].content).toBe('unchanged');
  });
  it.each(['token', 'phone', 'suspended'])('rejects changed %s after fetching history, before any write', async change => {
    provider.history.mockImplementation(async (_: unknown, id?: string) => {
      if (!id) return [{ id: chatId }];
      if (change === 'suspended') await q("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]);
      else await q(`UPDATE whatsapp_instances SET ${change === 'token' ? 'token' : 'phone_number'}=? WHERE id=?`, [change === 'token' ? 'replacement-secret' : '99900000008', instanceId]);
      return [msg()];
    });
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 0, errors: [expect.any(String)] }); expect(await conversations()).toHaveLength(0);
  });
  it.each(['missing', 'meta', 'phone', 'unauthorized'])('rejects %s primary/session before history access', async kind => {
    if (kind === 'missing') await q('UPDATE whatsapp_instances SET is_primary=0 WHERE id=?', [instanceId]);
    if (kind === 'meta') await q("UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?", [instanceId]);
    if (kind === 'phone') provider.workspace.mockImplementation(async (_: unknown, m: string) => m === 'getStateInstance' ? { stateInstance: 'authorized' } : { wid: '99900000008@c.us' });
    if (kind === 'unauthorized') provider.workspace.mockResolvedValue({ stateInstance: 'notAuthorized' });
    await expect(importConversationHistory(owner.merchantId)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(provider.history).not.toHaveBeenCalled(); expect(await conversations()).toHaveLength(0);
  });
  it.each(['expired', 'quota', 'missing'])('does not create customers with %s entitlement', async kind => {
    if (kind === 'expired') await q('UPDATE merchant_subscriptions SET end_date=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?', [subscriptionId]);
    if (kind === 'quota') await q('UPDATE merchants SET max_customers_allowed=0 WHERE id=?', [owner.merchantId]);
    if (kind === 'missing') await q('UPDATE merchants SET current_subscription_id=NULL WHERE id=?', [owner.merchantId]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: [expect.any(String)] }); expect(await conversations()).toHaveLength(0);
  });
  it('counts active Zid customers toward capacity', async () => {
    await q('UPDATE merchants SET max_customers_allowed=1 WHERE id=?', [owner.merchantId]);
    await q("INSERT INTO zid_customers (merchant_id,zid_customer_id,phone,last_synced_at) VALUES (?,'test-customer','99900000002',UTC_TIMESTAMP())", [owner.merchantId]);
    expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 0, errors: [expect.any(String)] }); expect(await conversations()).toHaveLength(0);
  });
  it('does not create phantom conversations for empty history or a failed provider response', async () => {
    setupHistory([]); expect(await importConversationHistory(owner.merchantId)).toMatchObject({ chatsImported: 0, messagesImported: 0, errors: undefined });
    provider.history.mockImplementation(async (_: unknown, id?: string) => { if (id) throw new Error('private-token and phone'); return [{ id: chatId }]; });
    const result = await importConversationHistory(owner.merchantId); expect(result.errors).toHaveLength(1); expect(JSON.stringify(result)).not.toMatch(/private-token|99900000001/); expect(await conversations()).toHaveLength(0);
  });
  it('rejects simultaneous imports and releases the lock for a safe retry', async () => {
    let release!: () => void, entered!: () => void; const gate = new Promise<void>(r => release = r), started = new Promise<void>(r => entered = r);
    provider.history.mockImplementation(async (_: unknown, id?: string) => { if (!id) { entered(); await gate; return [{ id: chatId }]; } return [msg('STABLE')]; });
    const first = importConversationHistory(owner.merchantId); await started;
    try { await expect(importConversationHistory(owner.merchantId)).rejects.toMatchObject({ code: 'CONFLICT' }); } finally { release(); }
    expect(await first).toMatchObject({ messagesImported: 1 }); expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 0 });
  });
  it('returns only committed counts when a later chat fails', async () => {
    provider.history.mockImplementation(async (_: unknown, id?: string) => { if (!id) return [{ id: chatId }, { id: '99900000002@c.us' }]; if (id === chatId) return [msg()]; throw new Error('sensitive provider URL'); });
    expect(await importConversationHistory(owner.merchantId)).toEqual({ success: true, chatsImported: 1, messagesImported: 1, totalChats: 1, errors: [expect.any(String)] }); expect(await stored()).toHaveLength(1);
  });
  it.each(['history-first', 'webhook-first'])('shares outgoing identity in either arrival order: %s', async order => {
    const outgoing = msg(randomUUID(), { type: 'outgoing', statusMessage: 'sent' }); setupHistory([outgoing]);
    const c = await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const record = async () => { const externalId = await manualMessageExternalId(owner.merchantId, c.insertId, account, outgoing.idMessage); if (externalId) return createMessage({ conversationId: c.insertId, direction: 'outgoing', senderType: 'merchant', messageType: 'text', content: outgoing.textMessage, externalId, isProcessed: 1 }); };
    if (order === 'history-first') { await importConversationHistory(owner.merchantId); await expect(record()).rejects.toBeInstanceOf(DuplicateMessageError); }
    else { await record(); expect(await importConversationHistory(owner.merchantId)).toMatchObject({ messagesImported: 0, errors: undefined }); }
    expect(await stored()).toHaveLength(1);
  });
  it('retains legacy manual receipts only inside their verified tenant and customer', async () => {
    const id = randomUUID(); const c = await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const otherC = await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [other.merchantId, phone]);
    await q("INSERT INTO messages (conversationId,direction,content,externalId,isProcessed) VALUES (?,'outgoing','legacy',?,1)", [c.insertId, id]);
    expect(await manualMessageExternalId(owner.merchantId, c.insertId, account, id)).toBeNull();
    expect(await manualMessageExternalId(other.merchantId, otherC.insertId, account, id)).toBe(historyMessageId(other.merchantId, account, id, 'outgoing'));
    await expect(manualMessageExternalId(other.merchantId, c.insertId, account, id)).rejects.toThrow('unavailable');
  });
});
