import { buildSalesExperimentReadout } from '../../../server/ai/sales-experiment-readout-contract';
import { readoutFixture,readoutDates } from '../../../server/tests/helpers/sales-readout';
import { policyArtifactDigest as hash } from '../../../server/ai/learning-policy-evaluation-bundle';
import { staffReadoutFact } from '../../../server/tests/helpers/staff-readout';

export const readoutModes=['mixed','empty','unmeasured','refund','late','pending','review','unassigned','huge','live','withdrawn','minimum','many',
  'exposure-before','exposure-at','exposure-flight','exposure-after','exposure-mock','exposure-regression','exposure-declined','exposure-pending',
  'outcome-mixed','bookings-only','before-decision','staff-mixed','staff-unknown','staff-missing','staff-boundary',
  'transport-mixed','transport-empty','transport-pending','transport-timing','transport-unbound','transport-synthetic'] as const;
export function salesReadoutFixture(mode:string='mixed'){
  const f=readoutFixture(),a=f.rows.assignments[0],c=f.capture(a);
  let readAt=readoutDates.read;
  if(mode==='outcome-mixed'){
    const b=f.assignment(2),d=f.assignment(3),refunded=f.capture(d,4);f.rows.assignments.push(b,d,f.assignment(4,'candidate'));
    f.rows.payments=[c,f.refund(c),f.capture(a,2,{currency:'USD'}),f.capture(b,3,{targetKind:'booking'}),refunded,f.refund(refunded)];
  }
  else if(mode==='bookings-only')f.rows.payments=[f.capture(a,1,{targetKind:'booking'})];
  else if(mode==='before-decision'){f.rows.payments=[c];readAt=new Date(Date.parse(f.protocol.protocol.design.window.decisionNotBefore)-1).toISOString();}
  else if(mode.startsWith('exposure-')){
    const b=f.assignment(2,'candidate');f.rows.assignments.push(b,f.assignment(3,'candidate'));f.rows.payments=[f.capture(b)];
    const [start,accept]=mode==='exposure-at'?[-1,0]:mode==='exposure-flight'?[-1,1]:mode==='exposure-after'?[1,2]:mode==='exposure-regression'?[-1,-2]:[-2,-1];
    const e=f.exposure(b,1,start,accept,mode==='exposure-mock'?{provider:'mock'}:mode==='exposure-declined'?{styleApplied:false,styleReason:'customer_declined'}:{});
    f.rows.exposures.push(e.row);f.rows.deliveries.push(e.delivery);
    if(mode==='exposure-pending'){const refund=f.refund(f.rows.payments[0]);Object.assign(refund,{attribution_state:'pending',attribution:null,attribution_digest:null});f.rows.payments.push(refund);}
  }
  else if(mode==='empty')f.rows.assignments=[];
  else if(mode==='unmeasured'){}
  else if(mode==='huge')f.rows.payments=[f.capture(a,1,{amountMinor:Number.MAX_SAFE_INTEGER})];
  else if(mode==='many')f.rows.payments=Array.from({length:15},(_,i)=>f.capture(a,i+1,{currency:'AA'+String.fromCharCode(65+i)}));
  else if(mode==='refund')f.rows.payments=[c,f.refund(c)];
  else if(mode==='late')f.rows.payments=[c,f.refund(c,f.protocol.protocol.design.window.decisionNotBefore)];
  else if(['pending','review','unassigned'].includes(mode)){
    const r:any=f.refund(c);Object.assign(r,{attribution_state:mode,attribution:null,attribution_digest:null});f.rows.payments=[c,r];
  }else if(mode==='live'){readAt=readoutDates.paid;f.rows.payments=[c];}
  else if(mode==='minimum')f.rows.assignments=Array.from({length:4000},(_,i)=>f.assignment(i+1,i%2?'candidate':'baseline'));
  else{
    const b=f.assignment(2,'candidate');f.rows.assignments.push(b,f.assignment(3));
    const cp=f.capture(b,2),usd=f.capture(a,3,{currency:'USD',targetKind:'booking'});
    f.rows.payments=[c,cp,usd,f.refund(cp),f.refund(c,f.protocol.protocol.design.window.decisionNotBefore)];
    for(const e of [f.exposure(a,1),f.exposure(b,2,-1,1)]){f.rows.exposures.push(e.row);f.rows.deliveries.push(e.delivery);}
  }
  if(mode==='withdrawn'){
    const s={version:'sales-experiment-withdrawal.v1',merchantId:1,protocolId:4,protocolDigest:f.protocol.protocol_digest,
      reason:'Withdraw the synthetic experiment without claiming a winning policy.',winner:null};
    f.protocol.state='withdrawn';f.rows.withdrawals=[{merchant_id:1,protocol_id:4,withdrawal:s,withdrawal_digest:hash(s)}];
  }
  f.rows.conversationBindings=f.rows.assignments.map(a=>f.binding(a));
  if(mode==='staff-mixed'||mode==='mixed'){
    f.rows.conversationBindings.push(f.binding(a,99));
    f.rows.staffMessages=[f.staffMessage(),f.staffMessage(2,99),f.staffMessage(3,2,'unknown')];
  }
  if(mode==='staff-unknown')f.rows.staffMessages=[f.staffMessage(1,1,'unknown')];
  if(mode==='staff-missing'){
    Object.assign(f.rows.conversationBindings[0],{current_conversation_id:null,current_customer_phone:null});
  }
  if(mode==='staff-boundary'){
    a.snapshot.assignedAt='2026-09-03T00:00:01.500Z';a.snapshot.observationEndsAt='2026-09-17T00:00:01.500Z';
    a.observation_utc=a.snapshot.observationEndsAt;a.assignment_digest=hash(a.snapshot);
    f.rows.payments=[];f.rows.exposures=[];f.rows.deliveries=[];
    f.rows.staffMessages=[f.staffMessage(1,1,'merchant','2026-09-03T00:00:01.000Z'),f.staffMessage(2,1,'unknown','2026-09-17T00:00:01.000Z')];
  }
  if(mode==='mixed'||mode.startsWith('transport-')){
    f.rows.staffAcceptances=[staffReadoutFact(a,1,'dashboard_text'),staffReadoutFact(a,2,'dashboard_voice'),staffReadoutFact(f.rows.assignments[1],3,'escalation_relay')];
    if(mode==='transport-empty'){f.rows.staffAcceptances=[];f.rows.payments=[];}
    if(mode==='transport-pending'){const r:any=f.refund(c);Object.assign(r,{attribution_state:'pending',attribution:null,attribution_digest:null});f.rows.payments=[c,r];}
    if(mode==='transport-timing')f.rows.staffAcceptances=[staffReadoutFact(a,1,'dashboard_voice',{reservedAt:'2026-09-02T00:00:00.000Z',acceptedAt:readoutDates.paid})];
    if(mode==='transport-unbound')f.rows.staffAcceptances=[staffReadoutFact(a,1,'dashboard_text',{conversationId:99})];
    if(mode==='transport-synthetic')f.rows.staffAcceptances=[staffReadoutFact(a,1,'dashboard_text',{provider:'mock'})];
  }
  return {...buildSalesExperimentReadout({merchantId:1,protocolId:4},f.rows,readAt),consistency:'single_database_snapshot' as const};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/sales-experiment-readout-data.ts')){
  process.stdout.write(JSON.stringify(Object.fromEntries(readoutModes.map(mode=>[mode,salesReadoutFixture(mode)]))));
}
