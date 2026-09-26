import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { prepareSalesExperimentLaunch,authorizeSalesExperimentLaunch,revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer } from './sales-experiment-assignment';
import { prepareCheckoutQuote,acceptCheckoutQuote,type CheckoutIdentity } from './checkout-agreements';
import { stageInteraction,finishInteractionDelivery } from './interaction-jobs';
import { buildReplyPlan } from '../messaging/reply-plan';
import { readSalesOrderFact,readSalesOrderAttribution } from './sales-order-fact-contract';
import { attributeSalesOrderFact,runSalesOrderAttributionBatch,salesOrderAttributionHealth,SalesOrderHealthAccessDenied } from './sales-order-attribution';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
const state=vi.hoisted(()=>({unix:null as number|null,observedUnix:null as number|null}));
vi.mock('../db_ai_settings',()=>({getActiveModel:async()=>'synthetic-model',getZahyPiRuntimeMetadata:async()=>({enabled:true,provider:'openai',model:'synthetic-model',source:'database'})}));
vi.mock('./checkout-agreements',async original=>{const actual=await original<typeof import('./checkout-agreements')>();return {...actual,
  checkoutTransaction:(run:any)=>actual.checkoutTransaction(async c=>{if(state.unix!==null)await c.query('SET timestamp=?',[state.unix]);try{return await run(c);}finally{await c.query('SET timestamp=DEFAULT');}})};});
// Local calls inside the same module bypass the exported mock; pin the fact observation independently.
vi.mock('./sales-order-facts',async original=>{const actual=await original<typeof import('./sales-order-facts')>();return {...actual,
  recordSalesOrderFact:async(c:any,m:number,q:number,origin:any)=>{if(state.observedUnix!==null)await c.query('SET timestamp=?',[state.observedUnix]);
    try{return await actual.recordSalesOrderFact(c,m,q,origin);}finally{await c.query('SET timestamp=DEFAULT');}}};});

