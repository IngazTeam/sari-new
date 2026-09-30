import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "../tests/helpers/disposable-merchant";
import {
  reviewKnowledgeRemoval,
  removeReviewedKnowledge,
  readKnowledgeRemovalReceipt,
  KnowledgeRemovalConflict,
  KnowledgeRemovalBlocked,
  KnowledgeRemovalForbidden,
} from "./source-removal";
import { appRouter } from "../routers";
import type { KnowledgeRemovalTarget } from "../../shared/knowledge-source-removal";

describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed knowledge removal (MySQL)",
  () => {
    const users: number[] = [];
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
    const query = async (sql: string, args: unknown[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const account = async () => {
      const a = await createDisposableMerchant("removal");
      users.push(a.userId);
      return a;
    };
    beforeEach(async () => {
      owner = await account();
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    const review = (target: KnowledgeRemovalTarget = { kind: "all" }) =>
      reviewKnowledgeRemoval(owner.merchantId, owner.userId, target);
    async function writeInput(
      target: KnowledgeRemovalTarget = { kind: "all" }
    ) {
      const current = await review(target);
      return {
        target,
        requestId: randomUUID(),
        expectedRevision: current.revision,
        confirmation: current.businessName,
        acknowledged: true as const,
      };
    }
    const remove = (input: unknown) =>
      removeReviewedKnowledge(owner.merchantId, owner.userId, input);
    const receipt = (requestId: string) =>
      readKnowledgeRemovalReceipt(owner.merchantId, owner.userId, {
        requestId,
      });
    const count = async (table: string, column = "merchant_id") =>
      Number(
        (
          await query(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`, [
            owner.merchantId,
          ])
        )[0].n
      );
    async function seed() {
      const id = owner.merchantId;
      const doc = await query(
        "INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extracted_text,extraction_status) VALUES (?,'Fixture.pdf','pdf',100,'Private text','completed')",
        [id]
      );
      const root = await query(
        "INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source) VALUES (?,'custom','Parent','Private content','document')",
        [id]
      );
      const child = await query(
        "INSERT INTO knowledge_sections (merchant_id,parent_id,section_type,title,content,source) VALUES (?,?,'custom','Child','Private content','manual')",
        [id, root.insertId]
      );
      await query(
        "INSERT INTO knowledge_changelog (merchant_id,section_id,action,old_content) VALUES (?,?,'add','Private history')",
        [id, child.insertId]
      );
      const product = await query(
        "INSERT INTO products (merchantId,name,price,price_unit) VALUES (?,'Fixture',1000,'minor')",
        [id]
      );
      await query(
        "INSERT INTO product_options (merchant_id,product_id,name,`values`) VALUES (?,?,?,?)",
        [id, product.insertId, "size", '["large"]']
      );
      const analysis = await query(
        "INSERT INTO website_analyses (merchant_id,url,status) VALUES (?,'https://example.test','completed')",
        [id]
      );
      await query(
        "INSERT INTO website_insights (merchant_id,analysis_id,category,type,title,description) VALUES (?,?,'ux','strength','Fixture','Private')",
        [id, analysis.insertId]
      );
      const page = await query(
        "INSERT INTO discovered_pages (merchant_id,page_type,url,content) VALUES (?,'faq','https://example.test/faq','Private page')",
        [id]
      );
      await query(
        "INSERT INTO extracted_faqs (merchant_id,page_id,question,answer) VALUES (?,?,'Question','Private answer')",
        [id, page.insertId]
      );
      const conversation = await query(
        "INSERT INTO conversations (merchantId,customerPhone,customerName) VALUES (?,'966500000001','Fixture')",
        [id]
      );
      await query(
        "INSERT INTO session_contexts (merchant_id,conversation_id,session_key,context_json,expires_at,version) VALUES (?,?,?,'{}',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),1)",
        [id, conversation.insertId, `${id}:${conversation.insertId}`]
      );
      await query(
        "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Question','Private cache')",
        [id]
      );
      return {
        docId: Number(doc.insertId),
        productId: Number(product.insertId),
        analysisId: Number(analysis.insertId),
        pageId: Number(page.insertId),
      };
    }
    it("reviews every source and relation without leaking content or changing any rows", async () => {
      await seed();
      const a = await review(),
        b = await review();
      expect(a).toEqual(b);
      expect(a.counts).toEqual({
        documents: 1,
        products: 1,
        analyses: 1,
        pages: 1,
        faqs: 1,
        sections: 2,
      });
      expect(a.related).toMatchObject({
        productOptions: 1,
        websiteInsights: 1,
        sectionHistory: 1,
        faqPageLinks: 0,
      });
      expect(a.blockers).toEqual([]);
      expect(JSON.stringify(a)).not.toContain("Private");
      expect(await count("sari_response_cache")).toBe(1);
      expect(await count("knowledge_removal_receipts")).toBe(0);
    });
    it("commits the full reset and durable receipt once while preserving conversations and another tenant", async () => {
      await seed();
      const other = await account();
      await query(
        "INSERT INTO extracted_faqs (merchant_id,question,answer) VALUES (?,'Other','Private')",
        [other.merchantId]
      );
      const input = await writeInput();
      const saved = await remove(input);
      expect(await receipt(input.requestId)).toEqual(saved);
      expect(await remove(input)).toEqual(saved);
      for (const table of [
        "merchant_knowledge_docs",
        "website_analyses",
        "discovered_pages",
        "extracted_faqs",
        "knowledge_sections",
        "knowledge_changelog",
        "sari_response_cache",
        "product_options",
      ])
        expect(await count(table)).toBe(0);
      expect(await count("products", "merchantId")).toBe(0);
      expect(await count("conversations", "merchantId")).toBe(1);
      expect(await count("knowledge_removal_receipts")).toBe(1);
      expect(await count("sari_activity_log")).toBe(1);
      expect(
        (
          await query(
            "SELECT version,context_json FROM session_contexts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0]
      ).toMatchObject({ version: 2, context_json: "null" });
      expect(
        (
          await query(
            "SELECT COUNT(*) n FROM extracted_faqs WHERE merchant_id=?",
            [other.merchantId]
          )
        )[0].n
      ).toBe(1);
    });
    it("serializes two concurrent identical requests into one receipt and one cache version bump", async () => {
      await seed();
      const input = await writeInput();
      const [a, b] = await Promise.all([remove(input), remove(input)]);
      expect(a).toEqual(b);
      expect(await count("sari_activity_log")).toBe(1);
      expect(
        (
          await query(
            "SELECT version FROM session_contexts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].version
      ).toBe(2);
    });
    it("rejects stale content even when IDs and group counts are unchanged", async () => {
      await seed();
      const input = await writeInput();
      await query(
        "UPDATE merchant_knowledge_docs SET extracted_text='Changed' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(remove(input)).rejects.toBeInstanceOf(
        KnowledgeRemovalConflict
      );
      expect(await count("products", "merchantId")).toBe(1);
      expect(await receipt(input.requestId)).toBeNull();
    });
    it("rejects stale dependencies and store names", async () => {
      await seed();
      let input = await writeInput();
      await query(
        "UPDATE product_options SET name='Changed' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(remove(input)).rejects.toBeInstanceOf(
        KnowledgeRemovalConflict
      );
      input = await writeInput();
      await query("UPDATE merchants SET businessName='Changed' WHERE id=?", [
        owner.merchantId,
      ]);
      await expect(remove(input)).rejects.toBeInstanceOf(
        KnowledgeRemovalConflict
      );
    });
    it("requires the reviewed store name, explicit acknowledgement and strict input", async () => {
      await seed();
      const input = await writeInput();
      await expect(
        remove({ ...input, confirmation: "Wrong" })
      ).rejects.toBeInstanceOf(KnowledgeRemovalBlocked);
      await expect(remove({ ...input, acknowledged: false })).rejects.toThrow();
      await expect(remove({ ...input, merchantId: 99 })).rejects.toThrow();
      expect(await count("merchant_knowledge_docs")).toBe(1);
    });
    it("removes the entire document group and descendants while preserving independent sources", async () => {
      const data = await seed();
      await query(
        "INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size) VALUES (?,'Second.txt','text',3)",
        [owner.merchantId]
      );
      const target = { kind: "document" as const, sourceId: data.docId };
      const input = await writeInput(target);
      const saved = await remove(input);
      expect(saved.counts.documents).toBe(2);
      expect(saved.counts.sections).toBe(2);
      expect(await count("merchant_knowledge_docs")).toBe(0);
      expect(await count("knowledge_sections")).toBe(0);
      expect(await count("products", "merchantId")).toBe(1);
      expect(await count("website_analyses")).toBe(1);
    });
    it("reviews website cascade results and FAQ unlinking separately", async () => {
      const data = await seed();
      const target = { kind: "website" as const, sourceId: data.analysisId };
      const current = await review(target);
      expect(current.related).toMatchObject({
        websiteInsights: 1,
        faqPageLinks: 1,
      });
      expect(current.counts.faqs).toBe(0);
      await remove(await writeInput(target));
      expect(await count("extracted_faqs")).toBe(1);
      expect(
        (
          await query(
            "SELECT page_id FROM extracted_faqs WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].page_id
      ).toBeNull();
    });
    it("blocks external catalogs even with the integration setting cleared", async () => {
      await seed();
      await query(
        "UPDATE products SET sallaProductId='external' WHERE merchantId=?",
        [owner.merchantId]
      );
      expect((await review()).blockers).toContain("external_catalog");
      await expect(remove(await writeInput())).rejects.toBeInstanceOf(
        KnowledgeRemovalBlocked
      );
      expect(await count("merchant_knowledge_docs")).toBe(1);
    });
    it("blocks processing intake even for FAQ removal", async () => {
      await seed();
      await query(
        "INSERT INTO knowledge_intake_receipts (merchant_id,request_id,input_hash,content_type,state) VALUES (?,?,?,'document','processing')",
        [owner.merchantId, randomUUID(), "a".repeat(64)]
      );
      expect((await review({ kind: "faqs" })).blockers).toContain(
        "running_intake"
      );
      await expect(
        remove(await writeInput({ kind: "faqs" }))
      ).rejects.toBeInstanceOf(KnowledgeRemovalBlocked);
    });
    it("blocks malformed foreign catalog and website relationships before cascade effects", async () => {
      const data = await seed(),
        other = await account();
      await query(
        "INSERT INTO product_options (merchant_id,product_id,name,`values`) VALUES (?,?,?,?)",
        [other.merchantId, data.productId, "bad", "[]"]
      );
      await query(
        "INSERT INTO extracted_faqs (merchant_id,page_id,question,answer) VALUES (?,?,'bad','Private')",
        [other.merchantId, data.pageId]
      );
      expect((await review()).blockers).toContain("foreign_relationship");
      await expect(remove(await writeInput())).rejects.toBeInstanceOf(
        KnowledgeRemovalBlocked
      );
      expect(await count("products", "merchantId")).toBe(1);
    });
    it("never accepts another actor or tenant receipt and binds request IDs to input", async () => {
      await seed();
      const input = await writeInput();
      await remove(input);
      await expect(
        remove({ ...input, target: { kind: "faqs" } })
      ).rejects.toBeInstanceOf(KnowledgeRemovalConflict);
      const other = await account();
      expect(
        await readKnowledgeRemovalReceipt(other.merchantId, other.userId, {
          requestId: input.requestId,
        })
      ).toBeNull();
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readKnowledgeRemovalReceipt(owner.merchantId, other.userId, {
          requestId: input.requestId,
        })
      ).rejects.toBeInstanceOf(KnowledgeRemovalConflict);
    });
    it.each(["viewer", "sales_supervisor"])(
      "denies %s at the store and API boundary",
      async role => {
        const other = await account();
        await query(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        await expect(
          reviewKnowledgeRemoval(owner.merchantId, other.userId, {
            kind: "all",
          })
        ).rejects.toBeInstanceOf(KnowledgeRemovalForbidden);
        const caller = appRouter.createCaller({
          user: { id: other.userId, role: "user" },
          req: { headers: { "x-merchant-id": String(owner.merchantId) } },
          res: {},
        } as any);
        await expect(
          caller.sariBrain.reviewSourceRemoval({ kind: "all" })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    );
    it("rechecks revoked membership before execution", async () => {
      await seed();
      const input = await writeInput();
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(remove(input)).rejects.toBeInstanceOf(
        KnowledgeRemovalForbidden
      );
      expect(await count("products", "merchantId")).toBe(1);
    });
    it("rolls back sources, cascades, activity and caches if receipt persistence fails", async () => {
      await seed();
      const input = await writeInput();
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get(),
          execute = c.execute.bind(c);
        vi.spyOn(c, "execute").mockImplementation((...args: any[]) => {
          if (
            String(args[0]).startsWith("INSERT INTO knowledge_removal_receipts")
          )
            throw Error("Synthetic receipt write failure");
          return (execute as any)(...args);
        });
        return c;
      });
      await expect(remove(input)).rejects.toThrow("Synthetic");
      vi.restoreAllMocks();
      expect(await count("merchant_knowledge_docs")).toBe(1);
      expect(await count("product_options")).toBe(1);
      expect(await count("sari_response_cache")).toBe(1);
      expect(await count("sari_activity_log")).toBe(0);
      expect(await receipt(input.requestId)).toBeNull();
      expect(
        (
          await query(
            "SELECT version FROM session_contexts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].version
      ).toBe(1);
    });
    it("recovers a committed result after its response is lost without repeating the delete", async () => {
      await seed();
      const input = await writeInput();
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get(),
          commit = c.commit.bind(c);
        vi.spyOn(c, "commit").mockImplementation(async () => {
          await commit();
          throw Error("Synthetic lost acknowledgement");
        });
        return c;
      });
      await expect(remove(input)).rejects.toThrow("Synthetic lost");
      vi.restoreAllMocks();
      const saved = await receipt(input.requestId);
      expect(saved?.requestId).toBe(input.requestId);
      expect(await count("products", "merchantId")).toBe(0);
      expect(await remove(input)).toEqual(saved);
      expect(await count("sari_activity_log")).toBe(1);
    });
  }
);
