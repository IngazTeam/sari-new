import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { authorizeSalesExperimentLaunch, prepareSalesExperimentLaunch, revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer, getSalesExperimentAssignment } from './sales-experiment-assignment';
import { prepareSalesExperimentTurn, getSalesExperimentTurn, resolveSalesExperimentTurnPrompt } from './sales-experiment-turn';
import { withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import type { PrepareSalesExperimentTurnInput } from './sales-experiment-turn-contract';

const state = vi.hoisted(() => ({ unix: null as number | null, arm: 1, enabled: true, model: 'synthetic-model', fail: false }));
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

describe.skipIf(!process.env.DATABASE_URL)('durable sales experiment policy turns', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, reviewer: typeof owner, stranger: typeof owner, users: number[];
  let seeded: Awaited<ReturnType<typeof seedApprovedSalesPlan>>, launch: Awaited<ReturnType<typeof authorizeSalesExperimentLaunch>>;
  let assignment: Awaited<ReturnType<typeof getSalesExperimentAssignment>>, input: PrepareSalesExperimentTurnInput;
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const prepare = (value = input, merchant = owner.merchantId) => prepareSalesExperimentTurn(merchant, value);
  const history = (s: { turnId: number; turnDigest: string }, merchant = owner.merchantId) => getSalesExperimentTurn(merchant, { turnId: s.turnId, turnDigest: s.turnDigest });
  const resolve = (s: { turnId: number; turnDigest: string }, baseSystemPrompt = input.baseSystemPrompt) => resolveSalesExperimentTurnPrompt(owner.merchantId, { turnId: s.turnId, turnDigest: s.turnDigest, baseSystemPrompt });
  const revoke = () => revokeSalesExperimentLaunch(owner.merchantId, owner.userId, { launchId: launch.launchId, launchDigest: launch.launchDigest, requestId: randomUUID(), reason: 'Stop the synthetic policy preparation to investigate safety conditions.' });
  const noPrompt = async (operation: Promise<any>) => {
    const result = await operation.catch(() => ({ kind: 'rejected' })); expect(result.kind).not.toBe('resolved'); expect(result).not.toHaveProperty('systemPrompt');
  };
  async function inbound(conversationId: number, content = 'أريد معرفة العرض المناسب') {
    return Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text',?,?)",
      [conversationId, content, new Date(state.unix! * 1000).toISOString().slice(0, 19).replace('T', ' ')])).insertId);
  }
  async function source(phone = '966500000886', merchant = owner.merchantId) {
    const conversationId = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,?,'active','new')", [merchant, phone])).insertId);
    return { conversationId, incomingMessageId: await inbound(conversationId) };
  }
  async function enrolled(s: { conversationId: number; incomingMessageId: number }) {
    const result = await assignSalesExperimentCustomer(owner.merchantId, { ...s, protocolId: seeded.protocol.protocolId, launchId: launch.launchId, launchDigest: launch.launchDigest });
    if (result.kind !== 'assigned') throw Error('Missing assignment'); return result.receipt;
  }
  async function saved(value = input) { const result = await prepare(value); if (result.kind !== 'recorded') throw Error(`Missing turn: ${result.reason}`); return result.receipt; }
  beforeEach(async () => {
    state.unix = null; state.arm = 1; state.enabled = true; state.model = 'synthetic-model'; state.fail = false; users = [];
    owner = await createDisposableMerchant('turn-owner'); users.push(owner.userId);
    reviewer = await createDisposableMerchant('turn-reviewer'); users.push(reviewer.userId);
    stranger = await createDisposableMerchant('turn-stranger'); users.push(stranger.userId);
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Policy preparation must not call providers'); }));
    seeded = await seedApprovedSalesPlan(owner, reviewer.userId);
    const p = await prepareSalesExperimentLaunch(owner.merchantId, { protocolId: seeded.protocol.protocolId });
    launch = await authorizeSalesExperimentLaunch(owner.merchantId, owner.userId, { protocolId: seeded.protocol.protocolId, requestId: randomUUID(),
      basisDigest: p.basisDigest, reviewId: p.basis.reviewId, reviewDigest: p.basis.reviewDigest,
      reason: 'Authorize the independently reviewed synthetic policy experiment.', reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true });
    state.unix = Math.ceil(Date.parse(p.basis.window.enrollmentStartsAt) / 1000) + 60;
    const selected = await source(); assignment = await enrolled(selected);
    input = { ...selected, assignmentId: assignment.assignmentId, assignmentDigest: assignment.assignmentDigest, requestId: randomUUID(), intent: 'inquiring', baseSystemPrompt: 'PRIVATE_BASE_CONTEXT: حقائق النشاط وسياساته المعتمدة.' };
  });
  afterEach(async () => { state.unix = null; await cleanupDisposableMerchants(users); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(closeDb);

  it('persists the selected candidate fragment, binds the real base prompt hash and never grants generation or delivery', async () => {
    const turn = await saved(), result = await resolve(turn); if (result.kind !== 'resolved') throw Error('Missing prompt');
    expect(turn.snapshot).toMatchObject({ arm: 'candidate', styleApplied: true, styleReason: 'candidate_style', requestedIntent: 'inquiring', scope: 'policy_preparation_only' });
    expect(turn.snapshot.policyText).toContain('Explain value clearly'); expect(turn.snapshot.policyText).toContain('سياسة البيع المشتركة v1');
    expect(result.systemPrompt).toBe(input.baseSystemPrompt + turn.snapshot.policyText);
    expect(policyArtifactDigest(result.systemPrompt)).toBe(turn.snapshot.promptDigest);
    expect(result).toMatchObject({ selectionCurrentAtRead: true, generationAllowed: false, dispatchAllowed: false, exposureRecorded: false });
    const raw = await query('SELECT snapshot,payload_digest FROM ai_sales_experiment_turns WHERE id=?', [turn.turnId]);
    expect(JSON.stringify(raw)).not.toContain('PRIVATE_BASE_CONTEXT'); expect(JSON.stringify(raw)).not.toContain('966500000886'); expect(JSON.stringify(raw)).not.toContain('أريد معرفة العرض');
    expect(await history(turn)).toEqual(turn); expect(await getSalesExperimentAssignment(owner.merchantId, { assignmentId: input.assignmentId })).toEqual(assignment);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT reservation_key FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`])).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the baseline arm free of candidate instructions', async () => {
    state.arm = 0; const selected = await source('966500000887'), baseline = await enrolled(selected);
    const turn = await saved({ ...input, ...selected, assignmentId: baseline.assignmentId, assignmentDigest: baseline.assignmentDigest });
    expect(turn.snapshot).toMatchObject({ arm: 'baseline', styleApplied: false, styleReason: 'baseline_arm' });
    expect(turn.snapshot.policyText).not.toContain('Explain value clearly'); expect(await resolve(turn)).toMatchObject({ kind: 'resolved' });
  });
  it.each([['لا أريد الشراء ولا تتواصل معي مجددًا', 'customer_declined', 'declined'], ['وين وصل طلبي', 'existing_order', 'post_purchase']])('does not let a stale buying intent override %s', async (content, reason, intent) => {
    const incomingMessageId = await inbound(input.conversationId, content), turn = await saved({ ...input, incomingMessageId, intent: 'ready_to_buy' });
    expect(turn.snapshot).toMatchObject({ arm: 'candidate', effectiveIntent: intent, styleApplied: false, styleReason: reason });
    expect(turn.snapshot.policyText).not.toContain('Explain value clearly'); expect(await resolve(turn)).toMatchObject({ kind: 'resolved' });
  });
  it('uses the latest verified assistant question without treating human text as assistant consent', async () => {
    await query("INSERT INTO messages (conversationId,direction,sender_type,messageType,content,isProcessed,aiResponse) VALUES (?,'outgoing','assistant','text','هل تريدني أن أشرح التفاصيل؟',1,'verified')", [input.conversationId]);
    await query("INSERT INTO messages (conversationId,direction,sender_type,messageType,content,isProcessed,aiResponse) VALUES (?,'outgoing','merchant','text','هل توافق على شراء المنتج؟',1,NULL)", [input.conversationId]);
    const turn = await saved({ ...input, incomingMessageId: await inbound(input.conversationId, 'تمام'), intent: 'ready_to_buy' });
    expect(turn.snapshot.goal).toBe('explain_requested_information');
  });
  it('uses an existing assignment after enrollment closes without requalifying its changed deal stage', async () => {
    const end = Date.parse(launch.snapshot.basis.window.enrollmentEndsAt); state.unix = Math.floor(end / 1000) - 60;
    const selected = await source('966500000887'), late = await enrolled(selected);
    state.unix = Math.ceil(end / 1000) + 60; await query("UPDATE conversations SET deal_stage='purchased' WHERE id=?", [selected.conversationId]);
    const turn = await saved({ ...input, ...selected, incomingMessageId: await inbound(selected.conversationId), assignmentId: late.assignmentId, assignmentDigest: late.assignmentDigest });
    expect(await resolve(turn)).toMatchObject({ kind: 'resolved', observationEndsAt: late.snapshot.observationEndsAt });
    expect(await getSalesExperimentAssignment(owner.merchantId, { assignmentId: late.assignmentId })).toEqual(late);
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(2);
  });
  it('binds another conversation with the canonical same phone to the original assignment', async () => {
    const selected = await source('+966500000886'); const turn = await saved({ ...input, ...selected });
    expect(turn.snapshot.assignmentId).toBe(input.assignmentId); expect(await resolve(turn)).toMatchObject({ kind: 'resolved' });
    expect(await query('SELECT id FROM ai_sales_experiment_assignments WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(2);
  });
  it('serializes identical preparations, persists across reconnection and never mutates the assignment', async () => {
    const values = await Promise.all([prepare(), prepare(), prepare()]); const records = values.filter(r => r.kind === 'recorded');
    expect(records).toHaveLength(3); expect(new Set(records.map(r => r.receipt.turnId)).size).toBe(1); expect(records.filter(r => !r.reused)).toHaveLength(1);
    await closeDb(); expect(await prepare()).toMatchObject({ kind: 'recorded', reused: true, receipt: records[0].receipt });
    expect(await resolve(records[0].receipt)).toMatchObject({ kind: 'resolved' });
  });
  it('allows only one immutable prompt decision for a message under different simultaneous requests', async () => {
    const results = await Promise.allSettled([prepare(), prepare({ ...input, requestId: randomUUID() })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await query('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each(['baseSystemPrompt', 'intent', 'assignmentDigest', 'incomingMessageId'])('rejects changed %s under a saved request ID', async field => {
    await saved(); const value = field === 'intent' ? 'ready_to_buy' : field === 'incomingMessageId' ? input.incomingMessageId + 1 : field === 'assignmentDigest' ? 'f'.repeat(64) : 'Changed prompt';
    await expect(prepare({ ...input, [field]: value })).rejects.toThrow();
  });
  it('recovers a lost commit acknowledgement after revocation as history without a live prompt', async () => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => { const c = await original(), commit = c.commit.bind(c);
      c.commit = async () => { c.commit = commit; await commit(); throw Error('Lost commit acknowledgement'); }; return c; });
    await expect(prepare()).rejects.toThrow('Lost commit acknowledgement'); await revoke();
    const recovered = await prepare(); if (recovered.kind !== 'recorded') throw Error('Missing receipt');
    expect(recovered.reused).toBe(true); expect(recovered).not.toHaveProperty('systemPrompt'); expect(recovered.receipt.eligibility).toBe('not_checked');
    expect(await resolve(recovered.receipt)).toMatchObject({ kind: 'blocked', reason: 'revoked' });
  });
  it.each(['source', 'output', 'route', 'disabled', 'unavailable', 'reviewer', 'withdrawn', 'revoked'])('rechecks %s drift before preparation and prompt resolution, preserving the saved receipt', async mode => {
    const turn = await saved();
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seeded.signalId]);
    if (mode === 'output') await query("UPDATE ai_learning_policy_evaluation_samples SET response_text='Changed output' WHERE run_id=? AND ordinal=0", [seeded.runId]);
    if (mode === 'route') state.model = 'changed'; if (mode === 'disabled') state.enabled = false; if (mode === 'unavailable') state.fail = true;
    if (mode === 'reviewer') await query('UPDATE ai_sales_experiment_reviews SET actor_user_id=NULL WHERE id=?', [seeded.review.reviewId]);
    if (mode === 'revoked') await revoke();
    if (mode === 'withdrawn') await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: seeded.protocol.protocolId,
      protocolDigest: seeded.protocol.protocolDigest, requestId: randomUUID(), reason: 'Withdraw the synthetic experiment for a recorded safety concern.' });
    expect(await prepare({ ...input, requestId: randomUUID() })).toMatchObject({ kind: 'blocked' });
    await noPrompt(resolve(turn)); expect(await history(turn)).toEqual(turn); expect(await prepare()).toMatchObject({ reused: true });
  });
  it.each(['human', 'inactive', 'boundary', 'version', 'latest', 'content', 'phone', 'type'])('refuses the old selection after %s changes', async mode => {
    const turn = await saved();
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [input.conversationId]);
    if (mode === 'inactive') await query("UPDATE conversations SET status='closed' WHERE id=?", [input.conversationId]);
    if (mode === 'boundary') await query('UPDATE conversations SET automation_after_message_id=? WHERE id=?', [input.incomingMessageId, input.conversationId]);
    if (mode === 'version') await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [input.conversationId]);
    if (mode === 'latest') await inbound(input.conversationId);
    if (mode === 'content') await query("UPDATE messages SET content='Changed source' WHERE id=?", [input.incomingMessageId]);
    if (mode === 'phone') await query("UPDATE conversations SET customerPhone='966500000887' WHERE id=?", [input.conversationId]);
    if (mode === 'type') await query("UPDATE messages SET messageType='image' WHERE id=?", [input.incomingMessageId]);
    await noPrompt(resolve(turn)); expect(await history(turn)).toEqual(turn);
  });
  it('refuses a prompt based on an edited or replaced preceding assistant message', async () => {
    const previous = (await query("INSERT INTO messages (conversationId,direction,sender_type,messageType,content,isProcessed,aiResponse) VALUES (?,'outgoing','assistant','text','هل أشرح لك التفاصيل؟',1,'verified')", [input.conversationId])).insertId;
    const turn = await saved({ ...input, incomingMessageId: await inbound(input.conversationId, 'تمام') });
    await query("UPDATE messages SET content='Changed assistant context' WHERE id=?", [previous]);
    expect(await resolve(turn)).toMatchObject({ kind: 'blocked', reason: 'source_changed' });
  });
  it.each(['before', 'end', 'after'])('enforces the %s observation boundary for preparation and resolution', async boundary => {
    const turn = await saved(), a = assignment.snapshot;
    state.unix = (boundary === 'before' ? Date.parse(a.assignedAt) - 1 : Date.parse(a.observationEndsAt) + (boundary === 'after' ? 1 : 0)) / 1000;
    expect(await prepare({ ...input, requestId: randomUUID() })).toMatchObject({ kind: 'blocked', reason: 'outside_observation' });
    expect(await resolve(turn)).toMatchObject({ kind: 'blocked', reason: 'outside_observation' }); expect(await history(turn)).toEqual(turn);
  });
  it('retains history after deleting the source conversation and never resolves an orphaned prompt', async () => {
    const turn = await saved(); await query('DELETE FROM messages WHERE conversationId=?', [input.conversationId]); await query('DELETE FROM conversations WHERE id=?', [input.conversationId]);
    expect(await history(turn)).toEqual(turn); expect(await prepare()).toMatchObject({ reused: true }); await noPrompt(resolve(turn));
  });
  it.each(['merchant', 'assignment', 'conversation', 'message', 'digest'])('rejects foreign or forged %s during preparation', async mode => {
    const foreign = await source('966500000884', stranger.merchantId), changed = { ...input,
      ...(mode === 'assignment' ? { assignmentId: input.assignmentId + 100000 } : mode === 'conversation' ? foreign
        : mode === 'message' ? { incomingMessageId: foreign.incomingMessageId } : mode === 'digest' ? { assignmentDigest: 'f'.repeat(64) } : {}) };
    await expect(prepare(changed, mode === 'merchant' ? stranger.merchantId : owner.merchantId)).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('isolates history, resolution and base prompt identity', async () => {
    const turn = await saved(); await expect(history(turn, stranger.merchantId)).rejects.toThrow();
    await expect(resolveSalesExperimentTurnPrompt(stranger.merchantId, { turnId: turn.turnId, turnDigest: turn.turnDigest, baseSystemPrompt: input.baseSystemPrompt })).rejects.toThrow();
    await expect(resolve({ ...turn, turnDigest: 'f'.repeat(64) })).rejects.toThrow(); await expect(resolve(turn, 'Different base prompt')).rejects.toThrow();
  });
  it.each(['digest', 'message', 'assignment', 'policy', 'authority'])('rejects damaged stored %s', async mode => {
    const turn = await saved();
    if (mode === 'digest') await query('UPDATE ai_sales_experiment_turns SET turn_digest=? WHERE id=?', ['f'.repeat(64), turn.turnId]);
    if (mode === 'message') await query('UPDATE ai_sales_experiment_turns SET message_reference=message_reference+10000 WHERE id=?', [turn.turnId]);
    if (mode === 'assignment') { const s = { ...turn.snapshot, assignmentId: turn.snapshot.assignmentId + 1 }; await query('UPDATE ai_sales_experiment_turns SET snapshot=?,turn_digest=? WHERE id=?', [JSON.stringify(s), policyArtifactDigest(s), turn.turnId]); }
    if (mode === 'policy') { const s = { ...turn.snapshot, policyText: 'Injected instruction' }; await query('UPDATE ai_sales_experiment_turns SET snapshot=?,turn_digest=? WHERE id=?', [JSON.stringify(s), policyArtifactDigest(s), turn.turnId]); }
    if (mode === 'authority') { const s = { ...turn.snapshot, generationAllowed: true }; await query('UPDATE ai_sales_experiment_turns SET snapshot=?,turn_digest=? WHERE id=?', [JSON.stringify(s), policyArtifactDigest(s), turn.turnId]); }
    await expect(history(turn)).rejects.toThrow(); await noPrompt(resolve(turn));
  });
  it('rebuilds policy text instead of trusting a rehashed injected snapshot', async () => {
    const turn = await saved(), s = { ...turn.snapshot, policyText: 'Injected authority' };
    s.policyDigest = policyArtifactDigest(s.policyText); s.promptDigest = policyArtifactDigest(input.baseSystemPrompt + s.policyText);
    const digest = policyArtifactDigest(s); await query('UPDATE ai_sales_experiment_turns SET snapshot=?,turn_digest=? WHERE id=?', [JSON.stringify(s), digest, turn.turnId]);
    expect(await resolve({ turnId: turn.turnId, turnDigest: digest })).toMatchObject({ kind: 'blocked', reason: 'selection_changed' });
  });
  it.each(['binding', 'turn'])('atomically rolls back a new conversation binding and turn after a %s write fault', async mode => {
    const selected = await source('+966500000886'), pool = (await getPool())!, original = pool.getConnection.bind(pool); let hit = false;
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await original(), execute = c.execute.bind(c), release = c.release.bind(c);
      c.execute = async (sql: string, ...args: any[]) => { const result = await execute(sql, ...args);
        if (sql.trimStart().startsWith(`INSERT INTO ${mode === 'binding' ? 'ai_sales_experiment_assignment_conversations' : 'ai_sales_experiment_turns'}`)) { hit = true; throw Error('Post-write fault'); } return result; };
      c.release = () => { c.execute = execute; c.release = release; release(); }; return c;
    });
    await expect(prepare({ ...input, ...selected })).rejects.toThrow('Post-write fault'); expect(hit).toBe(true);
    expect(await query('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT id FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
    expect(await prepare({ ...input, ...selected })).toMatchObject({ kind: 'recorded', reused: false });
  });
  it('serializes revocation racing preparation and refuses prompt resolution afterwards', async () => {
    const [result] = await Promise.all([prepare(), revoke()]);
    if (result.kind === 'recorded') { expect(await history(result.receipt)).toEqual(result.receipt); await noPrompt(resolve(result.receipt)); }
    else expect(result.reason).toBe('revoked');
    expect(await prepare({ ...input, requestId: randomUUID() })).toMatchObject({ kind: 'blocked', reason: 'revoked' });
  });
  it.each(['processed', 'outgoing'])('refuses retroactive selection after the source was %s', async mode => {
    const turn = await saved();
    if (mode === 'processed') await query('UPDATE messages SET isProcessed=1 WHERE id=?', [input.incomingMessageId]);
    else await query("INSERT INTO messages (conversationId,direction,sender_type,messageType,content) VALUES (?,'outgoing','assistant','text','Already answered')", [input.conversationId]);
    expect(await prepare({ ...input, requestId: randomUUID() })).toMatchObject({ kind: 'blocked', reason: 'already_answered' });
    expect(await resolve(turn)).toMatchObject({ kind: 'blocked', reason: 'already_answered' });
    expect(await history(turn)).toEqual(turn); expect(await prepare()).toMatchObject({ reused: true });
  });
  it.each(['future', 'empty', 'media', 'outgoing'])('refuses an invalid new source: %s', async mode => {
    const incomingMessageId = await inbound(input.conversationId);
    if (mode === 'future') await query('UPDATE messages SET createdAt=DATE_ADD(createdAt,INTERVAL 1 DAY) WHERE id=?', [incomingMessageId]);
    if (mode === 'empty') await query("UPDATE messages SET content='' WHERE id=?", [incomingMessageId]);
    if (mode === 'media') await query("UPDATE messages SET messageType='image' WHERE id=?", [incomingMessageId]);
    if (mode === 'outgoing') await query("UPDATE messages SET direction='outgoing' WHERE id=?", [incomingMessageId]);
    const result = await prepare({ ...input, incomingMessageId }).catch(() => ({ kind: 'rejected' })); expect(result.kind).not.toBe('recorded');
    expect(await query('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('rechecks the observation boundary after a lock wait during preparation', async () => {
    const pool = (await getPool())!, original = pool.getConnection.bind(pool); let advanced = false;
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c: any = await original(), execute = c.execute.bind(c), release = c.release.bind(c);
      c.execute = async (sql: string, ...args: any[]) => { const result = await execute(sql, ...args);
        if (sql.startsWith('SELECT id FROM ai_sales_experiment_turns')) { advanced = true; await c.query('SET timestamp=?', [Date.parse(assignment.snapshot.observationEndsAt) / 1000]); } return result; };
      c.release = () => { c.execute = execute; c.release = release; release(); }; return c;
    });
    expect(await prepare()).toMatchObject({ kind: 'blocked', reason: 'observation_window_changed' }); expect(advanced).toBe(true);
    expect(await query('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
});
