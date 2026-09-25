import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertDNA } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';
import { getLearningPolicyReview, recordLearningPolicyReview } from './learning-policy-review';
import { learningPolicyReviewSuite, learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';
import { createLearningPolicyCandidate, getLearningPolicyCandidate } from './learning-policy-candidates';
import { startLearningPolicyEvaluation, getLearningPolicyEvaluation, cancelLearningPolicyEvaluation } from './learning-policy-evaluation';
import { getLearningPolicyOutputReview, recordLearningPolicyOutputReview } from './learning-policy-output-review';
import { outputReviewRubricDigest, type OutputReviewInput } from './learning-policy-output-review-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
vi.mock('../db_ai_settings', () => ({ getActiveModel: async () => 'synthetic-model',
  getZahyPiRuntimeMetadata: async () => ({ enabled: true, provider: 'openai', model: 'synthetic-model', source: 'database' }) }));

describe.skipIf(!process.env.DATABASE_URL)('durable human judgment on stored evaluation outputs', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, users: number[], runId: number, proposalId: number, signalId: number;
  let startInput: { candidateId: number; artifactDigest: string; requestId: string }, runDigest: string;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const view = () => getLearningPolicyOutputReview(owner.merchantId, { runId });
  const record = (input: OutputReviewInput) => recordLearningPolicyOutputReview(owner.merchantId, owner.userId, input);
  const request = async (): Promise<OutputReviewInput> => {
    const packet = await view();
    return { runId, runDigest: packet.runDigest!, rubricDigest: outputReviewRubricDigest, requestId: randomUUID(),
      expectedRevision: packet.expectedRevision, reviewedAllOutputs: true, cases: packet.pairs.map(pair => ({ caseId: pair.caseId,
        baseline: { verdict: 'pass', quote: pair.baseline.response, reason: 'Synthetic reviewer explanation for the baseline response.' },
        candidate: { verdict: 'pass', quote: pair.candidate.response, reason: 'Synthetic reviewer explanation for the candidate response.' }, preference: 'candidate' })) };
  };
  beforeEach(async () => {
    owner = await createDisposableMerchant('output-review'); users = [owner.userId];
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Review must not call providers'); }));
    const conversationId = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000287')", [owner.merchantId])).insertId;
    signalId = (await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','Private synthetic evidence')", [owner.merchantId, conversationId])).insertId;
    const proposal = { merchantId: owner.merchantId, generation: 1, dimension: 'objection_handling' as const, insight: 'Explain value clearly', evidenceCount: 1, confidence: 0.7 };
    await upsertDNA(proposal); proposalId = Number((await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?', [owner.merchantId]))[0].id);
    await attachLearningEvidence({ ...proposal, observedSignalIds: [signalId] });
    const source = await getLearningPolicyReview(owner.merchantId, { proposalId });
    await recordLearningPolicyReview(owner.merchantId, owner.userId, { proposalId, requestId: randomUUID(), sourceDigest: source.sourceDigest,
      suiteDigest: learningPolicyReviewSuiteDigest, expectedRevision: 0, styleOnly: true, cases: learningPolicyReviewSuite.cases.map(row => ({
        caseId: row.id as any, baselineResponse: 'Fixture baseline', candidateResponse: 'Fixture candidate', baselineVerdict: 'pass', candidateVerdict: 'pass', reason: 'Human input fixture for candidate preparation.' })) });
    const basis = await getLearningPolicyCandidate(owner.merchantId, { proposalId });
    const candidate = await createLearningPolicyCandidate(owner.merchantId, owner.userId, { proposalId, reviewId: basis.reviewId!, sourceDigest: basis.sourceDigest,
      baselineDigest: basis.baselineDigest, expectedVersion: 0, requestId: randomUUID() });
    startInput = { candidateId: candidate.id, artifactDigest: candidate.artifactDigest, requestId: randomUUID() };
    runId = (await startLearningPolicyEvaluation(owner.merchantId, owner.userId, startInput)).runId;
    // Stored-output fixture only. Provider generation and budget settlement are exercised in the evaluation suite.
    for (const sample of await query('SELECT * FROM ai_learning_policy_evaluation_samples WHERE run_id=?', [runId])) {
      const response = `Synthetic ${sample.arm} response for ${sample.case_id}.`;
      const metadata = { id: `synthetic-${sample.ordinal}`, model: 'synthetic-model', finishReason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 5 } };
      await query(`UPDATE ai_learning_policy_evaluation_samples SET state='responded',response_text=?,response_metadata=?,response_digest=?,reservation_key=? WHERE run_id=? AND ordinal=?`,
        [response, JSON.stringify(metadata), policyArtifactDigest({ text: response, metadata }), policyArtifactDigest({ runId, ordinal: sample.ordinal }), runId, sample.ordinal]);
    }
    await query("UPDATE ai_learning_policy_evaluations SET state='completed',observed_model='synthetic-model' WHERE id=?", [runId]);
    runDigest = (await view()).runDigest!;
  });
  afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);
  it('binds all 64 actual saved answers and shows immutable human judgments without activating the proposal', async () => {
    const before = await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId]);
    const packet = await view(); expect(packet).toMatchObject({ canReview: true, stage: 'not_reviewed', activationAllowed: false });
    expect(packet.pairs).toHaveLength(32); expect(packet.pairs[0].systemPrompt).toContain('100');
    const saved = await record(await request()); expect(saved).toMatchObject({ revision: 1, outcome: 'passed', candidateWins: 32, activationAllowed: false });
    expect((await view()).latestReview).toMatchObject({ current: true, outcome: 'passed', actorUserId: owner.userId });
    expect(await getLearningPolicyEvaluation(owner.merchantId, { runId })).toMatchObject({ assessment: 'human_review_recorded', outputReview: { id: saved.id, eligibility: 'not_checked' } });
    expect((await getLearningPolicyCandidate(owner.merchantId, { proposalId })).evaluationRuns[0]).toMatchObject({ assessment: 'human_review_recorded', outputReview: { id: saved.id } });
    expect(await startLearningPolicyEvaluation(owner.merchantId, owner.userId, startInput)).toMatchObject({ reused: true, assessment: 'human_review_recorded' });
    expect(await cancelLearningPolicyEvaluation(owner.merchantId, { runId })).toMatchObject({ state: 'completed', assessment: 'human_review_recorded' });
    expect(await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId])).toEqual(before);
    expect(JSON.stringify(await view())).not.toContain('Private synthetic evidence');
  });
  it('requires a frozen run digest and exact excerpts from the corresponding saved arm', async () => {
    const input = await request();
    await expect(record({ ...input, runDigest: 'b'.repeat(64) })).rejects.toThrow();
    input.cases[0].candidate.quote = input.cases[0].baseline.quote;
    await expect(record(input)).rejects.toThrow();
    expect(await query('SELECT id FROM ai_learning_policy_output_reviews WHERE run_id=?', [runId])).toHaveLength(0);
  });
  it.each(['running','halted','cancelled'])('refuses %s generations without allowing a partial review', async state => {
    const input = await request(); await query('UPDATE ai_learning_policy_evaluations SET state=? WHERE id=?', [state, runId]);
    expect(await view()).toMatchObject({ canReview: false, stage: 'generation_incomplete', pairs: [] });
    await expect(record(input)).rejects.toThrow();
  });
  it.each(['missing','state','input','case','text','digest','model','finish','usage','reservation','recipe'])('rejects corrupt %s output evidence on read and write', async mode => {
    const input = await request();
    const sql: Record<string, string> = {
      missing: 'DELETE FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND ordinal=0',
      state: "UPDATE ai_learning_policy_evaluation_samples SET state='invalid' WHERE run_id=? AND ordinal=0",
      input: "UPDATE ai_learning_policy_evaluation_samples SET input_digest=REPEAT('b',64) WHERE run_id=? AND ordinal=0",
      case: "UPDATE ai_learning_policy_evaluation_samples SET case_id='foreign' WHERE run_id=? AND ordinal=0",
      text: "UPDATE ai_learning_policy_evaluation_samples SET response_text='forged' WHERE run_id=? AND ordinal=0",
      digest: "UPDATE ai_learning_policy_evaluation_samples SET response_digest=REPEAT('b',64) WHERE run_id=? AND ordinal=0",
      model: "UPDATE ai_learning_policy_evaluation_samples SET response_metadata=JSON_SET(response_metadata,'$.model','other') WHERE run_id=? AND ordinal=0",
      finish: "UPDATE ai_learning_policy_evaluation_samples SET response_metadata=JSON_SET(response_metadata,'$.finishReason','length') WHERE run_id=? AND ordinal=0",
      usage: "UPDATE ai_learning_policy_evaluation_samples SET response_metadata=JSON_REMOVE(response_metadata,'$.usage') WHERE run_id=? AND ordinal=0",
      reservation: 'UPDATE ai_learning_policy_evaluation_samples SET reservation_key=NULL WHERE run_id=? AND ordinal=0',
      recipe: "UPDATE ai_learning_policy_evaluations SET recipe=JSON_SET(recipe,'$.maxTokens',999) WHERE id=?",
    };
    await query(sql[mode], [runId]); await expect(view()).rejects.toThrow(); await expect(record(input)).rejects.toThrow();
  });
  it('retains a historical judgment after source changes and rejects a new stale assessment', async () => {
    const input = await request(), saved = await record(input);
    await query("UPDATE sari_learning_signals SET customer_message='Changed source' WHERE id=?", [signalId]);
    expect(await view()).toMatchObject({ canReview: false, stage: 'source_stale', latestReview: { id: saved.id, current: false } });
    expect(await record(input)).toMatchObject({ reused: true, id: saved.id, eligibility: 'not_checked' });
    await expect(record({ ...input, requestId: randomUUID(), expectedRevision: 1 })).rejects.toThrow();
  });
  it('invalidates a previous judgment if the stored output set is replaced even with a matching new response hash', async () => {
    await record(await request()); const [sample] = await query('SELECT * FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND ordinal=0', [runId]);
    const metadata = typeof sample.response_metadata === 'string' ? JSON.parse(sample.response_metadata) : sample.response_metadata;
    await query('UPDATE ai_learning_policy_evaluation_samples SET response_text=?,response_digest=? WHERE run_id=? AND ordinal=0',
      ['Different complete synthetic answer', policyArtifactDigest({ text: 'Different complete synthetic answer', metadata }), runId]);
    const packet = await view(); expect(packet).toMatchObject({ stage: 'review_stale', latestReview: { current: false } }); expect(packet.runDigest).not.toBe(runDigest);
  });
  it('deduplicates concurrent/reordered retries and rejects changed actor or payload', async () => {
    const input = await request(), saved = await Promise.all(Array.from({ length: 5 }, () => record(input)));
    expect(new Set(saved.map(row => row.id)).size).toBe(1);
    expect(await record({ ...input, requestId: input.requestId.toUpperCase(), cases: [...input.cases].reverse() })).toMatchObject({ reused: true });
    const other = await createDisposableMerchant('output-review-actor'); users.push(other.userId);
    await expect(recordLearningPolicyOutputReview(owner.merchantId, other.userId, input)).rejects.toThrow();
    input.cases[0].candidate.reason = 'Changed reviewer rationale for the same request.'; await expect(record(input)).rejects.toThrow();
  });
  it('serializes different reviewers at the same revision and keeps immutable revision history', async () => {
    const input = await request(), results = await Promise.allSettled([record(input), record({ ...input, requestId: randomUUID() })]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const next = await request(); next.cases.forEach(row => { row.preference = 'tie'; });
    expect(await record(next)).toMatchObject({ revision: 2, outcome: 'inconclusive' });
    expect((await view()).history.map(row => [row.revision, row.outcome, row.current])).toEqual([[2,'inconclusive',true],[1,'passed',false]]);
  });
  it('preserves a failing human verdict and computed regression instead of a client score', async () => {
    const input = await request(); input.cases[0].candidate.verdict = 'fail'; input.cases[0].preference = 'baseline';
    expect(await record(input)).toMatchObject({ outcome: 'failed', regressions: 1, candidatePassed: 31 });
    expect((await view()).stage).toBe('human_review_failed');
  });
  it('isolates run reads and writes across tenants', async () => {
    const input = await request(), other = await createDisposableMerchant('output-review-foreign'); users.push(other.userId);
    await expect(getLearningPolicyOutputReview(other.merchantId, { runId })).rejects.toThrow();
    await expect(recordLearningPolicyOutputReview(other.merchantId, other.userId, input)).rejects.toThrow();
    expect(await query('SELECT id FROM ai_learning_policy_output_reviews WHERE run_id=?', [runId])).toHaveLength(0);
  });
  it('copies the submission before the first asynchronous lock', async () => {
    const input = await request(), pending = record(input); input.cases[0].candidate.reason = 'Mutated after submission';
    await pending; expect((await view()).latestReview!.review.cases.some((row: any) => row.candidate.reason === 'Mutated after submission')).toBe(false);
  });
  it.each(['before','after'] as const)('recovers a lost commit acknowledgment %s persistence with the identical request', async when => {
    const input = await request(), pool = (await getPool())!, getConnection = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const connection = await getConnection(); let inserting = false;
      return new Proxy(connection, { get(target, key) {
        if (key === 'execute') return async (...args: any[]) => { if (String(args[0]).includes('INSERT INTO ai_learning_policy_output_reviews')) inserting = true; return (target.execute as any)(...args); };
        if (key === 'commit') return async () => { if (inserting && when === 'before') throw Error('Unknown commit'); await target.commit(); if (inserting && when === 'after') throw Error('Unknown commit'); };
        const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }) as any;
    });
    await expect(record(input)).rejects.toThrow(); vi.restoreAllMocks();
    expect(await record(input)).toMatchObject({ revision: 1, reused: when === 'after' });
    expect(await query('SELECT id FROM ai_learning_policy_output_reviews WHERE run_id=?', [runId])).toHaveLength(1);
  });
  it.each(['review','outcome','digest'])('detects stored %s corruption through both review and generation APIs', async mode => {
    await record(await request());
    const sql = mode === 'review' ? "review=JSON_SET(review,'$.cases[0].candidate.reason','forged')" : mode === 'outcome' ? "outcome='failed'" : "review_digest=REPEAT('b',64)";
    await query(`UPDATE ai_learning_policy_output_reviews SET ${sql} WHERE run_id=?`, [runId]);
    await expect(view()).rejects.toThrow(); await expect(getLearningPolicyEvaluation(owner.merchantId, { runId })).rejects.toThrow();
  });
  it('retains the review after reviewer deletion and cascades it with the owning run', async () => {
    const input = await request(), other = await createDisposableMerchant('output-review-deleted-actor'); users.push(other.userId);
    const saved = await recordLearningPolicyOutputReview(owner.merchantId, other.userId, input);
    await query('DELETE FROM users WHERE id=?', [other.userId]);
    expect((await view()).latestReview).toMatchObject({ id: saved.id, actorUserId: null });
    await query('DELETE FROM ai_learning_policy_evaluations WHERE id=?', [runId]);
    expect(await query('SELECT id FROM ai_learning_policy_output_reviews WHERE id=?', [saved.id])).toHaveLength(0);
  });
});
