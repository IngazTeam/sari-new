import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { syntheticSalesExperimentDesign } from '../tests/helpers/sales-experiment-design';
import { upsertDNA } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';
import { getLearningPolicyReview, recordLearningPolicyReview } from './learning-policy-review';
import { learningPolicyReviewSuite, learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';
import { createLearningPolicyCandidate, getLearningPolicyCandidate } from './learning-policy-candidates';
import { updateSalesSectorSettings } from './sales-sector-settings';
import { registerSalesExperimentProtocol, getSalesExperimentProtocol, getSalesExperimentProtocolHistory, withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import type { RegisterSalesExperimentProtocolInput } from './sales-experiment-protocol-contract';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { calculateSalesExperimentSample } from '../../shared/sales-experiment-sample';

describe.skipIf(!process.env.DATABASE_URL)('immutable sales experiment preregistration on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, users: number[], signalId: number, proposalId: number;
  let input: RegisterSalesExperimentProtocolInput;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const register = (value = input) => registerSalesExperimentProtocol(owner.merchantId, owner.userId, value);
  const get = (protocolId: number) => getSalesExperimentProtocol(owner.merchantId, { protocolId });
  const withdrawal = (row: { protocolId: number; protocolDigest: string }) => ({ protocolId: row.protocolId, protocolDigest: row.protocolDigest,
    requestId: randomUUID(), reason: 'A documented safety regression requires withdrawing this prospective design.' });
  const withdraw = (value: ReturnType<typeof withdrawal>) => withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, value);
  beforeEach(async () => {
    owner = await createDisposableMerchant('sales-protocol'); other = await createDisposableMerchant('sales-protocol-other'); users = [owner.userId, other.userId];
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Preregistration must not call providers or send messages'); }));
    const conversationId = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000288')", [owner.merchantId])).insertId;
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
    input = { candidateId: candidate.id, artifactDigest: candidate.artifactDigest, expectedSectorRevision: 0,
      requestId: randomUUID(), design: syntheticSalesExperimentDesign() };
  });
  afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);
  it('freezes the exact design and comparison basis without approval, payment, messages or AI spend', async () => {
    const before = await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId]);
    const saved = await register(), view = await get(saved.protocolId);
    expect(view).toMatchObject({ state: 'registered', activationAllowed: false, experimentStarted: false, eligibility: 'not_checked',
      actorUserId: owner.userId, withdrawal: null, protocol: { design: input.design, sampleAdequacy: 'not_independently_verified',
        cohortExecution: 'not_implemented', candidate: { id: input.candidateId, artifactDigest: input.artifactDigest }, sector: { revision: 0, playbook: { id: 'general' } } } });
    expect(await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId])).toEqual(before);
    for (const table of ['ai_learning_policy_evaluations', 'ai_purchase_outcomes', 'ai_learning_policy_output_reviews']) expect(await query(`SELECT id FROM ${table} WHERE merchant_id=?`, [owner.merchantId])).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain('Private synthetic evidence'); expect(JSON.stringify(view)).not.toContain('966500000288');
  });
  it('deduplicates simultaneous identical requests and rejects changes under the same key', async () => {
    const saved = await Promise.all(Array.from({ length: 5 }, () => register())); expect(new Set(saved.map(row => row.protocolId)).size).toBe(1);
    expect(await register({ ...input, requestId: input.requestId.toUpperCase() })).toMatchObject({ reused: true });
    await expect(register({ ...input, design: { ...input.design, title: 'Altered measurement plan' } })).rejects.toThrow();
    await expect(registerSalesExperimentProtocol(owner.merchantId, other.userId, input)).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each([500, 1773])('rejects an underpowered count %i even when called directly', async count => {
    input.design.sample.minimumCustomersPerArm = count;
    await expect(register()).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('freezes the exact sample calculation at its ceiling without claiming independent approval', async () => {
    input.design.sample.minimumCustomersPerArm = 1774;
    const saved = await register(), replay = await register(), loaded = await get(saved.protocolId);
    expect(saved.protocol.sampleCalculation).toEqual(calculateSalesExperimentSample(input.design.sample));
    expect(loaded.protocol.sampleCalculation).toEqual(saved.protocol.sampleCalculation);
    expect(replay).toMatchObject({ reused: true, activationAllowed: false, protocol: { sampleAdequacy: 'not_independently_verified', sampleCalculation: { requiredPerArm: 1774, requiredTotal: 3548, status: 'meets_calculated_floor' } } });
  });
  it('rejects a sample beyond the supported ceiling without clamping or writing', async () => {
    Object.assign(input.design.sample, { minimumCustomersPerArm: 1000000, baselineConversionBps: 5000, minimumAbsoluteLiftBps: 1 });
    await expect(register()).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('applies the expected-count guard for sparse proportions before persistence', async () => {
    Object.assign(input.design.sample, { minimumCustomersPerArm: 30, baselineConversionBps: 1, minimumAbsoluteLiftBps: 8000 });
    await expect(register()).rejects.toThrow(); input.design.sample.minimumCustomersPerArm = 100000;
    expect((await register()).protocol.sampleCalculation).toMatchObject({ approximationFloorPerArm: 100000, requiredPerArm: 100000 });
  });
  it('reads and replays an insufficient legacy record unchanged after source drift and withdrawal', async () => {
    const saved = await register(), legacy: any = structuredClone(saved.protocol); delete legacy.sampleCalculation;
    input.design.sample.minimumCustomersPerArm = 500; legacy.design = structuredClone(input.design);
    const digest = policyArtifactDigest(legacy), payload = policyArtifactDigest({ actor: owner.userId, input });
    await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=?,payload_digest=? WHERE id=?', [JSON.stringify(legacy), digest, payload, saved.protocolId]);
    const before = await query('SELECT protocol,protocol_digest,payload_digest FROM ai_sales_experiment_protocols WHERE id=?', [saved.protocolId]);
    expect((await get(saved.protocolId)).protocol.sampleCalculation).toBeUndefined();
    expect(await register()).toMatchObject({ reused: true, protocol: { design: input.design } });
    await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [signalId]);
    await withdraw(withdrawal({ ...saved, protocolDigest: digest }));
    expect(await register()).toMatchObject({ reused: true, state: 'withdrawn', activationAllowed: false });
    expect(await query('SELECT protocol,protocol_digest,payload_digest FROM ai_sales_experiment_protocols WHERE id=?', [saved.protocolId])).toEqual(before);
    await expect(register({ ...input, requestId: randomUUID() })).rejects.toThrow();
  });
  it.each(['required', 'target', 'version', 'scope', 'authority', 'unknown'])('rejects altered %s calculation even with a recomputed protocol digest', async mode => {
    const saved = await register(), protocol: any = structuredClone(saved.protocol), calc = protocol.sampleCalculation;
    if (mode === 'required') calc.requiredPerArm--; if (mode === 'target') calc.targetConversionBps++;
    if (mode === 'version') calc.version = 'v2'; if (mode === 'scope') calc.scope = 'independent_approval';
    if (mode === 'authority') calc.activationAllowed = true; if (mode === 'unknown') calc.winner = 'candidate';
    await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=? WHERE id=?', [JSON.stringify(protocol), policyArtifactDigest(protocol), saved.protocolId]);
    await expect(get(saved.protocolId)).rejects.toThrow(); await expect(register()).rejects.toThrow();
  });
  it('permits only one registered protocol under competing registrations', async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => register({ ...input, requestId: randomUUID() })));
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(await query("SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=? AND state='registered'", [owner.merchantId])).toHaveLength(1);
  });
  it('rejects foreign candidate ids, reads, withdrawals and history leakage', async () => {
    await expect(registerSalesExperimentProtocol(other.merchantId, other.userId, input)).rejects.toThrow();
    const saved = await register();
    await expect(getSalesExperimentProtocol(other.merchantId, { protocolId: saved.protocolId })).rejects.toThrow();
    await expect(withdrawSalesExperimentProtocol(other.merchantId, other.userId, withdrawal(saved))).rejects.toThrow();
    expect(await getSalesExperimentProtocolHistory(other.merchantId, {})).toEqual({ items: [], nextBeforeId: null });
    expect((await get(saved.protocolId)).state).toBe('registered');
  });
  it.each(['digest', 'source', 'revision'] as const)('rejects stale %s at registration', async mode => {
    if (mode === 'digest') input.artifactDigest = 'b'.repeat(64);
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed source' WHERE id=?", [signalId]);
    if (mode === 'revision') await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, playbookId: 'training', expectedRevision: 0 });
    await expect(register()).rejects.toThrow(); expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('uses database time even when the caller process clock is moved backwards', async () => {
    input.design = syntheticSalesExperimentDesign(Date.now() - 100 * 86_400_000);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 1000 * 86_400_000);
    await expect(register()).rejects.toThrow();
  });
  it('keeps historical registration and exact retry after sector/source drift without claiming freshness', async () => {
    const saved = await register();
    await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, playbookId: 'training', expectedRevision: 0 });
    await query("UPDATE sari_learning_signals SET customer_message='Changed source' WHERE id=?", [signalId]);
    expect(await register()).toMatchObject({ protocolId: saved.protocolId, reused: true, eligibility: 'not_checked', activationAllowed: false });
    expect((await get(saved.protocolId)).protocol.sector.playbook.id).toBe('general');
    await expect(register({ ...input, requestId: randomUUID(), expectedSectorRevision: 1 })).rejects.toThrow();
  });
  it('records withdrawal once, preserves the protocol bytes and never supplies a winner', async () => {
    const saved = await register(), w = withdrawal(saved), before = await get(saved.protocolId);
    const results = await Promise.all(Array.from({ length: 5 }, () => withdraw(w)));
    expect(results.every(row => row.state === 'withdrawn')).toBe(true);
    const after = await get(saved.protocolId); expect(after.protocol).toEqual(before.protocol); expect(after.protocolDigest).toBe(before.protocolDigest);
    expect(after.withdrawal).toMatchObject({ reason: w.reason, actorUserId: owner.userId, winner: null });
    expect(await register()).toMatchObject({ reused: true, state: 'withdrawn', activationAllowed: false });
    await expect(withdraw({ ...w, reason: 'A different reason cannot replace the recorded withdrawal.' })).rejects.toThrow();
    await expect(withdraw({ ...w, requestId: randomUUID() })).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_withdrawals WHERE protocol_id=?', [saved.protocolId])).toHaveLength(1);
  });
  it('serializes conflicting withdrawal reasons and releases the registration slot only once', async () => {
    const saved = await register(), results = await Promise.allSettled([withdraw(withdrawal(saved)), withdraw(withdrawal(saved))]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const next = await register({ ...input, requestId: randomUUID(), design: { ...input.design, title: 'Replacement prospective protocol' } });
    expect(next.protocolId).not.toBe(saved.protocolId); expect((await get(saved.protocolId)).state).toBe('withdrawn');
  });
  it('rejects wrong protocol digest and reusing a withdrawal request for a different protocol', async () => {
    const first = await register(), w = withdrawal(first);
    await expect(withdraw({ ...w, protocolDigest: 'f'.repeat(64) })).rejects.toThrow(); await withdraw(w);
    const next = await register({ ...input, requestId: randomUUID() });
    await expect(withdraw({ ...withdrawal(next), requestId: w.requestId })).rejects.toThrow();
    expect((await get(next.protocolId)).state).toBe('registered');
  });
  it.each(['registration', 'withdrawal'] as const)('snapshots %s input before any async lock', async operation => {
    if (operation === 'registration') {
      const pending = register(); input.design.title = 'Mutated after submission';
      expect((await pending).protocol.design.title).not.toBe(input.design.title);
    } else {
      const w = withdrawal(await register()), pending = withdraw(w); w.reason = 'Mutated after submission but before the transaction.';
      expect((await pending).withdrawal!.reason).not.toBe(w.reason);
    }
  });
  it.each(['protocol', 'digest', 'withdrawal', 'missing withdrawal'] as const)('fails closed for damaged %s evidence', async mode => {
    const saved = await register();
    if (mode === 'protocol') await query("UPDATE ai_sales_experiment_protocols SET protocol=JSON_SET(protocol,'$.design.sample.minimumCustomersPerArm',1) WHERE id=?", [saved.protocolId]);
    if (mode === 'digest') await query("UPDATE ai_sales_experiment_protocols SET protocol_digest=REPEAT('b',64) WHERE id=?", [saved.protocolId]);
    if (mode.includes('withdrawal')) {
      await withdraw(withdrawal(saved));
      if (mode === 'withdrawal') await query("UPDATE ai_sales_experiment_withdrawals SET withdrawal=JSON_SET(withdrawal,'$.reason','forged') WHERE protocol_id=?", [saved.protocolId]);
      else await query('DELETE FROM ai_sales_experiment_withdrawals WHERE protocol_id=?', [saved.protocolId]);
    }
    await expect(get(saved.protocolId)).rejects.toThrow(); await expect(register()).rejects.toThrow();
    await expect(getSalesExperimentProtocolHistory(owner.merchantId, {})).rejects.toThrow();
  });
  it.each(['registration', 'withdrawal'] as const)('recovers an unknown committed %s acknowledgment idempotently', async operation => {
    const w = operation === 'withdrawal' ? withdrawal(await register()) : null;
    const pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original(); return new Proxy(c, { get(target, key) {
        if (key === 'commit') return async () => { await target.commit(); throw Error('Lost acknowledgment'); };
        const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }) as any;
    });
    const call = () => w ? withdraw(w) : register(); await expect(call()).rejects.toThrow(); vi.restoreAllMocks();
    expect(await call()).toMatchObject({ reused: true });
    expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each(['activation', 'sample claim', 'retroactive', 'unknown field'] as const)('rejects invalid stored %s even with a recomputed checksum', async mode => {
    const saved = await register(), protocol: any = structuredClone(saved.protocol);
    if (mode === 'activation') protocol.activationAllowed = true;
    if (mode === 'sample claim') protocol.sampleAdequacy = 'verified';
    if (mode === 'retroactive') protocol.registeredAt = protocol.design.window.enrollmentEndsAt;
    if (mode === 'unknown field') protocol.winner = 'candidate';
    await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=? WHERE id=?', [JSON.stringify(protocol), policyArtifactDigest(protocol), saved.protocolId]);
    await expect(get(saved.protocolId)).rejects.toThrow();
  });
  it('paginates immutable history without gaps when newer protocols are registered', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) { const row = await register({ ...input, requestId: randomUUID() }); ids.push(row.protocolId); await withdraw(withdrawal(row)); }
    const first = await getSalesExperimentProtocolHistory(owner.merchantId, { limit: 2 });
    await register({ ...input, requestId: randomUUID() }); const seen = first.items.map(row => row.protocolId); let cursor = first.nextBeforeId;
    while (cursor) { const page = await getSalesExperimentProtocolHistory(owner.merchantId, { limit: 2, beforeId: cursor }); seen.push(...page.items.map(row => row.protocolId)); cursor = page.nextBeforeId; }
    expect(seen).toEqual(ids.reverse());
  });
  it('keeps the audit after actor deletion and cascades it with the owning candidate', async () => {
    const row = await registerSalesExperimentProtocol(owner.merchantId, other.userId, input);
    await withdrawSalesExperimentProtocol(owner.merchantId, other.userId, withdrawal(row));
    await query('DELETE FROM users WHERE id=?', [other.userId]);
    expect(await get(row.protocolId)).toMatchObject({ actorUserId: null, withdrawal: { actorUserId: null } });
    await query('DELETE FROM ai_learning_policy_candidates WHERE id=?', [input.candidateId]);
    expect(await query('SELECT id FROM ai_sales_experiment_protocols WHERE id=?', [row.protocolId])).toHaveLength(0);
    expect(await query('SELECT id FROM ai_sales_experiment_withdrawals WHERE protocol_id=?', [row.protocolId])).toHaveLength(0);
  });
  it('enforces the active slot/state invariant in SQL and treats SQL-shaped prose as data', async () => {
    input.design.title = "Plan ' OR 1=1 --"; const row = await register();
    expect((await get(row.protocolId)).protocol.design.title).toBe(input.design.title);
    for (const sql of ["state='active'", 'active_slot=NULL', 'active_slot=2', "state='withdrawn'"]) await expect(query(`UPDATE ai_sales_experiment_protocols SET ${sql} WHERE id=?`, [row.protocolId])).rejects.toThrow();
    expect((await get(row.protocolId)).state).toBe('registered');
  });
});
