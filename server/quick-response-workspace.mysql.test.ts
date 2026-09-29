import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { abTestResults, quickResponses } from "../drizzle/schema";
import { closeDb, getDb } from "./db/connection";
import { findMatchingQuickResponse, incrementQuickResponseUse } from "./db";
import {
  readQuickResponseWorkspace,
  writeQuickResponse,
} from "./quick-response-workspace";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "quick response ownership and review in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const draft = {
      trigger: "مرحبا",
      response: "أهلًا! كيف أساعدك؟",
      keywords: "سعر، شحن",
      priority: 0,
      isActive: true,
    };
    const create = async () => {
      const view = await readQuickResponseWorkspace(owner.merchantId);
      await writeQuickResponse(owner.merchantId, {
        kind: "create",
        expectedRevision: view.revision,
        draft,
      });
      return (await readQuickResponseWorkspace(owner.merchantId)).rows.at(-1)!;
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("quick");
      other = await createDisposableMerchant("quick-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("allows only one concurrent create from a reviewed collection and scopes foreign revisions", async () => {
      const view = await readQuickResponseWorkspace(owner.merchantId),
        foreign = await readQuickResponseWorkspace(other.merchantId);
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "create",
          expectedRevision: foreign.revision,
          draft,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          writeQuickResponse(owner.merchantId, {
            kind: "create",
            expectedRevision: view.revision,
            draft,
          })
        )
      );
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect((await readQuickResponseWorkspace(owner.merchantId)).total).toBe(
        1
      );
      expect((await readQuickResponseWorkspace(other.merchantId)).total).toBe(
        0
      );
    });
    it("checks ownership for update/delete and rejects stale edits without losing the winner", async () => {
      const row = await create();
      for (const kind of ["delete", "update"] as const)
        await expect(
          writeQuickResponse(other.merchantId, {
            kind,
            id: row.id,
            expectedRevision: row.revision,
            patch: { response: "foreign" },
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await writeQuickResponse(owner.merchantId, {
        kind: "update",
        id: row.id,
        expectedRevision: row.revision,
        patch: { response: "saved elsewhere" },
      });
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "update",
          id: row.id,
          expectedRevision: row.revision,
          patch: { response: "stale" },
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "delete",
          id: row.id,
          expectedRevision: row.revision,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (await readQuickResponseWorkspace(owner.merchantId)).rows[0].response
      ).toBe("saved elsewhere");
    });
    it("preserves priority zero and usage counters, canonicalizes keywords and uses the real matcher", async () => {
      const row = await create();
      expect(row.priority).toBe(0);
      expect(row.keywords).toBe('["سعر","شحن"]');
      expect(
        (await findMatchingQuickResponse(owner.merchantId, "ما سعر المنتج"))?.id
      ).toBe(row.id);
      await incrementQuickResponseUse(row.id);
      await writeQuickResponse(owner.merchantId, {
        kind: "update",
        id: row.id,
        expectedRevision: row.revision,
        patch: { isActive: false },
      });
      expect(
        (await readQuickResponseWorkspace(owner.merchantId)).rows[0]
      ).toMatchObject({ priority: 0, useCount: 1, isActive: 0 });
      expect(
        await findMatchingQuickResponse(owner.merchantId, "مرحبا")
      ).toBeNull();
    });
    it("prevents empty legacy JSON from catching every message and blocks unsupported transactional claims", async () => {
      const db = (await getDb())!;
      await db
        .insert(quickResponses)
        .values({
          merchantId: owner.merchantId,
          trigger: "old",
          response: "تم تأكيد طلبك",
          keywords: '["", "   "]',
          isActive: 1,
        });
      expect(
        await findMatchingQuickResponse(owner.merchantId, "unrelated")
      ).toBeNull();
      let row = (await readQuickResponseWorkspace(owner.merchantId)).rows[0];
      await writeQuickResponse(owner.merchantId, {
        kind: "update",
        id: row.id,
        expectedRevision: row.revision,
        patch: { isActive: false },
      });
      row = (await readQuickResponseWorkspace(owner.merchantId)).rows[0];
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "update",
          id: row.id,
          expectedRevision: row.revision,
          patch: { isActive: true },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "create",
          expectedRevision: (await readQuickResponseWorkspace(owner.merchantId))
            .revision,
          draft: { ...draft, response: "تم تأكيد طلبك" },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("keeps experiment history and deletes only unreferenced rows from a current review", async () => {
      const row = await create(),
        db = (await getDb())!;
      await db
        .insert(abTestResults)
        .values({
          merchantId: owner.merchantId,
          testName: "preserve",
          keyword: "hello",
          variantAId: row.id,
          variantAText: row.response,
          variantBText: "other",
        });
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "delete",
          id: row.id,
          expectedRevision: row.revision,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(
        await db
          .select()
          .from(abTestResults)
          .where(eq(abTestResults.merchantId, owner.merchantId))
      ).toHaveLength(1);
      const free = await create();
      await expect(
        writeQuickResponse(owner.merchantId, {
          kind: "delete",
          id: free.id,
          expectedRevision: free.revision,
        })
      ).resolves.toMatchObject({ deleted: true });
      expect((await readQuickResponseWorkspace(owner.merchantId)).total).toBe(
        1
      );
    });
  }
);
