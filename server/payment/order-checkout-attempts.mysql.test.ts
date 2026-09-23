import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {createDurableOrderCheckout,getOrderCheckoutAttempts} from './order-checkout-attempts';
import {applyTapOrderPaymentState} from './order-payment-state';
import * as db from '../db';
import * as tap from './tap-client';
import {appRouter} from '../routers';

describe.skipIf(!process.env.DATABASE_URL)('durable local order checkout on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,orderId:number,linkId:number,input:any;
  const settings={tapEnabled:1,tapTestMode:1,isVerified:1,tapPublicKey:'pk_test_fixture',tapSecretKey:'sk_test_fixture'};
  const query=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
  const attempts=()=>query('SELECT * FROM order_checkout_attempts WHERE order_id=? ORDER BY created_at,id',[orderId]);
  const payments=()=>query('SELECT * FROM order_payments WHERE order_id=?',[orderId]);
  const response=()=>({ok:true,status:200,body:{id:`chg_${randomUUID()}`,status:'INITIATED',amount:269.98,currency:'SAR',live_mode:false,
    transaction:{url:'https://sandbox.payments.tap.company/session/fixture',expiry:{period:30,type:'MINUTE'}}}});
  const retry=()=>createDurableOrderCheckout({...input,checkoutAttemptId:randomUUID()});
  const setPaymentState=async(providerStatus:string)=>{const [payment]=await payments();return applyTapOrderPaymentState({paymentId:payment.id,tapChargeId:payment.tap_charge_id,
    providerStatus,expectedMerchantId:owner.merchantId,expectedAmount:26998,expectedCurrency:'SAR'});};
  beforeEach(async()=>{
    owner=await createDisposableMerchant('tap-checkout');other=await createDisposableMerchant('other-tap');
    const order=await query("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,payment_status,checkout_review_required) VALUES (?,'966500987654','Test','[]',26998,'SAR','pending','unpaid',0)",[owner.merchantId]);orderId=order.insertId;
    const token='link_'+randomUUID().replaceAll('-','');
    const link=await query("INSERT INTO payment_links (merchant_id,order_id,link_id,title,amount,currency,tap_payment_url,max_usage_count) VALUES (?,?,?,'Order checkout',26998,'SAR','https://example.test/pay',1)",[owner.merchantId,orderId,token]);linkId=link.insertId;
    input={linkId:token,checkoutAttemptId:randomUUID(),customerName:'Test Customer',customerPhone:'0500987654'};
    vi.spyOn(db,'getMerchantPaymentSettings').mockResolvedValue(settings as any);
    vi.spyOn(tap,'postTapCharge').mockImplementation(async()=>response());
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);

  it('commits authority before POST then stores the payment and result atomically',async()=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async(_key,payload:any)=>{
      expect((await attempts())[0]).toMatchObject({state:'dispatching',order_id:orderId,amount_minor:26998});
      expect(payload).toMatchObject({amount:269.98,currency:'SAR',customer:{phone:{number:'500987654'}}});
      expect(payload.reference.idempotent).toBe((await attempts())[0].provider_reference);
      return response();
    });
    const result=await createDurableOrderCheckout(input);expect(result.paymentUrl).toContain('tap.company');
    const [attempt]=await attempts(),[payment]=await payments();expect(attempt).toMatchObject({state:'created',payment_id:payment.id,merchant_id:owner.merchantId});
    expect(payment).toMatchObject({amount:26998,status:'pending',order_id:orderId,merchant_id:owner.merchantId});
    expect(JSON.stringify(attempt)).not.toContain(settings.tapSecretKey);expect(JSON.stringify(attempt)).not.toContain(input.customerName);
    expect((await query('SELECT payment_status FROM orders WHERE id=?',[orderId]))[0].payment_status).toBe('unpaid');
  });
  it('serializes concurrent clicks and reuses the created session even with a fresh browser UUID',async()=>{
    let entered!:()=>void,finish!:(r:any)=>void;const ready=new Promise<void>(r=>entered=r);
    vi.mocked(tap.postTapCharge).mockImplementation(()=>{entered();return new Promise(r=>finish=r);});
    const first=createDurableOrderCheckout(input);await ready;
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();await expect(retry()).rejects.toThrow();
    finish(response());const result=await first;expect(await retry()).toEqual(result);expect(await createDurableOrderCheckout(input)).toEqual(result);
    expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await payments()).toHaveLength(1);expect(await attempts()).toHaveLength(1);
  });
  it.each(['network','timeout','invalid_json','http','amount','url','mode'])('retains a durable unknown after %s and never posts it again',async failure=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async()=>{
      if(['network','timeout','invalid_json'].includes(failure))throw new Error(failure);
      const r=response();if(failure==='http'){r.ok=false;r.status=503;}if(failure==='amount')r.body.amount=999;
      if(failure==='url')r.body.transaction.url='https://attacker.test/pay';if(failure==='mode')r.body.live_mode=true;return r;
    });
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect((await attempts())[0]).toMatchObject({state:'unknown',failure_code:'outcome_unverified'});
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await payments()).toEqual([]);
  });
  it.each(["status='cancelled'","status='paid'","payment_status='paid'","payment_status='refunded'","checkout_review_required=1","sallaOrderId='external'","currency='USD'","totalAmount=30000"])
    ('refuses an ineligible order before POST: %s',async patch=>{
      await query(`UPDATE orders SET ${patch} WHERE id=?`,[orderId]);await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);
    });
  it.each(["status='disabled'","is_active=0","expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)","usage_count=1","amount=30000","currency='USD'","is_fixed_amount=0"])
    ('refuses an ineligible link before POST: %s',async patch=>{
      await query(`UPDATE payment_links SET ${patch} WHERE id=?`,[linkId]);await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
    });
  it('rejects cross-tenant link identity and caller-supplied financial authority',async()=>{
    await expect(createDurableOrderCheckout({...input,merchantId:other.merchantId})).rejects.toThrow();
    await query('UPDATE payment_links SET merchant_id=? WHERE id=?',[other.merchantId,linkId]);
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it.each([{customerName:'Different buyer'},{customerPhone:'0500000099'},{customerEmail:'changed@example.test'}])('never reuses a session for changed customer details: %j',async patch=>{
    await createDurableOrderCheckout(input);await expect(createDurableOrderCheckout({...input,...patch})).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('blocks reuse after the merchant changes Tap account and does not persist credentials',async()=>{
    await createDurableOrderCheckout(input);vi.mocked(db.getMerchantPaymentSettings).mockResolvedValue({...settings,tapSecretKey:'sk_test_other'} as any);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('stores a provider effect after concurrent cancellation but does not hand out its URL',async()=>{
    vi.mocked(tap.postTapCharge).mockImplementation(async()=>{await query("UPDATE orders SET status='cancelled' WHERE id=?",[orderId]);return response();});
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect((await attempts())[0].state).toBe('created');expect(await payments()).toHaveLength(1);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it.each(['payment','result'])('rolls back %s persistence and keeps the uncertain reservation',async failure=>{
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:any[])=>{
      if(sql.includes(failure==='payment'?'INSERT INTO order_payments':"SET state='created'"))throw Error('injected persistence failure');return target.execute(sql,args);
    };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();
    expect((await attempts())[0].state).toBe('unknown');expect(await payments()).toEqual([]);await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it.each([1,2])('never duplicates POST when commit acknowledgement %i is lost',async loseAt=>{
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);let commits=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{
      await target.commit();if(++commits===loseAt)throw Error('lost commit acknowledgement');
    };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();
    if(loseAt===1){expect((await attempts())[0].state).toBe('dispatching');await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();}
    else {expect((await attempts())[0].state).toBe('created');await retry();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await payments()).toHaveLength(1);}
  });
  it.each(['FAILED','DECLINED','CANCELLED','VOID'])('permits a fresh request only after a verified terminal %s',async status=>{
    await createDurableOrderCheckout(input);await setPaymentState(status);
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();await retry();
    expect(tap.postTapCharge).toHaveBeenCalledTimes(2);expect((await attempts()).map((r:any)=>r.state).sort()).toEqual(['created','failed']);
  });
  it.each(['UNKNOWN','TIMEDOUT','AUTHORIZED'])('does not infer retry authority from %s',async status=>{
    await createDurableOrderCheckout(input);await setPaymentState(status);
    if(status==='AUTHORIZED')await retry();else await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('does not treat session expiry as proof of provider cancellation',async()=>{
    await createDurableOrderCheckout(input);await query('UPDATE order_payments SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE order_id=?',[orderId]);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('guards old payments that have no durable reservation',async()=>{
    await query("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,status) VALUES (?,?,'966500987654',26998,'SAR','pending')",[owner.merchantId,orderId]);
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('does not age an unknown outcome into authority for another POST',async()=>{
    vi.mocked(tap.postTapCharge).mockRejectedValue(new Error('network outcome lost'));
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();
    await query('UPDATE order_checkout_attempts SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY),updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY) WHERE order_id=?',[orderId]);
    await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('allows independent orders without a merchant-wide active-attempt bottleneck',async()=>{
    const second=await query("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,payment_status,checkout_review_required) VALUES (?,'966500000001','Other','[]',26998,'SAR','pending','unpaid',0)",[owner.merchantId]);
    const token='link_'+randomUUID().replaceAll('-','');
    await query("INSERT INTO payment_links (merchant_id,order_id,link_id,title,amount,currency,tap_payment_url,max_usage_count) VALUES (?,?,?,'Second order',26998,'SAR','https://example.test/pay',1)",[owner.merchantId,second.insertId,token]);
    await Promise.all([createDurableOrderCheckout(input),createDurableOrderCheckout({...input,linkId:token,checkoutAttemptId:randomUUID()})]);
    expect(tap.postTapCharge).toHaveBeenCalledTimes(2);expect(await query('SELECT id FROM order_checkout_attempts WHERE merchant_id=?',[owner.merchantId])).toHaveLength(2);
  });
  it.each(["amount=99","metadata='{}'","tap_payment_url='https://attacker.test/pay'"])
    ('rejects corrupted persisted payment on reuse: %s',async patch=>{
      await createDurableOrderCheckout(input);await query(`UPDATE order_payments SET ${patch} WHERE order_id=?`,[orderId]);await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
    });
  it('routes real public order checkout through the ledger and rejects injected amounts',async()=>{
    const caller=appRouter.createCaller({user:null,req:{},res:{}} as any);
    await expect(caller.payments.checkoutLink({...input,amount:1} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
    const result=await caller.payments.checkoutLink(input);expect(result.paymentUrl).toContain('tap.company');
    await caller.payments.checkoutLink({...input,checkoutAttemptId:randomUUID()});expect(tap.postTapCharge).toHaveBeenCalledTimes(1);expect(await attempts()).toHaveLength(1);
  });
  it('scopes merchant evidence and omits payer details, hashes, secrets and payment URLs',async()=>{
    await createDurableOrderCheckout(input);
    await expect(getOrderCheckoutAttempts(other.merchantId,orderId)).rejects.toThrow();
    const audit=await getOrderCheckoutAttempts(owner.merchantId,orderId);expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({state:'created',amountMinor:26998});
    expect(Object.keys(audit[0]).sort()).toEqual(['id','state','reference','amountMinor','currency','paymentId','createdAt','updatedAt'].sort());
  });
  it('keeps unknown authority even if recording the unknown marker also fails',async()=>{
    const pool=(await getPool())!,original=pool.execute.bind(pool);
    vi.spyOn(pool,'execute').mockImplementation(async(sql:any,args?:any)=>{
      if(typeof sql==='string'&&sql.includes("SET state='unknown'"))throw Error('storage offline');return original(sql,args);
    });
    vi.mocked(tap.postTapCharge).mockRejectedValue(new Error('timeout'));
    await expect(createDurableOrderCheckout(input)).rejects.toThrow();vi.spyOn(pool,'execute').mockRestore();
    expect((await attempts())[0].state).toBe('dispatching');await expect(retry()).rejects.toThrow();expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('enforces the unique active-order guard even against an uncoordinated insert',async()=>{
    await createDurableOrderCheckout(input);
    await expect(query(`INSERT INTO order_checkout_attempts (id,merchant_id,order_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency)
      VALUES (?,?,?,?,?,?,?,26998,'SAR')`,[randomUUID(),owner.merchantId,orderId,linkId,randomUUID(),'a'.repeat(64),'sari_pl_other'])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
  });
});
