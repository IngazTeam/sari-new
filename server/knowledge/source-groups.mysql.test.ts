import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDisposableMerchant, cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import { getPool, closeDb } from "../db/connection";
import { readKnowledgeSourceGroups } from "./source-groups";
describe.skipIf(!process.env.DATABASE_URL)("stored knowledge groups (MySQL)", () => {
  const users: number[] = [];
  let merchantId: number;
  const query = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const account = async () => { const a = await createDisposableMerchant("source-groups"); users.push(a.userId); return a.merchantId; };
  beforeEach(async () => { merchantId = await account(); });
  afterEach(async () => { await cleanupDisposableMerchants(users); users.length = 0; });
  afterAll(closeDb);
  it("distinguishes a truly empty group from settings and does not invent current source dates", async () => {
    const result = await readKnowledgeSourceGroups(merchantId);
    expect(result.merchantId).toBe(merchantId);
    expect(result.documents).toEqual({ total: 0, textReady: 0, empty: 0, pending: 0, processing: 0, failed: 0, latestUploadedAt: null, removalAnchorId: null });
    expect(result.products).toEqual({ total: 0, visible: 0, activeVisible: 0, latestModifiedAt: null });
    expect(result.website).toMatchObject({ analyses: 0, pages: 0, removalAnchorId: null, latestAnalysisAt: null, latestPageUpdateAt: null });
    expect(result.settings.createdAt).toMatch(/^20/);
    expect(result.faqs.latestModifiedAt).toBeNull();
    expect(result.sections.latestModifiedAt).toBeNull();
    await expect(readKnowledgeSourceGroups(2147483647)).rejects.toThrow();
  });
  it("counts all document states including whitespace-only completed records and preserves real upload dates", async () => {
    for (const [state, text] of [['completed','PRIVATE_CONTENT'],['completed',' \n\t'],['pending',''],['processing','partial text'],['failed','failed text']]) {
      await query("INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extraction_status,extracted_text,uploaded_at) VALUES (?,'PRIVATE_NAME.pdf','pdf',10,?,?,'2024-01-02 03:04:05')", [merchantId,state,text]);
    }
    const result = await readKnowledgeSourceGroups(merchantId);
    expect(result.documents).toMatchObject({ total: 5, textReady: 1, empty: 1, pending: 1, processing: 1, failed: 1, latestUploadedAt: '2024-01-02T03:04:05.000Z' });
    expect(result.documents.removalAnchorId).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(await readKnowledgeSourceGroups(merchantId)).toEqual(result);
  });
  it("reports hidden integration products separately from visible and active records without dating them today", async () => {
    for (const [external,active] of [[null,1],[null,0],['salla:999:321',1],['zid:999:321',1]] as const)
      await query("INSERT INTO products (merchantId,name,price,sallaProductId,isActive,updatedAt) VALUES (?,'Private catalog',100,?,?,'2024-02-03 04:05:06')", [merchantId,external,active]);
    expect((await readKnowledgeSourceGroups(merchantId)).products).toEqual({ total: 4, visible: 2, activeVisible: 1, latestModifiedAt: '2024-02-03T04:05:06.000Z' });
  });
  it("includes every analysis and page with independent timestamps, including pages without an analysis", async () => {
    await query("INSERT INTO discovered_pages (merchant_id,page_type,url,content,is_active,use_in_bot,updated_at) VALUES (?,'faq','https://private.example.test','Private page',1,1,'2024-03-02 04:05:06'),(?,'about','https://private.example.test/about','',1,0,'2024-04-02 04:05:06')", [merchantId,merchantId]);
    const before = await readKnowledgeSourceGroups(merchantId);
    expect(before.website).toEqual({ analyses: 0, pages: 2, enabledPages: 1, pagesWithText: 1, latestAnalysisAt: null, latestPageUpdateAt: '2024-04-02T04:05:06.000Z', removalAnchorId: null });
    for (let i=0;i<3;i++) await query("INSERT INTO website_analyses (merchant_id,url,status,analyzed_at) VALUES (?,'https://private.example.test','completed','2024-05-02 04:05:06')", [merchantId]);
    const result = await readKnowledgeSourceGroups(merchantId);
    expect(result.website).toMatchObject({ analyses: 3, pages: 2, latestAnalysisAt: '2024-05-02T04:05:06.000Z' });
    expect(JSON.stringify(result)).not.toContain('private.example.test');
  });
  it("includes archived FAQs and manual sections while isolating all counts and dates from another tenant", async () => {
    await query("INSERT INTO extracted_faqs (merchant_id,question,answer,source_status,use_in_bot,updated_at) VALUES (?,'Private Q','Private A','active',1,'2024-06-02 04:05:06'),(?,'Private Q','Private A','archived',1,'2024-06-02 04:05:06')", [merchantId,merchantId]);
    await query("INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source,use_in_bot,updated_at) VALUES (?,'custom','Manual','Private text','manual',1,'2024-07-02 04:05:06'),(?,'policies','Paused','Private text','document',0,'2024-07-02 04:05:06')", [merchantId,merchantId]);
    const before = await readKnowledgeSourceGroups(merchantId), other = await account();
    await query("INSERT INTO products (merchantId,name,price,updatedAt) VALUES (?,'Foreign',100,'2028-01-01 00:00:00')", [other]);
    await query("INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source,updated_at) VALUES (?,'custom','Foreign','Private text','manual','2028-01-01 00:00:00')", [other]);
    expect(await readKnowledgeSourceGroups(merchantId)).toEqual(before);
    expect(before.faqs).toEqual({ total: 2, enabled: 1, archived: 1, latestModifiedAt: '2024-06-02T04:05:06.000Z' });
    expect(before.sections).toEqual({ total: 2, switchedOn: 1, latestModifiedAt: '2024-07-02T04:05:06.000Z' });
  });
});
