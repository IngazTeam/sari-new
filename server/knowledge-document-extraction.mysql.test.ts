import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
const mocks = vi.hoisted(() => ({ parse: vi.fn(), put: vi.fn(), get: vi.fn(), lookup: vi.fn(), download: vi.fn() }));
vi.mock('./document-parser', async original => ({ ...await original<typeof import('./document-parser')>(), extractTextFromDocument: mocks.parse }));
vi.mock('./storage', () => ({ storagePut: mocks.put, storageGet: mocks.get }));
vi.mock('node:dns/promises', () => ({ default: { lookup: mocks.lookup } }));
vi.mock('axios', () => ({ default: { get: mocks.download } }));
import { getDb, getPool, closeDb } from './db/connection';
import { merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts, knowledgeSections as sections } from '../drizzle/schema';
import { extractKnowledgeDocument } from './knowledge/document-extraction';
import { DocumentExtractionError } from './document-parser';
import { getDocumentReviewSource } from './knowledge/document-source';
import { listKnowledgeDocumentCopies, listKnowledgeDocuments, readKnowledgeDocument } from './knowledge/document-library';
import { recoverIntake, reserveIntake, finishIntake } from './knowledge/intake-receipt-store';
import { saveKnowledgeReview, knowledgeInputHash } from './knowledge/intake-reviews';
import { capturePlanBasis, buildKnowledgePlan } from './knowledge/intake-plan';
import { removeKnowledgeSource } from './knowledge/source-lifecycle';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { ensureKnowledgeIntakeTestSchema } from './tests/helpers/knowledge-intake-schema';
import { fixtureKnowledgeAnalysis } from './tests/helpers/knowledge-reviewed-input';

