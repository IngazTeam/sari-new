import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {prepareCheckoutQuote,prepareCheckoutCouponQuote,acceptCheckoutQuote,approveCheckoutInvoice,type CheckoutIdentity,type CheckoutResult} from './checkout-agreements';
import {stageInteraction,finishInteractionDelivery} from './interaction-jobs';
import {buildReplyPlan} from '../messaging/reply-plan';
import {getMarginPolicy,updateMarginPolicy} from './checkout-margin-policy';
import {previewCheckoutMargin} from './checkout-margin';
import {issueCanonicalOrderPaymentLink} from '../payment/order-payment-link';
import * as db from '../db';

describe.skipIf(!process.env.DATABASE_URL)('agreed local coupon redemption on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,identity:CheckoutIdentity,productId:number,couponId:number,base:Extract<CheckoutResult,{kind:'quote'}>;
  const phone='966500987654',costs={taxMinor:0,shippingCostMinor:0,otherCostMinor:0};
  const query=async(sql:string,args:any[]=[]) => (await(await getPool())!.execute<any>(sql,args))[0];
  const incoming=async(content:string)=>{const row=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)",[identity.conversationId,content]);identity={...identity,incomingMessageId:row.insertId};return identity;};
  const asQuote=(r:CheckoutResult)=>{if(r.kind!=='quote')throw Error(r.text);return r;};
  const deliver=async(quote:Extract<CheckoutResult,{kind:'quote'}>)=>{const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:phone,text:quote.text});await stageInteraction(reply);await finishInteractionDelivery(reply,true);};
  const coupon=async(command='طبق الكود LOCAL10')=>{await incoming(command);const quote=asQuote(await prepareCheckoutCouponQuote(identity));await deliver(quote);return quote;};
  const accept=async(quote:Extract<CheckoutResult,{kind:'quote'}>)=>{await incoming('نعم');const result=await acceptCheckoutQuote(identity,quote.quotationId);if(result.kind!=='order')throw Error(result.text);return result.orderId;};
  const stored=async(orderId:number)=>(await query('SELECT * FROM orders WHERE id=?',[orderId]))[0];
  const used=async()=>(await query('SELECT usedCount FROM discount_codes WHERE id=?',[couponId]))[0]?.usedCount;
  const ledger=()=>query('SELECT * FROM checkout_discount_redemptions WHERE merchant_id=?',[owner.merchantId]);
  const approve=async(orderId:number,margin?:any,authorizeMarginException=false)=>approveCheckoutInvoice({merchantId:owner.merchantId,orderId,actorUserId:owner.userId,
    expectedAmountMinor:(await stored(orderId)).totalAmount,totalIsFinal:true,margin,authorizeMarginException});
  beforeEach(async()=>{
    owner=await createDisposableMerchant('checkout-coupon');other=await createDisposableMerchant('foreign-coupon');
    const c=await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)',[owner.merchantId,phone]);identity={merchantId:owner.merchantId,conversationId:c.insertId,customerPhone:phone,incomingMessageId:1};
    const p=await query("INSERT INTO products (merchantId,name,price,price_unit,currency,cost_price,stock) VALUES (?,'سماعة',9999,'minor','SAR',6000,90)",[owner.merchantId]);productId=p.insertId;
    const d=await query("INSERT INTO discount_codes (merchantId,code,type,value,maxUses,minOrderAmount,customer_phone) VALUES (?,'LOCAL10','percentage',10,2,100,?)",[owner.merchantId,'+966500987654']);couponId=d.insertId;
    await incoming('أريد شراء 3 سماعات');base=asQuote(await prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:3}]));await deliver(base);
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  it('revises the offered amount before a new consent, without consuming usage or creating an order',async()=>{
    const quote=await coupon();expect(quote.snapshot).toMatchObject({version:2,catalogSubtotalMinor:29997,totalMinor:26998,discount:{amountMinor:2999,code:'LOCAL10'}});
    expect(quote.text).toContain('قيمة المنتجات بعد الخصم');expect(quote.text).toContain('لم يُحجز');expect(await used()).toBe(0);expect(await ledger()).toEqual([]);
    expect(await query('SELECT id FROM orders WHERE merchantId=?',[owner.merchantId])).toEqual([]);
    const [row]=await query('SELECT subtotal,total,items FROM sales_quotations WHERE id=?',[quote.quotationId]);expect(Number(row.subtotal)).toBe(299.97);expect(Number(row.total)).toBe(269.98);expect(JSON.parse(row.items)[0].unitPrice).toBe(99.99);
    expect((await query('SELECT status FROM sales_quotations WHERE id=?',[base.quotationId]))[0].status).toBe('expired');
    await incoming('نعم');expect((await acceptCheckoutQuote(identity,base.quotationId)).kind).toBe('changed');expect((await acceptCheckoutQuote(identity,quote.quotationId)).kind).toBe('order');
    expect(await used()).toBe(0);
  });
  it('records a canonical discounted order then atomically consumes one use at approval, including concurrent retries',async()=>{
    const quote=await coupon(),orderId=await accept(quote);expect(await stored(orderId)).toMatchObject({totalAmount:26998,discountCode:'LOCAL10',checkout_subtotal_minor:29997,checkout_discount_minor:2999,checkout_review_required:1});
    expect(await issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId})).toEqual({issued:false,reason:'order_not_payable'});
    await Promise.all([approve(orderId),approve(orderId)]);await approve(orderId);expect(await used()).toBe(1);expect(await ledger()).toHaveLength(1);
    expect((await ledger())[0]).toMatchObject({order_id:orderId,quotation_id:quote.quotationId,actor_user_id:owner.userId,subtotal_minor:29997,discount_minor:2999,total_minor:26998});
    vi.spyOn(db,'getMerchantPaymentSettings').mockResolvedValue({tapEnabled:1,tapTestMode:1,isVerified:1,tapPublicKey:'pk_test_fixture',tapSecretKey:'sk_test_fixture'} as any);
    const payment=await issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId,requestedAmountInHalalas:26998});expect(payment.issued).toBe(true);
    expect((await query('SELECT amount FROM payment_links WHERE order_id=?',[orderId]))[0].amount).toBe(26998);
    await expect(issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId,requestedAmountInHalalas:29997})).resolves.toEqual({issued:false,reason:'order_not_payable'});
    expect((await stored(orderId)).payment_status).toBe('unpaid');
  });
  it('does not create duplicate quotations on concurrent source retry',async()=>{
    await incoming('طبق الكود LOCAL10');const [a,b]=await Promise.all([prepareCheckoutCouponQuote(identity),prepareCheckoutCouponQuote(identity)]);
    expect(asQuote(a).quotationId).toBe(asQuote(b).quotationId);expect(await used()).toBe(0);
  });
  it('removes a coupon by issuing a new full-price offer and never stacks a replacement',async()=>{
    await coupon();const replaced=await coupon();expect(replaced.snapshot.totalMinor).toBe(26998);
    const removed=await coupon('أزل الخصم');expect(removed.snapshot).toMatchObject({version:1,totalMinor:29997});const orderId=await accept(removed);await approve(orderId);
    expect(await used()).toBe(0);expect((await stored(orderId)).discountCode).toBeNull();
  });
  it('uses fixed legacy SAR units and accepts a explicitly requested scarce public code',async()=>{
    await query("UPDATE discount_codes SET type='fixed',value=25,maxUses=1,customer_phone=NULL WHERE id=?",[couponId]);const quote=await coupon();expect(quote.snapshot.totalMinor).toBe(27497);
    const orderId=await accept(quote);await approve(orderId);expect(await used()).toBe(1);
  });
  it('preserves and recalculates a pending coupon when the customer changes quantities',async()=>{
    await coupon();await incoming('خليها 4 سماعات');const revised=asQuote(await prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:4}]));
    expect(revised.snapshot).toMatchObject({version:2,catalogSubtotalMinor:39996,totalMinor:35997,discount:{amountMinor:3999,code:'LOCAL10'}});expect(await used()).toBe(0);
  });
  it('does not silently drop an unavailable pending coupon during a quantity edit',async()=>{
    await coupon();await query('UPDATE discount_codes SET isActive=0 WHERE id=?',[couponId]);await incoming('خليها 4 سماعات');
    await expect(prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:4}])).rejects.toThrow();expect(await used()).toBe(0);
  });
  it.each(["isActive=0","value=101","value=0","usedCount=2","usedCount=-1","maxUses=0","minOrderAmount=300","expiresAt=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)","customer_phone='966500000099'","customer_phone='unknown'","merchantId=0"])
    ('does not offer an unavailable or malformed coupon: %s',async patch=>{
      if(patch==='merchantId=0')await query('UPDATE discount_codes SET merchantId=? WHERE id=?',[other.merchantId,couponId]);else await query(`UPDATE discount_codes SET ${patch} WHERE id=?`,[couponId]);
      await incoming('طبق الكود LOCAL10');await expect(prepareCheckoutCouponQuote(identity)).rejects.toThrow();expect(await ledger()).toEqual([]);
      expect((await query('SELECT status FROM sales_quotations WHERE id=?',[base.quotationId]))[0].status).toBe('sent');
    });
  it.each(['source text','foreign merchant','foreign phone','takeover','unsent','expired','already ordered'])('requires an owned current delivered offer and command: %s',async mode=>{
    if(mode==='already ordered')await accept(base);
    if(mode==='unsent')await query('DELETE FROM ai_interaction_jobs WHERE conversation_id=?',[identity.conversationId]);
    if(mode==='expired')await query('UPDATE sales_quotations SET offer_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[base.quotationId]);
    if(mode==='takeover')await query('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
    await incoming(mode==='source text'?'ما السعر؟':'طبق الكود LOCAL10');
    const result=await prepareCheckoutCouponQuote({...identity,...(mode==='foreign merchant'?{merchantId:other.merchantId}:mode==='foreign phone'?{customerPhone:'966500000099'}:{})}).catch(()=>null);
    expect(result?.kind).not.toBe('quote');expect(await used()).toBe(0);
  });
  it('does not consume for an undelivered offer or a refusal',async()=>{
    await incoming('طبق الكود LOCAL10');const quote=asQuote(await prepareCheckoutCouponQuote(identity));await incoming('نعم');expect((await acceptCheckoutQuote(identity,quote.quotationId)).kind).toBe('clarify');
    await incoming('لا');expect((await acceptCheckoutQuote(identity,quote.quotationId)).kind).toBe('declined');expect(await used()).toBe(0);
  });
  it.each(['value=11','isActive=0','usedCount=2'])('rechecks the coupon before accepting consent: %s',async change=>{
    const quote=await coupon();await query(`UPDATE discount_codes SET ${change} WHERE id=?`,[couponId]);await incoming('نعم');expect((await acceptCheckoutQuote(identity,quote.quotationId)).kind).toBe('changed');expect(await ledger()).toEqual([]);
  });
  it.each(['value=11','isActive=0','usedCount=2','expiresAt=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)'])('blocks approval without increasing the agreed price when coupon changes: %s',async change=>{
    const orderId=await accept(await coupon());await query(`UPDATE discount_codes SET ${change} WHERE id=?`,[couponId]);await expect(approve(orderId)).rejects.toThrow();
    expect(await stored(orderId)).toMatchObject({totalAmount:26998,checkout_review_required:1});expect(await ledger()).toEqual([]);
  });
  it('allows remaining capacity to change without treating the usage timestamp as a new commercial term',async()=>{
    const orderId=await accept(await coupon());await query('UPDATE discount_codes SET usedCount=1 WHERE id=?',[couponId]);await approve(orderId);expect(await used()).toBe(2);
  });
  it('applies the margin floor to the discounted total and never consumes while margin approval fails',async()=>{
    const orderId=await accept(await coupon()),p=await getMarginPolicy(owner.merchantId);
    await updateMarginPolicy({merchantId:owner.merchantId,actorUserId:owner.userId,policy:{enabled:true,minPercent:35},expectedRevision:p.revision,evidence:p.evidence,reviewed:true});
    const preview=await previewCheckoutMargin({merchantId:owner.merchantId,orderId,costs});expect(preview).toMatchObject({status:'below_floor',totalMinor:26998,calculation:{profitMinor:8998}});
    const proof={costs,evidence:preview.evidence,reviewedCosts:true};await expect(approve(orderId,proof)).rejects.toThrow();expect(await used()).toBe(0);
    await approve(orderId,{...proof,exception:{reason:'استثناء موثق لهذه الفاتورة بعد الخصم',reviewed:true}},true);expect(await used()).toBe(1);expect(await query('SELECT id FROM checkout_margin_exceptions WHERE order_id=?',[orderId])).toHaveLength(1);
  });
  it.each(['discountCode','checkout_subtotal_minor','checkout_discount_minor'])('rejects a changed order discount field %s',async field=>{
    const orderId=await accept(await coupon());await query(`UPDATE orders SET ${field}=? WHERE id=?`,[field==='discountCode'?'OTHER':1,orderId]);await expect(approve(orderId)).rejects.toThrow();expect(await used()).toBe(0);
  });
  it.each(['ledger','invoice'])('rolls back coupon consumption and approval after %s failure',async failure=>{
    const orderId=await accept(await coupon()),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:unknown[])=>{
      if(sql.includes(failure==='ledger'?'INSERT INTO checkout_discount_redemptions':'UPDATE orders SET checkout_review_required = 0'))throw Error('Injected redemption failure');return target.execute(sql,args);
    };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
    await expect(approve(orderId)).rejects.toThrow('Injected');vi.restoreAllMocks();expect(await used()).toBe(0);expect(await ledger()).toEqual([]);expect((await stored(orderId)).checkout_review_required).toBe(1);
    await approve(orderId);expect(await used()).toBe(1);
  });
  it('serializes two distinct invoices competing for the last coupon use',async()=>{
    await query('UPDATE discount_codes SET maxUses=1 WHERE id=?',[couponId]);const first=await accept(await coupon());
    const p=await query("INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?,'منتج آخر',9999,'minor','SAR',50)",[owner.merchantId]);
    await incoming('أريد شراء 3 من المنتج الآخر');const b=asQuote(await prepareCheckoutQuote(identity,[{productId:p.insertId,variantId:null,quantity:3}]));await deliver(b);const second=await accept(await coupon());
    const results=await Promise.allSettled([approve(first),approve(second)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await used()).toBe(1);expect(await ledger()).toHaveLength(1);
  });
  it('rolls back the margin exception together with coupon redemption if the invoice write fails',async()=>{
    const orderId=await accept(await coupon()),p=await getMarginPolicy(owner.merchantId);
    await updateMarginPolicy({merchantId:owner.merchantId,actorUserId:owner.userId,policy:{enabled:true,minPercent:35},expectedRevision:p.revision,evidence:p.evidence,reviewed:true});
    const preview=await previewCheckoutMargin({merchantId:owner.merchantId,orderId,costs});
    const proof={costs,evidence:preview.evidence,reviewedCosts:true,exception:{reason:'استثناء موثق لهذه الفاتورة بعد الخصم',reviewed:true}};
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:unknown[])=>{
      if(sql.includes('UPDATE orders SET checkout_review_required = 0'))throw Error('Injected invoice failure');return target.execute(sql,args);
    };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
    await expect(approve(orderId,proof,true)).rejects.toThrow('Injected');vi.restoreAllMocks();
    expect(await used()).toBe(0);expect(await ledger()).toEqual([]);expect((await stored(orderId)).checkout_review_required).toBe(1);
    expect(await query('SELECT id FROM checkout_margin_exceptions WHERE order_id=?',[orderId])).toEqual([]);
    await approve(orderId,proof,true);expect(await used()).toBe(1);expect(await ledger()).toHaveLength(1);
    expect(await query('SELECT id FROM checkout_margin_exceptions WHERE order_id=?',[orderId])).toHaveLength(1);
  });
  it('retains the original redemption after coupon deletion and approval replay',async()=>{
    const orderId=await accept(await coupon());await approve(orderId);const evidence=await ledger();await query('DELETE FROM discount_codes WHERE id=?',[couponId]);await approve(orderId);expect(await ledger()).toEqual(evidence);
  });
  it('does not consume again after a committed approval loses its acknowledgement',async()=>{
    const orderId=await accept(await coupon()),pool=(await getPool())!,original=pool.getConnection.bind(pool);let lost=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='commit')return async()=>{
      await target.commit();if(!lost){lost=true;throw Error('lost commit acknowledgement');}
    };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});});
    await expect(approve(orderId)).rejects.toThrow('lost commit');vi.restoreAllMocks();await approve(orderId);
    expect(await used()).toBe(1);expect(await ledger()).toHaveLength(1);expect((await stored(orderId)).checkout_review_required).toBe(0);
  });
  it('checks expiry after waiting for the coupon lock rather than using pre-wait time',async()=>{
    const orderId=await accept(await coupon()),pool=(await getPool())!,blocker=await pool.getConnection(),original=pool.getConnection.bind(pool);
    await blocker.beginTransaction();await blocker.execute('SELECT id FROM discount_codes WHERE id=? FOR UPDATE',[couponId]);
    let notify!:()=>void;const entered=new Promise<void>(resolve=>{notify=resolve;});
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,args:unknown[])=>{
      if(sql.includes('SELECT * FROM discount_codes'))notify();return target.execute(sql,args);
    };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
    try {const approval=approve(orderId).then(()=>false,()=>true);await entered;await blocker.execute('UPDATE discount_codes SET expiresAt=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[couponId]);await blocker.commit();expect(await approval).toBe(true);}
    finally {await blocker.rollback();blocker.release();vi.restoreAllMocks();}
    expect(await used()).toBe(0);expect(await ledger()).toEqual([]);
  });
});
