import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createABTest, getABTests, getABTestById, getActiveABTestForKeyword, trackABTestUsage,
  declareABTestWinner, pauseABTest, resumeABTest } from '../db/ab-tests';
import { analyzeABTest, applyWinningVariant, selectABTestVariant } from './ab-testing';

describe.skipIf(!process.env.DATABASE_URL)('legacy A/B state on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const create = (extra = {}) => createABTest({ merchantId: owner.merchantId, testName: 'Synthetic', keyword: 'price', variantAText: 'A response', variantBText: 'B response', ...extra });
  beforeEach(async () => { owner = await createDisposableMerchant('legacy-ab'); other = await createDisposableMerchant('legacy-ab-other'); });
  afterEach(async () => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('persists and reads variants with existing schema field names', async () => {
    const id = await create(); expect(await getABTestById(id, owner.merchantId)).toMatchObject({ id, merchantId: owner.merchantId, keyword: 'price', variantAText: 'A response', status: 'running', confidenceLevel: 0 });
    const dates = (await getABTestById(id, owner.merchantId))!;
    for (const value of [dates.startedAt, dates.createdAt, dates.updatedAt]) expect(value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(dates.completedAt).toBeNull();
    expect(await getABTests(owner.merchantId, 'running')).toHaveLength(1);
    expect(await getActiveABTestForKeyword(owner.merchantId, ' price ')).toMatchObject({ id });
    expect(await getABTests(other.merchantId)).toHaveLength(0);
  });
  it('rejects foreign reads, counters and state changes without touching the owner', async () => {
    const id = await create(), before = await getABTestById(id, owner.merchantId);
    expect(await getABTestById(id, other.merchantId)).toBeNull();
    for (const call of [() => trackABTestUsage(id, 'A', true, other.merchantId), () => declareABTestWinner(id, 'variant_b', other.merchantId),
      () => pauseABTest(id, other.merchantId), () => resumeABTest(id, other.merchantId)]) await expect(call()).rejects.toThrow();
    expect(await getABTestById(id, owner.merchantId)).toEqual(before);
  });
  it.each(['variantAId', 'variantBId'])('validates optional %s ownership and rolls back foreign references', async field => {
    const row = await query('INSERT INTO quick_responses (merchant_id,`trigger`,response) VALUES (?,?,?)', [other.merchantId, 'price', 'Foreign response']);
    await expect(create({ [field]: row.insertId })).rejects.toThrow(); expect(await getABTests(owner.merchantId)).toHaveLength(0);
    const local = await query('INSERT INTO quick_responses (merchant_id,`trigger`,response) VALUES (?,?,?)', [owner.merchantId, 'price', 'Owned response']);
    const id = await create({ [field]: local.insertId }); expect((await getABTestById(id, owner.merchantId))![field as 'variantAId']).toBe(local.insertId);
  });
  it.each([2, 6])('allows only one active test from %s simultaneous creations', async count => {
    const results = await Promise.allSettled(Array.from({ length: count }, () => create()));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await getABTests(owner.merchantId, 'running')).toHaveLength(1);
    expect(await create({ merchantId: other.merchantId })).toBeGreaterThan(0);
  });
  it('does not lose concurrent observations', async () => {
    const id = await create();
    await Promise.all(Array.from({ length: 40 }, (_, i) => trackABTestUsage(id, i < 20 ? 'A' : 'B', i % 2 === 0, owner.merchantId)));
    expect(await getABTestById(id, owner.merchantId)).toMatchObject({ variantAUsageCount: 20, variantASuccessCount: 10, variantBUsageCount: 20, variantBSuccessCount: 10 });
    expect((await analyzeABTest(id, owner.merchantId)).confidence).toBe(0);
  });
  it.each(['A', 'B'] as const)('rejects corrupted/overflowing counters for arm %s', async arm => {
    const id = await create(), prefix = arm.toLowerCase();
    for (const [total, success] of [[-1, 0], [1, -1], [1, 2], [2147483647, 2147483647]]) {
      await query(`UPDATE ab_test_results SET variant_${prefix}_usage_count=?,variant_${prefix}_success_count=? WHERE id=?`, [total, success, id]);
      await expect(trackABTestUsage(id, arm, true, owner.merchantId)).rejects.toThrow();
      expect((await query(`SELECT variant_${prefix}_usage_count AS total,variant_${prefix}_success_count AS success FROM ab_test_results WHERE id=?`, [id]))[0]).toEqual({ total, success });
    }
  });
  it('blocks observations on paused/completed tests and prevents reopening completed results', async () => {
    const id = await create(); await pauseABTest(id, owner.merchantId); await pauseABTest(id, owner.merchantId);
    await expect(trackABTestUsage(id, 'A', true, owner.merchantId)).rejects.toThrow();
    await resumeABTest(id, owner.merchantId); await resumeABTest(id, owner.merchantId);
    await trackABTestUsage(id, 'A', false, owner.merchantId);
    await declareABTestWinner(id, 'no_winner', owner.merchantId); const completed = await getABTestById(id, owner.merchantId);
    for (const call of [() => trackABTestUsage(id, 'A', true, owner.merchantId), () => pauseABTest(id, owner.merchantId), () => resumeABTest(id, owner.merchantId)]) await expect(call()).rejects.toThrow();
    expect(await getABTestById(id, owner.merchantId)).toEqual(completed);
  });
  it('records explicit manual selection with zero confidence and immutable/idempotent completion', async () => {
    const id = await create(); await query('UPDATE ab_test_results SET variant_a_usage_count=100000,variant_a_success_count=99000,variant_b_usage_count=100000,variant_b_success_count=1 WHERE id=?', [id]);
    await declareABTestWinner(id, 'variant_a', owner.merchantId); const first = await getABTestById(id, owner.merchantId);
    expect(first).toMatchObject({ status: 'completed', winner: 'variant_a', confidenceLevel: 0 });
    expect(first?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await declareABTestWinner(id, 'variant_a', owner.merchantId); expect(await getABTestById(id, owner.merchantId)).toEqual(first);
    await expect(declareABTestWinner(id, 'variant_b', owner.merchantId)).rejects.toThrow();
    expect(await getABTestById(id, owner.merchantId)).toEqual(first);
  });
  it('serializes conflicting manual selections', async () => {
    const id = await create(); const results = await Promise.allSettled([declareABTestWinner(id, 'variant_a', owner.merchantId), declareABTestWinner(id, 'variant_b', owner.merchantId)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getABTestById(id, owner.merchantId))?.status).toBe('completed');
  });
  it('prevents competing resume/create from running two tests for one keyword', async () => {
    const id = await create(); await pauseABTest(id, owner.merchantId);
    const results = await Promise.allSettled([resumeABTest(id, owner.merchantId), create()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await getABTests(owner.merchantId, 'running')).toHaveLength(1);
  });
  it('blocks resuming a conflicting old test but permits it after the active test closes', async () => {
    const first = await create(); await pauseABTest(first, owner.merchantId); const second = await create();
    await expect(resumeABTest(first, owner.merchantId)).rejects.toThrow();
    await declareABTestWinner(second, 'no_winner', owner.merchantId); await resumeABTest(first, owner.merchantId);
    expect(await getActiveABTestForKeyword(owner.merchantId, 'price')).toMatchObject({ id: first });
  });
  it('refuses ambiguous duplicate active legacy rows', async () => {
    await create(); await query("INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text) VALUES (?,'Legacy','price','A','B')", [owner.merchantId]);
    expect(await getActiveABTestForKeyword(owner.merchantId, 'price')).toBeNull();
  });
  it('keeps customer allocation across actual conversations and pause/resume', async () => {
    const id = await create(), phone = '966500000019';
    const a = await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const b = await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const c = await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [other.merchantId, phone]);
    const first = await selectABTestVariant(owner.merchantId, 'price', a.insertId); expect(first?.testId).toBe(id);
    expect(await selectABTestVariant(owner.merchantId, 'price', b.insertId)).toEqual(first);
    expect(await selectABTestVariant(owner.merchantId, 'price', c.insertId)).toBeNull();
    await pauseABTest(id, owner.merchantId); expect(await selectABTestVariant(owner.merchantId, 'price', a.insertId)).toBeNull();
    await resumeABTest(id, owner.merchantId); expect(await selectABTestVariant(owner.merchantId, 'price', a.insertId)).toEqual(first);
  });
  it.each(['variant_a', 'variant_b', 'no_winner'])('never creates/disables responses for old winner %s', async winner => {
    const id = await create(); await query("UPDATE ab_test_results SET status='completed',winner=?,confidence_level=95 WHERE id=?", [winner, id]);
    const response = await query('INSERT INTO quick_responses (merchant_id,`trigger`,response) VALUES (?,?,?)', [owner.merchantId, 'price', 'Keep active']);
    for (let i = 0; i < 3; i++) expect(await applyWinningVariant(id)).toBeNull();
    expect(await query('SELECT id,is_active FROM quick_responses WHERE merchant_id=?', [owner.merchantId])).toEqual([{ id: response.insertId, is_active: 1 }]);
    expect((await getABTestById(id, owner.merchantId))?.confidenceLevel).toBe(95); // historical storage is preserved
  });
  it('treats an SQL-shaped keyword as literal owned text', async () => {
    const keyword = "x' OR 1=1 --"; const id = await create({ keyword });
    expect(await getActiveABTestForKeyword(owner.merchantId, keyword)).toMatchObject({ id });
    expect(await getActiveABTestForKeyword(other.merchantId, keyword)).toBeNull();
    expect(await getActiveABTestForKeyword(owner.merchantId, 'x')).toBeNull();
  });
});
