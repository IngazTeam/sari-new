import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { AiBudgetError } from './budget-ledger';
import { learningEvidenceIds, parseLearningAnalysis, snapshotLearningSignals,
  type LearningAnalysis, type LearningAnalysisSnapshot } from './learning-analysis-contract';

export type LearningAnalysisClaim = { merchantId: number; token: string; digest: string };
type Row = { merchant_id: number; source_digest: string; source_ids: unknown; claim_token: string;
  state: string; lease_valid: number; response_json: unknown; response_hash: string | null };
type ClaimResult = { status: 'claimed'; claim: LearningAnalysisClaim }
  | { status: 'responded'; claim: LearningAnalysisClaim; snapshot: LearningAnalysisSnapshot; analysis: LearningAnalysis }
  | { status: 'blocked' | 'idle' | 'stale' };
const decode = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
export const learningResponseHash = (analysis: LearningAnalysis) => createHash('sha256').update(JSON.stringify(analysis)).digest('hex');
function identity(merchantId: number) { if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw Error('Invalid learning merchant'); }
function claimOf(row: Row): LearningAnalysisClaim { return { merchantId: row.merchant_id, token: row.claim_token, digest: row.source_digest }; }

async function transaction<T>(merchantId: number, work: (c: PoolConnection, row?: Row) => Promise<T>): Promise<T> {
  identity(merchantId);
  await assertRuntimeSchema('durable learning analysis', [{ table: 'ai_learning_analysis_jobs',
    columns: ['source_digest','source_ids','claim_token','state','lease_until','response_json','response_hash','failure_code','generation','proposal_count'],
    uniqueIndexes: [{ name:'PRIMARY',columns:['merchant_id'] }] }]);
  const pool = await getPool(); if (!pool) throw Error('Learning job storage unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [owners] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    if (!owners.length) throw Error('Learning merchant unavailable');
    const [rows] = await c.execute<any[]>(`SELECT *,lease_until>UTC_TIMESTAMP(3) AS lease_valid
      FROM ai_learning_analysis_jobs WHERE merchant_id=? FOR UPDATE`, [merchantId]);
    const result = await work(c, rows[0]);
    await c.commit(); return result;
  } catch (error) { try { await c.rollback(); } catch { /* Commit may already have succeeded. Never repeat a provider call. */ } throw error; }
  finally { c.release(); }
}

/** Source text is reconstructed from the original rows, never duplicated in a job snapshot. */
async function currentSnapshot(c: PoolConnection, merchantId: number, ids: number[], digest: string) {
  learningEvidenceIds(ids);
  const [rows] = await c.execute<any[]>(`SELECT s.* FROM sari_learning_signals s
    WHERE s.merchant_id=? AND s.id IN (${ids.map(() => '?').join(',')}) ORDER BY s.id FOR UPDATE`, [merchantId,...ids]);
  if (rows.length !== ids.length || rows.some(s => Number(s.analyzed) !== 0)) return null;
  const conversations = Array.from(new Set(rows.map(s => Number(s.conversation_id)))).sort((a,b) => a-b);
  const [owned] = await c.execute<any[]>(`SELECT id FROM conversations WHERE merchantId=?
    AND id IN (${conversations.map(() => '?').join(',')}) ORDER BY id FOR SHARE`, [merchantId,...conversations]);
  if (owned.length !== conversations.length) return null;
  const snapshot = snapshotLearningSignals(merchantId, rows);
  return snapshot.digest === digest ? snapshot : null;
}
async function terminal(c: PoolConnection, merchantId: number, state: 'stale' | 'invalid', code: string) {
  await c.execute(`UPDATE ai_learning_analysis_jobs SET state=?,failure_code=?,response_json=NULL,lease_until=NULL
    WHERE merchant_id=?`, [state,code,merchantId]);
}
async function recover(c: PoolConnection, row: Row): Promise<ClaimResult> {
  const ids = decode(row.source_ids) as number[];
  const snapshot = await currentSnapshot(c,row.merchant_id,ids,row.source_digest);
  if (!snapshot) { await terminal(c,row.merchant_id,'stale','source_changed'); return { status: 'stale' }; }
  let analysis: LearningAnalysis;
  try {
    analysis = parseLearningAnalysis(JSON.stringify(decode(row.response_json)),ids);
    if (learningResponseHash(analysis) !== row.response_hash) throw Error('Response digest mismatch');
  } catch { await terminal(c,row.merchant_id,'invalid','stored_response_invalid'); return { status: 'stale' }; }
  return { status:'responded', claim:claimOf(row), snapshot, analysis };
}

