import { describe, it, expect } from "vitest";
import { categoryModes, ProductCategoryPreviewStore } from "../prototypes/tenant-dashboard/src/product-category-model";
import { categorySnapshot, categoryReceipt } from "../shared/product-categories";
const requestId = "11111111-1111-4111-8111-111111111111";
const create = (s: ProductCategoryPreviewStore) => ({
  kind: "create", requestId, reviewed: true, expectedDigest: s.read().digest,
  fields: { name: "فئة جديدة", nameEn: null, parentId: null, sortOrder: 0, isActive: 1 },
});
describe("local category preview contracts", () => {
  it.each(Object.keys(categoryModes) as (keyof typeof categoryModes)[])("models %s", mode => {
    const s = new ProductCategoryPreviewStore(); s.setMode(mode);
    if (["forbidden", "session", "error"].includes(mode)) expect(s.read).toThrow();
    else expect(categorySnapshot.safeParse(s.read()).success).toBe(true);
  });
  it("creates, patches and deletes using the shared planner and receipts", async () => {
    const s = new ProductCategoryPreviewStore(), input = create(s), receipt = await s.write(input);
    expect(categoryReceipt.safeParse(receipt).success).toBe(true);
    await expect(s.write(input)).resolves.toEqual(receipt);
    expect(s.read().rows).toHaveLength(26);
    await s.write({ ...input, kind: "update", requestId: "22222222-2222-4222-8222-222222222222", id: receipt.categoryId, expectedDigest: s.read().digest, fields: { name: "تعديل" } });
    expect(s.read().rows.find(r => r.id === receipt.categoryId)?.name).toBe("تعديل");
    await s.write({ kind: "delete", requestId: "33333333-3333-4333-8333-333333333333", id: receipt.categoryId, reviewed: true, expectedDigest: s.read().digest });
    expect(s.read().rows).toHaveLength(25);
  });
  it.each(["uncertain", "receiptError", "wrongReceipt"] as const)("recovers %s without another insert", async mode => {
    const s = new ProductCategoryPreviewStore(); s.setMode(mode); const input = create(s);
    if (mode === "wrongReceipt") expect((await s.write(input)).actorId).toBe(1);
    else await expect(s.write(input)).rejects.toThrow();
    if (mode === "receiptError") await expect(s.receipt(requestId)).rejects.toThrow();
    s.setMode("data");
    const receipt = await s.receipt(requestId);
    expect(categoryReceipt.safeParse(receipt).success).toBe(true);
    await expect(s.write(input)).resolves.toEqual(receipt);
    expect(s.read().rows).toHaveLength(26);
    await expect(s.write({ ...input, fields: { ...input.fields, name: "Other" } })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
  it("rejects stale snapshots and deletion of linked parents", async () => {
    const s = new ProductCategoryPreviewStore(), input = create(s); s.conflict();
    await expect(s.write(input)).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(s.write({ kind: "delete", id: 1, reviewed: true, requestId, expectedDigest: s.read().digest })).rejects.toMatchObject({ reason: "in_use" });
  });
  it.each(["viewer", "source", "wrongTenant", "saveError", "notCommitted", "limit"] as const)("prevents writes for %s", async mode => {
    const s = new ProductCategoryPreviewStore(); s.setMode(mode); const count = s.read().rows.length;
    await expect(s.write(create(s))).rejects.toThrow();
    expect(s.read().rows).toHaveLength(count);
  });
  it("keeps a broken parent repair after leaving the scenario", async () => {
    const s = new ProductCategoryPreviewStore(); s.setMode("broken");
    await s.write({ kind: "update", id: 2, reviewed: true, requestId, expectedDigest: s.read().digest, fields: { parentId: null } });
    expect(s.read().rows.find(r => r.id === 2)?.parentId).toBeNull();
  });
  it("starts from an empty fixture and resets only through the explicit operation", async () => {
    const s = new ProductCategoryPreviewStore(); s.setMode("empty"); await s.write(create(s));
    expect(s.read().rows).toHaveLength(1); s.reset(); expect(s.read().rows).toHaveLength(25);
    await expect(s.receipt(requestId)).resolves.toBeNull();
  });
});
