import { beforeEach,afterEach,afterAll,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { prepareCheckoutQuote,acceptCheckoutQuote,approveCheckoutInvoice,type CheckoutIdentity } from './checkout-agreements';
import { getMarginPolicy,updateMarginPolicy } from './checkout-margin-policy';
import { previewCheckoutMargin, getCheckoutMarginException } from './checkout-margin';
import { stageInteraction,finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';
import { issueCanonicalOrderPaymentLink } from '../payment/order-payment-link';
import type { InvoiceMarginProof } from '../../shared/checkout-margin';
import { applyDiscountCode } from '../automation/discount-system';

describe.skipIf(!process.env.DATABASE_URL)('local invoice margin authority on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,identity:CheckoutIdentity,productId:number,orderId:number,quotationId:number;
  const costs={taxMinor:0,shippingCostMinor:0,otherCostMinor:0};
  const query=async(sql:string,values:any[]=[]) => (await(await getPool())!.execute<any>(sql,values))[0];
  const policyInput=async(policy={enabled:true,minPercent:30})=>{
    const p=await getMarginPolicy(owner.merchantId);return {merchantId:owner.merchantId,actorUserId:owner.userId,policy,expectedRevision:p.revision,evidence:p.evidence,reviewed:true as const};
  };
  const preview=(extra={})=>previewCheckoutMargin({merchantId:owner.merchantId,orderId,costs,...extra});
  const approve=(margin?:InvoiceMarginProof,authorizeMarginException=false)=>approveCheckoutInvoice({merchantId:owner.merchantId,orderId,actorUserId:owner.userId,expectedAmountMinor:10000,totalIsFinal:true,margin,authorizeMarginException});
  const proof=async():Promise<InvoiceMarginProof>=>({costs,evidence:(await preview()).evidence,reviewedCosts:true});
  const stored=async()=>({order:(await query('SELECT * FROM orders WHERE id=?',[orderId]))[0],quote:(await query('SELECT * FROM sales_quotations WHERE id=?',[quotationId]))[0]});
  beforeEach(async()=>{
    owner=await createDisposableMerchant('invoice-margin');other=await createDisposableMerchant('other-margin');
    const c=await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966550987654')",[owner.merchantId]);
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد شراء سماعة واحدة')",[c.insertId]);
    identity={merchantId:owner.merchantId,conversationId:c.insertId,incomingMessageId:m.insertId,customerPhone:'966550987654'};
    const p=await query("INSERT INTO products (merchantId,name,price,price_unit,currency,cost_price,stock) VALUES (?,'سماعة',10000,'minor','SAR',6000,50)",[owner.merchantId]);productId=p.insertId;
    await makeOrder();
  });
  async function makeOrder(variantId:number|null=null){
    const quote=await prepareCheckoutQuote(identity,[{productId,variantId,quantity:1}]);if(quote.kind!=='quote')throw Error('Missing quote');quotationId=quote.quotationId;
    const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:identity.customerPhone,text:quote.text});
    await stageInteraction(reply);await finishInteractionDelivery(reply,true);
    const yes=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','نعم')",[identity.conversationId]);
    const result=await acceptCheckoutQuote({...identity,incomingMessageId:yes.insertId},quotationId);if(result.kind!=='order')throw Error('Missing order');orderId=result.orderId;
  }
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  const exception={reason:'اعتماد تكلفة اكتساب هذا العميل بعد مراجعة الربحية',reviewed:true as const};
  const belowFloor=async()=>{await updateMarginPolicy(await policyInput({enabled:true,minPercent:50}));return {...await proof(),exception};};
  const audits=()=>query('SELECT * FROM checkout_margin_exceptions WHERE merchant_id=?',[owner.merchantId]);
  it('approves one reviewed exception with its exact loss, actor and facts, without lowering the policy or changing the amount',async()=>{
    await updateMarginPolicy(await policyInput({enabled:true,minPercent:50}));await query('UPDATE products SET cost_price=12000,updatedAt=updatedAt WHERE id=?',[productId]);
    await approve({...await proof(),exception},true);
    const audit=await getCheckoutMarginException(owner.merchantId,orderId),state=await stored();
    expect(audit).toMatchObject({actorUserId:owner.userId,reason:exception.reason,policyRevision:1,policy:{minPercent:50},totalMinor:10000,
      calculation:{profitMinor:-2000,marginBps:-2000}});
    expect(new Date(audit!.createdAt).getTime()).toBeGreaterThan(Date.now()-60000);
    expect(state.quote.checkout_snapshot.billingApproval.margin).toMatchObject({status:'below_floor',calculation:{passes:false},exception:{id:audit!.id,actorUserId:owner.userId,scope:'this_invoice_only'}});
    expect(state.order).toMatchObject({totalAmount:10000,checkout_review_required:0,payment_status:'unpaid',discountCode:null});
    expect((await getMarginPolicy(owner.merchantId)).policy).toEqual({enabled:true,minPercent:50});
    expect(await query('SELECT id FROM payment_links WHERE order_id=?',[orderId])).toEqual([]);
  });
  it('does not treat a client exception as authority without the server grant',async()=>{
    await expect(approve(await belowFloor())).rejects.toThrow('not authorized');expect(await audits()).toEqual([]);
    expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it.each(['missing','unverified','invalid totals','passing','disabled'])('does not override %s with an exception',async mode=>{
    const p=await belowFloor();
    if(mode==='missing')await query('UPDATE products SET cost_price=NULL,updatedAt=updatedAt WHERE id=?',[productId]);
    if(mode==='unverified')await query("UPDATE products SET price_unit='unverified',updatedAt=updatedAt WHERE id=?",[productId]);
    if(mode==='passing')await updateMarginPolicy(await policyInput({enabled:true,minPercent:30}));
    if(mode==='disabled')await updateMarginPolicy(await policyInput({enabled:false,minPercent:50}));
    const inputCosts=mode==='invalid totals'?{...costs,taxMinor:10000}:costs;
    if(mode!=='unverified')p.evidence=(await preview({costs:inputCosts})).evidence;
    await expect(approve({...p,costs:inputCosts},true)).rejects.toThrow();expect(await audits()).toEqual([]);
    expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it.each(['cost','policy','declared costs','catalogue'])('rejects an exception after changed %s',async mode=>{
    const p=await belowFloor();
    if(mode==='cost')await query('UPDATE products SET cost_price=6001,updatedAt=updatedAt WHERE id=?',[productId]);
    if(mode==='policy')await updateMarginPolicy(await policyInput({enabled:true,minPercent:51}));
    if(mode==='declared costs')p.costs={...costs,shippingCostMinor:1};
    if(mode==='catalogue')await query('UPDATE products SET price=10001 WHERE id=?',[productId]);
    await expect(approve(p,true)).rejects.toThrow();expect(await audits()).toEqual([]);expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it('rejects a copied exception proof on another invoice or merchant',async()=>{
    const p=await belowFloor();
    await expect(approveCheckoutInvoice({merchantId:other.merchantId,orderId,actorUserId:other.userId,expectedAmountMinor:10000,totalIsFinal:true,margin:p,authorizeMarginException:true})).rejects.toThrow();
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد شراء سماعة واحدة')",[identity.conversationId]);identity={...identity,incomingMessageId:m.insertId};await makeOrder();
    await expect(approve(p,true)).rejects.toThrow('Margin proof changed');expect(await audits()).toEqual([]);
  });
  it('keeps a single original audit across concurrent approval and replay',async()=>{
    const p=await belowFloor();await Promise.all([approve(p,true),approve({...p,exception:{...exception,reason:'سبب بديل من مراجع متزامن لا يستبدل الأصل'}},true)]);
    const original=await getCheckoutMarginException(owner.merchantId,orderId);expect(await audits()).toHaveLength(1);
    await approve({...p,exception:{...exception,reason:'محاولة استبدال سبب سابق بعد اعتماد الفاتورة'}},true);
    expect(await getCheckoutMarginException(owner.merchantId,orderId)).toEqual(original);expect(await audits()).toHaveLength(1);
  });
  it.each(['audit','invoice'])('rolls back exception and invoice when %s persistence fails',async failure=>{
    const p=await belowFloor(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const connection=await original();return new Proxy(connection,{get(target,key){if(key==='execute')return async(sql:string,args:unknown[])=>{
        if(sql.includes(failure==='audit'?'INSERT INTO checkout_margin_exceptions':'UPDATE orders SET checkout_review_required = 0'))throw Error('Injected exception persistence failure');
        return target.execute(sql,args);};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
    });
    await expect(approve(p,true)).rejects.toThrow('Injected');vi.restoreAllMocks();
    expect(await audits()).toEqual([]);const state=await stored();expect(state.order.checkout_review_required).toBe(1);expect(state.quote.checkout_snapshot.billingApproval).toBeUndefined();
    await approve(p,true);expect(await audits()).toHaveLength(1);
  });
  it('does not reuse a conflicting audit record to approve a still blocked invoice',async()=>{
    const p=await belowFloor();await query('INSERT INTO checkout_margin_exceptions (merchant_id,order_id,actor_user_id,reason,evidence_hash,assessment) VALUES (?,?,?,?,?,?)',
      [owner.merchantId,orderId,owner.userId,'conflicting imported record','0'.repeat(64),'{}']);
    await expect(approve(p,true)).rejects.toThrow();expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it('scopes audit reads and preserves approved values after payment and policy changes',async()=>{
    expect(await getCheckoutMarginException(owner.merchantId,orderId)).toBeNull();
    await approve(await belowFloor(),true);const audit=await getCheckoutMarginException(owner.merchantId,orderId);
    await expect(getCheckoutMarginException(other.merchantId,orderId)).rejects.toThrow();
    await query("UPDATE orders SET payment_status='paid' WHERE id=?",[orderId]);await updateMarginPolicy(await policyInput({enabled:true,minPercent:70}));
    expect(await getCheckoutMarginException(owner.merchantId,orderId)).toEqual(audit);
  });
  it('is disabled by default without fabricating policy history or blocking prior contracts',async()=>{
    expect(await getMarginPolicy(owner.merchantId)).toMatchObject({policy:{enabled:false,minPercent:0},revision:0,history:[]});
    await approve();expect((await stored()).order.checkout_review_required).toBe(0);
    expect((await stored()).quote.checkout_snapshot.billingApproval.margin).toMatchObject({enforced:false,policyRevision:0});
  });
  it('never consumes a coupon or reports a changed price through the legacy unreviewed helper',async()=>{
    const coupon=await query("INSERT INTO discount_codes (merchantId,code,type,value,maxUses) VALUES (?,'LEGACY10','percentage',10,2)",[owner.merchantId]);
    for(const merchantId of [owner.merchantId,other.merchantId])expect((await applyDiscountCode(merchantId,'LEGACY10',orderId)).success).toBe(false);
    expect((await query('SELECT usedCount FROM discount_codes WHERE id=?',[coupon.insertId]))[0].usedCount).toBe(0);
    expect((await stored()).order).toMatchObject({totalAmount:10000,discountCode:null,checkout_review_required:1});
  });
  it('previews without approving or issuing payment, then stores exact reviewed facts atomically',async()=>{
    await updateMarginPolicy(await policyInput());const assessment=await preview();expect(assessment).toMatchObject({status:'pass',productCostMinor:6000,calculation:{profitMinor:4000},policyRevision:1});
    expect((await stored()).order.checkout_review_required).toBe(1);
    expect(await issueCanonicalOrderPaymentLink({merchantId:owner.merchantId,orderId})).toEqual({issued:false,reason:'order_not_payable'});
    await approve({costs,evidence:assessment.evidence,reviewedCosts:true});const state=await stored();
    expect(state.order).toMatchObject({checkout_review_required:0,totalAmount:10000,payment_status:'unpaid',discountCode:null});
    expect(state.quote.checkout_snapshot.billingApproval).toMatchObject({actorUserId:owner.userId,margin:{enforced:true,evidence:assessment.evidence,policyRevision:1,costs,productCostMinor:6000}});
    expect(await query('SELECT id FROM payment_links WHERE order_id=?',[orderId])).toEqual([]);
  });
  it('rejects approval without cost attestation once the policy is enabled',async()=>{
    await updateMarginPolicy(await policyInput());await expect(approve()).rejects.toThrow();expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it('requires the exact unrounded floor including tax and additional costs',async()=>{
    await updateMarginPolicy(await policyInput());const inputCosts={taxMinor:1000,shippingCostMinor:500,otherCostMinor:0};
    const p=await preview({costs:inputCosts});expect(p.status).toBe('below_floor');
    await expect(approve({costs:inputCosts,evidence:p.evidence,reviewedCosts:true})).rejects.toThrow('Margin');expect((await stored()).order.checkout_review_required).toBe(1);
  });
  it.each([null,-1])('does not infer a valid cost from %s',async cost=>{
    await updateMarginPolicy(await policyInput());await query('UPDATE products SET cost_price=?,updatedAt=updatedAt WHERE id=?',[cost,productId]);
    const p=await preview();expect(p.status).toBe('missing_cost');await expect(approve({costs,evidence:p.evidence,reviewedCosts:true})).rejects.toThrow();
  });
  it('allows explicitly stored zero cost without confusing it with missing',async()=>{
    await updateMarginPolicy(await policyInput({enabled:true,minPercent:100}));await query('UPDATE products SET cost_price=0,updatedAt=updatedAt WHERE id=?',[productId]);
    expect((await preview()).status).toBe('pass');await approve(await proof());
  });
  it.each(['missing','unverified','different'])('uses exact variant costs without inheriting parent cost: %s',async mode=>{
    await query('UPDATE products SET has_variants=1 WHERE id=?',[productId]);
    const v=await query('INSERT INTO product_variants (product_id,merchant_id,name,price,price_unit,cost_price,stock) VALUES (?,?,?,NULL,?,?,20)',
      [productId,owner.merchantId,'خيار',mode==='unverified'?'unverified':'minor',mode==='missing'?null:9000]);
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد خيار السماعة واحد')",[identity.conversationId]);identity={...identity,incomingMessageId:m.insertId};
    await makeOrder(v.insertId);await updateMarginPolicy(await policyInput());
    const p=await preview();expect(p.status).toBe(mode==='different'?'below_floor':'missing_cost');await expect(approve({costs,evidence:p.evidence,reviewedCosts:true})).rejects.toThrow();
  });
  it('rejects old preview when cost changes without changing catalogue timestamp',async()=>{
    await updateMarginPolicy(await policyInput());const old=await proof();
    await query('UPDATE products SET cost_price=6001,updatedAt=updatedAt WHERE id=?',[productId]);
    await expect(approve(old)).rejects.toThrow('Margin');expect((await stored()).order.checkout_review_required).toBe(1);await approve(await proof());
  });
  it('rejects changed declared costs, policy, and copied evidence from another invoice',async()=>{
    await updateMarginPolicy(await policyInput());const old=await proof();
    await expect(approve({...old,costs:{...costs,otherCostMinor:1}})).rejects.toThrow('Margin');
    await updateMarginPolicy(await policyInput({enabled:true,minPercent:31}));await expect(approve(old)).rejects.toThrow('Margin');
    const next=await proof();
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد شراء سماعة واحدة')",[identity.conversationId]);identity={...identity,incomingMessageId:m.insertId};await makeOrder();
    await expect(approve(next)).rejects.toThrow('Margin');
  });
  it('detects an out-of-band policy edit without a revision change',async()=>{
    await updateMarginPolicy(await policyInput());const old=await proof();await query('UPDATE sales_margin_policies SET min_percent=31 WHERE merchant_id=?',[owner.merchantId]);
    await expect(approve(old)).rejects.toThrow('Margin');
  });
  it.each([{taxMinor:10000,shippingCostMinor:0,otherCostMinor:0},{taxMinor:0,shippingCostMinor:2147483647,otherCostMinor:1}])('blocks invalid total calculation %j',async inputCosts=>{
    await updateMarginPolicy(await policyInput());const p=await preview({costs:inputCosts});expect(p.status).toBe('invalid_totals');await expect(approve({costs:inputCosts,evidence:p.evidence,reviewedCosts:true})).rejects.toThrow();
  });
  it.each(['paid','foreign','external','changed amount','changed items','changed catalog'])('rejects an unavailable invoice %s',async mode=>{
    await updateMarginPolicy(await policyInput());
    if(mode==='paid')await query("UPDATE orders SET payment_status='paid' WHERE id=?",[orderId]);
    if(mode==='external')await query("UPDATE orders SET sallaOrderId='outside' WHERE id=?",[orderId]);
    if(mode==='changed amount')await query('UPDATE orders SET totalAmount=9000 WHERE id=?',[orderId]);
    if(mode==='changed items')await query("UPDATE orders SET items='[]' WHERE id=?",[orderId]);
    if(mode==='changed catalog')await query('UPDATE products SET price=10001 WHERE id=?',[productId]);
    await expect(preview(mode==='foreign'?{merchantId:other.merchantId}:{})).rejects.toThrow();
  });
  it('records one approval under concurrent calls and preserves its facts on replay',async()=>{
    await updateMarginPolicy(await policyInput());const p=await proof();const approvals=await Promise.all([approve(p),approve(p)]);expect(approvals).toHaveLength(2);
    const original=(await stored()).quote.checkout_snapshot.billingApproval;
    await updateMarginPolicy(await policyInput({enabled:true,minPercent:90}));await approve();
    expect((await stored()).quote.checkout_snapshot.billingApproval).toEqual(original);
  });
  it('rolls back saved approval evidence when releasing the invoice gate fails',async()=>{
    await updateMarginPolicy(await policyInput());const p=await proof(),pool=(await getPool())!,connection=await pool.getConnection();
    const proxy=new Proxy(connection,{get(target,key){if(key==='execute')return async(sql:string,values:any[])=>{if(sql.includes('SET checkout_review_required = 0'))throw Error('fixture failure');return target.execute(sql,values);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
    vi.spyOn(pool,'getConnection').mockResolvedValueOnce(proxy);
    await expect(approve(p)).rejects.toThrow('fixture failure');const state=await stored();
    expect(state.order.checkout_review_required).toBe(1);expect(state.quote.checkout_snapshot.billingApproval).toBeUndefined();await approve(p);
  });
  it('audits policy edits, isolates merchants, and rejects stale concurrent grants',async()=>{
    const change=await policyInput();const results=await Promise.allSettled([updateMarginPolicy(change),updateMarginPolicy({...change,policy:{enabled:true,minPercent:50}})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    const current=await getMarginPolicy(owner.merchantId);expect(current.revision).toBe(1);expect(current.history).toHaveLength(1);
    expect(current.history[0]).toMatchObject({actorUserId:owner.userId,beforePolicy:{enabled:false,minPercent:0}});
    expect((await getMarginPolicy(other.merchantId)).history).toEqual([]);await expect(updateMarginPolicy({...change,merchantId:other.merchantId})).rejects.toThrow('changed');
  });
  it('rolls back a policy change when its audit insert fails',async()=>{
    const change=await policyInput();await query('INSERT INTO sales_margin_policy_changes (merchant_id,actor_user_id,revision,evidence_hash,before_policy,after_policy) VALUES (?,?,1,?,?,?)',
      [owner.merchantId,owner.userId,'a'.repeat(64),JSON.stringify({enabled:false,minPercent:0}),JSON.stringify({enabled:false,minPercent:0})]);
    await expect(updateMarginPolicy(change)).rejects.toThrow();expect((await getMarginPolicy(owner.merchantId)).policy.enabled).toBe(false);
  });
});
