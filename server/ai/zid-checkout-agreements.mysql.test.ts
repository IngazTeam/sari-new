import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { stageInteraction, finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';
import { prepareZidCheckout, acceptZidCheckout, handleZidCheckout } from './zid-checkout-agreements';
import type { CheckoutIdentity } from './checkout-agreements';

const mocks = vi.hoisted(() => ({ settings: vi.fn(), payments: vi.fn(), shipping: vi.fn(), create: vi.fn(), save: vi.fn() }));
vi.mock('../db_zid', () => ({ default: { getZidSettings: mocks.settings } }));
vi.mock('../db', () => ({ saveZidOrder: mocks.save, getZidProducts: vi.fn() }));
vi.mock('../integrations/zid/zidClient', () => ({ ZidClient: class {
  getPaymentMethods = mocks.payments; getShippingMethods = mocks.shipping; createOrderFromWhatsApp = mocks.create;
} }));

describe.skipIf(!process.env.DATABASE_URL)('Zid saved agreement adversarial SQL and transport', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, identity: CheckoutIdentity;
  const phone = '966500000086';
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const selection = () => ({ products: [{ name: 'سماعة', quantity: 2, sku: 'SKU1', zidProductId: 'Z1' }], customerName: 'Synthetic Recipient',
    address: { line1: 'Synthetic Street 1', city: 'Riyadh', countryCode: 'SA' } });
  const payment = { id: 1, name: 'رابط دفع', fees: 0, enabled: true, code: 'payment_link.zidpay' };
  const shipping = { id: 2, name: 'توصيل', fees: 10, enabled: true };
  const response = () => ({ order: { id: 999, code: 'FIXTURE-999', store_id: 11, order_url: 'https://fixture.zid.store/pay/999',
    order_total: '230.00', currency_code: 'SAR', customer: { mobile: phone } } });
  beforeEach(async () => {
    vi.clearAllMocks();
    fixture = await createDisposableMerchant('zid-agreement-pentest');
    const c = await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')", [fixture.merchantId, phone]);
    const m = await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', 'أريد شراء 2 سماعة')", [c.insertId]);
    identity = { merchantId: fixture.merchantId, conversationId: c.insertId, incomingMessageId: m.insertId, customerPhone: phone };
    await query(`INSERT INTO zid_products (merchant_id, zid_product_id, zid_sku, name_ar, price, quantity)
      VALUES (?, 'Z1', 'SKU1', 'سماعة', 100, 10)`, [fixture.merchantId]);
    mocks.settings.mockResolvedValue({ isActive: 1, storeId: '11', accessToken: 'fixture-only', managerToken: 'fixture-only' });
    mocks.payments.mockResolvedValue({ payment_methods: [payment] });
    mocks.shipping.mockResolvedValue({ shipping_methods: [shipping] });
    mocks.create.mockResolvedValue(response()); mocks.save.mockResolvedValue({ id: 1 });
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  const quotes = () => query('SELECT * FROM sales_quotations WHERE merchant_id = ? ORDER BY id', [fixture.merchantId]);
  async function incoming(content = 'نعم') {
    const m = await query("INSERT INTO messages (conversationId, direction, messageType, content) VALUES (?, 'incoming', 'text', ?)", [identity.conversationId, content]);
    return { ...identity, incomingMessageId: m.insertId };
  }
  async function offer(delivered = true) {
    const text = await prepareZidCheckout(identity, selection());
    const [quote] = await quotes(); expect(text).toContain(`[ZQ-${quote.id}]`);
    const reply = buildReplyPlan({ ...identity, instanceId: 1, providerAccount: 'fixture', eventId: String(identity.incomingMessageId), to: phone, text });
    await stageInteraction(reply); if (delivered) await finishInteractionDelivery(reply, true);
    return quote;
  }
  it('persists the displayed items, recipient, methods and provisional prices before any external write', async () => {
    const q = await offer(); expect(mocks.create).not.toHaveBeenCalled();
    expect(q).toMatchObject({ external_provider: 'zid', execution_state: 'ready', checkout_snapshot: null });
    const s = typeof q.external_snapshot === 'string' ? JSON.parse(q.external_snapshot) : q.external_snapshot;
    expect(s.subtotalMinor).toBe(20000); expect(Number(q.subtotal)).toBe(200);
    expect(s.selection.address).toEqual(selection().address);
  });
  it('creates the exact saved cart only once under concurrent acceptance, then reuses its verified result', async () => {
    const q = await offer(), consent = await incoming();
    const results = await Promise.all([acceptZidCheckout(consent, q.id), acceptZidCheckout(consent, q.id)]);
    expect(results.some(v => v.includes('FIXTURE-999'))).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: phone, customerName: 'Synthetic Recipient',
      address: selection().address, products: [{ sku: 'SKU1', quantity: 2 }], paymentMethodId: 1, shippingMethodId: 2, isPaymentLink: true }));
    expect(await acceptZidCheckout(consent, q.id)).toContain('FIXTURE-999'); expect(mocks.create).toHaveBeenCalledTimes(1);
    expect((await quotes())[0]).toMatchObject({ execution_state: 'succeeded', consent_message_id: consent.incomingMessageId });
  });
  it.each(['لا', 'غير موافق', 'لا أريد الشراء', 'نعم لكن غير الكمية', 'نعم؟', 'yes?'])('does not turn %s into an external order', async text => {
    const q = await offer(); await acceptZidCheckout(await incoming(text), q.id);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['merchant', 'phone', 'message', 'quote'])('rejects cross-scope %s substitution before provider calls', async field => {
    const q = await offer(), consent = await incoming(); mocks.payments.mockClear();
    const attack = { ...consent, ...(field === 'merchant' ? { merchantId: fixture.merchantId + 9000000 } : {}),
      ...(field === 'phone' ? { customerPhone: "' OR 1=1 --" } : {}), ...(field === 'message' ? { incomingMessageId: 90000000 } : {}) };
    await expect(acceptZidCheckout(attack, field === 'quote' ? q.id + 9000000 : q.id)).rejects.toThrow();
    expect(mocks.payments).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('requires accepted delivery, an unchanged last question and no newer employee message', async () => {
    const q = await offer(false); await acceptZidCheckout(await incoming(), q.id);
    expect(mocks.create).not.toHaveBeenCalled();
    await query("UPDATE ai_interaction_jobs SET state = 'pending' WHERE conversation_id = ?", [identity.conversationId]);
    await query("INSERT INTO messages (conversationId, direction, messageType, content, aiResponse) VALUES (?, 'outgoing', 'text', 'هل تفضل الاتصال؟', 0)", [identity.conversationId]);
    await acceptZidCheckout(await incoming(), q.id); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['price = 101', 'quantity = 1', 'is_active = 0', 'is_published = 0', "currency = 'USD'", "zid_sku = 'CHANGED'"])
    ('invalidates the saved agreement after catalogue change %s', async change => {
      const q = await offer(); await query(`UPDATE zid_products SET ${change} WHERE merchant_id = ?`, [fixture.merchantId]);
      expect(await acceptZidCheckout(await incoming(), q.id)).toContain('تغيرت');
      expect(mocks.create).not.toHaveBeenCalled(); expect((await quotes())[0].status).toBe('expired');
    });
  it.each(['address', 'customerName', 'gift', 'unknown product', 'duplicate'])('does not invent or drop required cart details: %s', async field => {
    const raw: any = selection(); if (field === 'address' || field === 'customerName') delete raw[field];
    if (field === 'gift') raw.isGift = true;
    if (field === 'unknown product') raw.products[0].zidProductId = 'foreign';
    if (field === 'duplicate') raw.products.push(raw.products[0]);
    await expect(prepareZidCheckout(identity, raw)).rejects.toThrow();
    expect(await quotes()).toHaveLength(0); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not replace online payment with COD or choose an arbitrary delivery option', async () => {
    mocks.payments.mockResolvedValue({ payment_methods: [{ ...payment, code: 'cod' }] });
    await expect(prepareZidCheckout(identity, selection())).rejects.toThrow();
    mocks.payments.mockResolvedValue({ payment_methods: [payment] });
    mocks.shipping.mockResolvedValue({ shipping_methods: [shipping, { ...shipping, id: 3, name: 'Express' }] });
    await expect(prepareZidCheckout(identity, selection())).rejects.toThrow();
    const text = await prepareZidCheckout(identity, { ...selection(), shippingMethodName: 'Express' });
    expect(text).toContain('Express'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['store', 'shipping fee', 'method id', 'expiry', 'human', 'newer message'])('revalidates %s before the external write', async change => {
    const q = await offer(), consent = await incoming();
    if (change === 'store') mocks.settings.mockResolvedValue({ isActive: 1, storeId: '12', accessToken: 'fixture', managerToken: 'fixture' });
    if (change === 'shipping fee') mocks.shipping.mockResolvedValue({ shipping_methods: [{ ...shipping, fees: 20 }] });
    if (change === 'method id') mocks.payments.mockResolvedValue({ payment_methods: [{ ...payment, id: 22 }] });
    if (change === 'expiry') await query('UPDATE sales_quotations SET offer_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id = ?', [q.id]);
    if (change === 'human') await query('UPDATE conversations SET human_takeover = 1 WHERE id = ?', [identity.conversationId]);
    if (change === 'newer message') await incoming('لا أريد الشراء');
    await acceptZidCheckout(consent, q.id).catch(() => undefined);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rechecks takeover after slow provider reads and before claiming execution', async () => {
    const q = await offer(), consent = await incoming();
    mocks.shipping.mockImplementationOnce(async () => {
      await query('UPDATE conversations SET human_takeover = 1 WHERE id = ?', [identity.conversationId]);
      return { shipping_methods: [shipping] };
    });
    await expect(acceptZidCheckout(consent, q.id)).rejects.toThrow('authority'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('keeps timeouts unknown and blocks automatic retries and new offers until reconciliation', async () => {
    const q = await offer(), consent = await incoming(); mocks.create.mockRejectedValue(new Error('lost response after remote creation'));
    expect(await acceptZidCheckout(consent, q.id)).toContain('قيد التحقق');
    expect((await quotes())[0].execution_state).toBe('unknown');
    expect(await acceptZidCheckout(consent, q.id)).toContain('قيد التحقق');
    expect(await prepareZidCheckout(await incoming('أريد شراء 2 سماعة'), selection())).toContain('قيد التحقق');
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['store', 'phone', 'currency', 'url', 'amount'])('does not trust a malformed or foreign provider result: %s', async change => {
    const q = await offer(); const value: any = response();
    if (change === 'store') value.order.store_id = 12;
    if (change === 'phone') value.order.customer.mobile = '966500999999';
    if (change === 'currency') value.order.currency_code = 'USD';
    if (change === 'url') value.order.order_url = 'javascript:alert(1)';
    if (change === 'amount') value.order.order_total = '-1';
    mocks.create.mockResolvedValue(value);
    expect(await acceptZidCheckout(await incoming(), q.id)).toContain('قيد التحقق');
    expect(mocks.save).not.toHaveBeenCalled(); expect((await quotes())[0].execution_state).toBe('unknown');
  });
  it('does not repeat a succeeded remote order when local order projection fails', async () => {
    const q = await offer(), consent = await incoming(); mocks.save.mockRejectedValue(new Error('local DB unavailable'));
    expect(await acceptZidCheckout(consent, q.id)).toContain('FIXTURE-999');
    expect(await acceptZidCheckout(consent, q.id)).toContain('FIXTURE-999'); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('leaves an unrelated conversation question to the reply engine', async () => {
    expect(await handleZidCheckout({ ...identity, message: 'كم السعر؟' })).toBeNull(); expect(mocks.create).not.toHaveBeenCalled();
  });
});
