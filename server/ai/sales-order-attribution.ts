import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertSalesOrderFactSchema } from './sales-order-facts';
import { loadSalesExperimentAssignment,SalesExperimentAssignmentConflict } from './sales-experiment-assignment';
import { loadSalesExperimentProtocol,SalesExperimentProtocolConflict } from './sales-experiment-protocol';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesOrderFact,salesOrderAttribution,SalesOrderEvidenceConflict } from './sales-order-fact-contract';
const id=z.number().int().positive().safe();
const conflict=():never=>{throw new SalesOrderEvidenceConflict();};
async function bind(c:PoolConnection,row:any) {
  const f=readSalesOrderFact(row),s=f.snapshot;if(!s.customerKey)return null;
  const [candidates]=await c.execute<any[]>(`SELECT id FROM ai_sales_experiment_assignments
    WHERE merchant_id=? AND customer_key=? ORDER BY id LIMIT 101 FOR SHARE`,[s.merchantId,s.customerKey]);
  if(candidates.length>100)return conflict();
  const matches=[];
  for(const candidate of candidates){
    const a=await loadSalesExperimentAssignment(c,s.merchantId,Number(candidate.id));
    if(a.snapshot.customerKey!==s.customerKey)return conflict();
    if(Date.parse(a.snapshot.assignedAt)<=Date.parse(s.observedAt)&&Date.parse(s.observedAt)<Date.parse(a.snapshot.observationEndsAt))matches.push(a);
  }
  if(matches.length>1)return conflict();if(!matches.length)return null;
  const a=matches[0],as=a.snapshot,p=await loadSalesExperimentProtocol(c,s.merchantId,as.protocolId),ps=p.protocol,w=ps.design.window;
  if(as.protocolDigest!==p.protocolDigest||as.candidateId!==ps.candidate.id||as.artifactDigest!==ps.candidate.artifactDigest
    ||as.baselineDigest!==ps.candidate.baselineDigest||as.sectorDigest!==ps.sector.digest||as.enrollmentStartsAt!==w.enrollmentStartsAt
    ||as.enrollmentEndsAt!==w.enrollmentEndsAt||as.observationDays!==w.observationDays||as.decisionNotBefore!==w.decisionNotBefore)return conflict();
  return salesOrderAttribution.parse({version:'sales-order-attribution.v1',merchantId:s.merchantId,factId:f.factId,factDigest:f.factDigest,
    quotationId:s.quotationId,orderKey:s.orderKey,assignmentId:a.assignmentId,assignmentDigest:a.assignmentDigest,
    protocolId:as.protocolId,protocolDigest:as.protocolDigest,customerKey:s.customerKey,arm:as.arm,artifactDigest:as.artifactDigest,
    baselineDigest:as.baselineDigest,sectorDigest:as.sectorDigest,assignedAt:as.assignedAt,observedAt:s.observedAt,observationEndsAt:as.observationEndsAt,
    scope:'intention_to_treat_only',outcome:'order_created_only',revenueMinor:null,humanAssistance:'unmeasured',winner:null});
}
/** Isolated SQL projection. A quarantined analysis never reverses an order or creates another provider request. */
export async function attributeSalesOrderFact(merchantId:number,factId:number) {
  const merchant=id.parse(merchantId),fact=id.parse(factId);await assertSalesOrderFactSchema();
  const pool=await getPool();if(!pool)throw Error('Order attribution unavailable');
  const c=await pool.getConnection();let reusable=true,attempted=false;
  try{
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await c.beginTransaction();
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
    const [rows]=await c.execute<any[]>(`SELECT * FROM ai_sales_order_facts WHERE merchant_id=? AND id=?
      AND attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3) FOR UPDATE`,[merchant,fact]);
    if(!rows.length){await c.rollback();return 'skipped' as const;}attempted=true;
    if(Number(rows[0].attempts)>=8)return conflict();
    const attribution=await bind(c,rows[0]),state=attribution?'attributed':'unassigned';
    await c.execute(`UPDATE ai_sales_order_facts SET attribution_state=?,attribution_digest=?,attribution=?,attempts=attempts+1,
      next_at=NULL,last_error=NULL WHERE merchant_id=? AND id=?`,[state,attribution?hash(attribution):null,attribution?JSON.stringify(attribution):null,merchant,fact]);
    try{await c.commit();}catch(error){reusable=false;c.destroy();throw error;}
    return state as 'attributed'|'unassigned';
  }catch(error){
    if(reusable){try{await c.rollback();}catch{reusable=false;c.destroy();}}
    if(!attempted)throw error;
    const terminal=error instanceof SalesOrderEvidenceConflict||error instanceof z.ZodError
      ||error instanceof SalesExperimentAssignmentConflict||error instanceof SalesExperimentProtocolConflict;
    const [result]=await pool.execute<any>(`UPDATE ai_sales_order_facts SET attribution_state=IF(? OR attempts>=7,'review','pending'),
      next_at=IF(? OR attempts>=7,NULL,TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(attempts,7))),UTC_TIMESTAMP(3))),
      last_error=?,attempts=LEAST(8,attempts+1) WHERE merchant_id=? AND id=? AND attribution_state='pending'`,
    [terminal,terminal,terminal?'evidence_unavailable':'projection_unavailable',merchant,fact]);
    return Number(result.affectedRows)?'deferred' as const:'skipped' as const;
  }finally{if(reusable)c.release();}
}
export async function runSalesOrderAttributionBatch(limit=10){
  if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error('Invalid order attribution batch');
  await assertSalesOrderFactSchema();const pool=await getPool();if(!pool)throw Error('Order attribution unavailable');
  const [rows]=await pool.execute<any[]>(`SELECT id,merchant_id FROM ai_sales_order_facts
    WHERE attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3) ORDER BY next_at,id LIMIT ${limit}`);
  const result={selected:rows.length,attributed:0,unassigned:0,deferred:0,skipped:0};
  for(const row of rows){try{result[await attributeSalesOrderFact(Number(row.merchant_id),Number(row.id))]++;}catch{result.deferred++;}}
  return result;
}
export class SalesOrderHealthAccessDenied extends Error {}
export async function salesOrderAttributionHealth(actorUserId:number){
  if(!id.safeParse(actorUserId).success)throw new SalesOrderHealthAccessDenied();
  const pool=await getPool();if(!pool)throw Error('Order attribution unavailable');
  const [actors]=await pool.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active'",[actorUserId]);
  if(actors.length!==1)throw new SalesOrderHealthAccessDenied();await assertSalesOrderFactSchema();
  const [rows]=await pool.execute<any[]>(`SELECT attribution_state AS status,COUNT(*) AS count,
    SUM(attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3)) AS due FROM ai_sales_order_facts GROUP BY attribution_state`);
  return rows.map(r=>({status:String(r.status),count:Number(r.count),due:Number(r.due)}));
}
export async function startSalesOrderAttributionWorker(){
  await assertSalesOrderFactSchema();let stopped=false,active:Promise<unknown>|undefined;
  const tick=()=>{if(stopped||active)return;active=runSalesOrderAttributionBatch().then(r=>{
    if(r.deferred)console.warn('[SalesOrderAttribution] Local evidence needs recovery',{count:r.deferred});
  }).catch(()=>console.error('[SalesOrderAttribution] Local recovery deferred')).finally(()=>{active=undefined;});};
  const timer=setInterval(tick,60_000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await active;};
}
