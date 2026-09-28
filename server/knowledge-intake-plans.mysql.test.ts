import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, getPool, closeDb } from './db/connection';
import { knowledgeSections, knowledgeIntakeReviews, knowledgeIntakeReceipts, merchantKnowledgeDocs, knowledgeChangelog, merchants } from '../drizzle/schema';
import { saveKnowledgeReview } from './knowledge/intake-reviews';
import { reserveIntake, finishIntake } from './knowledge/intake-receipt-store';
import { buildKnowledgePlan, capturePlanBasis, applyKnowledgePlan, planContext } from './knowledge/intake-plan';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { ensureKnowledgeIntakeTestSchema } from './tests/helpers/knowledge-intake-schema';
import { fixtureKnowledgeAnalysis } from './tests/helpers/knowledge-reviewed-input';
import type { KnowledgeProposal } from '../shared/knowledge-plan';

vi.mock('./knowledge/intake-plan', async original => {
  const actual = await original<typeof import('./knowledge/intake-plan')>();
  return { ...actual, applyKnowledgePlan: vi.fn(actual.applyKnowledgePlan) };
});

describe.skipIf(!process.env.DATABASE_URL)('exact reviewed knowledge plans (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const source = { content: 'Synthetic knowledge plan source with complete reviewed text.', contentType: 'document' as const, fileName: 'Plan test.txt' };
  const proposal = (patch: Partial<KnowledgeProposal> = {}): KnowledgeProposal => ({ action: 'add', targetId: null, parentIndex: null, sectionType: 'policies', title: 'Synthetic policy', content: 'Full new synthetic policy', summary: 'Synthetic summary', reason: 'Reviewed change', ...patch });
  const section = async (merchantId = owner.merchantId, patch: Partial<typeof knowledgeSections.$inferInsert> = {}) => {
    const [row] = await (await getDb())!.insert(knowledgeSections).values({ merchantId, sectionType: 'policies', title: 'Current policy', content: 'Full old synthetic policy', source: 'manual', status: 'approved', useInBot: 1, injectAs: 'fact', ...patch });
    return row.insertId;
  };
  const prepare = async (changes: KnowledgeProposal[] = [proposal()]) => {
    const basis = await capturePlanBasis(owner.merchantId), plan = buildKnowledgePlan(basis, changes);
    const review = await saveKnowledgeReview(owner.merchantId, source, fixtureKnowledgeAnalysis, { basisHash: basis.hash, plan });
    return { raw: { ...source, requestId: randomUUID(), reviewId: review.id, acknowledged: true as const }, plan, basis };
  };
  beforeAll(ensureKnowledgeIntakeTestSchema);
  beforeEach(async () => { owner = await createDisposableMerchant('intake-plan'); other = await createDisposableMerchant('plan-other'); });
  afterEach(async () => { vi.mocked(applyKnowledgePlan).mockClear(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);

  it('applies exactly the reviewed additions, hierarchy, update, conflict and unchanged content in one receipt', async () => {
    const updated = await section(), protectedId = await section(owner.merchantId, { merchantEdited: 1 }), untouched = await section();
    const { raw, plan } = await prepare([
      proposal({ action: 'update', targetId: updated, content: 'Exact reviewed replacement' }),
      proposal({ title: 'Parent' }), proposal({ title: 'Child', parentIndex: 1 }),
      proposal({ action: 'conflict', targetId: protectedId, content: 'Inactive conflicting alternative' }),
      proposal({ action: 'unchanged', targetId: untouched, content: 'Ignored invented unchanged text' }),
      proposal({ sectionType: 'opportunities', title: 'Merchant-only opportunity' }),
    ]);
    const result = await reserveIntake(owner.merchantId, raw);
    expect(result.receipt.review?.plan).toEqual(plan);
    expect(result.receipt.outcome?.evolveResult).toMatchObject({ added: 3, evolved: 1, conflicts: 1, unchanged: 1 });
    const rows = await (await getDb())!.select().from(knowledgeSections).where(eq(knowledgeSections.merchantId, owner.merchantId));
    expect(rows.find(r => r.id === updated)).toMatchObject({ content: 'Exact reviewed replacement', title: 'Current policy', source: 'document', embedding: null, provenance: { requestId: raw.requestId, reviewId: raw.reviewId, documentId: result.receipt.documentId } });
    expect(rows.find(r => r.title === 'Child')?.parentId).toBe(rows.find(r => r.title === 'Parent')?.id);
    expect(rows.find(r => r.content === 'Inactive conflicting alternative')).toMatchObject({ status: 'pending_review', useInBot: 0 });
    expect(rows.find(r => r.id === protectedId)?.content).toBe('Full old synthetic policy');
    expect(rows.find(r => r.id === untouched)?.content).toBe('Full old synthetic policy');
    expect(rows.find(r => r.title === 'Merchant-only opportunity')).toMatchObject({ useInBot: 0, injectAs: 'none' });
    expect(await (await getDb())!.select().from(knowledgeChangelog).where(eq(knowledgeChangelog.merchantId, owner.merchantId))).toHaveLength(5);
    await finishIntake(owner.merchantId, raw.requestId, 'completed', result.receipt.outcome, result.execution!);
    await section(); // A replay returns its old receipt, even after unrelated knowledge changes.
    expect((await reserveIntake(owner.merchantId, raw)).created).toBe(false);
    expect(vi.mocked(applyKnowledgePlan)).toHaveBeenCalledTimes(1);
  });
  it.each(['content', 'status', 'addition', 'deletion', 'merchantName'] as const)('rejects changed %s before consuming review or creating archive/receipt', async change => {
    const id = await section(), { raw } = await prepare(); const db = (await getDb())!;
    if (change === 'content') await db.update(knowledgeSections).set({ content: 'Concurrent edit' }).where(eq(knowledgeSections.id, id));
    if (change === 'status') await db.update(knowledgeSections).set({ status: 'pending_review' }).where(eq(knowledgeSections.id, id));
    if (change === 'addition') await section();
    if (change === 'deletion') await db.delete(knowledgeSections).where(eq(knowledgeSections.id, id));
    if (change === 'merchantName') await db.update(merchants).set({ businessName: 'Concurrent name' }).where(eq(merchants.id, owner.merchantId));
    await expect(reserveIntake(owner.merchantId, raw)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await db.select().from(knowledgeIntakeReviews).where(eq(knowledgeIntakeReviews.merchantId, owner.merchantId))).toHaveLength(1);
    expect(await db.select().from(knowledgeIntakeReceipts).where(eq(knowledgeIntakeReceipts.merchantId, owner.merchantId))).toHaveLength(0);
    expect(await db.select().from(merchantKnowledgeDocs).where(eq(merchantKnowledgeDocs.merchantId, owner.merchantId))).toHaveLength(0);
  });
  it('rejects a basis changed during model preparation instead of blessing it with the newer version', async () => {
    const basis = await capturePlanBasis(owner.merchantId), plan = buildKnowledgePlan(basis, [proposal()]); await section();
    await expect(saveKnowledgeReview(owner.merchantId, source, fixtureKnowledgeAnalysis, { basisHash: basis.hash, plan })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('rolls back sections, changelog, receipt, archive and consumption after a failure during plan application', async () => {
    const { raw } = await prepare();
    const actual = await vi.importActual<typeof import('./knowledge/intake-plan')>('./knowledge/intake-plan');
    vi.mocked(applyKnowledgePlan).mockImplementationOnce(async (...args) => { await actual.applyKnowledgePlan(...args); throw Error('synthetic write failure'); });
    await expect(reserveIntake(owner.merchantId, raw)).rejects.toThrow('synthetic write failure');
    const db = (await getDb())!;
    for (const table of [knowledgeSections, knowledgeChangelog, knowledgeIntakeReceipts, merchantKnowledgeDocs]) expect(await db.select().from(table).where(eq(table.merchantId, owner.merchantId))).toHaveLength(0);
    expect(await db.select().from(knowledgeIntakeReviews).where(eq(knowledgeIntakeReviews.merchantId, owner.merchantId))).toHaveLength(1);
    expect((await reserveIntake(owner.merchantId, raw)).created).toBe(true);
  });
  it('ignores unrelated tenants and embedding-only writes when checking a knowledge basis', async () => {
    const id = await section(), { raw } = await prepare(); await section(other.merchantId);
    await (await getPool())!.execute('UPDATE knowledge_sections SET embedding=?, embedding_content_hash=?, updated_at=DATE_ADD(updated_at,INTERVAL 1 SECOND) WHERE id=?', [Buffer.from('synthetic'), 'a'.repeat(64), id]);
    expect((await reserveIntake(owner.merchantId, raw)).created).toBe(true);
  });
  it('rejects foreign targets, protected edits, duplicate updates and invalid hierarchy before saving a report', async () => {
    const foreign = await section(other.merchantId), protectedId = await section(owner.merchantId, { merchantEdited: 1 }), editable = await section();
    const basis = await capturePlanBasis(owner.merchantId);
    for (const changes of [[proposal({ action: 'update', targetId: foreign })], [proposal({ action: 'update', targetId: protectedId })], [proposal({ action: 'update', targetId: editable }), proposal({ action: 'update', targetId: editable })], [proposal({ parentIndex: 0 })]]) expect(() => buildKnowledgePlan(basis, changes)).toThrow();
  });
  it('does not silently omit knowledge when the complete model context exceeds the review limit', async () => {
    for (let i = 0; i < 5; i++) await section(owner.merchantId, { content: 'x'.repeat(30_000) });
    const basis = await capturePlanBasis(owner.merchantId);
    expect(() => planContext(basis)).toThrow('too large');
  });
  it('keeps children of a conflicting proposal inactive and rejects pre-plan reviews', async () => {
    const id = await section(), prepared = await prepare([proposal({ action: 'conflict', targetId: id }), proposal({ parentIndex: 0 })]);
    expect(prepared.plan.items[1]).toMatchObject({ status: 'pending_review', useInBot: false });
    await (await getDb())!.update(knowledgeIntakeReviews).set({ plan: null, basisHash: null }).where(eq(knowledgeIntakeReviews.reviewId, prepared.raw.reviewId));
    await expect(reserveIntake(owner.merchantId, prepared.raw)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
