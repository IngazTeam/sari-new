import { createHash } from 'node:crypto';
import { getPool } from '../db/connection';

/** Model references are checked against the exact server-provided analysis batch. */
export async function attachLearningEvidence(input: {
  merchantId: number; dimension: string; insight: string; observedSignalIds: number[];
  supportingSignalIds?: unknown; contrarySignalIds?: unknown;
}): Promise<void> {
  const observed = Array.from(new Set(input.observedSignalIds));
  if (!observed.length || observed.length > 200 || observed.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid learning evidence batch');
  const ids = (value: unknown): number[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 200 || value.some(id => !Number.isSafeInteger(id) || !observed.includes(id))) throw new Error('Learning evidence outside analysis batch');
    return Array.from(new Set(value)) as number[];
  };
  const supporting = ids(input.supportingSignalIds), contrary = ids(input.contrarySignalIds);
  if (supporting.some(id => contrary.includes(id))) throw new Error('Conflicting evidence classification');
  const pool = await getPool(); if (!pool) throw new Error('Learning evidence storage unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [proposals] = await connection.execute<any[]>(`SELECT id FROM ai_learning_proposals WHERE merchant_id = ?
      AND dimension = ? AND content_hash = ? AND status = 'proposed' FOR UPDATE`, [input.merchantId, input.dimension,
      createHash('sha256').update(input.insight).digest('hex')]);
    if (!proposals[0]) throw new Error('Learning proposal unavailable');
    const [signals] = await connection.execute<any[]>(`SELECT id FROM sari_learning_signals WHERE merchant_id = ?
      AND id IN (${observed.map(() => '?').join(',')}) FOR SHARE`, [input.merchantId, ...observed]);
    if (signals.length !== observed.length) throw new Error('Learning evidence tenant mismatch');
    for (const signalId of observed) {
      const relation = supporting.includes(signalId) ? 'supporting' : contrary.includes(signalId) ? 'contrary' : 'observed';
      await connection.execute(`INSERT INTO ai_learning_evidence_links (proposal_id, signal_id, merchant_id, relation)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE proposal_id = VALUES(proposal_id)`,
      [proposals[0].id, signalId, input.merchantId, relation]);
    }
    // Cached count is descriptive only. Read APIs derive current evidence counts from surviving source rows.
    await connection.execute(`UPDATE ai_learning_proposals SET evidence_count = (
      SELECT COUNT(DISTINCT s.conversation_id) FROM ai_learning_evidence_links e
      JOIN sari_learning_signals s ON s.id = e.signal_id AND s.merchant_id = e.merchant_id
      WHERE e.proposal_id = ? AND e.merchant_id = ?) WHERE id = ? AND merchant_id = ?`,
    [proposals[0].id, input.merchantId, proposals[0].id, input.merchantId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
