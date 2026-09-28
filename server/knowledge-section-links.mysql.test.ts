import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { knowledgeSections, knowledgeIntakeReceipts, merchantKnowledgeDocs } from '../drizzle/schema';
import type { KnowledgeProposal } from '../shared/knowledge-plan';
import { getDb, closeDb, getPool } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { ensureKnowledgeIntakeTestSchema } from './tests/helpers/knowledge-intake-schema';
import { fixtureKnowledgeAnalysis } from './tests/helpers/knowledge-reviewed-input';
import { capturePlanBasis, buildKnowledgePlan } from './knowledge/intake-plan';
import { saveKnowledgeReview } from './knowledge/intake-reviews';
import { reserveIntake, finishIntake } from './knowledge/intake-receipt-store';
import { readKnowledgeDocumentSections as read } from './knowledge/document-sections';
import { listKnowledgeDocuments } from './knowledge/document-library';
import { removeKnowledgeSource } from './knowledge/source-lifecycle';

describe.skipIf(!process.env.DATABASE_URL)('durable document section links (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const proposal = (patch: Partial<KnowledgeProposal> = {}): KnowledgeProposal => ({ action: 'add', targetId: null, parentIndex: null, sectionType: 'policies', title: 'Synthetic title', content: 'Synthetic saved policy', summary: '', reason: 'Synthetic test', ...patch });
  const intake = async (changes: KnowledgeProposal[], merchantId = owner.merchantId) => {
    const source = { content: 'Synthetic source text for section link tests.', contentType: 'document' as const, fileName: 'Links fixture.txt' };
    const basis = await capturePlanBasis(merchantId), plan = buildKnowledgePlan(basis, changes);
    const review = await saveKnowledgeReview(merchantId, source, fixtureKnowledgeAnalysis, { basisHash: basis.hash, plan });
    const raw = { ...source, reviewId: review.id, requestId: randomUUID(), acknowledged: true };
    const result = await reserveIntake(merchantId, raw);
    await finishIntake(merchantId, raw.requestId, 'completed', result.receipt.outcome, result.execution!);
    return { documentId: result.receipt.documentId!, raw };
  };
  beforeAll(ensureKnowledgeIntakeTestSchema);
  beforeEach(async () => { owner = await createDisposableMerchant('section-links'); other = await createDisposableMerchant('section-links-other'); });
  afterEach(async () => cleanupDisposableMerchants([owner.userId, other.userId]));
  afterAll(closeDb);
  it('keeps original links after a second file updates the same section and replay does not replace them', async () => {
    const a = await intake([proposal()]), first = await read(owner.merchantId, { id: a.documentId });
    const sectionId = first.items[0].sectionId;
    expect(first.items[0]).toMatchObject({ action: 'add', contentChanged: false, settingsChanged: false, current: { content: 'Synthetic saved policy' } });
    const b = await intake([proposal({ action: 'update', targetId: sectionId, content: 'Later policy' })]);
    expect((await read(owner.merchantId, { id: a.documentId })).items[0]).toMatchObject({ sectionId, contentChanged: true, settingsChanged: false, saved: { content: 'Synthetic saved policy' }, current: { content: 'Later policy' } });
    expect((await read(owner.merchantId, { id: b.documentId })).items[0]).toMatchObject({ sectionId, action: 'update', contentChanged: false });
    expect((await reserveIntake(owner.merchantId, a.raw)).created).toBe(false);
    expect((await read(owner.merchantId, { id: a.documentId })).items[0].contentChanged).toBe(true);
  });
  it('records unchanged targets and new conflict IDs rather than pointing conflicts at their original target', async () => {
    const a = await intake([proposal()]), original = (await read(owner.merchantId, { id: a.documentId })).items[0].sectionId;
    const b = await intake([proposal({ action: 'unchanged', targetId: original }), proposal({ action: 'conflict', targetId: original, title: 'Alternative' }), proposal({ parentIndex: 1, title: 'Child' })]);
    const result = await read(owner.merchantId, { id: b.documentId });
    expect(result.items[0]).toMatchObject({ sectionId: original, action: 'unchanged', contentChanged: false });
    expect(result.items[1].sectionId).not.toBe(original);
    expect(result.items[1].current).toMatchObject({ status: 'pending_review', useInBot: false });
    expect(result.items[2].current?.parentId).toBe(result.items[1].sectionId);
    expect(result.items.every(item => item.settingsChanged === false)).toBe(true);
  });
  it('distinguishes settings-only changes, content changes and deleted sections; indexing alone is not a change', async () => {
    const a = await intake([proposal(), proposal(), proposal()]);
    const initial = await read(owner.merchantId, { id: a.documentId }), [one, two, three] = initial.items.map(item => item.sectionId);
    await (await getPool())!.execute('UPDATE knowledge_sections SET embedding=?, embedding_content_hash=?, updated_at=DATE_ADD(updated_at,INTERVAL 1 SECOND) WHERE id=?', [Buffer.from('synthetic'), 'a'.repeat(64), one]);
    expect((await read(owner.merchantId, { id: a.documentId })).items[0]).toMatchObject({ contentChanged: false, settingsChanged: false });
    const db = (await getDb())!;
    await db.update(knowledgeSections).set({ useInBot: 0 }).where(eq(knowledgeSections.id, one));
    await db.update(knowledgeSections).set({ title: 'New title' }).where(eq(knowledgeSections.id, two));
    await db.delete(knowledgeSections).where(eq(knowledgeSections.id, three));
    const current = await read(owner.merchantId, { id: a.documentId });
    expect(current.items[0]).toMatchObject({ contentChanged: false, settingsChanged: true });
    expect(current.items[1]).toMatchObject({ contentChanged: true, settingsChanged: false });
    expect(current.items[2]).toMatchObject({ current: null, contentChanged: null, saved: { content: 'Synthetic saved policy' } });
  });
  it('paginates bounded comparisons in saved plan order and clamps out-of-range pages', async () => {
    const a = await intake(Array.from({ length: 7 }, (_, i) => proposal({ title: `Policy ${i}` })));
    const first = await read(owner.merchantId, { id: a.documentId }), last = await read(owner.merchantId, { id: a.documentId, page: 999 });
    expect(first).toMatchObject({ total: 7, page: 1, totalPages: 2 }); expect(first.items).toHaveLength(5);
    expect(last.page).toBe(2); expect(last.items.map(item => item.saved.title)).toEqual(['Policy 5', 'Policy 6']);
  });
  it('does not guess old or incomplete links and distinguishes an intentionally empty saved plan', async () => {
    const a = await intake([]); expect(await read(owner.merchantId, { id: a.documentId })).toMatchObject({ available: true, total: 0 });
    const db = (await getDb())!;
    await db.update(knowledgeIntakeReceipts).set({ sectionLinks: null }).where(eq(knowledgeIntakeReceipts.documentId, a.documentId));
    expect(await read(owner.merchantId, { id: a.documentId })).toMatchObject({ available: false });
    const b = await intake([proposal()]);
    await db.update(knowledgeIntakeReceipts).set({ sectionLinks: { version: 1, items: [] } }).where(eq(knowledgeIntakeReceipts.documentId, b.documentId));
    expect(await read(owner.merchantId, { id: b.documentId })).toMatchObject({ available: false });
  });
  it('denies foreign documents and filters foreign section IDs even if a stored link is corrupted', async () => {
    const a = await intake([proposal()]), b = await intake([proposal({ content: 'Other tenant secret' })], other.merchantId);
    await expect(read(other.merchantId, { id: a.documentId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const foreign = (await read(other.merchantId, { id: b.documentId })).items[0].sectionId;
    const db = (await getDb())!, [row] = await db.select().from(knowledgeIntakeReceipts).where(eq(knowledgeIntakeReceipts.documentId, a.documentId));
    row.sectionLinks!.items[0].sectionId = foreign;
    await db.update(knowledgeIntakeReceipts).set({ sectionLinks: row.sectionLinks }).where(eq(knowledgeIntakeReceipts.id, row.id));
    const result = await read(owner.merchantId, { id: a.documentId });
    expect(result.items[0].current).toBeNull(); expect(JSON.stringify(result)).not.toContain('Other tenant secret');
    const listed = await listKnowledgeDocuments(owner.merchantId, undefined); expect(JSON.stringify(listed)).not.toMatch(/sectionLinks|saved|contentHash|Synthetic saved policy/);
  });
  it('removes saved mappings on source deletion and prevents reading deleted file data', async () => {
    const a = await intake([proposal()]); await removeKnowledgeSource(owner.merchantId, 'document');
    await expect(read(owner.merchantId, { id: a.documentId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const [row] = await (await getDb())!.select().from(knowledgeIntakeReceipts).where(eq(knowledgeIntakeReceipts.requestId, a.raw.requestId));
    expect(row).toMatchObject({ documentId: null, sectionLinks: null, reviewSnapshot: null });
    expect(await (await getDb())!.select().from(merchantKnowledgeDocs).where(eq(merchantKnowledgeDocs.merchantId, owner.merchantId))).toHaveLength(0);
  });
});
