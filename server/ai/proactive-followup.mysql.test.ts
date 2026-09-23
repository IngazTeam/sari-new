import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
vi.mock('../channels/whatsapp/service', () => ({ sendMerchantWhatsApp: transport }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { scheduleFollowUp, runFollowUps } from './proactive-followup';

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
    await runFollowUps(); expect(transport).toHaveBeenCalledTimes(1);
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
});
