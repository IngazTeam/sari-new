import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { stageInteraction, finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';
import { prepareZidCheckout, acceptZidCheckout, handleZidCheckout } from './zid-checkout-agreements';
import type { CheckoutIdentity } from './checkout-agreements';
import { listZidReconciliations, reconcileZidCheckout } from './zid-checkout-reconciliation';
import { readSalesOrderFact } from './sales-order-fact-contract';

const mocks = vi.hoisted(() => ({ settings: vi.fn(), payments: vi.fn(), shipping: vi.fn(), create: vi.fn(), save: vi.fn(), view: vi.fn(), project: vi.fn() }));
vi.mock('../db_zid', () => ({ default: { getZidSettings: mocks.settings } }));
vi.mock('../db', () => ({ getPool: async()=> (await import('../db/connection')).getPool(), saveZidOrder: mocks.save, getZidProducts: vi.fn(), upsertNormalizedOrdersFromZid: mocks.project }));
vi.mock('../integrations/zid/zidClient', () => ({ ZidClient: class {
  getPaymentMethods = mocks.payments; getShippingMethods = mocks.shipping; createOrderFromWhatsApp = mocks.create;
  getOrderForReconciliation = mocks.view;
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
    mocks.project.mockResolvedValue({ sourceOrders: 1, projectedOrders: 1, acceptedOrders: 1 });
    mocks.view.mockReset();
  });
  afterEach(async () => {vi.restoreAllMocks();await cleanupDisposableMerchants([fixture.userId]);});
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
  async function unknown() {
    const q = await offer(); mocks.create.mockRejectedValueOnce(new Error('lost response'));
    await acceptZidCheckout(await incoming(), q.id);
    const [saved] = await quotes();
    const remote = { ...response(), order: { ...response().order, payment_status: 'pending',
      products: [{ id: 'Z1', sku: 'SKU1', quantity: 2 }],
      histories: [{ changed_by_details: { comment: `SARY-CHECKOUT:${saved.execution_attempt_id}` } }] } };
    mocks.view.mockResolvedValue(remote);
    return { q: saved, remote, input: { merchantId: fixture.merchantId, actorUserId: fixture.userId, quotationId: q.id, orderId: 999, reviewed: true as const } };
  }
  const orderFacts=()=>query('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? ORDER BY id',[fixture.merchantId]);
  it('order evidence: freezes the verified store and quote exactly once without payment or a guessed local alias',async()=>{
    const q=await offer(),consent=await incoming();await acceptZidCheckout(consent,q.id);const [row]=await orderFacts(),f=readSalesOrderFact(row);
    expect(f.snapshot).toMatchObject({provider:'zid',quotationId:q.id,orderReference:'999',localOrderId:null,quotedAmountMinor:23000,origin:'zid_create_response',paymentEvidence:'not_measured'});
    await acceptZidCheckout(consent,q.id);expect(await orderFacts()).toEqual([row]);expect(mocks.create).toHaveBeenCalledOnce();
    for(const secret of [phone,'Synthetic Recipient','Synthetic Street','fixture-only','https://fixture.zid.store/pay/999'])expect(JSON.stringify(row)).not.toContain(secret);
    expect(await query('SELECT id FROM ai_sales_payment_facts WHERE merchant_id=?',[fixture.merchantId])).toHaveLength(0);
  });
  it('order evidence: an unknown result records no order, then a correlated GET freezes one proof',async()=>{
    const {input}=await unknown();expect(await orderFacts()).toHaveLength(0);await reconcileZidCheckout(input);const [row]=await orderFacts();
    expect(readSalesOrderFact(row).snapshot.origin).toBe('zid_get_reconciliation');await reconcileZidCheckout(input);expect(await orderFacts()).toEqual([row]);expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('order evidence: projection repair cannot create a second or backdated fact',async()=>{
    const q=await offer();mocks.save.mockRejectedValueOnce(Error('Synthetic projection failure'));await acceptZidCheckout(await incoming(),q.id);
    const [row]=await orderFacts(),[saved]=await quotes();expect(saved.projection_pending).toBe(1);
    mocks.view.mockResolvedValue({order:{...response().order,products:[{id:'Z1',sku:'SKU1',quantity:2}],histories:[{comment:`SARY-CHECKOUT:${saved.execution_attempt_id}`}]}});
    await reconcileZidCheckout({merchantId:fixture.merchantId,actorUserId:fixture.userId,quotationId:q.id,orderId:999,reviewed:true});
    expect(await orderFacts()).toEqual([row]);expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('order evidence: failed atomic evidence save leaves the external effect unknown and never repeats POST',async()=>{
    const q=await offer(),consent=await incoming(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:any,args:any)=>{if(String(sql).includes('INSERT INTO ai_sales_order_facts'))throw Error('Synthetic fact failure');return target.execute(sql,args);};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await acceptZidCheckout(consent,q.id);vi.restoreAllMocks();expect((await quotes())[0].execution_state).toBe('unknown');expect(await orderFacts()).toHaveLength(0);
    await acceptZidCheckout(consent,q.id);expect(mocks.create).toHaveBeenCalledOnce();
    const [saved]=await quotes();mocks.view.mockResolvedValue({order:{...response().order,products:[{id:'Z1',sku:'SKU1',quantity:2}],histories:[{comment:`SARY-CHECKOUT:${saved.execution_attempt_id}`}]}});
    await reconcileZidCheckout({merchantId:fixture.merchantId,actorUserId:fixture.userId,quotationId:q.id,orderId:999,reviewed:true});expect(await orderFacts()).toHaveLength(1);
  });
  it.each(['same','different'])('order evidence: scopes a repeated order number to the %s store',async kind=>{
    const q=await offer();await acceptZidCheckout(await incoming(),q.id);const [first]=await orderFacts();
    const store=kind==='same'?'11':'12';mocks.settings.mockResolvedValue({isActive:1,storeId:store,accessToken:'fixture-only',managerToken:'fixture-only'});
    mocks.create.mockResolvedValue({order:{...response().order,store_id:Number(store)}});
    identity=await incoming('أريد شراء سماعة أخرى');const text=await prepareZidCheckout(identity,selection()),second=(await quotes()).at(-1);
    const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:phone,text});await stageInteraction(reply);await finishInteractionDelivery(reply,true);
    const consent=await incoming();await acceptZidCheckout(consent,second.id);await acceptZidCheckout(consent,second.id);
    expect(await orderFacts()).toHaveLength(kind==='same'?1:2);expect((await quotes()).at(-1).execution_state).toBe(kind==='same'?'unknown':'succeeded');
    if(kind==='different')expect((await orderFacts())[1].order_key).not.toBe(first.order_key);expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it.each(['before','after'])('order evidence: lost result commit %s acknowledgment never retries provider creation',async when=>{
    const q=await offer(),consent=await incoming(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let wrote=false;return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:any,args:any)=>{const r=await target.execute(sql,args);if(String(sql).includes('INSERT INTO ai_sales_order_facts'))wrote=true;return r;};
      if(key==='commit')return async()=>{if(wrote&&!hit){hit=true;if(when==='after')await target.commit();throw Error('Synthetic lost result commit');}return target.commit();};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await acceptZidCheckout(consent,q.id);vi.restoreAllMocks();expect(hit).toBe(true);expect(await orderFacts()).toHaveLength(when==='after'?1:0);
    await acceptZidCheckout(consent,q.id);expect(mocks.create).toHaveBeenCalledOnce();const [saved]=await quotes();
    mocks.view.mockResolvedValue({order:{...response().order,products:[{id:'Z1',sku:'SKU1',quantity:2}],histories:[{comment:`SARY-CHECKOUT:${saved.execution_attempt_id}`}]}});
    await reconcileZidCheckout({merchantId:fixture.merchantId,actorUserId:fixture.userId,quotationId:q.id,orderId:999,reviewed:true});expect(await orderFacts()).toHaveLength(1);expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('order evidence: replay of a pre-upgrade successful quote cannot invent creation time',async()=>{
    const q=await offer(),consent=await incoming();await acceptZidCheckout(consent,q.id);await query('DELETE FROM ai_sales_order_facts WHERE merchant_id=?',[fixture.merchantId]);
    await acceptZidCheckout(consent,q.id);expect(await orderFacts()).toHaveLength(0);expect(mocks.create).toHaveBeenCalledOnce();
  });
  it.each(['phone','source','consent','snapshot'])('order evidence: refuses %s drift while provider POST is in flight',async mode=>{
    const q=await offer(),consent=await incoming();mocks.create.mockImplementationOnce(async()=>{
      if(mode==='phone')await query("UPDATE sales_quotations SET customer_phone='966500009999' WHERE id=?",[q.id]);
      if(mode==='source')await query('UPDATE sales_quotations SET source_message_id=source_message_id+100000 WHERE id=?',[q.id]);
      if(mode==='consent')await query('UPDATE sales_quotations SET consent_message_id=consent_message_id+100000 WHERE id=?',[q.id]);
      if(mode==='snapshot')await query("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.options.storeId','12') WHERE id=?",[q.id]);return response();
    });
    await acceptZidCheckout(consent,q.id);expect((await quotes())[0].execution_state).toBe('unknown');expect(await orderFacts()).toHaveLength(0);expect(mocks.create).toHaveBeenCalledOnce();expect(mocks.save).not.toHaveBeenCalled();
  });
  it('order evidence: a reconciliation GET cannot certify consent changed during the request',async()=>{
    const {input,remote}=await unknown();mocks.view.mockImplementationOnce(async()=>{
      await query('UPDATE sales_quotations SET consent_message_id=consent_message_id+100000 WHERE id=?',[input.quotationId]);return remote;
    });
    await expect(reconcileZidCheckout(input)).rejects.toThrow('changed');expect(await orderFacts()).toHaveLength(0);expect((await quotes())[0].execution_state).toBe('unknown');expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('reconciles a lost remote response from GET evidence exactly once without another POST', async () => {
    const { q, input } = await unknown();
    expect(mocks.create.mock.calls[0][0].checkoutReference).toBe(`SARY-CHECKOUT:${q.execution_attempt_id}`);
    const results = await Promise.all([reconcileZidCheckout(input), reconcileZidCheckout(input)]);
    expect(results.every(r => r.verified && !r.projectionPending)).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const [saved] = await quotes(); expect(saved.execution_state).toBe('succeeded');
    const proof = typeof saved.external_reconciliation === 'string' ? JSON.parse(saved.external_reconciliation) : saved.external_reconciliation;
    expect(proof.actorUserId).toBe(fixture.userId); expect(proof.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await listZidReconciliations(fixture.merchantId)).items).toHaveLength(0);
  });
  it.each(['store', 'phone', 'masked phone', 'currency', 'url', 'amount', 'id', 'product', 'quantity', 'sku', 'duplicate', 'reference', 'missing reference'])
    ('rejects reconciliation with mismatched %s and leaves the attempt unknown', async attack => {
      const { input, remote } = await unknown(); const order: any = remote.order;
      if (attack === 'store') order.store_id = 12;
      if (attack === 'phone') order.customer.mobile = '966500999999';
      if (attack === 'masked phone') order.customer.mobile = '***000086';
      if (attack === 'currency') order.currency_code = 'USD';
      if (attack === 'url') order.order_url = 'https://user:password@example.com/';
      if (attack === 'amount') order.order_total = '-1';
      if (attack === 'id') order.id = 998;
      if (attack === 'product') order.products[0].id = 'foreign';
      if (attack === 'quantity') order.products[0].quantity = 1;
      if (attack === 'sku') order.products[0].sku = 'foreign';
      if (attack === 'duplicate') order.products.push(order.products[0]);
      if (attack === 'reference') order.histories[0].changed_by_details.comment += '-forged';
      if (attack === 'missing reference') delete order.histories;
      await expect(reconcileZidCheckout(input)).rejects.toThrow();
      expect((await quotes())[0].execution_state).toBe('unknown'); expect(mocks.project).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(1);
    });
  it('rejects foreign quotations before loading credentials or requesting the provider', async () => {
    const { input } = await unknown(); mocks.settings.mockClear();
    await expect(reconcileZidCheckout({ ...input, merchantId: fixture.merchantId + 9999999 })).rejects.toThrow();
    expect(mocks.settings).not.toHaveBeenCalled(); expect(mocks.view).not.toHaveBeenCalled();
    expect((await listZidReconciliations(fixture.merchantId + 9999999)).items).toEqual([]);
  });
  it('keeps legacy unknown attempts blocked without inventing a correlation', async () => {
    const { q, input } = await unknown(); await query('UPDATE sales_quotations SET execution_attempt_id = NULL WHERE id = ?', [q.id]);
    expect((await listZidReconciliations(fixture.merchantId)).items[0].canReview).toBe(false);
    await expect(reconcileZidCheckout(input)).rejects.toThrow(); expect(mocks.view).not.toHaveBeenCalled();
  });
  it('waits for active attempts, then allows abandoned processing to reconcile', async () => {
    const { q, input } = await unknown(); await query("UPDATE sales_quotations SET execution_state = 'processing' WHERE id = ?", [q.id]);
    await expect(reconcileZidCheckout(input)).rejects.toThrow(); expect(mocks.view).not.toHaveBeenCalled();
    await query('UPDATE sales_quotations SET execution_started_at = TIMESTAMPADD(MINUTE, -3, UTC_TIMESTAMP()) WHERE id = ?', [q.id]);
    expect((await reconcileZidCheckout(input)).verified).toBe(true);
  });
  it('repairs failed projections and preserves provider payment status', async () => {
    const { input, remote } = await unknown(); remote.order.payment_status = 'paid';
    mocks.project.mockRejectedValueOnce(new Error('local outage'));
    expect((await reconcileZidCheckout(input)).projectionPending).toBe(true);
    expect((await listZidReconciliations(fixture.merchantId)).items[0]).toMatchObject({ state: 'succeeded', orderId: 999, projectionPending: true });
    expect((await reconcileZidCheckout(input)).projectionPending).toBe(false);
    expect(mocks.project.mock.calls.at(-1)?.[1][0].paymentStatus).toBe('paid'); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('does not report a unavailable DB projection as completed', async () => {
    const { input } = await unknown(); mocks.project.mockResolvedValueOnce({ sourceOrders: 0, projectedOrders: 0, acceptedOrders: 0 });
    expect((await reconcileZidCheckout(input)).projectionPending).toBe(true);
  });
  it('does not overwrite a different late result after a slow provider GET', async () => {
    const { q, input, remote } = await unknown();
    mocks.view.mockImplementationOnce(async () => {
      await query("UPDATE sales_quotations SET execution_state = 'succeeded', external_result = ? WHERE id = ?", [JSON.stringify({ id: 998 }), q.id]);
      return remote;
    });
    await expect(reconcileZidCheckout(input)).rejects.toThrow('immutable'); expect(mocks.project).not.toHaveBeenCalled();
  });
  it('prevents the same external order from being bound to another saved agreement', async () => {
    const { input, q } = await unknown();
    await query(`INSERT INTO sales_quotations (merchant_id, quotation_number, items, subtotal, total, external_provider, external_order_key)
      VALUES (?, 'OTHER', '[]', 1, 1, 'zid', '11:999')`, [fixture.merchantId]);
    await expect(reconcileZidCheckout(input)).rejects.toThrow();
    expect((await query('SELECT execution_state FROM sales_quotations WHERE id = ?', [q.id]))[0].execution_state).toBe('unknown');
  });
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
    expect((await quotes())[0].projection_pending).toBe(1);
  });
  it('timestamps the initial projection before the remote POST and carries the saved cart', async () => {
    const q = await offer(); let duringPost = 0;
    mocks.create.mockImplementationOnce(async () => { duringPost = Date.now(); return response(); });
    await acceptZidCheckout(await incoming(), q.id);
    expect(mocks.save.mock.calls[0][2]).toBeInstanceOf(Date);
    expect(mocks.save.mock.calls[0][2].getTime()).toBeLessThanOrEqual(duringPost);
    expect(mocks.save.mock.calls[0][1].items).toEqual([{ id: 'Z1', sku: 'SKU1', name: 'سماعة', quantity: 2, price: 100 }]);
  });
  it('leaves an unrelated conversation question to the reply engine', async () => {
    expect(await handleZidCheckout({ ...identity, message: 'كم السعر؟' })).toBeNull(); expect(mocks.create).not.toHaveBeenCalled();
  });
});
