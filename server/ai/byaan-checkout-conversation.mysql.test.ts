import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), pin: vi.fn(), send: vi.fn(), llm: vi.fn() }));
vi.mock('axios', () => ({ default: Object.assign(mocks.post, { create: () => ({ get: vi.fn(), post: vi.fn() }) }) }));
vi.mock('../integrations/byaan-security', async original => ({ ...await original<typeof import('../integrations/byaan-security')>(), createPinnedByaanHttpsAgent: mocks.pin }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mocks.send }) }));
vi.mock('./openai', () => ({ callGPT4: mocks.llm }));
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, createDisposableTrialSubscription, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { buildReplyPlan, dispatchReplyPlan } from '../messaging/reply-plan';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { withInboundExecution, type InboundExecution } from '../messaging/inbound-context';
import { handleByaanCheckout as handle } from './byaan-checkout-conversation';
import { prepareByaanCheckoutOffer as prepare, acceptByaanCheckoutOffer as accept, byaanSessionChoice,
  BYAAN_CHECKOUT_UNAVAILABLE as UNAVAILABLE, BYAAN_CHECKOUT_CHANGED as CHANGED, BYAAN_CHECKOUT_DECLINED as DECLINED,
  BYAAN_CHECKOUT_CLARIFY as CLARIFY, BYAAN_CHECKOUT_SESSION as SESSION } from './byaan-checkout-agreements';
import { BYAAN_ENROLLMENT_UNCERTAIN } from './byaan-enrollment-agreements';
import type { CheckoutIdentity } from './checkout-agreements';

