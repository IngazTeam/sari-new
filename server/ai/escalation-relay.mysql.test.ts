import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), instance: vi.fn(), teach: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mock.send }) }));
vi.mock('../knowledge/merchant-teaching', () => ({ saveMerchantTeaching: mock.teach }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(), getPrimaryWhatsAppInstance: mock.instance, getWhatsAppInstanceById: mock.instance }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createSourcedEscalation, sendSourcedEscalationAlert, relayEscalationReply, quotedEscalationMessageId, merchantReplyText, hasOpenEscalation } from './escalation-relay';
import { transitionConversationOwnership } from './conversation-handoff';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { markEscalationExhausted, markEscalationNotified, resolveEscalation } from '../db/learning';

describe.skipIf(!process.env.DATABASE_URL)('sourced escalation alert and relay lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, conversationId: number, sourceId: number, escalationId: number, instanceId: number, alertId: string;
  const author = '966500000082', customer = '966500000083'; let receipt = 0;
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const incoming = async (conv = conversationId, content = 'هل يتوفر موعد مسائي؟') => Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,sender_type) VALUES (?,'incoming','text',?,'customer')", [conv, content])).insertId);
  const input = () => ({ merchantId: fixture.merchantId, instanceRecordId: instanceId, merchantPhone: author, quotedMessageId: alertId, replyText: 'الموعد المتاح مساء الخميس.' });
  const state = async () => (await query('SELECT * FROM sari_escalation_queue WHERE id=?', [escalationId]))[0];
  beforeEach(async () => {
    fixture = await createDisposableMerchant('relay');
    await query('UPDATE merchants SET phone=? WHERE id=?', [author, fixture.merchantId]);
    conversationId = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')", [fixture.merchantId, customer])).insertId);
    sourceId = await incoming();
    instanceId = Number((await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)", [fixture.merchantId, `relay-${fixture.merchantId}`])).insertId);
    mock.instance.mockReset().mockResolvedValue({ id: instanceId, merchantId: fixture.merchantId, provider: 'green_api', status: 'active', instanceId: `fixture-${instanceId}`, token: 'fixture' });
    mock.send.mockReset().mockImplementation(async () => ({ accepted: true, outcome: 'accepted', providerMessageId: `receipt-${fixture.merchantId}-${++receipt}`, status: 'sent' }));
    mock.teach.mockReset().mockResolvedValue({ accepted: true });
    escalationId = (await createSourcedEscalation({ merchantId: fixture.merchantId, conversationId, customerPhone: customer, incomingMessageId: sourceId, question: 'هل يتوفر موعد مسائي؟' }))!;
    const result = await sendSourcedEscalationAlert({ merchantId: fixture.merchantId, escalationId, instanceRecordId: instanceId, to: author, level: 0, text: 'سؤال عميل — رد بالاقتباس' });
    expect(result.accepted).toBe(true); alertId = result.providerMessageId!; mock.send.mockClear();
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([fixture.userId]); }); afterAll(closeDb);

  it('binds the reply to the quoted older alert instead of the newest customer, then records acceptance and teaching', async () => {
    const second = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000099','active')", [fixture.merchantId])).insertId);
    const otherSource = await incoming(second);
    const other = await createSourcedEscalation({ merchantId: fixture.merchantId, conversationId: second, customerPhone: '966500000099', incomingMessageId: otherSource, question: 'سؤال آخر' });
    expect(await relayEscalationReply(input())).toMatchObject({ accepted: true, customerPhone: customer });
    expect(mock.send).toHaveBeenCalledTimes(1); expect(mock.send.mock.calls[0][1]).toMatchObject({ to: customer, text: input().replyText });
    expect((await state()).status).toBe('answered'); expect((await query('SELECT status FROM sari_escalation_queue WHERE id=?', [other]))[0].status).toBe('pending');
    const [message] = await query("SELECT * FROM messages WHERE conversationId=? AND direction='outgoing'", [conversationId]);
    expect(message.sender_type).toBe('merchant'); expect(message.content).toBe(input().replyText);
    expect(mock.teach).toHaveBeenCalledWith(expect.objectContaining({ question: 'هل يتوفر موعد مسائي؟', referenceId: escalationId, answer: input().replyText }));
    expect((await query('SELECT human_takeover FROM conversations WHERE id=?', [conversationId]))[0].human_takeover).toBe(1);
  });
  it('serializes concurrent workers and survives a new database connection without another provider call', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => relayEscalationReply(input())));
    expect(results.some(r => r.accepted)).toBe(true); expect(mock.send).toHaveBeenCalledTimes(1);
    await closeDb(); expect(await relayEscalationReply(input())).toMatchObject({ accepted: true });
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'", [conversationId])).toHaveLength(1);
  });
  it('does not invent a source or rebind a source from another conversation when creating escalation', async () => {
    const base = { merchantId: fixture.merchantId, conversationId, customerPhone: customer, question: 'سؤال العميل' };
    expect(await createSourcedEscalation(base)).toBeNull();
    expect(await createSourcedEscalation({ ...base, incomingMessageId: sourceId, conversationId: conversationId + 1 })).toBeNull();
    expect(await createSourcedEscalation({ ...base, incomingMessageId: sourceId, merchantId: fixture.merchantId + 1 })).toBeNull();
    expect(await createSourcedEscalation({ ...base, incomingMessageId: sourceId, customerPhone: '966500000099' })).toBeNull();
    expect(await createSourcedEscalation({ ...base, incomingMessageId: sourceId })).toBe(escalationId);
  });
  it.each(['answered', 'expired', 'resumed', 'legacy', 'other-owner'])('invalidates a cached hold against durable state: %s', async change => {
    expect(await hasOpenEscalation(fixture.merchantId, conversationId, customer)).toBe(true);
    if (change === 'answered') await relayEscalationReply(input());
    if (change === 'expired') await query('UPDATE sari_escalation_queue SET expires_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP()) WHERE id=?', [escalationId]);
    if (change === 'resumed') { await transitionConversationOwnership(conversationId, { humanTakeover: 1 }); await transitionConversationOwnership(conversationId, { humanTakeover: 0 }); }
    if (change === 'legacy') await query('UPDATE sari_escalation_queue SET source_message_id=NULL,handoff_version=NULL WHERE id=?', [escalationId]);
    if (change === 'other-owner') await query("UPDATE conversations SET customerPhone='966500000099' WHERE id=?", [conversationId]);
    await closeDb();
    expect(await hasOpenEscalation(fixture.merchantId, conversationId, customer)).toBe(false);
    expect(await hasOpenEscalation(fixture.merchantId + 1, conversationId, customer)).toBe(false);
  });
  it('does not reopen or expire an answered escalation when a delayed cascade finishes', async () => {
    await relayEscalationReply(input());
    await markEscalationNotified(escalationId, fixture.merchantId, 2);
    await markEscalationExhausted(escalationId, fixture.merchantId);
    expect((await state()).status).toBe('answered');
    expect((await sendMerchantWhatsApp({ merchantId: fixture.merchantId, instanceRecordId: instanceId, to: customer,
      kind: 'text', text: 'اعتذار قديم', idempotencyKey: `escalation_exhaustion:${fixture.merchantId}:${escalationId}`,
      escalationGuard: { id: escalationId, sourceMessageId: sourceId, version: 0, mode: 'exhaustion' } })).accepted).toBe(false);
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it('preserves an uncertain relay for review instead of expiring it through a cascade', async () => {
    mock.send.mockRejectedValue(new Error('unknown transport'));
    await relayEscalationReply(input());
    await markEscalationExhausted(escalationId, fixture.merchantId);
    expect((await state()).status).toBe('pending');
  });
  it('requires an exact conversation and phone when resolving an observed manual reply', async () => {
    const resolve = (phone: string, id?: number) => resolveEscalation({ merchantId: fixture.merchantId, customerPhone: phone, conversationId: id, merchantAnswer: 'موعد الخميس' });
    expect(await resolve('', conversationId)).toBeNull();
    expect(await resolve(customer)).toBeNull();
    expect(await resolve(customer, conversationId + 1)).toBeNull();
    expect(await resolve('966500000099', conversationId)).toBeNull();
    expect((await state()).status).toBe('pending');
    expect(await resolve(customer, conversationId)).toMatchObject({ id: escalationId, status: 'answered' });
  });
  it.each(['unquoted', 'text-forgery', 'author', 'instance', 'tenant', 'large'])('rejects forged relay identity %s', async attack => {
    const request = input();
    if (attack === 'unquoted') delete (request as any).quotedMessageId;
    if (attack === 'text-forgery') request.quotedMessageId = 'سؤال عميل';
    if (attack === 'author') request.merchantPhone = '966500000099';
    if (attack === 'instance') request.instanceRecordId++;
    if (attack === 'tenant') request.merchantId++;
    if (attack === 'large') request.replyText = 'a'.repeat(2001);
    expect((await relayEscalationReply(request)).accepted).toBe(false);
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.teach).not.toHaveBeenCalled(); expect((await state()).status).toBe('pending');
  });
  it.each(['new-message', 'expired', 'handoff', 'resolved', 'moved-customer', 'legacy'])('suppresses obsolete alert context %s', async change => {
    if (change === 'new-message') await incoming();
    if (change === 'expired') await query('UPDATE sari_escalation_queue SET expires_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP()) WHERE id=?', [escalationId]);
    if (change === 'handoff') { await transitionConversationOwnership(conversationId, { humanTakeover: 1 }); await transitionConversationOwnership(conversationId, { humanTakeover: 0 }); }
    if (change === 'resolved') await query("UPDATE sari_escalation_queue SET status='answered' WHERE id=?", [escalationId]);
    if (change === 'moved-customer') await query("UPDATE conversations SET customerPhone='966500000097' WHERE id=?", [conversationId]);
    if (change === 'legacy') await query('UPDATE sari_escalation_queue SET source_message_id=NULL,handoff_version=NULL WHERE id=?', [escalationId]);
    expect((await relayEscalationReply(input())).accepted).toBe(false); expect(mock.send).not.toHaveBeenCalled(); expect(mock.teach).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'rejected', 'missing-receipt', 'network'])('never confirms, learns or resends an unaccepted %s result', async outcome => {
    if (outcome === 'network') mock.send.mockRejectedValue(new Error('lost network'));
    else mock.send.mockResolvedValue({ accepted: outcome === 'missing-receipt', outcome: outcome === 'rejected' ? 'rejected' : 'unknown', status: 'failed', errorCode: 'fixture' });
    expect((await relayEscalationReply(input())).accepted).toBe(false);
    expect((await state()).status).toBe('pending'); expect(mock.teach).not.toHaveBeenCalled();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'", [conversationId])).toHaveLength(0);
    expect((await relayEscalationReply(input())).accepted).toBe(false); expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it.each(['takeover', 'new-message', 'removed-author'])('rechecks authority at transport after account loading: %s', async change => {
    const instance = await mock.instance(); mock.instance.mockImplementationOnce(async () => {
      if (change === 'takeover') await transitionConversationOwnership(conversationId, { humanTakeover: 1 });
      if (change === 'new-message') await incoming();
      if (change === 'removed-author') await query("UPDATE merchants SET phone='966500000099' WHERE id=?", [fixture.merchantId]);
      return instance;
    });
    expect(await relayEscalationReply(input())).toMatchObject({ accepted: false, status: 'suppressed' }); expect(mock.send).not.toHaveBeenCalled();
  });
  it('repairs a failed local projection from the durable receipt without another external send', async () => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original(), execute = c.execute.bind(c);
      vi.spyOn(c, 'execute').mockImplementation(((sql: string, values: any[]) => {
        if (sql.includes('INSERT INTO messages')) throw new Error('fixture projection failure'); return execute(sql, values);
      }) as any); return c;
    });
    await expect(relayEscalationReply(input())).rejects.toThrow('projection failure');
    vi.restoreAllMocks(); expect((await state()).status).toBe('pending'); expect(mock.teach).not.toHaveBeenCalled();
    expect(await relayEscalationReply(input())).toMatchObject({ accepted: true }); expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it('rolls the ownership transition back if reserving the relay fails', async () => {
    const pool = (await getPool())!, c = await pool.getConnection(), execute = c.execute.bind(c);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(c);
    vi.spyOn(c, 'execute').mockImplementation(((sql: string, values: any[]) => {
      if (sql.includes('INSERT INTO sales_escalation_relays')) throw new Error('fixture reservation failure'); return execute(sql, values);
    }) as any);
    await expect(relayEscalationReply(input())).rejects.toThrow('reservation failure'); vi.restoreAllMocks();
    expect((await query('SELECT human_takeover,handoff_version FROM conversations WHERE id=?', [conversationId]))[0]).toMatchObject({ human_takeover: 0, handoff_version: 0 });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('reserves each alert once, rejects an unguarded reserved key and refuses customer self-notification', async () => {
    expect((await sendSourcedEscalationAlert({ merchantId: fixture.merchantId, escalationId, instanceRecordId: instanceId, to: author, level: 0, text: 'duplicate alert' })).accepted).toBe(true);
    expect(mock.send).not.toHaveBeenCalled();
    expect((await sendMerchantWhatsApp({ merchantId: fixture.merchantId, instanceRecordId: instanceId, to: customer, kind: 'text', text: 'forged', idempotencyKey: `escalation_relay:${fixture.merchantId}:999999` })).accepted).toBe(false);
    expect((await sendSourcedEscalationAlert({ merchantId: fixture.merchantId, escalationId, instanceRecordId: instanceId, to: customer, level: 1, text: 'self alert' })).accepted).toBe(false);
    expect(mock.send).not.toHaveBeenCalled();
  });
});

describe('quoted alert identity parsing', () => {
  it('does not include quoted alert text or media captions in an employee reply', () => {
    expect(merchantReplyText({ messageData: { extendedTextMessageData: { text: 'الخميس متاح', stanzaId: 'abc' }, quotedMessage: { textMessage: 'تنبيه خاص، اسم ورقم العميل' } } })).toBe('الخميس متاح');
    expect(merchantReplyText({ messageData: { caption: 'صورة موظف', quotedMessage: { textMessage: 'تفاصيل خاصة' } } })).toBeNull();
  });
  it('reads supported quote shapes and rejects disagreeing or malformed identifiers', () => {
    expect(quotedEscalationMessageId({ messageData: { quotedMessage: { stanzaId: 'abc' } } })).toBe('abc');
    expect(quotedEscalationMessageId({ messageData: { extendedTextMessageData: { stanzaId: 'abc', quotedMessage: { stanzaId: 'abc' } } } })).toBe('abc');
    expect(quotedEscalationMessageId({ messageData: { quotedMessage: { stanzaId: 'other' }, extendedTextMessageData: { stanzaId: 'abc' } } })).toBeUndefined();
    expect(quotedEscalationMessageId({ messageData: { quotedMessage: { stanzaId: ['abc'] } } })).toBeUndefined();
    expect(quotedEscalationMessageId({ messageData: { quotedMessage: { textMessage: 'سؤال عميل' } } })).toBeUndefined();
  });
});
