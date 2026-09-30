import { describe, it, expect } from "vitest";
import {
  InventorySheetStore,
  inventoryModes,
  inventoryPreviewScope,
} from "../prototypes/tenant-dashboard/src/inventory-sheet-model";
import {
  checkedSheetConnection,
  checkedSheetList,
} from "../client/src/lib/inventory-sheet-workspace";
const reviewId = "11111111-1111-4111-8111-111111111107",
  requestId = "22222222-2222-4222-8222-222222222107";
const input = (s: InventorySheetStore) => {
  const expectedSourceDigest = s.connection().source!.digest;
  return {
    reviewId,
    selection: {
      expectedSourceDigest,
      sheet: s.list({ expectedSourceDigest }).sheets[0],
      options: {},
    },
  };
};
const write = (digest: string) => ({
  reviewId,
  requestId,
  expectedDigest: digest,
  reviewed: true,
});
describe("local inventory prototype", () => {
  it.each(Object.keys(inventoryModes) as (keyof typeof inventoryModes)[])(
    "models %s without changing quantities",
    async mode => {
      const s = new InventorySheetStore(),
        p = input(s);
      s.setMode(mode);
      if (["session", "forbidden"].includes(mode))
        expect(() => s.connection()).toThrow();
      else if (mode === "wrongTenant")
        expect(() =>
          checkedSheetConnection(s.connection(), inventoryPreviewScope)
        ).toThrow();
      else if (mode === "wrongSource")
        expect(() =>
          checkedSheetList(
            s.list({ expectedSourceDigest: p.selection.expectedSourceDigest }),
            inventoryPreviewScope,
            p.selection.expectedSourceDigest
          )
        ).toThrow();
      else if (
        [
          "source",
          "unlinked",
          "oauth",
          "sourceChanged",
          "emptyRows",
          "prepareLost",
          "missing",
        ].includes(mode)
      ) {
        await expect(s.prepare(p)).rejects.toThrow();
        if (mode === "prepareLost") {
          await s.refresh();
          expect(s.read({ reviewId }).counts.update).toBe(24);
        }
      } else if (mode === "emptySheets")
        expect(
          s.list({ expectedSourceDigest: p.selection.expectedSourceDigest })
            .sheets
        ).toEqual([]);
      else {
        const r = await s.prepare(mode === "limited" ? input(s) : p);
        expect(r.filteredTotal).toBe(25);
        expect(r.rows).toHaveLength(20);
        if (
          [
            "invalidRows",
            "ambiguous",
            "duplicate",
            "unknown",
            "formula",
            "boolean",
            "external",
            "invalidCurrent",
          ].includes(mode)
        ) {
          expect(r.counts.blocked).toBeGreaterThan(0);
          expect(r.canCommit).toBe(false);
          await expect(s.commit(write(r.digest))).rejects.toThrow();
        }
        if (mode === "limited")
          expect(r.preview.snapshot).toMatchObject({
            limitedRange: true,
            coveredRows: 5001,
            coveredColumns: 60,
          });
        if (mode === "expired") expect(r.canCommit).toBe(false);
      }
      expect(s.updatedCount).toBe(0);
    }
  );
  it("preserves zero and unknown quantities, paginates and updates only once", async () => {
    const s = new InventorySheetStore();
    s.setMode("nullStock");
    const r = await s.prepare(input(s));
    expect(r.counts).toEqual({ update: 24, unchanged: 1, blocked: 0 });
    expect(r.rows[0].change).toMatchObject({
      productId: 901,
      before: null,
      after: 20,
    });
    expect(r.rows[3].change.after).toBe(0);
    expect(s.read({ reviewId, page: 2 }).rows).toHaveLength(5);
    expect(
      s.read({ reviewId, filter: "unchanged" }).rows[0].change.productId
    ).toBe(902);
    const receipt = await s.commit(write(r.digest));
    expect(receipt.rows[0].before).toBeNull();
    expect(await s.commit(write(r.digest))).toEqual(receipt);
    expect(s.updatedCount).toBe(24);
    const next = await s.prepare({ ...input(s), reviewId: requestId });
    expect(next.counts).toEqual({ update: 0, unchanged: 25, blocked: 0 });
  });
  it("resolves ambiguous headers with an explicit mapping", async () => {
    const s = new InventorySheetStore();
    s.setMode("ambiguous");
    const p = input(s),
      r = await s.prepare(p);
    expect(r.counts.blocked).toBe(25);
    await s.discard({ reviewId, expectedDigest: r.digest });
    const next = await s.prepare({
      ...p,
      reviewId: requestId,
      selection: {
        ...p.selection,
        options: { mapping: { productId: 0, stock: 1 } },
      },
    });
    expect(next.counts.blocked).toBe(0);
    expect(next.rows[0].change.after).toBe(20);
  });
  it("replays preparation and rejects changed input with the same reference", async () => {
    const s = new InventorySheetStore(),
      p = input(s),
      r = await s.prepare(p);
    expect(await s.prepare(p)).toEqual(r);
    expect(s.reads).toBe(1);
    await expect(
      s.prepare({
        ...p,
        selection: {
          ...p.selection,
          options: { mapping: { productId: 0, stock: 1 } },
        },
      })
    ).rejects.toThrow();
  });
  it("recovers a lost commit reply and retains receipt after discard", async () => {
    const s = new InventorySheetStore(),
      r = await s.prepare(input(s));
    s.setMode("commitLost");
    await expect(s.commit(write(r.digest))).rejects.toThrow();
    expect(s.read({ reviewId }).receipt).toBeNull();
    const saved = await s.receipt({ requestId });
    expect(saved).toMatchObject({ counts: { update: 24, unchanged: 1 } });
    await s.discard({ reviewId, expectedDigest: r.digest });
    expect(await s.commit(write(r.digest))).toEqual(saved);
    expect(s.updatedCount).toBe(24);
  });
  it.each([
    "source",
    "unlinked",
    "oauth",
    "expired",
    "sourceChanged",
    "conflict",
    "external",
    "invalidCurrent",
    "nullStock",
    "notCommitted",
    "receiptError",
    "wrongReceipt",
    "session",
    "forbidden",
  ] as const)("blocks %s arriving after review", async mode => {
    const s = new InventorySheetStore(),
      r = await s.prepare(input(s));
    s.setMode(mode);
    await expect(s.commit(write(r.digest))).rejects.toThrow();
    expect(s.updatedCount).toBe(0);
    if (["unlinked", "oauth"].includes(mode))
      expect(s.read({ reviewId }).canCommit).toBe(false);
  });
  it("keeps frozen source rows even if Google-like fixture mode changes", async () => {
    const s = new InventorySheetStore(),
      r = await s.prepare(input(s));
    s.setMode("formula");
    expect(s.read({ reviewId }).rows).toEqual(r.rows);
    expect((await s.commit(write(r.digest))).counts.update).toBe(24);
  });
  it("resets only local quantities and receipts", async () => {
    const s = new InventorySheetStore(),
      r = await s.prepare(input(s));
    await s.commit(write(r.digest));
    s.reset();
    expect(s.updatedCount).toBe(0);
    expect(s.reads).toBe(0);
    expect(await s.receipt({ requestId })).toBeNull();
    expect(() => s.read({ reviewId })).toThrow();
  });
});
