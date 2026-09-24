import { randomUUID } from 'node:crypto';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { resumeLearningAnalysis } from './learning-analysis-jobs';
import { persistLearningAnalysis } from './learning-analysis';
import type { LearningAnalysisStatus } from '../../shared/learning-analysis-status';

export const learningRecoverySchema = [{ table:'ai_learning_analysis_jobs',
  columns:['recovery_token','recovery_lease_until','recovery_next_at','recovery_attempts','recovery_last_error','recovered_at'],
  uniqueIndexes:[{name:'PRIMARY',columns:['merchant_id']}] }];
export async function assertLearningRecoverySchema() { await assertRuntimeSchema('learning response recovery',learningRecoverySchema); }
export type LearningRecoveryClaim = { merchantId:number; token:string; claimToken:string; digest:string };

/** Claims touch only the job row and commit before acquiring any source/merchant lock. */
export async function claimLearningRecoveries(limit = 20): Promise<LearningRecoveryClaim[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid learning recovery batch size');
  await assertLearningRecoverySchema();
  const pool=await getPool(); if(!pool)throw Error('Learning recovery storage unavailable');
  const c=await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows]=await c.execute<any[]>(`SELECT merchant_id,claim_token,source_digest FROM ai_learning_analysis_jobs
      WHERE state='responded' AND recovery_next_at<=UTC_TIMESTAMP(3)
      AND (recovery_lease_until IS NULL OR recovery_lease_until<=UTC_TIMESTAMP(3))
      ORDER BY recovery_next_at,merchant_id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const claims:LearningRecoveryClaim[]=[];
    for(const row of rows){
      const token=randomUUID();
      await c.execute(`UPDATE ai_learning_analysis_jobs SET recovery_token=?,recovery_lease_until=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),
        recovery_next_at=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),recovery_attempts=LEAST(recovery_attempts+1,1000000)
        WHERE merchant_id=?`,[token,row.merchant_id]);
      claims.push({merchantId:row.merchant_id,token,claimToken:row.claim_token,digest:row.source_digest});
    }
    await c.commit();return claims;
  }catch(error){try{await c.rollback();}catch{/* A lost claim acknowledgement only delays local recovery. */}throw error;}
  finally{c.release();}
}

/** SQL projection only: never import the learning engine, provider, notifications or customer transports here. */
export async function recoverClaimedLearningAnalysis(claim:LearningRecoveryClaim) {
  try {
    const ready=await resumeLearningAnalysis(claim.merchantId,claim);
    if(ready.status!=='responded')return 'skipped' as const;
    const result=await persistLearningAnalysis(ready.snapshot,ready.analysis,ready.claim);
    return result.status==='applied'?'applied' as const:'skipped' as const;
  }catch{
    // Conditional on both identities: an old worker must not postpone a newer task.
    const pool=await getPool();
    if(!pool)throw Error('Learning recovery storage unavailable');
    const [changed]=await pool.execute<any>(`UPDATE ai_learning_analysis_jobs SET recovery_token=NULL,recovery_lease_until=NULL,
      recovery_next_at=TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(recovery_attempts,7))),UTC_TIMESTAMP(3)),
      recovery_last_error='projection_unavailable' WHERE merchant_id=? AND state='responded'
      AND recovery_token=? AND claim_token=? AND source_digest=?`,[claim.merchantId,claim.token,claim.claimToken,claim.digest]);
    return changed.affectedRows===1?'deferred' as const:'skipped' as const;
  }
}
export async function runLearningRecoveryBatch() {
  const claims=await claimLearningRecoveries(),result={claimed:claims.length,applied:0,skipped:0,deferred:0};
  for(const claim of claims){
    try{result[await recoverClaimedLearningAnalysis(claim)]++;}
    catch{result.deferred++;} // A database outage leaves the lease available for later expiry.
  }
  return result;
}
export async function startLearningRecoveryWorker() {
  await assertLearningRecoverySchema();
  let stopped=false,active:Promise<unknown>|undefined;
  const tick=()=>{
    if(stopped||active)return;
    active=runLearningRecoveryBatch().catch(()=>console.error('[LearningRecovery] Saved results remain pending'))
      .finally(()=>{active=undefined;});
  };
  const timer=setInterval(tick,60_000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await active;};
}

/** Whitelist only operational metadata. No response, prompt, source IDs, digests, tokens or raw errors. */
export async function getLearningAnalysisStatus(merchantId:number):Promise<LearningAnalysisStatus> {
  if(!Number.isSafeInteger(merchantId)||merchantId<=0)throw Error('Invalid learning merchant');
  await assertLearningRecoverySchema();
  const pool=await getPool();if(!pool)throw Error('Learning status unavailable');
  const [rows]=await pool.execute<any[]>(`SELECT state,failure_code,updated_at,lease_until,recovery_next_at,recovery_attempts,proposal_count,
    recovery_lease_until>UTC_TIMESTAMP(3) AS recovering,recovery_next_at>UTC_TIMESTAMP(3) AS deferred
    FROM ai_learning_analysis_jobs WHERE merchant_id=?`,[merchantId]);
  const row=rows[0];if(!row)return{state:'idle',updatedAt:null,nextAttemptAt:null,recoveryAttempts:0,proposalCount:null};
  let state:LearningAnalysisStatus['state'];
  switch(row.state){
    case 'reserved':state=row.failure_code==='budget_admission_denied'?'budget_wait':'preparing';break;
    case 'dispatched':state='awaiting_result';break;
    case 'uncertain':case 'applied':case 'stale':case 'invalid':state=row.state;break;
    case 'responded':state=row.recovering?'recovering':row.deferred&&row.recovery_attempts>0?'retry_scheduled':'saved';break;
    default:throw Error('Unsupported learning status');
  }
  const next=state==='budget_wait'?row.lease_until:['saved','recovering','retry_scheduled'].includes(state)?row.recovery_next_at:null;
  return{state,updatedAt:new Date(row.updated_at).toISOString(),nextAttemptAt:next?new Date(next).toISOString():null,
    recoveryAttempts:Number(row.recovery_attempts),proposalCount:state==='applied'?Number(row.proposal_count):null};
}
