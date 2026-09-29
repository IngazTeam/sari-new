import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
const store = vi.hoisted(() => ({ reserve: vi.fn(), finish: vi.fn(), read: vi.fn(), recover: vi.fn() }));
const reviews = vi.hoisted(() => ({ save: vi.fn(), basis: vi.fn() }));
const origin = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./knowledge/document-source', () => ({ getDocumentReviewSource: origin.read }));
vi.mock('./knowledge/intake-reviews', () => ({ saveKnowledgeReview: reviews.save }));
vi.mock('./knowledge/intake-plan', async original => ({ ...await original<typeof import('./knowledge/intake-plan')>(), capturePlanBasis: reviews.basis }));
vi.mock('./knowledge/intake-receipt-store', () => ({ reserveIntake: store.reserve, finishIntake: store.finish, getIntakeReceipt: store.read, recoverIntake: store.recover }));
const api = vi.hoisted(() => ({ merchantId: 5000, merchant: vi.fn(), count: vi.fn(), doc: vi.fn(), faqs: vi.fn(), pool: vi.fn(), execute: vi.fn(), llm: vi.fn(), ingest: vi.fn(), embed: vi.fn(), createDoc: vi.fn(), invalidate: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: vi.fn(async () => ({ merchantId: api.merchantId, role: 'owner' })) }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), getMerchantById: api.merchant, getProductCountByMerchantId: api.count, getKnowledgeDocByMerchantId: api.doc, getExtractedFaqsByMerchantId: api.faqs, getPool: api.pool, createKnowledgeDoc: api.createDoc }));
vi.mock('./_core/llm', () => ({ invokeLLM: api.llm }));
vi.mock('./db/schema-readiness', () => ({ assertRuntimeSchema: vi.fn() }));
vi.mock('./ai/knowledge-engine', () => ({ ingestContent: api.ingest }));
vi.mock('./ai/rag-engine', () => ({ embedAllSections: api.embed, hasCurrentKnowledgeEmbeddings: readiness.check }));
const readiness = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('./knowledge/document-library', () => ({ getKnowledgeDocumentSummary: vi.fn(async () => null) }));
vi.mock('./db/knowledge', () => ({ invalidateCache: api.invalidate }));
import { sariBrainRouter } from './routers-sari-brain';
const valid = { contentType: 'general', summary: 'Reviewed source', itemCount: 1, conflicts: [], impact: 'Expected knowledge effect', riskLevel: 'low', sampleQA: [], recommendation: 'review', recommendationReason: 'Human review required' };
const caller = () => sariBrainRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': String(api.merchantId) } }, res: {} } as any);
beforeEach(() => { vi.clearAllMocks(); api.merchantId++; api.merchant.mockResolvedValue({ id: api.merchantId, businessName: 'Test shop' }); api.count.mockResolvedValue(0); api.doc.mockResolvedValue(null); api.faqs.mockResolvedValue([]); api.pool.mockResolvedValue({ execute: api.execute }); api.execute.mockResolvedValue([[]]); api.llm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(valid) } }] }); api.ingest.mockResolvedValue({ evolveResult: { added: 1, evolved: 0, conflicts: 0, unchanged: 0 }, salesIntel: { usps: [], sellingTips: [], opportunities: [] } }); api.embed.mockResolvedValue(undefined); });
const content = 'معلومة '.repeat(4284) + 'END_MARKER';
beforeEach(() => {
  reviews.basis.mockResolvedValue({ hash: 'fixture-basis', businessName: 'Test shop', sections: [] });
  api.llm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ ...valid, proposedChanges: [] }) } }] });
  api.invalidate.mockResolvedValue(undefined);
  reviews.save.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000003', createdAt: '2026-09-29 01:00:00', expiresAt: '2026-09-29 01:30:00', plan: { version: 1, items: [] } });
  readiness.check.mockResolvedValue(true);
  store.reserve.mockImplementation(async (merchantId, input, rateLimit) => { rateLimit(); return { created: true, execution: { merchantId, requestId: input.requestId, token: randomUUID() }, receipt: { requestId: input.requestId, documentId: 44, state: 'processing', outcome: { success: true, evolveResult: { added: 1, evolved: 0, conflicts: 0, unchanged: 0 }, embeddingsReady: false } } }; });
  store.finish.mockImplementation(async (_id, requestId, state, outcome) => ({ requestId, documentId: 44, state, outcome }));
});
it('requires a review reference and explicit consent before reserving or processing knowledge', async () => {
  for (const extra of [{}, { reviewId: randomUUID(), acknowledged: false }, { acknowledged: true }]) {
    await expect(caller().ingestAnalyzedContent({ requestId: randomUUID(), content, contentType: 'document', ...extra } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  }
  expect(store.reserve).not.toHaveBeenCalled(); expect(api.ingest).not.toHaveBeenCalled();
});
it.each(['foreign', 'stale'])('rejects %s document origins before sending content to the model', async kind => {
  const sourceDocument = { id: 41, revision: 'a'.repeat(64) };
  if (kind === 'foreign') origin.read.mockRejectedValueOnce(new TRPCError({ code: 'NOT_FOUND' }));
  else origin.read.mockResolvedValueOnce({ sourceDocument: { id: 41, revision: 'b'.repeat(64) } });
  await expect(caller().analyzeContent({ content, contentType: 'document', sourceDocument })).rejects.toMatchObject({ code: kind === 'foreign' ? 'NOT_FOUND' : 'PRECONDITION_FAILED' });
  expect(origin.read).toHaveBeenCalledWith(api.merchantId, 41); expect(api.llm).not.toHaveBeenCalled(); expect(reviews.save).not.toHaveBeenCalled();
});
it('does not return a usable report when its durable save fails', async () => {
  reviews.save.mockRejectedValueOnce(Error('private review write failure'));
  await expect(caller().analyzeContent({ content, contentType: 'document' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(api.ingest).not.toHaveBeenCalled();
});
it('rejects a valid summary without an explicit plan instead of inventing one', async () => {
  api.llm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(valid) } }] });
  await expect(caller().analyzeContent({ content, contentType: 'document' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(reviews.save).not.toHaveBeenCalled();
});
it('preserves a knowledge change rejection during plan saving', async () => {
  reviews.save.mockRejectedValueOnce(new TRPCError({ code: 'PRECONDITION_FAILED' }));
  await expect(caller().analyzeContent({ content, contentType: 'document' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(store.reserve).not.toHaveBeenCalled();
});
it('preserves a preflight review rejection without running another model or claiming an unknown save', async () => {
  store.reserve.mockRejectedValueOnce(new TRPCError({ code: 'PRECONDITION_FAILED' }));
  await expect(caller().ingestAnalyzedContent({ requestId: randomUUID(), reviewId: randomUUID(), acknowledged: true, content, contentType: 'document' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(api.ingest).not.toHaveBeenCalled(); expect(api.embed).not.toHaveBeenCalled();
});
it('sends the accepted tail beyond 15k to analysis and the same full text to ingestion/source registration', async () => {
  expect(content.length).toBeLessThanOrEqual(30_000);
  const c = caller(); expect((await c.analyzeContent({ content, contentType: 'document' })).analysis).toEqual(valid);
  expect(api.llm.mock.calls[0][0].messages[1].content).toContain(content);
  await c.ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'document' });
  expect(api.ingest).not.toHaveBeenCalled(); expect(store.reserve.mock.calls[0][1].content).toBe(content);
  expect(reviews.save).toHaveBeenCalledWith(api.merchantId, { content, contentType: 'document' }, valid, { basisHash: 'fixture-basis', plan: { version: 1, items: [] } });
});
it.each(['analyzeContent', 'ingestAnalyzedContent'] as const)('rejects over-limit and blank %s before provider work', async endpoint => {
  await expect(caller()[endpoint]({ requestId: randomUUID(), content: 'a'.repeat(30_001), contentType: 'document' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller()[endpoint]({ requestId: randomUUID(), content: ' '.repeat(20), contentType: 'document' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(api.llm).not.toHaveBeenCalled(); expect(api.ingest).not.toHaveBeenCalled();
});
it.each(['invalid JSON', '{}', '[]', JSON.stringify({ ...valid, conflicts: 'unsafe shape' }), JSON.stringify({ ...valid, riskLevel: 'unknown' })])('fails analysis rather than fabricating success for %s', async response => {
  api.llm.mockResolvedValue({ choices: [{ message: { content: response } }] });
  await expect(caller().analyzeContent({ content: 'Complete content for review', contentType: 'custom' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(api.execute).not.toHaveBeenCalled();
});
it('returns a partial indexing result without claiming embeddings are ready', async () => {
  api.embed.mockRejectedValue(new Error('synthetic indexing failure'));
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'document' })).toMatchObject({ state: 'completed', outcome: { success: true, embeddingsReady: false } });
});
it('does not run the provider before a durable reservation or on a replay', async () => {
  store.reserve.mockRejectedValueOnce(Error('database unavailable'));
  await expect(caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'custom' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  store.reserve.mockResolvedValue({ created: false, receipt: { state: 'uncertain', outcome: null } });
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'custom' })).toMatchObject({ state: 'uncertain' });
  expect(api.ingest).not.toHaveBeenCalled(); expect(api.embed).not.toHaveBeenCalled();
});
it('does not call indexing ready just because the embedding loop returned normally', async () => {
  readiness.check.mockResolvedValue(false);
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'document' })).toMatchObject({ outcome: { success: true, embeddingsReady: false } });
});
it('preserves committed plan counts after post-save failure without generating different content', async () => {
  api.invalidate.mockRejectedValueOnce(Error('private cache failure after committed plan'));
  const requestId = randomUUID();
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId, content, contentType: 'document' })).toMatchObject({ state: 'uncertain', outcome: { evolveResult: { added: 1 } } });
  expect(store.finish).toHaveBeenCalledWith(api.merchantId, requestId, 'uncertain', expect.objectContaining({ evolveResult: { added: 1, evolved: 0, conflicts: 0, unchanged: 0 } }), expect.objectContaining({ merchantId: api.merchantId, requestId }));
  expect(api.ingest).not.toHaveBeenCalled(); expect(api.llm).not.toHaveBeenCalled();
});
it('persists an empty classification without claiming search readiness', async () => {
  store.reserve.mockResolvedValueOnce({ created: true, execution: { merchantId: api.merchantId, requestId: randomUUID(), token: randomUUID() }, receipt: { outcome: { evolveResult: { added: 0, evolved: 0, conflicts: 0, unchanged: 0 } } } });
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'document' })).toMatchObject({ state: 'empty', outcome: { success: false, embeddingsReady: false } });
  expect(api.embed).not.toHaveBeenCalled();
});
it('does not log successful ingestion when recovery closed the attempt before completion', async () => {
  store.finish.mockResolvedValueOnce({ state: 'uncertain', outcome: null, recoveredAt: '2026-09-29' });
  expect(await caller().ingestAnalyzedContent({ reviewId: randomUUID(), acknowledged: true, requestId: randomUUID(), content, contentType: 'document' })).toMatchObject({ state: 'uncertain' });
  expect(api.execute).not.toHaveBeenCalled();
});
it('reads the saved receipt without provider work and scopes it to the resolved tenant', async () => {
  const requestId = randomUUID(); store.read.mockResolvedValue({ requestId, state: 'processing' });
  expect(await caller().getIntakeReceipt({ requestId })).toMatchObject({ state: 'processing' });
  expect(store.read).toHaveBeenCalledWith(api.merchantId, requestId); expect(api.ingest).not.toHaveBeenCalled();
});
it('rejects a source read failure instead of returning an empty source collection', async () => {
  api.execute.mockRejectedValue(new Error('private database failure'));
  await expect(caller().getSources()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge sources are temporarily unavailable' });
});
it('rejects an FAQ read failure after a successful website read', async () => {
  api.faqs.mockRejectedValue(new Error('private failure'));
  await expect(caller().getSources()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});
it('rejects missing database and activity errors instead of returning an empty history', async () => {
  api.pool.mockResolvedValue(null); await expect(caller().getSources()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  await expect(caller().getActivityLog()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});
it('requires explicit recovery acknowledgement and a valid reference before touching the store', async () => {
  for (const input of [{ requestId: randomUUID() }, { requestId: randomUUID(), acknowledged: false }, { requestId: 'invalid', acknowledged: true }]) {
    await expect(caller().recoverIntakeReceipt(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  }
  expect(store.recover).not.toHaveBeenCalled();
});
it('recovers only the resolved tenant and never starts analysis or ingestion', async () => {
  const requestId = randomUUID(); store.recover.mockResolvedValue({ requestId, state: 'uncertain', recoveredAt: '2026-09-29' });
  expect(await caller().recoverIntakeReceipt({ requestId, acknowledged: true, merchantId: 999 } as any)).toMatchObject({ state: 'uncertain', recoveredAt: '2026-09-29' });
  expect(store.recover).toHaveBeenCalledWith(api.merchantId, requestId);
  expect(api.ingest).not.toHaveBeenCalled(); expect(api.llm).not.toHaveBeenCalled(); expect(api.embed).not.toHaveBeenCalled();
});
it('preserves recovery conflicts and hides unexpected database details', async () => {
  const input = { requestId: randomUUID(), acknowledged: true as const };
  store.recover.mockRejectedValueOnce(new TRPCError({ code: 'CONFLICT', message: 'Still processing' }));
  await expect(caller().recoverIntakeReceipt(input)).rejects.toMatchObject({ code: 'CONFLICT' });
  store.recover.mockRejectedValueOnce(Error('private database details'));
  await expect(caller().recoverIntakeReceipt(input)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge intake recovery could not be confirmed' });
});
