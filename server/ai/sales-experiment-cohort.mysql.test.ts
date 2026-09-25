import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedCohortProtocol, syntheticCohortRules } from '../tests/helpers/sales-cohort';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { freezeSalesExperimentCohort, getSalesExperimentCohort, inspectSalesExperimentCohort } from './sales-experiment-cohort';
import { withdrawSalesExperimentProtocol } from './sales-experiment-protocol';
import { updateSalesSectorSettings } from './sales-sector-settings';

describe.skipIf(!process.env.DATABASE_URL)('frozen sales cohort and authoritative inspection on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, seed: Awaited<ReturnType<typeof seedCohortProtocol>>;
  const query = async (sql: string, values: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, values))[0];
  const input = () => ({ protocolId: seed.protocol.protocolId, protocolDigest: seed.protocol.protocolDigest, requestId: randomUUID(),
    rules: syntheticCohortRules(), matchesRegisteredDefinition: true as const, mappingReview: 'The bounded predicates match this synthetic registered definition.' });
  const freeze = (value = input(), actor = owner.userId) => freezeSalesExperimentCohort(owner.merchantId, actor, value);
  const get = () => getSalesExperimentCohort(owner.merchantId, { protocolId: seed.protocol.protocolId });
  const inspect = async (conversationId: number, incomingMessageId: number, digest?: string) => inspectSalesExperimentCohort(owner.merchantId,
    { protocolId: seed.protocol.protocolId, cohortDigest: digest ?? (await get()).cohortDigest, conversationId, incomingMessageId });
  async function message(phone = '966500000201', merchant = owner.merchantId, conversationId?: number) {
    const cid = conversationId ?? (await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [merchant, phone])).insertId;
    const mid = (await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','أحتاج تفاصيل عرض الدورة')", [cid])).insertId;
    return { conversationId: Number(cid), incomingMessageId: Number(mid) };
  }
  // Simulate elapsed calendar time only in synthetic fixtures, without sleeps or changing the application's clock.
  async function elapsed(population: 'all' | 'new' | 'returning' = 'all', ended = false) {
    const day = 86_400_000, p = structuredClone(seed.protocol.protocol), now = Date.now(), iso = (d: number) => new Date(now + d * day).toISOString();
    p.registeredAt = iso(-5); p.design.cohort.population = population; p.design.window.enrollmentStartsAt = iso(-3);
    p.design.window.enrollmentEndsAt = iso(ended ? -1 : 10); p.design.window.decisionNotBefore = iso(30);
    seed.protocol.protocolDigest = policyArtifactDigest(p); seed.protocol.protocol = p;
    await query('UPDATE ai_sales_experiment_protocols SET protocol=?,protocol_digest=? WHERE id=?', [JSON.stringify(p), seed.protocol.protocolDigest, seed.protocol.protocolId]);
    const rows = await query('SELECT snapshot FROM ai_sales_experiment_cohorts WHERE protocol_id=?', [seed.protocol.protocolId]);
    if (rows.length) {
      const s = typeof rows[0].snapshot === 'string' ? JSON.parse(rows[0].snapshot) : rows[0].snapshot;
      Object.assign(s, { protocolDigest: seed.protocol.protocolDigest, population, frozenAt: iso(-4), enrollmentStartsAt: p.design.window.enrollmentStartsAt, enrollmentEndsAt: p.design.window.enrollmentEndsAt });
      await query('UPDATE ai_sales_experiment_cohorts SET snapshot=?,protocol_digest=?,cohort_digest=? WHERE protocol_id=?', [JSON.stringify(s), s.protocolDigest, policyArtifactDigest(s), seed.protocol.protocolId]);
    }
  }
  beforeEach(async () => {
    owner = await createDisposableMerchant('cohort'); other = await createDisposableMerchant('cohort-other');
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Cohort preparation cannot call a provider'); }));
    seed = await seedCohortProtocol(owner);
  });
  afterEach(async () => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('freezes the complete definition once and returns the same receipt under concurrent replay', async () => {
    const value = input(), results = await Promise.all(Array.from({ length: 5 }, () => freeze(value)));
    expect(new Set(results.map(r => r.cohortId)).size).toBe(1); expect(results.filter(r => !r.reused)).toHaveLength(1);
    expect(await get()).toMatchObject({ activationAllowed: false, experimentStarted: false, snapshot: { mappingApproval: 'operator_attestation_only', population: 'all' } });
    expect(await query('SELECT * FROM ai_sales_experiment_cohorts WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it('allows one immutable definition when different requests compete', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => freeze()));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it.each(['rules', 'actor', 'review'] as const)('rejects request UUID reuse with altered %s', async mode => {
    const value = input(); await freeze(value);
    if (mode === 'rules') value.rules.minimumCharacters++;
    if (mode === 'review') value.mappingReview += ' altered';
    await expect(freeze(value, mode === 'actor' ? other.userId : owner.userId)).rejects.toThrow();
  });
  it('rejects all foreign protocol/read/inspection identities', async () => {
    const frozen = await freeze(), source = await message();
    await expect(freezeSalesExperimentCohort(other.merchantId, other.userId, input())).rejects.toThrow();
    await expect(getSalesExperimentCohort(other.merchantId, { protocolId: seed.protocol.protocolId })).rejects.toThrow();
    await expect(inspectSalesExperimentCohort(other.merchantId, { protocolId: seed.protocol.protocolId, cohortDigest: frozen.cohortDigest, ...source })).rejects.toThrow();
    const foreign = await message('966500000201', other.merchantId);
    await expect(inspect(foreign.conversationId, foreign.incomingMessageId)).rejects.toThrow();
    await expect(inspect(source.conversationId, foreign.incomingMessageId)).rejects.toThrow();
  });
  it.each(['source', 'sector', 'digest', 'withdrawn'] as const)('fails preparation against stale %s', async mode => {
    const value = input();
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seed.signalId]);
    if (mode === 'sector') await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, expectedRevision: 0, playbookId: 'training' });
    if (mode === 'digest') value.protocolDigest = 'b'.repeat(64);
    if (mode === 'withdrawn') await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: value.protocolId, protocolDigest: value.protocolDigest, requestId: randomUUID(), reason: 'Safety finding requires withdrawing this protocol.' });
    await expect(freeze(value)).rejects.toThrow();
  });
  it('uses database time to reject late freezing even with a backwards application clock', async () => {
    await elapsed(); vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 100 * 86_400_000);
    await expect(freeze()).rejects.toThrow(); expect(await query('SELECT id FROM ai_sales_experiment_cohorts WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it('retains historical receipt and identical replay after withdrawal but blocks new inspections', async () => {
    const value = input(), frozen = await freeze(value), source = await message();
    await withdrawSalesExperimentProtocol(owner.merchantId, owner.userId, { protocolId: value.protocolId, protocolDigest: value.protocolDigest, requestId: randomUUID(), reason: 'Observed safety change requires withdrawal.' });
    expect(await freeze(value)).toMatchObject({ cohortId: frozen.cohortId, reused: true, eligibility: 'not_checked' });
    expect((await get()).snapshot).toEqual(frozen.snapshot); await expect(inspect(source.conversationId, source.incomingMessageId)).rejects.toThrow();
  });
  it('qualifies using SQL-owned facts without exposing content or creating assignments', async () => {
    await freeze(); await elapsed(); const source = await message();
    const result = await inspect(source.conversationId, source.incomingMessageId);
    expect(result).toMatchObject({ qualifiesAtRead: true, reasons: [], assignmentCreated: false, activationAllowed: false });
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('966500000201'); expect(JSON.stringify(result)).not.toContain('أحتاج');
    expect(await query('SELECT id FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await query('SELECT id FROM messages WHERE conversationId=?', [source.conversationId])).toHaveLength(1);
  });
  it.each(['new', 'returning'] as const)('classifies %s across chats and both phone spellings, ignoring foreign or outgoing history', async population => {
    await freeze(); await elapsed(population); const current = await message();
    const foreign = await message('+966500000201', other.merchantId);
    await query('UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-10,UTC_TIMESTAMP()) WHERE id=?', [foreign.incomingMessageId]);
    const prior = await message('+966500000201');
    await query("UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-10,UTC_TIMESTAMP()),direction='outgoing' WHERE id=?", [prior.incomingMessageId]);
    expect((await inspect(current.conversationId, current.incomingMessageId)).qualifiesAtRead).toBe(population === 'new');
    await query("UPDATE messages SET direction='incoming' WHERE id=?", [prior.incomingMessageId]);
    expect((await inspect(current.conversationId, current.incomingMessageId)).qualifiesAtRead).toBe(population === 'returning');
  });
  it.each([
    ['human_takeover=1', 'human_takeover'], ["status='closed'", 'inactive_conversation'], ["deal_stage='paid'", 'excluded_deal_stage'],
    ["deal_stage='lost'", 'excluded_deal_stage'], ['automation_after_message_id=2147483647', 'before_handoff_boundary'],
    ['automation_after_message_id=-1', 'before_handoff_boundary'],
    ["customerPhone='group_123'", 'unsupported_customer_identity'],
  ])('rejects conversation condition %# %s', async (patch, reason) => {
    await freeze(); await elapsed(); const source = await message();
    await query(`UPDATE conversations SET ${patch} WHERE id=?`, [source.conversationId]);
    expect((await inspect(source.conversationId, source.incomingMessageId)).reasons).toContain(reason);
  });
  it.each([
    ["messageType='voice'", 'unsupported_message_type'], ["content=''", 'message_length'],
    ['createdAt=TIMESTAMPADD(DAY,-10,UTC_TIMESTAMP())', 'message_outside_enrollment'],
    ['createdAt=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP())', 'invalid_source_time'],
  ])('rejects authoritative message condition %# %s', async (patch, reason) => {
    await freeze(); await elapsed(); const source = await message(); await query(`UPDATE messages SET ${patch} WHERE id=?`, [source.incomingMessageId]);
    expect((await inspect(source.conversationId, source.incomingMessageId)).reasons).toContain(reason);
  });
  it('rejects superseded, outgoing and missing messages', async () => {
    await freeze(); await elapsed(); const source = await message(); await message(undefined, undefined, source.conversationId);
    expect((await inspect(source.conversationId, source.incomingMessageId)).reasons).toContain('superseded_inbound');
    await query("UPDATE messages SET direction='outgoing' WHERE id=?", [source.incomingMessageId]);
    await expect(inspect(source.conversationId, source.incomingMessageId)).rejects.toThrow();
    await query('DELETE FROM messages WHERE id=?', [source.incomingMessageId]); await expect(inspect(source.conversationId, source.incomingMessageId)).rejects.toThrow();
  });
  it('does not reopen a completed enrollment window', async () => {
    await freeze(); await elapsed('all', true); const source = await message();
    expect((await inspect(source.conversationId, source.incomingMessageId)).reasons).toContain('inspection_outside_enrollment');
  });
  it('keeps SQL-shaped terms literal and enforces canonical excluded phones', async () => {
    const value = input(); value.rules.requiredAnyTerms = ["' OR 1=1 --"]; value.rules.excludedPhones = ['+966500000201'];
    await freeze(value); await elapsed(); const source = await message();
    expect((await inspect(source.conversationId, source.incomingMessageId)).reasons).toEqual(['excluded_customer', 'required_term_missing']);
  });
  it.each(['source', 'sector', 'digest'] as const)('rejects inspection after %s drift', async mode => {
    await freeze(); await elapsed(); const source = await message(); const digest = (await get()).cohortDigest;
    if (mode === 'source') await query("UPDATE sari_learning_signals SET customer_message='Changed evidence' WHERE id=?", [seed.signalId]);
    if (mode === 'sector') await updateSalesSectorSettings({ merchantId: owner.merchantId, actorUserId: owner.userId, expectedRevision: 0, playbookId: 'training' });
    await expect(inspect(source.conversationId, source.incomingMessageId, mode === 'digest' ? 'b'.repeat(64) : digest)).rejects.toThrow();
  });
  it.each(['activation', 'window', 'population', 'protocol', 'rules', 'retroactive'] as const)('detects corrupt stored %s even with a recomputed checksum', async mode => {
    const r = await freeze(), s: any = structuredClone(r.snapshot);
    if (mode === 'activation') s.activationAllowed = true;
    if (mode === 'window') s.enrollmentEndsAt = '2099-01-01T00:00:00.000Z';
    if (mode === 'population') s.population = 'new';
    if (mode === 'protocol') s.protocolDigest = 'b'.repeat(64);
    if (mode === 'rules') s.rules.minimumCharacters = -1;
    if (mode === 'retroactive') s.frozenAt = '2020-01-01T00:00:00.000Z';
    await query('UPDATE ai_sales_experiment_cohorts SET snapshot=?,cohort_digest=? WHERE id=?', [JSON.stringify(s), policyArtifactDigest(s), r.cohortId]);
    await expect(get()).rejects.toThrow();
  });
  it('rejects an unknown stored sector instead of treating its fallback as current', async () => {
    await freeze(); const source = await message();
    await query("INSERT INTO ai_sales_sector_settings (merchant_id,playbook_id,revision,updated_by) VALUES (?,'unknown-sector',0,?)", [owner.merchantId, owner.userId]);
    await expect(inspect(source.conversationId, source.incomingMessageId)).rejects.toThrow();
  });
  it.each([false, true])('recovers commit failure with applied=%s without duplicate freezing', async applied => {
    const pool = (await getPool())!, acquire = pool.getConnection.bind(pool), value = input();
    vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
      const c = await acquire(), commit = c.commit.bind(c); c.commit = async () => { if (applied) await commit(); throw Error('Synthetic lost commit receipt'); }; return c;
    });
    await expect(freeze(value)).rejects.toThrow(); vi.restoreAllMocks();
    expect(await freeze(value)).toMatchObject({ reused: applied });
    expect(await query('SELECT id FROM ai_sales_experiment_cohorts WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it('serializes independent Node processes to one definition', async () => {
    const value = input(), mod = pathToFileURL(resolve('server/ai/sales-experiment-cohort.ts')).href, db = pathToFileURL(resolve('server/db/connection.ts')).href;
    const code = `const {freezeSalesExperimentCohort}=await import(${JSON.stringify(mod)});const {closeDb}=await import(${JSON.stringify(db)});try{const r=await freezeSalesExperimentCohort(${owner.merchantId},${owner.userId},${JSON.stringify(value)});console.log(JSON.stringify({id:r.cohortId,reused:r.reused}));}finally{await closeDb();}`;
    const results = await Promise.all(Array.from({ length: 3 }, async () => {
      const r = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: process.env, windowsHide: true, timeout: 20000 });
      return JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)!);
    }));
    expect(new Set(results.map(r => r.id)).size).toBe(1); expect(results.filter(r => !r.reused)).toHaveLength(1);
  }, 25000);
  it('retains history after reviewer deletion and cascades only with the owning protocol', async () => {
    const value = input(), frozen = await freeze(value, other.userId); await query('DELETE FROM users WHERE id=?', [other.userId]);
    expect(await get()).toMatchObject({ actorUserId: null, cohortId: frozen.cohortId });
    await query('DELETE FROM ai_sales_experiment_protocols WHERE id=?', [seed.protocol.protocolId]);
    expect(await query('SELECT id FROM ai_sales_experiment_cohorts WHERE id=?', [frozen.cohortId])).toHaveLength(0);
  });
});
