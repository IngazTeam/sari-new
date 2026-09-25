import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedCohortProtocol, syntheticCohortRules } from '../tests/helpers/sales-cohort';
import { freezeSalesExperimentCohort } from './sales-experiment-cohort';
import { withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import { startLearningPolicyEvaluation, getLearningPolicyEvaluation } from './learning-policy-evaluation';
import { getLearningPolicyOutputReview, recordLearningPolicyOutputReview } from './learning-policy-output-review';
import { outputReviewRubricDigest } from './learning-policy-output-review-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { prepareSalesExperimentReview, recordSalesExperimentReview, getSalesExperimentReviewHistory } from './sales-experiment-review';
import type { RecordSalesExperimentReviewInput } from './sales-experiment-review-contract';
import { updateSalesSectorSettings } from './sales-sector-settings';
const route = vi.hoisted(() => ({ enabled: true, model: 'synthetic-model' }));
vi.mock('../db_ai_settings', () => ({ getActiveModel: async () => route.model,
  getZahyPiRuntimeMetadata: async () => ({ enabled: route.enabled, provider: 'openai', model: route.model, source: 'database' }) }));

describe.skipIf(!process.env.DATABASE_URL)('independent experiment planning review ledger', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, reviewer: typeof owner, users: number[],
    seeded: Awaited<ReturnType<typeof seedCohortProtocol>>, runId: number, cohortId: number, input: RecordSalesExperimentReviewInput;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const prepare = (actor = reviewer.userId) => prepareSalesExperimentReview(owner.merchantId, actor, { protocolId: seeded.protocol.protocolId, runId });
  const record = (value = input, actor = reviewer.userId) => recordSalesExperimentReview(owner.merchantId, actor, value);
  const history = (extra = {}) => getSalesExperimentReviewHistory(owner.merchantId, { protocolId: seeded.protocol.protocolId, ...extra });
  const outputRequest = async () => {
    const packet = await getLearningPolicyOutputReview(owner.merchantId, { runId });
    return { runId, runDigest: packet.runDigest!, rubricDigest: outputReviewRubricDigest, requestId: randomUUID(), expectedRevision: packet.expectedRevision,
      reviewedAllOutputs: true as const, cases: packet.pairs.map(pair => ({ caseId: pair.caseId,
        baseline: { verdict: 'pass' as const, quote: pair.baseline.response, reason: 'Synthetic baseline reviewer justification.' },
        candidate: { verdict: 'pass' as const, quote: pair.candidate.response, reason: 'Synthetic candidate reviewer justification.' }, preference: 'candidate' as const })) };
  };
  beforeEach(async () => {
    route.enabled = true; route.model = 'synthetic-model'; users = [];
    owner = await createDisposableMerchant('review-plan'); users.push(owner.userId);
    reviewer = await createDisposableMerchant('reviewer'); users.push(reviewer.userId);
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Planning must not call a provider'); }));
    seeded = await seedCohortProtocol(owner);
    const protocol = seeded.protocol;
    cohortId = (await freezeSalesExperimentCohort(owner.merchantId, owner.userId, { protocolId: protocol.protocolId, protocolDigest: protocol.protocolDigest,
      requestId: randomUUID(), rules: syntheticCohortRules(), matchesRegisteredDefinition: true, mappingReview: 'Explicit predicates match the frozen synthetic definition.' })).cohortId;
    runId = (await startLearningPolicyEvaluation(owner.merchantId, owner.userId, { candidateId: protocol.protocol.candidate.id,
      artifactDigest: protocol.protocol.candidate.artifactDigest, requestId: randomUUID() })).runId;
    // Synthetic stored responses; these are not provider quality measurements or budget settlement evidence.
    const run = await getLearningPolicyEvaluation(owner.merchantId, { runId });
    for (const sample of run.samples) {
      const text = `${sample.arm} synthetic response ${sample.caseId}`, metadata = { id: `synthetic-${sample.ordinal}`, model: 'synthetic-model', finishReason: 'stop', usage: { prompt_tokens: 20, completion_tokens: 10 } };
      await query("UPDATE ai_learning_policy_evaluation_samples SET state='responded',response_text=?,response_metadata=?,response_digest=?,reservation_key=? WHERE run_id=? AND ordinal=?",
        [text, JSON.stringify(metadata), policyArtifactDigest({ text, metadata }), randomUUID(), runId, sample.ordinal]);
    }
    await query("UPDATE ai_learning_policy_evaluations SET state='completed',observed_model='synthetic-model' WHERE id=?", [runId]);
    await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, await outputRequest());
    const basis = await prepare();
    input = { protocolId: protocol.protocolId, runId, requestId: randomUUID(), basisDigest: basis.basisDigest, expectedRevision: 0,
      verdict: 'approved', reviewedFrozenDesignAndOutputs: true, understandsNoActivation: true, assessment: {
        baselineAndSample: 'Synthetic assessment of independent customers, baseline and sample assumptions.',
        recruitmentFeasibility: 'Synthetic review of recruiting the required customers within the fixed window.',
        qualificationMapping: 'Synthetic review that supported predicates match the registered definition.',
        safetyAndMeasurement: 'Synthetic review of stopping, refunds, human assistance and fixed analysis.',
      } };
  });
  afterEach(async () => { await cleanupDisposableMerchants(users); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(closeDb);

  it('binds all evidence and independent identity without altering the frozen sources or enabling delivery', async () => {
    const before = await query('SELECT * FROM ai_sales_experiment_protocols WHERE id=?', [input.protocolId]);
    expect(await prepare()).toMatchObject({ canReview: true, stage: 'not_reviewed', planningReviewCurrent: false, activationAllowed: false });
    const saved = await record();
    expect(saved).toMatchObject({ reused: false, eligibility: 'not_checked', snapshot: { reviewerUserId: reviewer.userId, revision: 1,
      scope: 'independent_planning_review', independence: 'distinct_authenticated_user', activationAllowed: false } });
    expect(saved.snapshot.basis).toMatchObject({ protocolDigest: seeded.protocol.protocolDigest, cohortId, runId, participantUserIds: [owner.userId] });
    expect(await prepare()).toMatchObject({ stage: 'approved', planningReviewCurrent: true, activationAllowed: false, experimentStarted: false });
    expect(await query('SELECT * FROM ai_sales_experiment_protocols WHERE id=?', [input.protocolId])).toEqual(before);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT reservation_key FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`])).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects self approval and self rejection, even with a valid basis', async () => {
    expect(await prepare(owner.userId)).toMatchObject({ canReview: false });
    for (const verdict of ['approved', 'rejected'] as const) await expect(record({ ...input, verdict }, owner.userId)).rejects.toThrow();
    expect((await history()).items).toHaveLength(0);
  });
  it.each(['protocol', 'cohort', 'generation', 'output_review', 'candidate', 'preparation'])('separately checks the %s participant identity', async role => {
    const targets = { protocol: ['ai_sales_experiment_protocols', input.protocolId], cohort: ['ai_sales_experiment_cohorts', cohortId],
      generation: ['ai_learning_policy_evaluations', runId], output_review: ['ai_learning_policy_output_reviews', (await prepare()).basis.outputReviewId],
      candidate: ['ai_learning_policy_candidates', seeded.protocol.protocol.candidate.id], preparation: ['ai_learning_policy_reviews', seeded.protocol.protocol.candidate.preparationReviewId] };
    const [table, key] = targets[role as keyof typeof targets];
    await query(`UPDATE ${table} SET actor_user_id=? WHERE id=?`, [reviewer.userId, key]);
    const next = await prepare(); expect(next.canReview).toBe(false);
    await expect(record({ ...input, basisDigest: next.basisDigest })).rejects.toThrow();
  });
  it('serializes concurrent retries to one immutable receipt and rejects changed payload or actor', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => record()));
    expect(new Set(results.map(row => row.reviewId)).size).toBe(1); expect(results.filter(row => !row.reused)).toHaveLength(1);
    expect(await record({ ...input, requestId: input.requestId.toUpperCase() })).toMatchObject({ reused: true });
    await expect(record({ ...input, verdict: 'rejected' })).rejects.toThrow(); await expect(record(input, owner.userId)).rejects.toThrow();
  });
  it('rejects competing revisions and preserves prior approval after an explicit later rejection', async () => {
    const results = await Promise.allSettled([record(), record({ ...input, requestId: randomUUID() })]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const first = (await history()).items[0];
    await record({ ...input, requestId: randomUUID(), expectedRevision: 1, verdict: 'rejected' });
    expect(await prepare()).toMatchObject({ stage: 'rejected', planningReviewCurrent: false, expectedRevision: 2 });
    expect((await history({ limit: 1 })).nextBeforeId).not.toBeNull();
    expect((await history({ beforeId: (await history()).items[0].reviewId })).items[0]).toEqual(first);
    await expect(record({ ...input, requestId: randomUUID() })).rejects.toThrow();
  });
  it('recovers an exact acknowledgement after withdrawal, source change and route disable without claiming current eligibility', async () => {
    const saved = await record();
    await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: input.protocolId, protocolDigest: seeded.protocol.protocolDigest,
      requestId: randomUUID(), reason: 'Synthetic safety withdrawal before the fixed decision window.' });
    await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seeded.signalId]); route.enabled = false;
    expect(await record()).toMatchObject({ reviewId: saved.reviewId, reused: true, eligibility: 'not_checked', activationAllowed: false });
    expect((await history()).items[0].snapshot).toEqual(saved.snapshot);
    await expect(prepare()).rejects.toThrow(); await expect(record({ ...input, requestId: randomUUID(), expectedRevision: 1 })).rejects.toThrow();
  });
  it.each(['digest', 'source', 'sector', 'route', 'disabled', 'missing_cohort', 'missing_review', 'deleted_participant', 'running', 'response', 'metadata', 'rubric', 'quote', 'sample'])('blocks %s drift or invalid evidence before writing', async mode => {
    if (mode === 'digest') input.basisDigest = 'f'.repeat(64);
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seeded.signalId]);
    if (mode === 'sector') await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, playbookId: 'training', expectedRevision: 0 });
    if (mode === 'route') route.model = 'different-model'; if (mode === 'disabled') route.enabled = false;
    if (mode === 'missing_cohort') await query('DELETE FROM ai_sales_experiment_cohorts WHERE id=?', [cohortId]);
    if (mode === 'missing_review') await query('DELETE FROM ai_learning_policy_output_reviews WHERE run_id=?', [runId]);
    if (mode === 'deleted_participant') await query('UPDATE ai_learning_policy_evaluations SET actor_user_id=NULL WHERE id=?', [runId]);
    if (mode === 'running') await query("UPDATE ai_learning_policy_evaluations SET state='running' WHERE id=?", [runId]);
    if (mode === 'response') await query("UPDATE ai_learning_policy_evaluation_samples SET response_text='Altered output' WHERE run_id=? AND ordinal=0", [runId]);
    if (mode === 'metadata') await query("UPDATE ai_learning_policy_evaluation_samples SET response_metadata=JSON_SET(response_metadata,'$.finishReason','length') WHERE run_id=? AND ordinal=0", [runId]);
    if (mode === 'rubric' || mode === 'quote') {
      const row = (await query('SELECT * FROM ai_learning_policy_output_reviews WHERE run_id=?', [runId]))[0], r = typeof row.review === 'string' ? JSON.parse(row.review) : row.review;
      if (mode === 'rubric') r.rubric.version = 'forged-rubric'; else r.cases[0].candidate.quote = 'A fabricated exact quotation';
      await query('UPDATE ai_learning_policy_output_reviews SET review=?,review_digest=?,rubric_digest=? WHERE id=?', [JSON.stringify(r), policyArtifactDigest(r), policyArtifactDigest(r.rubric), row.id]);
    }
    if (mode === 'sample') {
      const p = structuredClone(seeded.protocol.protocol); delete p.sampleCalculation;
      await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=? WHERE id=?', [JSON.stringify(p), policyArtifactDigest(p), input.protocolId]);
    }
    await expect(record()).rejects.toThrow(); expect((await history()).items).toHaveLength(0);
  });
  it('invalidates an old approval when the latest paired-output review changes, even if both passed', async () => {
    await record(); await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, await outputRequest());
    const next = await prepare(); expect(next).toMatchObject({ stage: 'review_stale', planningReviewCurrent: false });
    expect(next.basisDigest).not.toBe(input.basisDigest);
    await expect(record({ ...input, expectedRevision: 1, requestId: randomUUID() })).rejects.toThrow();
    await record({ ...input, basisDigest: next.basisDigest, expectedRevision: 1, requestId: randomUUID() });
    expect((await prepare()).planningReviewCurrent).toBe(true);
  });
  it('rejects a latest failed output review instead of selecting an older pass', async () => {
    const next: any = await outputRequest(); next.cases[0].candidate.verdict = 'fail'; next.cases[0].preference = 'baseline';
    await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, next);
    await expect(record()).rejects.toThrow();
  });
  it('rejects an inconclusive latest output review without promoting ties to a pass', async () => {
    const next: any = await outputRequest(); for (const item of next.cases) item.preference = 'tie';
    await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, next);
    await expect(record()).rejects.toThrow();
  });
  it('does not select an older passing run once a newer evaluation exists for the same candidate', async () => {
    await startLearningPolicyEvaluation(owner.merchantId, owner.userId, { candidateId: seeded.protocol.protocol.candidate.id,
      artifactDigest: seeded.protocol.protocol.candidate.artifactDigest, requestId: randomUUID() });
    await expect(prepare()).rejects.toThrow(); await expect(record()).rejects.toThrow();
  });
  it('uses database time to prohibit approval once enrollment starts, despite a backwards application clock', async () => {
    const p = structuredClone(seeded.protocol.protocol), start = new Date(Date.now() - 86400000).toISOString();
    p.registeredAt = new Date(Date.now() - 3 * 86400000).toISOString(); p.design.window.enrollmentStartsAt = start;
    p.design.window.enrollmentEndsAt = new Date(Date.now() + 86400000).toISOString();
    const digest = policyArtifactDigest(p);
    await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=? WHERE id=?', [JSON.stringify(p), digest, input.protocolId]);
    const row = (await query('SELECT snapshot FROM ai_sales_experiment_cohorts WHERE id=?', [cohortId]))[0], s = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    s.protocolDigest = digest; s.frozenAt = new Date(Date.now() - 2 * 86400000).toISOString(); s.enrollmentStartsAt = start; s.enrollmentEndsAt = p.design.window.enrollmentEndsAt;
    await query('UPDATE ai_sales_experiment_cohorts SET snapshot=?,protocol_digest=?,cohort_digest=? WHERE id=?', [JSON.stringify(s), digest, policyArtifactDigest(s), cohortId]);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 1000 * 86400000);
    await expect(prepare()).rejects.toThrow(); await expect(record()).rejects.toThrow(); expect((await history()).items).toHaveLength(0);
  });
  it('blocks foreign protocols, runs and history under resolved tenant identity', async () => {
    await expect(prepareSalesExperimentReview(reviewer.merchantId, reviewer.userId, { protocolId: input.protocolId, runId })).rejects.toThrow();
    await expect(recordSalesExperimentReview(reviewer.merchantId, reviewer.userId, input)).rejects.toThrow();
    await expect(getSalesExperimentReviewHistory(reviewer.merchantId, { protocolId: input.protocolId })).rejects.toThrow();
    const other = await seedCohortProtocol(reviewer);
    await expect(prepareSalesExperimentReview(owner.merchantId, reviewer.userId, { protocolId: other.protocol.protocolId, runId })).rejects.toThrow();
  });
  it('snapshots submitted assessment before awaiting a lock', async () => {
    const pending = record(), original = input.assessment.baselineAndSample;
    input.assessment.baselineAndSample = 'Mutated caller assessment after submitting this request.';
    expect((await pending).snapshot.assessment.baselineAndSample).toBe(original);
  });
  it.each(['digest', 'scope', 'authority', 'identity', 'participant', 'revision', 'basis', 'unknown'])('rejects corrupted %s receipts even on a replay', async mode => {
    const saved = await record(), snapshot: any = structuredClone(saved.snapshot);
    if (mode === 'scope') snapshot.scope = 'launch_approval'; if (mode === 'authority') snapshot.activationAllowed = true;
    if (mode === 'identity') snapshot.merchantId = reviewer.merchantId; if (mode === 'participant') snapshot.basis.participantUserIds.push(reviewer.userId);
    if (mode === 'revision') snapshot.revision++; if (mode === 'basis') snapshot.basis.outputReviewRevision++;
    if (mode === 'unknown') snapshot.winner = 'candidate'; if (mode === 'digest') snapshot.assessment.safetyAndMeasurement += ' altered';
    await query('UPDATE ai_sales_experiment_reviews SET snapshot=?,review_digest=? WHERE id=?', [JSON.stringify(snapshot), mode === 'digest' ? saved.reviewDigest : policyArtifactDigest(snapshot), saved.reviewId]);
    await expect(history()).rejects.toThrow(); await expect(record()).rejects.toThrow();
  });
  it('keeps the historical reviewer identity after account deletion but refuses current approval', async () => {
    const saved = await record(); await cleanupDisposableMerchants([reviewer.userId]); users = [owner.userId];
    expect((await history()).items[0]).toMatchObject({ reviewerPresent: false, snapshot: { reviewerUserId: saved.snapshot.reviewerUserId } });
    expect(await prepare(owner.userId)).toMatchObject({ planningReviewCurrent: false, stage: 'review_stale' });
  });
});
