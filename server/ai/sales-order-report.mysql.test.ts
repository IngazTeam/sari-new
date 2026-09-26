import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { prepareCheckoutQuote,acceptCheckoutQuote,type CheckoutIdentity } from './checkout-agreements';
import { stageInteraction,finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';
import { applyTapOrderPaymentState } from '../payment/order-payment-state';
import { inspectSalesOrderReport,SalesOrderReportAccessDenied,SalesOrderReportNotReady } from './sales-order-report';
import { SALES_ORDER_REPORT_LIMIT,SalesOrderReportLimitExceeded } from './sales-order-report-contract';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesOrderFact,salesOrderIdentity } from './sales-order-fact-contract';
describe.skipIf(!process.env.DATABASE_URL)('consistent aggregate sales report on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,users:number[],identity:CheckoutIdentity,productId:number;
  const phone='966500000069',query=async(sql:string,args:any[]=[])=>(await (await getPool())!.execute<any>(sql,args))[0];
  const facts=()=>query('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const report=(range:any={})=>inspectSalesOrderReport(owner.userId,{merchantId:owner.merchantId,...range});
  beforeEach(async()=>{
    owner=await createDisposableMerchant('order-report');users=[owner.userId];await query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[owner.merchantId,phone]);
    identity={merchantId:owner.merchantId,conversationId:c.insertId,customerPhone:phone,incomingMessageId:1};
    productId=(await query("INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?,'Synthetic',1000,'minor','SAR',100)",[owner.merchantId])).insertId;
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No external traffic');}));
  });
  afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  async function incoming(content:string){const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)",[identity.conversationId,content]);identity={...identity,incomingMessageId:m.insertId};}
  async function create(){
    await incoming('أريد شراء واحدة');const q=await prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:1}]);if(q.kind!=='quote')throw Error('Quote missing');
    const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:phone,text:q.text});
    await stageInteraction(reply);await finishInteractionDelivery(reply,true);await incoming('نعم');
    const o=await acceptCheckoutQuote(identity,q.quotationId);if(o.kind!=='order')throw Error('Order missing');return {orderId:o.orderId,quotationId:q.quotationId};
  }
  async function pay(orderId:number){
    const charge='chg_report_'+randomUUID().replaceAll('-',''),p=await query("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,status,tap_charge_id) VALUES (?,?,?,1200,'SAR','pending',?)",[owner.merchantId,orderId,phone,charge]);
    const input={paymentId:Number(p.insertId),tapChargeId:charge,expectedMerchantId:owner.merchantId,expectedAmount:1200,expectedCurrency:'SAR',providerStatus:'CAPTURED'};
    await applyTapOrderPaymentState(input);return input;
  }
  // Pause only the report connection after its order read, leaving independent writers free.
  function pauseRead(){
    const poolPromise=getPool();let resume!:()=>void,entered!:()=>void;const wait=new Promise<void>(r=>{resume=r;}),atRead=new Promise<void>(r=>{entered=r;});
    return {atRead,resume:()=>resume(),install:async()=>{const pool=(await poolPromise)!,get=pool.getConnection.bind(pool);let once=true;
      vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;
        return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:any,args:any)=>{const result=await target.execute(sql,args);
          if(String(sql).includes('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? AND id>=')){entered();await wait;}return result;};
          const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});}};
  }
  it('returns an explicitly empty recorded population with unknown financial totals',async()=>{expect(await report()).toMatchObject({scope:{throughFactId:0,completeWithinIdRange:true},counts:{recordedOrders:0},amounts:{observedNetMinor:null}});});
  it('aggregates real agreements, two captures, one refund and one unmeasured order from the same customer',async()=>{
    const a=await create(),b=await create();await create();const p=await pay(a.orderId);await pay(b.orderId);await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});
    const r=await report();expect(r.counts).toMatchObject({recordedOrders:3,captureObserved:2,fullRefundObserved:1,paymentNotMeasured:1});
    expect(r.amounts).toEqual({currency:'SAR',quotedAmountMinor:3000,observedCapturedMinor:2400,observedRefundedMinor:1200,observedNetMinor:1200,invoiceDifferenceMinor:400});
    expect(JSON.stringify(r)).not.toContain(phone);expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds the complete report by inclusive immutable fact IDs without treating the range as a date or cohort',async()=>{
    for(let i=0;i<3;i++)await create();const rows=await facts(),r=await report({fromFactId:rows[1].id,throughFactId:rows[1].id});
    expect(r.orders.map(o=>o.orderFactId)).toEqual([rows[1].id]);expect(r.scope.population).toBe('recorded_sales_order_facts');expect(r.attribution).toBe('not_evaluated');
  });
  it('isolates merchants even when the requested ID range belongs to another merchant',async()=>{
    await create();const other=await createDisposableMerchant('report-other');users.push(other.userId);const rows=await facts();
    expect((await inspectSalesOrderReport(owner.userId,{merchantId:other.merchantId,fromFactId:rows[0].id,throughFactId:rows[0].id})).orders).toEqual([]);
  });
  it.each(['user','manager','inactive','missing-actor','missing-merchant'])('rechecks %s against current SQL authority',async mode=>{
    await create();if(mode==='user'||mode==='manager')await query("UPDATE users SET role='user' WHERE id=?",[owner.userId]);
    if(mode==='manager')await query("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[owner.merchantId,owner.userId]);
    if(mode==='inactive')await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
    await expect(inspectSalesOrderReport(mode==='missing-actor'?2147483647:owner.userId,{merchantId:mode==='missing-merchant'?2147483647:owner.merchantId}))
      .rejects.toBeInstanceOf(mode==='missing-merchant'?SalesOrderReportNotReady:SalesOrderReportAccessDenied);
  });
  it.each(['order','payment','orphan-refund'])('rejects %s corruption without a partial aggregate',async mode=>{
    const a=await create(),p=await pay(a.orderId);await create();
    if(mode==='orphan-refund'){await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await query("DELETE FROM ai_sales_payment_facts WHERE merchant_id=? AND event_type='captured'",[owner.merchantId]);}
    else await query(`UPDATE ${mode==='order'?'ai_sales_order_facts':'ai_sales_payment_facts'} SET fact_digest=REPEAT('b',64) WHERE merchant_id=?`,[owner.merchantId]);
    await expect(report()).rejects.toThrow();
  });
  it('refuses more than the bounded population and allows an explicitly narrowed evidence range',async()=>{
    await create();const base=readSalesOrderFact((await facts())[0]).snapshot;
    for(let i=1;i<=SALES_ORDER_REPORT_LIMIT;i++){
      const localId=1000000+i,s={...base,quotationId:1000000+i,...salesOrderIdentity(owner.merchantId,'local',String(owner.merchantId),String(localId)),localOrderId:localId};
      await query('INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,local_order_id,order_key,customer_key,fact_digest,snapshot) VALUES (?,?,?,?,?,?,?,?)',
        [owner.merchantId,s.quotationId,s.provider,s.localOrderId,s.orderKey,s.customerKey,hash(s),JSON.stringify(s)]);
    }
    await expect(report()).rejects.toBeInstanceOf(SalesOrderReportLimitExceeded);const rows=await facts();expect((await report({fromFactId:rows.at(-1).id})).counts.recordedOrders).toBe(1);
  });
  it('preserves immutable report evidence after source deletion and does not write on repeated reads',async()=>{
    const a=await create(),p=await pay(a.orderId),before=await report(),oldFacts=await facts();
    await query('DELETE FROM order_payments WHERE id=?',[p.paymentId]);await query('DELETE FROM sales_quotations WHERE id=?',[a.quotationId]);await query('DELETE FROM orders WHERE id=?',[a.orderId]);
    expect((await report()).evidenceSetDigest).toBe(before.evidenceSetDigest);expect(await facts()).toEqual(oldFacts);expect(fetch).not.toHaveBeenCalled();
    await closeDb();expect((await report()).evidenceSetDigest).toBe(before.evidenceSetDigest);
  });
  it('rejects a conflicting external alias outside a narrowed local fact range',async()=>{
    const a=await create(),f=(await facts())[0];
    await query("INSERT INTO ai_sales_order_links (merchant_id,order_fact_id,order_fact_digest,order_key,source_row_id,local_order_id,link_digest,snapshot) VALUES (?,999999,REPEAT('b',64),REPEAT('b',64),1,?,REPEAT('b',64),'{}')",[owner.merchantId,a.orderId]);
    await expect(report({fromFactId:f.id,throughFactId:f.id})).rejects.toThrow();
  });
  it('keeps one snapshot when an actual refund commits between order and payment reads',async()=>{
    const a=await create(),p=await pay(a.orderId),pause=pauseRead();await pause.install();const reading=report();
    try{await pause.atRead;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});}finally{pause.resume();}
    const before=await reading;vi.restoreAllMocks();const after=await report();expect(before.amounts.observedNetMinor).toBe(1200);expect(before.amounts.observedRefundedMinor).toBeNull();
    expect(after.amounts.observedNetMinor).toBe(0);expect(after.evidenceSetDigest).not.toBe(before.evidenceSetDigest);
  });
  it.each(['insert','delete'])('keeps the recorded population stable during a concurrent %s',async mode=>{
    await create();const pause=pauseRead();await pause.install();const reading=report();
    try{await pause.atRead;if(mode==='insert')await create();else await query('DELETE FROM ai_sales_order_facts WHERE merchant_id=?',[owner.merchantId]);}finally{pause.resume();}
    expect((await reading).counts.recordedOrders).toBe(1);vi.restoreAllMocks();expect((await report()).counts.recordedOrders).toBe(mode==='insert'?2:0);
  });
  it('holds current administrator authority until the read finishes',async()=>{
    await create();const pause=pauseRead();await pause.install();const reading=report();await pause.atRead;const c=await (await getPool())!.getConnection();
    try{await c.query('SET SESSION innodb_lock_wait_timeout=1');await expect(c.execute("UPDATE users SET role='user' WHERE id=?",[owner.userId])).rejects.toMatchObject({code:'ER_LOCK_WAIT_TIMEOUT'});}
    finally{await c.query('SET SESSION innodb_lock_wait_timeout=50');c.release();pause.resume();}
    await reading;vi.restoreAllMocks();await query("UPDATE users SET role='user' WHERE id=?",[owner.userId]);await expect(report()).rejects.toBeInstanceOf(SalesOrderReportAccessDenied);
  });
  it('destroys a connection with uncertain rollback and leaves evidence unchanged',async()=>{
    await create();const before=await facts(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true,destroyed=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;return new Proxy(c,{get(target,key){
      if(key==='rollback')return async()=>{throw Error('Synthetic lost read connection');};if(key==='destroy')return()=>{destroyed=true;target.destroy();};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await expect(report()).rejects.toThrow('Synthetic lost read connection');vi.restoreAllMocks();expect(destroyed).toBe(true);expect(await facts()).toEqual(before);expect((await report()).counts.recordedOrders).toBe(1);
  });
});
