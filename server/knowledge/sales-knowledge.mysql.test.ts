import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../ai/zahypi-client', () => ({ resolveZahyPiRuntimeConfig: async () => ({ enabled: false }), getOptionalZahyPiRequestContext: () => undefined }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createSection, getBotSections, getSectionById, updateSection, deleteSection, storeSectionEmbedding } from '../db/knowledge';
import { buildRAGContext, searchRelevantSections, buildDocumentContext } from '../ai/rag-engine';
import { saveMerchantTeaching } from './merchant-teaching';
import { sectionContentHash } from './retrieval';
import { getMerchantVirtualAgent } from '../ai/virtual-agent-context';

describe.skipIf(!process.env.DATABASE_URL)('sales knowledge with real MySQL and offline retrieval', () => {
  const users: number[] = [];
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
  const account = async () => { const result = await createDisposableMerchant('sales-knowledge'); users.push(result.userId); return result; };
  const query = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  beforeEach(async () => { owner = await account(); });
  afterEach(async () => { await cleanupDisposableMerchants(users); users.length = 0; });
  afterAll(closeDb);
  const section = (title: string, content: string, extra: Record<string, unknown> = {}) => createSection({
    merchantId: owner.merchantId, title, content, source: 'manual', sectionType: 'policies', status: 'approved', ...extra,
  } as any);

  it('cannot load another merchant virtual agent identity or instructions via a forged stored agent id', async () => {
    const other = await account();
    const inserted = await query(`INSERT INTO virtual_agents (merchant_id, name, role, personality_prompt)
      VALUES (?, 'Private Agent', 'sales', 'PRIVATE-OTHER-MERCHANT-INSTRUCTIONS')`, [other.merchantId]);
    expect(await getMerchantVirtualAgent(owner.merchantId, inserted.insertId)).toBeNull();
    expect(await getMerchantVirtualAgent(other.merchantId, inserted.insertId)).toMatchObject({ name: 'Private Agent' });
    for (const invalid of [0, -1, NaN, '1 OR 1=1']) expect(await getMerchantVirtualAgent(owner.merchantId, invalid as number)).toBeNull();
  });

  it('retrieves a new topic on the next turn, without embedding or a cached answer', async () => {
    await section('الاسترجاع', 'الاسترجاع خلال سبعة أيام');
    await section('الضمان', 'الضمان سنتان');
    const first = await buildRAGContext(owner.merchantId, 'شروط الاسترجاع');
    const second = await buildRAGContext(owner.merchantId, 'مدة الضمان');
    expect(first.facts).toContain('سبعة أيام'); expect(first.facts).not.toContain('سنتان');
    expect(second.facts).toContain('سنتان'); expect(second.facts).not.toContain('سبعة أيام');
    expect(second.facts).toContain('source=manual'); expect(second.facts).toContain('status=approved');
  });
  it('excludes another merchant, pending, disabled, private and expired sources', async () => {
    const other = await account();
    await section('الضمان', 'معتمد');
    await section('الضمان', 'خاص بنشاط آخر', { merchantId: other.merchantId });
    await section('الضمان', 'معلق', { status: 'pending_review' });
    await section('الضمان', 'معطل', { useInBot: false });
    await section('الضمان', 'سري', { injectAs: 'none' });
    await section('الضمان', 'منتهي', { validUntil: new Date('2020-01-01') });
    const result = await searchRelevantSections(owner.merchantId, 'الضمان');
    expect(result.map(row => row.section.content)).toEqual(['معتمد']);
  });
  it('does not mislabel unrelated unembedded knowledge as relevant; keeps identity independently', async () => {
    for (let n = 0; n < 10; n++) await section('منتجات', `منتج ${n}`);
    await section('هوية النشاط', 'متجر الاختبار', { sectionType: 'identity' });
    const result = await searchRelevantSections(owner.merchantId, 'التأشيرات', 2);
    expect(result.map(row => row.section.content)).toEqual(['متجر الاختبار']);
  });
  it('rejects a late embedding result for text modified while the provider ran', async () => {
    const id = await section('الضمان', 'سنتان'), old = (await getSectionById(id, owner.merchantId))!;
    await updateSection(id, owner.merchantId, { content: 'سنة واحدة' });
    expect(await storeSectionEmbedding(old, owner.merchantId, Buffer.alloc(1536 * 4))).toBe(false);
    expect((await query('SELECT embedding FROM knowledge_sections WHERE id=?', [id]))[0].embedding).toBeNull();
    const current = (await getSectionById(id, owner.merchantId))!;
    expect(await storeSectionEmbedding(current, owner.merchantId, Buffer.alloc(1536 * 4))).toBe(true);
    expect((await query('SELECT embedding_content_hash FROM knowledge_sections WHERE id=?', [id]))[0].embedding_content_hash).toBe(sectionContentHash(current));
    await updateSection(id, owner.merchantId, { title: 'ضمان معدل' });
    expect((await query('SELECT embedding,embedding_content_hash FROM knowledge_sections WHERE id=?', [id]))[0]).toEqual({ embedding: null, embedding_content_hash: null });
  });
  it('rejects cross-merchant embedding writes and cannot recreate a deleted source', async () => {
    const id = await section('الضمان', 'سنتان'), old = (await getSectionById(id, owner.merchantId))!, other = await account();
    expect(await storeSectionEmbedding(old, other.merchantId, Buffer.alloc(4))).toBe(false);
    await deleteSection(id, owner.merchantId);
    expect(await storeSectionEmbedding(old, owner.merchantId, Buffer.alloc(4))).toBe(false);
    expect((await buildRAGContext(owner.merchantId, 'الضمان')).facts).toBe('');
  });
  it('reads changed prices/terms and stops using revoked knowledge on the next lookup', async () => {
    const id = await section('الضمان', 'سنتان');
    await updateSection(id, owner.merchantId, { content: 'سنة واحدة' });
    expect((await buildRAGContext(owner.merchantId, 'الضمان')).facts).toContain('سنة واحدة');
    await updateSection(id, owner.merchantId, { useInBot: false });
    expect((await buildRAGContext(owner.merchantId, 'الضمان')).facts).toBe('');
  });
  it('publishes explicit general teaching atomically and replaces the same question without duplicates', async () => {
    const data = { merchantId: owner.merchantId, question: 'مدة الضمان', answer: 'سنتان', origin: 'teach_command' as const };
    const [a,b] = await Promise.all([saveMerchantTeaching(data), saveMerchantTeaching(data)]);
    expect(a).toEqual(b); expect(a.approved).toBe(true);
    expect(await getBotSections(owner.merchantId)).toHaveLength(1);
    const edit = await saveMerchantTeaching({ ...data, answer: 'سنة واحدة' });
    expect(edit.sectionId).toBe(a.sectionId);
    expect((await buildRAGContext(owner.merchantId, 'الضمان')).facts).toContain('سنة واحدة');
    expect(await query('SELECT id FROM knowledge_changelog WHERE merchant_id=?', [owner.merchantId])).toHaveLength(2);
  });
  it('customer-specific corrections remain unavailable until explicitly reviewed; updates require review again', async () => {
    const data = { merchantId: owner.merchantId, question: 'عرض أحمد الخاص', answer: 'سعر أحمد 200', origin: 'coaching_correction' as const, referenceId: 3 };
    const saved = await saveMerchantTeaching(data);
    expect(saved.approved).toBe(false); expect(await getBotSections(owner.merchantId)).toHaveLength(0);
    await updateSection(saved.sectionId, owner.merchantId, { content: 'عروض عامة معتمدة', status: 'approved', useInBot: true });
    expect(await getBotSections(owner.merchantId)).toHaveLength(1);
    await saveMerchantTeaching({ ...data, answer: 'سعر أحمد 180' });
    expect(await getBotSections(owner.merchantId)).toHaveLength(0);
  });
  it('separates identical teaching questions between tenants', async () => {
    const other = await account();
    const a = await saveMerchantTeaching({ merchantId: owner.merchantId, question: 'ضمان', answer: 'سنتان', origin: 'teach_command' });
    const b = await saveMerchantTeaching({ merchantId: other.merchantId, question: 'ضمان', answer: 'شهران', origin: 'teach_command' });
    expect(a.sectionId).not.toBe(b.sectionId);
    expect((await buildRAGContext(owner.merchantId, 'ضمان')).facts).not.toContain('شهران');
  });
  it('searches the active document late passages and never reveals older uploads on a miss or extraction failure', async () => {
    const doc = async (text: string, date: string, status='completed') => query(`INSERT INTO merchant_knowledge_docs
      (merchant_id,file_name,file_type,file_size,extracted_text,extraction_status,uploaded_at) VALUES (?,'Fixture.pdf','pdf',100,?,?,?)`, [owner.merchantId, text, status, date]);
    await doc('ضمان قديم خمس سنوات', '2020-01-01');
    await doc('مقدمة بلا تفاصيل\n'.repeat(500)+'\nالضمان الحالي سنتان\n', '2021-01-01');
    expect(await buildDocumentContext(owner.merchantId, 'الضمان')).toContain('الضمان الحالي سنتان');
    expect(await buildDocumentContext(owner.merchantId, 'الضمان')).not.toContain('خمس سنوات');
    expect(await buildDocumentContext(owner.merchantId, 'الاسترجاع')).toBe('');
    await doc('الضمان قيد الاستخراج', '2022-01-01', 'pending');
    expect(await buildDocumentContext(owner.merchantId, 'الضمان')).toBe('');
  });
  it('the actual prompt builder recognizes retrieved documents as knowledge without requiring classified sections', async () => {
    await query(`INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extracted_text,extraction_status)
      VALUES (?,'Fixture.pdf','pdf',100,?,'completed')`, [owner.merchantId, 'مقدمة عامة\n'.repeat(500) + '\nالضمان سنتان للأجهزة الأصلية']);
    const { buildEnhancedContextPrompt } = await import('../ai/sari-personality');
    const prompt = await buildEnhancedContextPrompt({ merchantId: owner.merchantId, merchantName: 'متجر الاختبار', customerMessage: 'مدة الضمان', availableProducts: [] });
    expect(prompt).toContain('الضمان سنتان');
    expect(prompt).not.toContain('أنت لا تملك أي معلومات');
    expect(prompt).toContain('[D');
  });
  it('the context builder used by both paths includes current product descriptions and source prices', async () => {
    const { buildEnhancedContextPrompt } = await import('../ai/sari-personality');
    const prompt = await buildEnhancedContextPrompt({ merchantId: owner.merchantId, merchantName: 'متجر الاختبار',
      customerMessage: 'ما مميزات سماعة الاختبار؟', availableProducts: [{ id: 90204, merchantId: owner.merchantId,
        name: 'سماعة الاختبار', description: 'تدعم الاتصال بجهازين ولها ميكروفون مدمج', price: 23000, priceUnit: 'minor', currency: 'SAR',
        isActive: true, stock: 5, priceVerificationStatus: 'verified' }] as any });
    expect(prompt).toContain('تدعم الاتصال بجهازين ولها ميكروفون مدمج');
    expect(prompt).toContain('سماعة الاختبار');
    const normalizedNumbers = prompt.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660));
    expect(normalizedNumbers).toContain('230 ريال');
    expect(prompt).not.toContain('أنت لا تملك أي معلومات');
  });
});
