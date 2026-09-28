import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), read: vi.fn(), sections: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./knowledge/document-library', () => ({ listKnowledgeDocuments: mocks.list, readKnowledgeDocument: mocks.read }));
vi.mock('./knowledge/document-sections', () => ({ readKnowledgeDocumentSections: mocks.sections }));
import { knowledgeDocsRouter } from './routers-knowledge-docs';
const caller = () => knowledgeDocsRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any);
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ merchantId: 20, role: 'owner' }); mocks.list.mockResolvedValue({ items: [], total: 0 }); mocks.read.mockResolvedValue({ text: 'Owned text' }); });
it.each(['owner', 'manager', 'viewer', 'sales_supervisor'])('scopes %s metadata and advertises text permission correctly', async role => {
  mocks.access.mockResolvedValue({ merchantId: 20, role });
  const result = await caller().list({ search: ' file ', status: 'all', page: 1 });
  expect(mocks.list).toHaveBeenCalledWith(20, { search: 'file', status: 'all', page: 1 });
  expect(result.canReadText).toBe(['owner', 'manager'].includes(role));
});
it.each(['viewer', 'sales_supervisor'])('denies %s raw text before querying storage', async role => {
  mocks.access.mockResolvedValue({ merchantId: 20, role });
  await expect(caller().readText({ id: 4 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(mocks.read).not.toHaveBeenCalled();
  await expect(caller().sections({ id: 4 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(mocks.sections).not.toHaveBeenCalled();
});
it('uses resolved tenant identity for raw text, never forged context', async () => {
  expect(await caller().readText({ id: 4 })).toEqual({ text: 'Owned text' });
  expect(mocks.read).toHaveBeenCalledWith(20, { id: 4, page: 1 });
  await caller().sections({ id: 4 });
  expect(mocks.sections).toHaveBeenCalledWith(20, { id: 4, page: 1 });
});
it.each([{ id: -1 }, { id: 4, page: 0 }, { id: 4, page: 1.5 }, { id: 4, page: 100001 }])('rejects invalid section-link reads %j', async input => {
  await expect(caller().sections(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(mocks.sections).not.toHaveBeenCalled();
});
it('hides internal section-link read failures', async () => {
  mocks.sections.mockRejectedValue(new Error('private database detail'));
  await expect(caller().sections({ id: 4 })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge section links are temporarily unavailable' });
});
it.each([{ page: 0 }, { page: 1.5 }, { search: 'a'.repeat(101) }, { status: 'active' }])('rejects invalid list inputs %j', async input => {
  await expect(caller().list(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(mocks.list).not.toHaveBeenCalled();
});
it('hides internal read errors and fails closed on revoked membership', async () => {
  mocks.list.mockRejectedValue(new Error('private DB detail'));
  await expect(caller().list()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge library is temporarily unavailable' });
  mocks.access.mockResolvedValue(null);
  await expect(caller().readText({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(mocks.read).not.toHaveBeenCalled();
});
