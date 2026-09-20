import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { cleanupDisposableMerchants, createDisposableMerchant } from '../tests/helpers/disposable-merchant';
import { removeKnowledgeSource, removeKnowledgeSections, resetKnowledgeSources } from './source-lifecycle';
import { applyAnalysisSnapshot } from '../catalog/analysis-snapshot';
import { persistCrawledKnowledge } from './crawled-snapshot';
import { appRouter } from '../routers';
import { getSessionWithFallback } from '../ai/session-store';

describe.skipIf(!process.env.DATABASE_URL)('knowledge lifecycle atomicity and tenant isolation (MySQL)', () => {
  const users: number[] = [];
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
  // These are fixture/read statements only. Application operations below are never retried.
  const query = async (sql: string, args: unknown[] = []): Promise<any> => {
    for (let attempt = 0; ; attempt++) {
      try { return (await (await getPool())!.execute<any>(sql, args))[0]; }
      catch (error) { if ((error as { code?: string }).code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error; }
    }
  };
  const account = async () => { const value = await createDisposableMerchant('knowledge'); users.push(value.userId); return value; };
  beforeEach(async () => { owner = await account(); });
  afterEach(async () => { await cleanupDisposableMerchants(users); users.length = 0; });
  afterAll(closeDb);
  const caller = (userId = owner.userId, merchantId = owner.merchantId) => appRouter.createCaller({ user: { id: userId, role: 'user' }, req: { headers: { 'x-merchant-id': String(merchantId) } }, res: {} } as any);
  async function section(merchantId: number, source: string, parentId: number | null = null) {
    const result = await query("INSERT INTO knowledge_sections (merchant_id,parent_id,section_type,title,content,source) VALUES (?,?,'custom','Fixture','Private fixture text',?)", [merchantId, parentId, source]);
    return Number(result.insertId);
  }
  async function seed(merchantId = owner.merchantId) {
    const doc = await query("INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extracted_text,extraction_status) VALUES (?,'Fixture.pdf','pdf',100,'Private fixture text','completed')", [merchantId]);
    const website = await query("INSERT INTO website_analyses (merchant_id,url,status,scraped_content) VALUES (?,'https://fixture.example.test','completed','Fixture site text')", [merchantId]);
    await query("INSERT INTO discovered_pages (merchant_id,page_type,title,url,content) VALUES (?,'faq','Fixture','https://fixture.example.test/faq','Private page')", [merchantId]);
    await query("INSERT INTO products (merchantId,name,price,price_unit) VALUES (?,'Fixture item',9999,'minor')", [merchantId]);
    await query("INSERT INTO extracted_faqs (merchant_id,question,answer) VALUES (?,'Fixture question?','Fixture answer')", [merchantId]);
    const documentRoot = await section(merchantId, 'document');
    const child = await section(merchantId, 'ai_evolved', documentRoot);
    const grandchild = await section(merchantId, 'manual', child);
    const websiteRoot = await section(merchantId, 'website');
    const manualRoot = await section(merchantId, 'manual');
    await query("INSERT INTO knowledge_changelog (merchant_id,section_id,action,old_content) VALUES (?,?,'add','Private historical text')", [merchantId, grandchild]);
    await query("INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Question','Cached private answer')", [merchantId]);
    const conversation = await query("INSERT INTO conversations (merchantId,customerPhone,customerName) VALUES (?,'966500000001','Fixture')", [merchantId]);
    const conversationId = Number(conversation.insertId), sessionKey = `${merchantId}:${conversationId}`;
    await query("INSERT INTO session_contexts (merchant_id,conversation_id,session_key,context_json,expires_at,version) VALUES (?,?,?, ?,TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP()),1)", [merchantId, conversationId, sessionKey, JSON.stringify({ merchantId, conversationId, contextPrompt: 'Old knowledge' })]);
    return { docId: Number(doc.insertId), websiteId: Number(website.insertId), documentRoot, child, grandchild, websiteRoot, manualRoot, conversationId, sessionKey };
  }
  const tables = ['merchant_knowledge_docs','website_analyses','discovered_pages','extracted_faqs','knowledge_sections','knowledge_changelog','sari_response_cache','session_contexts','sari_activity_log'] as const;
  async function snapshot(merchantId: number) {
    const result: Record<string, unknown> = {};
    for (const table of tables) result[table] = await query(`SELECT * FROM ${table} WHERE merchant_id=? ORDER BY id`, [merchantId]);
    result.products = await query('SELECT * FROM products WHERE merchantId=? ORDER BY id', [merchantId]);
    return result;
  }

  it('deletes documents and all descendant sections, purges cached answers and expires durable context together', async () => {
    const fixture = await seed(), other = await account();
    await seed(other.merchantId);
    // A malformed historical foreign parent must never let one tenant delete another's child.
    const foreignChild = await section(other.merchantId, 'manual', fixture.documentRoot);
    const foreignBefore = await snapshot(other.merchantId);
    expect(await removeKnowledgeSource(owner.merchantId, 'document', `doc-${fixture.docId}`)).toEqual({ deleted: 1, sections: 3 });
    expect(await query('SELECT id FROM merchant_knowledge_docs WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
    expect((await query('SELECT id FROM knowledge_sections WHERE merchant_id=? ORDER BY id', [owner.merchantId])).map((r: any) => r.id)).toEqual([fixture.websiteRoot, fixture.manualRoot]);
    expect(await query('SELECT id FROM knowledge_changelog WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
    expect(await query('SELECT id FROM sari_response_cache WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
    expect(await query('SELECT context_json,version,expires_at <= UTC_TIMESTAMP() AS expired FROM session_contexts WHERE merchant_id=?', [owner.merchantId])).toEqual([{ context_json: 'null', version: 2, expired: 1 }]);
    expect(await getSessionWithFallback(owner.merchantId, fixture.conversationId)).toBeNull();
    expect(await snapshot(other.merchantId)).toEqual(foreignBefore);
    expect(await query('SELECT id FROM knowledge_sections WHERE id=?', [foreignChild])).toHaveLength(1);
  });

  it('never exposes an older document after deleting the current source', async () => {
    const fixture = await seed();
    const older = await query("INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,uploaded_at) VALUES (?,'Older.pdf','pdf',5,'2020-01-01 00:00:00')", [owner.merchantId]);
    await expect(removeKnowledgeSource(owner.merchantId, 'document', `doc-${older.insertId}`)).rejects.toMatchObject({ name: 'KnowledgeSourceNotFoundError' });
    await caller().sariBrain.deleteSource({ sourceType: 'document', sourceId: `doc-${fixture.docId}` });
    expect(await caller().knowledgeDocs.getCurrent()).toBeNull();
  });

  it('rolls back every source, audit entry and cache if durable invalidation fails at the last write', async () => {
    const fixture = await seed(), before = await snapshot(owner.merchantId);
    const constraint = `knowledge_${randomUUID().replaceAll('-', '')}`;
    await (await getPool())!.query(`ALTER TABLE session_contexts ADD CONSTRAINT ${constraint} CHECK (session_key <> '${fixture.sessionKey}' OR version = 1)`);
    try {
      await expect(caller().sariBrain.resetBrain()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(await snapshot(owner.merchantId)).toEqual(before);
    } finally { await (await getPool())!.query(`ALTER TABLE session_contexts DROP CHECK ${constraint}`); }
  });

  it('resets all knowledge atomically while preserving conversations, orders, credentials and another store', async () => {
    const fixture = await seed(), other = await account();
    await seed(other.merchantId);
    await query("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount) VALUES (?,'966500000001','Fixture','[]',9999)", [owner.merchantId]);
    await query("INSERT INTO sari_api_keys (merchant_id,key_hash,key_prefix,permissions) VALUES (?,?,'test-only','[]')", [owner.merchantId, randomUUID().replaceAll('-', '')]);
    const ordersBefore = await query('SELECT * FROM orders WHERE merchantId=?', [owner.merchantId]);
    const keysBefore = await query('SELECT * FROM sari_api_keys WHERE merchant_id=?', [owner.merchantId]);
    const foreignBefore = await snapshot(other.merchantId);
    const result = await caller().sariBrain.resetBrain();
    expect(result.success).toBe(true);
    expect(result.deletedSources).toEqual(['document','products','website','faqs','knowledge_sections']);
    for (const table of tables.filter(t => !['session_contexts','sari_activity_log'].includes(t))) expect(await query(`SELECT id FROM ${table} WHERE merchant_id=?`, [owner.merchantId])).toEqual([]);
    expect(await query('SELECT id FROM products WHERE merchantId=?', [owner.merchantId])).toEqual([]);
    expect(await query('SELECT id FROM conversations WHERE id=? AND merchantId=?', [fixture.conversationId, owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT id FROM merchants WHERE id=?', [owner.merchantId])).toHaveLength(1);
    expect(await query('SELECT * FROM orders WHERE merchantId=?', [owner.merchantId])).toEqual(ordersBefore);
    expect(await query('SELECT * FROM sari_api_keys WHERE merchant_id=?', [owner.merchantId])).toEqual(keysBefore);
    expect(await snapshot(other.merchantId)).toEqual(foreignBefore);
    expect((await resetKnowledgeSources(owner.merchantId)).deletedSources).toEqual([]);
  });

  it('validates every displayed source identity and rolls back before touching the selected store', async () => {
    await seed();
    const before = await snapshot(owner.merchantId);
    for (const [source, id] of [['document','doc-9999999'],['website','website-9999999'],['products',`products-${owner.merchantId + 1}`],['faqs','faqs-NaN'],['website','website-999999999999999999999']] as const) {
      await expect(removeKnowledgeSource(owner.merchantId, source, id)).rejects.toMatchObject({ name: 'KnowledgeSourceNotFoundError' });
    }
    expect(await snapshot(owner.merchantId)).toEqual(before);
  });

  it('serializes duplicate document deletion with one committed audit', async () => {
    const fixture = await seed();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => removeKnowledgeSource(owner.merchantId, 'document', `doc-${fixture.docId}`)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await query("SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='document_deleted'", [owner.merchantId])).toHaveLength(1);
  });

  it('routes document deletion through the same transaction for an authorized manager', async () => {
    await seed();
    const manager = await account();
    await query("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [owner.merchantId, manager.userId]);
    await caller(manager.userId).knowledgeDocs.delete();
    expect(await caller().knowledgeDocs.getCurrent()).toBeNull();
    expect(await query("SELECT id FROM knowledge_sections WHERE merchant_id=? AND source='document'", [owner.merchantId])).toEqual([]);
    await query("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?", [owner.merchantId, manager.userId]);
    await expect(caller(manager.userId).knowledgeDocs.delete()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('handles multi-level and cyclic section graphs without crossing tenant boundaries', async () => {
    const root = await section(owner.merchantId, 'website'), child = await section(owner.merchantId, 'manual', root);
    await query('UPDATE knowledge_sections SET parent_id=? WHERE id=?', [child, root]);
    expect(await removeKnowledgeSections(owner.merchantId, 'website')).toBe(2);
    expect(await query('SELECT id FROM knowledge_sections WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
  });

  it('saves crawled pages and FAQs additively in one transaction, retaining merchant platform and disabled choices', async () => {
    await query("UPDATE merchants SET platform_type='salla', analysis_status='analyzing' WHERE id=?", [owner.merchantId]);
    const facts = { faqs: [{ question: 'Existing question?', answer: 'Reviewed answer' }], _crawledPages: [{ success: true, pageType: 'faq', title: 'Reviewed', url: 'https://fixture.example.test/faq', content: 'Reviewed page' }] };
    await persistCrawledKnowledge(owner.merchantId, 'https://fixture.example.test', facts);
    await query('UPDATE discovered_pages SET use_in_bot=0 WHERE merchant_id=?', [owner.merchantId]);
    await persistCrawledKnowledge(owner.merchantId, 'https://fixture.example.test', { ...facts, faqs: [{ question: 'Existing question?', answer: 'Unreviewed change' }, { question: 'New question?', answer: 'New answer' }] });
    expect(await query('SELECT use_in_bot FROM discovered_pages WHERE merchant_id=?', [owner.merchantId])).toEqual([{ use_in_bot: 0 }]);
    expect(await query("SELECT answer FROM extracted_faqs WHERE merchant_id=? AND question='Existing question?'", [owner.merchantId])).toEqual([{ answer: 'Reviewed answer' }]);
    expect(await query('SELECT platform_type,analysis_status FROM merchants WHERE id=?', [owner.merchantId])).toEqual([{ platform_type: 'salla', analysis_status: 'analyzing' }]);
    const before = await snapshot(owner.merchantId);
    await expect(persistCrawledKnowledge(owner.merchantId, 'https://fixture.example.test', { faqs: [{ question: '', answer: 'Invalid' }], _crawledPages: [{ success: true, url: 'https://fixture.example.test/new' }] })).rejects.toThrow();
    expect(await snapshot(owner.merchantId)).toEqual(before);
  });

  it('commits analysis changes with durable cache invalidation instead of requiring a post-commit callback', async () => {
    const fixture = await seed();
    await applyAnalysisSnapshot(owner.merchantId, { websiteUrl: 'https://fixture.example.test', platform: 'custom', productsAction: 'merge', products: [{ name: 'Added', price: 1 }], faqsAction: 'skip', pagesAction: 'skip' });
    expect(await query('SELECT id FROM sari_response_cache WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
    expect(await getSessionWithFallback(owner.merchantId, fixture.conversationId)).toBeNull();
  });
});
