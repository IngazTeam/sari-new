import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPool } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readKeywordRecord,
  readKeywordRecords,
  writeKeywordRecord,
} from "./keyword-review";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed keyword writes in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      id: number;
    beforeEach(async () => {
      owner = await createDisposableMerchant("keyword-review");
      other = await createDisposableMerchant("keyword-other");
      const [r] = await (await getPool())!.execute<any>(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,status,suggested_response) VALUES (?,'shipping','shipping',3,'new','Saved suggestion')",
        [owner.merchantId]
      );
      id = r.insertId;
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    const read = () => readKeywordRecord(owner.merchantId, id);
    it("returns bounded stable selected-tenant pages and only saved nonempty suggestions", async () => {
      for (let i = 0; i < 22; i++)
        await (await getPool())!.execute(
          "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,suggested_response) VALUES (?,?,'question',3,?)",
          [owner.merchantId, `test-${i}`, i % 2 ? " " : "Another suggestion"]
        );
      await (await getPool())!.execute(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency) VALUES (?,'foreign','question',90)",
        [other.merchantId]
      );
      const first = await readKeywordRecords(owner.merchantId, {
          page: 1,
          limit: 20,
          minFrequency: 0,
        }),
        second = await readKeywordRecords(owner.merchantId, {
          page: 2,
          limit: 20,
        });
      expect(first).toHaveLength(20);
      expect(second).toHaveLength(3);
      expect(new Set([...first, ...second].map(r => r.id)).size).toBe(23);
      expect(first[0].id).toBe(id);
      expect(
        first.every(
          r =>
            r.merchantId === owner.merchantId &&
            r.revision.length === 64 &&
            r.createdAt?.endsWith("Z")
        )
      ).toBe(true);
      expect(
        await readKeywordRecords(
          owner.merchantId,
          { page: 1, limit: 100 },
          true
        )
      ).toHaveLength(12);
    });
    it("cannot read, change or delete a record in another tenant even with its correct revision", async () => {
      const row = await read();
      await expect(
        readKeywordRecord(other.merchantId, id)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      for (const kind of ["status", "delete"] as const)
        await expect(
          writeKeywordRecord(other.merchantId, {
            kind,
            keywordId: id,
            expectedRevision: row.revision,
            status: "reviewed",
            reviewed: true,
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await read()).status).toBe("new");
    });
    it("sets review status and clears the review date on reopening without creating a quick response", async () => {
      const before = await read();
      await writeKeywordRecord(owner.merchantId, {
        kind: "status",
        keywordId: id,
        expectedRevision: before.revision,
        status: "response_created",
      });
      const reviewed = await read();
      expect(reviewed.reviewedAt).toMatch(/Z$/);
      expect(reviewed.revision).not.toBe(before.revision);
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT id FROM quick_responses WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(rows).toHaveLength(0);
      await writeKeywordRecord(owner.merchantId, {
        kind: "status",
        keywordId: id,
        expectedRevision: reviewed.revision,
        status: "new",
      });
      expect((await read()).reviewedAt).toBeNull();
    });
    it("rejects an old review after new observations or a changed suggested text", async () => {
      const before = await read();
      await (await getPool())!.execute(
        "UPDATE keyword_analysis SET frequency=frequency+1,suggested_response=? WHERE id=?",
        ["Changed source", id]
      );
      for (const kind of ["status", "delete"] as const)
        await expect(
          writeKeywordRecord(owner.merchantId, {
            kind,
            keywordId: id,
            expectedRevision: before.revision,
            status: "reviewed",
            reviewed: true,
          })
        ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await read()).frequency).toBe(4);
    });
    it("serializes two reviewers so one succeeds and the other must review again", async () => {
      const before = await read();
      const results = await Promise.allSettled(
        ["reviewed", "ignored"].map(status =>
          writeKeywordRecord(owner.merchantId, {
            kind: "status",
            keywordId: id,
            expectedRevision: before.revision,
            status: status as "reviewed" | "ignored",
          })
        )
      );
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
      expect(
        (results.find(r => r.status === "rejected") as PromiseRejectedResult)
          .reason.code
      ).toBe("CONFLICT");
    });
    it("deletes only the reviewed record and does not falsely succeed on repeated deletion", async () => {
      const before = await read();
      const change = {
        kind: "delete" as const,
        keywordId: id,
        expectedRevision: before.revision,
        reviewed: true as const,
      };
      expect(await writeKeywordRecord(owner.merchantId, change)).toEqual({
        success: true,
        deleted: true,
      });
      await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        writeKeywordRecord(owner.merchantId, change)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  }
);
