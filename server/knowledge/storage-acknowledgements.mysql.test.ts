import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  getSectionsByMerchantId,
  createSection,
  updateSection,
  logChange,
} from "../db/knowledge";
describe.skipIf(!process.env.DATABASE_URL)(
  "knowledge storage acknowledgements on local MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const add = () =>
      createSection({
        merchantId: owner.merchantId,
        sectionType: "identity",
        title: "Storage proof",
        content: "Original source text",
        summary: "Source summary",
        source: "document",
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("knowledge-ack478");
      other = await createDisposableMerchant("knowledge-ack478-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("returns the actual inserted identity and tenant-scoped empty list", async () => {
      expect(await getSectionsByMerchantId(other.merchantId)).toEqual([]);
      const id = await add();
      const rows = await getSectionsByMerchantId(owner.merchantId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id, content: "Original source text" });
      expect(await getSectionsByMerchantId(other.merchantId)).toEqual([]);
    });
    it("confirms an existing update including an identical value", async () => {
      const id = await add();
      await updateSection(id, owner.merchantId, { content: "Updated source" });
      await updateSection(id, owner.merchantId, { content: "Updated source" });
      expect(
        (await q("SELECT content FROM knowledge_sections WHERE id=?", [id]))[0]
          .content
      ).toBe("Updated source");
    });
    it("rejects a foreign record instead of reporting a successful update", async () => {
      const id = await add();
      await expect(
        updateSection(id, other.merchantId, { content: "Foreign overwrite" })
      ).rejects.toMatchObject({ reason: "missing" });
      expect(
        (await q("SELECT content FROM knowledge_sections WHERE id=?", [id]))[0]
          .content
      ).toBe("Original source text");
    });
    it("rejects an update after the section has been deleted", async () => {
      const id = await add();
      await q("DELETE FROM knowledge_sections WHERE id=? AND merchant_id=?", [
        id,
        owner.merchantId,
      ]);
      await expect(
        updateSection(id, owner.merchantId, { content: "Resurrected" })
      ).rejects.toMatchObject({ reason: "missing" });
      expect(await getSectionsByMerchantId(owner.merchantId)).toEqual([]);
    });
    it("returns an actual changelog identity with its exact owner and section", async () => {
      const id = await add(),
        log = await logChange({
          merchantId: owner.merchantId,
          sectionId: id,
          action: "add",
          newContent: "Original source text",
          source: "document",
        });
      expect(
        (
          await q(
            "SELECT merchant_id,section_id,action,new_content FROM knowledge_changelog WHERE id=?",
            [log]
          )
        )[0]
      ).toMatchObject({
        merchant_id: owner.merchantId,
        section_id: id,
        action: "add",
        new_content: "Original source text",
      });
    });
    it("still invalidates the embedding when source text changes", async () => {
      const id = await add();
      await q(
        "UPDATE knowledge_sections SET embedding=?,embedding_content_hash=? WHERE id=?",
        [Buffer.from("old embedding"), "a".repeat(64), id]
      );
      await updateSection(id, owner.merchantId, { summary: "Changed summary" });
      expect(
        (
          await q(
            "SELECT embedding,embedding_content_hash FROM knowledge_sections WHERE id=?",
            [id]
          )
        )[0]
      ).toMatchObject({ embedding: null, embedding_content_hash: null });
    });
  }
);
