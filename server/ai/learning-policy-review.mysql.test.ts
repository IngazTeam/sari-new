import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertDNA } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';
import { getLearningPolicyReview, recordLearningPolicyReview } from './learning-policy-review';
import { learningPolicyReviewSuite, learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';

describe.skipIf(!process.env.DATABASE_URL)('versioned offline learning policy reviews on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, users: number[], proposalId: number, conversationId: number, signalIds: number[];
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const proposal = () => ({ merchantId: owner.merchantId, generation: 1, dimension: 'objection_handling' as const,
    insight: 'Compare relevant benefits before asking to proceed', evidenceCount: 9999, confidence: 0.99 });
  const get = () => getLearningPolicyReview(owner.merchantId, { proposalId });
  const rows = () => query('SELECT * FROM ai_learning_policy_reviews WHERE merchant_id=? ORDER BY revision', [owner.merchantId]);
  const input = async () => {
    const source = await get();
    return { proposalId, requestId: randomUUID(), sourceDigest: source.sourceDigest, suiteDigest: learningPolicyReviewSuiteDigest,
      expectedRevision: source.revision, styleOnly: true as const, cases: learningPolicyReviewSuite.cases.map(row => ({ caseId: row.id as any,
        baselineResponse: 'Synthetic baseline answer.', candidateResponse: 'Synthetic candidate answer.',
        baselineVerdict: 'pass' as const, candidateVerdict: 'pass' as 'pass' | 'fail', reason: 'Synthetic reviewer rationale for this case.' })) };
  };
  const record = (value: Awaited<ReturnType<typeof input>>) => recordLearningPolicyReview(owner.merchantId, owner.userId, value);
  beforeEach(async () => {
    owner = await createDisposableMerchant('policy-review'); users = [owner.userId]; signalIds = [];
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Review must not call providers'); }));
    conversationId = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000287')", [owner.merchantId])).insertId;
    for (let i = 0; i < 2; i++) signalIds.push((await query(`INSERT INTO sari_learning_signals
      (merchant_id,conversation_id,signal_type,customer_message,source_key) VALUES (?,?,'price_objection',?,?)`,
    [owner.merchantId, conversationId, `Private synthetic transcript ${i}`, `fixture:${i}`])).insertId);
    await upsertDNA(proposal());
    proposalId = Number((await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?', [owner.merchantId]))[0].id);
    await attachLearningEvidence({ ...proposal(), observedSignalIds: signalIds, supportingSignalIds: [signalIds[0]], contrarySignalIds: [signalIds[1]] });
  });
  afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);

  it('keeps proposal and runtime unchanged while recording a fully reviewable human assessment', async () => {
    const before = await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId]);
    expect(await get()).toMatchObject({ stage: 'not_reviewed', independentConversations: 1, evidenceLinks: 2, revision: 0 });
    const submitted = await input(), saved = await record(submitted), view = await get();
    expect(saved).toMatchObject({ outcome: 'passed', revision: 1, activationAllowed: false });
    expect(view).toMatchObject({ stage: 'offline_review_passed', revision: 1, activationAllowed: false });
    expect(view.latestReview!.assessmentDetail.cases).toEqual(submitted.cases);
    expect(view.history).toEqual([expect.objectContaining({ actorUserId: owner.userId, current: true, assessment: 'human_offline_review' })]);
    expect(JSON.stringify(await rows())).not.toContain('Private synthetic transcript');
    expect(await query('SELECT * FROM ai_learning_proposals WHERE id=?', [proposalId])).toEqual(before);
    expect(await query('SELECT * FROM sari_behavioral_dna WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('keeps a failed later revision and does not cherry-pick the preceding pass', async () => {
    await record(await input()); const next = await input(); next.cases[0].candidateVerdict = 'fail';
    expect(await record(next)).toMatchObject({ outcome: 'failed', passedCases: 7, regressions: 1, revision: 2 });
    expect(await get()).toMatchObject({ stage: 'offline_review_failed', history: [expect.objectContaining({ current: true }), expect.objectContaining({ current: false })] });
    expect(await rows()).toHaveLength(2);
  });
  it('replays the same request after evidence deletion as a receipt, without validating obsolete evidence', async () => {
    const submitted = await input(), first = await record(submitted);
    await query('DELETE FROM sari_learning_signals WHERE id=?', [signalIds[1]]);
    expect(await record(submitted)).toMatchObject({ ...first, reused: true });
    expect(await get()).toMatchObject({ stage: 'stale', revision: 1 }); expect(await rows()).toHaveLength(1);
  });
  it('canonicalizes reordered cases for idempotent replay', async () => {
    const submitted = await input(); await record(submitted); submitted.cases.reverse(); submitted.requestId = submitted.requestId.toUpperCase();
    expect(await record(submitted)).toMatchObject({ reused: true, revision: 1 });
  });
  it.each(['actor', 'verdict', 'proposal', 'digest', 'revision'])('rejects reused request identity with different %s', async change => {
    const submitted = await input(); await record(submitted);
    let actor = owner.userId;
    if (change === 'actor') actor++;
    if (change === 'verdict') submitted.cases[0].candidateVerdict = 'fail';
    if (change === 'proposal') submitted.proposalId++;
    if (change === 'digest') submitted.sourceDigest = 'a'.repeat(64);
    if (change === 'revision') submitted.expectedRevision++;
    await expect(recordLearningPolicyReview(owner.merchantId, actor, submitted)).rejects.toThrow('changed');
    expect(await rows()).toHaveLength(1);
  });
  it.each(['customer_message','bot_message','merchant_correction','context_summary','source_key','signal_type','signal_weight','created_at'])('invalidates saved and pending review after source %s changes', async field => {
    const submitted = await input(); await record(submitted); const pending = await input();
    const value = field === 'created_at' ? '2026-09-01 00:00:00' : field === 'signal_weight' ? 0.25 : 'Changed synthetic source';
    await query(`UPDATE sari_learning_signals SET ${field}=? WHERE id=?`, [value, signalIds[1]]);
    expect((await get()).stage).toBe('stale'); await expect(record(pending)).rejects.toThrow('changed'); expect(await rows()).toHaveLength(1);
  });
  it.each(['relation','delete signal','delete conversation','proposal text','proposal dimension','proposal state','suite'])('invalidates a review after %s changes', async change => {
    await record(await input());
    if (change === 'relation') await query("UPDATE ai_learning_evidence_links SET relation='observed' WHERE proposal_id=? AND signal_id=?", [proposalId, signalIds[1]]);
    if (change === 'delete signal') await query('DELETE FROM sari_learning_signals WHERE id=?', [signalIds[1]]);
    if (change === 'delete conversation') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
    if (change === 'proposal text') await query("UPDATE ai_learning_proposals SET insight='Changed',content_hash=SHA2('Changed',256) WHERE id=?", [proposalId]);
    if (change === 'proposal dimension') await query("UPDATE ai_learning_proposals SET dimension='tone_preference' WHERE id=?", [proposalId]);
    if (change === 'proposal state') await query("UPDATE ai_learning_proposals SET status='retired' WHERE id=?", [proposalId]);
    if (change === 'suite') await query('UPDATE ai_learning_policy_reviews SET suite_digest=? WHERE proposal_id=?', ['b'.repeat(64), proposalId]);
    expect((await get()).stage).toBe('stale'); expect((await get()).activationAllowed).toBe(false);
  });
  it('ignores model confidence, cached evidence counts and analyzed flags as approval authority', async () => {
    await record(await input()); await query('UPDATE ai_learning_proposals SET confidence=0,evidence_count=0 WHERE id=?', [proposalId]);
    await query('UPDATE sari_learning_signals SET analyzed=1 WHERE merchant_id=?', [owner.merchantId]);
    expect((await get()).stage).toBe('offline_review_passed');
  });
  it.each(['knowledge_gaps','product_emphasis','winning_patterns','losing_patterns','upsell_timing','pain_points'])('does not approve the unsupported %s dimension as style-only', async dimension => {
    await query('UPDATE ai_learning_proposals SET dimension=? WHERE id=?', [dimension, proposalId]);
    expect((await get()).eligible).toBe(false); await expect(record(await input())).rejects.toThrow('changed'); expect(await rows()).toHaveLength(0);
  });
  it('requires existing evidence and an intact content hash', async () => {
    await query('DELETE FROM ai_learning_evidence_links WHERE proposal_id=?', [proposalId]);
    expect((await get()).eligible).toBe(false); await expect(record(await input())).rejects.toThrow('changed');
    await attachLearningEvidence({ ...proposal(), observedSignalIds: signalIds });
    await query('UPDATE ai_learning_proposals SET content_hash=? WHERE id=?', ['f'.repeat(64), proposalId]);
    expect((await get()).eligible).toBe(false); await expect(record(await input())).rejects.toThrow('changed');
  });
  it('isolates foreign proposal identifiers on reads and writes', async () => {
    const other = await createDisposableMerchant('foreign-review'); users.push(other.userId);
    await expect(getLearningPolicyReview(other.merchantId, { proposalId })).rejects.toThrow('changed');
    await expect(recordLearningPolicyReview(other.merchantId, other.userId, await input())).rejects.toThrow('changed');
    expect(await rows()).toHaveLength(0);
  });
  it('rejects a source whose conversation belongs to another tenant', async () => {
    const submitted = await input(), other = await createDisposableMerchant('foreign-source'); users.push(other.userId);
    const otherConversation = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000288')", [other.merchantId])).insertId;
    await query('UPDATE sari_learning_signals SET conversation_id=? WHERE id=?', [otherConversation, signalIds[0]]);
    await expect(get()).rejects.toThrow('changed'); await expect(record(submitted)).rejects.toThrow('changed');
  });
  it.each(['contradiction', 'unknown'])('rejects corrupt %s evidence links', async kind => {
    if (kind === 'contradiction') await query("INSERT INTO ai_learning_evidence_links (proposal_id,signal_id,merchant_id,relation) VALUES (?,?,?,'contrary')", [proposalId, signalIds[0], owner.merchantId]);
    else await query("UPDATE ai_learning_evidence_links SET relation='approve' WHERE proposal_id=?", [proposalId]);
    await expect(get()).rejects.toThrow('changed');
  });
  it('commits one winner among competing reviewers with the same revision', async () => {
    const first = await input(), second = { ...first, requestId: randomUUID() };
    const results = await Promise.allSettled([record(first), record(second)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await rows()).toHaveLength(1);
  });
  it('deduplicates simultaneous identical requests', async () => {
    const submitted = await input(), results = await Promise.all(Array.from({ length: 5 }, () => record(submitted)));
    expect(new Set(results.map(r => r.id)).size).toBe(1); expect(results.filter(r => !r.reused)).toHaveLength(1);
  });
  it.each(['before','after'] as const)('recovers a lost commit %s persistence without duplicating revisions', async when => {
    const submitted = await input(), pool = (await getPool())!, getConnection = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const connection = await getConnection();
      return new Proxy(connection, { get(target, key) {
        if (key === 'commit') return async () => { if (when === 'after') await target.commit(); throw Error('Lost commit acknowledgement'); };
        const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }) as any;
    });
    await expect(record(submitted)).rejects.toThrow(); vi.restoreAllMocks();
    expect(await rows()).toHaveLength(when === 'after' ? 1 : 0);
    expect(await record(submitted)).toMatchObject({ revision: 1, reused: when === 'after' }); expect(await rows()).toHaveLength(1);
  });
  it('keeps immutable caller input while waiting for the merchant lock', async () => {
    const submitted = await input(), connection = await (await getPool())!.getConnection();
    try {
      await connection.beginTransaction(); await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]);
      const pending = record(submitted); submitted.cases[0].candidateVerdict = 'fail'; submitted.sourceDigest = 'c'.repeat(64);
      await connection.commit(); expect(await pending).toMatchObject({ outcome: 'passed' });
    } finally { await connection.rollback(); connection.release(); }
  });
  it('cascades deleted proposals without leaving an orphan approval', async () => {
    await record(await input()); await query('DELETE FROM ai_learning_proposals WHERE id=?', [proposalId]);
    expect(await rows()).toHaveLength(0); await expect(get()).rejects.toThrow('changed');
  });
  it('invalidates the gate when new contrary evidence arrives from another independent conversation', async () => {
    await record(await input());
    const c = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000289')", [owner.merchantId])).insertId;
    const s = (await query("INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type) VALUES (?,?,'price_objection')", [owner.merchantId,c])).insertId;
    await attachLearningEvidence({ ...proposal(), observedSignalIds: [s], contrarySignalIds: [s] });
    expect(await get()).toMatchObject({ stage: 'stale', independentConversations: 2, evidenceLinks: 3 });
  });
  it('rejects foreign evidence link ownership even when another valid link survives', async () => {
    const other = await createDisposableMerchant('foreign-link'); users.push(other.userId);
    await query('UPDATE ai_learning_evidence_links SET merchant_id=? WHERE proposal_id=? AND signal_id=?', [other.merchantId,proposalId,signalIds[1]]);
    await expect(get()).rejects.toThrow('changed');
  });
  it('rechecks source freshness after waiting for a database lock', async () => {
    const submitted = await input(), connection = await (await getPool())!.getConnection();
    try {
      await connection.beginTransaction(); await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]);
      await connection.execute("UPDATE sari_learning_signals SET customer_message='Changed while waiting' WHERE id=?", [signalIds[0]]);
      const pending = record(submitted); const rejection = expect(pending).rejects.toThrow('changed');
      await connection.commit(); await rejection; expect(await rows()).toHaveLength(0);
    } finally { await connection.rollback(); connection.release(); }
  });
  it.each([['passed_cases',9],['regressions',1],['revision',0],['revision',9007199254740992],['outcome','approved']] as const)('rejects corrupt persisted %s=%s', async (field,value) => {
    await record(await input());
    await expect(query(`UPDATE ai_learning_policy_reviews SET ${field}=? WHERE proposal_id=?`, [value,proposalId]))
      .rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
  it('keeps one committed revision across three independent Node processes', async () => {
    const submitted = await input();
    const run = (requestId: string) => new Promise<any>((resolve, reject) => {
      const source = `import {recordLearningPolicyReview} from './server/ai/learning-policy-review.ts';
        import {closeDb} from './server/db/connection.ts';
        try { const result=await recordLearningPolicyReview(${owner.merchantId},${owner.userId},${JSON.stringify({ ...submitted,requestId })});
          console.log('REVIEW_RESULT:'+JSON.stringify({saved:true,id:result.id})); }
        catch { console.log('REVIEW_RESULT:'+JSON.stringify({saved:false})); } finally { await closeDb(); }`;
      const child = spawn(process.execPath, ['--import','tsx','--input-type=module','-e',source], { env: process.env, windowsHide: true });
      let output = '', errors = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => errors += chunk);
      child.on('error', reject); child.on('close', code => {
        const result = output.match(/REVIEW_RESULT:(.+)/);
        if (code !== 0 || !result) reject(Error(`Child review failed: ${errors.slice(-500)}`)); else resolve(JSON.parse(result[1]));
      });
    });
    const results = await Promise.all(Array.from({ length: 3 }, () => run(randomUUID())));
    expect(results.filter(r => r.saved)).toHaveLength(1); expect(await rows()).toHaveLength(1);
  }, 30000);
});
