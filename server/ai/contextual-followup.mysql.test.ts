import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ model: vi.fn(), settings: vi.fn(), provider: vi.fn(), instance: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: m.model }));
vi.mock('../db_ai_settings', () => ({ getTextGenerationSettings: m.settings }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: m.provider }) }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(),
  getPrimaryWhatsAppInstance: m.instance, getWhatsAppInstanceById: m.instance }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { followupUnderstandingFixture } from '../tests/helpers/followup-understanding-fixture';
import { understandConversation } from './conversation-understanding';
import { withConversationUnderstanding, type ConversationUnderstanding } from './conversation-understanding-context';
import { handleRequestedFollowup } from './requested-followup';
import { scheduleFollowUp, runFollowUps } from './proactive-followup';
import { canDispatchSalesFollowup } from './followup-send-guard';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { CONTEXTUAL_FOLLOWUP_SOURCE } from './contextual-followup';
import { updateFollowupPolicy } from './followup-policy';
import { defaultFollowupPolicy } from '../../shared/followup-policy';
import type { CheckoutIdentity } from './checkout-agreements';

describe.skipIf(!process.env.DATABASE_URL)('sealed contextual follow-up lifecycle and local penetration checks', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, input: CheckoutIdentity & { message: string };
  let source: Date, sendAt: Date, realNow: Date, changes: Partial<ConversationUnderstanding>;
  const q = async (sql: string, params: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, params))[0];
  const rows = () => q('SELECT * FROM sales_followups WHERE merchant_id=?', [owner.merchantId]);
  const schedule = () => scheduleFollowUp({ ...input, followUpType: 'customer_requested', requestedSourceMessageId: input.incomingMessageId,
    customMessage: 'unsafe overridden text', customDelayMs: 0, source: 'caller_cannot_choose_proof' });
  const interpret = () => understandConversation(input);
  const claim = async () => {
    vi.setSystemTime(realNow);
    const [row] = await rows();
    await q("UPDATE sales_followups SET processing_token='claim_contextual_test',claimed_at=UTC_TIMESTAMP(3) WHERE id=?", [row.id]);
    return { merchantId: input.merchantId, to: input.customerPhone, kind: 'text' as const, text: row.message_text,
      idempotencyKey: `sales_followup:${input.merchantId}:${row.id}`, followUpGuard: { id: row.id, token: 'claim_contextual_test' } };
  };
  const admit = async (job: Awaited<ReturnType<typeof claim>>) => canDispatchSalesFollowup((await getPool())!, job);
  beforeEach(async () => {
    owner = await createDisposableMerchant('contextual-followup'); changes = {};
    realNow = new Date((await q('SELECT UTC_TIMESTAMP() AS now'))[0].now);
    source = new Date(Math.floor((realNow.getTime() - 86_400_000) / 60000) * 60000);
    sendAt = new Date(Math.floor((realNow.getTime() - 60000) / 60000) * 60000);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(source);
    await updateFollowupPolicy({ merchantId: owner.merchantId, actorUserId: owner.userId, expectedRevision: 0,
      policy: { ...defaultFollowupPolicy, timeZone: 'UTC', startHour: 0, endHour: 24 } });
    const conv = await q("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000084','active')", [owner.merchantId]);
    await q("INSERT INTO messages(conversationId,direction,messageType,content,createdAt) VALUES (?,'outgoing','text',?,?)",
      [conv.insertId, `أتابع معك ${sendAt.toISOString().slice(0, 10)} الساعة ${sendAt.toISOString().slice(11, 16)} بتوقيت UTC؟`, source]);
    const message = 'لا أريد الشراء الآن، لكن هذا الموعد مناسب نكمل فيه كلامنا';
    const incoming = await q("INSERT INTO messages(conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text',?,?)", [conv.insertId, message, source]);
    input = { merchantId: owner.merchantId, conversationId: conv.insertId, incomingMessageId: incoming.insertId, customerPhone: '966500000084', message };
    m.settings.mockReset().mockResolvedValue({ model: 'superadmin-followup-model', textGenerationProvider: 'openai', isActive: true });
    m.model.mockReset().mockImplementation(async messages => {
      const context = JSON.parse(messages[1].content);
      return JSON.stringify(followupUnderstandingFixture(context, { localDate: sendAt.toISOString().slice(0, 10), localTime: sendAt.toISOString().slice(11, 16),
        evidence: context.messages.map((v: any) => ({ messageId: v.id, excerpt: v.content })) }, changes));
    });
    m.provider.mockReset().mockResolvedValue({ accepted: true, outcome: 'accepted', providerMessageId: 'synthetic-provider-id' });
    const instance = await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)", [owner.merchantId, `contextual-${owner.merchantId}`]);
    m.instance.mockReset().mockResolvedValue({ id: instance.insertId, merchantId: owner.merchantId, status: 'active', provider: 'green_api', instanceId: 'fixture', token: 'fixture' });
  });
  afterEach(async () => { vi.useRealTimers(); await cleanupDisposableMerchants([owner.userId]); });
  afterAll(closeDb);

  it.each(['openai', 'zahypi'])('uses the shared central model for %s, saves once, and sends through the durable transport', async provider => {
    m.settings.mockResolvedValue({ model: 'superadmin-followup-model', textGenerationProvider: provider, isActive: true });
    const context = await interpret(); expect(context).not.toBeNull();
    expect(m.model).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ model: 'superadmin-followup-model', taskType: 'sari.customer.intent', noRetry: true }));
    expect(JSON.parse(m.model.mock.calls[0][0][1].content).followupClock).toEqual({ sourceCreatedAt: source.toISOString(), timeZone: 'UTC' });
    const responses = await withConversationUnderstanding(context!, () => Promise.all([handleRequestedFollowup(input), handleRequestedFollowup(input)]));
    expect(responses.every(r => r?.includes('سجلت متابعة واحدة'))).toBe(true);
    const jobs = await rows(); expect(jobs).toHaveLength(1); expect(jobs[0].source).toBe(CONTEXTUAL_FOLLOWUP_SOURCE);
    expect(new Date(jobs[0].scheduled_at)).toEqual(sendAt); expect(jobs[0].message_text).not.toContain('unsafe');
    expect(await q('SELECT * FROM campaign_consent_state WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    const job = await claim(); expect(await admit(job)).toBe(true);
    expect((await sendMerchantWhatsApp(job)).accepted).toBe(true); expect(m.provider).toHaveBeenCalledOnce();
    expect(m.model).toHaveBeenCalledOnce();
  });
  it('does not invent a scheduled request from reminder words without stored AI understanding', async () => {
    await q("UPDATE messages SET content='ذكرني غدا الساعة 17:00' WHERE id=?", [input.incomingMessageId]);
    expect(await handleRequestedFollowup(input)).toBeNull(); expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(0);
  });
  it.each(['none', 'old analysis', 'low confidence', 'unclear time'])('does not schedule for %s', async state => {
    m.model.mockImplementation(async messages => {
      const value = followupUnderstandingFixture(JSON.parse(messages[1].content), { localDate: sendAt.toISOString().slice(0, 10), localTime: sendAt.toISOString().slice(11, 16) });
      if (state === 'none') value.followup!.status = 'none';
      if (state === 'old analysis') delete value.followup;
      if (state === 'low confidence') value.confidence = 0.5;
      if (state === 'unclear time') { value.followup!.status = 'clarify'; value.followup!.localTime = null; }
      return JSON.stringify(value);
    });
    expect(await interpret()).not.toBeNull();
    const result = await handleRequestedFollowup(input);
    if (['low confidence', 'unclear time'].includes(state)) expect(result).toContain('لم أسجل موعداً'); else expect(result).toBeNull();
    expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(0);
  });
  it.each(['outage', 'malformed', 'foreign evidence', 'conditional', 'wrong clock', 'policy changed', 'timestamp changed'])('fails closed on %s during analysis', async attack => {
    const original = m.model.getMockImplementation()!;
    m.model.mockImplementation(async messages => {
      if (attack === 'outage') throw Error('synthetic provider failure');
      if (attack === 'malformed') return 'yes';
      const value = JSON.parse(await original(messages));
      if (attack === 'foreign evidence') value.followup.evidence.push({ messageId: input.incomingMessageId + 9000000, excerpt: 'موافق' });
      if (attack === 'conditional') value.conditional = true;
      if (attack === 'wrong clock') value.followup.sourceCreatedAt = new Date(source.getTime() + 1000).toISOString();
      if (attack === 'policy changed') await q("UPDATE sales_followup_policies SET time_zone='Asia/Riyadh' WHERE merchant_id=?", [owner.merchantId]);
      if (attack === 'timestamp changed') await q('UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?', [input.incomingMessageId]);
      return JSON.stringify(value);
    });
    expect(await interpret()).toBeNull(); expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(0);
    expect(m.provider).not.toHaveBeenCalled();
  });
  const mutate = async (attack: string) => {
    if (attack === 'source') await q("UPDATE messages SET content='غيرت رأيي' WHERE id=?", [input.incomingMessageId]);
    if (attack === 'history') await q("UPDATE messages SET content='سؤال مختلف' WHERE conversationId=? AND direction='outgoing'", [input.conversationId]);
    if (attack === 'history timestamp') await q("UPDATE messages SET createdAt=TIMESTAMPADD(DAY,1,createdAt) WHERE conversationId=? AND direction='outgoing'", [input.conversationId]);
    if (attack === 'new reply') await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','لا تتواصل')", [input.conversationId]);
    if (attack === 'handoff') await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [input.conversationId]);
    if (attack === 'memory forgotten') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [owner.merchantId, input.customerPhone, input.incomingMessageId - 1]);
    if (attack === 'seal') await q("UPDATE ai_conversation_understanding SET result_json=JSON_SET(result_json,'$.followup.localTime','00:00') WHERE merchant_id=?", [owner.merchantId]);
    if (attack === 'analysis deleted') await q('DELETE FROM ai_conversation_understanding WHERE merchant_id=?', [owner.merchantId]);
    if (attack === 'scheduled time') await q('UPDATE sales_followups SET scheduled_at=TIMESTAMPADD(MINUTE,-1,scheduled_at) WHERE merchant_id=?', [owner.merchantId]);
    if (attack === 'saved timezone') await q("UPDATE sales_followups SET schedule_timezone='Asia/Riyadh' WHERE merchant_id=?", [owner.merchantId]);
  };
  it.each(['source', 'history', 'history timestamp', 'new reply', 'handoff', 'memory forgotten', 'seal', 'analysis deleted'])
    ('rechecks persisted authority before scheduling after %s', async attack => {
      expect(await interpret()).not.toBeNull(); await mutate(attack);
      expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(0);
    });
  it.each(['source', 'history', 'history timestamp', 'new reply', 'handoff', 'memory forgotten', 'seal', 'analysis deleted', 'scheduled time', 'saved timezone'])
    ('invalidates an already admitted transport reservation after %s', async attack => {
      await interpret(); expect(await schedule()).toBe(true); const job = await claim(); expect(await admit(job)).toBe(true);
      await mutate(attack); expect(await admit(job)).toBe(false);
      expect((await sendMerchantWhatsApp(job)).accepted).toBe(false); expect(m.provider).not.toHaveBeenCalled();
    });
  it('rechecks after WhatsApp account loading, before the provider is called', async () => {
    await interpret(); await schedule(); const job = await claim();
    const instance = await m.instance(); m.instance.mockImplementation(async () => { await mutate('memory forgotten'); return instance; });
    expect((await sendMerchantWhatsApp(job)).accepted).toBe(false); expect(m.provider).not.toHaveBeenCalled();
  });
  it('the worker cancels missing analysis instead of silently reverting to legacy consent', async () => {
    await interpret(); await schedule(); vi.setSystemTime(realNow); await mutate('analysis deleted');
    expect(await runFollowUps()).toMatchObject({ sent: 0, cancelled: 1 });
    expect((await rows())[0].cancel_reason).toBe('interpretation_changed'); expect(m.provider).not.toHaveBeenCalled();
  });
  it('does not accept preview, mismatched in-memory identity or a caller-selected timestamp', async () => {
    const context = await interpret(); expect(context).not.toBeNull();
    for (const altered of [{ ...context!, mode: 'preview' as const }, { ...context!, conversationId: input.conversationId + 1 }]) {
      await withConversationUnderstanding(altered, async () => { expect(await schedule()).toBe(false); });
    }
    await withConversationUnderstanding({ ...context!, analysis: { ...context!.analysis, followup: { ...context!.analysis.followup!, localTime: '00:00' } } },
      async () => expect(await schedule()).toBe(true));
    expect(new Date((await rows())[0].scheduled_at)).toEqual(sendAt);
  });
});
