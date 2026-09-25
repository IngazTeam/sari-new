import { randomUUID } from 'node:crypto';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { loadSalesGenerationRecovery, saveSalesGenerationResponse, reconcileSalesGenerationReservations, type SalesGenerationClaim } from './sales-experiment-generation';
import { retrieveZahyPiReplyJob } from './zahypi-client';
import { persistAiProviderUsage, settleAiProviderUsage } from './budget-settlement';

export async function assertSalesGenerationRecoverySchema() {
  await assertRuntimeSchema('sales generation recovery', [{ table: 'ai_sales_experiment_generations',
    columns: ['expected_reservation_key', 'provider_receipt', 'provider_receipt_digest', 'recovery_token', 'recovery_lease_until', 'recovery_next_at', 'recovery_attempts', 'recovery_last_error'],
    uniqueIndexes: [{ name: 'PRIMARY', columns: ['id'] }, { name: 'uq_sales_generation_reservation', columns: ['reservation_key'] },
      { name: 'uq_sales_generation_expected_reservation', columns: ['expected_reservation_key'] }] },
    { table: 'ai_sales_generation_output_reviews', columns: ['merchant_id', 'generation_id', 'actor_user_id', 'revision', 'request_id',
      'payload_digest', 'basis_digest', 'review_digest', 'snapshot', 'outcome'],
      uniqueIndexes: [{ name: 'uq_sales_reply_review_request', columns: ['merchant_id', 'request_id'] },
        { name: 'uq_sales_reply_review_revision', columns: ['generation_id', 'revision'] }] }]);
}
export async function claimSalesGenerationRecoveries(limit = 5): Promise<SalesGenerationClaim[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw Error('Invalid sales recovery batch');
  await assertSalesGenerationRecoverySchema();
  const pool = await getPool(); if (!pool) throw Error('Sales generation recovery unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<any[]>(`SELECT id,merchant_id,claim_token,authorization_digest FROM ai_sales_experiment_generations
      WHERE state IN ('dispatching','uncertain') AND provider_receipt IS NOT NULL AND reservation_key IS NOT NULL
      AND (state='uncertain' OR lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))
      AND recovery_next_at<=UTC_TIMESTAMP(3) AND (recovery_lease_until IS NULL OR recovery_lease_until<=UTC_TIMESTAMP(3))
      ORDER BY recovery_next_at,id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const claims: SalesGenerationClaim[] = [];
    for (const row of rows) {
      const token = randomUUID();
      await c.execute(`UPDATE ai_sales_experiment_generations SET recovery_token=?,recovery_lease_until=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),
        recovery_next_at=TIMESTAMPADD(MINUTE,3,UTC_TIMESTAMP(3)),recovery_attempts=LEAST(recovery_attempts+1,1000000) WHERE id=?`, [token, row.id]);
      claims.push({ merchant: Number(row.merchant_id), generationId: Number(row.id), token: row.claim_token,
        authorizationDigest: row.authorization_digest, recoveryToken: token });
    }
    await c.commit(); return claims;
  } catch (error) { try { await c.rollback(); } catch { /* An uncertain claim delays a read; it never submits a job. */ } throw error; }
  finally { c.release(); }
}
async function release(claim: SalesGenerationClaim, saved: boolean) {
  const pool = await getPool(); if (!pool) throw Error('Sales generation recovery unavailable');
  await pool.execute(`UPDATE ai_sales_experiment_generations SET recovery_token=NULL,recovery_lease_until=NULL,
    recovery_next_at=IF(state IN ('responded','invalid'),NULL,TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(recovery_attempts,7))),UTC_TIMESTAMP(3))),
    recovery_last_error=? WHERE id=? AND merchant_id=? AND claim_token=? AND authorization_digest=? AND recovery_token=?
    AND recovery_lease_until>UTC_TIMESTAMP(3)`, [saved ? null : 'provider_lookup_deferred', claim.generationId, claim.merchant,
    claim.token, claim.authorizationDigest, claim.recoveryToken ?? null]);
}
/** GET only, outside SQL locks. Stores historical output and usage; cannot send or count an exposure. */
export async function recoverSalesGenerationResult(claim: SalesGenerationClaim) {
  try {
    const saved = await loadSalesGenerationRecovery(claim);
    if (!saved) { await release(claim, true); return 'skipped' as const; }
    const response = await retrieveZahyPiReplyJob(saved.receipt);
    if (!response) { await release(claim, false); return 'deferred' as const; }
    const choice = response.choices[0], content = choice?.message.content;
    if (typeof content !== 'string' || !content.trim() || !response.usage) throw Error('Sales generation recovery unavailable');
    // Persist usage before completing the generation. If this fails, the pending job remains
    // eligible for another GET; a saved response must not strand unrecorded settlement work.
    await persistAiProviderUsage(saved.attempt, response.usage);
    await saveSalesGenerationResponse(claim, saved.attempt, content.trim(), { id: response.id, model: response.model,
      finishReason: choice.finish_reason, usage: response.usage });
    try { await settleAiProviderUsage(saved.attempt, response.usage); } catch { /* Independent usage worker retains and retries settlement. */ }
    await release(claim, true); return 'saved' as const;
  } catch {
    await release(claim, false); return 'deferred' as const;
  }
}
export async function runSalesGenerationRecoveryBatch() {
  await reconcileSalesGenerationReservations();
  const claims = await claimSalesGenerationRecoveries(), result = { claimed: claims.length, saved: 0, skipped: 0, deferred: 0 };
  for (const claim of claims) { try { result[await recoverSalesGenerationResult(claim)]++; } catch { result.deferred++; } }
  return result;
}
export async function startSalesGenerationRecoveryWorker() {
  await assertSalesGenerationRecoverySchema();
  let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = runSalesGenerationRecoveryBatch().catch(() => console.error('[SalesGenerationRecovery] Accepted results remain pending'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
