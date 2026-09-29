import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { readKnowledgeSourceInventory as read } from "./source-inventory";
describe.skipIf(!process.env.DATABASE_URL)(
  "source inventory on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (text: string, args: unknown[] = []) =>
      (await (await getPool())!.execute<any>(text, args))[0];
    beforeEach(async () => {
      owner = await createDisposableMerchant("source-inventory");
      other = await createDisposableMerchant("source-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner.userId, other.userId])
    );
    afterAll(closeDb);
    const doc = (
      status: string,
      text: string | null,
      merchantId = owner.merchantId
    ) =>
      q(
        "INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extraction_status,extracted_text) VALUES (?,'Synthetic.txt','text',20,?,?)",
        [merchantId, status, text]
      );
    it("returns real zeros for an empty tenant", async () => {
      const result = await read(owner.merchantId);
      for (const group of Object.values(result))
        expect(Object.values(group).every(v => v === 0)).toBe(true);
    });
    it("separates extraction states and counts completed blank text explicitly", async () => {
      for (const [status, text] of [
        ["completed", "نص عربي"],
        ["completed", " \n\t "],
        ["completed", null],
        ["pending", null],
        ["processing", "partial"],
        ["failed", "old text"],
      ])
        await doc(status!, text);
      await doc("completed", "other tenant secret", other.merchantId);
      expect((await read(owner.merchantId)).documents).toEqual({
        total: 6,
        textReady: 1,
        empty: 2,
        pending: 1,
        processing: 1,
        failed: 1,
      });
    });
    it("counts visible catalog records and the active switch without claiming stock availability", async () => {
      await q(
        "INSERT INTO products (merchantId,name,price,isActive,stock,sallaProductId) VALUES (?,'Unavailable stock',0,1,0,NULL),(?,'Paused',10,0,10,NULL),(?,'Disconnected integration',10,1,10,'zid:999:P'),(?,'Other store',10,1,10,NULL)",
        [owner.merchantId, owner.merchantId, owner.merchantId, other.merchantId]
      );
      expect((await read(owner.merchantId)).products).toEqual({
        total: 2,
        active: 1,
      });
    });
    it("excludes archived sources and disabled flags from FAQ enabled count", async () => {
      for (const [source, active, use] of [
        ["active", 1, 1],
        ["active", 0, 1],
        ["active", 1, 0],
        ["archived", 1, 1],
      ])
        await q(
          "INSERT INTO extracted_faqs (merchant_id,question,answer,source_status,is_active,use_in_bot) VALUES (?,'Q','A',?,?,?)",
          [owner.merchantId, source, active, use]
        );
      await q(
        "INSERT INTO extracted_faqs (merchant_id,question,answer) VALUES (?,'Other','Secret')",
        [other.merchantId]
      );
      expect((await read(owner.merchantId)).faqs).toEqual({
        total: 4,
        enabled: 1,
        archived: 1,
      });
    });
    it("keeps page content and reply settings separate even for enabled blank pages", async () => {
      for (const [active, use, content] of [
        [1, 1, null],
        [1, 0, "نص محفوظ"],
        [0, 1, " \t\n"],
      ])
        await q(
          "INSERT INTO discovered_pages (merchant_id,page_type,url,content,is_active,use_in_bot) VALUES (?,'other','https://example.test/',?,?,?)",
          [owner.merchantId, content, active, use]
        );
      await q(
        "INSERT INTO discovered_pages (merchant_id,page_type,url,content) VALUES (?,'other','https://other.example.test/','secret')",
        [other.merchantId]
      );
      expect((await read(owner.merchantId)).pages).toEqual({
        total: 3,
        enabled: 1,
        withText: 1,
      });
    });
    it("returns aggregate numbers only, without source text, URLs or credentials", async () => {
      await doc("completed", "source-secret");
      const result = await read(owner.merchantId);
      expect(Object.keys(result).sort()).toEqual([
        "documents",
        "faqs",
        "pages",
        "products",
      ]);
      for (const group of Object.values(result))
        for (const count of Object.values(group))
          expect(typeof count).toBe("number");
      expect(JSON.stringify(result)).not.toContain("source-secret");
    });
    it.each([0, -1, 1.5, NaN])(
      "rejects invalid merchant id %s before querying",
      async id => {
        await expect(read(id)).rejects.toThrow("Invalid merchant");
      }
    );
  }
);
