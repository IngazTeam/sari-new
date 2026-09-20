import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), doc: vi.fn(), update: vi.fn(), storage: vi.fn(), lookup: vi.fn(), get: vi.fn(), parse: vi.fn() }));
vi.mock('../accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('../db', () => ({ getMerchantById: mocks.merchant, getKnowledgeDocByMerchantId: mocks.doc, updateKnowledgeDoc: mocks.update }));
vi.mock('../storage', () => ({ storageGet: mocks.storage }));
vi.mock('../document-parser', () => ({ extractTextFromDocument: mocks.parse }));
vi.mock('node:dns/promises', () => ({ default: { lookup: mocks.lookup } }));
vi.mock('axios', () => ({ default: { get: mocks.get } }));
import { knowledgeDocsRouter } from '../routers-knowledge-docs';

const caller = () => knowledgeDocsRouter.createCaller({ user: { id: 7, role: 'user' }, req: { headers: { 'x-merchant-id': '20' } }, res: {} } as any);
const doc = (fileType = 'pdf') => ({ id: 30, merchantId: 20, fileUrl: 'knowledge-docs/20/fixture', fileType });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager' });
  mocks.merchant.mockResolvedValue({ id: 20, businessName: 'Fixture' });
  mocks.doc.mockResolvedValue(doc());
  mocks.storage.mockResolvedValue({ url: 'https://cdn.example.test/fixture?token=private-fixture' });
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mocks.get.mockResolvedValue({ status: 200, headers: {}, data: Buffer.from('%PDF-1.7\nfixture\n%%EOF') });
  mocks.parse.mockResolvedValue({ text: 'Parsed fixture' });
  mocks.update.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('document reprocessing download boundary', () => {
  it('uses selected-store access, bounded pinned download and validated bytes before parsing', async () => {
    expect(await caller().reprocess()).toEqual({ success: true, textLength: 14 });
    expect(mocks.doc).toHaveBeenCalledWith(20);
    expect(mocks.get.mock.calls[0][1]).toMatchObject({ maxContentLength: 5 * 1024 * 1024, maxRedirects: 0, timeout: 10000, proxy: false });
    expect(mocks.parse).toHaveBeenCalledWith(expect.any(Buffer), 'pdf');
    expect(mocks.update).toHaveBeenCalledWith(30, { extractedText: 'Parsed fixture', extractionStatus: 'completed' });
  });
  it.each(['viewer', 'sales_supervisor'])('rejects %s before storage or document access', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.doc).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it('rejects unsupported legacy file types before downloading', async () => {
    mocks.doc.mockResolvedValue(doc('text'));
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['pdf', 'docx', 'xlsx'])('rejects invalid %s bytes without replacing extracted knowledge', async kind => {
    mocks.doc.mockResolvedValue(doc(kind));
    mocks.get.mockResolvedValue({ status: 200, headers: {}, data: Buffer.from('<html>not a document</html>') });
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(30, { extractionStatus: 'failed' });
  });
  it.each(['docx', 'xlsx'])('passes a validated %s package to the correct parser', async kind => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file(kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml', '<fixture/>');
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    mocks.doc.mockResolvedValue(doc(kind));
    mocks.get.mockResolvedValue({ status: 200, headers: {}, data });
    await caller().reprocess();
    expect(mocks.parse).toHaveBeenCalledWith(data, kind);
  });
  it.each([Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)])('rejects empty and oversized downloads before parsing (%#)', async data => {
    mocks.get.mockResolvedValue({ status: 200, headers: {}, data });
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it('blocks private DNS and redirect destinations without exposing signed URLs in logs', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce({ status: 302, headers: { location: 'https://127.0.0.1/private' }, data: Buffer.alloc(0) });
    await expect(caller().reprocess()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-fixture');
  });
});
