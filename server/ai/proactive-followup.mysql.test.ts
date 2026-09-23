import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
vi.mock('../channels/whatsapp/service', () => ({ sendMerchantWhatsApp: transport }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { scheduleFollowUp, runFollowUps } from './proactive-followup';
import { canDispatchSalesFollowup } from './followup-send-guard';
import { handleRequestedFollowup } from './requested-followup';

describe.skipIf(!process.env.DATABASE_URL)('sales follow-up lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number;
  const phone = '966500000086';
  const query = async (sql: string, params: any[] = []) => (await (await getPool())!.execute<any>(sql, params))[0];
  const schedule = () => scheduleFollowUp({ merchantId: fixture.merchantId, customerPhone: phone, conversationId,
    followUpType: 'recovery_price', customDelayMs: 0 });
  const due = () => query('UPDATE sales_followups SET scheduled_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE merchant_id = ?', [fixture.merchantId]);
  const state = async () => (await query('SELECT * FROM sales_followups WHERE merchant_id = ?', [fixture.merchantId]))[0];
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-23T09:00:00Z'));
    transport.mockReset().mockResolvedValue({ accepted: true, status: 'sent', providerMessageId: 'fake-id' });
    fixture = await createDisposableMerchant('sales-followup');
    await query(`INSERT INTO campaign_consent_state (merchant_id, customer_phone, status, consent_version, source, evidence_digest, last_decided_at)
      VALUES (?, ?, 'granted', 'fixture-v1', 'whatsapp_text', ?, UTC_TIMESTAMP(3))`, [fixture.merchantId, phone, 'a'.repeat(64)]);
    const created = await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')", [fixture.merchantId, phone]);
    conversationId = created.insertId;
    await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'بفكر في الموضوع')", [conversationId]);
  });
  afterEach(async () => { vi.useRealTimers(); await cleanupDisposableMerchants([fixture.userId]); });
  afterAll(closeDb);

  it('serializes duplicate scheduling and sends a grounded message through the durable transport', async () => {
    expect((await Promise.all([schedule(), schedule()])).filter(Boolean)).toHaveLength(1);
    await due(); expect((await runFollowUps()).sent).toBe(1);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ merchantId: fixture.merchantId, to: phone,
      idempotencyKey: `sales_followup:${fixture.merchantId}:${(await state()).id}` }));
    expect(transport.mock.calls[0][0].text).not.toMatch(/عروض جديدة|مخفضة|محجوز|حصرية/);
    expect(transport.mock.calls[0][0].text).toContain('إلغاء الاشتراك');
    expect(transport.mock.calls[0][0].followUpGuard.id).toBe((await state()).id);
    await runFollowUps(); expect(transport).toHaveBeenCalledTimes(1);
  });
  it('requires explicit marketing consent even for an interested customer', async () => {
    await query('DELETE FROM campaign_consent_state WHERE merchant_id = ?', [fixture.merchantId]);
    expect(await schedule()).toBe(false); expect(transport).not.toHaveBeenCalled();
  });
  it('schedules a one-off requested date without granting global marketing consent', async () => {
    await query('DELETE FROM campaign_consent_state WHERE merchant_id=?', [fixture.merchantId]);
    await query("UPDATE messages SET content='ذكرني الخميس الساعة 5 مساء', createdAt='2026-09-23 09:00:00' WHERE conversationId=?", [conversationId]);
    const [message] = await query('SELECT id FROM messages WHERE conversationId=?', [conversationId]);
    const input = { merchantId: fixture.merchantId, conversationId, incomingMessageId: message.id, customerPhone: phone };
    const result = await Promise.all([handleRequestedFollowup(input), handleRequestedFollowup(input)]);
    expect(result.every(text => text?.includes('سجلت متابعة واحدة'))).toBe(true);
    const rows = await query('SELECT * FROM sales_followups WHERE merchant_id=?', [fixture.merchantId]); expect(rows).toHaveLength(1);
    expect(new Date(rows[0].scheduled_at).toISOString()).toBe('2026-09-24T14:00:00.000Z');
    expect(await query('SELECT * FROM campaign_consent_state WHERE merchant_id=?', [fixture.merchantId])).toHaveLength(0);
  });
  it('requests clarification instead of inventing a time and refuses stale source substitution', async () => {
    await query("UPDATE messages SET content='كلمني الخميس' WHERE conversationId=?", [conversationId]);
    const [message] = await query('SELECT id FROM messages WHERE conversationId=?', [conversationId]);
    const input = { merchantId: fixture.merchantId, conversationId, incomingMessageId: message.id, customerPhone: phone };
    expect(await handleRequestedFollowup(input)).toContain('لم أسجل موعداً');
    expect(await query('SELECT * FROM sales_followups WHERE merchant_id=?', [fixture.merchantId])).toHaveLength(0);
    await expect(handleRequestedFollowup({ ...input, merchantId: fixture.merchantId + 9999999 })).rejects.toThrow();
    await query("UPDATE messages SET content='ذكرني الخميس الساعة 5 مساء', createdAt='2026-09-23 09:00:00' WHERE conversationId=?", [conversationId]);
    expect(await scheduleFollowUp({ merchantId: fixture.merchantId, customerPhone: phone, conversationId,
      followUpType: 'customer_requested', requestedSourceMessageId: message.id + 1 })).toBe(false);
  });
  it('replaces the old requested time atomically when the customer changes it', async () => {
    await query("UPDATE messages SET content='ذكرني الخميس الساعة 5 مساء', createdAt='2026-09-23 09:00:00' WHERE conversationId=?", [conversationId]);
    const [first] = await query('SELECT id FROM messages WHERE conversationId=?', [conversationId]);
    const input = { merchantId: fixture.merchantId, conversationId, customerPhone: phone };
    await handleRequestedFollowup({ ...input, incomingMessageId: first.id });
    const next = await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','ذكرني الجمعة الساعة 5 مساء','2026-09-23 10:00:00')", [conversationId]);
    await handleRequestedFollowup({ ...input, incomingMessageId: next.insertId });
    const rows = await query('SELECT * FROM sales_followups WHERE merchant_id=? ORDER BY id', [fixture.merchantId]);
    expect(rows).toHaveLength(2); expect(rows[0].cancel_reason).toBe('customer_rescheduled');
    expect(new Date(rows[1].scheduled_at).toISOString()).toBe('2026-09-25T14:00:00.000Z');
  });
  it('allows one-off consent and respects a newer withdrawal at the transport guard', async () => {
    await query('DELETE FROM campaign_consent_state WHERE merchant_id=?', [fixture.merchantId]);
    await query("UPDATE messages SET content='ذكرني الخميس الساعة 5 مساء', createdAt='2026-09-23 09:00:00' WHERE conversationId=?", [conversationId]);
    const [m] = await query('SELECT id FROM messages WHERE conversationId=?', [conversationId]);
    await handleRequestedFollowup({ merchantId: fixture.merchantId, conversationId, customerPhone: phone, incomingMessageId: m.id });
    await due(); const fu = await state();
    await query("UPDATE sales_followups SET processing_token='claim_fixture', claimed_at=UTC_TIMESTAMP(3) WHERE id=?", [fu.id]);
    const input = { merchantId: fixture.merchantId, to: phone, idempotencyKey: `sales_followup:${fixture.merchantId}:${fu.id}`, followUpGuard: { id: fu.id, token: 'claim_fixture' } };
    expect(await canDispatchSalesFollowup((await getPool())!, input)).toBe(true);
    await query(`INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at)
      VALUES (?,?,'withdrawn','fixture-v1','whatsapp_text',?,'2026-09-23 10:00:00')`, [fixture.merchantId, phone, 'b'.repeat(64)]);
    expect(await canDispatchSalesFollowup((await getPool())!, input)).toBe(false);
  });
  it('cancels scheduled sales follow-ups after consent withdrawal, even without a new conversation message', async () => {
    await schedule(); await due(); await query("UPDATE campaign_consent_state SET status = 'withdrawn' WHERE merchant_id = ?", [fixture.merchantId]);
    expect((await runFollowUps()).cancelled).toBe(1); expect(transport).not.toHaveBeenCalled();
    expect((await state()).cancel_reason).toBe('consent_unavailable');
  });
  it('treats transport-time suppression as cancellation rather than failed delivery or success', async () => {
    await schedule(); await due(); transport.mockResolvedValue({ accepted: false, status: 'failed', errorCode: 'followup_suppressed' });
    expect(await runFollowUps()).toMatchObject({ sent: 0, cancelled: 1, errors: 0 });
    expect((await state()).cancel_reason).toBe('context_changed');
  });
  it.each(['paid', 'lost'])('does not schedule or send after %s', async dealStage => {
    await schedule(); await due();
    await query('UPDATE conversations SET deal_stage = ? WHERE id = ?', [dealStage, conversationId]);
    expect(await schedule()).toBe(false);
    expect((await runFollowUps()).cancelled).toBe(1); expect(transport).not.toHaveBeenCalled();
  });
  it('does not schedule against a refusal even before the deal stage is updated', async () => {
    await query("UPDATE messages SET content = 'لا أريد الشراء' WHERE conversationId = ?", [conversationId]);
    expect(await schedule()).toBe(false); expect(transport).not.toHaveBeenCalled();
  });
  it('cancels a follow-up after a new reply in the same second', async () => {
    await schedule(); await due();
    await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'عندي سؤال')", [conversationId]);
    expect((await runFollowUps()).cancelled).toBe(1); expect(transport).not.toHaveBeenCalled();
    expect((await state()).cancel_reason).toBe('customer_replied');
  });
  it('respects human takeover and rejects mismatched customer identity', async () => {
    expect(await scheduleFollowUp({ merchantId: fixture.merchantId, customerPhone: '966500009999', conversationId,
      followUpType: 'ghost' })).toBe(false);
    await schedule(); await due();
    await query('UPDATE conversations SET human_takeover = 1 WHERE id = ?', [conversationId]);
    expect((await runFollowUps()).cancelled).toBe(1); expect(transport).not.toHaveBeenCalled();
  });
  it.each(['failed', 'queued'])('does not record delivery as sent when transport returns %s', async status => {
    await schedule(); await due(); transport.mockResolvedValue({ accepted: false, status });
    expect((await runFollowUps()).errors).toBe(1);
    expect((await state()).sent_at).toBeNull();
    await runFollowUps(); expect(transport).toHaveBeenCalledTimes(1);
  });
  it('recovers an expired claim with the original transport key', async () => {
    await schedule(); await due();
    await query("UPDATE sales_followups SET processing_token = 'crashed', claimed_at = DATE_SUB(NOW(), INTERVAL 15 MINUTE) WHERE merchant_id = ?", [fixture.merchantId]);
    expect((await runFollowUps()).sent).toBe(1);
    expect(transport.mock.calls[0][0].idempotencyKey).toBe(`sales_followup:${fixture.merchantId}:${(await state()).id}`);
  });
  it('honors quiet hours independently of the server timezone', async () => {
    await schedule(); await due(); vi.setSystemTime(new Date('2026-09-23T21:00:00Z'));
    expect((await runFollowUps()).sent).toBe(0); expect(transport).not.toHaveBeenCalled();
    const scheduled = new Date((await state()).scheduled_at);
    expect(scheduled.toISOString()).toBe('2026-09-24T05:00:00.000Z');
  });
  it.each(['new reply', 'withdrawal', 'takeover', 'wrong phone', 'wrong merchant', 'wrong token', 'expired claim', 'cancelled', 'quiet hours', 'missing guard'])
    ('fences %s in the last transport read after an earlier successful eligibility check', async change => {
      await schedule(); await due(); const fu = await state();
      await query("UPDATE sales_followups SET processing_token = 'claim_fixture', claimed_at = UTC_TIMESTAMP(3) WHERE id = ?", [fu.id]);
      const input: any = { merchantId: fixture.merchantId, to: phone, idempotencyKey: `sales_followup:${fixture.merchantId}:${fu.id}`, followUpGuard: { id: fu.id, token: 'claim_fixture' } };
      expect(await canDispatchSalesFollowup((await getPool())!, input)).toBe(true);
      if (change === 'new reply') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','لا')", [conversationId]);
      if (change === 'withdrawal') await query("UPDATE campaign_consent_state SET status='withdrawn' WHERE merchant_id=?", [fixture.merchantId]);
      if (change === 'takeover') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]);
      if (change === 'wrong phone') input.to = '966500999999';
      if (change === 'wrong merchant') input.merchantId++;
      if (change === 'wrong token') input.followUpGuard.token = 'claim_foreign';
      if (change === 'expired claim') await query('UPDATE sales_followups SET claimed_at=TIMESTAMPADD(MINUTE,-11,UTC_TIMESTAMP()) WHERE id=?', [fu.id]);
      if (change === 'cancelled') await query('UPDATE sales_followups SET cancelled_at=UTC_TIMESTAMP() WHERE id=?', [fu.id]);
      if (change === 'quiet hours') vi.setSystemTime(new Date('2026-09-23T21:00:00Z'));
      if (change === 'missing guard') delete input.followUpGuard;
      expect(await canDispatchSalesFollowup((await getPool())!, input)).toBe(false);
    });
});
