import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {prepareCheckoutQuote,prepareCheckoutCouponQuote,acceptCheckoutQuote,approveCheckoutInvoice,type CheckoutIdentity,type CheckoutResult} from './checkout-agreements';
import {stageInteraction,finishInteractionDelivery} from './interaction-jobs';
import {buildReplyPlan} from '../messaging/reply-plan';
import {issueCanonicalOrderPaymentLink} from '../payment/order-payment-link';
import {createDurableOrderCheckout} from '../payment/order-checkout-attempts';
import {applyTapOrderPaymentState} from '../payment/order-payment-state';
import {getCheckoutDiscountRelease,releaseCheckoutDiscount} from './checkout-discount-release';
import * as db from '../db';
import * as tap from '../payment/tap-client';

describe.skipIf(!process.env.DATABASE_URL)('guarded coupon use release on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,identity:CheckoutIdentity,productId:number,couponId:number,orderId:number,link:any;
  const phone='966500987654',reason='Cancelled before collection after payment review';
  const query=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
  const incoming=async(content:string)=>{const row=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)",[identity.conversationId,content]);identity={...identity,incomingMessageId:row.insertId};};
  const quote=(r:CheckoutResult)=>{if(r.kind!=='quote')throw Error(r.text);return r;};
  const deliver=async(q:Extract<CheckoutResult,{kind:'quote'}>)=>{const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:phone,text:q.text});await stageInteraction(reply);await finishInteractionDelivery(reply,true);};
  const prepare=async()=>{await incoming('أريد شراء 3 سماعات');await deliver(quote(await prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:3}])));
    await incoming('طبق الكود LOCAL10');const q=quote(await prepareCheckoutCouponQuote(identity));await deliver(q);await incoming('نعم');const order=await acceptCheckoutQuote(identity,q.quotationId);if(order.kind!=='order')throw Error(order.text);return order.orderId;};
  const approve=(id:number)=>approveCheckoutInvoice({merchantId:owner.merchantId,orderId:id,actorUserId:owner.userId,expectedAmountMinor:26998,totalIsFinal:true});
  const cancel=(id=orderId)=>query("UPDATE orders SET status='cancelled' WHERE id=?",[id]);
  const used=async()=>(await query('SELECT usedCount FROM discount_codes WHERE id=?',[couponId]))[0]?.usedCount;
  const audit=()=>query('SELECT * FROM checkout_discount_releases WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const view=(id=orderId)=>getCheckoutDiscountRelease(owner.merchantId,id);
  const input=async(id=orderId)=>({orderId:id,evidence:(await view(id))!.evidence,reviewed:true as const,reason});
  const release=async(id=orderId)=>releaseCheckoutDiscount(owner.merchantId,owner.userId,await input(id));
  const charge=()=>({ok:true,status:200,body:{id:`chg_${randomUUID()}`,status:'INITIATED',amount:269.98,currency:'SAR',live_mode:false,transaction:{url:'https://sandbox.payments.tap.company/session/fixture'}}});
  const checkout=()=>createDurableOrderCheckout({linkId:link.link_id,checkoutAttemptId:randomUUID(),customerName:'Test Customer',customerPhone:phone});
  const state=async(providerStatus:string)=>{const [p]=await query('SELECT * FROM order_payments WHERE order_id=?',[orderId]);return applyTapOrderPaymentState({paymentId:p.id,tapChargeId:p.tap_charge_id,providerStatus,expectedMerchantId:owner.merchantId,expectedAmount:26998,expectedCurrency:'SAR'});};
  beforeEach(async()=>{
    owner=await createDisposableMerchant('coupon-release');other=await createDisposableMerchant('coupon-other');
    const c=await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)',[owner.merchantId,phone]);identity={merchantId:owner.merchantId,conversationId:c.insertId,customerPhone:phone,incomingMessageId:1};
    productId=(await query("INSERT INTO products (merchantId,name,price,price_unit,currency,cost_price,stock) VALUES (?,'سماعة',9999,'minor','SAR',6000,90)",[owner.merchantId])).insertId;
    couponId=(await query("INSERT INTO discount_codes (merchantId,code,type,value,maxUses,minOrderAmount,customer_phone) VALUES (?,'LOCAL10','percentage',10,5,100,?)",[owner.merchantId,phone])).insertId;
    orderId=await prepare();await approve(orderId);
    vi.spyOn(db,'getMerchantPaymentSettings').mockResolvedValue({tapEnabled:1,tapTestMode:1,isVerified:1,tapPublicKey:'pk_test_fixture',tapSecretKey:'sk_test_fixture'} as any);
    vi.spyOn(tap,'postTapCharge').mockImplementation(async()=>charge());vi.spyOn(tap,'retrieveTapCharge').mockRejectedValue(Error('Must not contact provider'));
    await issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId});[link]=await query('SELECT * FROM payment_links WHERE order_id=?',[orderId]);
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);

  it('releases exactly one use after cancellation, preserving invoice and redemption history',async()=>{
    expect((await view())?.blocker).toBe('order');await cancel();const before=await query('SELECT * FROM checkout_discount_redemptions WHERE order_id=?',[orderId]);
    expect(before[0].release_policy_version).toBe(1);expect((await view())?.state).toBe('eligible');const proof=await input();
    expect(await releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).toEqual({released:true,alreadyReleased:false});
    expect(await releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).toEqual({released:true,alreadyReleased:true});expect(await used()).toBe(0);expect(await audit()).toHaveLength(1);
    expect((await audit())[0]).toMatchObject({actor_user_id:owner.userId,reason,used_before:1,used_after:0,policy_version:1});
    expect(await query('SELECT * FROM checkout_discount_redemptions WHERE order_id=?',[orderId])).toEqual(before);
    expect((await query('SELECT status,totalAmount,payment_status,checkout_discount_released,paymentUrl FROM orders WHERE id=?',[orderId]))[0]).toEqual({status:'cancelled',totalAmount:26998,payment_status:'unpaid',checkout_discount_released:1,paymentUrl:null});
    expect((await query('SELECT status,is_active FROM payment_links WHERE id=?',[link.id]))[0]).toEqual({status:'disabled',is_active:0});
    expect((await view())?.state).toBe('released');expect(tap.postTapCharge).not.toHaveBeenCalled();expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
  });
  it('allows the released capacity to fund a new separately consented order without replaying the old one',async()=>{
    await query('UPDATE discount_codes SET maxUses=1 WHERE id=?',[couponId]);await cancel();await release();const next=await prepare();await approve(next);
    expect(await used()).toBe(1);expect(await query('SELECT id FROM checkout_discount_redemptions WHERE merchant_id=?',[owner.merchantId])).toHaveLength(2);
    await expect(checkout()).rejects.toThrow();expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it('fences checkout, link issuance and invoice replay even if a stale writer reopens order status',async()=>{
    await cancel();await release();await query("UPDATE orders SET status='pending' WHERE id=?",[orderId]);
    await expect(approve(orderId)).rejects.toThrow();await expect(checkout()).rejects.toThrow();
    expect(await issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId})).toEqual({issued:false,reason:'order_not_payable'});expect(tap.postTapCharge).not.toHaveBeenCalled();
  });
  it.each([0,2])('does not backfill missing release provenance or accept policy version %i',async version=>{
    await cancel();await query('UPDATE checkout_discount_redemptions SET release_policy_version=? WHERE order_id=?',[version,orderId]);expect((await view())?.blocker).toBe('legacy');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);
  });
  it.each(["status='pending'","status='processing'","status='delivered'","payment_status='paid'","payment_status='refunded'","checkout_review_required=1","sallaOrderId='external'"])
    ('refuses a non-eligible order %s',async patch=>{await cancel();await query(`UPDATE orders SET ${patch} WHERE id=?`,[orderId]);expect((await view())?.blocker).toBe('order');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);});
  it.each(["totalAmount=27000","currency='USD'","discountCode='OTHER'","checkout_discount_minor=2998","checkout_subtotal_minor=29998","checkout_discount_released=1"])
    ('refuses a changed invoice identity %s',async patch=>{await cancel();await query(`UPDATE orders SET ${patch} WHERE id=?`,[orderId]);expect((await view())?.blocker).toBe('identity');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);});
  it.each(['FAILED','DECLINED','RESTRICTED','CANCELLED','ABANDONED','VOID'])('allows release after every tracked payment has verified terminal %s',async status=>{
    await checkout();await state(status);await cancel();expect((await view())?.state).toBe('eligible');await release();expect(await used()).toBe(0);
  });
  it.each(['INITIATED','AUTHORIZED','UNKNOWN','TIMEDOUT','CAPTURED','REFUNDED'])('never releases from a live, ambiguous or collected %s',async status=>{
    await checkout();if(status==='REFUNDED')await state('CAPTURED');await state(status);await cancel();await expect(release()).rejects.toThrow();expect(await used()).toBe(1);expect(await audit()).toEqual([]);
  });
  it('does not infer failure from elapsed expiry or a missing dispatch response',async()=>{
    vi.mocked(tap.postTapCharge).mockRejectedValue(Error('timeout'));await expect(checkout()).rejects.toThrow();await cancel();
    await query('UPDATE payment_links SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[link.id]);
    await query('UPDATE order_checkout_attempts SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) WHERE order_id=?',[orderId]);
    expect((await view())?.blocker).toBe('payment');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);
  });
  it('blocks a dispatch already committed before concurrent cancellation and release',async()=>{
    let entered!:()=>void,finish!:(r:any)=>void;const ready=new Promise<void>(r=>entered=r);vi.mocked(tap.postTapCharge).mockImplementation(()=>{entered();return new Promise(r=>finish=r);});
    const pending=checkout();await ready;await cancel();expect((await view())?.blocker).toBe('payment');await expect(release()).rejects.toThrow();
    finish(charge());await expect(pending).rejects.toThrow();await expect(release()).rejects.toThrow();await state('FAILED');await release();expect(await used()).toBe(0);expect(tap.postTapCharge).toHaveBeenCalledTimes(1);
  });
  it('checks all attempts, including a later ambiguous attempt after an earlier verified failure',async()=>{
    await checkout();await state('FAILED');vi.mocked(tap.postTapCharge).mockRejectedValue(Error('timeout'));await expect(checkout()).rejects.toThrow();await cancel();
    await expect(release()).rejects.toThrow();expect(await used()).toBe(1);
  });
  it.each(["last_webhook_at=NULL","last_webhook_status='TIMEDOUT'","captured_at=UTC_TIMESTAMP()","refunded_at=UTC_TIMESTAMP()","amount=1","currency='USD'","metadata='{}'"])
    ('refuses incomplete or changed payment evidence %s',async patch=>{await checkout();await state('FAILED');await cancel();await query(`UPDATE order_payments SET ${patch} WHERE order_id=?`,[orderId]);expect((await view())?.blocker).toBe('payment');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);});
  it('refuses an untracked legacy payment even when it says failed',async()=>{
    await cancel();await query("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,status,last_webhook_status,last_webhook_at,tap_charge_id) VALUES (?,?,?,26998,'SAR','failed','FAILED',UTC_TIMESTAMP(),?)",[owner.merchantId,orderId,phone,`chg_${randomUUID()}`]);await expect(release()).rejects.toThrow();expect(await used()).toBe(1);
  });
  it.each(['usage_count','successful_payments','total_collected'])('refuses residual payment-link history %s',async field=>{
    await cancel();await query(`UPDATE payment_links SET ${field}=1 WHERE id=?`,[link.id]);expect((await view())?.blocker).toBe('payment');await expect(release()).rejects.toThrow();
  });
  it('refuses another tenant before releasing or disclosing evidence',async()=>{
    await cancel();const proof=await input();await expect(getCheckoutDiscountRelease(other.merchantId,orderId)).rejects.toThrow();await expect(releaseCheckoutDiscount(other.merchantId,other.userId,proof)).rejects.toThrow();expect(await used()).toBe(1);
  });
  it('does not decrement a recreated coupon with the original name or another merchant coupon',async()=>{
    await cancel();await query('DELETE FROM discount_codes WHERE id=?',[couponId]);const id=(await query("INSERT INTO discount_codes (merchantId,code,type,value,usedCount) VALUES (?,'LOCAL10','percentage',10,4)",[owner.merchantId])).insertId;
    expect((await view())?.blocker).toBe('coupon');await expect(release()).rejects.toThrow();expect((await query('SELECT usedCount FROM discount_codes WHERE id=?',[id]))[0].usedCount).toBe(4);
  });
  it.each(["isActive=0","expiresAt=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)"])('preserves coupon validity rules when releasing a use: %s',async patch=>{
    await cancel();await query(`UPDATE discount_codes SET ${patch} WHERE id=?`,[couponId]);await release();expect(await used()).toBe(0);
    if(patch==='isActive=0')expect((await query('SELECT isActive FROM discount_codes WHERE id=?',[couponId]))[0].isActive).toBe(0);
  });
  it.each([0,-1])('refuses an invalid counter %i without clamping',async count=>{await cancel();await query('UPDATE discount_codes SET usedCount=? WHERE id=?',[count,couponId]);expect((await view())?.blocker).toBe('counter');await expect(release()).rejects.toThrow();expect(await used()).toBe(count);});
  it('refuses a counter below all outstanding local redemptions',async()=>{
    const next=await prepare();await approve(next);await query('UPDATE discount_codes SET usedCount=1 WHERE id=?',[couponId]);await cancel();expect((await view())?.blocker).toBe('counter');await expect(release()).rejects.toThrow();expect(await used()).toBe(1);
  });
  it('requires fresh evidence after a counter change and preserves legacy extra uses',async()=>{
    await cancel();const proof=await input();await query('UPDATE discount_codes SET usedCount=usedCount+2 WHERE id=?',[couponId]);await expect(releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).rejects.toThrow();await release();expect(await used()).toBe(2);
  });
  it('serializes repeated and simultaneous release of the same order',async()=>{
    await cancel();const proof=await input();const results=await Promise.all(Array.from({length:4},()=>releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)));
    expect(results.filter(r=>!r.alreadyReleased)).toHaveLength(1);expect(await used()).toBe(0);expect(await audit()).toHaveLength(1);
  });
  it('serializes releases on separate orders sharing a coupon without underflow',async()=>{
    const next=await prepare();await approve(next);await cancel();await cancel(next);const inputs=await Promise.all([input(),input(next)]);
    const results=await Promise.allSettled(inputs.map(i=>releaseCheckoutDiscount(owner.merchantId,owner.userId,i)));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    for(let i=0;i<2;i++)if(results[i].status==='rejected')await release(inputs[i].orderId);
    expect(await used()).toBe(0);expect(await audit()).toHaveLength(2);
  });
  it('does not lose a concurrent approval of another order using the same coupon',async()=>{
    const next=await prepare();await cancel();const proof=await input();const results=await Promise.allSettled([releaseCheckoutDiscount(owner.merchantId,owner.userId,proof),approve(next)]);
    expect(results[1].status).toBe('fulfilled');if(results[0].status==='rejected')await release();expect(await used()).toBe(1);expect(await audit()).toHaveLength(1);
  });
  it.each(['UPDATE discount_codes','UPDATE payment_links','UPDATE orders','INSERT INTO checkout_discount_releases'])('rolls back all effects when %s fails',async marker=>{
    await cancel();const proof=await input(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:any[])=>{if(sql.includes(marker))throw Error('injected failure');return target.execute(sql,args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
    await expect(releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();expect(await used()).toBe(1);expect(await audit()).toEqual([]);
    expect((await query('SELECT checkout_discount_released FROM orders WHERE id=?',[orderId]))[0].checkout_discount_released).toBe(0);expect((await query('SELECT is_active FROM payment_links WHERE id=?',[link.id]))[0].is_active).toBe(1);await release();expect(await used()).toBe(0);
  });
  it('survives lost commit acknowledgement without decrementing again',async()=>{
    await cancel();const proof=await input(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{await target.commit();throw Error('lost commit acknowledgement');};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
    await expect(releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).rejects.toThrow();vi.spyOn(pool,'getConnection').mockRestore();expect(await releaseCheckoutDiscount(owner.merchantId,owner.userId,proof)).toMatchObject({alreadyReleased:true});expect(await used()).toBe(0);expect(await audit()).toHaveLength(1);
  });
});
