import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { prepareSalesExperimentLaunch,authorizeSalesExperimentLaunch,revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer } from './sales-experiment-assignment';
import { applyTapOrderPaymentState } from '../payment/order-payment-state';
import { attributeSalesPaymentFact,runSalesPaymentAttributionBatch,salesPaymentAttributionHealth,SalesPaymentHealthAccessDenied } from './sales-payment-attribution';
import { readSalesPaymentFact,readSalesPaymentAttribution } from './sales-payment-fact-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { processTapWebhook } from '../webhooks/tap-webhook';

const state = vi.hoisted(() => ({unix:null as number|null,arm:0}));
vi.mock('node:crypto', async original => ({...await original<typeof import('node:crypto')>(),randomInt:() => state.arm}));
vi.mock('../db_ai_settings', () => ({getActiveModel:async()=> 'synthetic-model',getZahyPiRuntimeMetadata:async()=>({enabled:true,provider:'openai',model:'synthetic-model',source:'database'})}));
vi.mock('../channels/whatsapp/service', () => ({sendMerchantWhatsApp:vi.fn(async()=>({status:'accepted'}))}));
vi.mock('./checkout-agreements', async original => {
  const actual = await original<typeof import('./checkout-agreements')>();
  return {...actual,checkoutTransaction:(run:any)=>actual.checkoutTransaction(async c=>{
    if(state.unix!==null)await c.query('SET timestamp=?',[state.unix]);
    try{return await run(c);}finally{await c.query('SET timestamp=DEFAULT');}
  })};
});
vi.mock('./sales-payment-facts', async original => {
  const actual = await original<typeof import('./sales-payment-facts')>();
  return {...actual,recordTapSalesPaymentFact:async(c:any,m:number,p:number)=>{
    if(state.unix!==null)await c.query('SET timestamp=?',[state.unix]);
    try{return await actual.recordTapSalesPaymentFact(c,m,p);}finally{await c.query('SET timestamp=DEFAULT');}
  }};
});
describe.skipIf(!process.env.DATABASE_URL)('prospective verified payment experiment attribution', () => {
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,reviewer:typeof owner,users:number[],conversationId:number;
  let seeded:Awaited<ReturnType<typeof seedApprovedSalesPlan>>,launch:Awaited<ReturnType<typeof authorizeSalesExperimentLaunch>>;
  let assignment:Extract<Awaited<ReturnType<typeof assignSalesExperimentCustomer>>,{kind:'assigned'}>['receipt'];
  const phone='966500008321';
  const query=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const facts=async()=>query('SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const due=async()=>query("UPDATE ai_sales_payment_facts SET next_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND attribution_state='pending'",[owner.merchantId]);
  const attribute=async(row?:any)=>{await due();return attributeSalesPaymentFact(owner.merchantId,(row||(await facts())[0]).id);};
  async function payment({amount=23000,currency='SAR',customer=phone,metadataConversation=conversationId,booking=false}: {amount?:number;currency?:string;customer?:string;metadataConversation?:number;booking?:boolean}={}) {
    let target:number;
    if(booking){
      const service=await query("INSERT INTO services (merchant_id,name,description,base_price,duration_minutes) VALUES (?,'Synthetic service','Fixture',?,60)",[owner.merchantId,amount]);
      target=Number((await query("INSERT INTO bookings (merchant_id,service_id,customer_name,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price,status) VALUES (?,?,'Synthetic',?,'2026-09-27','10:00','11:00',60,?,?,'pending')",[owner.merchantId,service.insertId,customer,amount,amount])).insertId);
    }else target=Number((await query("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,?,'Synthetic','[]',?,?)",[owner.merchantId,customer,amount,currency])).insertId);
    const charge='chg_sales_fact_'+randomUUID().replaceAll('-','');
    const p=await query(`INSERT INTO order_payments (merchant_id,${booking?'booking_id':'order_id'},customer_phone,amount,currency,status,tap_charge_id,metadata)
      VALUES (?,?,?,?,?,'pending',?,?)`,[owner.merchantId,target,'966599999999',amount,currency,charge,JSON.stringify({conversationId:metadataConversation})]);
    return {paymentId:Number(p.insertId),tapChargeId:charge,expectedMerchantId:owner.merchantId,expectedAmount:amount,expectedCurrency:currency,providerStatus:'CAPTURED'};
  }
  async function capture(options:Parameters<typeof payment>[0]={}){const p=await payment(options);await applyTapOrderPaymentState(p);await due();return p;}
  beforeEach(async()=>{
    state.unix=null;state.arm=0;users=[];
    owner=await createDisposableMerchant('payment-itt');users.push(owner.userId);
    reviewer=await createDisposableMerchant('payment-review');users.push(reviewer.userId);
    seeded=await seedApprovedSalesPlan(owner,reviewer.userId);
    const prepared=await prepareSalesExperimentLaunch(owner.merchantId,{protocolId:seeded.protocol.protocolId});
    launch=await authorizeSalesExperimentLaunch(owner.merchantId,owner.userId,{protocolId:seeded.protocol.protocolId,requestId:randomUUID(),
      basisDigest:prepared.basisDigest,reviewId:prepared.basis.reviewId,reviewDigest:prepared.basis.reviewDigest,
      reason:'Authorize the independently reviewed synthetic payment attribution experiment.',reviewedBoundPlanAndDecision:true,understandsNoMessagesSent:true});
    state.unix=Math.ceil(Date.parse(prepared.basis.window.enrollmentStartsAt)/1000)+60;
    conversationId=Number((await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,?,'active','new')",[owner.merchantId,phone])).insertId);
    const message=await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','أريد عرضًا مناسبًا',?)",[conversationId,new Date(state.unix*1000).toISOString().slice(0,19).replace('T',' ')]);
    const assigned=await assignSalesExperimentCustomer(owner.merchantId,{protocolId:seeded.protocol.protocolId,launchId:launch.launchId,launchDigest:launch.launchDigest,conversationId,incomingMessageId:message.insertId});
    if(assigned.kind!=='assigned')throw Error('Fixture assignment failed');assignment=assigned.receipt;state.unix+=1;
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No network permitted');}));
  });
  afterEach(async()=>{state.unix=null;vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});
  afterAll(closeDb);

  it.each([false,true])('records a canonical %s booking payment and attributes without requiring exposure',async booking=>{
    const p=await capture({booking});expect(await attribute()).toBe('attributed');const [row]=await facts(),f=readSalesPaymentFact(row),a=readSalesPaymentAttribution(row);
    expect(f.snapshot).toMatchObject({paymentId:p.paymentId,customerKey:assignment.snapshot.customerKey,targetKind:booking?'booking':'order',timeBasis:'local_verified_transition'});
    expect(a).toMatchObject({assignmentId:assignment.assignmentId,arm:'baseline',signedNetMinor:23000,humanAssistance:'unmeasured',winner:null});
    expect(JSON.stringify(row)).not.toContain(phone);expect(JSON.stringify(row)).not.toContain('966599999999');
    expect(await query('SELECT id FROM ai_sales_experiment_exposures WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
  });
  it('freezes customer and money before source edits or source deletion',async()=>{
    const p=await capture();const [before]=await facts();await query("UPDATE orders SET customerPhone='966500009999',totalAmount=1 WHERE id=?",[before.target_id]);
    await query('DELETE FROM order_payments WHERE id=?',[p.paymentId]);await query('DELETE FROM orders WHERE id=?',[before.target_id]);
    expect(await attribute()).toBe('attributed');expect((await facts())[0].fact_digest).toBe(before.fact_digest);
    expect(readSalesPaymentAttribution((await facts())[0]).signedNetMinor).toBe(23000);
  });
  it('serializes duplicate financial callbacks and multiple recovery workers exactly once',async()=>{
    const p=await payment();await Promise.all([applyTapOrderPaymentState(p),applyTapOrderPaymentState(p),applyTapOrderPaymentState(p)]);await due();
    const [f]=await facts(),results=await Promise.all([attributeSalesPaymentFact(owner.merchantId,f.id),attributeSalesPaymentFact(owner.merchantId,f.id),attributeSalesPaymentFact(owner.merchantId,f.id)]);
    expect(results.filter(r=>r==='attributed')).toHaveLength(1);expect(await facts()).toHaveLength(1);expect((await facts())[0].attempts).toBe(1);
  });
  it.each(['AUTHORIZED','FAILED','CANCELLED','REFUNDED'])('does not fabricate a purchase from initial %s',async providerStatus=>{
    const p=await payment();await applyTapOrderPaymentState({...p,providerStatus});expect(await facts()).toHaveLength(0);
  });
  it.each(['before','start','last','end','after'])('honors the %s customer observation boundary',async boundary=>{
    const s=assignment.snapshot;state.unix=(boundary==='before'?Date.parse(s.assignedAt)-1:boundary==='start'?Date.parse(s.assignedAt):boundary==='last'?Date.parse(s.observationEndsAt)-1:boundary==='end'?Date.parse(s.observationEndsAt):Date.parse(s.observationEndsAt)+1)/1000;
    await capture();expect(await attribute()).toBe(['start','last'].includes(boundary)?'attributed':'unassigned');
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?',[owner.merchantId])).toHaveLength(1);
  });
  it.each(['same','alias','different','invalid'])('uses canonical target customer identity %s, never payment metadata or recipient',async kind=>{
    await capture({customer:kind==='same'?phone:kind==='alias'?'+'+phone:kind==='different'?'966500009999':'966 500 008321',metadataConversation:conversationId});
    expect(await attribute()).toBe(['same','alias'].includes(kind)?'attributed':'unassigned');
  });
  it.each(['before','at','after'])('retains a refund %s cutoff and inherits the original assignment',async boundary=>{
    const p=await capture();await attribute();state.unix=(Date.parse(assignment.snapshot.decisionNotBefore)+(boundary==='before'?-1:boundary==='at'?0:1))/1000;
    await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});
    const [,refund]=await facts();expect(await attribute(refund)).toBe('attributed');const a=readSalesPaymentAttribution((await facts())[1]);
    expect(a).toMatchObject({assignmentId:assignment.assignmentId,event:'refunded',includedAtCutoff:boundary==='before',signedNetMinor:boundary==='before'?-23000:0});
    expect(await facts()).toHaveLength(2);await applyTapOrderPaymentState(p);expect(await facts()).toHaveLength(2);
  });
  it('recovers capture and refund after restart even when capture was not yet attributed',async()=>{
    const p=await capture();state.unix!+=60;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await due();
    const [,refund]=await facts();expect(await attributeSalesPaymentFact(owner.merchantId,refund.id)).toBe('deferred');
    await closeDb();await due();expect((await runSalesPaymentAttributionBatch()).attributed).toBe(2);
    expect((await facts()).map((r:any)=>readSalesPaymentAttribution(r).signedNetMinor)).toEqual([23000,-23000]);
  });
  it('does not reassign historical capture or refund after launch revocation',async()=>{
    const p=await capture();await revokeSalesExperimentLaunch(owner.merchantId,owner.userId,{launchId:launch.launchId,launchDigest:launch.launchDigest,requestId:randomUUID(),reason:'Withdraw this synthetic launch after capture for independent safety review.'});
    expect(await attribute()).toBe('attributed');state.unix!+=60;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});
    expect(await attribute((await facts())[1])).toBe('attributed');
  });
  it('keeps currencies separate and never merges different payments into one amount',async()=>{
    await capture({amount:23000,currency:'SAR'});await capture({amount:15000,currency:'USD'});await runSalesPaymentAttributionBatch();
    expect((await facts()).map((r:any)=>{const a=readSalesPaymentAttribution(r);return [a.currency,a.signedNetMinor];})).toEqual([['SAR',23000],['USD',15000]]);
  });
  it('does not timestamp a legacy capture on replay and parks its later refund for review',async()=>{
    const p=await payment();await query("UPDATE order_payments SET status='captured',captured_at=UTC_TIMESTAMP() WHERE id=?",[p.paymentId]);
    await applyTapOrderPaymentState(p);expect(await facts()).toHaveLength(0);
    await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await attribute();expect((await facts())[0]).toMatchObject({attribution_state:'review',last_error:'evidence_unavailable'});
  });
  it('preserves unassigned capture status through refund',async()=>{
    state.unix=Date.parse(assignment.snapshot.observationEndsAt)/1000;const p=await capture();await attribute();state.unix+=60;
    await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});expect(await attribute((await facts())[1])).toBe('unassigned');
  });
  it('denies another merchant projection without changing either ledger',async()=>{
    await capture();const [f]=await facts();expect(await attributeSalesPaymentFact(reviewer.merchantId,f.id)).toBe('skipped');expect((await facts())[0].attribution_state).toBe('pending');
  });
  it.each(['digest','index','extra','assignment','assignment-window','protocol'])('quarantines %s corruption while leaving finance captured',async mode=>{
    const p=await capture(),[f]=await facts();
    if(mode==='digest')await query("UPDATE ai_sales_payment_facts SET fact_digest=REPEAT('b',64) WHERE id=?",[f.id]);
    if(mode==='index')await query('UPDATE ai_sales_payment_facts SET target_id=target_id+100000 WHERE id=?',[f.id]);
    if(mode==='extra'){const s={...readSalesPaymentFact(f).snapshot,phone};await query('UPDATE ai_sales_payment_facts SET snapshot=?,fact_digest=? WHERE id=?',[JSON.stringify(s),policyArtifactDigest(s),f.id]);}
    if(mode==='assignment')await query("UPDATE ai_sales_experiment_assignments SET assignment_digest=REPEAT('b',64) WHERE id=?",[assignment.assignmentId]);
    if(mode==='assignment-window')await query("UPDATE ai_sales_experiment_assignments SET observation_ends_at='2025-01-01' WHERE id=?",[assignment.assignmentId]);
    if(mode==='protocol')await query("UPDATE ai_sales_experiment_protocols SET protocol_digest=REPEAT('b',64) WHERE id=?",[seeded.protocol.protocolId]);
    await attribute();const row=(await facts())[0];expect(row.attribution).toBeNull();expect(row.attribution_state).toBe('review');
    expect((await query('SELECT status FROM order_payments WHERE id=?',[p.paymentId]))[0].status).toBe('captured');
  });
  it.each(['966500009999','not-a-canonical-phone'])('rejects refund identity drift to %s without erasing the captured payment evidence',async phone=>{
    const p=await capture();await attribute();await query('UPDATE orders SET customerPhone=? WHERE id=?',[phone,(await facts())[0].target_id]);
    state.unix!+=60;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await attribute((await facts())[1]);
    expect((await facts())[1].attribution_state).toBe('review');expect(readSalesPaymentAttribution((await facts())[0]).signedNetMinor).toBe(23000);
  });
  it('does not grant financial success if the atomic evidence insert fails',async()=>{
    const p=await payment(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);c.execute=(async(sql:any,args:any)=>{
      if(String(sql).includes('INSERT INTO ai_sales_payment_facts'))throw Error('Synthetic insert failure');return execute(sql,args);
    }) as any;const release=c.release.bind(c);c.release=()=>{c.execute=execute as any;c.release=release;release();};return c;});
    await expect(applyTapOrderPaymentState(p)).rejects.toThrow('Synthetic insert failure');vi.restoreAllMocks();
    expect((await query('SELECT status FROM order_payments WHERE id=?',[p.paymentId]))[0].status).toBe('pending');expect(await facts()).toHaveLength(0);
    expect(await query('SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    await applyTapOrderPaymentState(p);expect(await facts()).toHaveLength(1);
  });
  it.each(['before','after'])('recovers an uncertain attribution commit %s acknowledgment',async when=>{
    await capture();const [f]=await facts(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();if(!once)return c;once=false;const commit=c.commit.bind(c);
      c.commit=async()=>{if(when==='after')await commit();throw Error('Synthetic lost commit');};return c;});
    await attributeSalesPaymentFact(owner.merchantId,f.id);vi.restoreAllMocks();await due();await attributeSalesPaymentFact(owner.merchantId,f.id);
    expect((await facts())[0].attribution_state).toBe('attributed');expect(await facts()).toHaveLength(1);
  });
  it('enforces event and canonical-target uniqueness',async()=>{
    await capture();const [f]=await facts();
    for(const paymentId of [f.payment_id,f.payment_id+100000])await expect(query(`INSERT INTO ai_sales_payment_facts
      (merchant_id,payment_id,event_type,target_kind,target_id,customer_key,fact_digest,snapshot) VALUES (?,?,?,?,?,?,?,?)`,
      [owner.merchantId,paymentId,f.event_type,f.target_kind,f.target_id,f.customer_key,f.fact_digest,JSON.stringify(f.snapshot)])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
  });
  it('requires an active database admin and returns no customer or payment data in health',async()=>{
    await capture();await expect(salesPaymentAttributionHealth(owner.userId)).rejects.toBeInstanceOf(SalesPaymentHealthAccessDenied);
    await query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);const health=await salesPaymentAttributionHealth(owner.userId);
    expect(health.every(r=>Object.keys(r).sort().join(',')==='count,due,status')).toBe(true);
    await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(salesPaymentAttributionHealth(owner.userId)).rejects.toBeInstanceOf(SalesPaymentHealthAccessDenied);
  });
  it('does not let webhook metadata mark a different customer conversation paid',async()=>{
    const other=await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage,loss_reason) VALUES (?,'966500007777','active','new','Synthetic reason')",[owner.merchantId]);
    const p=await payment({metadataConversation:other.insertId});
    await processTapWebhook({data:{object:{id:p.tapChargeId,amount:230,currency:'SAR',live_mode:false,status:'CAPTURED'}}} as any,{testMode:true});
    expect((await query('SELECT deal_stage,loss_reason FROM conversations WHERE id=?',[other.insertId]))[0]).toMatchObject({deal_stage:'new',loss_reason:'Synthetic reason'});
    expect(await query('SELECT id FROM sari_learning_signals WHERE merchant_id=? AND conversation_id=?',[owner.merchantId,other.insertId])).toHaveLength(0);
    expect(await attribute()).toBe('attributed');
  });
  it('never refreshes the verification timestamp on later callback replay',async()=>{
    const p=await capture(),[before]=await facts();state.unix=Date.parse(assignment.snapshot.observationEndsAt)/1000+60;
    await applyTapOrderPaymentState(p);expect(await facts()).toEqual([before]);expect(await attribute()).toBe('attributed');
  });
  it('does not claim that the latest strategy caused a verified purchase',async()=>{
    await query("INSERT INTO sari_strategy_metrics (merchant_id,conversation_id,strategy,led_to_purchase,created_at) VALUES (?,?,'unverified_latest',0,'2028-01-01')",[owner.merchantId,conversationId]);
    await query("UPDATE conversations SET loss_reason='Legacy stalled reason' WHERE id=?",[conversationId]);
    const p=await payment();await processTapWebhook({data:{object:{id:p.tapChargeId,amount:230,currency:'SAR',live_mode:false,status:'CAPTURED'}}} as any,{testMode:true});
    expect((await query('SELECT deal_stage,loss_reason FROM conversations WHERE id=?',[conversationId]))[0]).toMatchObject({deal_stage:'paid',loss_reason:null});
    expect((await query('SELECT led_to_purchase FROM sari_strategy_metrics WHERE merchant_id=? AND conversation_id=?',[owner.merchantId,conversationId]))[0].led_to_purchase).toBe(0);
  });
  it('parks a refund with a regressed verification clock',async()=>{
    const p=await capture();await attribute();state.unix!-=1;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await attribute((await facts())[1]);
    expect((await facts())[1]).toMatchObject({attribution_state:'review',last_error:'evidence_unavailable'});
  });
  it('backs off transient SQL failure and parks after eight attempts without sending',async()=>{
    await capture();const [f]=await facts(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),release=c.release.bind(c);
      c.execute=(async(sql:any,args:any)=>{if(String(sql).includes('SELECT id FROM ai_sales_experiment_assignments'))throw Error('Synthetic secret storage failure');return execute(sql,args);}) as any;
      c.release=()=>{c.execute=execute as any;c.release=release;release();};return c;});
    for(let n=1;n<=8;n++){
      await due();expect(await attributeSalesPaymentFact(owner.merchantId,f.id)).toBe('deferred');const [r]=await facts();
      expect(r.attempts).toBe(n);expect(r.attribution_state).toBe(n===8?'review':'pending');expect(r.last_error).toBe('projection_unavailable');
      if(n<8)expect(await attributeSalesPaymentFact(owner.merchantId,f.id)).toBe('skipped');
    }
    expect(await attributeSalesPaymentFact(owner.merchantId,f.id)).toBe('skipped');expect(fetch).not.toHaveBeenCalled();
  });
});
