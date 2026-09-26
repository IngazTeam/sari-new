import {trySendDashboardStaff} from './staff-dashboard-reply';
import {trySendDashboardVoice} from './staff-dashboard-voice';
import {staffReadoutFact} from '../tests/helpers/staff-readout';
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
const transport=vi.hoisted(()=>({send:vi.fn(),upload:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:transport.send})}));
vi.mock('../storage',()=>({storagePut:transport.upload}));
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
describe.skipIf(!process.env.DATABASE_URL)('staff transport readout through durable sends and real MySQL', () => {
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
    await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)",[owner.merchantId,'staff-readout-'+owner.merchantId]);
    transport.send.mockReset().mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:'synthetic-'+randomUUID()}));
    transport.upload.mockReset().mockImplementation(async(key:string)=>({key,url:'https://media.example.test/'+key}));
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

  const sendText=()=>trySendDashboardStaff(owner.merchantId,owner.userId,{conversationId,requestId:randomUUID(),message:'Synthetic staff reply'});
  const sendVoice=()=>trySendDashboardVoice(owner.merchantId,owner.userId,{conversationId,requestId:randomUUID(),audioBase64:Buffer.from('OggSsynthetic-audio').toString('base64'),mimeType:'audio/ogg',duration:1.5});
  const transportFacts=()=>query('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const summary=async()=> (await report()).staffTransportEvidence;
  it('reads real persisted dashboard text and voice acceptances without any new send or upload',async()=>{
    expect(await sendText()).toMatchObject({success:true});state.unix!++;expect(await sendVoice()).toMatchObject({success:true});await admin();
    const r=await summary();expect(r.arms[0]).toMatchObject({customersWithEligibleAcceptance:1,receipts:{eligible:2},eligibleSources:{dashboard_text:1,dashboard_voice:1}});
    const before=await transportFacts();await report();expect(await transportFacts()).toEqual(before);expect(transport.send).toHaveBeenCalledTimes(2);expect(transport.upload).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
  });
  it('compares actual reply acceptance and canonical payment capture without attributing a sale to the reply',async()=>{
    await sendVoice();state.unix!++;await capture();await attribute();await admin();const r=await report();
    expect(r.staffTransportEvidence.arms[0].firstCapture).toMatchObject({customers:1,acceptanceBefore:1});expect(r.humanAssistance).toBe('unmeasured');expect(r.winner).toBeNull();
  });
  it('withholds chronology for a late unresolved refund while preserving the acceptance denominator',async()=>{
    await sendText();state.unix!++;const p=await capture();await attribute();await admin();expect((await summary()).arms[0].firstCapture?.acceptanceBefore).toBe(1);
    state.unix!++;await applyTapOrderPaymentState({...p,providerStatus:'REFUNDED'});const r=await summary();expect(r.chronologyStatus).toBe('unresolved_attribution');expect(r.arms[0]).toMatchObject({customersWithEligibleAcceptance:1,firstCapture:null});
  });
  it('retains acceptance after original text, voice, message, outbox and conversation deletion',async()=>{
    await sendText();await sendVoice();await admin();const before=await summary();
    await query('DELETE FROM ai_sales_staff_replies WHERE merchant_id=?',[owner.merchantId]);await query('DELETE FROM ai_sales_staff_voices WHERE merchant_id=?',[owner.merchantId]);
    await query('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]);await query('DELETE FROM conversations WHERE id=?',[conversationId]);
    expect(await summary()).toEqual(before);expect((await report()).staffEvidence.arms[0].customersWithUnavailableConversationIdentity).toBe(1);
  });
  it('uses the frozen identity after a current phone change',async()=>{
    await sendText();await admin();await query("UPDATE conversations SET customerPhone='966599999888' WHERE id=?",[conversationId]);
    expect((await summary()).arms[0].customersWithEligibleAcceptance).toBe(1);expect((await report()).staffEvidence.arms[0].customersWithUnavailableConversationIdentity).toBe(1);
  });
  it('does not infer a missing registered conversation binding from a matching phone',async()=>{
    await sendVoice();await admin();await query('DELETE FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=?',[owner.merchantId]);
    expect((await summary()).arms[0]).toMatchObject({customersWithEligibleAcceptance:0,receipts:{unbound:1}});
  });
  it('keeps a concurrent acceptance outside the current SQL snapshot',async()=>{
    await admin();const g=gate(),reading=report({pause:g.pause});await g.atRead;
    try{await sendText();}finally{g.resume();}
    expect((await reading).staffTransportEvidence.merchantLedgerFacts).toBe(0);expect((await summary()).merchantLedgerFacts).toBe(1);
  });
  it('does not erase acceptance from an earlier snapshot during concurrent source/ledger deletion',async()=>{
    await sendVoice();await admin();const g=gate(),reading=report({pause:g.pause});await g.atRead;
    try{await query('DELETE FROM ai_sales_staff_acceptances WHERE merchant_id=?',[owner.merchantId]);}finally{g.resume();}
    expect((await reading).staffTransportEvidence.merchantLedgerFacts).toBe(1);expect((await summary()).merchantLedgerFacts).toBe(0);
  });
  it.each(['dashboard_text','dashboard_voice'] as const)('fails closed on persisted %s snapshot corruption',async source=>{
    if(source==='dashboard_text')await sendText();else await sendVoice();await admin();
    await query("UPDATE ai_sales_staff_acceptances SET snapshot=JSON_SET(snapshot,'$.scope','staff_assisted_sale') WHERE merchant_id=?",[owner.merchantId]);await expect(report()).rejects.toThrow();
  });
  it('keeps legacy message projections outside the acceptance ledger',async()=>{
    await admin();await query("INSERT INTO messages (conversationId,direction,messageType,content,sender_type,createdAt) VALUES (?,'outgoing','text','Legacy staff','merchant',?)",[conversationId,new Date(state.unix!*1000)]);
    const r=await report();expect(r.staffEvidence.arms[0].customersWithRecordedStaffMessages).toBe(1);expect(r.staffTransportEvidence.merchantLedgerFacts).toBe(0);
  });
  it('reads a persisted synthetic escalation snapshot with the same contract as the other two sources',async()=>{
    const f=staffReadoutFact(assignment,999,'escalation_relay',{reservedAt:new Date(state.unix!*1000).toISOString(),acceptedAt:new Date(state.unix!*1000).toISOString()});
    await query("INSERT INTO ai_sales_staff_acceptances (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [owner.merchantId,f.source_kind,f.source_id,f.customer_key,f.outbox_id,f.provider_message_digest,f.acceptance_digest,JSON.stringify(f.snapshot),f.acceptance_observed_at]);await admin();
    expect((await summary()).arms[0].eligibleSources.escalation_relay).toBe(1);
  });
});
