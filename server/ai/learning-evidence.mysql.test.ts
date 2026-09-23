import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertDNA, getLearningEvidence } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';

describe.skipIf(!process.env.DATABASE_URL)('learning proposals have scoped, reviewable evidence', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, conversationId: number, signalIds: number[];
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const proposal = () => ({ merchantId: fixture.merchantId, generation: 1, dimension: 'objection_handling' as const,
    insight: 'Compare the relevant features before offering a discount', evidenceCount: 9999, confidence: 0.99, autoApplied: false });
  const input = () => ({ merchantId: fixture.merchantId, dimension: proposal().dimension, insight: proposal().insight, observedSignalIds: signalIds });
  beforeEach(async () => {
    fixture = await createDisposableMerchant('learning-evidence'); signalIds = [];
    conversationId = (await query("INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, '966500000085', 'active')", [fixture.merchantId])).insertId;
    for (const text of ['السعر مرتفع', 'أحتاج المقارنة']) signalIds.push((await query(`INSERT INTO sari_learning_signals
      (merchant_id, conversation_id, signal_type, customer_message) VALUES (?, ?, 'price_objection', ?)`, [fixture.merchantId, conversationId, text])).insertId);
    await upsertDNA(proposal());
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  it('counts independent conversations rather than model claims or number of signals, without activating a policy', async () => {
    expect((await getLearningEvidence(fixture.merchantId)).proposals[0].evidenceCount).toBe(0);
    await attachLearningEvidence({ ...input(), supportingSignalIds: [signalIds[0]], contrarySignalIds: [signalIds[1]] });
    const [actual] = (await getLearningEvidence(fixture.merchantId)).proposals;
    expect(actual.evidenceCount).toBe(1); expect(actual.evidence).toHaveLength(2);
    expect(actual.evidence).toContainEqual(expect.objectContaining({ signalId: signalIds[0], relation: 'supporting', excerpt: 'السعر مرتفع' }));
    expect(actual.evidence).toContainEqual(expect.objectContaining({ signalId: signalIds[1], relation: 'contrary' }));
    expect(await query('SELECT id FROM sari_behavioral_dna WHERE merchant_id = ? AND is_active = 1', [fixture.merchantId])).toHaveLength(0);
  });
  it('replays evidence attachment without duplicating the sample', async () => {
    await attachLearningEvidence(input()); await attachLearningEvidence(input());
    expect((await getLearningEvidence(fixture.merchantId)).proposals[0].evidence).toHaveLength(2);
  });
  it('rejects a model reference that was not in its analysis batch', async () => {
    await expect(attachLearningEvidence({ ...input(), supportingSignalIds: [signalIds[0] + 9000000] })).rejects.toThrow('outside');
    expect((await getLearningEvidence(fixture.merchantId)).proposals[0].evidence).toHaveLength(0);
  });
  it('rejects forged source ownership even for a real signal identifier', async () => {
    const other = await createDisposableMerchant('foreign-learning');
    try {
      await upsertDNA({ ...proposal(), merchantId: other.merchantId });
      await expect(attachLearningEvidence({ ...input(), merchantId: other.merchantId })).rejects.toThrow('tenant mismatch');
      expect((await getLearningEvidence(other.merchantId)).proposals[0].evidence).toHaveLength(0);
    } finally { await cleanupDisposableMerchants([other.userId]); }
  });
  it('removes deleted sources from both the evidence preview and the current count', async () => {
    await attachLearningEvidence(input()); await query('DELETE FROM conversations WHERE id = ?', [conversationId]);
    const [actual] = (await getLearningEvidence(fixture.merchantId)).proposals;
    expect(actual.evidence).toHaveLength(0); expect(actual.evidenceCount).toBe(0);
  });
  it('refuses contradictory classifications in a single model result', async () => {
    await expect(attachLearningEvidence({ ...input(), supportingSignalIds: [signalIds[0]], contrarySignalIds: [signalIds[0]] })).rejects.toThrow('Conflicting');
  });
});
