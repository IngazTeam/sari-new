import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { authorizeSalesExperimentLaunch, prepareSalesExperimentLaunch, revokeSalesExperimentLaunch, getSalesExperimentLaunchStatus } from './sales-experiment-launch';
import { recordSalesExperimentReview, prepareSalesExperimentReview } from './sales-experiment-review';
import { recordLearningPolicyOutputReview } from './learning-policy-output-review';
import { startLearningPolicyEvaluation } from './learning-policy-evaluation';
import { withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import { updateSalesSectorSettings } from './sales-sector-settings';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import type { AuthorizeSalesExperimentLaunchInput, RevokeSalesExperimentLaunchInput } from './sales-experiment-launch-contract';

const route = vi.hoisted(() => ({ enabled: true, model: 'synthetic-model', fail: false }));
vi.mock('../db_ai_settings', () => ({ getActiveModel: async () => route.model,
  getZahyPiRuntimeMetadata: async () => { if (route.fail) throw Error('Private configuration outage'); return { enabled: route.enabled, provider: 'openai', model: route.model, source: 'database' }; } }));
const time = vi.hoisted(() => ({ unix: null as number | null }));
vi.mock('./checkout-agreements', async original => {
  const actual = await original<typeof import('./checkout-agreements')>();
  return { ...actual, checkoutTransaction: (run: any) => actual.checkoutTransaction(async c => {
    if (time.unix !== null) await c.query('SET timestamp=?', [time.unix]);
    try { return await run(c); } finally { if (time.unix !== null) await c.query('SET timestamp=DEFAULT'); }
  }) };
});

describe.skipIf(!process.env.DATABASE_URL)('durable sales experiment launch authorization', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, reviewer: typeof owner, operator: typeof owner, users: number[];
  let seeded: Awaited<ReturnType<typeof seedApprovedSalesPlan>>, input: AuthorizeSalesExperimentLaunchInput;
  const children: ChildProcess[] = [];
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const failAfterStatement = async (pattern: RegExp) => {
    const pool = (await getPool())!, getConnection = pool.getConnection.bind(pool); let failures = 0;
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await getConnection(), execute = c.execute.bind(c), release = c.release.bind(c);
      // Run the actual SQL first. Throwing afterwards must roll back its durable writes.
      c.execute = async (sql: string, ...args: any[]) => {
        const result = await execute(sql, ...args);
        if (pattern.test(sql)) { failures++; throw Error('Synthetic failure after SQL'); }
        return result;
      };
      c.release = () => { c.execute = execute; c.release = release; release(); };
      return c;
    });
    return () => failures;
  };
  const prepare = () => prepareSalesExperimentLaunch(owner.merchantId, { protocolId: seeded.protocol.protocolId });
  const save = (value = input, actor = operator.userId) => authorizeSalesExperimentLaunch(owner.merchantId, actor, value);
  const status = () => getSalesExperimentLaunchStatus(owner.merchantId, { protocolId: input.protocolId });
  const revokeInput = (saved: Awaited<ReturnType<typeof save>>): RevokeSalesExperimentLaunchInput => ({ launchId: saved.launchId,
    launchDigest: saved.launchDigest, requestId: randomUUID(), reason: 'Stop this authorization permanently to investigate the safety conditions.' });
  beforeEach(async () => {
    route.enabled = true; route.model = 'synthetic-model'; route.fail = false; time.unix = null; users = [];
    owner = await createDisposableMerchant('launch-owner'); users.push(owner.userId);
    reviewer = await createDisposableMerchant('launch-reviewer'); users.push(reviewer.userId);
    operator = await createDisposableMerchant('launch-operator'); users.push(operator.userId);
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Authorization must not call any provider'); }));
    seeded = await seedApprovedSalesPlan(owner, reviewer.userId);
    const p = await prepare();
    input = { protocolId: seeded.protocol.protocolId, requestId: randomUUID(), basisDigest: p.basisDigest,
      reviewId: p.basis.reviewId, reviewDigest: p.basis.reviewDigest, reason: 'Authorize this exact independently reviewed plan within its frozen window.',
      reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true };
  });
  afterEach(async () => {
    time.unix = null;
    for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>(done => child.once('exit', () => done())); child.kill('SIGKILL'); await stopped;
    }
    await cleanupDisposableMerchants(users); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  afterAll(closeDb);

  it('requires explicit authorization and preserves planning, outputs and budget without sending', async () => {
    expect(await status()).toMatchObject({ stage: 'not_authorized', authorizationCurrent: false });
    const protocolBefore = await query('SELECT * FROM ai_sales_experiment_protocols WHERE id=?', [input.protocolId]);
    const reviewsBefore = await query('SELECT * FROM ai_sales_experiment_reviews WHERE protocol_id=?', [input.protocolId]);
    const saved = await save();
    expect(saved).toMatchObject({ reused: false, state: 'authorized', eligibility: 'not_checked', experimentStarted: false, assignmentCreated: false,
      snapshot: { actorUserId: operator.userId, basis: { reviewId: seeded.review.reviewId } } });
    expect((await prepare()).canAuthorize).toBe(false);
    expect(await status()).toMatchObject({ stage: 'scheduled', authorizationCurrent: true, activationAllowed: false });
    expect(await query('SELECT * FROM ai_sales_experiment_protocols WHERE id=?', [input.protocolId])).toEqual(protocolBefore);
    expect(await query('SELECT * FROM ai_sales_experiment_reviews WHERE protocol_id=?', [input.protocolId])).toEqual(reviewsBefore);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT reservation_key FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`])).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('serializes concurrent identical requests to one immutable authorization', async () => {
    const saved = await Promise.all([save(), save(), save()]);
    expect(new Set(saved.map(s => s.launchId)).size).toBe(1); expect(saved.filter(s => !s.reused)).toHaveLength(1);
    await expect(save({ ...input, reason: input.reason + ' changed' })).rejects.toThrow();
    await expect(save(input, owner.userId)).rejects.toThrow();
  });
  it('allows only one winner for distinct simultaneous requests and never a second authorization', async () => {
    const saved = await Promise.allSettled([save(), save({ ...input, requestId: randomUUID() })]);
    expect(saved.filter(s => s.status === 'fulfilled')).toHaveLength(1);
    await expect(save({ ...input, requestId: randomUUID() })).rejects.toThrow();
  });
  it.each(['basisDigest', 'reviewDigest', 'reviewId'])('rejects a forged %s before authorization is recorded', async field => {
    await expect(save({ ...input, [field]: field === 'reviewId' ? input.reviewId + 1 : 'f'.repeat(64) })).rejects.toThrow();
    expect((await status()).authorization).toBeNull();
  });
  it.each(['source', 'sector', 'route', 'disabled', 'missing_cohort', 'missing_planning_review', 'deleted_reviewer', 'deleted_preparer', 'missing_outputs', 'changed_output', 'new_run', 'new_output_review', 'new_planning_review', 'rejected', 'withdrawn'])('blocks %s drift before and after authorization', async mode => {
    const saved = await save();
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seeded.signalId]);
    if (mode === 'sector') await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, playbookId: 'training', expectedRevision: 0 });
    if (mode === 'route') route.model = 'new-model'; if (mode === 'disabled') route.enabled = false;
    if (mode === 'missing_cohort') await query('DELETE FROM ai_sales_experiment_cohorts WHERE id=?', [seeded.cohort.cohortId]);
    if (mode === 'missing_planning_review') await query('DELETE FROM ai_sales_experiment_reviews WHERE id=?', [seeded.review.reviewId]);
    if (mode === 'deleted_reviewer') await query('UPDATE ai_sales_experiment_reviews SET actor_user_id=NULL WHERE id=?', [seeded.review.reviewId]);
    if (mode === 'deleted_preparer') await query('UPDATE ai_learning_policy_evaluations SET actor_user_id=NULL WHERE id=?', [seeded.runId]);
    if (mode === 'missing_outputs') await query('DELETE FROM ai_learning_policy_evaluation_samples WHERE run_id=? AND ordinal=0', [seeded.runId]);
    if (mode === 'changed_output') await query("UPDATE ai_learning_policy_evaluation_samples SET response_text='Changed output' WHERE run_id=? AND ordinal=0", [seeded.runId]);
    if (mode === 'new_run') await startLearningPolicyEvaluation(owner.merchantId, owner.userId, { candidateId: seeded.protocol.protocol.candidate.id, artifactDigest: seeded.protocol.protocol.candidate.artifactDigest, requestId: randomUUID() });
    if (mode === 'new_output_review') await recordLearningPolicyOutputReview(owner.merchantId, owner.userId, { ...seeded.outputInput, expectedRevision: 1, requestId: randomUUID() });
    if (mode === 'new_planning_review' || mode === 'rejected') await recordSalesExperimentReview(owner.merchantId, reviewer.userId,
      { ...seeded.reviewInput, expectedRevision: 1, verdict: mode === 'rejected' ? 'rejected' : 'approved', requestId: randomUUID() });
    if (mode === 'withdrawn') await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: input.protocolId,
      protocolDigest: seeded.protocol.protocolDigest, requestId: randomUUID(), reason: 'Withdraw the synthetic protocol after discovering a safety concern.' });
    expect(await status()).toMatchObject({ authorizationCurrent: false, stage: 'stale' });
    expect(await save()).toMatchObject({ launchId: saved.launchId, reused: true, eligibility: 'not_checked' });
    await expect(save({ ...input, requestId: randomUUID() })).rejects.toThrow();
    expect(await revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revokeInput(saved))).toMatchObject({ state: 'revoked' });
  });
  it('blocks initial authorization when the displayed review is superseded', async () => {
    await recordSalesExperimentReview(owner.merchantId, reviewer.userId, { ...seeded.reviewInput, expectedRevision: 1, requestId: randomUUID() });
    await expect(save()).rejects.toThrow(); expect((await status()).authorization).toBeNull();
    const next = await prepare(); expect(next.canAuthorize).toBe(true);
    expect((await save({ ...input, basisDigest: next.basisDigest, reviewId: next.basis.reviewId, reviewDigest: next.basis.reviewDigest })).state).toBe('authorized');
  });
  it('does not convert configuration failure into current authority or prevent revocation', async () => {
    const saved = await save(); route.fail = true;
    expect(await status()).toMatchObject({ stage: 'unavailable', authorizationCurrent: false });
    expect((await revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revokeInput(saved))).state).toBe('revoked');
  });
  it.each(['authorization', 'revocation'])('recovers the exact %s after the commit acknowledgement is lost', async mode => {
    const saved = mode === 'revocation' ? await save() : null, revoke = saved ? revokeInput(saved) : null;
    const pool = (await getPool())!, getConnection = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c = await getConnection(), commit = c.commit.bind(c);
      c.commit = async () => { c.commit = commit; await commit(); throw Error('Synthetic lost commit acknowledgement'); };
      return c;
    });
    const operation = () => revoke ? revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revoke) : save();
    await expect(operation()).rejects.toThrow('Synthetic lost commit acknowledgement');
    const recovered = await operation(); expect(recovered.reused).toBe(true);
    expect(recovered.state).toBe(saved ? 'revoked' : 'authorized');
    expect(await query('SELECT id FROM ai_sales_experiment_launches WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM ai_sales_experiment_launch_revocations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(saved ? 1 : 0);
  });
  it('permanently revokes once, safely recovers both receipts, and prohibits restart', async () => {
    const saved = await save(), revoke = revokeInput(saved);
    const records = await Promise.all([revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revoke), revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revoke)]);
    expect(records.filter(s => !s.reused)).toHaveLength(1);
    expect(records[0].revocation?.snapshot).toMatchObject({ restartAllowed: false, winner: null, actorUserId: operator.userId });
    expect(await save()).toMatchObject({ state: 'revoked', reused: true, launchId: saved.launchId });
    expect(await status()).toMatchObject({ stage: 'revoked', authorizationCurrent: false });
    await expect(save({ ...input, requestId: randomUUID() })).rejects.toThrow();
    for (const v of [{ ...revoke, reason: revoke.reason + ' changed' }, { ...revoke, requestId: randomUUID() }]) await expect(revokeSalesExperimentLaunch(owner.merchantId, operator.userId, v)).rejects.toThrow();
    await expect(revokeSalesExperimentLaunch(owner.merchantId, owner.userId, revoke)).rejects.toThrow();
  });
  it('retains the record after operator deletion, revokes current authority and permits another operator to stop it', async () => {
    const saved = await save(); await cleanupDisposableMerchants([operator.userId]); users = [owner.userId, reviewer.userId];
    expect(await status()).toMatchObject({ stage: 'stale', authorizationCurrent: false, authorization: { actorPresent: false } });
    expect((await revokeSalesExperimentLaunch(owner.merchantId, owner.userId, revokeInput(saved))).state).toBe('revoked');
  });
  it.each(['authorization', 'revocation'])('rolls back %s when durable audit recording fails', async mode => {
    const saved = mode === 'revocation' ? await save() : null;
    const table = mode === 'authorization' ? 'ai_sales_experiment_launches' : 'ai_sales_experiment_launch_revocations';
    const failures = await failAfterStatement(new RegExp(`^\\s*INSERT INTO ${table}\\b`));
    await expect(saved ? revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revokeInput(saved)) : save()).rejects.toThrow('Synthetic failure after SQL');
    expect(failures()).toBe(1); expect(await status()).toMatchObject({ stage: saved ? 'scheduled' : 'not_authorized' });
    expect(await query('SELECT id FROM ai_sales_experiment_launch_revocations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('rolls back the revocation audit if the state transition fails', async () => {
    const saved = await save(), failures = await failAfterStatement(/^UPDATE ai_sales_experiment_launches SET state='revoked'/);
    await expect(revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revokeInput(saved))).rejects.toThrow('Synthetic failure after SQL');
    expect(failures()).toBe(1); expect((await status()).stage).toBe('scheduled');
    expect(await query('SELECT id FROM ai_sales_experiment_launch_revocations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it.each(['snapshot_digest', 'basis', 'review', 'identity', 'actor', 'window', 'authority', 'extra'])('rejects corrupted %s authorization on reads and replay', async mode => {
    const saved = await save(), s: any = structuredClone(saved.snapshot);
    if (mode === 'snapshot_digest') s.reason += ' changed'; if (mode === 'basis') s.basisDigest = 'a'.repeat(64);
    if (mode === 'review') s.basis.review.assessment.baselineAndSample += ' changed';
    if (mode === 'identity') s.merchantId = reviewer.merchantId; if (mode === 'actor') s.actorUserId = reviewer.userId;
    if (mode === 'window') s.basis.window.enrollmentStartsAt = s.authorizedAt;
    if (mode === 'authority') s.experimentStarted = true; if (mode === 'extra') s.winner = 'candidate';
    await query('UPDATE ai_sales_experiment_launches SET snapshot=?,launch_digest=? WHERE id=?', [JSON.stringify(s), mode === 'snapshot_digest' ? saved.launchDigest : policyArtifactDigest(s), saved.launchId]);
    await expect(status()).rejects.toThrow(); await expect(save()).rejects.toThrow();
  });
  it.each(['digest', 'identity', 'actor', 'time', 'restart', 'extra'])('rejects corrupted %s revocation on historical reads and retry', async mode => {
    const saved = await save(), v = revokeInput(saved), stopped = await revokeSalesExperimentLaunch(owner.merchantId, operator.userId, v), s: any = structuredClone(stopped.revocation!.snapshot);
    if (mode === 'digest') s.reason += ' altered'; if (mode === 'identity') s.launchId++;
    if (mode === 'actor') s.actorUserId = owner.userId; if (mode === 'time') s.revokedAt = '2000-01-01T00:00:00.000Z';
    if (mode === 'restart') s.restartAllowed = true; if (mode === 'extra') s.score = 99;
    await query('UPDATE ai_sales_experiment_launch_revocations SET snapshot=?,revocation_digest=? WHERE launch_id=?', [JSON.stringify(s), mode === 'digest' ? stopped.revocation!.revocationDigest : policyArtifactDigest(s), saved.launchId]);
    await expect(status()).rejects.toThrow(); await expect(revokeSalesExperimentLaunch(owner.merchantId, operator.userId, v)).rejects.toThrow();
  });
  it.each(['missing', 'unexpected'])('rejects %s revocation rows rather than inferring state', async mode => {
    const saved = await save();
    if (mode === 'missing') await query("UPDATE ai_sales_experiment_launches SET state='revoked' WHERE id=?", [saved.launchId]);
    else { await revokeSalesExperimentLaunch(owner.merchantId, operator.userId, revokeInput(saved)); await query("UPDATE ai_sales_experiment_launches SET state='authorized' WHERE id=?", [saved.launchId]); }
    await expect(status()).rejects.toThrow(); await expect(save()).rejects.toThrow();
  });
  it('isolates launch identities, preparation, status, authorization and revocation by merchant', async () => {
    const saved = await save();
    await expect(prepareSalesExperimentLaunch(reviewer.merchantId, { protocolId: input.protocolId })).rejects.toThrow();
    await expect(getSalesExperimentLaunchStatus(reviewer.merchantId, { protocolId: input.protocolId })).rejects.toThrow();
    await expect(authorizeSalesExperimentLaunch(reviewer.merchantId, reviewer.userId, input)).rejects.toThrow();
    await expect(revokeSalesExperimentLaunch(reviewer.merchantId, reviewer.userId, revokeInput(saved))).rejects.toThrow();
    expect((await status()).stage).toBe('scheduled');
  });
  it('snapshots submitted input before awaiting a transaction lock', async () => {
    const reason = input.reason, pending = save(); input.reason += ' Changed after submission.';
    expect((await pending).snapshot.reason).toBe(reason);
  });
  it('uses database time for open/closed windows while preserving the pre-start review gate', async () => {
    await save(); const w = seeded.protocol.protocol.design.window;
    const start = Date.parse(w.enrollmentStartsAt), end = Date.parse(w.enrollmentEndsAt);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    for (const [milliseconds, stage] of [[start - 1, 'scheduled'], [start, 'enrollment_open'], [end - 1, 'enrollment_open'], [end, 'enrollment_closed']] as const) {
      time.unix = milliseconds / 1000;
      const current = await status(); expect(current.checkedAt).toBe(new Date(milliseconds).toISOString()); expect(current.stage).toBe(stage);
      expect(current).toMatchObject({ authorizationCurrent: true, activationAllowed: false, experimentStarted: false });
      if (milliseconds >= start) await expect(prepareSalesExperimentReview(owner.merchantId, reviewer.userId, { protocolId: input.protocolId, runId: seeded.runId })).rejects.toThrow();
    }
  });
  it('cannot first authorize at the enrollment boundary despite a backwards application clock', async () => {
    time.unix = Date.parse(seeded.protocol.protocol.design.window.enrollmentStartsAt) / 1000;
    vi.spyOn(Date, 'now').mockReturnValue(0);
    expect((await prepare()).canAuthorize).toBe(false); await expect(save()).rejects.toThrow();
    expect((await status()).authorization).toBeNull();
  });
  it('fails closed when the database clock precedes the recorded authorization', async () => {
    const saved = await save(); time.unix = (Date.parse(saved.snapshot.authorizedAt) - 1000) / 1000;
    expect(await status()).toMatchObject({ stage: 'unavailable', authorizationCurrent: false });
  });
  it('serializes revocation across two independent processes', async () => {
    const saved = await save(), v = revokeInput(saved);
    const spawn = () => {
      const child = fork(resolve('server/tests/helpers/sales-launch-child.ts'), [String(owner.merchantId), String(operator.userId), JSON.stringify(v)],
        { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
      children.push(child);
      let readyResolve: () => void, doneResolve: (value: any) => void;
      const ready = new Promise<void>(done => { readyResolve = done; }), done = new Promise<any>(resolve => { doneResolve = resolve; });
      child.on('message', (event: any) => { if (event.phase === 'ready') readyResolve(); if (event.phase === 'done') doneResolve(event); });
      return { child, ready, done };
    };
    const workers = [spawn(), spawn()]; await Promise.all(workers.map(w => w.ready)); workers.forEach(w => w.child.send('run'));
    const results = await Promise.all(workers.map(w => w.done)); expect(results.every(r => !r.failed)).toBe(true);
    expect(new Set(results.map(r => r.result.revocation.revocationId)).size).toBe(1); expect(results.filter(r => !r.result.reused)).toHaveLength(1);
    expect((await status()).stage).toBe('revoked');
  }, 60000);
});
