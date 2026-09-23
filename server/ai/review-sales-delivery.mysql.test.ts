import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), fix: vi.fn() }));
vi.mock('../channels/whatsapp/service', () => ({ sendMerchantWhatsApp: mocks.send }));
vi.mock('./response-critic', () => ({ critiqueResponse: vi.fn().mockResolvedValue({ passed: false, score: 1, failures: ['Incomplete'], suggestions: 'fix' }),
  fixResponse: mocks.fix, recordCritique: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: vi.fn().mockResolvedValue('{"violations": []}') }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { reviewSalesResponse } from './review-sales-response';
import { buildReplyPlan, dispatchReplyPlan } from '../messaging/reply-plan';

describe.skipIf(!process.env.DATABASE_URL)('reviewed reply delivery', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number; let incomingMessageId: number;
  beforeEach(async () => {
    mocks.send.mockReset().mockResolvedValue({ accepted: true, status: 'sent' });
    mocks.fix.mockReset().mockResolvedValue('السماعة سعرها 230 ريال، وتشمل الخيارات المذكورة في الكتالوج.');
    fixture = await createDisposableMerchant('review-delivery');
    const pool = (await getPool())!;
    const [conversation] = await pool.execute<any>("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, '966500000085', 'active')", [fixture.merchantId]);
    conversationId = conversation.insertId;
    const [incoming] = await pool.execute<any>("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'كم سعر السماعة؟')", [conversationId]);
    incomingMessageId = incoming.insertId;
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  const plan = (text: string) => buildReplyPlan({ merchantId: fixture.merchantId, instanceId: 1, providerAccount: 'fixture',
    eventId: String(incomingMessageId), conversationId, incomingMessageId, to: '966500000085', text });
  it('sends and stages the corrected reply with fresh prices rather than the original', async () => {
    const corrected = await reviewSalesResponse({ merchantId: fixture.merchantId, response: 'سعرها 90 ريال',
      customerMessage: 'كم سعر السماعة؟', intent: 'inquiring', conversationHistory: [], productNames: ['سماعة (230 ريال)'] });
    await dispatchReplyPlan(plan(corrected));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ text: corrected }));
    expect(corrected).toContain('230'); expect(corrected).not.toContain('90');
    const [jobs] = await (await getPool())!.execute<any[]>('SELECT reply_text, state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]);
    expect(jobs).toEqual([expect.objectContaining({ reply_text: corrected, state: 'pending' })]);
  });
  it('suppresses the corrected reply and learning when a human takes ownership before delivery', async () => {
    const reply = plan('رد تم تجهيزه قبل تدخل الموظف');
    await (await getPool())!.execute('UPDATE conversations SET human_takeover = 1 WHERE id = ?', [conversationId]);
    expect(await dispatchReplyPlan(reply)).toBe('human_takeover'); expect(mocks.send).not.toHaveBeenCalled();
    const [jobs] = await (await getPool())!.execute<any[]>('SELECT state FROM ai_interaction_jobs WHERE merchant_id = ?', [fixture.merchantId]);
    expect(jobs[0].state).toBe('suppressed');
  });
});
