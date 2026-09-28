import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getPool } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { stageCheckoutOfferFixture } from '../tests/helpers/checkout-offer';
import { buildReplyPlan } from '../messaging/reply-plan';
import { prepareByaanEnrollmentOffer as prepare, acceptByaanEnrollmentOffer as accept, recoverByaanEnrollmentProjection as recoverProjection, readByaanEnrollmentReply } from './byaan-enrollment-agreements';
import { enrollTrainee, createPaymentLink } from '../integrations/byaan';
import { byaanRouter } from '../routers-byaan';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';
import { byaanSalesFailure } from '../integrations/byaan-sales-contract';
import type { CheckoutIdentity } from './checkout-agreements';

const provider = vi.hoisted(() => ({ request: vi.fn(), pin: vi.fn() }));
vi.mock('axios', () => ({ default: provider.request }));
vi.mock('../integrations/byaan-security', async original => ({ ...await original<typeof import('../integrations/byaan-security')>(), createPinnedByaanHttpsAgent: provider.pin }));

describe.skipIf(!process.env.DATABASE_URL)('Byaan enrollment projection restoration SQL and API boundaries', () => {
  let identity: CheckoutIdentity, product: number, users: number[], owner: number;
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const incoming = async (content = 'نعم', at = identity) => ({ ...at, incomingMessageId: Number((await q(
    "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)", [at.conversationId, content])).insertId) });
  const ledger = () => q('SELECT * FROM byaan_sales_operations WHERE merchant_id=?', [identity.merchantId]);
  const quotes = () => q('SELECT * FROM sales_quotations WHERE merchant_id=? ORDER BY id', [identity.merchantId]);
  const read = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
  async function offer(mode = 'normal') {
    const result = await prepare(identity, product);
    if (result.kind !== 'quote') throw Error('Expected offer');
    if (mode !== 'missing') await stageCheckoutOfferFixture(buildReplyPlan({ ...identity, instanceId: 1, providerAccount: 'fixture',
      eventId: String(identity.incomingMessageId), to: identity.customerPhone, text: mode === 'altered' ? result.text + '\nهل تريد التفاصيل؟' : result.text }), mode !== 'unaccepted');
    return result;
  }
  beforeEach(async () => {
    assertDisposableDatabase(); vi.restoreAllMocks(); vi.clearAllMocks(); users = [];
    const m = await createDisposableMerchant('byaan-consent'); users.push(m.userId); owner = m.userId;
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,'synthetic.example.com','https://synthetic.example.com/api/sari','synthetic-enrollment-signing-secret-only',1,TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP()),'active')`, [m.merchantId]);
    const conv = await q("INSERT INTO conversations(merchantId,customerPhone,customerName,status) VALUES (?,'966501234567','عميل اختبار','active')", [m.merchantId]);
    identity = { merchantId: m.merchantId, conversationId: Number(conv.insertId), incomingMessageId: 1, customerPhone: '966501234567' };
    identity = await incoming('سجلني في دورة المبيعات');
    product = Number((await q(`INSERT INTO products(merchantId,name,nameAr,price,price_unit,currency,product_type,sallaProductId,lastSyncedAt,
      course_start_date,course_end_date,max_students,enrolled_count,registration_open,track_inventory)
      VALUES (?,'Sales course','دورة المبيعات',12550,'minor','SAR','service','byaan:c-1',UTC_TIMESTAMP(3),
        TIMESTAMPADD(DAY,7,UTC_TIMESTAMP()),TIMESTAMPADD(DAY,8,UTC_TIMESTAMP()),20,3,1,0)`, [m.merchantId])).insertId);
    provider.pin.mockResolvedValue({}); provider.request.mockResolvedValue({ status: 200, data: { enrollment_id: 'enroll-1' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);

  const recover = async (actor = owner, merchantId = identity.merchantId, operationId?: number) => recoverProjection(merchantId, actor, { operationId: operationId ?? (await ledger())[0].id });
  const caller = (actor = owner, merchant = identity.merchantId) => byaanRouter.createCaller({ user: { id: actor, role: 'user' }, req: { headers: { 'x-merchant-id': String(merchant) } }, res: {} } as any);
  const successful = async () => {
    const quote = await offer(), consent = await incoming();
    expect(await accept(consent, quote.quotationId)).toMatchObject({ result: { success: true } });
    return { quote, consent };
  };
  const erase = (state = 'processing') => q('UPDATE sales_quotations SET external_result=NULL,execution_state=?,status=? WHERE merchant_id=?', [state, state === 'succeeded' ? 'accepted' : 'viewed', identity.merchantId]);
  const effects = async () => ({ operations: await ledger(), conversations: await q('SELECT * FROM conversations WHERE merchantId=?', [identity.merchantId]),
    messages: await q('SELECT * FROM messages WHERE conversationId=? ORDER BY id', [identity.conversationId]),
    jobs: await q('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? ORDER BY id', [identity.merchantId]),
    deliveries: await q('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? ORDER BY id', [identity.merchantId]),
    conversions: await q('SELECT * FROM sari_conversions WHERE merchant_id=? ORDER BY id', [identity.merchantId]),
    orders: await q('SELECT * FROM orders WHERE merchantId=? ORDER BY id', [identity.merchantId]) });

  it.each(['processing', 'unknown', 'succeeded'])('restores a missing %s projection once without external or messaging effects', async state => {
    const { quote, consent } = await successful(); await erase(state); const before = await effects();
    const first = await caller().recoverEnrollmentProjection({ operationId: before.operations[0].id });
    expect(first).toMatchObject({ merchantId: identity.merchantId, operationId: before.operations[0].id, quotationId: quote.quotationId,
      replayed: false, recovery: { reviewerUserId: owner }, paymentEvidence: 'not_verified', providerStatus: 'not_checked', externalRequest: 'not_sent', customerMessage: 'not_sent' });
    const restored = (await quotes())[0];
    expect(restored).toMatchObject({ execution_state: 'succeeded', status: 'accepted' });
    expect(read(restored.external_result).value.recovery.previousState).toBe(state);
    const again = await recover(); expect(again).toEqual({ ...first, replayed: true });
    expect((await quotes())[0]).toEqual(restored); expect(await effects()).toEqual(before);
    await expect(readByaanEnrollmentReply(consent, quote.quotationId)).rejects.toThrow('Recovered enrollment requires human follow-up');
    expect(provider.request).toHaveBeenCalledOnce();
  });
  it('returns an already present matching projection without inserting a recovery stamp', async () => {
    await successful(); const before = await quotes(); expect(await recover()).toMatchObject({ replayed: true, recovery: null });
    expect(await quotes()).toEqual(before); expect(provider.request).toHaveBeenCalledOnce();
  });
  it('upgrades a valid unknown projection only when the bound durable ledger is reported', async () => {
    await successful(); const row = (await quotes())[0], prior = read(row.external_result).value;
    prior.receipt = { ...byaanSalesFailure('unknown'), operationId: prior.receipt.operationId };
    await q("UPDATE sales_quotations SET external_result=?,execution_state='unknown',status='viewed' WHERE id=?", [JSON.stringify({ value: prior, digest: digest(prior) }), row.id]);
    expect(await recover()).toMatchObject({ replayed: false }); expect((await quotes())[0].execution_state).toBe('succeeded'); expect(provider.request).toHaveBeenCalledOnce();
  });
  it.each(['handoff', 'later-refusal', 'expired-catalog', 'aged-consent', 'customer-renamed'])('restores historical evidence after %s without resuming automation', async mode => {
    const { quote, consent } = await successful(); await erase();
    if (mode === 'handoff') await q('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1,automation_after_message_id=? WHERE id=?', [consent.incomingMessageId, identity.conversationId]);
    if (mode === 'later-refusal') await incoming('لا تسجلني');
    if (mode === 'expired-catalog') { await q('UPDATE products SET price=999,registration_open=0 WHERE id=?', [product]); await q('UPDATE sales_quotations SET offer_expires_at=TIMESTAMPADD(DAY,-1,UTC_TIMESTAMP()) WHERE id=?', [quote.quotationId]); }
    if (mode === 'aged-consent') await q('UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP()) WHERE conversationId=?', [identity.conversationId]);
    if (mode === 'customer-renamed') await q("UPDATE conversations SET customerName='اسم محدث' WHERE id=?", [identity.conversationId]);
    const before = await effects(); expect(await recover()).toMatchObject({ replayed: false }); expect(await effects()).toEqual(before);
    await expect(readByaanEnrollmentReply(consent, quote.quotationId)).rejects.toThrow(); expect(provider.request).toHaveBeenCalledOnce();
  });
  it('accepts normal receipt delivery/read progression without altering the stored recovery audit', async () => {
    await successful(); await erase(); const first = await recover(), saved = (await quotes())[0];
    for (const status of ['delivered', 'read']) {
      await q('UPDATE whatsapp_message_deliveries SET status=? WHERE merchant_id=?', [status, identity.merchantId]);
      expect(await recover()).toEqual({ ...first, replayed: true }); expect((await quotes())[0]).toEqual(saved);
    }
  });
  it.each(['unknown', 'preparing', 'dispatching', 'not_sent', 'missing-operation'])('never promotes a ledger that is %s', async state => {
    await successful(); await erase(); const operationId = (await ledger())[0].id;
    if (state === 'missing-operation') await q('DELETE FROM byaan_sales_operations WHERE id=?', [operationId]);
    else if (['preparing', 'dispatching'].includes(state)) await q('UPDATE byaan_sales_operations SET state=?,result_json=NULL,result_hash=NULL WHERE id=?', [state, operationId]);
    else await q('UPDATE byaan_sales_operations SET state=? WHERE id=?', [state, operationId]);
    const before = await quotes(); await expect(recover(owner, identity.merchantId, operationId)).rejects.toThrow('Byaan enrollment recovery unavailable');
    expect(await quotes()).toEqual(before); expect(provider.request).toHaveBeenCalledOnce();
  });
  it.each(['source', 'consent', 'consent-seal', 'snapshot', 'total', 'projection-seal', 'projection-reference', 'tracking', 'operation-seal', 'attempt', 'receipt', 'outgoing', 'missing-quote', 'memory', 'connection', 'disconnected', 'conversation-owner', 'recipient', 'rejected'])('rejects %s loss or tampering without repairing evidence', async mode => {
    const { quote, consent } = await successful();
    if (!['projection-seal', 'projection-reference'].includes(mode)) await erase();
    if (mode === 'source') await q("UPDATE messages SET content='غير محفوظ' WHERE id=?", [identity.incomingMessageId]);
    if (mode === 'consent') await q("UPDATE messages SET content='لا' WHERE id=?", [consent.incomingMessageId]);
    if (mode === 'consent-seal') await q("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.consent.digest',REPEAT('0',64)) WHERE id=?", [quote.quotationId]);
    if (mode === 'snapshot') await q("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.value.traineeName','forged') WHERE id=?", [quote.quotationId]);
    if (mode === 'total') await q('UPDATE sales_quotations SET total=1 WHERE id=?', [quote.quotationId]);
    if (mode === 'projection-seal') await q("UPDATE sales_quotations SET external_result=JSON_SET(external_result,'$.digest',REPEAT('0',64)) WHERE id=?", [quote.quotationId]);
    if (mode === 'projection-reference') {
      const value = read((await quotes())[0].external_result).value; value.receipt.enrollmentId = 'wrong';
      await q('UPDATE sales_quotations SET external_result=? WHERE id=?', [JSON.stringify({ value, digest: digest(value) }), quote.quotationId]);
    }
    if (mode === 'tracking') await q('DELETE FROM sari_conversions WHERE merchant_id=?', [identity.merchantId]);
    if (mode === 'operation-seal') await q('UPDATE byaan_sales_operations SET result_hash=? WHERE merchant_id=?', ['0'.repeat(64), identity.merchantId]);
    if (mode === 'attempt') await q('UPDATE sales_quotations SET execution_attempt_id=? WHERE id=?', [randomUUID(), quote.quotationId]);
    if (mode === 'receipt') await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?", [identity.merchantId]);
    if (mode === 'outgoing') await q('DELETE FROM messages WHERE conversationId=? AND direction=\'outgoing\'', [identity.conversationId]);
    if (mode === 'missing-quote') await q('DELETE FROM sales_quotations WHERE id=?', [quote.quotationId]);
    if (mode === 'memory') await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE memory_forget_before_message_id=VALUES(memory_forget_before_message_id)', [identity.merchantId, identity.customerPhone, consent.incomingMessageId]);
    if (mode === 'connection') await q("UPDATE byaan_connections SET webhook_secret='rotated-synthetic-secret-signing-only' WHERE merchant_id=?", [identity.merchantId]);
    if (mode === 'disconnected') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [identity.merchantId]);
    if (mode === 'conversation-owner') { const other = await createDisposableMerchant('foreign-recover'); users.push(other.userId); await q('UPDATE conversations SET merchantId=? WHERE id=?', [other.merchantId, identity.conversationId]); }
    if (mode === 'recipient') await q("UPDATE conversations SET customerPhone='966500000002' WHERE id=?", [identity.conversationId]);
    if (mode === 'rejected') await q("UPDATE sales_quotations SET status='rejected' WHERE id=?", [quote.quotationId]);
    const before = await quotes(), ledgerBefore = await ledger();
    await expect(recover()).rejects.toThrow('Byaan enrollment recovery unavailable'); expect(await quotes()).toEqual(before); expect(await ledger()).toEqual(ledgerBefore);
    expect(provider.request).toHaveBeenCalledOnce();
  });
  it.each(['owner-disabled', 'owner-inactive', 'merchant-suspended', 'foreign', 'viewer', 'manager-disabled', 'manager', 'sales_supervisor'])('requires fresh persisted authority: %s', async mode => {
    await successful(); await erase(); let actor = owner;
    if (mode === 'owner-disabled') await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES(?,?,'owner',0)", [identity.merchantId, owner]);
    if (mode === 'owner-inactive') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner]);
    if (mode === 'merchant-suspended') await q("UPDATE merchants SET status='suspended' WHERE id=?", [identity.merchantId]);
    if (['foreign', 'viewer', 'manager-disabled', 'manager', 'sales_supervisor'].includes(mode)) {
      const other = await createDisposableMerchant('recovery-actor'); users.push(other.userId); actor = other.userId;
      if (mode !== 'foreign') await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES(?,?,?,?)', [identity.merchantId, actor, mode === 'manager-disabled' ? 'manager' : mode, mode === 'manager-disabled' ? 0 : 1]);
    }
    const before = await quotes();
    if (['manager', 'sales_supervisor'].includes(mode)) expect(await caller(actor).recoverEnrollmentProjection({ operationId: (await ledger())[0].id })).toMatchObject({ recovery: { reviewerUserId: actor } });
    else { await expect(recover(actor)).rejects.toThrow('Byaan enrollment recovery unavailable'); await expect(caller(actor).recoverEnrollmentProjection({ operationId: (await ledger())[0].id })).rejects.toBeDefined(); expect(await quotes()).toEqual(before); }
    expect(provider.request).toHaveBeenCalledOnce();
  });
  it('serializes concurrent restoration with one immutable audit', async () => {
    await successful(); await erase(); const results = await Promise.all(Array.from({ length: 4 }, () => recover()));
    expect(results.filter(r => !r.replayed)).toHaveLength(1); expect(new Set(results.map(r => JSON.stringify(r.recovery))).size).toBe(1);
    expect(provider.request).toHaveBeenCalledOnce();
  });
  it.each(['rollback', 'commit'])('recovers an interrupted local restoration %s without duplicate enrollment', async phase => {
    await successful(); await erase(); const pool = (await getPool())!, get = pool.getConnection.bind(pool); let hit = false, destroyed = 0;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await get(), execute = c.execute.bind(c), commit = c.commit.bind(c), destroy = c.destroy.bind(c); let writing = false;
      vi.spyOn(c, 'destroy').mockImplementation(() => { destroyed++; destroy(); });
      vi.spyOn(c, 'execute').mockImplementation((async (sql: string, args: any[]) => {
        if (sql.includes("SET execution_state='succeeded',status='accepted',external_result=?")) writing = true;
        const value = await execute(sql, args); if (!hit && writing && phase === 'rollback') { hit = true; throw Error('lost SQL write'); } return value;
      }) as any);
      vi.spyOn(c, 'commit').mockImplementation(async () => { await commit(); if (!hit && writing && phase === 'commit') { hit = true; throw Error('lost acknowledgement'); } });
      return c;
    });
    await expect(recover()).rejects.toThrow('Byaan enrollment recovery unavailable'); expect(hit).toBe(true); vi.restoreAllMocks();
    expect(await recover()).toMatchObject({ replayed: phase === 'commit' }); expect(provider.request).toHaveBeenCalledOnce();
    if (phase === 'commit') expect(destroyed).toBeGreaterThan(0);
  });
  it('restores a real failed post-enrollment projection without replaying the integration helper', async () => {
    const quote = await offer(), consent = await incoming(), pool = (await getPool())!, get = pool.getConnection.bind(pool); let hit = false;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await get(), execute = c.execute.bind(c);
      vi.spyOn(c, 'execute').mockImplementation((async (sql: string, args: any[]) => {
        const value = await execute(sql, args);
        if (!hit && sql.includes('SET execution_state=?,status=?,external_result=?')) { hit = true; throw Error('lost projection write'); }
        return value;
      }) as any); return c;
    });
    expect(await accept(consent, quote.quotationId)).toMatchObject({ kind: 'review', result: { success: true } }); expect(hit).toBe(true); vi.restoreAllMocks();
    expect((await quotes())[0]).toMatchObject({ execution_state: 'processing', external_result: null });
    expect(await recover()).toMatchObject({ replayed: false }); expect(provider.request).toHaveBeenCalledOnce();
  });
  it('does not attach a legacy direct enrollment or payment to an invented agreement', async () => {
    const legacy = await enrollTrainee(identity.merchantId, { traineePhone: identity.customerPhone, traineeName: 'عميل اختبار', courseId: 'c-1' }, { requestId: randomUUID() });
    expect(legacy).toMatchObject({ success: true }); await expect(recover()).rejects.toThrow();
    provider.request.mockResolvedValue({ status: 200, data: { invoice_id: 'invoice-1', payment_url: 'https://checkout.example.com/pay' } });
    const payment = await createPaymentLink(identity.merchantId, { traineePhone: identity.customerPhone, courseId: 'c-1', amount: 10 }, { requestId: randomUUID() });
    expect(payment).toMatchObject({ success: true }); await expect(recover(owner, identity.merchantId, (payment as any).operationId)).rejects.toThrow(); expect(await quotes()).toEqual([]);
  });
  it('leaves an actual timed-out enrollment unresolved without retrying the provider', async () => {
    const quote = await offer(), consent = await incoming(); provider.request.mockRejectedValue(Error('response lost after dispatch'));
    expect(await accept(consent, quote.quotationId)).toMatchObject({ result: { success: false, outcome: 'unknown' } });
    const before = await effects(), saved = await quotes(); await expect(recover()).rejects.toThrow('Byaan enrollment recovery unavailable');
    expect(await effects()).toEqual(before); expect(await quotes()).toEqual(saved); expect(provider.request).toHaveBeenCalledOnce();
  });
  it('preserves the original reviewer when another authorized actor rechecks restoration', async () => {
    await successful(); await erase(); const first = await recover(), reviewer = await createDisposableMerchant('recheck-actor'); users.push(reviewer.userId);
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES(?,?,'manager',1)", [identity.merchantId, reviewer.userId]);
    expect(await recover(reviewer.userId)).toEqual({ ...first, replayed: true }); expect(provider.request).toHaveBeenCalledOnce();
  });
  it('rejects copied or forged recovery metadata and never silently replaces it', async () => {
    await successful(); await erase(); await recover(); const row = (await quotes())[0], value = read(row.external_result).value;
    value.recovery.operationId++; await q('UPDATE sales_quotations SET external_result=? WHERE id=?', [JSON.stringify({ value, digest: digest(value) }), row.id]);
    const before = await quotes(); await expect(recover()).rejects.toThrow(); expect(await quotes()).toEqual(before);
  });
  it('rejects anonymous and injected recovery input through the router', async () => {
    const anon = byaanRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as any);
    await expect(anon.recoverEnrollmentProjection({ operationId: 1 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    for (const input of [{ operationId: 0 }, { operationId: '1 OR 1=1' }, { operationId: 1, merchantId: 999 }, { operationId: 1, quotationId: 1 }, { operationId: 1, receipt: {} }]) await expect(caller().recoverEnrollmentProjection(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(provider.request).not.toHaveBeenCalled();
  });
});
