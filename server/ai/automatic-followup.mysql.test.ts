import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ model: vi.fn(), settings: vi.fn(), provider: vi.fn(), instance: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: m.model }));
vi.mock('../db_ai_settings', () => ({ getTextGenerationSettings: m.settings }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: m.provider }) }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(), getPrimaryWhatsAppInstance: m.instance, getWhatsAppInstanceById: m.instance }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { automaticFollowupFixture } from '../tests/helpers/automatic-followup-fixture';
import { understandConversation } from './conversation-understanding';
import { withConversationUnderstanding, type ConversationUnderstanding } from './conversation-understanding-context';
import { scheduleAutomaticFollowup, scheduleFollowUp, runFollowUps, cancelFollowUps } from './proactive-followup';
import { canDispatchSalesFollowup } from './followup-send-guard';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { AUTOMATIC_FOLLOWUP_SOURCE } from './automatic-followup-context';
import { updateFollowupPolicy } from './followup-policy';
import { defaultFollowupPolicy } from '../../shared/followup-policy';
import type { CheckoutIdentity } from './checkout-agreements';
import * as campaign from '../automation/campaign-guard';

describe.skipIf(!process.env.DATABASE_URL)('automatic follow-up sealed dialogue and transport security', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, input: CheckoutIdentity & { message: string };
  let source: Date, realNow: Date, changes: Partial<ConversationUnderstanding>;
  const q = async (sql: string, params: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, params))[0];
  const rows = () => q('SELECT * FROM sales_followups WHERE merchant_id=?', [owner.merchantId]);
  const schedule = () => scheduleAutomaticFollowup(input);
  const interpret = () => understandConversation(input);
  const claim = async () => {
    vi.setSystemTime(realNow); const [row] = await rows();
    await q("UPDATE sales_followups SET processing_token='claim_automatic_test',claimed_at=UTC_TIMESTAMP(3) WHERE id=?", [row.id]);
    return { merchantId: owner.merchantId, to: input.customerPhone, kind: 'text' as const, text: row.message_text,
      idempotencyKey: `sales_followup:${owner.merchantId}:${row.id}`, followUpGuard: { id: row.id, token: 'claim_automatic_test' } };
  };
  const admit = async (job: Awaited<ReturnType<typeof claim>>) => canDispatchSalesFollowup((await getPool())!, job);
  beforeEach(async () => {
    owner = await createDisposableMerchant('automatic-followup'); changes = {};
    realNow = new Date((await q('SELECT UTC_TIMESTAMP() AS now'))[0].now);
    source = new Date(realNow.getTime() - 2 * 3_600_000);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(source);
    await updateFollowupPolicy({ merchantId: owner.merchantId, actorUserId: owner.userId, expectedRevision: 0,
      policy: { ...defaultFollowupPolicy, timeZone: 'UTC', startHour: 0, endHour: 24 } });
    const phone = '966500000083';
    await q("INSERT INTO campaign_consent_state(merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,?,'granted','fixture','whatsapp_text',?,?)", [owner.merchantId, phone, 'a'.repeat(64), source]);
    const conv = await q("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,?,'active')", [owner.merchantId, phone]);
    await q("INSERT INTO messages(conversationId,direction,messageType,content,createdAt) VALUES (?,'outgoing','text','هذه الفروق حسب الاستخدام والميزانية.',?)", [conv.insertId, source]);
    const message = 'مو غالي، الخيارات واضحة وأحتاج أراجعها مع شريكي';
    const incoming = await q("INSERT INTO messages(conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text',?,?)", [conv.insertId, message, source]);
    input = { merchantId: owner.merchantId, conversationId: conv.insertId, incomingMessageId: incoming.insertId, customerPhone: phone, message };
    m.settings.mockReset().mockResolvedValue({ model: 'central-automatic-model', textGenerationProvider: 'openai', isActive: true });
    m.model.mockReset().mockImplementation(async messages => JSON.stringify(automaticFollowupFixture(JSON.parse(messages[1].content), changes)));
    m.provider.mockReset().mockResolvedValue({ accepted: true, outcome: 'accepted', providerMessageId: 'synthetic-automatic' });
    const instance = await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)", [owner.merchantId, `automatic-${owner.merchantId}`]);
    m.instance.mockReset().mockResolvedValue({ id: instance.insertId, merchantId: owner.merchantId, status: 'active', provider: 'green_api', instanceId: 'fixture', token: 'fixture' });
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await cleanupDisposableMerchants([owner.userId]); });
  afterAll(closeDb);
  it.each(['openai', 'zahypi'])('shares %s superadmin interpretation, schedules once and sends through real transport', async provider => {
    m.settings.mockResolvedValue({ model: 'central-automatic-model', textGenerationProvider: provider, isActive: true });
    const context = await interpret(); expect(context).not.toBeNull();
    expect(m.model).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ model: 'central-automatic-model', taskType: 'sari.customer.intent', noRetry: true }));
    const results = await withConversationUnderstanding(context!, () => Promise.all([schedule(), schedule()]));
    expect(results.filter(Boolean)).toHaveLength(1); expect(await rows()).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ source: AUTOMATIC_FOLLOWUP_SOURCE, follow_up_type: 'contextual_sales' });
    const job = await claim(); expect(await admit(job)).toBe(true);
    expect((await sendMerchantWhatsApp(job)).accepted).toBe(true); expect(m.provider).toHaveBeenCalledOnce(); expect(m.model).toHaveBeenCalledOnce();
  });
  it('does not fall back to words, caller type, delay or message without a saved recommendation', async () => {
    expect(await scheduleFollowUp({ ...input, automaticSourceMessageId: input.incomingMessageId, followUpType: 'recovery_payment', customMessage: 'الدفع ما اكتمل', customDelayMs: 0 })).toBe(false);
    await interpret();
    expect(await scheduleFollowUp({ ...input, automaticSourceMessageId: input.incomingMessageId, followUpType: 'abandoned_cart', customMessage: 'unsafe', customDelayMs: 0, source: 'legacy' })).toBe(true);
    const [row] = await rows(); expect(row.message_text).not.toMatch(/unsafe|الدفع ما اكتمل|سلة/); expect(new Date(row.scheduled_at).getTime()).toBe(source.getTime() + 3_600_000);
  });
  it.each(['none', 'old analysis', 'no consent', 'withdrawn alias', 'low confidence', 'preview', 'outage', 'disabled', 'conditional', 'foreign evidence', 'changed consent'])('does not schedule on %s', async attack => {
    if (attack === 'none') changes.automaticFollowup = { status: 'none', purpose: null, delayHours: null, evidence: [] };
    if (attack === 'old analysis') m.model.mockImplementation(async messages => { const value = automaticFollowupFixture(JSON.parse(messages[1].content)); delete value.automaticFollowup; return JSON.stringify(value); });
    if (attack === 'no consent') await q('DELETE FROM campaign_consent_state WHERE merchant_id=?', [owner.merchantId]);
    if (attack === 'withdrawn alias') await q("INSERT INTO campaign_consent_state(merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,?,'withdrawn','fixture','whatsapp_text',?,?)", [owner.merchantId, '+' + input.customerPhone, 'b'.repeat(64), source]);
    if (attack === 'low confidence') changes.confidence = .3;
    if (attack === 'outage') m.model.mockRejectedValue(Error('fixture provider outage'));
    if (attack === 'disabled') m.settings.mockResolvedValue({ isActive: false });
    if (attack === 'conditional') changes.conditional = true;
    if (attack === 'foreign evidence') changes.automaticFollowup = { status: 'recommend', purpose: 'price', delayHours: 1, evidence: [{ messageId: 999999999, excerpt: 'نعم' }] };
    if (attack === 'changed consent') { const original = m.model.getMockImplementation()!; m.model.mockImplementation(async messages => { const value = await original(messages); await q("UPDATE campaign_consent_state SET status='withdrawn' WHERE merchant_id=?", [owner.merchantId]); return value; }); }
    const context = await interpret();
    expect(await (attack === 'preview' ? withConversationUnderstanding({ ...context!, mode: 'preview' }, schedule) : schedule())).toBe(false);
    expect(await rows()).toHaveLength(0); expect(m.provider).not.toHaveBeenCalled();
  });
  const mutate = async (attack: string) => {
    if (attack === 'missing analysis') await q('DELETE FROM ai_conversation_understanding WHERE merchant_id=?', [owner.merchantId]);
    if (attack === 'edited analysis') await q("UPDATE ai_conversation_understanding SET result_json=JSON_SET(result_json,'$.automaticFollowup.purpose','trust') WHERE merchant_id=?", [owner.merchantId]);
    if (attack === 'edited history') await q("UPDATE messages SET content='different' WHERE conversationId=? AND direction='outgoing'", [input.conversationId]);
    if (attack === 'edited timestamp') await q('UPDATE messages SET createdAt=TIMESTAMPADD(HOUR,1,createdAt) WHERE id=?', [input.incomingMessageId]);
    if (attack === 'forgotten memory') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [owner.merchantId, input.customerPhone, input.incomingMessageId - 1]);
    if (attack === 'new reply') await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','انتهى الموضوع')", [input.conversationId]);
    if (attack === 'withdrawal') await q("UPDATE campaign_consent_state SET status='withdrawn' WHERE merchant_id=?", [owner.merchantId]);
    if (attack === 'handoff') await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [input.conversationId]);
    if (attack === 'paid') await q("UPDATE conversations SET deal_stage='paid' WHERE id=?", [input.conversationId]);
    if (attack === 'wrong owner') await q("UPDATE conversations SET customerPhone='966500009999' WHERE id=?", [input.conversationId]);
    if (attack === 'edited message') await q("UPDATE sales_followups SET message_text='unsafe' WHERE merchant_id=?", [owner.merchantId]);
    if (attack === 'accelerated time') await q('UPDATE sales_followups SET scheduled_at=? WHERE merchant_id=?', [source, owner.merchantId]);
    if (attack === 'legacy downgrade') await q("UPDATE sales_followups SET source='proactive',follow_up_type='hesitating' WHERE merchant_id=?", [owner.merchantId]);
  };
  const attacks = ['missing analysis', 'edited analysis', 'edited history', 'edited timestamp', 'forgotten memory', 'new reply', 'withdrawal', 'handoff', 'paid', 'wrong owner', 'edited message', 'accelerated time', 'legacy downgrade'];
  it.each(attacks)('blocks %s at transport even after quota was reserved', async attack => {
    await interpret(); expect(await schedule()).toBe(true); const job = await claim(); expect(await admit(job)).toBe(true);
    await mutate(attack); expect(await admit(job)).toBe(false);
    expect((await sendMerchantWhatsApp(job)).accepted).toBe(false); expect(m.provider).not.toHaveBeenCalled();
  });
  it.each(attacks)('blocks %s arriving during account loading', async attack => {
    await interpret(); await schedule(); const job = await claim();
    const config = m.instance.getMockImplementation()!;
    m.instance.mockImplementation(async (...args) => { await mutate(attack); return config(...args); });
    expect((await sendMerchantWhatsApp(job)).accepted).toBe(false); expect(m.provider).not.toHaveBeenCalled();
  });
  it('rejects transport text substitution and media before provider I/O', async () => {
    await interpret(); await schedule(); const job = await claim();
    expect(await admit({ ...job, text: 'unsafe' })).toBe(false);
    expect(await canDispatchSalesFollowup((await getPool())!, { ...job, kind: 'image' })).toBe(false);
    expect(m.provider).not.toHaveBeenCalled();
  });
  it('expires a recommendation instead of sending it days later', async () => {
    await interpret(); await schedule(); const job = await claim(); vi.setSystemTime(new Date(source.getTime() + 26 * 3_600_000));
    expect(await admit(job)).toBe(false);
  });
  it('worker sends current recommendations but cancels old automated rows without reinterpretation', async () => {
    await interpret(); await schedule(); vi.setSystemTime(realNow);
    expect((await runFollowUps()).sent).toBe(1); expect(m.provider).toHaveBeenCalledOnce();
    await q("UPDATE sales_followups SET sent_at=NULL,source='proactive',follow_up_type='recovery_payment',processing_token=NULL WHERE merchant_id=?", [owner.merchantId]);
    expect((await runFollowUps()).cancelled).toBe(1); expect(m.provider).toHaveBeenCalledOnce();
  });
  it('does not revive a cancelled recommendation for the same source turn', async () => {
    await interpret(); await schedule(); await cancelFollowUps(owner.merchantId, input.customerPhone);
    expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(1);
  });
  it('uses the sealed analysis even if an in-memory caller changes its purpose', async () => {
    const context = await interpret(); context!.analysis.automaticFollowup!.purpose = 'trust';
    await withConversationUnderstanding(context!, schedule);
    expect((await rows())[0].message_text).toContain('السعر');
  });
  it('keeps ordinary analysis available when marketing consent storage fails, without scheduling', async () => {
    vi.spyOn(campaign, 'hasActiveCampaignConsent').mockRejectedValue(Error('synthetic consent storage outage'));
    changes.automaticFollowup = { status: 'none', purpose: null, delayHours: null, evidence: [] };
    expect(await interpret()).not.toBeNull();
    expect(JSON.parse(m.model.mock.calls[0][0][1].content).automaticFollowupAllowed).toBe(false);
    expect(await schedule()).toBe(false); expect(await rows()).toHaveLength(0);
  });
  it.each(['merchant', 'conversation', 'message', 'phone'])('rejects substituted %s identity at scheduling', async part => {
    await interpret(); const altered = { ...input };
    if (part === 'merchant') altered.merchantId += 90000000;
    if (part === 'conversation') altered.conversationId += 90000000;
    if (part === 'message') altered.incomingMessageId += 90000000;
    if (part === 'phone') altered.customerPhone = '966500009999';
    expect(await scheduleAutomaticFollowup(altered)).toBe(false); expect(await rows()).toHaveLength(0);
  });
  it('cancels invalid evidence during quiet hours without deferring the stale job', async () => {
    await interpret(); await schedule(); const before = (await rows())[0].scheduled_at;
    const currentHour = realNow.getUTCHours(); const startHour = currentHour === 0 ? 1 : 0;
    await updateFollowupPolicy({ merchantId: owner.merchantId, actorUserId: owner.userId, expectedRevision: 1,
      policy: { ...defaultFollowupPolicy, timeZone: 'UTC', startHour, endHour: startHour + 1 } });
    await q('DELETE FROM ai_conversation_understanding WHERE merchant_id=?', [owner.merchantId]);
    vi.setSystemTime(realNow);
    expect((await runFollowUps()).cancelled).toBe(1);
    expect((await rows())[0]).toMatchObject({ cancel_reason: 'interpretation_changed', scheduled_at: before });
    expect(m.provider).not.toHaveBeenCalled();
  });
});
