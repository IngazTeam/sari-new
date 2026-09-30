import { describe, it, expect } from "vitest";
import {
  categoryFields,
  categoryWrite,
  categorySnapshot,
  categoryPath,
  planCategoryChange,
  PRODUCT_CATEGORY_LIMIT,
  type CategoryRow,
} from "../shared/product-categories";
const fields = {
  name: "قهوة",
  nameEn: "Coffee",
  parentId: null,
  sortOrder: 0,
  isActive: 1 as const,
};
const row = (id = 1, patch: Partial<CategoryRow> = {}): CategoryRow => ({
  ...fields,
  id,
  merchantId: 7,
  productCount: 0,
  ...patch,
});
const base = {
  requestId: "22222222-2222-4222-8222-222222222222",
  expectedDigest: "a".repeat(64),
  reviewed: true,
};
const update = (fields: unknown, id = 1) => ({
  ...base,
  kind: "update",
  id,
  fields,
});
describe("category review contracts and hierarchy", () => {
  it("preserves every editable category field and trims entered labels", () => {
    const plan = planCategoryChange(7, [], {
      ...base,
      kind: "create",
      fields: { ...fields, name: " قهوة " },
    });
    expect(plan.after).toEqual(fields);
    expect(plan.before).toBeNull();
    expect(plan.changes).toHaveLength(5);
  });
  it.each([
    { name: "" },
    { name: "  " },
    { name: "x".repeat(101) },
    { name: "a\u0000b" },
    { isActive: 2 },
    { sortOrder: -1 },
    { sortOrder: 1.5 },
    { parentId: 0 },
    { parentId: 1.5 },
    { parentId: 2147483648 },
  ])("rejects invalid field %j", patch => {
    expect(categoryFields.safeParse({ ...fields, ...patch }).success).toBe(
      false
    );
  });
  it.each([
    { reviewed: false },
    { requestId: "bad" },
    { expectedDigest: "bad" },
    { merchantId: 8 },
  ])("rejects malformed review %j", patch => {
    expect(
      categoryWrite.safeParse({ ...base, kind: "create", fields, ...patch })
        .success
    ).toBe(false);
  });
  it("rejects empty updates and no-op changes", () => {
    expect(categoryWrite.safeParse(update({})).success).toBe(false);
    expect(() =>
      planCategoryChange(7, [row()], update({ name: "قهوة" }))
    ).toThrow("category:no_change");
  });
  it("keeps free-text product category labels untouched and reports linked product count", () => {
    const before = row(1, { productCount: 12 });
    const p = planCategoryChange(7, [before], update({ name: "اسم جديد" }));
    expect(p.changes).toEqual(["name"]);
    expect(p.linkedProducts).toBe(12);
    expect(before.name).toBe("قهوة");
    expect(p.after).not.toHaveProperty("products");
  });
  it("rejects foreign and duplicate category rows", () => {
    expect(() =>
      planCategoryChange(
        7,
        [row(1, { merchantId: 8 })],
        update({ name: "new" })
      )
    ).toThrow("category:scope");
    expect(() =>
      planCategoryChange(7, [row(), row()], update({ name: "new" }))
    ).toThrow("category:scope");
    expect(
      categorySnapshot.safeParse({
        merchantId: 7,
        actorId: 9,
        canManage: true,
        locked: false,
        digest: base.expectedDigest,
        rows: [row(1, { merchantId: 8 })],
      }).success
    ).toBe(false);
  });
  it("rejects missing target and unavailable/foreign parent", () => {
    expect(() => planCategoryChange(7, [], update({ name: "new" }))).toThrow(
      "category:missing"
    );
    expect(() =>
      planCategoryChange(7, [row()], update({ parentId: 99 }))
    ).toThrow("category:parent_missing");
  });
  it("rejects self and descendant cycles without recursive traversal", () => {
    expect(() =>
      planCategoryChange(7, [row()], update({ parentId: 1 }))
    ).toThrow("category:cycle");
    expect(() =>
      planCategoryChange(
        7,
        [row(), row(2, { parentId: 1, name: "child" })],
        update({ parentId: 2 })
      )
    ).toThrow("category:cycle");
    expect(
      categoryPath([row(1, { parentId: 2 }), row(2, { parentId: 1 })], 1).issue
    ).toBe("cycle");
  });
  it("allows correction of a broken parent link", () => {
    expect(
      planCategoryChange(
        7,
        [row(1, { parentId: 99 })],
        update({ parentId: null })
      ).after?.parentId
    ).toBeNull();
  });
  it("rejects duplicate normalized siblings but allows the same label under another parent", () => {
    expect(() =>
      planCategoryChange(
        7,
        [row(1, { name: "Coffee" }), row(2, { name: "Tea" })],
        update({ name: "ＣＯＦＦＥＥ" }, 2)
      )
    ).toThrow("category:duplicate");
    const p = planCategoryChange(
      7,
      [row(1, { name: "Coffee" }), row(2, { name: "Tea" })],
      {
        ...base,
        kind: "create",
        fields: { ...fields, name: "Coffee", parentId: 2 },
      }
    );
    expect(p.after?.parentId).toBe(2);
  });
  it("rejects active children under inactive parent and deactivating a parent with active descendants", () => {
    expect(() =>
      planCategoryChange(
        7,
        [row(1, { isActive: 0 }), row(2, { name: "child" })],
        update({ parentId: 1 }, 2)
      )
    ).toThrow("category:inactive_parent");
    expect(() =>
      planCategoryChange(
        7,
        [row(), row(2, { parentId: 1, name: "child" })],
        update({ isActive: 0 })
      )
    ).toThrow("category:inactive_parent");
  });
  it("blocks a move that pushes descendants past the supported depth", () => {
    const chain = Array.from({ length: 8 }, (_, i) =>
      row(i + 1, { name: String(i), parentId: i || null })
    );
    expect(categoryPath(chain, 8).issue).toBeNull();
    expect(() =>
      planCategoryChange(
        7,
        [...chain, row(9, { name: "new root" })],
        update({ parentId: 9 })
      )
    ).toThrow("category:depth");
  });
  it.each([row(1, { productCount: 1 }), row()])(
    "blocks deletion when used by products or children",
    target => {
      const rows = target.productCount
        ? [target]
        : [target, row(2, { parentId: 1 })];
      expect(() =>
        planCategoryChange(7, rows, { ...base, kind: "delete", id: 1 })
      ).toThrow("category:in_use");
    }
  );
  it("allows deleting an unused leaf and returns no unrelated changes", () => {
    const p = planCategoryChange(7, [row(), row(2, { name: "Other" })], {
      ...base,
      kind: "delete",
      id: 1,
    });
    expect(p.after).toBeNull();
    expect(p.before.id).toBe(1);
    expect(p.changes).toEqual([]);
  });
  it("bounds category creation and ancestry work", () => {
    const rows = Array.from({ length: PRODUCT_CATEGORY_LIMIT }, (_, i) =>
      row(i + 1, { name: String(i) })
    );
    expect(() =>
      planCategoryChange(7, rows, { ...base, kind: "create", fields })
    ).toThrow("category:limit");
  });
});