describe.skipIf(!process.env.DATABASE_URL)('document extraction and origin binding (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const bytes = Buffer.from('%PDF-1.7\nfixture\n%%EOF'), text = 'Synthetic complete source '.repeat(400) + 'END_MARKER';
  const file = () => ({ file: { buffer: bytes, fileName: 'Fixture.pdf', mimeType: 'application/pdf' } });
  const extract = (requestId = randomUUID()) => extractKnowledgeDocument(owner.merchantId, requestId, file());
  const legacy = async (merchantId = owner.merchantId, patch: Partial<typeof docs.$inferInsert> = {}) => {
    const [created] = await (await getDb())!.insert(docs).values({ merchantId, fileName: 'Legacy.pdf', fileType: 'pdf', fileSize: 123, fileUrl: `knowledge-docs/${merchantId}/old`, extractedText: 'Older unchanged source text', extractionStatus: 'completed', ...patch }); return created.insertId;
  };
  const row = async (id: number) => (await (await getDb())!.select().from(docs).where(eq(docs.id, id)))[0];
  beforeAll(ensureKnowledgeIntakeTestSchema);
  beforeEach(async () => {
    vi.clearAllMocks(); owner = await createDisposableMerchant('doc-extract'); other = await createDisposableMerchant('doc-foreign');
    mocks.parse.mockResolvedValue({ text }); mocks.put.mockImplementation(async key => ({ key, url: 'https://cdn.example.test/private' }));
    mocks.get.mockResolvedValue({ url: 'https://cdn.example.test/fixture?token=private-fixture' });
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mocks.download.mockResolvedValue({ status: 200, headers: {}, data: bytes });
  });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);

  it('archives a new complete raw record without overwriting the legacy file or activating sections', async () => {
    const oldId = await legacy(), requestId = randomUUID(), receipt = await extract(requestId);
    expect(receipt).toMatchObject({ requestId, state: 'empty', outcome: null, document: { extraction: 'extracted', characters: text.length, originalStored: true } });
    expect((await row(receipt.documentId!))).toMatchObject({ intakeRequestId: requestId, extractedText: text, extractionStatus: 'completed' });
    expect((await row(oldId)).extractedText).toBe('Older unchanged source text');
    expect(await (await getDb())!.select().from(sections).where(eq(sections.merchantId, owner.merchantId))).toEqual([]);
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).items.find(item => item.id === receipt.documentId)).toMatchObject({ documentExtraction: 'extracted', canReextract: true });
  });
  it('replays the same UUID once and rejects changed file bytes without a second storage/parser call', async () => {
    const requestId = randomUUID(), first = await extract(requestId);
    expect(await extract(requestId)).toEqual(first);
    await expect(extractKnowledgeDocument(owner.merchantId, requestId, { file: { ...file().file, buffer: Buffer.from('%PDF-1.7\nchanged\n%%EOF') } })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.put).toHaveBeenCalledTimes(1); expect(mocks.parse).toHaveBeenCalledTimes(1);
    const [events] = await (await getPool())!.execute<any[]>('SELECT action_type, description FROM sari_activity_log WHERE merchant_id=?', [owner.merchantId]);
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ action_type: 'file_uploaded' }); expect(events[0].description).toContain('دون تفعيل معرفة');
  });
  it('keeps extracted text reviewable and discloses failed original storage', async () => {
    mocks.put.mockRejectedValueOnce(Error('private storage failure'));
    const receipt = await extract(); expect(receipt.document).toMatchObject({ originalStored: false, extraction: 'extracted' });
    expect((await row(receipt.documentId!)).fileUrl).toBeNull();
    expect((await getDocumentReviewSource(owner.merchantId, receipt.documentId!)).content).toBe(text);
    await expect(extractKnowledgeDocument(owner.merchantId, randomUUID(), { sourceDocumentId: receipt.documentId! })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it.each(['empty', 'too_large', 'unreadable'] as const)('persists %s extraction as a failure with no text or fabricated success', async issue => {
    mocks.parse.mockRejectedValueOnce(new DocumentExtractionError(issue));
    const receipt = await extract(); expect(receipt).toMatchObject({ state: 'empty', outcome: null, document: { extraction: 'failed', issue, characters: null } });
    expect(await row(receipt.documentId!)).toMatchObject({ extractionStatus: 'failed', extractedText: null });
  });
  it('rejects invalid upload signatures before reserving a document or using storage', async () => {
    await expect(extractKnowledgeDocument(owner.merchantId, randomUUID(), { file: { ...file().file, buffer: Buffer.from('invalid') } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await listKnowledgeDocuments(owner.merchantId, undefined)).total).toBe(0); expect(mocks.put).not.toHaveBeenCalled();
  });
  it('creates a new re-extraction linked to the selected original, bounded and pinned before parsing', async () => {
    const id = await legacy(), requestId = randomUUID(), receipt = await extractKnowledgeDocument(owner.merchantId, requestId, { sourceDocumentId: id });
    expect(receipt.document).toMatchObject({ sourceDocumentId: id, extraction: 'extracted' }); expect(receipt.documentId).not.toBe(id);
    expect((await row(id)).extractedText).toBe('Older unchanged source text');
    expect(mocks.get).toHaveBeenCalledWith(`knowledge-docs/${owner.merchantId}/old`);
    expect(mocks.download.mock.calls[0][1]).toMatchObject({ maxContentLength: 5 * 1024 * 1024, maxRedirects: 0, timeout: 10000, proxy: false });
    expect((await listKnowledgeDocumentCopies(owner.merchantId, { id })).items).toMatchObject([{ id: receipt.documentId, isExtraction: true }]);
    expect(await extractKnowledgeDocument(owner.merchantId, requestId, { sourceDocumentId: id })).toEqual(receipt); expect(mocks.parse).toHaveBeenCalledTimes(1);
  });
  it.each(['private-dns','private-redirect','bad-bytes','oversize','empty'] as const)('fails %s re-extraction without replacing the source or parsing unsafe bytes', async kind => {
    const id = await legacy();
    if (kind === 'private-dns') mocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    if (kind === 'private-redirect') mocks.download.mockResolvedValue({ status: 302, headers: { location: 'https://127.0.0.1/private' }, data: Buffer.alloc(0) });
    if (['bad-bytes','oversize','empty'].includes(kind)) mocks.download.mockResolvedValue({ status: 200, headers: {}, data: kind === 'oversize' ? Buffer.alloc(5 * 1024 * 1024 + 1) : kind === 'empty' ? Buffer.alloc(0) : Buffer.from('<html/>') });
    const receipt = await extractKnowledgeDocument(owner.merchantId, randomUUID(), { sourceDocumentId: id });
    expect(receipt.document).toMatchObject({ extraction: 'failed', issue: 'unreadable' }); expect(mocks.parse).not.toHaveBeenCalled();
    expect((await row(id)).extractedText).toBe('Older unchanged source text');
  });
  it('refuses foreign original/text/copies and enforces the re-extraction budget without blocking replay', async () => {
    const foreign = await legacy(other.merchantId);
    await expect(extractKnowledgeDocument(owner.merchantId, randomUUID(), { sourceDocumentId: foreign })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getDocumentReviewSource(owner.merchantId, foreign)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listKnowledgeDocumentCopies(owner.merchantId, { id: foreign })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.get).not.toHaveBeenCalled();
    const id = await legacy(), requestId = randomUUID();
    const first = await extractKnowledgeDocument(owner.merchantId, requestId, { sourceDocumentId: id });
    for (let i = 1; i < 5; i++) await extractKnowledgeDocument(owner.merchantId, randomUUID(), { sourceDocumentId: id });
    await expect(extractKnowledgeDocument(owner.merchantId, randomUUID(), { sourceDocumentId: id })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(await extractKnowledgeDocument(owner.merchantId, requestId, { sourceDocumentId: id })).toEqual(first);
  });
  it('protects deletion and fences a late parser result after explicit expired-request recovery', async () => {
    const requestId = randomUUID();
    let entered!: () => void, respond!: (value: { text: string }) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    mocks.parse.mockImplementationOnce(async () => {
      return new Promise<{ text: string }>(resolve => { respond = resolve; entered(); });
    });
    const extracting = extract(requestId); await started;
    try {
      await expect(removeKnowledgeSource(owner.merchantId, 'document')).rejects.toMatchObject({ code: 'CONFLICT' });
      await (await getPool())!.execute('UPDATE knowledge_intake_receipts SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE merchant_id=? AND request_id=?', [owner.merchantId, requestId]);
      await recoverIntake(owner.merchantId, requestId);
    } finally { respond({ text }); }
    const receipt = await extracting; expect(receipt).toMatchObject({ state: 'uncertain', recoveredAt: expect.any(String) });
    expect((await row(receipt.documentId!)).extractedText).toBeNull();
  });
  it('binds a reviewed copy to its source revision and preserves the original through approval', async () => {
    const original = await extract(), source = await getDocumentReviewSource(owner.merchantId, original.documentId!);
    const input = { content: source.content + ' Merchant clarification.', contentType: 'document' as const, fileName: source.fileName, sourceDocument: source.sourceDocument };
    const basis = await capturePlanBasis(owner.merchantId), plan = buildKnowledgePlan(basis, [{ action: 'add', targetId: null, parentIndex: null, sectionType: 'policies', title: 'Reviewed', content: 'Approved complete policy', summary: 'Policy', reason: 'Confirmed' }]);
    const review = await saveKnowledgeReview(owner.merchantId, input, fixtureKnowledgeAnalysis, { basisHash: basis.hash, plan });
    expect(knowledgeInputHash(input)).not.toBe(knowledgeInputHash({ ...input, sourceDocument: undefined }));
    const reserved = await reserveIntake(owner.merchantId, { ...input, requestId: randomUUID(), reviewId: review.id, acknowledged: true });
    expect(reserved.receipt.review?.sourceDocument).toEqual({ id: original.documentId, fileName: source.fileName });
    expect(reserved.receipt.documentId).not.toBe(original.documentId); expect((await row(original.documentId!)).extractedText).toBe(text);
    const copies = await listKnowledgeDocumentCopies(owner.merchantId, { id: original.documentId }); expect(copies.items).toMatchObject([{ id: reserved.receipt.documentId, isExtraction: false }]);
    await finishIntake(owner.merchantId, reserved.receipt.requestId, 'completed', reserved.receipt.outcome, reserved.execution!);
    await removeKnowledgeSource(owner.merchantId, 'document');
    const rows = await (await getDb())!.select().from(receipts).where(eq(receipts.merchantId, owner.merchantId));
    expect(rows.every(r => r.documentResult === null && r.reviewSnapshot === null && r.sourceDocumentId === null)).toBe(true);
  });
  it.each(['changed','deleted','foreign'] as const)('rejects a %s source during saved review and again before applying a plan', async kind => {
    const id = await legacy(), source = await getDocumentReviewSource(owner.merchantId, id), basis = await capturePlanBasis(owner.merchantId);
    const prepared = { basisHash: basis.hash, plan: buildKnowledgePlan(basis, []) }, input = { content: source.content, contentType: 'document' as const, sourceDocument: source.sourceDocument };
    const review = await saveKnowledgeReview(owner.merchantId, input, fixtureKnowledgeAnalysis, prepared);
    if (kind === 'changed') await (await getDb())!.update(docs).set({ extractedText: 'Changed after review' }).where(eq(docs.id, id));
    if (kind === 'deleted') await (await getDb())!.delete(docs).where(eq(docs.id, id));
    if (kind === 'foreign') await (await getDb())!.update(docs).set({ merchantId: other.merchantId }).where(eq(docs.id, id));
    await expect(saveKnowledgeReview(owner.merchantId, input, fixtureKnowledgeAnalysis, prepared)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(reserveIntake(owner.merchantId, { ...input, requestId: randomUUID(), reviewId: review.id, acknowledged: true })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await (await getDb())!.select().from(receipts).where(eq(receipts.merchantId, owner.merchantId)))).toHaveLength(0);
  });
  it('paginates every linked review without exposing text or storage keys', async () => {
    const id = await legacy(), db = (await getDb())!;
    for (let i = 0; i < 13; i++) {
      const requestId = randomUUID(), documentId = await legacy(owner.merchantId, { intakeRequestId: requestId, fileName: `Copy ${i}` });
      await db.insert(receipts).values({ merchantId: owner.merchantId, requestId, documentId, sourceDocumentId: id, inputHash: 'a'.repeat(64), contentType: 'document', state: 'completed' });
    }
    const first = await listKnowledgeDocumentCopies(owner.merchantId, { id }), second = await listKnowledgeDocumentCopies(owner.merchantId, { id, page: 2 });
    expect(first).toMatchObject({ total: 13, page: 1, totalPages: 2 }); expect(first.items).toHaveLength(12); expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(13);
    expect(first.items[0]).not.toHaveProperty('extractedText'); expect(JSON.stringify(first)).not.toContain('knowledge-docs/');
    expect((await listKnowledgeDocumentCopies(owner.merchantId, { id, page: 99 })).page).toBe(2);
  });
  it('flags legacy source text and rejects incomplete, short and oversized review reads', async () => {
    const id = await legacy(); expect((await getDocumentReviewSource(owner.merchantId, id)).legacy).toBe(true);
    for (const patch of [{ extractionStatus: 'processing' as const }, { extractionStatus: 'completed' as const, extractedText: 'short' }]) {
      await (await getDb())!.update(docs).set(patch).where(eq(docs.id, id));
      await expect(getDocumentReviewSource(owner.merchantId, id)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    }
    await (await getDb())!.update(docs).set({ extractedText: 'x'.repeat(30_001) }).where(eq(docs.id, id));
    await expect(getDocumentReviewSource(owner.merchantId, id)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
});
