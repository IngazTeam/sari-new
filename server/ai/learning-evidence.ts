import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { learningEvidenceIds } from './learning-analysis-contract';

type EvidenceInput = {
  merchantId: number; dimension: string; insight: string; observedSignalIds: number[];
  supportingSignalIds?: unknown; contrarySignalIds?: unknown;
};

/** Caller owns the transaction. Merchant, source and proposal locks follow one order. */
export async function attachLearningEvidenceInTransaction(connection: PoolConnection, input: EvidenceInput): Promise<void> {
  const { observed, supporting, contrary } = learningEvidenceIds(input.observedSignalIds, input.supportingSignalIds, input.contrarySignalIds);
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0) throw Error('Invalid learning merchant');
  const [merchants] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [input.merchantId]);
  if (!merchants.length) throw Error('Learning merchant unavailable');
  const [signals] = await connection.execute<any[]>(`SELECT s.id FROM sari_learning_signals s
    JOIN conversations c ON c.id=s.conversation_id AND c.merchantId=s.merchant_id
    WHERE s.merchant_id=? AND s.id IN (${observed.map(() => '?').join(',')}) ORDER BY s.id FOR SHARE`, [input.merchantId, ...observed]);
  if (signals.length !== observed.length) throw Error('Learning evidence tenant mismatch');
  const [proposals] = await connection.execute<any[]>(`SELECT id FROM ai_learning_proposals WHERE merchant_id=?
    AND dimension=? AND content_hash=? AND status='proposed' FOR UPDATE`, [input.merchantId, input.dimension,
    createHash('sha256').update(input.insight).digest('hex')]);
  if (!proposals[0]) throw Error('Learning proposal unavailable');
  const proposalId = proposals[0].id;
  const [existing] = await connection.execute<any[]>(`SELECT signal_id,relation FROM ai_learning_evidence_links
    WHERE proposal_id=? AND merchant_id=? FOR UPDATE`, [proposalId, input.merchantId]);
  const values = observed.flatMap(signalId => {
    const relation = supporting.includes(signalId) ? 'supporting' : contrary.includes(signalId) ? 'contrary' : 'observed';
    if (existing.some(row => Number(row.signal_id) === signalId && row.relation !== relation)) throw Error('Conflicting evidence classification');
    return [proposalId, signalId, input.merchantId, relation];
  });
  await connection.execute(`INSERT INTO ai_learning_evidence_links (proposal_id,signal_id,merchant_id,relation)
    VALUES ${observed.map(() => '(?,?,?,?)').join(',')} ON DUPLICATE KEY UPDATE proposal_id=VALUES(proposal_id)`, values);
  await connection.execute(`UPDATE ai_learning_proposals SET evidence_count=(
    SELECT COUNT(DISTINCT s.conversation_id) FROM ai_learning_evidence_links e
    JOIN sari_learning_signals s ON s.id=e.signal_id AND s.merchant_id=e.merchant_id
    JOIN conversations c ON c.id=s.conversation_id AND c.merchantId=s.merchant_id
    WHERE e.proposal_id=? AND e.merchant_id=?) WHERE id=? AND merchant_id=?`,
  [proposalId, input.merchantId, proposalId, input.merchantId]);
}

/** Compatibility entry point; a retry cannot silently reclassify the same source. */
export async function attachLearningEvidence(input: EvidenceInput): Promise<void> {
  learningEvidenceIds(input.observedSignalIds, input.supportingSignalIds, input.contrarySignalIds);
  const pool = await getPool(); if (!pool) throw Error('Learning evidence storage unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await attachLearningEvidenceInTransaction(connection, input);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
