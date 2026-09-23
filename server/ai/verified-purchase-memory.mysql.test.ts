import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { applyTapOrderPaymentState } from '../payment/order-payment-state';
import { getLearningEvidence } from '../db/learning';

describe.skipIf(!process.env.DATABASE_URL)('verified payment memory and learning', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number;
  const phone = '966500000084';
  const query = async (sql: string, params: any[] = []) => (await (await getPool())!.execute<any>(sql, params))[0];
  const profile = async () => (await query('SELECT * FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ?', [fixture.merchantId, phone]))[0];
  beforeEach(async () => {
    fixture = await createDisposableMerchant('verified-memory');
    const c = await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')", [fixture.merchantId, phone]);
    conversationId = c.insertId;
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  async function payment(amount = 23000, currency = 'SAR', attributedConversation = conversationId) {
    const order = await query(`INSERT INTO orders (merchantId, customerPhone, customerName, items, totalAmount, currency)
      VALUES (?, ?, 'Synthetic', ?, ?, ?)`, [fixture.merchantId, phone,
      JSON.stringify([{ productId: 1, name: 'سماعة اختبار', quantity: 1, price: amount }]), amount, currency]);
    const charge = `chg_brain_order_${order.insertId}`;
    const p = await query(`INSERT INTO order_payments (merchant_id, order_id, customer_phone, amount, currency, status, tap_charge_id, metadata)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`, [fixture.merchantId, order.insertId, phone, amount, currency, charge,
      JSON.stringify({ conversationId: attributedConversation })]);
    return { paymentId: p.insertId, tapChargeId: charge, expectedMerchantId: fixture.merchantId,
      expectedAmount: amount, expectedCurrency: currency, providerStatus: 'CAPTURED' };
  }
  it('projects a verified payment and its learning signal once on duplicate delivery', async () => {
    const input = await payment(); await applyTapOrderPaymentState(input);
    const before = await profile(); await applyTapOrderPaymentState(input); const after = await profile();
    expect(Number(after.total_spent)).toBe(230); expect(after.verified_purchase_count).toBe(1);
    expect(after.memory_version).toBe(before.memory_version);
    expect(JSON.parse(after.purchase_history)).toEqual(['سماعة اختبار']);
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(1);
    expect(await query('SELECT signal_type FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ signal_type: 'purchase_completed' })]);
  });
  it('reverses purchase count, revenue and tier on a verified refund without reviving a late capture', async () => {
    const input = await payment(600000); await applyTapOrderPaymentState(input);
    expect((await profile()).customer_tier).toBe('vip');
    expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({ verifiedPurchases: 1, verifiedRefunds: 0 });
    await applyTapOrderPaymentState({ ...input, providerStatus: 'REFUNDED' });
    await applyTapOrderPaymentState(input);
    const actual = await profile(); expect(Number(actual.total_spent)).toBe(0);
    expect(actual.verified_purchase_count).toBe(0); expect(actual.customer_tier).toBe('new');
    expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({ verifiedPurchases: 0, verifiedRefunds: 1 });
    expect(JSON.parse(actual.purchase_history)).toEqual([]);
    expect(await query('SELECT outcome_type FROM ai_purchase_outcomes WHERE merchant_id = ? ORDER BY id', [fixture.merchantId]))
      .toEqual([expect.objectContaining({ outcome_type: 'purchase_completed' }), expect.objectContaining({ outcome_type: 'purchase_refunded' })]);
  });
  it('keeps currencies separate in customer memory', async () => {
    await applyTapOrderPaymentState(await payment(23000, 'SAR'));
    await applyTapOrderPaymentState(await payment(60000, 'USD'));
    const actual = await profile(); expect(Number(actual.total_spent)).toBe(230);
    expect(JSON.parse(actual.verified_spend_by_currency)).toEqual({ SAR: 23000, USD: 60000 });
    expect(actual.verified_purchase_count).toBe(2);
  });
  it.each([2, 6])('does not lose %i concurrent payments for different orders of the same customer', async count => {
    const inputs = [];
    for (let index = 0; index < count; index++) inputs.push(await payment(11000));
    await Promise.all(inputs.map(applyTapOrderPaymentState));
    expect(Number((await profile()).total_spent)).toBe(110 * count);
    expect((await profile()).verified_purchase_count).toBe(count);
  });
  it('does not learn payment success from authorization or failure', async () => {
    const input = await payment();
    await applyTapOrderPaymentState({ ...input, providerStatus: 'AUTHORIZED' });
    await applyTapOrderPaymentState({ ...input, providerStatus: 'FAILED' });
    expect(await profile()).toBeUndefined();
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(0);
  });
  it('does not attribute a real payment to a different customer conversation', async () => {
    const other = await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, '966500999999', 'active')", [fixture.merchantId]);
    await applyTapOrderPaymentState(await payment(23000, 'SAR', other.insertId));
    expect((await profile()).verified_purchase_count).toBe(1);
    expect(await query('SELECT id FROM sari_learning_signals WHERE merchant_id = ?', [fixture.merchantId])).toHaveLength(0);
    const outcomes = await query('SELECT conversation_id FROM ai_purchase_outcomes WHERE merchant_id = ?', [fixture.merchantId]);
    expect(outcomes[0].conversation_id).toBeNull();
  });
  it('keeps the payment unchanged if a caller supplies another merchant identity', async () => {
    const input = await payment();
    await expect(applyTapOrderPaymentState({ ...input, expectedMerchantId: fixture.merchantId + 999999 })).rejects.toThrow();
    expect((await query('SELECT status FROM order_payments WHERE id = ?', [input.paymentId]))[0].status).toBe('pending');
    expect(await profile()).toBeUndefined();
  });
});
