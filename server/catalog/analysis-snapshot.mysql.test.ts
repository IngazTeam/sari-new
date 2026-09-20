import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAnalysisSnapshot, mergeAnalyzedProducts } from './analysis-snapshot';
import { getPool, closeDb } from '../db/connection';
import { cleanupDisposableMerchants, createDisposableMerchant } from '../tests/helpers/disposable-merchant';
import { appRouter } from '../routers';
import { JSDOM } from 'jsdom';
import * as analyzer from '../_core/websiteAnalyzer';
import { ingestContent } from '../ai/knowledge-engine';
import { invalidateCache } from '../db/knowledge';

vi.mock('../ai/knowledge-engine', () => ({ ingestContent: vi.fn() }));
vi.mock('../ai/rag-engine', () => ({ embedAllSections: vi.fn() }));
vi.mock('../db/knowledge', () => ({ invalidateCache: vi.fn() }));
vi.mock('../_core/websiteAnalyzer', async importOriginal => ({
  ...await importOriginal<typeof import('../_core/websiteAnalyzer')>(),
  scrapeWebsite: vi.fn(), extractProducts: vi.fn(), discoverPages: vi.fn(),
}));

describe.skipIf(!process.env.DATABASE_URL)('analysis snapshot isolation and recovery (MySQL)', () => {
  const accounts: Awaited<ReturnType<typeof createDisposableMerchant>>[] = [];
  async function account() { const value = await createDisposableMerchant('snapshot'); accounts.push(value); return value; }
  let owner: Awaited<ReturnType<typeof account>>;
  const input = () => ({ websiteUrl: 'https://catalog.example.test', platform: 'custom' as const,
    productsAction: 'replace' as const, products: [{ name: 'Item', price: 99.99, productUrl: '/item' }],
    faqsAction: 'replace' as const, faqs: [{ question: 'Returns?', answer: 'Within 30 days.' }],
    pagesAction: 'replace' as const, pages: [{ pageType: 'about' as const, title: 'About', url: 'https://catalog.example.test/about' }],
  });
  const query = async (sql: string, args: unknown[] = []) => (await (await getPool())!.execute<any[]>(sql, args))[0];
  const catalogue = (merchantId = owner.merchantId) => query('SELECT * FROM products WHERE merchantId = ? ORDER BY id', [merchantId]);
  const caller = (userId = owner.userId, merchantId: number | undefined = owner.merchantId) => appRouter.createCaller({ user: { id: userId, role: 'user' }, req: { headers: merchantId ? { 'x-merchant-id': String(merchantId) } : {} }, res: {} } as any);
  beforeEach(async () => { vi.clearAllMocks(); owner = await account(); });
  afterEach(async () => { await cleanupDisposableMerchants(accounts.splice(0).map(a => a.userId)); });
  afterAll(closeDb);

  it('commits prices and knowledge together, and repeating replacement preserves IDs and history', async () => {
    expect(await applyAnalysisSnapshot(owner.merchantId, input())).toEqual({ success: true, savedProducts: 1, savedFaqs: 1, savedPages: 1 });
    const first = (await catalogue())[0];
    const [faq] = await query('SELECT id FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId]);
    const [page] = await query('SELECT id FROM discovered_pages WHERE merchant_id=?', [owner.merchantId]);
    await query('UPDATE products SET stock=7, has_variants=1 WHERE id=?', [first.id]);
    await query("INSERT INTO product_variants (product_id,merchant_id,name,price,price_unit) VALUES (?,?,'Option',500,'minor')", [first.id, owner.merchantId]);
    await query('UPDATE extracted_faqs SET usage_count=9 WHERE id=?', [faq.id]);
    await applyAnalysisSnapshot(owner.merchantId, { ...input(), products: [{ ...input().products[0], name: 'Renamed', price: 12.34 }] });
    expect(await catalogue()).toMatchObject([{ id: first.id, name: 'Renamed', price: 1234, price_unit: 'minor', stock: 7, has_variants: 1 }]);
    expect(await query('SELECT id,usage_count FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId])).toEqual([{ id: faq.id, usage_count: 9 }]);
    expect(await query('SELECT id FROM discovered_pages WHERE merchant_id=?', [owner.merchantId])).toEqual([{ id: page.id }]);
    expect(await query('SELECT product_id FROM product_variants WHERE merchant_id=?', [owner.merchantId])).toEqual([{ product_id: first.id }]);
  });

  it('serializes simultaneous merges and never overwrites a reviewed price or duplicates a source product', async () => {
    const values = await Promise.all(Array.from({ length: 8 }, () => mergeAnalyzedProducts(owner.merchantId, input().websiteUrl, input().products)));
    expect(values.reduce((sum, count) => sum + count, 0)).toBe(1);
    await query('UPDATE products SET price=1200 WHERE merchantId=?', [owner.merchantId]);
    expect(await mergeAnalyzedProducts(owner.merchantId, input().websiteUrl, [{ name: 'Renamed by crawler', price: 0, productUrl: '/item' }])).toBe(0);
    expect(await mergeAnalyzedProducts(owner.merchantId, input().websiteUrl, [{ name: ' item ', price: 1 }])).toBe(0);
    expect(await catalogue()).toMatchObject([{ name: 'Item', price: 1200 }]);
    expect(await catalogue()).toHaveLength(1);
  });

  it('requires variant price review instead of relabeling old amounts when a replacement changes currency', async () => {
    await applyAnalysisSnapshot(owner.merchantId, input());
    const product = (await catalogue())[0];
    await query('UPDATE products SET compare_at_price=12000,cost_price=1000,has_variants=1 WHERE id=?', [product.id]);
    await query("INSERT INTO product_variants (product_id,merchant_id,name,price,price_unit) VALUES (?,?,'Option',500,'minor')", [product.id, owner.merchantId]);
    await applyAnalysisSnapshot(owner.merchantId, { ...input(), products: [{ ...input().products[0], currency: 'USD' }] });
    expect((await catalogue())[0]).toMatchObject({ id: product.id, currency: 'USD', price: 9999, compare_at_price: null, cost_price: null });
    expect(await query('SELECT price,price_unit FROM product_variants WHERE product_id=?', [product.id])).toEqual([{ price: 500, price_unit: 'unverified' }]);
  });

  it('archives replaced rows instead of deleting products/variants and leaves other stores intact', async () => {
    const other = await account();
    await applyAnalysisSnapshot(owner.merchantId, input());
    await applyAnalysisSnapshot(other.merchantId, input());
    const old = (await catalogue())[0], foreign = await catalogue(other.merchantId);
    await applyAnalysisSnapshot(owner.merchantId, { ...input(), products: [{ name: 'New', price: 0 }], faqs: [{ question: 'New?', answer: 'Yes' }], pages: [{ pageType: 'contact', title: 'Contact', url: 'https://catalog.example.test/contact' }] });
    expect((await catalogue()).find(p => p.id === old.id)).toMatchObject({ status: 'archived', isActive: 0, registration_open: 0 });
    expect((await catalogue()).find(p => p.name === 'New')).toMatchObject({ price: 0, price_unit: 'minor', stock: 0, track_inventory: 1 });
    expect(await catalogue(other.merchantId)).toEqual(foreign);
    expect(await query("SELECT source_status,is_active,use_in_bot FROM extracted_faqs WHERE merchant_id=? AND question='Returns?'", [owner.merchantId])).toEqual([{ source_status: 'archived', is_active: 0, use_in_bot: 0 }]);
  });

  it('rolls back all saved/archived data when the final merchant write fails after product and FAQ inserts', async () => {
    await applyAnalysisSnapshot(owner.merchantId, input());
    const beforeProducts = await catalogue();
    const beforeFaqs = await query('SELECT * FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId]);
    const beforePages = await query('SELECT * FROM discovered_pages WHERE merchant_id=?', [owner.merchantId]);
    const constraint = `snapshot_${randomUUID().replaceAll('-', '')}`;
    const rejectedPhone = `fault-${randomUUID().slice(0, 8)}`;
    // The disposable helper verifies loopback + test database before this scoped fault injection.
    await (await getPool())!.query(`ALTER TABLE merchants ADD CONSTRAINT ${constraint} CHECK (phone IS NULL OR phone <> '${rejectedPhone}')`);
    try {
      await expect(applyAnalysisSnapshot(owner.merchantId, { ...input(), products: [{ name: 'New', price: 1 }], faqs: [{ question: 'New?', answer: 'Yes' }], pages: [{ pageType: 'contact', title: 'Contact', url: 'https://catalog.example.test/contact' }], applyContactInfo: true, contactInfo: { phones: [rejectedPhone] } })).rejects.toThrow();
      expect(await catalogue()).toEqual(beforeProducts);
      expect(await query('SELECT * FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId])).toEqual(beforeFaqs);
      expect(await query('SELECT * FROM discovered_pages WHERE merchant_id=?', [owner.merchantId])).toEqual(beforePages);
    } finally { await (await getPool())!.query(`ALTER TABLE merchants DROP CHECK ${constraint}`); }
  });

  it('rejects invalid batches before mutation, including ambiguous identities, unsafe URLs and oversized data', async () => {
    await applyAnalysisSnapshot(owner.merchantId, input());
    const before = await catalogue();
    for (const products of [
      [{ name: 'Invalid', price: 1.005 }], [{ name: '', price: 1 }], [{ name: 'x'.repeat(256), price: 1 }],
      [{ name: 'Bad URL', price: 1, productUrl: 'javascript:alert(1)' }],
      [{ name: 'Credentials', price: 1, imageUrl: 'https://user:secret@example.test/image' }],
      [{ name: 'A', price: 1, productUrl: '/same' }, { name: 'B', price: 2, productUrl: '/same#fragment' }],
    ]) await expect(applyAnalysisSnapshot(owner.merchantId, { ...input(), products })).rejects.toThrow();
    expect(await catalogue()).toEqual(before);
  });

  it('treats an empty replacement as no extraction, and respects skip choices', async () => {
    await applyAnalysisSnapshot(owner.merchantId, input());
    const before = await catalogue();
    expect(await applyAnalysisSnapshot(owner.merchantId, { ...input(), products: [], faqs: [], pages: [] })).toMatchObject({ savedProducts: 0, savedFaqs: 0, savedPages: 0 });
    await applyAnalysisSnapshot(owner.merchantId, { ...input(), productsAction: 'skip', products: [{ name: 'Skip', price: 1 }], faqsAction: 'skip', pagesAction: 'skip' });
    expect(await catalogue()).toEqual(before);
  });

  it('does not ingest skipped proposals and still invalidates short or unchanged saved context', async () => {
    await caller().analysis.applyAnalysis({ ...input(), productsAction: 'skip', faqsAction: 'skip', pagesAction: 'skip' });
    expect(ingestContent).not.toHaveBeenCalled();
    expect(invalidateCache).toHaveBeenCalledWith(owner.merchantId);
    expect(await catalogue()).toHaveLength(0);
  });

  it('replays the legacy analysis without duplicate products or lost page/FAQ identifiers', async () => {
    const html = '<html><body><div class="faq"><h3>What is your return policy?</h3><p>Returns are accepted within thirty days.</p></div></body></html>';
    vi.mocked(analyzer.scrapeWebsite).mockResolvedValue({ html, dom: new JSDOM(html), text: 'Returns are accepted within thirty days.' });
    vi.mocked(analyzer.extractProducts).mockResolvedValue([{ ...input().products[0], currency: 'SAR', description: '', imageUrl: '', inStock: true }]);
    vi.mocked(analyzer.discoverPages).mockReturnValue([{ pageType: 'faq', title: 'FAQ', url: 'https://catalog.example.test/faq' }]);
    expect(await caller().analysis.analyzeWebsite({ websiteUrl: input().websiteUrl })).toMatchObject({ success: true, productsCount: 1, pagesCount: 1, faqsCount: 1 });
    const products = await catalogue();
    const pages = await query('SELECT id,content FROM discovered_pages WHERE merchant_id=?', [owner.merchantId]);
    const faqs = await query('SELECT id FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId]);
    expect(await caller().analysis.analyzeWebsite({ websiteUrl: input().websiteUrl })).toMatchObject({ success: true, productsCount: 0, pagesCount: 1, faqsCount: 1 });
    expect(await catalogue()).toEqual(products);
    expect(await query('SELECT id,content FROM discovered_pages WHERE merchant_id=?', [owner.merchantId])).toEqual(pages);
    expect(await query('SELECT id FROM extracted_faqs WHERE merchant_id=?', [owner.merchantId])).toEqual(faqs);
    expect(pages[0].content).toContain('thirty days');
  });

  it('allows a manager in the selected store without writing their legacy-owned store', async () => {
    const manager = await account();
    await query("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [owner.merchantId, manager.userId]);
    await caller(manager.userId, owner.merchantId).analysis.applyAnalysis(input());
    expect(await catalogue()).toHaveLength(1);
    expect(await catalogue(manager.merchantId)).toHaveLength(0);
    expect((await caller(manager.userId, owner.merchantId).analysis.getExistingData()).products).toHaveLength(1);
    expect(await caller(manager.userId, owner.merchantId).websiteAnalysis.listAnalyses()).toEqual([]);
    const faq = await caller(manager.userId, owner.merchantId).sariBrain.createFaq({ question: 'Manager FAQ?', answer: 'A scoped answer.' });
    expect(faq.id).toBeGreaterThan(0);
    await caller(manager.userId, owner.merchantId).sariBrain.updateFaq({ id: faq.id, answer: 'Updated by manager.' });
    expect(await query('SELECT merchant_id,answer FROM extracted_faqs WHERE id=?', [faq.id])).toEqual([{ merchant_id: owner.merchantId, answer: 'Updated by manager.' }]);
    expect(await caller(manager.userId, manager.merchantId).sariBrain.getFaqs()).toEqual([]);
    const ambiguous = appRouter.createCaller({ user: { id: manager.userId, role: 'user' }, req: { headers: {} }, res: {} } as any);
    await expect(ambiguous.analysis.applyAnalysis(input())).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it.each(['viewer', 'sales_supervisor'])('blocks %s from applying, scraping, deleting or spending AI on comparisons', async role => {
    const member = await account();
    await query('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)', [owner.merchantId, member.userId, role]);
    const api = caller(member.userId, owner.merchantId);
    const attempts = [
      () => api.analysis.applyAnalysis(input()), () => api.analysis.previewAnalysis({ websiteUrl: input().websiteUrl }),
      () => api.analysis.analyzeWebsite({ websiteUrl: input().websiteUrl }), () => api.analysis.deletePage({ pageId: 1 }),
      () => api.analysis.deleteFaq({ faqId: 1 }), () => api.websiteAnalysis.analyze({ url: input().websiteUrl }),
      () => api.websiteAnalysis.deleteAnalysis({ id: 1 }), () => api.websiteAnalysis.deleteCompetitor({ id: 1 }),
      () => api.websiteAnalysis.compareWithCompetitors({ analysisId: 1, competitorIds: [] }),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await catalogue()).toHaveLength(0);
  });

  it('blocks cross-store IDs, unauthorized store selection and revoked membership', async () => {
    const other = await account();
    await applyAnalysisSnapshot(other.merchantId, input());
    const [page] = await query('SELECT id FROM discovered_pages WHERE merchant_id=?', [other.merchantId]);
    const [faq] = await query('SELECT id FROM extracted_faqs WHERE merchant_id=?', [other.merchantId]);
    await expect(caller().analysis.deletePage({ pageId: page.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().analysis.deleteFaq({ faqId: faq.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller(owner.userId, other.merchantId).analysis.applyAnalysis(input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await query("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',0)", [other.merchantId, owner.userId]);
    await expect(caller(owner.userId, other.merchantId).websiteAnalysis.listAnalyses()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await query('SELECT id FROM discovered_pages WHERE id=?', [page.id])).toHaveLength(1);
    expect(await query('SELECT id FROM extracted_faqs WHERE id=?', [faq.id])).toHaveLength(1);
  });
});
