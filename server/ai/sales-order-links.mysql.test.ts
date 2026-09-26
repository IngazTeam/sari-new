import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertOrderFromZid,getZidOrderByZidId } from '../db';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { salesOrderIdentity,readSalesOrderFact } from './sales-order-fact-contract';
import { linkZidOrderProjection } from './sales-order-links';
import { readSalesOrderLink } from './sales-order-link-contract';
import { inspectSalesOrderSettlement } from './sales-order-settlement';
import { applyTapOrderPaymentState } from '../payment/order-payment-state';
import { prepareZidCheckout,acceptZidCheckout } from './zid-checkout-agreements';
import { reconcileZidCheckout } from './zid-checkout-reconciliation';
import { buildReplyPlan } from '../messaging/reply-plan';
import { stageInteraction,finishInteractionDelivery } from './interaction-jobs';
const provider=vi.hoisted(()=>({settings:vi.fn(),create:vi.fn(),view:vi.fn()}));
vi.mock('../db_zid',()=>({default:{getZidSettings:provider.settings}}));
vi.mock('../integrations/zid/zidClient',()=>({ZidClient:class {
  getPaymentMethods=async()=>({payment_methods:[{id:1,name:'رابط دفع',fees:0,enabled:true,code:'payment_link.zidpay'}]});
  getShippingMethods=async()=>({shipping_methods:[{id:2,name:'توصيل',fees:10,enabled:true}]});
  createOrderFromWhatsApp=provider.create;
  getOrderForReconciliation=provider.view;
}}));
describe.skipIf(!process.env.DATABASE_URL)('durable Zid order links and Tap evidence SQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,users:number[],sequence:number;
  const phone='966500000074';
  const query=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const sources=async()=>query('SELECT * FROM zid_orders WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const links=async()=>query('SELECT * FROM ai_sales_order_links WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const facts=async()=>query('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const view=async(factId:number)=>(await inspectSalesOrderSettlement(owner.userId,{merchantId:owner.merchantId,factId}));
  const sourceOrder=(store='11',id='991')=>({id,store_id:store,order_total:230,currency_code:'SAR',status:'new',customer:{name:'Synthetic',mobile:phone},products:[]});
  beforeEach(async()=>{owner=await createDisposableMerchant('zid-link');users=[owner.userId];sequence=100;
    await query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);provider.settings.mockReset();provider.create.mockReset();
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No provider traffic');}));});
  afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  async function seed(store='11',reference='991',project=true){
    const quotationId=++sequence,identity=salesOrderIdentity(owner.merchantId,'zid',store,reference);
    const snapshot={version:'sales-order-fact.v1',merchantId:owner.merchantId,quotationId,conversationId:1,sourceMessageId:2,consentMessageId:3,
      customerKey:hash({version:'sales-experiment-customer.v1',merchantId:owner.merchantId,phone}),...identity,localOrderId:null,agreementDigest:'a'.repeat(64),
      quotedAmountMinor:23000,currency:'SAR',amountBasis:'zid_reported_invoice',observedAt:'2026-09-25T10:00:00.000Z',
      timeBasis:'local_verified_creation',stage:'order_created',paymentEvidence:'not_measured',origin:'zid_create_response'};
    const insert=await query(`INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,order_key,customer_key,fact_digest,snapshot)
      VALUES (?,?,'zid',?,?,?,?)`,[owner.merchantId,quotationId,identity.orderKey,snapshot.customerKey,hash(snapshot),JSON.stringify(snapshot)]);
    if(project)await upsertOrderFromZid(owner.merchantId,sourceOrder(store,reference));
    return {quotationId,factId:Number(insert.insertId),store,reference,
      link:()=>linkZidOrderProjection(owner.merchantId,quotationId,store,reference)};
  }
  async function pay(orderId:number){
    const charge='chg_zid_link_'+randomUUID().replaceAll('-','');
    const insert=await query("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,status,tap_charge_id) VALUES (?,?,?,23000,'SAR','pending',?)",[owner.merchantId,orderId,phone,charge]);
    const input={paymentId:Number(insert.insertId),tapChargeId:charge,expectedMerchantId:owner.merchantId,expectedAmount:23000,expectedCurrency:'SAR',providerStatus:'CAPTURED'};
    await applyTapOrderPaymentState(input);return input;
  }
  it.each(['create','reconciliation'])('binds actual agreed Zid %s, projection and later Tap capture without rewriting the creation fact',async mode=>{
    const settings=await query("INSERT INTO zid_settings (merchant_id,store_id,access_token,manager_token,is_active) VALUES (?,'11','fixture','fixture',1)",[owner.merchantId]);
    provider.settings.mockResolvedValue({id:settings.insertId,merchantId:owner.merchantId,isActive:1,storeId:'11',accessToken:'fixture',managerToken:'fixture'});
    provider.create.mockResolvedValue({order:{...sourceOrder(),id:991,code:'SYNTHETIC',order_url:'https://fixture.zid.store/pay/991'}});
    await query("INSERT INTO zid_products (merchant_id,zid_product_id,zid_sku,name_ar,price,quantity) VALUES (?,'Z1','SKU1','سماعة',100,10)",[owner.merchantId]);
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[owner.merchantId,phone]);
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد شراء سماعة')",[c.insertId]);
    const identity={merchantId:owner.merchantId,customerPhone:phone,conversationId:c.insertId,incomingMessageId:m.insertId};
    const text=await prepareZidCheckout(identity,{products:[{name:'سماعة',quantity:2,sku:'SKU1',zidProductId:'Z1'}],customerName:'Synthetic',address:{line1:'Synthetic Street',city:'Riyadh',countryCode:'SA'}});
    const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(m.insertId),to:phone,text});
    await stageInteraction(reply);await finishInteractionDelivery(reply,true);
    const consent=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','نعم')",[c.insertId]);
    const [quote]=await query('SELECT id FROM sales_quotations WHERE merchant_id=?',[owner.merchantId]);
    if(mode==='reconciliation')provider.create.mockRejectedValueOnce(Error('Synthetic unknown POST'));
    await acceptZidCheckout({...identity,incomingMessageId:consent.insertId},quote.id);
    if(mode==='reconciliation'){
      const [q]=await query('SELECT execution_attempt_id FROM sales_quotations WHERE id=?',[quote.id]);
      provider.view.mockResolvedValue({order:{...sourceOrder(),id:991,code:'SYNTHETIC',order_url:'https://fixture.zid.store/pay/991',
        products:[{id:'Z1',sku:'SKU1',quantity:2,price:100}],histories:[{comment:`SARY-CHECKOUT:${q.execution_attempt_id}`} ]}});
      expect((await reconcileZidCheckout({merchantId:owner.merchantId,actorUserId:owner.userId,quotationId:quote.id,orderId:991,reviewed:true})).projectionPending).toBe(false);
    }
    expect(await links()).toHaveLength(1);const [fact]=await facts();expect(readSalesOrderFact(fact).snapshot.localOrderId).toBeNull();
    expect((await query('SELECT projection_pending FROM sales_quotations WHERE id=?',[quote.id]))[0].projection_pending).toBe(0);
    expect(await view(fact.id)).toMatchObject({identityBasis:'verified_zid_store_projection',financialState:'payment_not_measured'});
    const payment=await pay((await sources())[0].sari_order_id);expect(await view(fact.id)).toMatchObject({financialState:'capture_observed',capturedMinor:23000});
    await applyTapOrderPaymentState({...payment,providerStatus:'REFUNDED'});expect(await view(fact.id)).toMatchObject({financialState:'full_refund_observed',observedNetMinor:0});
    expect((await facts())[0].fact_digest).toBe(fact.fact_digest);expect(provider.create).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
  });
  it('does not count Zid reported paid as verified Tap money',async()=>{
    const f=await seed();await upsertOrderFromZid(owner.merchantId,{...sourceOrder(),payment_status:'paid'});await f.link();
    expect(await view(f.factId)).toMatchObject({financialState:'payment_not_measured',capturedMinor:null,observedNetMinor:null});
  });
  it('isolates equal order numbers and the same customer across two stores',async()=>{
    const a=await seed(),b=await seed('22');await a.link();await b.link();const rows=await sources();await pay(rows[1].sari_order_id);
    expect(await view(a.factId)).toMatchObject({capturedMinor:null});expect(await view(b.factId)).toMatchObject({capturedMinor:23000});
    expect((await links())[0].local_order_id).not.toBe((await links())[1].local_order_id);
  });
  it('never links by phone or amount when the requested store differs',async()=>{
    const f=await seed();await expect(linkZidOrderProjection(owner.merchantId,f.quotationId,'22','991')).rejects.toThrow();expect(await links()).toHaveLength(0);
  });
  it('serializes four link attempts into one immutable identity',async()=>{
    const f=await seed();const r=await Promise.all(Array.from({length:4},()=>f.link()));expect(new Set(r.map(x=>x.kind==='linked'?x.linkId:0)).size).toBe(1);expect(await links()).toHaveLength(1);
  });
  it.each(['source-missing','local-missing','pointer','foreign-pointer','alias','source-phone','local-phone','source-currency','local-currency','source-amount','local-amount','legacy','local-fact','fact-digest'])('rejects %s without recording a financial identity',async attack=>{
    const f=await seed(),[s]=await sources();
    if(attack==='source-missing')await query('DELETE FROM zid_orders WHERE id=?',[s.id]);
    if(attack==='local-missing')await query('DELETE FROM orders WHERE id=?',[s.sari_order_id]);
    if(attack==='pointer'){await upsertOrderFromZid(owner.merchantId,sourceOrder('22'));const b=await getZidOrderByZidId(owner.merchantId,'991','22');await query('UPDATE zid_orders SET sari_order_id=? WHERE id=?',[b!.sariOrderId,s.id]);}
    if(attack==='foreign-pointer'){const other=await createDisposableMerchant('link-other-source');users.push(other.userId);await upsertOrderFromZid(other.merchantId,sourceOrder());
      const b=await getZidOrderByZidId(other.merchantId,'991','11');await query('UPDATE zid_orders SET sari_order_id=? WHERE id=?',[b!.sariOrderId,s.id]);}
    if(attack==='alias')await query("UPDATE orders SET sallaOrderId='zid:991' WHERE id=?",[s.sari_order_id]);
    if(attack==='source-phone')await query("UPDATE zid_orders SET customer_phone='966500009999' WHERE id=?",[s.id]);
    if(attack==='local-phone')await query("UPDATE orders SET customerPhone='966500009999' WHERE id=?",[s.sari_order_id]);
    if(attack==='source-currency')await query("UPDATE zid_orders SET currency='USD' WHERE id=?",[s.id]);
    if(attack==='local-currency')await query("UPDATE orders SET currency='USD' WHERE id=?",[s.sari_order_id]);
    if(attack==='source-amount')await query('UPDATE zid_orders SET total_amount=1 WHERE id=?',[s.id]);
    if(attack==='local-amount')await query('UPDATE orders SET totalAmount=1 WHERE id=?',[s.sari_order_id]);
    if(attack==='legacy')await query("INSERT INTO zid_orders (merchant_id,zid_order_id,total_amount,items) VALUES (?,'991',230,'[]')",[owner.merchantId]);
    if(attack==='local-fact')await query("INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,local_order_id,order_key,fact_digest,snapshot) VALUES (?,999,'local',?,REPEAT('b',64),REPEAT('b',64),'{}')",[owner.merchantId,s.sari_order_id]);
    if(attack==='fact-digest')await query("UPDATE ai_sales_order_facts SET fact_digest=REPEAT('b',64) WHERE id=?",[f.factId]);
    await expect(f.link()).rejects.toThrow();expect(await links()).toHaveLength(0);expect(await query('SELECT id FROM ai_sales_payment_facts WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
  });
  it.each(['digest','fact-index','local-index','store','clock','extra'])('rejects %s corruption in a stored link on replay and inspection',async attack=>{
    const f=await seed();await f.link();const [row]=await links();
    if(attack==='digest')await query("UPDATE ai_sales_order_links SET link_digest=REPEAT('b',64) WHERE id=?",[row.id]);
    else if(attack==='fact-index')await query('UPDATE ai_sales_order_links SET order_fact_digest=REPEAT(\'b\',64) WHERE id=?',[row.id]);
    else if(attack==='local-index')await query('UPDATE ai_sales_order_links SET local_order_id=local_order_id+1 WHERE id=?',[row.id]);
    else {const s=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot;
      if(attack==='store')s.storeId='22';if(attack==='clock')s.linkedAt='2000-01-01T00:00:00.000Z';if(attack==='extra')s.revenueMinor=23000;
      await query('UPDATE ai_sales_order_links SET snapshot=?,link_digest=? WHERE id=?',[JSON.stringify(s),hash(s),row.id]);}
    await expect(f.link()).rejects.toThrow();await expect(view(f.factId)).rejects.toThrow();
  });
  it('preserves a valid frozen link after deletion of mutable source and local order',async()=>{
    const f=await seed();await f.link();const payment=await pay((await sources())[0].sari_order_id),before=await view(f.factId),old=await links();
    await query('DELETE FROM order_payments WHERE id=?',[payment.paymentId]);await query('DELETE FROM zid_orders WHERE merchant_id=?',[owner.merchantId]);await query('DELETE FROM orders WHERE merchantId=?',[owner.merchantId]);
    await f.link();expect(await links()).toEqual(old);expect(await view(f.factId)).toEqual(before);
  });
  it('does not manufacture evidence for pre-evidence quotes or foreign merchants',async()=>{
    await upsertOrderFromZid(owner.merchantId,sourceOrder());expect(await linkZidOrderProjection(owner.merchantId,1,'11','991')).toEqual({kind:'not_recorded'});
    const f=await seed('22'),other=await createDisposableMerchant('link-foreign');users.push(other.userId);
    expect(await linkZidOrderProjection(other.merchantId,f.quotationId,'22','991')).toEqual({kind:'not_recorded'});expect(await links()).toHaveLength(0);
    await expect(inspectSalesOrderSettlement(other.userId,{merchantId:owner.merchantId,factId:f.factId})).rejects.toThrow();
  });
  it.each(['before','after'])('recovers a lost link commit %s acknowledgement without duplicates',async when=>{
    const f=await seed(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;return new Proxy(c,{get(target,key){
      if(key==='commit')return async()=>{if(when==='after')await target.commit();throw Error('Synthetic lost link commit');};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await expect(f.link()).rejects.toThrow();vi.restoreAllMocks();expect(await links()).toHaveLength(when==='after'?1:0);await f.link();expect(await links()).toHaveLength(1);
  });
  it('destroys an uncertain connection after failed rollback, then recovers',async()=>{
    const f=await seed(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true,destroyed=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;return new Proxy(c,{get(target,key){
      if(key==='commit'||key==='rollback')return async()=>{throw Error('Synthetic lost connection');};if(key==='destroy')return()=>{destroyed=true;target.destroy();};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await expect(f.link()).rejects.toThrow();vi.restoreAllMocks();expect(destroyed).toBe(true);await f.link();expect(await links()).toHaveLength(1);
  });
  it('returns stable minimized evidence on repeated reads without financial writes or requests',async()=>{
    const f=await seed();await f.link();await pay((await sources())[0].sari_order_id);const before=await links(),fact=(await facts())[0],a=await view(f.factId);
    expect(await view(f.factId)).toEqual(a);expect(await links()).toEqual(before);expect(readSalesOrderLink(before[0],fact).snapshot.orderFactId).toBe(f.factId);
    expect(JSON.stringify(a)).not.toContain(phone);expect(JSON.stringify(a)).not.toContain(readSalesOrderFact(fact).snapshot.customerKey);expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses a later duplicate local creation identity instead of counting the payment twice',async()=>{
    const f=await seed();await f.link();const [s]=await sources();await pay(s.sari_order_id);
    await query("INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,local_order_id,order_key,fact_digest,snapshot) VALUES (?,999,'local',?,REPEAT('b',64),REPEAT('b',64),'{}')",[owner.merchantId,s.sari_order_id]);
    await expect(view(f.factId)).rejects.toThrow();
  });
  it('holds the source projection stable until link commit and retains its historical identity afterwards',async()=>{
    const f=await seed(),[s]=await sources(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true;
    let entered!:()=>void,resume!:()=>void;const locked=new Promise<void>(r=>{entered=r;}),proceed=new Promise<void>(r=>{resume=r;});
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;return new Proxy(c,{get(target,key){
      if(key==='query')return async(sql:any,args:any)=>{const result=await target.query(sql,args);if(String(sql).includes('UTC_TIMESTAMP(3) AS now')){entered();await proceed;}return result;};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    const linking=f.link();await locked;const competitor=await get();
    try{await competitor.query('SET SESSION innodb_lock_wait_timeout=1');
      await expect(competitor.execute('UPDATE orders SET totalAmount=1 WHERE id=?',[s.sari_order_id])).rejects.toMatchObject({code:'ER_LOCK_WAIT_TIMEOUT'});
    }finally{resume();await competitor.query('SET SESSION innodb_lock_wait_timeout=50');competitor.release();}
    await linking;vi.restoreAllMocks();const before=await links();await query('UPDATE orders SET totalAmount=1 WHERE id=?',[s.sari_order_id]);await f.link();expect(await links()).toEqual(before);
  });
});
