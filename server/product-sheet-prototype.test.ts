import { describe, it, expect } from "vitest";
import {
  ImportSheetStore,
  sheetModes,
} from "../prototypes/tenant-dashboard/src/import-sheet-model";
import { importPreviewScope } from "../prototypes/tenant-dashboard/src/import-model";
import {
  checkedSheetConnection,
  checkedSheetList,
} from "../client/src/lib/product-sheet-workspace";
const reviewId = "11111111-1111-4111-8111-111111111101";
const requestId = "22222222-2222-4222-8222-222222222101";
function input(
  s: ImportSheetStore,
  mode: "sku" | "name" | "create_only" = "sku"
) {
  const expectedSourceDigest = s.connection().source!.digest;
  const sheet = s.list({ expectedSourceDigest }).sheets[0];
  return {
    reviewId,
    mode,
    selection: {
      expectedSourceDigest,
      sheet,
      options: { sheetId: sheet.id, currency: "SAR" },
    },
  };
}
const write = (digest: string) => ({
  reviewId,
  requestId,
  expectedDigest: digest,
  reviewed: true,
});
describe("local Sheets prototype", () => {
  it.each(Object.keys(sheetModes) as (keyof typeof sheetModes)[])(
    "models %s without writing products",
    async mode => {
      const s = new ImportSheetStore();
      const prepare = input(s);
      s.setMode(mode);
      if (["session", "forbidden"].includes(mode))
        expect(() => s.connection()).toThrow();
      else if (mode === "wrongTenant")
        expect(() =>
          checkedSheetConnection(s.connection(), importPreviewScope)
        ).toThrow();
      else if (mode === "wrongSource")
        expect(() =>
          checkedSheetList(
            s.list({
              expectedSourceDigest: prepare.selection.expectedSourceDigest,
            }),
            importPreviewScope,
            prepare.selection.expectedSourceDigest
          )
        ).toThrow();
      else if (
        [
          "unlinked",
          "oauth",
          "source",
          "sourceChanged",
          "emptyRows",
          "prepareLost",
          "missing",
        ].includes(mode)
      ) {
        await expect(s.prepare(prepare)).rejects.toThrow();
        if (mode === "prepareLost") {
          await s.refresh();
          expect(s.read({ reviewId }).counts.create).toBe(23);
        }
      } else if (mode === "emptySheets")
        expect(
          s.list({
            expectedSourceDigest: prepare.selection.expectedSourceDigest,
          }).sheets
        ).toEqual([]);
      else {
        const r = await s.prepare(mode === "limited" ? input(s) : prepare);
        expect(r.preview.total).toBe(25);
        expect(r.rows).toHaveLength(20);
        if (
          [
            "invalidRows",
            "ambiguous",
            "external",
            "legacy",
            "currency",
          ].includes(mode)
        ) {
          expect(r.counts.blocked).toBeGreaterThan(0);
          expect(r.canCommit).toBe(false);
        }
        if (mode === "limited")
          expect(r.snapshot).toMatchObject({
            limitedRange: true,
            coveredRows: 5001,
            coveredColumns: 60,
          });
        if (mode === "expired") expect(r.canCommit).toBe(false);
      }
      expect([s.createdCount, s.updatedCount]).toEqual([0, 0]);
    }
  );
  it("matches only mapped fields, preserves unknown stock and distinguishes zero, with full paging", async () => {
    const s = new ImportSheetStore(),
      r = await s.prepare(input(s));
    expect(r.counts).toEqual({
      create: 23,
      update: 1,
      unchanged: 1,
      blocked: 0,
    });
    expect(r.rows[0].change.changes).toEqual(["price"]);
    expect(r.rows[0].change.after).toMatchObject({
      stock: 7,
      costPrice: "5.00",
      description: "وصف محفوظ لا تغيره الأعمدة الغائبة",
    });
    expect(r.rows[3].change.after).toMatchObject({ price: "0", stock: null });
    expect(s.read({ reviewId, page: 2 }).rows).toHaveLength(5);
    expect(
      s.read({ reviewId, filter: "unchanged" }).rows[0].change.productId
    ).toBe(902);
  });
  it("create-only blocks existing SKU instead of silently updating", async () => {
    const s = new ImportSheetStore(),
      r = await s.prepare(input(s, "create_only"));
    expect(r.counts).toEqual({
      create: 23,
      update: 0,
      unchanged: 0,
      blocked: 2,
    });
    await expect(s.commit(write(r.digest))).rejects.toThrow();
    expect(s.createdCount).toBe(0);
  });
  it("recovers a committed lost response exactly once and retains receipt after discard", async () => {
    const s = new ImportSheetStore(),
      r = await s.prepare(input(s));
    s.setMode("commitLost");
    await expect(s.commit(write(r.digest))).rejects.toThrow();
    expect(s.read({ reviewId }).receipt).toBeNull();
    const receipt = await s.receipt({ requestId });
    expect(receipt).toMatchObject({
      counts: { create: 23, update: 1, unchanged: 1 },
    });
    expect(await s.commit(write(r.digest))).toEqual(receipt);
    await s.discard({ reviewId, expectedDigest: r.digest });
    expect(await s.receipt({ requestId })).toEqual(receipt);
    expect([s.createdCount, s.updatedCount]).toEqual([23, 1]);
  });
  it("replays preparation without rereading, but conflicts on changed input or commit", async () => {
    const s = new ImportSheetStore(),
      p = input(s),
      r = await s.prepare(p);
    expect(await s.prepare(p)).toEqual(r);
    expect(s.reads).toBe(1);
    await expect(s.prepare({ ...p, mode: "name" })).rejects.toThrow();
    await expect(s.commit(write("a".repeat(64)))).rejects.toThrow();
    await s.commit(write(r.digest));
    await expect(
      s.commit({ ...write(r.digest), requestId: reviewId })
    ).rejects.toThrow();
    const next = await s.prepare({ ...p, reviewId: requestId });
    expect(next.counts).toEqual({
      create: 0,
      update: 0,
      unchanged: 25,
      blocked: 0,
    });
  });
  it.each([
    "expired",
    "sourceChanged",
    "conflict",
    "external",
    "ambiguous",
    "legacy",
    "currency",
    "notCommitted",
    "receiptError",
    "wrongReceipt",
    "session",
    "forbidden",
  ] as const)("prevents writes when %s appears after review", async mode => {
    const s = new ImportSheetStore(),
      r = await s.prepare(input(s));
    s.setMode(mode);
    await expect(s.commit(write(r.digest))).rejects.toThrow();
    expect([s.createdCount, s.updatedCount]).toEqual([0, 0]);
  });
  it("resets only local fixtures and receipts", async () => {
    const s = new ImportSheetStore(),
      r = await s.prepare(input(s));
    await s.commit(write(r.digest));
    s.reset();
    expect([s.createdCount, s.updatedCount, s.reads]).toEqual([0, 0, 0]);
    expect(await s.receipt({ requestId })).toBeNull();
    expect(() => s.read({ reviewId })).toThrow();
  });
});