/** Recover saved responses before considering the current threshold or a different source sample. */
export async function resumeLearningAnalysis(merchantId: number): Promise<ClaimResult> {
  return transaction(merchantId, async (c,row) => {
    if (row?.state === 'responded') return recover(c,row);
    if (row && (['dispatched','uncertain'].includes(row.state) || (row.state === 'reserved' && row.lease_valid))) return { status:'blocked' };
    return { status:'idle' };
  });
}
export async function claimLearningAnalysis(snapshot: LearningAnalysisSnapshot): Promise<ClaimResult> {
  const checked = snapshotLearningSignals(snapshot.merchantId,snapshot.signals);
  if (checked.digest !== snapshot.digest) throw Error('Learning snapshot integrity mismatch');
  return transaction(snapshot.merchantId, async (c,row) => {
    if (row?.state === 'responded') return recover(c,row);
    if (row && (['dispatched','uncertain'].includes(row.state) || (row.state === 'reserved' && row.lease_valid))) return { status:'blocked' };
    if (row && row.state !== 'reserved' && row.source_digest === snapshot.digest) return { status:'blocked' };
    const ids = checked.signals.map(s=>s.id);
    if (!await currentSnapshot(c,snapshot.merchantId,ids,snapshot.digest)) return { status:'stale' };
    const token = randomUUID();
    await c.execute(`INSERT INTO ai_learning_analysis_jobs (merchant_id,source_digest,source_ids,claim_token,state,lease_until)
      VALUES (?,?,?,?,'reserved',TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)))
      ON DUPLICATE KEY UPDATE source_digest=VALUES(source_digest),source_ids=VALUES(source_ids),claim_token=VALUES(claim_token),
      state='reserved',lease_until=VALUES(lease_until),response_json=NULL,response_hash=NULL,failure_code=NULL,generation=NULL,
      proposal_count=NULL,created_at=UTC_TIMESTAMP(3)`,[snapshot.merchantId,snapshot.digest,JSON.stringify(ids),token]);
    return { status:'claimed', claim:{merchantId:snapshot.merchantId,token,digest:snapshot.digest} };
  });
}
function matches(row: Row | undefined, claim: LearningAnalysisClaim) {
  return row?.claim_token === claim.token && row?.source_digest === claim.digest;
}
/** Commit dispatch intent before calling the provider. Expired RESERVED work alone may be reclaimed. */
export async function dispatchLearningAnalysis(claim: LearningAnalysisClaim): Promise<boolean> {
  return transaction(claim.merchantId,async(c,row)=>{
    if (!matches(row,claim) || row!.state !== 'reserved' || !row!.lease_valid) return false;
    if (!await currentSnapshot(c,claim.merchantId,decode(row!.source_ids),claim.digest)) {
      await terminal(c,claim.merchantId,'stale','source_changed'); return false;
    }
    await c.execute("UPDATE ai_learning_analysis_jobs SET state='dispatched',lease_until=NULL WHERE merchant_id=?",[claim.merchantId]);
    return true;
  });
}
export async function storeLearningResponse(claim: LearningAnalysisClaim, response: string): Promise<LearningAnalysis | null> {
  return transaction(claim.merchantId,async(c,row)=>{
    if (!matches(row,claim) || !['dispatched','uncertain'].includes(row!.state)) return null;
    const ids = decode(row!.source_ids) as number[];
    if (!await currentSnapshot(c,claim.merchantId,ids,claim.digest)) { await terminal(c,claim.merchantId,'stale','source_changed'); return null; }
    let analysis: LearningAnalysis;
    try { analysis = parseLearningAnalysis(response,ids); }
    catch { await terminal(c,claim.merchantId,'invalid','invalid_response'); return null; }
    await c.execute(`UPDATE ai_learning_analysis_jobs SET state='responded',response_json=?,response_hash=?,failure_code=NULL
      WHERE merchant_id=?`,[JSON.stringify(analysis),learningResponseHash(analysis),claim.merchantId]);
    return analysis;
  });
}
export async function markLearningDispatchUncertain(claim: LearningAnalysisClaim) {
  await transaction(claim.merchantId,async(c,row)=>{
    if (matches(row,claim) && row!.state === 'dispatched') await c.execute(`UPDATE ai_learning_analysis_jobs
      SET state='uncertain',failure_code='provider_outcome_unknown' WHERE merchant_id=?`,[claim.merchantId]);
  });
}

/** Only these typed budget codes are guaranteed to precede transport. Other errors may follow billing. */
export async function recordLearningProviderFailure(claim: LearningAnalysisClaim, error: unknown) {
  if (!(error instanceof AiBudgetError) || !['budget_exceeded','price_required','policy_required','identity_required'].includes(error.code)) {
    await markLearningDispatchUncertain(claim); return;
  }
  await transaction(claim.merchantId,async(c,row)=>{
    if (matches(row,claim) && row!.state === 'dispatched') await c.execute(`UPDATE ai_learning_analysis_jobs
      SET state='reserved',claim_token=?,lease_until=TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3)),failure_code='budget_admission_denied'
      WHERE merchant_id=?`,[randomUUID(),claim.merchantId]);
  });
}
export class LearningProjectionRejected extends Error {}
export async function rejectLearningProjection(claim: LearningAnalysisClaim) {
  await transaction(claim.merchantId,async(c,row)=>{
    if (matches(row,claim) && row!.state === 'responded') await terminal(c,claim.merchantId,'invalid','proposal_closed');
  });
}

/** Called inside the proposal transaction, after the merchant lock and before source locks. */
export async function lockLearningResponse(c: PoolConnection, snapshot: LearningAnalysisSnapshot, analysis: LearningAnalysis, claim: LearningAnalysisClaim) {
  if (claim.merchantId !== snapshot.merchantId || claim.digest !== snapshot.digest) throw Error('Learning claim scope mismatch');
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_learning_analysis_jobs WHERE merchant_id=? FOR UPDATE',[snapshot.merchantId]);
  const row = rows[0];
  if (!matches(row,claim)) throw Error('Learning claim replaced');
  if (row.state === 'applied' || row.state === 'stale') return false;
  if (row.state !== 'responded' || row.response_hash !== learningResponseHash(analysis)) throw Error('Learning response not durably authorized');
  return true;
}
export async function finishLearningAnalysis(c: PoolConnection, claim: LearningAnalysisClaim,
  result: { status: 'applied' | 'stale'; generation: number | null; proposalCount: number }) {
  const [changed] = await c.execute<any>(`UPDATE ai_learning_analysis_jobs SET state=?,generation=?,proposal_count=?,response_json=NULL,
    failure_code=NULL,lease_until=NULL WHERE merchant_id=? AND claim_token=? AND source_digest=? AND state='responded'`,
  [result.status,result.generation,result.proposalCount,claim.merchantId,claim.token,claim.digest]);
  if (changed.affectedRows !== 1) throw Error('Learning completion lost ownership');
}
