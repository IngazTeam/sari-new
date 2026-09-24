import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { prepareCheckoutQuote, acceptCheckoutQuote, approveCheckoutInvoice, type CheckoutIdentity, type CheckoutResult, checkoutSelectionSchema } from './checkout-agreements';
import { issueCanonicalOrderPaymentLink } from '../payment/order-payment-link';
import { stageInteraction, finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';

describe.skipIf(!process.env.DATABASE_URL)('persisted checkout agreement and consent', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, identity: CheckoutIdentity, productId: number;
  const phone = '966500000083';
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  beforeEach(async () => {
    fixture = await createDisposableMerchant('checkout-agreement');
    const c = await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')", [fixture.merchantId, phone]);
    const m = await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'أريد شراء 3 سماعات')", [c.insertId]);
    identity = { merchantId: fixture.merchantId, conversationId: c.insertId, customerPhone: phone, incomingMessageId: m.insertId };
    const p = await query("INSERT INTO products (merchantId, name, price, price_unit, currency, stock) VALUES (?, 'سماعة', 9999, 'minor', 'SAR', 20)", [fixture.merchantId]);
    productId = p.insertId;
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  const selection = () => [{ productId, variantId: null, quantity: 3 }];
  const orders = () => query('SELECT * FROM orders WHERE merchantId = ?', [fixture.merchantId]);
  async function incoming(content = 'نعم') {
    const m = await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', ?)", [identity.conversationId, content]);
    return { ...identity, incomingMessageId: m.insertId };
  }
  async function offer(accepted = true) {
    const result = await prepareCheckoutQuote(identity, selection());
    expect(result.kind).toBe('quote'); const quote = result as Extract<CheckoutResult, {kind:'quote'}>;
    const reply = buildReplyPlan({ ...identity, instanceId: 1, providerAccount: 'fixture', eventId: String(identity.incomingMessageId), to: phone, text: quote.text });
    await stageInteraction(reply);
    if (accepted) await finishInteractionDelivery(reply, true);
    return quote;
  }
  it('persists quantities, exact minor money and compatible major-unit quotation fields before creating any order', async () => {
    const quote = await offer(); expect(await orders()).toHaveLength(0);
    expect(quote.snapshot.totalMinor).toBe(29997);
    expect(quote.text).toContain('× 3'); expect(quote.text).toContain('مراجعة قبل الدفع');
    const [q] = await query('SELECT * FROM sales_quotations WHERE id = ?', [quote.quotationId]);
    expect(Number(q.total)).toBe(299.97); expect(JSON.parse(q.items)[0]).toMatchObject({ quantity: 3, unitPrice: 99.99, total: 299.97 });
  });
  it('records the exact consent and one canonical order under two concurrent workers and replay', async () => {
    const quote = await offer(), consent = await incoming();
    const results = await Promise.all([acceptCheckoutQuote(consent, quote.quotationId), acceptCheckoutQuote(consent, quote.quotationId)]);
    expect(results.every(r => r.kind === 'order')).toBe(true);
    const [order] = await orders(); expect(await orders()).toHaveLength(1);
    expect(JSON.parse(order.items)[0]).toMatchObject({ productId, quantity: 3, price: 9999 });
    expect(order.totalAmount).toBe(29997); expect(order.payment_status).toBe('unpaid');
    expect((await acceptCheckoutQuote(consent, quote.quotationId)).kind).toBe('order');
    const [q] = await query('SELECT consent_message_id, order_id FROM sales_quotations WHERE id = ?', [quote.quotationId]);
    expect(q).toMatchObject({ consent_message_id: consent.incomingMessageId, order_id: order.id });
  });
  it('does not issue a payment link for a provisional catalogue subtotal with unverified tax or delivery', async () => {
    const quote = await offer(); await acceptCheckoutQuote(await incoming(), quote.quotationId);
    const [order] = await orders(); expect(order.checkout_review_required).toBe(1);
    expect(await issueCanonicalOrderPaymentLink({ merchantId: fixture.merchantId, orderId: order.id, conversationId: identity.conversationId }))
      .toEqual({ issued: false, reason: 'order_not_payable' });
  });
  it.each(['لا أريد الشراء', 'لا', 'مش عايز أشتري', "Don't place my order", 'Do not complete the order',
    "Don't proceed with the order", 'not now', 'Not yet.', 'I am not ready to buy', 'Yes, but do not place the order'])('withdraws pending consent on %s', async message => {
    const quote = await offer(); expect((await acceptCheckoutQuote(await incoming(message), quote.quotationId)).kind).toBe('declined');
    expect(await orders()).toHaveLength(0);
    expect((await query('SELECT status FROM sales_quotations WHERE id = ?', [quote.quotationId]))[0].status).toBe('rejected');
    expect((await acceptCheckoutQuote(await incoming('Yes'), quote.quotationId)).kind).toBe('changed');
    expect(await orders()).toHaveLength(0);
  });
  it.each(['إزاي أطلب الدورة؟', 'شلون أطلب؟', 'How do I complete my order?', 'Can I place my order here?', 'Yes?', 'Yes, but change the quantity'])
   ('does not create an order or attach consent for %s', async message => {
      const quote = await offer();
      expect((await acceptCheckoutQuote(await incoming(message), quote.quotationId)).kind).toBe('clarify');
      expect(await orders()).toHaveLength(0);
      const [row] = await query('SELECT status, consent_message_id, order_id FROM sales_quotations WHERE id = ?', [quote.quotationId]);
      expect(row).toMatchObject({ status: 'sent', consent_message_id: null, order_id: null });
    });
  it('allows a scoped merchant attestation without changing the customer-consented amount', async () => {
    const quote = await offer(); await acceptCheckoutQuote(await incoming(), quote.quotationId); const [order] = await orders();
    const approval = { merchantId: fixture.merchantId, orderId: order.id, actorUserId: fixture.userId, expectedAmountMinor: 29997, totalIsFinal: true as const };
    await approveCheckoutInvoice(approval); await approveCheckoutInvoice(approval);
    expect((await orders())[0]).toMatchObject({ checkout_review_required: 0, totalAmount: 29997, payment_status: 'unpaid' });
    const [q] = await query('SELECT checkout_snapshot FROM sales_quotations WHERE id = ?', [quote.quotationId]);
    const snapshot = typeof q.checkout_snapshot === 'string' ? JSON.parse(q.checkout_snapshot) : q.checkout_snapshot;
    expect(snapshot.billingApproval).toMatchObject({ actorUserId: fixture.userId, totalMinor: 29997 });
    expect(await issueCanonicalOrderPaymentLink({ merchantId: fixture.merchantId, orderId: order.id }))
      .toEqual({ issued: false, reason: 'gateway_not_ready' });
  });
  it.each(['foreign merchant', 'changed total', 'cancelled', 'changed catalog', 'changed items'])('blocks invoice approval for %s', async change => {
    const quote = await offer(); await acceptCheckoutQuote(await incoming(), quote.quotationId); const [order] = await orders();
    if (change === 'changed total') await query('UPDATE orders SET totalAmount = 1 WHERE id = ?', [order.id]);
    if (change === 'cancelled') await query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
    if (change === 'changed catalog') await query('UPDATE products SET price = price + 1 WHERE id = ?', [productId]);
    if (change === 'changed items') await query("UPDATE orders SET items = '[]' WHERE id = ?", [order.id]);
    await expect(approveCheckoutInvoice({ merchantId: fixture.merchantId + (change === 'foreign merchant' ? 9000000 : 0),
      orderId: order.id, actorUserId: fixture.userId, expectedAmountMinor: 29997, totalIsFinal: true })).rejects.toThrow();
    expect((await orders())[0].checkout_review_required).toBe(1);
  });
  it('does not interpret quantity changes or a question as approval', async () => {
    const quote = await offer(); expect((await acceptCheckoutQuote(await incoming('نعم لكن أبغى 5'), quote.quotationId)).kind).toBe('clarify');
    expect(await orders()).toHaveLength(0);
  });
  it('does not accept a quote whose delivery was not confirmed', async () => {
    const quote = await offer(false); expect((await acceptCheckoutQuote(await incoming(), quote.quotationId)).kind).toBe('clarify');
    expect(await orders()).toHaveLength(0);
  });
  it('binds yes to the latest delivered question, not an older purchase offer', async () => {
    const quote = await offer(); const info = await incoming('أرسل التفاصيل');
    const reply = buildReplyPlan({ ...info, instanceId: 1, providerAccount: 'fixture', eventId: String(info.incomingMessageId), to: phone, text: 'هل أشرح لك المواصفات؟' });
    await stageInteraction(reply); await finishInteractionDelivery(reply, true);
    expect((await acceptCheckoutQuote(await incoming(), quote.quotationId)).kind).toBe('clarify');
    expect(await orders()).toHaveLength(0);
  });
  it('does not use a yes to an intervening human question as consent to the bot offer', async () => {
    const quote = await offer();
    await query("INSERT INTO messages (conversationId, direction, messageType, content, isProcessed) VALUES (?, 'outgoing', 'text', 'هل تفضل الاتصال؟', 1)", [identity.conversationId]);
    expect((await acceptCheckoutQuote(await incoming(), quote.quotationId)).kind).toBe('clarify');
    expect(await orders()).toHaveLength(0);
  });
  it.each(['price = 10000', 'stock = 2', 'isActive = 0', "price_unit = 'unverified'", 'registration_open = 0'])('revalidates catalog authority before INSERT: %s', async change => {
    const quote = await offer(); await query(`UPDATE products SET ${change} WHERE id = ?`, [productId]);
    expect((await acceptCheckoutQuote(await incoming(), quote.quotationId)).kind).toBe('changed');
    expect(await orders()).toHaveLength(0);
  });
  it('expires the offer and refuses a later assent', async () => {
    const quote = await offer(); await query('UPDATE sales_quotations SET offer_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id = ?', [quote.quotationId]);
    expect((await acceptCheckoutQuote(await incoming(), quote.quotationId)).kind).toBe('changed');
    expect(await orders()).toHaveLength(0);
  });
  it('does not apply an older message after a newer refusal or employee takeover', async () => {
    const quote = await offer(), consent = await incoming(); await incoming('لا أريد الشراء');
    await expect(acceptCheckoutQuote(consent, quote.quotationId)).rejects.toThrow('superseded');
    const latest = await incoming(); await query('UPDATE conversations SET human_takeover = 1 WHERE id = ?', [identity.conversationId]);
    await expect(acceptCheckoutQuote(latest, quote.quotationId)).rejects.toThrow('authority');
    expect(await orders()).toHaveLength(0);
  });
  it('keeps ownership scopes exact for both quotations and consent messages', async () => {
    const quote = await offer(), consent = await incoming();
    await expect(acceptCheckoutQuote({ ...consent, merchantId: fixture.merchantId + 9000000 }, quote.quotationId)).rejects.toThrow('authority');
    await expect(acceptCheckoutQuote({ ...consent, customerPhone: phone + '0' }, quote.quotationId)).rejects.toThrow('authority');
    await expect(acceptCheckoutQuote({ ...consent, incomingMessageId: consent.incomingMessageId + 9000000 }, quote.quotationId)).rejects.toThrow('ownership');
    expect(await orders()).toHaveLength(0);
  });
  it('does not substitute an unresolved variant and preserves an explicitly free option', async () => {
    await query('UPDATE products SET has_variants = 1, stock = 0 WHERE id = ?', [productId]);
    const v = await query("INSERT INTO product_variants (product_id, merchant_id, name, price, price_unit, stock) VALUES (?, ?, 'صغير', 0, 'minor', 5)", [productId, fixture.merchantId]);
    await expect(prepareCheckoutQuote(identity, selection())).rejects.toThrow('option required');
    const result = await prepareCheckoutQuote(identity, [{ productId, variantId: v.insertId, quantity: 2 }]);
    expect(result.kind === 'quote' && result.snapshot.totalMinor).toBe(0);
  });
  it('does not create local orders for externally managed commerce products', async () => {
    await query("UPDATE products SET sallaProductId = 'external-order-owner' WHERE id = ?", [productId]);
    await expect(prepareCheckoutQuote(identity, selection())).rejects.toThrow('unavailable');
  });
  it('rejects forged prices, fractional or missing quantities and duplicate item references', async () => {
    expect(checkoutSelectionSchema.safeParse([{ productId, quantity: 0, variantId: null }]).success).toBe(false);
    expect(checkoutSelectionSchema.safeParse([{ productId, quantity: 1.5, variantId: null }]).success).toBe(false);
    expect(checkoutSelectionSchema.safeParse([{ productId, quantity: 1, variantId: null, price: 1 }]).success).toBe(false);
    await expect(prepareCheckoutQuote(identity, [...selection(), ...selection()])).rejects.toThrow('Duplicate');
    expect(await orders()).toHaveLength(0);
  });
});
