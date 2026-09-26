import { buildSalesExperimentReadout } from '../../../server/ai/sales-experiment-readout-contract';
import { readoutFixture,readoutDates } from '../../../server/tests/helpers/sales-readout';

export const readoutModes=['mixed','empty','unmeasured','refund','late','pending','review','unassigned','huge','live','withdrawn','minimum','many',
  'exposure-before','exposure-at','exposure-flight','exposure-after','exposure-mock','exposure-regression','exposure-declined','exposure-pending'] as const;
export function salesReadoutFixture(mode:string='mixed'){
  const f=readoutFixture(),a=f.rows.assignments[0],c=f.capture(a);
  let readAt=readoutDates.read;
  if(mode.startsWith('exposure-')){
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
  const result={...buildSalesExperimentReadout({merchantId:1,protocolId:4},f.rows,readAt),consistency:'single_database_snapshot' as const};
  // Display-only state variant: production withdrawal evidence is verified in SQL tests.
  if(mode==='withdrawn')result.protocolState='withdrawn';
  return result;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/sales-experiment-readout-data.ts')){
  process.stdout.write(JSON.stringify(Object.fromEntries(readoutModes.map(mode=>[mode,salesReadoutFixture(mode)]))));
}
