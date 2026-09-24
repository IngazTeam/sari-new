import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {createDurableBookingCheckout,issueCanonicalBookingPaymentLink} from './booking-checkout';
import {applyTapOrderPaymentState} from './order-payment-state';
import * as db from '../db';
import * as tap from './tap-client';
import {appRouter} from '../routers';

describe.skipIf(!process.env.DATABASE_URL)('durable booking checkout on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,bookingId:number,serviceId:number,linkId:number,input:any;
  const settings={tapEnabled:1,tapTestMode:1,isVerified:1,tapPublicKey:'pk_test_fixture',tapSecretKey:'sk_test_fixture'};
  const query=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
  const attempts=()=>query('SELECT * FROM booking_checkout_attempts WHERE booking_id=? ORDER BY created_at,id',[bookingId]);
  const payments=()=>query('SELECT * FROM order_payments WHERE booking_id=?',[bookingId]);
  const response=()=>({ok:true,status:200,body:{id:`chg_${randomUUID()}`,status:'INITIATED',amount:269.98,currency:'SAR',live_mode:false,
    transaction:{url:'https://sandbox.payments.tap.company/session/fixture',expiry:{period:30,type:'MINUTE'}}}});
  const retry=()=>createDurableBookingCheckout({...input,checkoutAttemptId:randomUUID()});
  const issue=()=>issueCanonicalBookingPaymentLink({merchantId:owner.merchantId,bookingId,amount:26998,title:'Booking checkout'});
  const setState=async(providerStatus:string)=>{const [p]=await payments();return applyTapOrderPaymentState({paymentId:p.id,tapChargeId:p.tap_charge_id,
    providerStatus,expectedMerchantId:owner.merchantId,expectedAmount:26998,expectedCurrency:'SAR'});};
  const createBooking=async()=>{
    const row=await query(`INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,discount_amount,final_price)
      VALUES (?,?,'966500987654','2026-12-20','10:00','11:00',60,30000,3002,26998)`,[owner.merchantId,serviceId]);return Number(row.insertId);
  };
  beforeEach(async()=>{
    owner=await createDisposableMerchant('booking-checkout');other=await createDisposableMerchant('other-booking');
    serviceId=(await query("INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test service',60,30000)",[owner.merchantId])).insertId;
    bookingId=await createBooking();
    vi.spyOn(db,'getMerchantPaymentSettings').mockResolvedValue(settings as any);
    vi.spyOn(tap,'postTapCharge').mockImplementation(async()=>response());
    const link=await issue();linkId=link.link.id;
    input={linkId:link.linkId,checkoutAttemptId:randomUUID(),customerName:'Test Customer',customerPhone:'0500987654'};
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);

  it('issues one fixed canonical link concurrently without contacting Tap',async()=>{
    expect((await Promise.all([issue(),issue()])).map(r=>r.link.id)).toEqual([linkId,linkId]);
    expect(await query('SELECT id FROM payment_links WHERE booking_id=?',[bookingId])).toHaveLength(1);
    expect((await issue()).link).toMatchObject({bookingCheckoutPolicyVersion:1,isFixedAmount:1,maxUsageCount:1,amount:26998});
    expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('serializes first issuance on an empty booking',async()=>{
    bookingId=await createBooking();const results=await Promise.all([issue(),issue(),issue()]);
    expect(new Set(results.map(r=>r.link.id)).size).toBe(1);expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('commits a reservation before POST and stores its exact booking payment atomically',async()=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async(_key,payload:any)=>{
      const [attempt]=await attempts();expect(attempt).toMatchObject({state:'dispatching',booking_id:bookingId,amount_minor:26998});
      expect(payload.reference.idempotent).toBe(attempt.provider_reference);expect(payload.amount).toBe(269.98);return response();
    });
    await createDurableBookingCheckout(input);const [attempt]=await attempts(),[p]=await payments();
    expect(attempt).toMatchObject({state:'created',payment_id:p.id});expect(p).toMatchObject({order_id:null,booking_id:bookingId,amount:26998,status:'pending'});
    expect(JSON.stringify(attempt)).not.toContain(settings.tapSecretKey);expect(JSON.stringify(attempt)).not.toContain(input.customerName);
    expect((await query('SELECT payment_status FROM bookings WHERE id=?',[bookingId]))[0].payment_status).toBe('unpaid');
  });
  it('serializes parallel clicks and reuses a pending charge with a new browser UUID',async()=>{
    let entered!:()=>void,finish!:(r:any)=>void;const ready=new Promise<void>(r=>entered=r);
    vi.mocked(tap.postTapCharge).mockImplementation(()=>{entered();return new Promise(r=>finish=r);});
    const first=createDurableBookingCheckout(input);await ready;
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();await expect(retry()).rejects.toThrow();
    finish(response());const result=await first;expect(await retry()).toEqual(result);expect(await createDurableBookingCheckout(input)).toEqual(result);
    expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await attempts()).toHaveLength(1);expect(await payments()).toHaveLength(1);
  });
  it.each(['network','timeout','invalid_json','http','amount','precision','currency','status','url','mode'])('retains an unknown outcome after %s without retrying POST',async failure=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async()=>{
      if(['network','timeout','invalid_json'].includes(failure))throw Error(failure);const r=response();
      if(failure==='http'){r.ok=false;r.status=503;}if(failure==='amount')r.body.amount=999;if(failure==='precision')r.body.amount=269.981;
      if(failure==='currency')r.body.currency='USD';if(failure==='status')r.body.status='CAPTURED';
      if(failure==='url')r.body.transaction.url='https://attacker.test/pay';if(failure==='mode')r.body.live_mode=true;return r;
    });
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();expect((await attempts())[0]).toMatchObject({state:'unknown',failure_code:'outcome_unverified'});
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await payments()).toEqual([]);
  });
  it.each(["status='cancelled'","status='completed'","status='in_progress'","status='no_show'","payment_status='paid'","payment_status='refunded'",
    'final_price=28000','base_price=10000','discount_amount=-1'])('rejects an ineligible booking before POST: %s',async patch=>{
    await query(`UPDATE bookings SET ${patch} WHERE id=?`,[bookingId]);await expect(createDurableBookingCheckout(input)).rejects.toThrow();
    await expect(issue()).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);
  });
  it.each(["status='disabled'",'is_active=0','expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)','usage_count=1','usage_count=-1',
    'amount=30000',"currency='USD'",'is_fixed_amount=0','max_usage_count=NULL','max_usage_count=2','booking_checkout_policy_version=0'])
    ('rejects ineligible link before POST: %s',async patch=>{
      await query(`UPDATE payment_links SET ${patch} WHERE id=?`,[linkId]);await expect(createDurableBookingCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
    });
  it.each(['merchant','service','link'])('rejects cross-tenant %s identity',async target=>{
    if(target==='merchant')await query('UPDATE bookings SET merchant_id=? WHERE id=?',[other.merchantId,bookingId]);
    if(target==='service')await query('UPDATE services SET merchant_id=? WHERE id=?',[other.merchantId,serviceId]);
    if(target==='link')await query('UPDATE payment_links SET merchant_id=? WHERE id=?',[other.merchantId,linkId]);
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();await expect(issue()).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it.each([{customerName:'Different buyer'},{customerPhone:'0500000099'},{customerEmail:'other@example.test'}])('refuses to reuse changed payer details: %j',async patch=>{
    await createDurableBookingCheckout(input);await expect(createDurableBookingCheckout({...input,...patch})).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('refuses reuse after changing the merchant Tap account',async()=>{
    await createDurableBookingCheckout(input);vi.mocked(db.getMerchantPaymentSettings).mockResolvedValue({...settings,tapSecretKey:'sk_test_other'} as any);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it.each(['payment','result','reservation'])('rolls back a failed %s write',async failure=>{
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:any[])=>{
      if(sql.includes(failure==='payment'?'INSERT INTO order_payments':failure==='result'?"SET state='created'":'INSERT INTO booking_checkout_attempts'))throw Error('injected storage failure');return target.execute(sql,args);
    };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();expect(await payments()).toEqual([]);
    if(failure==='reservation'){expect(await attempts()).toEqual([]);expect(tap.postTapCharge).not.toHaveBeenCalled();}
    else{expect((await attempts())[0].state).toBe('unknown');await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);}
  });
  it.each([1,2])('destroys the connection after lost commit acknowledgment %i without duplicate POST',async loseAt=>{
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);let commits=0,destroyed=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='commit')return async()=>{await target.commit();if(++commits===loseAt)throw Error('commit acknowledgment lost');};
      if(key==='destroy')return ()=>{destroyed++;return target.destroy();};
      const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();expect(destroyed).toBe(1);
    if(loseAt===1){expect((await attempts())[0].state).toBe('dispatching');await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();}
    else{expect((await attempts())[0].state).toBe('created');await retry();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);}
  });
  it.each(['FAILED','DECLINED','RESTRICTED','CANCELLED','ABANDONED','VOID'])('permits a fresh request after verified terminal %s',async status=>{
    await createDurableBookingCheckout(input);await setState(status);await expect(createDurableBookingCheckout(input)).rejects.toThrow();await retry();
    expect(tap.postTapCharge).toHaveBeenCalledTimes(2);expect((await attempts()).map((a:any)=>a.state).sort()).toEqual(['created','failed']);
  });
  it.each(['UNKNOWN','TIMEDOUT','AUTHORIZED'])('does not allow a new charge after %s',async status=>{
    await createDurableBookingCheckout(input);await setState(status);
    if(status==='AUTHORIZED')await retry();else await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('settles the booking and its link once, refunds once, and does not revive it on late capture',async()=>{
    await createDurableBookingCheckout(input);await setState('CAPTURED');await setState('CAPTURED');
    expect((await query('SELECT status,payment_status FROM bookings WHERE id=?',[bookingId]))[0]).toMatchObject({status:'confirmed',payment_status:'paid'});
    expect((await query('SELECT usage_count,successful_payments,total_collected FROM payment_links WHERE id=?',[linkId]))[0]).toMatchObject({usage_count:1,successful_payments:1,total_collected:26998});
    await expect(retry()).rejects.toThrow();await setState('REFUNDED');await setState('REFUNDED');await setState('CAPTURED');
    expect((await query('SELECT status,payment_status FROM bookings WHERE id=?',[bookingId]))[0]).toMatchObject({status:'cancelled',payment_status:'refunded'});
    expect((await query('SELECT usage_count,successful_payments,total_collected FROM payment_links WHERE id=?',[linkId]))[0]).toMatchObject({usage_count:1,successful_payments:0,total_collected:0});
    expect((await query('SELECT verified_purchase_count,total_spent FROM customer_profiles WHERE merchant_id=?',[owner.merchantId]))[0]).toMatchObject({verified_purchase_count:0,total_spent:'0.00'});
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toHaveLength(2);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('records a provider effect after cancellation during POST without exposing its URL',async()=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async()=>{await query("UPDATE bookings SET status='cancelled' WHERE id=?",[bookingId]);return response();});
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();expect((await attempts())[0].state).toBe('created');expect(await payments()).toHaveLength(1);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('does not treat session expiry or aging an unknown as proof of failure',async()=>{
    await createDurableBookingCheckout(input);await query('UPDATE order_payments SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE booking_id=?',[bookingId]);
    await expect(retry()).rejects.toThrow();await query("UPDATE booking_checkout_attempts SET state='unknown',created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY) WHERE booking_id=?",[bookingId]);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('blocks untracked legacy payments and never upgrades a legacy link',async()=>{
    await query("INSERT INTO order_payments (merchant_id,booking_id,customer_phone,amount,currency,status) VALUES (?,?,'966500987654',26998,'SAR','pending')",[owner.merchantId,bookingId]);
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();
    await query('UPDATE payment_links SET booking_checkout_policy_version=0 WHERE id=?',[linkId]);await expect(issue()).rejects.toThrow();
    expect((await query('SELECT booking_checkout_policy_version AS version FROM payment_links WHERE id=?',[linkId]))[0].version).toBe(0);
    expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('does not bypass an active attempt through a second link for the same booking',async()=>{
    await createDurableBookingCheckout(input);const token='link_'+randomUUID().replaceAll('-','');
    await query(`INSERT INTO payment_links (merchant_id,booking_id,link_id,title,amount,currency,tap_payment_url,max_usage_count,booking_checkout_policy_version)
      VALUES (?,?,?,'Second',26998,'SAR','https://example.test/pay',1,1)`,[owner.merchantId,bookingId,token]);
    await expect(createDurableBookingCheckout({...input,linkId:token,checkoutAttemptId:randomUUID()})).rejects.toThrow();
    await expect(issue()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('enforces one active booking attempt even against an uncoordinated insert',async()=>{
    await createDurableBookingCheckout(input);await expect(query(`INSERT INTO booking_checkout_attempts
      (id,merchant_id,booking_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency)
      VALUES (?,?,?,?,?,?,?,26998,'SAR')`,[randomUUID(),owner.merchantId,bookingId,linkId,randomUUID(),'a'.repeat(64),'other'])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
  });
  it.each(['amount','merchantId','bookingId','secret','policyVersion'])('rejects injected %s authority at the public router',async key=>{
    const caller=appRouter.createCaller({user:null,req:{},res:{}} as any);
    await expect(caller.payments.checkoutLink({...input,[key]:1})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('uses the durable booking handler at the real public route and redacts failures',async()=>{
    const caller=appRouter.createCaller({user:null,req:{},res:{}} as any);await caller.payments.checkoutLink(input);
    await caller.payments.checkoutLink({...input,checkoutAttemptId:randomUUID()});expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    await query("UPDATE booking_checkout_attempts SET state='unknown' WHERE booking_id=?",[bookingId]);
    await expect(caller.payments.checkoutLink(input)).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('uses stored booking authority at the real merchant route',async()=>{
    const caller=appRouter.createCaller({user:{id:owner.userId,role:'user'},req:{},res:{}} as any);
    await expect(caller.payments.createLink({bookingId,title:'Booking checkout',amount:1_000,isFixedAmount:true,currency:'SAR'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});
    await expect(caller.payments.createLink({bookingId,title:'Booking checkout',amount:26998,isFixedAmount:false,currency:'SAR'})).rejects.toMatchObject({code:'BAD_REQUEST'});
    const result=await caller.payments.createLink({bookingId,title:'Booking checkout',amount:26998,isFixedAmount:true,currency:'SAR'});expect(result.linkId).toBe(input.linkId);
    const outsider=appRouter.createCaller({user:{id:other.userId,role:'user'},req:{},res:{}} as any);
    await expect(outsider.payments.createLink({bookingId,title:'Booking checkout',amount:26998,isFixedAmount:true,currency:'SAR'})).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it.each(['tapEnabled','isVerified'])('refuses an unready %s gateway before reserving',async field=>{
    vi.mocked(db.getMerchantPaymentSettings).mockResolvedValue({...settings,[field]:0} as any);
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();await expect(issue()).rejects.toThrow();
    expect(await attempts()).toEqual([]);expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it.each(['invalid-date','2000-01-01','2099-01-01'])('rejects an unsafe new link expiry: %s',async expiresAt=>{
    bookingId=await createBooking();await expect(issueCanonicalBookingPaymentLink({merchantId:owner.merchantId,bookingId,amount:26998,title:'Booking checkout',expiresAt})).rejects.toThrow();
    expect(await query('SELECT id FROM payment_links WHERE booking_id=?',[bookingId])).toEqual([]);
  });
  it('permits independent bookings without a merchant-wide reservation lock',async()=>{
    const secondId=await createBooking();const second=await issueCanonicalBookingPaymentLink({merchantId:owner.merchantId,bookingId:secondId,amount:26998,title:'Other booking'});
    await Promise.all([createDurableBookingCheckout(input),createDurableBookingCheckout({...input,linkId:second.linkId,checkoutAttemptId:randomUUID()})]);
    expect(tap.postTapCharge).toHaveBeenCalledTimes(2);expect(await query('SELECT id FROM booking_checkout_attempts WHERE merchant_id=?',[owner.merchantId])).toHaveLength(2);
  });
  it('does not expose a URL after disabling the link during dispatch',async()=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async()=>{await query('UPDATE payment_links SET is_active=0 WHERE id=?',[linkId]);return response();});
    await expect(createDurableBookingCheckout(input)).rejects.toThrow();expect((await attempts())[0].state).toBe('created');expect(await payments()).toHaveLength(1);
  });
  it('keeps the durable fence if recording an unknown outcome also fails',async()=>{
    const pool=(await getPool())!,original=pool.execute.bind(pool);
    vi.spyOn(pool,'execute').mockImplementation(async(sql:any,args?:any)=>{
      if(typeof sql==='string'&&sql.includes("SET state='unknown'"))throw Error('storage offline');return original(sql,args);
    });
    vi.mocked(tap.postTapCharge).mockRejectedValue(Error('timeout'));await expect(createDurableBookingCheckout(input)).rejects.toThrow();vi.spyOn(pool,'execute').mockRestore();
    expect((await attempts())[0].state).toBe('dispatching');await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it.each(['amount=99',"metadata='{}'","tap_payment_url='https://attacker.test/pay'"])
    ('rejects corrupted local payment evidence: %s',async patch=>{
      await createDurableBookingCheckout(input);await query(`UPDATE order_payments SET ${patch} WHERE booking_id=?`,[bookingId]);
      await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    });
  it('does not downgrade a protected orphan link into an unbound public charge',async()=>{
    await query('DELETE FROM bookings WHERE id=?',[bookingId]);
    const caller=appRouter.createCaller({user:null,req:{},res:{}} as any);await expect(caller.payments.checkoutLink(input)).rejects.toMatchObject({code:'CONFLICT'});
    expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('does not create a fresh link over a historical payment without a link',async()=>{
    bookingId=await createBooking();await query("INSERT INTO order_payments (merchant_id,booking_id,customer_phone,amount,currency,status) VALUES (?,?,'966500987654',26998,'SAR','pending')",[owner.merchantId,bookingId]);
    await expect(issue()).rejects.toThrow();expect(await query('SELECT id FROM payment_links WHERE booking_id=?',[bookingId])).toEqual([]);
  });
});
