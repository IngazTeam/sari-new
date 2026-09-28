import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ model: vi.fn(), settings: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: mocks.model }));
vi.mock('../db_ai_settings', () => ({ getTextGenerationSettings: mocks.settings }));
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { understandConversation, readStoredUnderstanding, withStoredUnderstanding } from './conversation-understanding';
import { withConversationUnderstanding, currentConversationUnderstanding, semanticAction } from './conversation-understanding-context';
import type { CheckoutIdentity } from './checkout-agreements';
import { captureDirectCustomerMemory } from './customer-memory';

describe.skipIf(!process.env.DATABASE_URL)('durable semantic interpretation and hostile context changes', () => {
  const q = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  let input: CheckoutIdentity & { message: string }, users: number[];
  const incoming = async (message: string) => ({ ...input, message, incomingMessageId: Number((await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)", [input.conversationId, message])).insertId) });
  function output(messages: any[]) {
    const request = JSON.parse(messages[1].content), message = request.messages.at(-1);
    return JSON.stringify({ version: 1, intent: 'inquiring', goal: 'explain_requested_information', action: 'respond', confidence: 0.97, conditional: false, ambiguous: false, targetQuoteId: null, targetProvider: 'none', productIds: [], sessionIndex: null, requestKind: 'ordinary', sentiment: 'neutral', topicChanged: false, objection: 'none', needs: ['جدول مناسب'], unresolvedQuestions: [], summary: 'موافقة على الشرح المطلوب سابقًا.', nextStep: 'answer', evidence: [{ messageId: message.id, excerpt: message.content }] });
  }
  beforeEach(async () => {
    assertDisposableDatabase(); vi.clearAllMocks(); users = [];
    const owner = await createDisposableMerchant('semantic-context'); users.push(owner.userId);
    const conv = await q("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966501234567','active')", [owner.merchantId]);
    input = { merchantId: owner.merchantId, conversationId: conv.insertId, incomingMessageId: 0, customerPhone: '966501234567', message: '' };
    await incoming('أحتاج موعدًا صباحيًا لأن عملي في المساء');
    await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'outgoing','text','تحب أوضح الفرق بين الخيارات؟')", [input.conversationId]);
    input = await incoming('نعم'); mocks.settings.mockResolvedValue({ model: 'central-admin-model', textGenerationProvider: 'openai', isActive: true });
    mocks.model.mockImplementation(async messages => output(messages));
  });
  afterEach(async () => { await cleanupDisposableMerchants(users); }); afterAll(closeDb);
  it('persists grounded both-speaker analysis once and uses the superadmin model and shared provider entry point', async () => {
    const context = await understandConversation(input); expect(context?.analysis.action).toBe('respond');
    expect(context?.model).toBe('central-admin-model');
    expect(mocks.model).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ model: 'central-admin-model', merchantId: input.merchantId, conversationId: input.conversationId, taskType: 'sari.customer.intent', noRetry: true }));
    expect(JSON.parse(mocks.model.mock.calls[0][0][1].content).messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect((await understandConversation(input))?.analysis).toEqual(context?.analysis); expect(mocks.model).toHaveBeenCalledOnce();
    await withStoredUnderstanding((await getPool())!, input, async () => expect(semanticAction('نعم', ['confirm_offer'])).toBe(false));
  });
  it('reserves concurrent interpretation once without holding SQL while waiting for AI', async () => {
    let release!: () => void, started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    mocks.model.mockImplementation(async messages => { started(); await releasePromise; return output(messages); });
    const first = understandConversation(input); await startedPromise;
    try { expect(await understandConversation(input)).toBeNull(); } finally { release(); }
    expect(await first).not.toBeNull(); expect(mocks.model).toHaveBeenCalledOnce();
  });
  it('respects central disablement even when this message already has a ready interpretation', async () => {
    expect(await understandConversation(input)).not.toBeNull();
    mocks.settings.mockResolvedValue({ model: 'central-admin-model', isActive: false });
    expect(await understandConversation(input)).toBeNull(); expect(mocks.model).toHaveBeenCalledOnce();
    expect(await understandConversation(await incoming('هل أقدر أكمل؟'))).toBeNull(); expect(mocks.model).toHaveBeenCalledOnce();
  });
  it.each(['provider outage', 'malformed', 'fabricated evidence', 'foreign product'])('fails closed on %s and never retries through keyword action', async attack => {
    mocks.model.mockImplementation(async messages => {
      if (attack === 'provider outage') throw Error('synthetic outage');
      if (attack === 'malformed') return 'yes';
      const result = JSON.parse(output(messages));
      if (attack === 'fabricated evidence') result.evidence[0].excerpt = 'اتفقنا على الدفع'; else result.productIds = [2147483000];
      return JSON.stringify(result);
    });
    expect(await understandConversation(input)).toBeNull(); expect(await understandConversation(input)).toBeNull(); expect(mocks.model).toHaveBeenCalledOnce();
    await withStoredUnderstanding((await getPool())!, input, async () => expect(semanticAction('نعم', ['confirm_offer'])).toBe(false));
  });
  it.each(['handoff', 'new message', 'memory deletion', 'source changed', 'history changed'])('discards output after %s during provider I/O', async attack => {
    mocks.model.mockImplementation(async messages => {
      if (attack === 'handoff') await q('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1 WHERE id=?', [input.conversationId]);
      if (attack === 'new message') await incoming('انتظر، غيرت رأيي');
      if (attack === 'memory deletion') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [input.merchantId, input.customerPhone, input.incomingMessageId - 1]);
      if (attack === 'source changed') await q("UPDATE messages SET content='لا' WHERE id=?", [input.incomingMessageId]);
      if (attack === 'history changed') await q("UPDATE messages SET content='هل تؤكد الطلب؟' WHERE conversationId=? AND direction='outgoing'", [input.conversationId]);
      return output(messages);
    });
    expect(await understandConversation(input)).toBeNull();
    expect((await q('SELECT state,result_json FROM ai_conversation_understanding WHERE merchant_id=?', [input.merchantId]))[0]).toMatchObject({ state: 'failed', result_json: null });
  });
  it.each(['result', 'source', 'history', 'handoff', 'memory'])('rejects persisted %s tampering at final read', async attack => {
    await understandConversation(input);
    if (attack === 'result') await q("UPDATE ai_conversation_understanding SET result_json=JSON_SET(result_json,'$.action','confirm_offer') WHERE merchant_id=?", [input.merchantId]);
    if (attack === 'source') await q("UPDATE messages SET content='غير موافق' WHERE id=?", [input.incomingMessageId]);
    if (attack === 'history') await q("DELETE FROM messages WHERE conversationId=? AND direction='outgoing'", [input.conversationId]);
    if (attack === 'handoff') await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [input.conversationId]);
    if (attack === 'memory') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [input.merchantId, input.customerPhone, input.incomingMessageId - 1]);
    await expect(readStoredUnderstanding((await getPool())!, input)).rejects.toThrow();
  });
  it('rejects cross-tenant, forged phone/text and superseded inputs before AI', async () => {
    const other = await createDisposableMerchant('semantic-other'); users.push(other.userId);
    for (const change of [{ merchantId: other.merchantId }, { customerPhone: '966500000999' }, { message: 'اشتريت' }]) await expect(understandConversation({ ...input, ...change })).rejects.toThrow();
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it('historical lookup uses the message ID even when two messages both say yes', async () => {
    const previous = await understandConversation(input); const next = await incoming('نعم');
    const current = { ...previous!, incomingMessageId: next.incomingMessageId, analysis: { ...previous!.analysis, action: 'confirm_offer' as const, targetQuoteId: 99, targetProvider: 'local' as const } };
    await withConversationUnderstanding(current, async () => {
      await withStoredUnderstanding((await getPool())!, input, async () => expect(currentConversationUnderstanding()?.action).toBe('respond'), true);
      expect(currentConversationUnderstanding()?.action).toBe('confirm_offer');
    });
  });
  it('carries verified customer memory and a rolling interpretation into the next conversation turn', async () => {
    const budget = await incoming('ميزانيتي 500 ريال');
    await captureDirectCustomerMemory(budget);
    const previous = await understandConversation(budget); expect(previous).not.toBeNull();
    const next = await incoming('وش تقترح يناسبني؟');
    expect(await understandConversation(next)).not.toBeNull();
    const context = JSON.parse(mocks.model.mock.calls.at(-1)![0][1].content);
    expect(context.previousUnderstanding.summary).toBe(previous!.analysis.summary);
    expect(context.memory).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'budget', sourceMessageId: budget.incomingMessageId })]));
    expect(context).not.toHaveProperty('customerPhone');
  });
});