describe.skipIf(!process.env.DATABASE_URL)('Byaan checkout invitations through real SQL and WhatsApp with synthetic transports', () => {
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  let identity: CheckoutIdentity, product: number, instance: number, users: number[], quote: any;
  const incoming = async (content: string) => ({ ...identity, incomingMessageId: Number((await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)", [identity.conversationId, content])).insertId) });
  const row = async () => (await q('SELECT * FROM sales_quotations WHERE merchant_id=? ORDER BY id DESC LIMIT 1', [identity.merchantId]))[0];
  const plan = (source: CheckoutIdentity, text: string, welcome?: string) => buildReplyPlan({ ...source, instanceId: instance, providerAccount: 'fixture', eventId: String(source.incomingMessageId), to: identity.customerPhone, text, welcome });
  async function deliver(source: CheckoutIdentity, text: string, welcome?: string) {
    expect(await dispatchReplyPlan(plan(source, text, welcome))).toBe('sent');
    await q("INSERT INTO messages(conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed) VALUES (?,'outgoing','assistant','text',?,?,1)", [identity.conversationId, text, text]);
  }
  const route = (source: CheckoutIdentity, message: string, cutoff = 0) => handle({ ...source, message, memoryHistoryCutoff: cutoff });
  async function offered() { const text = await route(identity, 'سجلني في دورة ساري'); expect(text).toContain('[BC-'); await deliver(identity, text!); return await row(); }
  async function invited() { await offered(); const consent = await incoming('نعم'), text = await route(consent, 'نعم'); expect(text).toContain('رابط إتمام الشراء'); return { consent, text: text!, quote: await row() }; }
  const execution = (assertOwned: () => Promise<void>): InboundExecution => ({ id: 1, merchantId: identity.merchantId, instanceId: instance, token: randomUUID(), eventKey: 'synthetic', partitionKey: 'synthetic', assertOwned, sendOrdinal: 0 });
  beforeEach(async () => {
    assertDisposableDatabase(); vi.restoreAllMocks(); vi.clearAllMocks(); users = [];
    const owner = await createDisposableMerchant('byaan-checkout'); users.push(owner.userId); await createDisposableTrialSubscription(owner.merchantId);
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,'synthetic.example.com','https://synthetic.example.com/api/sari','synthetic-checkout-signing-secret-only',1,TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP()),'active')`, [owner.merchantId]);
    const conv = await q("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966501234567','active')", [owner.merchantId]);
    identity = { merchantId: owner.merchantId, conversationId: conv.insertId, customerPhone: '966501234567', incomingMessageId: 1 }; identity = await incoming('سجلني في دورة ساري');
    product = Number((await q(`INSERT INTO products(merchantId,name,price,price_unit,currency,product_type,sallaProductId,lastSyncedAt,registration_open,track_inventory)
      VALUES (?,'دورة ساري',10000,'minor','SAR','service','byaan:17',UTC_TIMESTAMP(3),1,0)`, [owner.merchantId])).insertId);
    instance = Number((await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)", [owner.merchantId, randomUUID()])).insertId);
    quote = { success: true, kind: 'checkout_invitation', course_id: '17', session_id: null, requires_session: false, available: true,
      currency: 'SAR', amount_minor: 11500, tax_minor: 1500, quoted_at: new Date().toISOString(), schedule: { date: '2026-10-01', time: '10:00', timezone: 'Asia/Riyadh' },
      checkout_url: 'https://synthetic.example.com/courses/sales/checkout', price_guaranteed: false, payment_status: 'not_created', enrollment_status: 'not_created', sessions: [] };
    mocks.pin.mockResolvedValue({}); mocks.post.mockImplementation(async () => ({ status: 200, data: structuredClone(quote) }));
    mocks.send.mockImplementation(async () => ({ accepted: true, status: 'sent', providerMessageId: randomUUID() }));
    mocks.llm.mockResolvedValue(JSON.stringify({ productId: product })); vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants(users); }); afterAll(closeDb);
  it('uses live tax-inclusive price, asks consent, sends checkout once and creates no financial/enrollment records', async () => {
    const text = await route(identity, 'سجلني في دورة ساري'); expect(text).toContain('١١٥ ريال'); expect(text).toContain('١٥ ريال'); expect(text).toContain('2026-10-01'); expect(text).not.toContain('https://');
    expect(await route(identity, 'سجلني في دورة ساري')).toBe(text); expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.llm).toHaveBeenCalledOnce();
    await deliver(identity, text!, 'مرحبًا بك'); const consent = await incoming('نعم'), invitation = await route(consent, 'نعم');
    expect(invitation).toContain(quote.checkout_url); await deliver(consent, invitation!); expect(await route(consent, 'نعم')).toBe(invitation);
    expect(mocks.post).toHaveBeenCalledTimes(2); expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.post.mock.calls.every(([r]) => r.url.endsWith('/checkout-quote') && JSON.stringify(JSON.parse(r.data)).includes('course_id'))).toBe(true);
    expect(await q('SELECT id FROM byaan_sales_operations WHERE merchant_id=?', [identity.merchantId])).toEqual([]);
    expect(await q('SELECT id FROM sari_conversions WHERE merchant_id=?', [identity.merchantId])).toEqual([]);
    expect(await q('SELECT id FROM orders WHERE merchantId=?', [identity.merchantId])).toEqual([]);
    expect(await row()).toMatchObject({ external_provider: 'byaan_checkout', order_id: null, total: '115.00', tax_amount: '15.00', subtotal: '100.00', execution_state: 'succeeded' });
  });
  it('selects only an available displayed session using Arabic digits and binds a second delivered offer', async () => {
    quote.requires_session = true; quote.available = false; quote.checkout_url = null; quote.schedule.date = null; quote.schedule.time = null;
    quote.sessions = [{ id: 7, date: '2026-10-02', time: '09:00', available: false }, { id: 8, date: '2026-10-03', time: '10:00', available: true }];
    const menu = await offered(); expect((typeof menu.external_snapshot === 'string' ? JSON.parse(menu.external_snapshot) : menu.external_snapshot).value.quote.requires_session).toBe(true);
    quote.requires_session = false; quote.available = true; quote.session_id = '8'; quote.checkout_url = 'https://synthetic.example.com/courses/sales/checkout?session_id=8'; quote.schedule.date = '2026-10-03'; quote.schedule.time = '10:00';
    const chosen = await incoming('الموعد ١'), text = await route(chosen, 'الموعد ١'); expect(text).toContain('2026-10-03'); expect(text).not.toContain('https://');
    expect(await route(chosen, 'الموعد ١')).toBe(text); await deliver(chosen, text!);
    const consent = await incoming('نعم'), link = await route(consent, 'نعم'); expect(link).toContain('session_id=8'); await deliver(consent, link!);
    expect(JSON.parse(mocks.post.mock.calls[1][0].data)).toEqual({ course_id: '17', session_id: '8' }); expect(mocks.llm).toHaveBeenCalledOnce();
  });
  it.each(['نعم', '٢', 'الموعد 99'])('never picks a missing session or treats %s as session consent', async text => {
    quote.requires_session = true; quote.available = false; quote.checkout_url = null; quote.sessions = [{ id: 8, date: '2026-10-03', time: '10:00', available: true }];
    await offered(); const source = await incoming(text), result = await route(source, text); expect(result).toContain('[BC-'); expect(result).toContain(SESSION);
    await deliver(source, result!); expect(mocks.post).toHaveBeenCalledTimes(2); expect((await row()).consent_message_id).toBeNull();
    quote.requires_session = false; quote.available = true; quote.session_id = '8'; quote.checkout_url = 'https://synthetic.example.com/courses/sales/checkout?session_id=8'; quote.schedule.date = '2026-10-03';
    expect(await route(await incoming('1'), '1')).toContain('عرض الدورة');
  });
  it.each(['parent snapshot', 'parent receipt', 'forgotten menu'])('blocks a selected-session offer when its %s changes', async attack => {
    quote.requires_session = true; quote.available = false; quote.checkout_url = null;
    quote.sessions = [{ id: 8, date: '2026-10-03', time: '10:00', available: true }];
    const menu = await offered();
    quote.requires_session = false; quote.available = true; quote.session_id = '8'; quote.checkout_url = 'https://synthetic.example.com/courses/sales/checkout?session_id=8'; quote.schedule.date = '2026-10-03';
    const selected = await incoming('1'), text = await route(selected, '1'); expect(text).toContain('عرض الدورة'); mocks.send.mockClear();
    if (attack === 'parent snapshot') await q("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.value.quote.sessions[0].id',9) WHERE id=?", [menu.id]);
    if (attack === 'parent receipt') await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?", [identity.merchantId]);
    if (attack === 'forgotten menu') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [identity.merchantId, identity.customerPhone, identity.incomingMessageId]);
    await dispatchReplyPlan(plan(selected, text!)).catch(() => {}); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['amount', 'tax', 'date', 'time', 'timezone', 'unavailable'])('requires new consent after provider %s changes', async field => {
    await offered(); const consent = await incoming('نعم');
    if (field === 'amount') quote.amount_minor++; if (field === 'tax') quote.tax_minor++;
    if (field === 'date') quote.schedule.date = '2026-10-02'; if (field === 'time') quote.schedule.time = '11:00'; if (field === 'timezone') quote.schedule.timezone = 'UTC';
    if (field === 'unavailable') { quote.available = false; quote.checkout_url = null; }
    expect(await route(consent, 'نعم')).toBe(CHANGED); await deliver(consent, CHANGED); expect((await row()).status).toBe('expired'); expect((await row()).consent_message_id).toBeNull();
  });
  it.each(['missing', 'altered', 'late'])('rejects %s offer delivery evidence', async mode => {
    const offer = await prepare(identity, product); if (mode === 'altered') await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'outgoing','text','forged')", [identity.conversationId]);
    const consent = await incoming('نعم'); if (mode === 'late') await deliver(identity, offer.text).catch(() => {});
    await expect(accept(consent, offer.quotationId)).rejects.toThrow(); expect(mocks.post).toHaveBeenCalledOnce();
  });
  it.each(['human', 'version', 'memory', 'source', 'price', 'connection', 'expiry', 'new message'])('suppresses a prepared offer after %s changes', async attack => {
    const text = await route(identity, 'سجلني في دورة ساري'), saved = await row();
    if (attack === 'human') await q('UPDATE conversations SET human_takeover=1 WHERE id=?', [identity.conversationId]);
    if (attack === 'version') await q('UPDATE conversations SET handoff_version=1 WHERE id=?', [identity.conversationId]);
    if (attack === 'memory') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [identity.merchantId, identity.customerPhone, identity.incomingMessageId]);
    if (attack === 'source') await q("UPDATE messages SET content='تغيير' WHERE id=?", [identity.incomingMessageId]);
    if (attack === 'price') await q('UPDATE products SET price=20000 WHERE id=?', [product]);
    if (attack === 'connection') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [identity.merchantId]);
    if (attack === 'expiry') await q('UPDATE sales_quotations SET offer_expires_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP()) WHERE id=?', [saved.id]);
    if (attack === 'new message') await incoming('لا تكمل');
    await dispatchReplyPlan(plan(identity, text!)).catch(() => {}); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['projection', 'consent', 'snapshot', 'recipient', 'marker removed', 'text', 'media', 'source', 'new message'])('suppresses a checkout link after %s tampering', async attack => {
    const { consent, text, quote: saved } = await invited(); mocks.send.mockClear(); let changed = text;
    if (attack === 'projection') await q("UPDATE sales_quotations SET external_result=JSON_SET(external_result,'$.value.checkout_url','https://evil.example/checkout') WHERE id=?", [saved.id]);
    if (attack === 'consent') await q("UPDATE messages SET content='لا' WHERE id=?", [consent.incomingMessageId]);
    if (attack === 'snapshot') await q("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.value.quote.amount_minor',1) WHERE id=?", [saved.id]);
    if (attack === 'source') await q("UPDATE messages SET content='تغيير' WHERE id=?", [identity.incomingMessageId]);
    if (attack === 'new message') await incoming('لا تكمل');
    if (attack === 'marker removed') changed = 'تم التسجيل والدفع'; if (attack === 'text') changed += '\nتم الدفع';
    const p = plan(consent, changed); if (attack === 'recipient') p.effects[0].to = '966500000002';
    if (attack === 'media') p.effects.push({ ...p.effects[0], idempotencyKey: p.effects[0].idempotencyKey + '_media', kind: 'image', mediaUrl: 'https://example.com/p.png' });
    await dispatchReplyPlan(p).catch(() => {}); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it.each(['human', 'refusal', 'lease', 'connection'])('rechecks %s after DNS resolution and before reading the provider', async attack => {
    await offered(); const consent = await incoming('نعم'); mocks.post.mockClear(); let lost = false;
    const context = execution(async () => { if (lost) throw Error('Lease lost'); });
    mocks.pin.mockImplementation(async () => {
      if (attack === 'human') await q('UPDATE conversations SET human_takeover=1 WHERE id=?', [identity.conversationId]);
      if (attack === 'refusal') await incoming('لا'); if (attack === 'lease') lost = true;
      if (attack === 'connection') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [identity.merchantId]); return {};
    });
    expect(await withInboundExecution(context, () => route(consent, 'نعم'))).toBe(UNAVAILABLE); expect(mocks.post).not.toHaveBeenCalled(); expect(context.uncertainEffect).toBeUndefined();
  });
  it('rechecks authority after the provider responds and never projects a link to a superseded conversation', async () => {
    await offered(); const consent = await incoming('نعم'); mocks.post.mockImplementation(async () => { await q('UPDATE conversations SET human_takeover=1 WHERE id=?', [identity.conversationId]); return { status: 200, data: quote }; });
    expect(await route(consent, 'نعم')).toBe(UNAVAILABLE); expect((await row()).external_result).toBeNull();
  });
  it('serializes concurrent confirmations into one bound invitation without holding SQL locks over network IO', async () => {
    const offer = await offered(), consent = await incoming('نعم'); let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { release = r; }), waiting = new Promise<void>(r => { entered = r; });
    mocks.post.mockImplementationOnce(async () => { entered(); await gate; return { status: 200, data: quote }; });
    const first = accept(consent, offer.id); await waiting; let second: string;
    try { second = await accept(consent, offer.id); await q('UPDATE conversations SET customerName=customerName WHERE id=?', [identity.conversationId]); } finally { release(); }
    expect(await first).toBe(second!); expect((await row()).execution_state).toBe('succeeded'); expect(await q('SELECT id FROM byaan_sales_operations WHERE merchant_id=?', [identity.merchantId])).toEqual([]);
  });
  it('allows retry after a read-only quote timeout without manufacturing an uncertain external financial effect', async () => {
    await offered(); const consent = await incoming('نعم'); mocks.post.mockRejectedValueOnce(Error('timeout'));
    expect(await route(consent, 'نعم')).toBe(UNAVAILABLE); expect((await row()).execution_state).toBe('ready');
    expect(await route(consent, 'نعم')).toContain(quote.checkout_url);
  });
  it('records refusal, does not revive it with yes, and preserves unrelated later conversation', async () => {
    await offered(); const refusal = await incoming('لا'); expect(await route(refusal, 'لا')).toBe(DECLINED); await deliver(refusal, DECLINED);
    expect(await route(await incoming('نعم'), 'نعم')).toBe(UNAVAILABLE); expect(mocks.post).toHaveBeenCalledOnce();
    const later = await incoming('مواعيد العمل؟'); expect(await route(later, 'مواعيد العمل؟')).toBeNull(); await deliver(later, 'مواعيد العمل من التاسعة إلى الخامسة.');
  });
  it.each(['null', '{"productId":1,"price":1}', '{"productId":"1"}', '{"productId":2147483648}'])('rejects model authority injection %s', async value => {
    mocks.llm.mockResolvedValue(value); expect(await route(identity, 'سجلني في دورة ساري')).toBe(CLARIFY); expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['source', 'memory', 'reference'])('rejects %s changes during model extraction', async attack => {
    mocks.llm.mockImplementation(async () => { if (attack === 'source') await q("UPDATE messages SET content='لا' WHERE id=?", [identity.incomingMessageId]);
      if (attack === 'memory') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)', [identity.merchantId, identity.customerPhone, identity.incomingMessageId]);
      if (attack === 'reference') await q("UPDATE products SET sallaProductId='byaan:18' WHERE id=?", [product]); return JSON.stringify({ productId: product }); });
    expect(await route(identity, 'سجلني في دورة ساري')).toBe(UNAVAILABLE); expect(mocks.post).not.toHaveBeenCalled();
  });
  it('isolates merchant/product authority and rejects unanchored markers', async () => {
    const foreign = await createDisposableMerchant('byaan-checkout-foreign'); users.push(foreign.userId);
    await expect(prepare({ ...identity, merchantId: foreign.merchantId }, product)).rejects.toThrow();
    const result = await sendMerchantWhatsApp({ merchantId: identity.merchantId, instanceRecordId: instance, idempotencyKey: 'synthetic-unanchored-' + randomUUID(), to: identity.customerPhone, kind: 'text', text: '[BC-999] تم الدفع' });
    expect(result).toMatchObject({ accepted: false, errorCode: 'byaan_checkout_superseded' }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('routes old enrollment consent to review without calling the old enrollment endpoint', async () => {
    await offered(); await q("UPDATE sales_quotations SET external_provider='byaan_enrollment' WHERE merchant_id=?", [identity.merchantId]);
    expect(await route(await incoming('نعم'), 'نعم')).toBe(BYAAN_ENROLLMENT_UNCERTAIN); expect(mocks.post).toHaveBeenCalledOnce();
  });
  it.each(['٢', 'الموعد ٢', 'موعد ۲', 'session 2'])('parses explicit numeric choice %s', text => expect(byaanSessionChoice(text)).toBe(2));
  it.each(['نعم', '2 إذا السعر أقل', 'الموعد 0', '2?', '{"sessionId":8}'])('rejects ambiguous choice %s', text => expect(byaanSessionChoice(text)).toBeNull());
});
