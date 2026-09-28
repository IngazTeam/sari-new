import { beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ merchantId: 5000, merchant: vi.fn(), count: vi.fn(), doc: vi.fn(), faqs: vi.fn(), pool: vi.fn(), execute: vi.fn(), llm: vi.fn(), ingest: vi.fn(), embed: vi.fn(), createDoc: vi.fn(), invalidate: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: vi.fn(async () => ({ merchantId: api.merchantId, role: 'owner' })) }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), getMerchantById: api.merchant, getProductCountByMerchantId: api.count, getKnowledgeDocByMerchantId: api.doc, getExtractedFaqsByMerchantId: api.faqs, getPool: api.pool, createKnowledgeDoc: api.createDoc }));
vi.mock('./_core/llm', () => ({ invokeLLM: api.llm }));
vi.mock('./db/schema-readiness', () => ({ assertRuntimeSchema: vi.fn() }));
vi.mock('./ai/knowledge-engine', () => ({ ingestContent: api.ingest }));
vi.mock('./ai/rag-engine', () => ({ embedAllSections: api.embed }));
vi.mock('./knowledge/document-library', () => ({ getKnowledgeDocumentSummary: vi.fn(async () => null) }));
vi.mock('./db/knowledge', () => ({ invalidateCache: api.invalidate }));
import { sariBrainRouter } from './routers-sari-brain';
const valid = { contentType: 'general', summary: 'Reviewed source', itemCount: 1, conflicts: [], impact: 'Expected knowledge effect', riskLevel: 'low', sampleQA: [], recommendation: 'review', recommendationReason: 'Human review required' };
const caller = () => sariBrainRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': String(api.merchantId) } }, res: {} } as any);
beforeEach(() => { vi.clearAllMocks(); api.merchantId++; api.merchant.mockResolvedValue({ id: api.merchantId, businessName: 'Test shop' }); api.count.mockResolvedValue(0); api.doc.mockResolvedValue(null); api.faqs.mockResolvedValue([]); api.pool.mockResolvedValue({ execute: api.execute }); api.execute.mockResolvedValue([[]]); api.llm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(valid) } }] }); api.ingest.mockResolvedValue({ evolveResult: { added: 1, evolved: 0, conflicts: 0, unchanged: 0 }, salesIntel: { usps: [], sellingTips: [], opportunities: [] } }); api.embed.mockResolvedValue(undefined); });
const content = 'معلومة '.repeat(4284) + 'END_MARKER';
it('sends the accepted tail beyond 15k to analysis and the same full text to ingestion/source registration', async () => {
  expect(content.length).toBeLessThanOrEqual(30_000);
  const c = caller(); expect((await c.analyzeContent({ content, contentType: 'document' })).analysis).toEqual(valid);
  expect(api.llm.mock.calls[0][0].messages[1].content).toContain(content);
  await c.ingestAnalyzedContent({ content, contentType: 'document' });
  expect(api.ingest.mock.calls[0][1]).toBe(content); expect(api.createDoc.mock.calls[0][0].extractedText).toBe(content);
});
it.each(['analyzeContent', 'ingestAnalyzedContent'] as const)('rejects over-limit and blank %s before provider work', async endpoint => {
  await expect(caller()[endpoint]({ content: 'a'.repeat(30_001), contentType: 'document' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(caller()[endpoint]({ content: ' '.repeat(20), contentType: 'document' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(api.llm).not.toHaveBeenCalled(); expect(api.ingest).not.toHaveBeenCalled();
});
it.each(['invalid JSON', '{}', '[]', JSON.stringify({ ...valid, conflicts: 'unsafe shape' }), JSON.stringify({ ...valid, riskLevel: 'unknown' })])('fails analysis rather than fabricating success for %s', async response => {
  api.llm.mockResolvedValue({ choices: [{ message: { content: response } }] });
  await expect(caller().analyzeContent({ content: 'Complete content for review', contentType: 'custom' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(api.execute).not.toHaveBeenCalled();
});
it('returns a partial indexing result without claiming embeddings are ready', async () => {
  api.embed.mockRejectedValue(new Error('synthetic indexing failure'));
  expect(await caller().ingestAnalyzedContent({ content, contentType: 'document' })).toMatchObject({ success: true, embeddingsReady: false });
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
