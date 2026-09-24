import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createDurableBookingCheckout, issueCanonicalBookingPaymentLink } from './booking-checkout';
import { getBookingPaymentLinkRenewal, renewBookingPaymentLink } from './booking-payment-link-renewal';
import { applyTapOrderPaymentState } from './order-payment-state';
import { databaseTimeEpoch } from '../db/time';
import * as db from '../db';
import * as tap from './tap-client';

describe.skipIf(!process.env.DATABASE_URL)('booking payment link renewal on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let bookingId: number, serviceId: number, linkId: number, checkout: any;
  const query = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const link = async () => (await query('SELECT * FROM payment_links WHERE id=?', [linkId]))[0];
  const payments = () => query('SELECT * FROM order_payments WHERE booking_id=?', [bookingId]);
  const attempts = () => query('SELECT * FROM booking_checkout_attempts WHERE booking_id=? ORDER BY id', [bookingId]);
  const audits = () => query('SELECT * FROM booking_payment_link_renewals WHERE booking_id=?', [bookingId]);
  const read = () => getBookingPaymentLinkRenewal(owner.merchantId, bookingId);
  const input = async () => ({ bookingId, evidence: (await read())!.evidence, reason: 'Customer requested a fresh day to pay', reviewed: true as const });
  const renew = async () => renewBookingPaymentLink(owner.merchantId, owner.userId, await input());
  const expire = () => query('UPDATE payment_links SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?', [linkId]);
  const setState = async (providerStatus: string) => {
    const [p] = await payments(); return applyTapOrderPaymentState({ paymentId: p.id, tapChargeId: p.tap_charge_id,
      providerStatus, expectedMerchantId: owner.merchantId, expectedAmount: 26998, expectedCurrency: 'SAR' });
  };
  const terminal = async () => { await createDurableBookingCheckout(checkout); await setState('FAILED'); await expire(); };
  const blocked = async (blocker: string) => {
    const before = await link(); expect(await read()).toMatchObject({ state: 'blocked', blocker });
    await expect(renew()).rejects.toThrow(); expect(await link()).toEqual(before); expect(await audits()).toEqual([]);
  };
  beforeEach(async () => {
    owner = await createDisposableMerchant('booking-renewal'); other = await createDisposableMerchant('other-renewal');
    serviceId = (await query("INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test service',60,30000)", [owner.merchantId])).insertId;
    bookingId = (await query(`INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,discount_amount,final_price)
      VALUES (?,?,'966500987654','2026-12-20','10:00','11:00',60,30000,3002,26998)`, [owner.merchantId, serviceId])).insertId;
    vi.spyOn(db, 'getMerchantPaymentSettings').mockResolvedValue({ tapEnabled: 1, tapTestMode: 1, isVerified: 1, tapPublicKey: 'pk_test_fixture', tapSecretKey: 'sk_test_fixture' } as any);
    vi.spyOn(tap, 'postTapCharge').mockImplementation(async () => ({ ok: true, status: 200, body: { id: `chg_${randomUUID()}`, status: 'INITIATED', amount: 269.98, currency: 'SAR', live_mode: false,
      transaction: { url: 'https://sandbox.payments.tap.company/session/fixture', expiry: { period: 30, type: 'MINUTE' } } } }));
    vi.spyOn(tap, 'retrieveTapCharge').mockRejectedValue(Error('Renewal must not retrieve provider charges'));
    const issued = await issueCanonicalBookingPaymentLink({ merchantId: owner.merchantId, bookingId, amount: 26998, title: 'Booking checkout' });
    linkId = issued.link.id; checkout = { linkId: issued.linkId, checkoutAttemptId: randomUUID(), customerName: 'Test Customer', customerPhone: '0500987654' };
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);

  it('renews the same expired link for 24 hours with an atomic actor and reason audit', async () => {
    await expire(); const before = await link(), request = await input();
    const result = await renewBookingPaymentLink(owner.merchantId, owner.userId, request), after = await link(), [audit] = await audits();
    const now = databaseTimeEpoch((await query('SELECT UTC_TIMESTAMP(3) AS now'))[0].now);
    expect(databaseTimeEpoch(after.expires_at) - now).toBeGreaterThan(86_390_000); expect(databaseTimeEpoch(after.expires_at) - now).toBeLessThanOrEqual(86_400_000);
    expect(result).toMatchObject({ renewed: true, alreadyRenewed: false });
    expect(after).toMatchObject({ link_id: before.link_id, amount: 26998, booking_checkout_policy_version: 1, max_usage_count: 1, usage_count: 0, status: 'active', metadata: before.metadata });
    expect(audit).toMatchObject({ merchant_id: owner.merchantId, booking_id: bookingId, payment_link_id: linkId, actor_user_id: owner.userId, reason: request.reason, evidence_hash: request.evidence });
    expect(databaseTimeEpoch(audit.prior_expires_at)).toBe(databaseTimeEpoch(before.expires_at)); expect(databaseTimeEpoch(audit.renewed_expires_at)).toBe(databaseTimeEpoch(after.expires_at));
    expect(await read()).toMatchObject({ state: 'blocked', blocker: 'link', audit: { actorUserId: owner.userId, reason: request.reason, renewedExpiresAt: result.expiresAt } });
    expect(await payments()).toEqual([]); expect(await attempts()).toEqual([]); expect(tap.postTapCharge).not.toHaveBeenCalled(); expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
    const publicRead = JSON.stringify(await read()); for (const secret of [before.link_id, '966500987654', 'sk_test_fixture', 'request_hash', 'tap_charge_id']) expect(publicRead).not.toContain(secret);
  });
  it('accepts a protected link explicitly marked expired and a confirmed unpaid booking', async () => {
    await expire(); await query("UPDATE payment_links SET status='expired' WHERE id=?", [linkId]); await query("UPDATE bookings SET status='confirmed' WHERE id=?", [bookingId]);
    expect(await renew()).toMatchObject({ renewed: true }); expect((await link()).status).toBe('active');
  });
  it('returns no renewal for a booking without a link', async () => {
    await query('DELETE FROM payment_links WHERE id=?', [linkId]); expect(await read()).toBeNull();
    await expect(renewBookingPaymentLink(owner.merchantId, owner.userId, { bookingId, reason: 'No link to renew', evidence: 'a'.repeat(64), reviewed: true })).rejects.toThrow();
  });
  it.each(["status='cancelled'", "status='completed'", "status='in_progress'", "status='no_show'", "payment_status='paid'", "payment_status='refunded'"])
    ('refuses ineligible booking: %s', async patch => { await expire(); await query(`UPDATE bookings SET ${patch} WHERE id=?`, [bookingId]); await blocked('booking'); });
  it.each(['final_price=28000', 'discount_amount=-1', 'base_price=10000'])('refuses inconsistent price: %s', async patch => {
    await expire(); await query(`UPDATE bookings SET ${patch} WHERE id=?`, [bookingId]); await blocked('identity');
  });
  it.each(['amount=30000', "currency='USD'", 'is_fixed_amount=0', 'max_usage_count=2', 'max_usage_count=NULL'])('refuses link identity drift: %s', async patch => {
    await expire(); await query(`UPDATE payment_links SET ${patch} WHERE id=?`, [linkId]); await blocked('identity');
  });
  it.each(["status='disabled'", "status='completed'", 'is_active=0', 'expires_at=NULL', 'expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)'])
    ('does not reopen inactive or unexpired links: %s', async patch => { await expire(); await query(`UPDATE payment_links SET ${patch} WHERE id=?`, [linkId]); await blocked('link'); });
  it('does not upgrade a legacy link even without any local payments', async () => { await expire(); await query('UPDATE payment_links SET booking_checkout_policy_version=0 WHERE id=?', [linkId]); await blocked('legacy'); });
  it.each(['merchant', 'service', 'link'])('rejects cross-tenant %s', async target => {
    await expire();
    if (target === 'merchant') { await expect(getBookingPaymentLinkRenewal(other.merchantId, bookingId)).rejects.toThrow(); await expect(renewBookingPaymentLink(other.merchantId, other.userId, await input())).rejects.toThrow(); }
    if (target === 'service') { await query('UPDATE services SET merchant_id=? WHERE id=?', [other.merchantId, serviceId]); await blocked('identity'); }
    if (target === 'link') { await query('UPDATE payment_links SET merchant_id=? WHERE id=?', [other.merchantId, linkId]); await blocked('identity'); }
  });
  it.each(['usage_count=1', 'usage_count=-1', 'successful_payments=1', 'total_collected=26998'])('preserves collection history: %s', async patch => {
    await expire(); await query(`UPDATE payment_links SET ${patch} WHERE id=?`, [linkId]); await blocked('payment');
  });
  it.each(['FAILED', 'DECLINED', 'RESTRICTED', 'CANCELLED', 'ABANDONED', 'VOID'])('requires verified terminal %s before a new explicit checkout', async status => {
    await createDurableBookingCheckout(checkout); await setState(status); await expire(); const history = await attempts(), beforePayments = await payments();
    await renew(); expect(await attempts()).toEqual(history); expect(await payments()).toEqual(beforePayments);
    await expect(createDurableBookingCheckout(checkout)).rejects.toThrow(); await createDurableBookingCheckout({ ...checkout, checkoutAttemptId: randomUUID() });
    expect(tap.postTapCharge).toHaveBeenCalledTimes(2); expect((await attempts()).map((row: any) => row.state).sort()).toEqual(['created', 'failed']);
  });
  it.each(['INITIATED', 'AUTHORIZED', 'UNKNOWN'])('expired provider session is not terminal proof: %s', async status => {
    await createDurableBookingCheckout(checkout); await setState(status); await expire(); await query('UPDATE order_payments SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY) WHERE booking_id=?', [bookingId]); await blocked('payment');
  });
  it.each(['unknown', 'dispatching'])('blocks %s without a local payment despite its age', async state => {
    vi.mocked(tap.postTapCharge).mockRejectedValueOnce(Error('lost response')); await expect(createDurableBookingCheckout(checkout)).rejects.toThrow();
    await query('UPDATE booking_checkout_attempts SET state=?,created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY) WHERE booking_id=?', [state, bookingId]); await expire(); await blocked('payment');
  });
  it.each(["last_webhook_status='AUTHORIZED'", 'last_webhook_at=NULL', "status='pending'", 'captured_at=UTC_TIMESTAMP()', 'refunded_at=UTC_TIMESTAMP()',
    'metadata=NULL', "tap_charge_id='bad'", 'amount=1', "currency='USD'"])
    ('blocks inconsistent or historical payment evidence: %s', async patch => { await terminal(); await query(`UPDATE order_payments SET ${patch} WHERE booking_id=?`, [bookingId]); await blocked('payment'); });
  it.each(['amount_minor=1', "currency='USD'", "state='unknown'", 'payment_id=NULL'])('blocks inconsistent attempt evidence: %s', async patch => {
    await terminal(); await query(`UPDATE booking_checkout_attempts SET ${patch} WHERE booking_id=?`, [bookingId]); await blocked('payment');
  });
  it('blocks untracked terminal payments', async () => { await terminal(); await query('DELETE FROM booking_checkout_attempts WHERE booking_id=?', [bookingId]); await blocked('payment'); });
  it('blocks a missing payment behind a terminal attempt', async () => { await terminal(); await query('DELETE FROM order_payments WHERE booking_id=?', [bookingId]); await blocked('payment'); });
  it('does not renew after capture and refund even if a booking is manually reset to unpaid', async () => {
    await createDurableBookingCheckout(checkout); await setState('CAPTURED'); await setState('REFUNDED'); await expire();
    await query("UPDATE bookings SET status='pending',payment_status='unpaid' WHERE id=?", [bookingId]); await blocked('payment');
  });
  it('rejects stale evidence after booking edits and after new settlement proof', async () => {
    await terminal(); const before = await input(); await query("UPDATE bookings SET notes='Changed booking' WHERE id=?", [bookingId]);
    await expect(renewBookingPaymentLink(owner.merchantId, owner.userId, before)).rejects.toThrow();
    const newer = await input(); await query('UPDATE order_payments SET last_webhook_at=DATE_ADD(last_webhook_at,INTERVAL 1 SECOND) WHERE booking_id=?', [bookingId]);
    await expect(renewBookingPaymentLink(owner.merchantId, owner.userId, newer)).rejects.toThrow(); expect(await audits()).toEqual([]);
  });
  it('serializes parallel renewals and retains the original expiry on acknowledgement retries', async () => {
    await expire(); const request = await input(); const results = await Promise.all([1, 2, 3].map(() => renewBookingPaymentLink(owner.merchantId, owner.userId, request)));
    expect(results.filter(result => !result.alreadyRenewed)).toHaveLength(1); expect(new Set(results.map(result => result.expiresAt)).size).toBe(1); expect(await audits()).toHaveLength(1);
    await query("UPDATE payment_links SET status='disabled',is_active=0 WHERE id=?", [linkId]); const before = await link();
    expect(await renewBookingPaymentLink(owner.merchantId, owner.userId, request)).toMatchObject({ alreadyRenewed: true }); expect(await link()).toEqual(before);
  });
  it('requires a new evidence version for a later renewal after another expiry', async () => {
    await expire(); const first = await input(); await renewBookingPaymentLink(owner.merchantId, owner.userId, first); await expire();
    const second = await input(); expect(second.evidence).not.toBe(first.evidence);
    await renewBookingPaymentLink(owner.merchantId, owner.userId, first); expect((await read())!.state).toBe('eligible');
    await renewBookingPaymentLink(owner.merchantId, owner.userId, second); expect(await audits()).toHaveLength(2);
  });
  it.each(['expiry', 'audit'])('rolls back both writes on %s storage failure', async failure => {
    await expire(); const request = await input(), before = await link(); const pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => { const c = await original(); return new Proxy(c, { get(target, key) {
      if (key === 'execute') return async (sql: string, args: any[]) => { if (sql.includes(failure === 'expiry' ? 'SET expires_at=?' : 'INSERT INTO booking_payment_link_renewals')) throw Error('injected write failure'); return target.execute(sql, args); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } }); });
    await expect(renewBookingPaymentLink(owner.merchantId, owner.userId, request)).rejects.toThrow(); vi.spyOn(pool, 'getConnection').mockRestore();
    expect(await link()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it('destroys an uncertain commit connection and retries from its audit without extending again', async () => {
    await expire(); const request = await input(); const pool = (await getPool())!, original = pool.getConnection.bind(pool); let destroyed = 0;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => { const c = await original(); return new Proxy(c, { get(target, key) {
      if (key === 'commit') return async () => { await target.commit(); throw Error('commit acknowledgement lost'); };
      if (key === 'destroy') return () => { destroyed++; target.destroy(); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } }); });
    await expect(renewBookingPaymentLink(owner.merchantId, owner.userId, request)).rejects.toThrow(); vi.spyOn(pool, 'getConnection').mockRestore(); const before = await link();
    expect(destroyed).toBe(1); expect(await renewBookingPaymentLink(owner.merchantId, owner.userId, request)).toMatchObject({ alreadyRenewed: true });
    expect(await link()).toEqual(before); expect(await audits()).toHaveLength(1);
  });
  it('blocks another renewal once the renewed link has started a pending checkout', async () => {
    await expire(); const request = await input(); await renewBookingPaymentLink(owner.merchantId, owner.userId, request);
    await createDurableBookingCheckout(checkout); await expire(); expect(await read()).toMatchObject({state:'blocked',blocker:'payment'});
    await expect(renew()).rejects.toThrow(); expect(await audits()).toHaveLength(1); expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('serializes a new checkout behind the renewal transaction without issuing an extra charge', async () => {
    await expire(); const request=await input(); const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    let entered!:()=>void,finish!:()=>void; const ready=new Promise<void>(resolve=>entered=resolve),resume=new Promise<void>(resolve=>finish=resolve);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:string,args:any[])=>{if(sql.includes('SET expires_at=?')){entered();await resume;}return target.execute(sql,args);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});});
    const renewal=renewBookingPaymentLink(owner.merchantId,owner.userId,request);await ready;
    const payment=createDurableBookingCheckout(checkout);finish();
    const [renewed,paid]=await Promise.all([renewal,payment]);vi.spyOn(pool,'getConnection').mockRestore();
    expect(renewed.renewed).toBe(true);expect(paid.paymentUrl).toContain('tap.company');expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    expect(await audits()).toHaveLength(1);expect(await payments()).toHaveLength(1);
  });
  it('rechecks booking eligibility after waiting for its lock', async () => {
    await expire();const request=await input();const connection=await(await getPool())!.getConnection();await connection.beginTransaction();
    await connection.execute('SELECT id FROM bookings WHERE id=? FOR UPDATE',[bookingId]);
    const renewal=renewBookingPaymentLink(owner.merchantId,owner.userId,request);const rejection=expect(renewal).rejects.toThrow();
    await connection.execute("UPDATE bookings SET status='cancelled' WHERE id=?",[bookingId]);await connection.commit();connection.release();
    await rejection;expect(await audits()).toEqual([]);expect((await read())!.blocker).toBe('booking');
  });
  it('rejects multiple links instead of silently choosing one',async()=>{
    await query(`INSERT INTO payment_links (merchant_id,booking_id,link_id,title,amount,currency,is_fixed_amount,max_usage_count,booking_checkout_policy_version,expires_at,tap_payment_url)
      VALUES (?,?,?,'Duplicate',26998,'SAR',1,1,1,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),'')`,[owner.merchantId,bookingId,randomUUID()]);
    await expire();await blocked('identity');
  });
  it('detects foreign-owned payments and duplicate attempt claims on one payment',async()=>{
    await terminal();await query('UPDATE order_payments SET merchant_id=? WHERE booking_id=?',[other.merchantId,bookingId]);await blocked('payment');
    await query('UPDATE order_payments SET merchant_id=? WHERE booking_id=?',[owner.merchantId,bookingId]);const [attempt]=await attempts();
    await query(`INSERT INTO booking_checkout_attempts (id,merchant_id,booking_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency,state,payment_id)
      VALUES (?,?,?,?,?,?,?,26998,'SAR','failed',?)`,[randomUUID(),owner.merchantId,bookingId,linkId,randomUUID(),'f'.repeat(64),'sari_pl_'+'e'.repeat(64),attempt.payment_id]);
    await blocked('payment');
  });
  it('does not disclose a corrupt foreign-owned renewal audit',async()=>{
    await expire();await renew();await expire();
    await query("UPDATE booking_payment_link_renewals SET merchant_id=?,reason='other merchant private reason' WHERE booking_id=?",[other.merchantId,bookingId]);
    const result=await read();expect(result).toMatchObject({state:'blocked',blocker:'identity',audit:null});expect(JSON.stringify(result)).not.toContain('other merchant');
    await expect(renew()).rejects.toThrow();expect(await audits()).toHaveLength(1);
  });
});
