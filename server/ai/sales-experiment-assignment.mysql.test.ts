import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { authorizeSalesExperimentLaunch, prepareSalesExperimentLaunch, revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer, getSalesExperimentAssignment } from './sales-experiment-assignment';
import { inspectSalesExperimentCohort, freezeSalesExperimentCohort } from './sales-experiment-cohort';
import { withdrawSalesExperimentProtocol, registerSalesExperimentProtocol } from './sales-experiment-protocol';
import { prepareSalesExperimentReview, recordSalesExperimentReview } from './sales-experiment-review';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import type { AssignSalesExperimentInput } from './sales-experiment-assignment-contract';

const state = vi.hoisted(() => ({ unix: null as number | null, arm: 0, enabled: true, model: 'synthetic-model', fail: false }));
vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(), randomInt: vi.fn(() => state.arm) }));
vi.mock('../db_ai_settings', () => ({ getActiveModel: async () => state.model,
  getZahyPiRuntimeMetadata: async () => { if (state.fail) throw Error('Synthetic private route failure'); return { enabled: state.enabled, provider: 'openai', model: state.model, source: 'database' }; } }));
vi.mock('./checkout-agreements', async original => {
  const actual = await original<typeof import('./checkout-agreements')>();
  return { ...actual, checkoutTransaction: (run: any) => actual.checkoutTransaction(async c => {
    if (state.unix !== null) await c.query('SET timestamp=?', [state.unix]);
    try { return await run(c); } finally { if (state.unix !== null) await c.query('SET timestamp=DEFAULT'); }
  }) };
});