describe.skipIf(!process.env.DATABASE_URL)('prospective agreement order attribution on MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,reviewer:typeof owner,users:number[],identity:CheckoutIdentity,productId:number;
  let seeded:Awaited<ReturnType<typeof seedApprovedSalesPlan>>,launch:Awaited<ReturnType<typeof authorizeSalesExperimentLaunch>>;
  let assignment:Extract<Awaited<ReturnType<typeof assignSalesExperimentCustomer>>,{kind:'assigned'}>['receipt'];
  const phone='966500008322',query=async(sql:string,args:any[]=[])=> (await (await getPool())!.execute<any>(sql,args))[0];
  const facts=()=>query('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const due=()=>query("UPDATE ai_sales_order_facts SET next_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND attribution_state='pending'",[owner.merchantId]);
  const attribute=async()=>{await due();return attributeSalesOrderFact(owner.merchantId,(await facts())[0].id);};
  async function incoming(text:string){const row=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)",[identity.conversationId,text]);identity={...identity,incomingMessageId:row.insertId};return identity;}
  async function create(){
    await incoming('أريد شراء سماعة واحدة');const q=await prepareCheckoutQuote(identity,[{productId,variantId:null,quantity:1}]);if(q.kind!=='quote')throw Error('Quote missing');
    const reply=buildReplyPlan({...identity,instanceId:1,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:phone,text:q.text});
    await stageInteraction(reply);await finishInteractionDelivery(reply,true);await incoming('نعم');
    const order=await acceptCheckoutQuote(identity,q.quotationId);if(order.kind!=='order')throw Error('Order missing '+order.kind);
    return {order,q,consent:{...identity}};
  }
  beforeEach(async()=>{
    state.unix=null;state.observedUnix=null;users=[];owner=await createDisposableMerchant('order-itt');users.push(owner.userId);reviewer=await createDisposableMerchant('order-review');users.push(reviewer.userId);
    seeded=await seedApprovedSalesPlan(owner,reviewer.userId);const p=await prepareSalesExperimentLaunch(owner.merchantId,{protocolId:seeded.protocol.protocolId});
    launch=await authorizeSalesExperimentLaunch(owner.merchantId,owner.userId,{protocolId:seeded.protocol.protocolId,requestId:randomUUID(),basisDigest:p.basisDigest,
      reviewId:p.basis.reviewId,reviewDigest:p.basis.reviewDigest,reason:'Authorize independently reviewed synthetic order attribution tests.',reviewedBoundPlanAndDecision:true,understandsNoMessagesSent:true});
    state.unix=Math.ceil(Date.parse(p.basis.window.enrollmentStartsAt)/1000)+60;
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[owner.merchantId,phone]);
    const m=await query("INSERT INTO messages (conversationId,direction,content,createdAt) VALUES (?,'incoming','أريد معرفة العرض',?)",[c.insertId,new Date(state.unix*1000).toISOString().slice(0,19).replace('T',' ')]);
    identity={merchantId:owner.merchantId,conversationId:c.insertId,incomingMessageId:m.insertId,customerPhone:phone};
    const a=await assignSalesExperimentCustomer(owner.merchantId,{protocolId:seeded.protocol.protocolId,launchId:launch.launchId,launchDigest:launch.launchDigest,conversationId:c.insertId,incomingMessageId:m.insertId});
    if(a.kind!=='assigned')throw Error('Assignment missing');assignment=a.receipt;state.observedUnix=state.unix+1;
    productId=Number((await query("INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?,'Synthetic',23000,'minor','SAR',100)",[owner.merchantId])).insertId);
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No external network');}));
  });
  afterEach(async()=>{state.unix=null;state.observedUnix=null;vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  it('freezes consent and canonical order without payment, exposure or revenue',async()=>{
    const {order,q}=await create(),[row]=await facts(),f=readSalesOrderFact(row);expect(await attribute()).toBe('attributed');
    expect(f.snapshot).toMatchObject({quotationId:q.quotationId,localOrderId:order.orderId,customerKey:assignment.snapshot.customerKey,quotedAmountMinor:23000,paymentEvidence:'not_measured'});
    expect(readSalesOrderAttribution((await facts())[0])).toMatchObject({assignmentId:assignment.assignmentId,outcome:'order_created_only',revenueMinor:null,winner:null});
    expect((await query('SELECT payment_status FROM orders WHERE id=?',[order.orderId]))[0].payment_status).toBe('unpaid');
    for(const table of ['ai_sales_payment_facts','ai_sales_experiment_exposures','order_payments','whatsapp_message_deliveries'])expect(await query(`SELECT id FROM ${table} WHERE merchant_id=?`,[owner.merchantId])).toHaveLength(0);
    expect(JSON.stringify(row)).not.toContain(phone);expect(fetch).not.toHaveBeenCalled();
  });
  it('replay and competing projection workers keep one immutable fact',async()=>{
    const {consent,q}=await create(),before=await facts();await acceptCheckoutQuote(consent,q.quotationId);await due();const id=before[0].id;
    const r=await Promise.all([attributeSalesOrderFact(owner.merchantId,id),attributeSalesOrderFact(owner.merchantId,id),attributeSalesOrderFact(owner.merchantId,id)]);
    expect(r.filter(s=>s==='attributed')).toHaveLength(1);expect(await facts()).toHaveLength(1);expect((await facts())[0].fact_digest).toBe(before[0].fact_digest);
  });
  it.each(['before','start','last','end','after'])('respects %s of the fixed observation window',async boundary=>{
    const a=assignment.snapshot;state.observedUnix=(boundary==='before'?Date.parse(a.assignedAt)-1:boundary==='start'?Date.parse(a.assignedAt):boundary==='last'?Date.parse(a.observationEndsAt)-1:boundary==='end'?Date.parse(a.observationEndsAt):Date.parse(a.observationEndsAt)+1)/1000;
    await create();expect(await attribute()).toBe(['start','last'].includes(boundary)?'attributed':'unassigned');
  });
  it('retains evidence after source edit and deletion and after launch revocation',async()=>{
    const {order,q}=await create(),before=await facts();await query("UPDATE orders SET totalAmount=1,customerPhone='966500009999' WHERE id=?",[order.orderId]);
    await query('DELETE FROM sales_quotations WHERE id=?',[q.quotationId]);await query('DELETE FROM orders WHERE id=?',[order.orderId]);
    await revokeSalesExperimentLaunch(owner.merchantId,owner.userId,{launchId:launch.launchId,launchDigest:launch.launchDigest,requestId:randomUUID(),reason:'Withdraw the synthetic experiment after a recorded agreement.'});
    expect(await attribute()).toBe('attributed');expect((await facts())[0].fact_digest).toBe(before[0].fact_digest);expect(readSalesOrderFact((await facts())[0]).snapshot.quotedAmountMinor).toBe(23000);
  });
  it.each(['digest','quote-index','identity-index','extra','assignment','protocol'])('quarantines %s corruption without cancelling the order',async mode=>{
    const {order}=await create(),[f]=await facts();
    if(mode==='digest')await query("UPDATE ai_sales_order_facts SET fact_digest=REPEAT('b',64) WHERE id=?",[f.id]);
    if(mode==='quote-index')await query('UPDATE ai_sales_order_facts SET quotation_id=quotation_id+100000 WHERE id=?',[f.id]);
    if(mode==='identity-index')await query("UPDATE ai_sales_order_facts SET order_key=REPEAT('b',64) WHERE id=?",[f.id]);
    if(mode==='extra'){const s={...readSalesOrderFact(f).snapshot,revenueMinor:23000};await query('UPDATE ai_sales_order_facts SET snapshot=?,fact_digest=? WHERE id=?',[JSON.stringify(s),hash(s),f.id]);}
    if(mode==='assignment')await query("UPDATE ai_sales_experiment_assignments SET assignment_digest=REPEAT('b',64) WHERE id=?",[assignment.assignmentId]);
    if(mode==='protocol')await query("UPDATE ai_sales_experiment_protocols SET protocol_digest=REPEAT('b',64) WHERE id=?",[seeded.protocol.protocolId]);
    await attribute();expect((await facts())[0]).toMatchObject({attribution_state:'review',last_error:'evidence_unavailable'});
    expect((await query('SELECT status FROM orders WHERE id=?',[order.orderId]))[0].status).toBe('pending');
  });
  it('never projects another merchant fact and rechecks the active database admin',async()=>{
    await create();const [f]=await facts();expect(await attributeSalesOrderFact(reviewer.merchantId,f.id)).toBe('skipped');
    await expect(salesOrderAttributionHealth(owner.userId)).rejects.toBeInstanceOf(SalesOrderHealthAccessDenied);await query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);
    expect((await salesOrderAttributionHealth(owner.userId)).every(r=>Object.keys(r).sort().join(',')==='count,due,status')).toBe(true);
    await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(salesOrderAttributionHealth(owner.userId)).rejects.toBeInstanceOf(SalesOrderHealthAccessDenied);
  });
  it('recovers SQL-only attribution after reconnect without inventing an order',async()=>{
    await create();await due();await closeDb();expect(await runSalesOrderAttributionBatch()).toMatchObject({selected:1,attributed:1});
    expect(await facts()).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before','after'])('recovers lost attribution commit %s acknowledgment',async when=>{
    await create();await due();const [f]=await facts(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;const commit=c.commit.bind(c);c.commit=async()=>{if(when==='after')await commit();throw Error('Synthetic lost commit');};return c;});
    await attributeSalesOrderFact(owner.merchantId,f.id);vi.restoreAllMocks();await due();await attributeSalesOrderFact(owner.merchantId,f.id);
    expect((await facts())[0].attribution_state).toBe('attributed');expect(await facts()).toHaveLength(1);
  });
  it('caps transient failures at eight and never falls back to another order or assignment',async()=>{
    await create();const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:any,args:any)=>{
      if(String(sql).includes('SELECT id FROM ai_sales_experiment_assignments'))throw Error('private storage failure');return target.execute(sql,args);};const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    for(let i=0;i<8;i++)await attribute();vi.restoreAllMocks();expect((await facts())[0]).toMatchObject({attempts:8,attribution_state:'review',last_error:'projection_unavailable',next_at:null});
  });
  it('rolls back local consent and order if the atomic evidence insert fails',async()=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(target,key){if(key==='execute')return async(sql:any,args:any)=>{
      if(String(sql).includes('INSERT INTO ai_sales_order_facts'))throw Error('Synthetic fact insert failure');return target.execute(sql,args);};const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await expect(create()).rejects.toThrow('Synthetic fact insert failure');vi.restoreAllMocks();
    expect(await query('SELECT id FROM orders WHERE merchantId=?',[owner.merchantId])).toHaveLength(0);expect(await facts()).toHaveLength(0);
    const [q]=await query('SELECT * FROM sales_quotations WHERE merchant_id=?',[owner.merchantId]);expect(q).toMatchObject({status:'sent',order_id:null,consent_message_id:null});
    expect((await acceptCheckoutQuote(identity,q.id)).kind).toBe('order');expect(await facts()).toHaveLength(1);
  });
  it.each(['before','after'])('keeps local order and evidence atomic across lost creation commit %s acknowledgment',async when=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();let wrote=false;return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:any,args:any)=>{const r=await target.execute(sql,args);if(String(sql).includes('INSERT INTO ai_sales_order_facts'))wrote=true;return r;};
      if(key==='commit')return async()=>{if(wrote&&!hit){hit=true;if(when==='after')await target.commit();throw Error('Synthetic lost creation commit');}return target.commit();};
      const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    await expect(create()).rejects.toThrow('Synthetic lost creation commit');vi.restoreAllMocks();expect(hit).toBe(true);
    const [q]=await query('SELECT * FROM sales_quotations WHERE merchant_id=?',[owner.merchantId]);expect(await facts()).toHaveLength(when==='after'?1:0);
    expect((await acceptCheckoutQuote(identity,q.id)).kind).toBe('order');expect(await facts()).toHaveLength(1);expect(await query('SELECT id FROM orders WHERE merchantId=?',[owner.merchantId])).toHaveLength(1);
  });
  it('does not backfill an old accepted order on replay with a new observation timestamp',async()=>{
    const {consent,q}=await create();await query('DELETE FROM ai_sales_order_facts WHERE merchant_id=?',[owner.merchantId]);state.observedUnix!+=86400;
    expect((await acceptCheckoutQuote(consent,q.quotationId)).kind).toBe('order');expect(await facts()).toHaveLength(0);
  });
});
