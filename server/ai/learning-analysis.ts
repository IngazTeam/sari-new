import { createHash } from 'node:crypto';
import { getPool } from '../db/connection';
import { ensureLearningTables } from '../db/learning';
import { attachLearningEvidenceInTransaction } from './learning-evidence';
import { lockLearningResponse, finishLearningAnalysis, LearningProjectionRejected, rejectLearningProjection, type LearningAnalysisClaim } from './learning-analysis-jobs';
import { parseLearningAnalysis, sanitizeLearningText, snapshotLearningSignals,
  type LearningAnalysis, type LearningAnalysisSnapshot } from './learning-analysis-contract';

/** Commit only the unchanged batch the model saw. No provider call or automatic policy activation occurs here. */
export async function persistLearningAnalysis(snapshot: LearningAnalysisSnapshot, analysis: LearningAnalysis, claim?: LearningAnalysisClaim) {
  const original = snapshotLearningSignals(snapshot.merchantId, snapshot.signals);
  if (original.digest !== snapshot.digest) throw Error('Learning snapshot integrity mismatch');
  const observed = original.signals.map(row => row.id);
  const result = parseLearningAnalysis(JSON.stringify(analysis), observed);
  const proposals = result.updates.map(item => ({ dimension: item.dimension, insight: sanitizeLearningText(item.insight).trim(),
    confidence: item.confidence, supporting: item.supporting_signal_ids, contrary: item.contrary_signal_ids }));
  if (result.knowledge_gaps.length) proposals.push({ dimension: 'knowledge_gaps',
    insight: result.knowledge_gaps.map(text => sanitizeLearningText(text).trim()).join('\n• '),
    confidence: 0.5, supporting: [], contrary: [] });
  const identities = proposals.map(item => `${item.dimension}:${item.insight}`);
  if (proposals.some(item => !item.insight) || new Set(identities).size !== identities.length) throw Error('Duplicate or empty learning proposal');
  await ensureLearningTables();
  const pool = await getPool(); if (!pool) throw Error('Learning analysis storage unavailable');
  const connection = await pool.getConnection();
  let released = false;
  try {
    await connection.beginTransaction();
    // Parent first: no database lock is held across the model call.
    const [merchants] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [snapshot.merchantId]);
    if (!merchants.length) throw Error('Learning merchant unavailable');
    if (claim && !await lockLearningResponse(connection,original,result,claim)) {
      await connection.rollback();
      return { status: 'stale' as const, generation: null, proposalCount: 0 };
    }
    const [current] = await connection.execute<any[]>(`SELECT * FROM sari_learning_signals
      WHERE merchant_id=? AND id IN (${observed.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, [snapshot.merchantId, ...observed]);
    if (current.length !== observed.length) throw Error('Learning source removed or tenant mismatch');
    const conversations = Array.from(new Set(current.map(row => Number(row.conversation_id)))).sort((a,b) => a-b);
    const [owned] = await connection.execute<any[]>(`SELECT id FROM conversations WHERE merchantId=?
      AND id IN (${conversations.map(() => '?').join(',')}) ORDER BY id FOR SHARE`, [snapshot.merchantId, ...conversations]);
    if (owned.length !== conversations.length) throw Error('Learning conversation tenant mismatch');
    if (snapshotLearningSignals(snapshot.merchantId, current).digest !== original.digest) throw Error('Learning source changed during analysis');
    if (current.some(row => Number(row.analyzed) !== 0)) {
      if (claim) {
        await finishLearningAnalysis(connection,claim,{ status:'stale',generation:null,proposalCount:0 });
        await connection.commit();
      } else await connection.rollback();
      return { status: 'stale' as const, generation: null, proposalCount: 0 };
    }
    const [generations] = await connection.execute<any[]>(`SELECT MAX(generation) AS gen FROM (
      SELECT generation FROM sari_behavioral_dna WHERE merchant_id=?
      UNION ALL SELECT generation FROM ai_learning_proposals WHERE merchant_id=?) g`, [snapshot.merchantId, snapshot.merchantId]);
    const nextGeneration = Number(generations[0]?.gen || 0) + 1;
    let inserted = 0;
    for (const proposal of proposals) {
      const hash = createHash('sha256').update(proposal.insight).digest('hex');
      const [existing] = await connection.execute<any[]>(`SELECT id,status FROM ai_learning_proposals
        WHERE merchant_id=? AND dimension=? AND content_hash=? FOR UPDATE`, [snapshot.merchantId, proposal.dimension, hash]);
      if (existing.length && existing[0].status !== 'proposed') throw new LearningProjectionRejected('Learning proposal is not open for evidence');
      if (!existing.length) {
        await connection.execute(`INSERT INTO ai_learning_proposals
          (merchant_id,generation,dimension,insight,content_hash,evidence_count,confidence,status)
          VALUES (?,?,?,?,?,0,?,'proposed')`, [snapshot.merchantId, nextGeneration, proposal.dimension, proposal.insight, hash, proposal.confidence]);
        inserted++;
      }
      await attachLearningEvidenceInTransaction(connection, { merchantId: snapshot.merchantId, dimension: proposal.dimension,
        insight: proposal.insight, observedSignalIds: observed, supportingSignalIds: proposal.supporting, contrarySignalIds: proposal.contrary });
    }
    const [updated] = await connection.execute<any>(`UPDATE sari_learning_signals SET analyzed=1
      WHERE merchant_id=? AND analyzed=0 AND id IN (${observed.map(() => '?').join(',')})`, [snapshot.merchantId, ...observed]);
    if (updated.affectedRows !== observed.length) throw Error('Learning batch update incomplete');
    const applied = { status: 'applied' as const, generation: inserted ? nextGeneration : null, proposalCount: proposals.length };
    if (claim) await finishLearningAnalysis(connection,claim,applied);
    await connection.commit();
    return applied;
  } catch (error) {
    try { await connection.rollback(); } catch { /* Never retry an uncertain commit here. */ }
    // Release the current connection before acquiring the terminal-state transaction.
    if (claim && error instanceof LearningProjectionRejected) {
      connection.release(); released = true;
      await rejectLearningProjection(claim);
      throw error;
    }
    throw error;
  } finally { if (!released) connection.release(); }
}
