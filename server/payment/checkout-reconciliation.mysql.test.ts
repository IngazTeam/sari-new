import {randomUUID,createHash} from 'node:crypto';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {createDurableOrderCheckout,getOrderCheckoutAttempts,checkoutRequestFingerprint} from './order-checkout-attempts';
import {reconcileOrderCheckout} from './checkout-reconciliation';
import {applyTapOrderPaymentState} from './order-payment-state';
import * as db from '../db';
import * as tap from './tap-client';

describe.skipIf(!process.env.DATABASE_URL)('Tap checkout reconciliation on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,orderId:number,linkId:number,conversationId:number,input:any,charge:any;
  const settings={tapEnabled:1,tapTestMode:1,isVerified:1,tapPublicKey:'pk_test_fixture',tapSecretKey:'sk_test_fixture'};
  const query=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
  const attempts=()=>query('SELECT * FROM order_checkout_attempts WHERE order_id=?',[orderId]);
  const payments=()=>query('SELECT * FROM order_payments WHERE order_id=?',[orderId]);
  const reviews=()=>query('SELECT r.* FROM order_checkout_reviews r JOIN order_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=? ORDER BY r.revision',[orderId]);
  const evidence=async()=>{const [a]=await getOrderCheckoutAttempts(owner.merchantId,orderId);return {orderId,attemptId:a.id,evidence:a.evidence,chargeId:charge.id,reviewed:true as const};};
  const review=async()=>reconcileOrderCheckout(owner.merchantId,owner.userId,await evidence());
  const unknown=async()=>{await expect(createDurableOrderCheckout(input)).rejects.toThrow();
    const [a]=await attempts();charge.reference={transaction:a.provider_reference,order:a.provider_reference};charge.metadata={udf1:a.provider_reference};};
  const assertUnsettled=async()=>{
    expect((await attempts())[0]).toMatchObject({state:'unknown',payment_id:null});expect(await payments()).toEqual([]);
    expect((await query('SELECT payment_status FROM orders WHERE id=?',[orderId]))[0].payment_status).toBe('unpaid');
    await expect(createDurableOrderCheckout({...input,checkoutAttemptId:randomUUID()})).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  };
  beforeEach(async()=>{
    owner=await createDisposableMerchant('tap-review');other=await createDisposableMerchant('tap-review-other');
    conversationId=(await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500987654','active')",[owner.merchantId])).insertId;
    orderId=(await query("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,payment_status,checkout_review_required) VALUES (?,'966500987654','Test','[]',26998,'SAR','pending','unpaid',0)",[owner.merchantId])).insertId;
    const token='link_'+randomUUID().replaceAll('-','');
    linkId=(await query("INSERT INTO payment_links (merchant_id,order_id,link_id,title,amount,currency,tap_payment_url,max_usage_count,metadata) VALUES (?,?,?,'Order checkout',26998,'SAR','https://example.test/pay',1,?)",[owner.merchantId,orderId,token,JSON.stringify({conversationId})])).insertId;
    input={linkId:token,checkoutAttemptId:randomUUID(),customerName:'Test Customer',customerPhone:'0500987654',customerEmail:'synthetic@example.test'};
    charge={id:`chg_${randomUUID()}`,object:'charge',status:'CAPTURED',amount:269.98,currency:'SAR',live_mode:false,
      customer:{first_name:input.customerName,email:input.customerEmail,phone:{country_code:'966',number:'500987654'}},
      transaction:{created:String(Date.now()),url:'https://sandbox.payments.tap.company/session/fixture',expiry:{period:30,type:'MINUTE'}}};
    vi.spyOn(db,'getMerchantPaymentSettings').mockResolvedValue(settings as any);
    vi.spyOn(tap,'postTapCharge').mockRejectedValue(new Error('lost response'));
    vi.spyOn(tap,'retrieveTapCharge').mockImplementation(async()=>({ok:true,status:200,body:charge}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);

  it('preserves the pre-migration fingerprint byte order',()=>{
    const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
    const identity={merchantId:1,orderId:2,linkId:3,amount:100,currency:'SAR',customerName:'Test',customerPhone:'500987654',customerEmail:null,description:'Order',metadata:null};
    expect(checkoutRequestFingerprint({...identity,secret:'secret',testMode:true})).toBe(digest({...identity,provider:digest('secret'),testMode:true}));
  });
  it('imports a lost capture with payment, counters, buyer memory, learning and audit exactly once',async()=>{
    await unknown();expect(await review()).toEqual({outcome:'verified',status:'captured'});const stale=await evidence();
    await review();expect((await payments())).toHaveLength(1);expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    expect((await attempts())[0]).toMatchObject({state:'created',review_revision:2,failure_code:null});
    expect((await query('SELECT payment_status,status FROM orders WHERE id=?',[orderId]))[0]).toMatchObject({payment_status:'paid',status:'paid'});
    expect((await query('SELECT usage_count,successful_payments,total_collected FROM payment_links WHERE id=?',[linkId]))[0]).toMatchObject({usage_count:1,successful_payments:1,total_collected:26998});
    expect((await query('SELECT verified_purchase_count,verified_spend_by_currency FROM customer_profiles WHERE merchant_id=?',[owner.merchantId]))[0]).toMatchObject({verified_purchase_count:1,verified_spend_by_currency:'{"SAR":26998}'});
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM sari_learning_signals WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    expect((await reviews())[0]).toMatchObject({actor_user_id:owner.userId,outcome:'verified',provider_status:'CAPTURED'});
    expect(JSON.stringify(await reviews())).not.toContain(input.customerName);expect(JSON.stringify(await reviews())).not.toContain(settings.tapSecretKey);
    await expect(reconcileOrderCheckout(owner.merchantId,owner.userId,stale)).rejects.toThrow();
    expect(tap.retrieveTapCharge).toHaveBeenCalledTimes(2);
  });
  it.each(['reference.transaction','reference.order','metadata.udf1','id','object','amount','fraction','currency','live_mode','customer.first_name','customer.phone.number','customer.phone.country_code','customer.email'])('fails closed on mismatched %s',async field=>{
    await unknown();const reviewInput=await evidence();const parts=field.split('.');let target=charge;for(const key of parts.slice(0,-1))target=target[key];
    target[parts.at(-1)!]=field==='amount'?270:field==='live_mode'?true:'wrong';if(field==='fraction')charge.amount=269.981;
    expect(await reconcileOrderCheckout(owner.merchantId,owner.userId,reviewInput)).toEqual({outcome:'unverified',status:null});await assertUnsettled();
    expect((await reviews())[0]).toMatchObject({reason:'identity_mismatch',outcome:'unverified'});
  });
  it.each(['UNKNOWN','TIMEDOUT','REFUNDED','FUTURE_STATE'])('does not infer financial history or retry permission from %s',async status=>{
    await unknown();charge.status=status;expect((await review()).outcome).toBe('unverified');await assertUnsettled();
  });
  it.each([404,429,500,'timeout','invalid_json'])('retains the reservation on provider failure %s',async failure=>{
    await unknown();vi.mocked(tap.retrieveTapCharge).mockImplementation(async()=>{if(typeof failure==='string')throw Error(failure+' private detail');return {ok:false,status:failure,body:{secret:'private'}};});
    expect((await review()).outcome).toBe('unverified');await assertUnsettled();expect(JSON.stringify(await reviews())).not.toContain('private');
  });
  it.each(['FAILED','DECLINED','RESTRICTED','CANCELLED','ABANDONED','VOID'])('records verified terminal %s without posting and permits only a new explicit checkout',async status=>{
    await unknown();charge.status=status;await review();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    expect((await query('SELECT failed_payments FROM payment_links WHERE id=?',[linkId]))[0].failed_payments).toBe(1);await review();
    expect((await query('SELECT failed_payments FROM payment_links WHERE id=?',[linkId]))[0].failed_payments).toBe(1);
    vi.mocked(tap.postTapCharge).mockResolvedValue({ok:true,status:200,body:{...charge,id:`chg_${randomUUID()}`,status:'INITIATED'}});
    await createDurableOrderCheckout({...input,checkoutAttemptId:randomUUID()});expect(tap.postTapCharge).toHaveBeenCalledTimes(2);
  });
  it.each(['INITIATED','AUTHORIZED'])('keeps %s unpaid without learning a sale',async status=>{
    await unknown();charge.status=status;await review();expect((await payments())[0].status).toBe(status==='INITIATED'?'pending':'authorized');
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    expect((await query('SELECT payment_status FROM orders WHERE id=?',[orderId]))[0].payment_status).toBe('unpaid');
  });
  it('does not renew an expired provider session during retrieval',async()=>{
    await unknown();charge.status='INITIATED';charge.transaction.created=String(Date.now()-86400000);await review();
    expect((await payments())[0].tap_payment_url).toBeNull();await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('uses the original provider expiry for an active recovered session',async()=>{
    await unknown();charge.status='INITIATED';charge.transaction.created=String(Date.now()-60000);await review();
    const payment=(await payments())[0];expect(new Date(payment.expires_at).getTime()).toBe(Number(charge.transaction.created)+1800000 - Number(charge.transaction.created)%1000);
    expect(await createDurableOrderCheckout(input)).toMatchObject({paymentUrl:charge.transaction.url});expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('refuses a different Tap account despite a matching merchant and amount',async()=>{
    await unknown();vi.mocked(db.getMerchantPaymentSettings).mockResolvedValue({...settings,tapSecretKey:'sk_test_other'} as any);
    expect((await review()).outcome).toBe('unverified');await assertUnsettled();
  });
  it('rejects another tenant before contacting Tap',async()=>{
    await unknown();await expect(reconcileOrderCheckout(other.merchantId,other.userId,await evidence())).rejects.toThrow();expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
  });
  it('requires a fresh snapshot and does not allow a supplied paid status or amount',async()=>{
    await unknown();const data=await evidence();for(const patch of [{status:'CAPTURED'},{amount:1},{reviewed:false},{evidence:'a'.repeat(64)}])await expect(reconcileOrderCheckout(owner.merchantId,owner.userId,{...data,...patch} as any)).rejects.toThrow();
    expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
  });
  it('does not reconcile a dispatch still within its settling window',async()=>{
    await unknown();await query("UPDATE order_checkout_attempts SET state='dispatching' WHERE order_id=?",[orderId]);await expect(review()).rejects.toThrow();expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
    await query('UPDATE order_checkout_attempts SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE order_id=?',[orderId]);await review();expect((await payments())[0].status).toBe('captured');
  });
  it('compares evidence again after GET when the order changes',async()=>{
    await unknown();vi.mocked(tap.retrieveTapCharge).mockImplementation(async()=>{await query("UPDATE orders SET status='cancelled' WHERE id=?",[orderId]);return {ok:true,status:200,body:charge};});
    await expect(review()).rejects.toThrow();expect(await payments()).toEqual([]);expect(await reviews()).toEqual([]);
    // A fresh review may record an actual late capture, without reopening the cancelled order.
    vi.mocked(tap.retrieveTapCharge).mockResolvedValue({ok:true,status:200,body:charge});await review();
    expect((await query('SELECT status,payment_status FROM orders WHERE id=?',[orderId]))[0]).toMatchObject({status:'cancelled',payment_status:'paid'});
  });
  it('serializes concurrent reviews of the same evidence',async()=>{
    await unknown();const data=await evidence();let count=0,go!:()=>void;const barrier=new Promise<void>(r=>go=r);
    vi.mocked(tap.retrieveTapCharge).mockImplementation(async()=>{if(++count===2)go();await barrier;return {ok:true,status:200,body:charge};});
    const results=await Promise.allSettled([reconcileOrderCheckout(owner.merchantId,owner.userId,data),reconcileOrderCheckout(owner.merchantId,owner.userId,data)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await payments()).toHaveLength(1);expect(await reviews()).toHaveLength(1);
  });
  it.each(['INSERT INTO order_payments','UPDATE orders','INSERT INTO order_checkout_reviews','UPDATE order_checkout_attempts','INSERT INTO ai_purchase_outcomes'])('rolls back every effect if %s fails',async sqlMarker=>{
    await unknown();const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:any[])=>{
      if(sql.includes(sqlMarker))throw Error('injected persistence failure');return target.execute(sql,args);
    };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(review()).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();await assertUnsettled();expect(await reviews()).toEqual([]);
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toEqual([]);
    expect((await query('SELECT usage_count FROM payment_links WHERE id=?',[linkId]))[0].usage_count).toBe(0);
  });
  it('survives a lost final commit acknowledgement without duplicate settlement',async()=>{
    await unknown();const data=await evidence(),pool=(await getPool())!,original=pool.getConnection.bind(pool);let commits=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{await target.commit();if(++commits===2)throw Error('lost acknowledgement');};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(reconcileOrderCheckout(owner.merchantId,owner.userId,data)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();
    expect((await payments())[0].status).toBe('captured');await review();expect(await payments()).toHaveLength(1);
    expect((await query('SELECT usage_count FROM payment_links WHERE id=?',[linkId]))[0].usage_count).toBe(1);
  });
  it('refuses a different charge for an already associated attempt before GET',async()=>{
    await unknown();await review();vi.mocked(tap.retrieveTapCharge).mockClear();const data=await evidence();await expect(reconcileOrderCheckout(owner.merchantId,owner.userId,{...data,chargeId:'chg_other_charge'})).rejects.toThrow();expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
  });
  it('rejects stale GET after a concurrent webhook and never revives a refunded payment',async()=>{
    await unknown();await review();const [payment]=await payments();
    vi.mocked(tap.retrieveTapCharge).mockImplementation(async()=>{
      await applyTapOrderPaymentState({paymentId:payment.id,tapChargeId:charge.id,providerStatus:'REFUNDED',expectedMerchantId:owner.merchantId,expectedAmount:26998,expectedCurrency:'SAR'});
      return {ok:true,status:200,body:charge};
    });
    await expect(review()).rejects.toThrow();vi.mocked(tap.retrieveTapCharge).mockResolvedValue({ok:true,status:200,body:charge});
    expect(await review()).toEqual({outcome:'verified',status:'refunded'});expect((await payments())[0].status).toBe('refunded');
  });
  it('can apply a verified refund only to an existing captured payment',async()=>{
    await unknown();await review();charge.status='REFUNDED';expect(await review()).toEqual({outcome:'verified',status:'refunded'});await review();
    expect((await query('SELECT verified_purchase_count FROM customer_profiles WHERE merchant_id=?',[owner.merchantId]))[0].verified_purchase_count).toBe(0);
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toHaveLength(2);
  });
  it('lets reconciliation win against a delayed original POST without duplicate payment or downgrade',async()=>{
    let entered!:()=>void,finish!:(value:any)=>void;const ready=new Promise<void>(r=>entered=r);
    vi.mocked(tap.postTapCharge).mockImplementation(async(_secret,payload:any)=>{charge.reference=payload.reference;charge.metadata=payload.metadata;entered();return new Promise(r=>finish=r);});
    const post=createDurableOrderCheckout(input);await ready;
    await query('UPDATE order_checkout_attempts SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE order_id=?',[orderId]);
    await review();finish({ok:true,status:200,body:{...charge,status:'INITIATED'}});await expect(post).rejects.toThrow();
    expect(await payments()).toHaveLength(1);expect((await payments())[0].status).toBe('captured');expect((await attempts())[0].state).toBe('created');expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('refuses a charge already owned by another local payment',async()=>{
    await unknown();await query("INSERT INTO order_payments (merchant_id,customer_phone,amount,currency,tap_charge_id,status) VALUES (?,'966500000099',26998,'SAR',?,'pending')",[other.merchantId,charge.id]);
    await expect(review()).rejects.toMatchObject({code:'ER_DUP_ENTRY'});await assertUnsettled();expect(await reviews()).toEqual([]);
  });
  it('does not settle an order that already owns another captured payment',async()=>{
    await unknown();await query("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,tap_charge_id,status) VALUES (?,?,'966500987654',26998,'SAR',?,'captured')",[owner.merchantId,orderId,`chg_${randomUUID()}`]);
    await expect(review()).rejects.toThrow('Target already has another settled payment');expect(await payments()).toHaveLength(1);expect((await attempts())[0].payment_id).toBeNull();expect(await reviews()).toEqual([]);
  });
  it.each(['disabled','unverified','missing_key'])('refuses reconciliation with %s gateway settings',async kind=>{
    await unknown();vi.mocked(db.getMerchantPaymentSettings).mockResolvedValue({...settings,...(kind==='disabled'?{tapEnabled:0}:kind==='unverified'?{isVerified:0}:{tapSecretKey:null})} as any);
    await expect(review()).rejects.toThrow();expect(tap.retrieveTapCharge).not.toHaveBeenCalled();await assertUnsettled();
  });
});
