import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), faqs: vi.fn(), document: vi.fn(), section: vi.fn(), createSection: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  getMerchantById: mocks.merchant, getExtractedFaqsByMerchantId: mocks.faqs, getKnowledgeDocByMerchantId: mocks.document,
}));
vi.mock('./db/knowledge', () => ({ getSectionById: mocks.section, createSection: mocks.createSection }));
import { appRouter } from './routers';
import { sariBrainRouter } from './routers-sari-brain';

const caller = () => appRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': '20' } }, res: {}, merchantId: 999 } as any);
const mutations = Object.entries(sariBrainRouter._def.procedures).filter(([, procedure]) => procedure._def.type === 'mutation').map(([name]) => name);
const salesMutations = new Set(['createQuotation', 'updateQuotationStatus', 'sendQuotationToCustomer', 'createQuotationTemplate', 'updateQuotationTemplate', 'deleteQuotationTemplate']);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer', memberId: 3 });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.faqs.mockResolvedValue([{ id: 4, merchantId: 20, question: 'Scoped FAQ' }]);
  mocks.document.mockResolvedValue({ id: 5, merchantId: 20, extractedText: 'Private source text', fileName: 'Profile.pdf' });
});

describe('mounted knowledge permissions', () => {
  it.each(mutations)('rejects viewer mutation %s before handler or AI work', async name => {
    await expect((caller().sariBrain as any)[name]({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(mutations.filter(name => !salesMutations.has(name)))('rejects sales supervisor knowledge mutation %s', async name => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'sales_supervisor', memberId: 3 });
    await expect((caller().sariBrain as any)[name]({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('retains sales supervisor order permissions without letting forged context select another store', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'sales_supervisor', memberId: 3 });
    // Invalid sales input reaches validation; authorization did not wrongly deny this role.
    await expect(caller().sariBrain.createQuotation({} as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'sales_supervisor'])('blocks %s from API credentials and document mutation', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
    await expect(caller().sariBrain.listApiKeys()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().knowledgeDocs.delete()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().knowledgeDocs.reprocess()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(['owner', 'manager', 'sales_supervisor', 'viewer'])('scopes %s reads and returns document metadata without source text', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
    expect(await caller().sariBrain.getFaqs()).toEqual([{ id: 4, merchantId: 20, question: 'Scoped FAQ' }]);
    expect(await caller().knowledgeDocs.getCurrent()).toEqual({ id: 5, merchantId: 20, fileName: 'Profile.pdf', hasText: true });
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.merchant).toHaveBeenCalledWith(20);
    expect(mocks.faqs).toHaveBeenCalledWith(20);
    expect(mocks.document).toHaveBeenCalledWith(20);
  });
  it('fails closed on revoked access and identity database errors', async () => {
    mocks.access.mockResolvedValue(null);
    await expect(caller().sariBrain.resetBrain()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.access.mockRejectedValue(new Error('synthetic database unavailable'));
    await expect(caller().knowledgeDocs.delete()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('rejects an unowned parent before creating a knowledge section', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    mocks.section.mockResolvedValue(null);
    await expect(caller().sariBrain.createSection({ sectionType: 'custom', title: 'Child', content: 'Owned content', parentId: 90 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.section).toHaveBeenCalledWith(90, 20);
    expect(mocks.createSection).not.toHaveBeenCalled();
  });
});
