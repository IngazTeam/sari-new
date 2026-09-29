import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), extract: vi.fn(), source: vi.fn(), copies: vi.fn() }));
vi.mock('../accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./document-extraction', () => ({ extractKnowledgeDocument: mocks.extract }));
vi.mock('./document-source', () => ({ getDocumentReviewSource: mocks.source }));
vi.mock('./document-library', () => ({ listKnowledgeDocumentCopies: mocks.copies }));
import { knowledgeDocsRouter } from '../routers-knowledge-docs';
const caller = () => knowledgeDocsRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any);
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager' }); mocks.extract.mockResolvedValue({ state: 'empty' }); });
it('requires a file id and UUID and uses the resolved store', async () => {
  const requestId = randomUUID(); await caller().reprocess({ id: 30, requestId });
  expect(mocks.extract).toHaveBeenCalledWith(20, requestId, { sourceDocumentId: 30 });
  await caller().reviewSource({ id: 30 }); expect(mocks.source).toHaveBeenCalledWith(20, 30);
  await caller().copies({ id: 30 }); expect(mocks.copies).toHaveBeenCalledWith(20, { id: 30, page: 1 });
});
it.each(['viewer', 'sales_supervisor'])('denies %s before reading or extracting', async role => {
  mocks.access.mockResolvedValue({ merchantId: 20, role });
  await expect(caller().reprocess({ id: 30, requestId: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(caller().reviewSource({ id: 30 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(caller().copies({ id: 30 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(mocks.extract).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.copies).not.toHaveBeenCalled();
});
it.each([undefined, {}, { id: 30 }, { id: -1, requestId: randomUUID() }, { id: 30, requestId: 'bad' }])('rejects old or invalid extraction inputs %j', async input => {
  await expect(caller().reprocess(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(mocks.extract).not.toHaveBeenCalled();
});
it('preserves actionable failures without exposing internal paths or signed URLs', async () => {
  mocks.extract.mockRejectedValueOnce(new TRPCError({ code: 'CONFLICT' }));
  await expect(caller().reprocess({ id: 30, requestId: randomUUID() })).rejects.toMatchObject({ code: 'CONFLICT' });
  mocks.extract.mockRejectedValueOnce(Error('private signed URL'));
  await expect(caller().reprocess({ id: 30, requestId: randomUUID() })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Check the saved request before extracting again' });
});
