import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPool } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  createSection,
  getSectionById,
  getPendingReviewSections,
  getChangelog,
  getUnresolvedConflicts,
  logChange,
} from "../db/knowledge";
describe.skipIf(!process.env.DATABASE_URL)(
  "knowledge read availability and scope on local MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const seed = (merchantId: number, review: boolean) =>
      createSection({
        merchantId,
        sectionType: "custom",
        title: "Local evidence",
        content: "Local source",
        source: "document",
        status: review ? "pending_review" : "approved",
        useInBot: !review,
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("read480");
      other = await createDisposableMerchant("read480-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("returns confirmed empty knowledge without manufacturing records", async () => {
      expect(await getPendingReviewSections(owner.merchantId)).toEqual([]);
      expect(await getChangelog(owner.merchantId)).toEqual([]);
      expect(await getUnresolvedConflicts(owner.merchantId)).toEqual([]);
      expect(await getSectionById(2147483647, owner.merchantId)).toBeNull();
    });
    it("isolates the pending list and single-section read from another tenant", async () => {
      const id = await seed(owner.merchantId, true);
      await seed(owner.merchantId, false);
      await seed(other.merchantId, true);
      expect(
        (await getPendingReviewSections(owner.merchantId)).map(row => row.id)
      ).toEqual([id]);
      expect(await getSectionById(id, owner.merchantId)).toMatchObject({
        id,
        content: "Local source",
      });
      expect(await getSectionById(id, other.merchantId)).toBeNull();
    });
    it("returns only owned unresolved conflicts and keeps the full changelog separate", async () => {
      const sectionId = await seed(owner.merchantId, true);
      const pending = await logChange({
        merchantId: owner.merchantId,
        sectionId,
        action: "conflict",
        newContent: "New proposal",
      });
      const resolved = await logChange({
        merchantId: owner.merchantId,
        sectionId,
        action: "conflict",
      });
      await (await getPool())!.execute(
        "UPDATE knowledge_changelog SET resolved=1 WHERE id=?",
        [resolved]
      );
      await logChange({
        merchantId: owner.merchantId,
        sectionId,
        action: "add",
      });
      await logChange({ merchantId: other.merchantId, action: "conflict" });
      expect(
        (await getUnresolvedConflicts(owner.merchantId)).map(row => row.id)
      ).toEqual([pending]);
      expect(await getChangelog(owner.merchantId)).toHaveLength(3);
      expect(await getChangelog(owner.merchantId, 1)).toHaveLength(1);
    });
  }
);