describe.skipIf(!process.env.DATABASE_URL)('durable sales experiment customer assignment', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, reviewer: typeof owner, stranger: typeof owner;
  let seeded: Awaited<ReturnType<typeof seedApprovedSalesPlan>>, launch: Awaited<ReturnType<typeof authorizeSalesExperimentLaunch>>, input: AssignSalesExperimentInput;
  let users: number[];
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const enroll = (value = input, merchant = owner.merchantId) => assignSalesExperimentCustomer(merchant, value);
  const history = (assignmentId: number, merchant = owner.merchantId) => getSalesExperimentAssignment(merchant, { assignmentId });
  const revoke = () => revokeSalesExperimentLaunch(owner.merchantId, owner.userId, { launchId: launch.launchId, launchDigest: launch.launchDigest,
    requestId: randomUUID(), reason: 'Stop the synthetic enrollment to investigate safety conditions.' });
  async function source(phone = '966500000888', merchant = owner.merchantId) {
    const conversationId = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,?,'active','new')", [merchant, phone])).insertId);
    const incomingMessageId = Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','أريد معرفة العرض المناسب',?)",
      [conversationId, new Date(state.unix! * 1000).toISOString().slice(0, 19).replace('T', ' ')])).insertId);
    return { conversationId, incomingMessageId };
  }
  beforeEach(async () => {
    state.unix = null; state.arm = 0; state.enabled = true; state.model = 'synthetic-model'; state.fail = false; users = []; vi.mocked(randomInt).mockClear();
    owner = await createDisposableMerchant('assign-owner'); users.push(owner.userId);
    reviewer = await createDisposableMerchant('assign-reviewer'); users.push(reviewer.userId);
    stranger = await createDisposableMerchant('assign-stranger'); users.push(stranger.userId);
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Enrollment must not call providers'); }));
    seeded = await seedApprovedSalesPlan(owner, reviewer.userId);
    const prepared = await prepareSalesExperimentLaunch(owner.merchantId, { protocolId: seeded.protocol.protocolId });
    launch = await authorizeSalesExperimentLaunch(owner.merchantId, owner.userId, { protocolId: seeded.protocol.protocolId,
      requestId: randomUUID(), basisDigest: prepared.basisDigest, reviewId: prepared.basis.reviewId, reviewDigest: prepared.basis.reviewDigest,
      reason: 'Authorize the frozen independently reviewed synthetic experiment.', reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true });
    state.unix = Math.ceil(Date.parse(prepared.basis.window.enrollmentStartsAt) / 1000) + 60;
    input = { protocolId: seeded.protocol.protocolId, launchId: launch.launchId, launchDigest: launch.launchDigest, ...await source() };
  });
  afterEach(async () => { state.unix = null; await cleanupDisposableMerchants(users); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(closeDb);

  it.each([0, 1])('persists server-selected arm %s, bound evidence and the full observation window without dispatch', async arm => {
    state.arm = arm; const result = await enroll(); expect(result.kind).toBe('assigned'); if (result.kind !== 'assigned') return;
    expect(result).toMatchObject({ reused: false, assignmentCreated: true, dispatchAllowed: false, activationAllowed: false, exposureRecorded: false });
    const s = result.receipt.snapshot;
    expect(s).toMatchObject({ arm: arm ? 'candidate' : 'baseline', cohortDigest: seeded.cohort.cohortDigest, launchDigest: launch.launchDigest,
      candidateId: seeded.protocol.protocol.candidate.id, baselineDigest: seeded.protocol.protocol.candidate.baselineDigest, population: 'new' });
    expect(Date.parse(s.observationEndsAt) - Date.parse(s.assignedAt)).toBe(14 * 86_400_000);
    expect(JSON.stringify(result)).not.toContain('966500000888'); expect(JSON.stringify(result)).not.toContain('أريد معرفة');
    expect(await history(result.receipt.assignmentId)).toEqual(result.receipt);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT reservation_key FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`])).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled(); expect(randomInt).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('serializes concurrent enrollment and never redraws the arm after retry or reopening storage', async () => {
    const results = await Promise.all([enroll(), enroll(), enroll()]);
    expect(results.every(r => r.kind === 'assigned')).toBe(true);
    const assigned = results.filter(r => r.kind === 'assigned'); expect(new Set(assigned.map(r => r.receipt.assignmentId)).size).toBe(1);
    expect(assigned.filter(r => !r.reused)).toHaveLength(1); expect(randomInt).toHaveBeenCalledTimes(1);
    state.arm = 1; await closeDb(); const again = await enroll(); expect(again).toMatchObject({ reused: true, receipt: { snapshot: { arm: 'baseline' } } });
    expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it('binds canonical phone aliases and subsequent inbound turns across conversations to one denominator', async () => {
    const first = await enroll(); if (first.kind !== 'assigned') throw Error('Missing assignment');
    const other = await source('+966500000888'); state.arm = 1;
    const next = await enroll({ ...input, ...other }); expect(next).toMatchObject({ reused: true, receipt: first.receipt });
    const message = await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) SELECT conversationId,direction,messageType,'Tell me more',createdAt FROM messages WHERE id=?", [other.incomingMessageId]);
    expect(await enroll({ ...input, ...other, incomingMessageId: message.insertId })).toMatchObject({ reused: true, receipt: first.receipt });
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(2);
    expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it('rejects changing a bound conversation identity, including after a new inbound message', async () => {
    await enroll(); await query("UPDATE conversations SET customerPhone='966500000889' WHERE id=?", [input.conversationId]);
    const message = await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) SELECT conversationId,direction,messageType,content,createdAt FROM messages WHERE id=?", [input.incomingMessageId]);
    await expect(enroll({ ...input, incomingMessageId: message.insertId })).rejects.toThrow('assignment changed');
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it('rechecks eligibility when an earlier inspection passed', async () => {
    const inspected = await inspectSalesExperimentCohort(owner.merchantId, { protocolId: input.protocolId, cohortDigest: seeded.cohort.cohortDigest,
      conversationId: input.conversationId, incomingMessageId: input.incomingMessageId });
    expect(inspected.qualifiesAtRead).toBe(true); expect(inspected).not.toHaveProperty('canonicalPhone');
    await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [input.conversationId]);
    expect(await enroll()).toMatchObject({ kind: 'blocked', reasons: ['human_takeover'] }); expect(randomInt).not.toHaveBeenCalled();
  });
  it.each(['human', 'inactive', 'stage', 'handoff', 'superseded', 'type', 'empty', 'phone', 'future', 'before_enrollment'])('excludes %s before creating a denominator', async mode => {
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [input.conversationId]);
    if (mode === 'inactive') await query("UPDATE conversations SET status='closed' WHERE id=?", [input.conversationId]);
    if (mode === 'stage') await query("UPDATE conversations SET deal_stage='stalled' WHERE id=?", [input.conversationId]);
    if (mode === 'handoff') await query('UPDATE conversations SET automation_after_message_id=? WHERE id=?', [input.incomingMessageId, input.conversationId]);
    if (mode === 'superseded') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','Newer source')", [input.conversationId]);
    if (mode === 'type') await query("UPDATE messages SET messageType='image' WHERE id=?", [input.incomingMessageId]);
    if (mode === 'empty') await query("UPDATE messages SET content='' WHERE id=?", [input.incomingMessageId]);
    if (mode === 'phone') await query("UPDATE conversations SET customerPhone='966 500 000 888' WHERE id=?", [input.conversationId]);
    if (mode === 'future') await query('UPDATE messages SET createdAt=DATE_ADD(createdAt,INTERVAL 1 DAY) WHERE id=?', [input.incomingMessageId]);
    if (mode === 'before_enrollment') await query('UPDATE messages SET createdAt=DATE_SUB(createdAt,INTERVAL 1 DAY) WHERE id=?', [input.incomingMessageId]);
    expect(await enroll()).toMatchObject({ kind: 'blocked', assignmentCreated: false, dispatchAllowed: false });
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0); expect(randomInt).not.toHaveBeenCalled();
  });
  it.each(['source', 'output', 'route', 'disabled', 'unavailable', 'reviewer', 'authorizer', 'withdrawn', 'revoked'])('blocks %s changes even for an existing assignment and preserves history', async mode => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seeded.signalId]);
    if (mode === 'output') await query("UPDATE ai_learning_policy_evaluation_samples SET response_text='Changed output' WHERE run_id=? AND ordinal=0", [seeded.runId]);
    if (mode === 'route') state.model = 'changed-model'; if (mode === 'disabled') state.enabled = false; if (mode === 'unavailable') state.fail = true;
    if (mode === 'reviewer') await query('UPDATE ai_sales_experiment_reviews SET actor_user_id=NULL WHERE id=?', [seeded.review.reviewId]);
    if (mode === 'authorizer') await query('UPDATE ai_sales_experiment_launches SET actor_user_id=NULL WHERE id=?', [launch.launchId]);
    if (mode === 'withdrawn') await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: input.protocolId,
      protocolDigest: seeded.protocol.protocolDigest, requestId: randomUUID(), reason: 'Withdraw the synthetic protocol after discovering a safety concern.' });
    if (mode === 'revoked') await revoke();
    expect(await enroll()).toMatchObject({ kind: 'blocked', assignmentCreated: false });
    expect(await history(saved.receipt.assignmentId)).toEqual(saved.receipt); expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it.each(['before', 'start', 'end', 'after'])('honors the exact %s SQL enrollment boundary', async boundary => {
    const w = launch.snapshot.basis.window, start = Date.parse(w.enrollmentStartsAt), end = Date.parse(w.enrollmentEndsAt);
    state.unix = (boundary === 'before' ? start - 1 : boundary === 'start' ? start : boundary === 'end' ? end : end + 1) / 1000;
    await query('UPDATE messages SET createdAt=? WHERE id=?', [new Date(Math.ceil(start / 1000) * 1000).toISOString().slice(0, 19).replace('T', ' '), input.incomingMessageId]);
    const r = await enroll();
    // Messages have second precision. At a subsecond start, the first valid message is in the next second.
    expect(r.kind).toBe(boundary === 'start' && start % 1000 === 0 ? 'assigned' : 'blocked');
    if (boundary === 'start') { state.unix = Math.ceil(start / 1000); expect((await enroll()).kind).toBe('assigned'); }
  });
  it('recovers a lost commit acknowledgement without another random draw or denominator', async () => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c = await original(), commit = c.commit.bind(c); c.commit = async () => { c.commit = commit; await commit(); throw Error('Lost commit acknowledgement'); }; return c;
    });
    await expect(enroll()).rejects.toThrow('Lost commit acknowledgement'); expect(await enroll()).toMatchObject({ reused: true }); expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it.each(['assignments', 'assignment_conversations'])('rolls back when the %s insert acknowledgement fails', async table => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool); let hit = false;
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await original(), execute = c.execute.bind(c), release = c.release.bind(c);
      c.execute = async (sql: string, ...args: any[]) => { const result = await execute(sql, ...args); if (new RegExp(`^\\s*INSERT INTO ai_sales_experiment_${table}\\b`).test(sql)) { hit = true; throw Error('Post-insert fault'); } return result; };
      c.release = () => { c.execute = execute; c.release = release; release(); }; return c;
    });
    await expect(enroll()).rejects.toThrow('Post-insert fault'); expect(hit).toBe(true);
    for (const suffix of ['assignments', 'assignment_conversations']) expect(await query(`SELECT id FROM ai_sales_experiment_${suffix} WHERE merchant_id=?`, [owner.merchantId])).toHaveLength(0);
    expect(await enroll()).toMatchObject({ reused: false });
  });
  it('serializes revocation racing enrollment and forbids any later retry', async () => {
    const results = await Promise.all([enroll(), revoke()]);
    const rows = await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId]);
    expect(rows).toHaveLength(results[0].kind === 'assigned' ? 1 : 0);
    expect(await enroll()).toMatchObject({ kind: 'blocked', reasons: ['revoked'] });
    for (const row of rows) expect(await history(Number(row.id))).toMatchObject({ dispatchAllowed: false });
  });
  it('retains denominator and conversation binding after message/conversation deletion', async () => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    await query('DELETE FROM messages WHERE conversationId=?', [input.conversationId]); await query('DELETE FROM conversations WHERE id=?', [input.conversationId]);
    expect(await history(saved.receipt.assignmentId)).toEqual(saved.receipt);
    expect(await query('SELECT id FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
    await expect(enroll()).rejects.toThrow(); expect(await enroll({ ...input, ...await source() })).toMatchObject({ reused: true, receipt: saved.receipt });
  });
  it.each(['merchant', 'conversation', 'message', 'launch', 'digest'])('rejects foreign or forged %s identity', async mode => {
    const foreign = await source('966500000777', stranger.merchantId);
    const changed = { ...input, ...(mode === 'conversation' ? foreign : mode === 'message' ? { incomingMessageId: foreign.incomingMessageId }
      : mode === 'launch' ? { launchId: launch.launchId + 100000 } : mode === 'digest' ? { launchDigest: 'f'.repeat(64) } : {}) };
    await expect(enroll(changed, mode === 'merchant' ? stranger.merchantId : owner.merchantId)).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('rejects cross-tenant history without leaking a phone or customer text', async () => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    await expect(history(saved.receipt.assignmentId, stranger.merchantId)).rejects.toThrow('assignment changed');
  });
  it.each(['arm', 'digest', 'customer', 'source', 'window', 'snapshot'])('fails closed on damaged stored %s', async mode => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    const id = saved.receipt.assignmentId;
    if (mode === 'arm') await query("UPDATE ai_sales_experiment_assignments SET arm='candidate' WHERE id=?", [id]);
    if (mode === 'digest') await query('UPDATE ai_sales_experiment_assignments SET assignment_digest=? WHERE id=?', ['f'.repeat(64), id]);
    if (mode === 'customer') await query('UPDATE ai_sales_experiment_assignments SET customer_key=? WHERE id=?', ['f'.repeat(64), id]);
    if (mode === 'source') await query('UPDATE ai_sales_experiment_assignments SET message_reference=message_reference+10000 WHERE id=?', [id]);
    if (mode === 'window') await query('UPDATE ai_sales_experiment_assignments SET observation_ends_at=DATE_ADD(observation_ends_at,INTERVAL 1 DAY) WHERE id=?', [id]);
    if (mode === 'snapshot') { const snapshot = { ...saved.receipt.snapshot, dispatchAllowed: true }; await query('UPDATE ai_sales_experiment_assignments SET snapshot=?,assignment_digest=? WHERE id=?', [JSON.stringify(snapshot), policyArtifactDigest(snapshot), id]); }
    await expect(history(id)).rejects.toThrow(); await expect(enroll()).rejects.toThrow(); expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed first source and a stale selected message digest', async () => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    await query("UPDATE messages SET content='Changed qualifying text' WHERE id=?", [input.incomingMessageId]);
    await expect(enroll()).rejects.toThrow(); await expect(enroll({ ...input, expectedMessageDigest: saved.receipt.snapshot.messageDigest })).rejects.toThrow();
    expect(await history(saved.receipt.assignmentId)).toEqual(saved.receipt);
  });
  it('checks the closing boundary again after qualification and does not draw an arm', async () => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool); let advanced = false;
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await original(), execute = c.execute.bind(c), release = c.release.bind(c);
      c.execute = async (sql: string, ...args: any[]) => {
        const result = await execute(sql, ...args);
        if (sql.includes('FROM ai_sales_experiment_assignment_conversations')) {
          advanced = true; await c.query('SET timestamp=?', [Date.parse(launch.snapshot.basis.window.enrollmentEndsAt) / 1000]);
        }
        return result;
      };
      c.release = () => { c.execute = execute; c.release = release; release(); }; return c;
    });
    expect(await enroll()).toMatchObject({ kind: 'blocked', reasons: ['enrollment_window_changed'] });
    expect(advanced).toBe(true); expect(randomInt).not.toHaveBeenCalled();
  });
  it('separates the same phone across merchants and does not share experiment identity', async () => {
    const first = await enroll(); if (first.kind !== 'assigned') throw Error('Missing assignment');
    state.unix = null;
    const other = await seedApprovedSalesPlan(stranger, reviewer.userId), prepared = await prepareSalesExperimentLaunch(stranger.merchantId, { protocolId: other.protocol.protocolId });
    const authorized = await authorizeSalesExperimentLaunch(stranger.merchantId, stranger.userId, { protocolId: other.protocol.protocolId, requestId: randomUUID(),
      basisDigest: prepared.basisDigest, reviewId: prepared.basis.reviewId, reviewDigest: prepared.basis.reviewDigest,
      reason: 'Authorize the separate merchant independently reviewed experiment.', reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true });
    state.unix = Math.ceil(Date.parse(prepared.basis.window.enrollmentStartsAt) / 1000) + 60;
    const next = await enroll({ protocolId: other.protocol.protocolId, launchId: authorized.launchId, launchDigest: authorized.launchDigest,
      ...await source('966500000888', stranger.merchantId) }, stranger.merchantId);
    if (next.kind !== 'assigned') throw Error('Missing assignment');
    expect(next.receipt.snapshot.customerKey).not.toBe(first.receipt.snapshot.customerKey); expect(next.reused).toBe(false);
    await expect(history(first.receipt.assignmentId, stranger.merchantId)).rejects.toThrow();
  });
  it('blocks overlapping experiments even after revocation, then allows enrollment at the frozen observation end', async () => {
    const first = await enroll(); if (first.kind !== 'assigned') throw Error('Missing assignment'); await revoke();
    await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: input.protocolId, protocolDigest: seeded.protocol.protocolDigest,
      requestId: randomUUID(), reason: 'Withdraw the first experiment before registering a later protocol.' });
    state.unix = null;
    const protocol = await registerSalesExperimentProtocol(owner.merchantId, owner.userId, { candidateId: seeded.protocol.protocol.candidate.id,
      artifactDigest: seeded.protocol.protocol.candidate.artifactDigest, expectedSectorRevision: 0, requestId: randomUUID(), design: seeded.protocol.protocol.design });
    await freezeSalesExperimentCohort(owner.merchantId, owner.userId, { protocolId: protocol.protocolId, protocolDigest: protocol.protocolDigest,
      requestId: randomUUID(), rules: seeded.cohort.snapshot.rules, matchesRegisteredDefinition: true, mappingReview: 'The same synthetic frozen qualification predicates apply.' });
    const review = await prepareSalesExperimentReview(owner.merchantId, reviewer.userId, { protocolId: protocol.protocolId, runId: seeded.runId });
    await recordSalesExperimentReview(owner.merchantId, reviewer.userId, { ...seeded.reviewInput, protocolId: protocol.protocolId,
      requestId: randomUUID(), basisDigest: review.basisDigest });
    const prepared = await prepareSalesExperimentLaunch(owner.merchantId, { protocolId: protocol.protocolId });
    const authorized = await authorizeSalesExperimentLaunch(owner.merchantId, owner.userId, { protocolId: protocol.protocolId, requestId: randomUUID(),
      basisDigest: prepared.basisDigest, reviewId: prepared.basis.reviewId, reviewDigest: prepared.basis.reviewDigest,
      reason: 'Authorize a later separately reviewed synthetic experiment.', reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true });
    state.unix = Math.ceil(Date.parse(prepared.basis.window.enrollmentStartsAt) / 1000) + 60;
    const next = { protocolId: protocol.protocolId, launchId: authorized.launchId, launchDigest: authorized.launchDigest, ...await source() };
    expect(await enroll(next)).toMatchObject({ kind: 'blocked', reasons: ['overlapping_experiment'] });
    expect(randomInt).toHaveBeenCalledTimes(1);
    state.unix = Date.parse(first.receipt.snapshot.observationEndsAt) / 1000;
    expect(await enroll(next)).toMatchObject({ kind: 'assigned', reused: false });
    expect(await history(first.receipt.assignmentId)).toEqual(first.receipt);
  });
  it('serializes opposite-order phone aliases to one customer under independent connections', async () => {
    const other = await source('+966500000888');
    const records = await Promise.all([enroll({ ...input, ...other }), enroll()]);
    if (records[0].kind !== 'assigned' || records[1].kind !== 'assigned') throw Error('Missing assignment');
    expect(records[0].receipt).toEqual(records[1].receipt); expect(records.filter(r => !r.reused)).toHaveLength(1);
    expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it('rejects an outgoing source without creating a denominator', async () => {
    await query("UPDATE messages SET direction='outgoing' WHERE id=?", [input.incomingMessageId]);
    await expect(enroll()).rejects.toThrow(); expect(randomInt).not.toHaveBeenCalled();
  });
  it('rechecks human takeover for an existing assignment without removing its denominator', async () => {
    const saved = await enroll(); if (saved.kind !== 'assigned') throw Error('Missing assignment');
    await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [input.conversationId]);
    expect(await enroll()).toMatchObject({ kind: 'blocked', reasons: ['human_takeover'] });
    expect(await history(saved.receipt.assignmentId)).toEqual(saved.receipt); expect(randomInt).toHaveBeenCalledTimes(1);
  });
  it.each(['human', 'inbound'])('holds source authority while a concurrent %s write tries to commit', async mode => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool), writer = await original(); let blocked = false;
    await writer.query('SET SESSION innodb_lock_wait_timeout=1');
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await original(), execute = c.execute.bind(c), release = c.release.bind(c);
      c.execute = async (sql: string, ...args: any[]) => {
        const result = await execute(sql, ...args);
        if (sql.includes('FROM ai_sales_experiment_assignment_conversations')) {
          try {
            if (mode === 'human') await writer.execute('UPDATE conversations SET human_takeover=1 WHERE id=?', [input.conversationId]);
            else await writer.execute("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','A concurrent inbound')", [input.conversationId]);
          } catch (error: any) { if (error.code !== 'ER_LOCK_WAIT_TIMEOUT') throw error; blocked = true; }
        }
        return result;
      };
      c.release = () => { c.execute = execute; c.release = release; release(); }; return c;
    });
    try { expect(await enroll()).toMatchObject({ kind: 'assigned' }); expect(blocked).toBe(true); }
    finally { await writer.query('SET SESSION innodb_lock_wait_timeout=DEFAULT'); writer.release(); }
  });
});
