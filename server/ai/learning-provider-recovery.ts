import { randomUUID } from 'node:crypto';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { loadLearningProviderRecovery, type LearningAnalysisClaim } from './learning-analysis-jobs';
import { saveLearningProviderResponse } from './learning-response-handoff';
import { retrieveZahyPiLearningJob } from './zahypi-client';
import { settleAiProviderUsage } from './budget-settlement';

export async function assertLearningProviderRecoverySchema() {
  await assertRuntimeSchema('learning provider recovery', [{table:'ai_learning_analysis_jobs',
    columns:['provider_receipt','ai_reservation_key','recovery_token','recovery_lease_until','recovery_next_at','recovery_attempts','recovery_last_error'],
    uniqueIndexes:[{name:'PRIMARY',columns:['merchant_id']},{name:'uq_learning_ai_reservation',columns:['ai_reservation_key']}]}]);
}
export async function claimLearningProviderRecoveries(limit = 5): Promise<LearningAnalysisClaim[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw Error('Invalid provider recovery batch');
  await assertLearningProviderRecoverySchema();
  const pool = await getPool(); if (!pool) throw Error('Learning provider recovery unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<any[]>(`SELECT merchant_id,claim_token,source_digest FROM ai_learning_analysis_jobs
      WHERE state IN ('dispatched','uncertain') AND provider_receipt IS NOT NULL AND ai_reservation_key IS NOT NULL
      AND recovery_next_at<=UTC_TIMESTAMP(3) AND (recovery_lease_until IS NULL OR recovery_lease_until<=UTC_TIMESTAMP(3))
      ORDER BY recovery_next_at,merchant_id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const claims: LearningAnalysisClaim[] = [];
    for (const row of rows) {
      const token = randomUUID();
      await c.execute(`UPDATE ai_learning_analysis_jobs SET recovery_token=?,recovery_lease_until=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),
        recovery_next_at=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),recovery_attempts=LEAST(recovery_attempts+1,1000000) WHERE merchant_id=?`, [token,row.merchant_id]);
      claims.push({merchantId:row.merchant_id,token:row.claim_token,digest:row.source_digest,recoveryToken:token});
    }
    await c.commit(); return claims;
  } catch(error) { try { await c.rollback(); } catch { /* A lost lease acknowledgement delays a read, never repeats a generation. */ } throw error; }
  finally { c.release(); }
}
async function release(claim: LearningAnalysisClaim, saved: boolean) {
  if (!claim.recoveryToken) return;
  const pool = await getPool(); if (!pool) throw Error('Learning provider recovery unavailable');
  await pool.execute(`UPDATE ai_learning_analysis_jobs SET recovery_token=NULL,recovery_lease_until=NULL,
    recovery_next_at=IF(state='responded',UTC_TIMESTAMP(3),TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(recovery_attempts,7))),UTC_TIMESTAMP(3))),
    recovery_last_error=? WHERE merchant_id=? AND claim_token=? AND source_digest=? AND recovery_token=?
    AND state IN ('dispatched','uncertain','responded') AND recovery_lease_until>UTC_TIMESTAMP(3)`, [saved?null:'provider_lookup_deferred',claim.merchantId,claim.token,claim.digest,claim.recoveryToken]);
}
/** Recover by GET only, outside SQL locks. The existing SQL worker projects and never sends notifications. */
export async function recoverLearningProviderResult(claim: LearningAnalysisClaim) {
  try {
    const saved = await loadLearningProviderRecovery(claim); if (!saved) return 'skipped' as const;
    const response = await retrieveZahyPiLearningJob(saved.receipt);
    if (!response) { await release(claim,false); return 'deferred' as const; }
    const content = response.choices[0]?.message.content;
    if (typeof content !== 'string' || !response.usage) throw Error('Learning provider recovery unavailable');
    const analysis = await saveLearningProviderResponse(claim,content,saved.attempt);
    // Settlement uses the original quote; failures leave funds held and do not discard a saved response.
    if (analysis) {
      try { await settleAiProviderUsage(saved.attempt,response.usage); } catch { /* Persisted usage is recovered by the independent settlement worker. */ }
    }
    await release(claim,Boolean(analysis)); return analysis?'saved' as const:'skipped' as const;
  } catch {
    await release(claim,false); return 'deferred' as const;
  }
}
export async function runLearningProviderRecoveryBatch() {
  const claims = await claimLearningProviderRecoveries(), result = {claimed:claims.length,saved:0,skipped:0,deferred:0};
  for (const claim of claims) { try { result[await recoverLearningProviderResult(claim)]++; } catch { result.deferred++; } }
  return result;
}
export async function startLearningProviderRecoveryWorker() {
  await assertLearningProviderRecoverySchema();
  let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = runLearningProviderRecoveryBatch().catch(() => console.error('[LearningProviderRecovery] Accepted results remain pending'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick,60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
