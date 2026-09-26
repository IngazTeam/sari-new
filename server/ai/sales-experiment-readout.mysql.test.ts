import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { prepareSalesExperimentLaunch,authorizeSalesExperimentLaunch,revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer } from './sales-experiment-assignment';
import { applyTapOrderPaymentState } from '../payment/order-payment-state';
import { attributeSalesPaymentFact } from './sales-payment-attribution';
import { inspectSalesExperimentReadout,SalesExperimentReadoutAccessDenied,SalesExperimentReadoutNotReady } from './sales-experiment-readout';
import { withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';

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
describe.skipIf(!process.env.DATABASE_URL)('experiment readout against real payment and assignment records', () => {
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

  const admin=()=>query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);
  async function report(options:{merchantId?:number;actor?:number;pause?:()=>Promise<void>;failRollback?:()=>void}={}) {
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let once=true;
    const spy=vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const c=await get();if(!once)return c;once=false;
      return new Proxy(c,{get(target,key){
        if(key==='query')return async(sql:any,args:any)=>{
          if(String(sql)==='SELECT UTC_TIMESTAMP(3) AS read_at') {
            await target.query('SET timestamp=?',[state.unix]);
            try{return await target.query(sql,args);}finally{await target.query('SET timestamp=DEFAULT');}
          }
          return target.query(sql,args);
        };
        if(key==='execute')return async(sql:any,args:any)=>{const result=await target.execute(sql,args);
          if(String(sql).includes('FROM ai_sales_experiment_assignments WHERE merchant_id=? AND protocol_id=? ORDER BY'))await options.pause?.();
          return result;};
        if(key==='rollback'&&options.failRollback)return async()=>{options.failRollback!();throw Error('Synthetic uncertain read rollback');};
        const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
      }}) as any;
    });
    try{return await inspectSalesExperimentReadout(options.actor ?? owner.userId,{merchantId:options.merchantId ?? owner.merchantId,protocolId:seeded.protocol.protocolId});}
    finally{spy.mockRestore();}
  }
  function gate(){let resume!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>resume=r),atRead=new Promise<void>(r=>entered=r);
    return {atRead,resume:()=>resume(),pause:async()=>{entered();await waiting;}};}
  it('counts a real assignment with no exposure and keeps finance unmeasured',async()=>{
    await admin();const r=await report();expect(r.arms[0]).toMatchObject({assignedCustomers:1,observationComplete:0,observationPending:1});
    expect(r.paymentEvidence).toMatchObject({status:'unmeasured',groups:[]});expect(r.consistency).toBe('single_database_snapshot');
    expect(await query('SELECT id FROM ai_sales_experiment_exposures WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
  });
  it('reports capture and full refund after real recovery while preserving the denominator',async()=>{
    await admin();const p=await capture();expect((await report()).paymentEvidence.status).toBe('unresolved_attribution');await attribute();
    expect((await report()).paymentEvidence.groups[0]).toMatchObject({capturedMinor:23000,netAtCutoffObservedMinor:23000,customersWithCapture:1});
    state.unix!+=60;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});expect((await report()).paymentEvidence.groups).toEqual([]);
    await attribute((await facts())[1]);const r=await report();expect(r.arms[0].assignedCustomers).toBe(1);
    expect(r.paymentEvidence.groups[0]).toMatchObject({netAtCutoffObservedMinor:0,customersWithRetainedCaptureAtCutoff:0,refundedBeforeCutoffMinor:23000});
    expect(JSON.stringify(r)).not.toContain(phone);expect(JSON.stringify(r)).not.toContain(assignment.snapshot.customerKey);expect(fetch).not.toHaveBeenCalled();
  });
  it('separates late refunds and keeps the frozen deadline and insufficient sample',async()=>{
    await admin();const p=await capture();await attribute();state.unix=Date.parse(assignment.snapshot.decisionNotBefore)/1000;
    await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await attribute((await facts())[1]);const r=await report();
    expect(r).toMatchObject({decisionTimeReached:true,sampleStatus:'insufficient_no_extension',winner:null,learningAllowed:false});
    expect(r.paymentEvidence.groups[0]).toMatchObject({netAtCutoffObservedMinor:23000,netCurrentlyObservedMinor:0,refundedAtOrAfterCutoffMinor:23000});
    expect(r.outcomeEvidence.arms[0]).toMatchObject({outcomes:{customersWithRetainedOrderAtCutoff:1},recordedRatio:{numerator:1,denominator:1}});
  });
  it('counts one actual customer across captured orders, currencies and bookings under the frozen order rule',async()=>{
    await admin();for(const options of [{},{currency:'USD'},{booking:true}]){await capture(options);const all=await facts();await attribute(all.at(-1));}
    const early=await report();expect(early.outcomeEvidence.arms[0]).toMatchObject({assignedCustomers:1,recordedRatio:null,
      outcomes:{customersWithOrderCapture:1,customersWithRetainedOrderAtCutoff:1,customersWithBookingCaptureOnly:0}});
    state.unix=Date.parse(assignment.snapshot.decisionNotBefore)/1000;const final=await report();
    expect(final.outcomeEvidence.arms[0].recordedRatio).toEqual({numerator:1,denominator:1});expect(final.paymentEvidence.groups).toHaveLength(3);
    expect(final.outcomeEvidence.decision.blockers).toContain('sample_below_registered_minimum');expect(final.winner).toBeNull();expect(fetch).not.toHaveBeenCalled();
  });
  it('does not convert a real captured booking into an order conversion',async()=>{
    await admin();await capture({booking:true});await attribute();state.unix=Date.parse(assignment.snapshot.decisionNotBefore)/1000;
    const r=await report();expect(r.outcomeEvidence.arms[0]).toMatchObject({outcomes:{customersWithOrderCapture:0,customersWithRetainedOrderAtCutoff:0,customersWithBookingCaptureOnly:1},recordedRatio:{numerator:0,denominator:1}});
    expect(r.paymentEvidence.groups[0].capturedMinor).toBe(23000);expect(r.primaryMetric).toBe('not_established');
  });
  it('a retained second order prevents a fully refunded first order from removing the customer',async()=>{
    await admin();const first=await capture();await attribute();const second=await capture({currency:'USD'});await attribute((await facts()).at(-1));
    state.unix!+=60;await applyTapOrderPaymentState({...first,providerStatus:'REFUNDED'});
    expect((await report()).outcomeEvidence.arms.every(a=>a.outcomes===null)).toBe(true);
    await attribute((await facts()).at(-1));expect((await report()).outcomeEvidence.arms[0].outcomes).toMatchObject({customersWithOrderCapture:1,customersWithRetainedOrderAtCutoff:1,customersWithOnlyFullyRefundedOrdersAtCutoff:0});
    await applyTapOrderPaymentState({...second,providerStatus:'REFUNDED'});await attribute((await facts()).at(-1));
    state.unix=Date.parse(assignment.snapshot.decisionNotBefore)/1000;
    expect((await report()).outcomeEvidence.arms[0]).toMatchObject({outcomes:{customersWithOnlyFullyRefundedOrdersAtCutoff:1,customersWithRetainedOrderAtCutoff:0},recordedRatio:{numerator:0,denominator:1}});
  });
  it('withdrawal after the decision clock removes ratio visibility without erasing recorded counts',async()=>{
    await admin();await capture();await attribute();state.unix=Date.parse(assignment.snapshot.decisionNotBefore)/1000;
    const before=await report();expect(before.outcomeEvidence.arms[0].recordedRatio).toEqual({numerator:1,denominator:1});
    await withdrawSalesExperimentProtocol(owner.merchantId,owner.userId,{protocolId:seeded.protocol.protocolId,protocolDigest:seeded.protocol.protocolDigest,requestId:randomUUID(),reason:'Withdraw the synthetic result without approving a policy from incomplete sources.'});
    const after=await report();expect(after.outcomeEvidence.arms[0].outcomes).toEqual(before.outcomeEvidence.arms[0].outcomes);
    expect(after.outcomeEvidence.arms[0].recordedRatio).toBeNull();expect(after.outcomeEvidence.decision.blockers).toContain('withdrawn');
  });
  it('preserves evidence across source deletion, launch revocation and protocol withdrawal',async()=>{
    await admin();const p=await capture();await attribute();const before=await report(),old=await facts();
    await query('DELETE FROM order_payments WHERE id=?',[p.paymentId]);await query('DELETE FROM orders WHERE id=?',[old[0].target_id]);
    await revokeSalesExperimentLaunch(owner.merchantId,owner.userId,{launchId:launch.launchId,launchDigest:launch.launchDigest,requestId:randomUUID(),reason:'Withdraw the synthetic launch for independent safety review.'});
    expect((await report()).evidenceSetDigest).toBe(before.evidenceSetDigest);
    await withdrawSalesExperimentProtocol(owner.merchantId,owner.userId,{protocolId:seeded.protocol.protocolId,protocolDigest:seeded.protocol.protocolDigest,requestId:randomUUID(),reason:'Withdraw the synthetic protocol for independent safety review.'});
    const after=await report();expect(after).toMatchObject({protocolState:'withdrawn',winner:null});expect(after.paymentEvidence).toEqual(before.paymentEvidence);
    expect(after.evidenceSetDigest).not.toBe(before.evidenceSetDigest);expect(await facts()).toEqual(old);await closeDb();expect((await report()).evidenceSetDigest).toBe(after.evidenceSetDigest);
  });
  it.each(['user','inactive','missing','other-merchant'])('rechecks %s SQL authority or scope',async kind=>{
    if(kind!=='user')await admin();if(kind==='inactive')await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
    await expect(report({actor:kind==='missing'?2147483647:owner.userId,merchantId:kind==='other-merchant'?reviewer.merchantId:owner.merchantId}))
      .rejects.toBeInstanceOf(kind==='other-merchant'?SalesExperimentReadoutNotReady:SalesExperimentReadoutAccessDenied);
  });
  it.each(['protocol','assignment','payment','attribution','withdrawal'])('refuses %s corruption rather than showing partial numbers',async kind=>{
    await admin();await capture();await attribute();
    const tables={protocol:['ai_sales_experiment_protocols','protocol_digest'],assignment:['ai_sales_experiment_assignments','assignment_digest'],payment:['ai_sales_payment_facts','fact_digest'],attribution:['ai_sales_payment_facts','attribution_digest']};
    if(kind==='withdrawal')await query("UPDATE ai_sales_experiment_protocols SET state='withdrawn',active_slot=NULL WHERE merchant_id=?",[owner.merchantId]);
    else {const [table,column]=tables[kind as keyof typeof tables];await query(`UPDATE ${table} SET ${column}=REPEAT('b',64) WHERE merchant_id=?`,[owner.merchantId]);}
    await expect(report()).rejects.toThrow();
  });
  it('uses one snapshot while refund and attribution commit during the read',async()=>{
    await admin();const p=await capture();await attribute();const g=gate(),reading=report({pause:g.pause});
    try{await g.atRead;state.unix!+=60;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});await attribute((await facts())[1]);}finally{g.resume();}
    const earlier=await reading,later=await report();
    expect(earlier.paymentEvidence.groups[0].netCurrentlyObservedMinor).toBe(23000);expect(later.paymentEvidence.groups[0].netCurrentlyObservedMinor).toBe(0);
    expect(earlier.outcomeEvidence.arms[0].outcomes?.customersWithRetainedOrderAtCutoff).toBe(1);
    expect(later.outcomeEvidence.arms[0].outcomes?.customersWithRetainedOrderAtCutoff).toBe(0);
  });
  it('does not combine a new attribution with the old backlog snapshot',async()=>{
    await admin();await capture();const g=gate(),reading=report({pause:g.pause});try{await g.atRead;await attribute();}finally{g.resume();}
    const earlier=await reading,later=await report();
    expect(earlier.paymentEvidence.status).toBe('unresolved_attribution');expect(later.paymentEvidence.status).toBe('observed');
    expect(earlier.outcomeEvidence.arms[0].outcomes).toBeNull();expect(later.outcomeEvidence.arms[0].outcomes?.customersWithRetainedOrderAtCutoff).toBe(1);
  });
  it('does not block new enrollment or mix it into the running denominator',async()=>{
    await admin();const g=gate(),reading=report({pause:g.pause});
    try{
      await g.atRead;state.arm=1;
      const conversation=await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,'966500008322','active','new')",[owner.merchantId]);
      const message=await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','أريد عرضًا مناسبًا',?)",[conversation.insertId,new Date(state.unix!*1000).toISOString().slice(0,19).replace('T',' ')]);
      expect((await assignSalesExperimentCustomer(owner.merchantId,{protocolId:seeded.protocol.protocolId,launchId:launch.launchId,launchDigest:launch.launchDigest,conversationId:conversation.insertId,incomingMessageId:message.insertId})).kind).toBe('assigned');
    }finally{g.resume();}
    expect((await reading).arms.map(a=>a.assignedCustomers)).toEqual([1,0]);expect((await report()).arms.map(a=>a.assignedCustomers)).toEqual([1,1]);
  });
  it('keeps protocol withdrawal in its own snapshot',async()=>{
    await admin();const g=gate(),reading=report({pause:g.pause});
    try{await g.atRead;await withdrawSalesExperimentProtocol(owner.merchantId,owner.userId,{protocolId:seeded.protocol.protocolId,protocolDigest:seeded.protocol.protocolDigest,requestId:randomUUID(),reason:'Withdraw this synthetic protocol during an independent historical read.'});}finally{g.resume();}
    expect((await reading).protocolState).toBe('registered');expect((await report()).protocolState).toBe('withdrawn');
  });
  it('holds current admin authority until the read finishes',async()=>{
    await admin();const g=gate(),reading=report({pause:g.pause});await g.atRead;const c=await (await getPool())!.getConnection();
    try{await c.query('SET SESSION innodb_lock_wait_timeout=1');await expect(c.execute("UPDATE users SET role='user' WHERE id=?",[owner.userId])).rejects.toMatchObject({code:'ER_LOCK_WAIT_TIMEOUT'});}
    finally{await c.query('SET SESSION innodb_lock_wait_timeout=50');c.release();g.resume();}
    await reading;await query("UPDATE users SET role='user' WHERE id=?",[owner.userId]);await expect(report()).rejects.toBeInstanceOf(SalesExperimentReadoutAccessDenied);
  });
  it('does not write evidence and discards an uncertain read connection',async()=>{
    await admin();await capture();await attribute();const before=await facts();let failed=0;
    await expect(report({failRollback:()=>failed++})).rejects.toThrow('Synthetic uncertain read rollback');expect(failed).toBe(2);
    expect(await facts()).toEqual(before);expect((await report()).paymentEvidence.groups[0].capturedMinor).toBe(23000);expect(fetch).not.toHaveBeenCalled();
  });

  const staff=(r:Awaited<ReturnType<typeof report>>)=>r.staffEvidence.arms[0];
  async function staffMessage(sender='merchant',conversation=conversationId,direction='outgoing',at=state.unix!){
    return query('INSERT INTO messages (conversationId,direction,sender_type,messageType,content,externalId,createdAt) VALUES (?,?,?,\'text\',\'PRIVATE STAFF CONTENT\',?,?)',
      [conversation,direction,sender,'private-staff-'+randomUUID(),new Date(at*1000).toISOString().slice(0,19).replace('T',' ')]);
  }
  it('staff evidence: excludes AI and incoming messages while separating unknown outgoing authors',async()=>{
    await admin();for(const role of ['merchant','merchant','unknown','customer','assistant'])await staffMessage(role);await staffMessage('merchant',conversationId,'incoming');
    const before=await query('SELECT * FROM messages WHERE conversationId=? ORDER BY id',[conversationId]);
    const r=await report();expect(staff(r)).toMatchObject({assignedCustomers:1,customersWithRecordedStaffMessages:1,customersWithUnknownOutgoingMessages:1,
      messages:{staffWithinWindow:2,unknownWithinWindow:2,staffAtBoundary:0,unknownAtBoundary:0}});
    expect(await query('SELECT * FROM messages WHERE conversationId=? ORDER BY id',[conversationId])).toEqual(before);
    for(const secret of [phone,'PRIVATE STAFF CONTENT','private-staff-'])expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.humanAssistance).toBe('unmeasured');expect(fetch).not.toHaveBeenCalled();
  });
  it('staff evidence: a live takeover with no successful message is not assistance',async()=>{
    await admin();await query('UPDATE conversations SET human_takeover=1,human_takeover_at=UTC_TIMESTAMP() WHERE id=?',[conversationId]);
    expect(staff(await report())).toMatchObject({customersWithRecordedStaffMessages:0,customersWithUnavailableConversationIdentity:0});
  });
  it('staff evidence: unions real registered conversations for the same normalized customer',async()=>{
    await admin();const conv=await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,?,'active','new')",[owner.merchantId,'+'+phone]);
    const incoming=await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','أريد عرضًا مناسبًا',?)",[conv.insertId,new Date(state.unix!*1000).toISOString().slice(0,19).replace('T',' ')]);
    const reused=await assignSalesExperimentCustomer(owner.merchantId,{protocolId:seeded.protocol.protocolId,launchId:launch.launchId,launchDigest:launch.launchDigest,conversationId:conv.insertId,incomingMessageId:incoming.insertId});
    expect(reused.kind).toBe('assigned');if(reused.kind==='assigned')expect(reused.receipt.assignmentId).toBe(assignment.assignmentId);
    await staffMessage();await staffMessage('merchant',conv.insertId);
    expect(staff(await report())).toMatchObject({assignedCustomers:1,customersWithRecordedStaffMessages:1,messages:{staffWithinWindow:2}});
  });
  it.each(['deleted','changed','missing-binding'])('staff evidence: %s identity does not remove the denominator or produce a staff count',async kind=>{
    await admin();await staffMessage();const before=await report();
    if(kind==='deleted')await query('DELETE FROM conversations WHERE id=?',[conversationId]);
    else if(kind==='changed')await query("UPDATE conversations SET customerPhone='966555555555' WHERE id=?",[conversationId]);
    else await query('DELETE FROM ai_sales_experiment_assignment_conversations WHERE assignment_id=?',[assignment.assignmentId]);
    const after=await report();expect(staff(after)).toMatchObject({assignedCustomers:1,customersWithRecordedStaffMessages:0,customersWithUnavailableConversationIdentity:1});
    expect(after.evidenceSetDigest).not.toBe(before.evidenceSetDigest);expect(after.outcomeEvidence.decision.blockers).toContain('human_assistance_unmeasured');
  });
  it('staff evidence: excludes unregistered and foreign conversations even when the phone matches',async()=>{
    await admin();for(const merchant of [owner.merchantId,reviewer.merchantId]){
      const conv=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[merchant,phone]);await staffMessage('merchant',conv.insertId);
    }
    expect(staff(await report()).customersWithRecordedStaffMessages).toBe(0);
  });
  it('staff evidence: a foreign conversation reference cannot expose another tenant message',async()=>{
    await admin();const conv=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[reviewer.merchantId,phone]);await staffMessage('merchant',conv.insertId);
    await query('UPDATE ai_sales_experiment_assignment_conversations SET conversation_reference=? WHERE assignment_id=?',[conv.insertId,assignment.assignmentId]);
    expect(staff(await report())).toMatchObject({customersWithRecordedStaffMessages:0,customersWithUnavailableConversationIdentity:1});
  });
  it('staff evidence: rejects a corrupted frozen customer binding',async()=>{
    await admin();await staffMessage();await query("UPDATE ai_sales_experiment_assignment_conversations SET customer_key=REPEAT('b',64) WHERE assignment_id=?",[assignment.assignmentId]);
    await expect(report()).rejects.toThrow();
  });
  it('staff evidence: keeps a concurrent message insertion out of the current snapshot',async()=>{
    await admin();const g=gate(),reading=report({pause:g.pause});try{await g.atRead;await staffMessage();}finally{g.resume();}
    const old=await reading,next=await report();expect(staff(old).customersWithRecordedStaffMessages).toBe(0);expect(staff(next).customersWithRecordedStaffMessages).toBe(1);
    expect(next.evidenceSetDigest).not.toBe(old.evidenceSetDigest);
  });
  it('staff evidence: keeps identity and message retention in the same snapshot',async()=>{
    await admin();await staffMessage();const g=gate(),reading=report({pause:g.pause});try{await g.atRead;await query('DELETE FROM conversations WHERE id=?',[conversationId]);}finally{g.resume();}
    expect(staff(await reading)).toMatchObject({customersWithRecordedStaffMessages:1,customersWithUnavailableConversationIdentity:0});
    expect(staff(await report())).toMatchObject({customersWithRecordedStaffMessages:0,customersWithUnavailableConversationIdentity:1});
  });
  it('staff evidence: preserves second precision ambiguity at both millisecond observation boundaries',async()=>{
    await admin();const s={...assignment.snapshot,assignedAt:new Date(Date.parse(assignment.snapshot.assignedAt)+500).toISOString(),
      observationEndsAt:new Date(Date.parse(assignment.snapshot.observationEndsAt)+500).toISOString()};
    await query('UPDATE ai_sales_experiment_assignments SET snapshot=?,assignment_digest=?,observation_ends_at=? WHERE id=?',
      [JSON.stringify(s),hash(s),s.observationEndsAt.slice(0,23).replace('T',' '),assignment.assignmentId]);
    await staffMessage('merchant',conversationId,'outgoing',Math.floor(Date.parse(s.assignedAt)/1000));
    await staffMessage('unknown',conversationId,'outgoing',Math.floor(Date.parse(s.observationEndsAt)/1000));state.unix=Date.parse(s.decisionNotBefore)/1000;
    expect(staff(await report())).toMatchObject({customersWithRecordedStaffMessages:0,customersWithUnknownOutgoingMessages:0,customersWithBoundaryMessages:1,
      messages:{staffWithinWindow:0,unknownWithinWindow:0,staffAtBoundary:1,unknownAtBoundary:1}});
  });


});
