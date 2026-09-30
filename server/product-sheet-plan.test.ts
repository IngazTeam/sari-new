import { describe, expect, it } from "vitest";
import { previewProductSheet } from "./product-sheet-preview";
import { planProductSheet, productSheetTargetIds } from "./product-sheet-plan";
import {
  productSheetPlan,
  productSheetCatalogItem,
} from "../shared/product-sheet-import";
import { productEditableFields } from "../shared/product-editor";
import type { z } from "zod";
const fields = productEditableFields.parse({
  name: "Tea",
  price: "12.34",
  currency: "SAR",
  description: "Original",
  imageUrl: null,
  stock: 7,
  sku: "T1",
  barcode: "B1",
  compareAtPrice: "15",
  costPrice: "4",
  weight: "1",
  category: "Drinks",
  categoryId: 4,
  tags: "tea",
  productType: "physical",
  status: "active",
  lowStockAlert: 2,
  trackInventory: 1,
});
const item = (
  patch: Partial<z.infer<typeof productEditableFields>> = {},
  extra: Record<string, unknown> = {}
) => {
  const f = { ...fields, ...patch };
  return productSheetCatalogItem.parse({
    id: 1,
    name: f.name,
    sku: f.sku,
    locked: false,
    digest: "a".repeat(64),
    fields: f,
    ...extra,
  });
};
const snapshot = (rows: (string | number)[][], patch = {}) => {
  const sheet = {
    id: 0,
    title: "Products",
    hidden: false,
    rows: 1000,
    columns: 26,
  };
  return previewProductSheet(
    {
      spreadsheetId: "local-98",
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "Products",
            hidden: false,
            sheetType: "GRID",
            gridProperties: { rowCount: 1000, columnCount: 26 },
          },
          data: [
            {
              rowData: rows.map(row => ({
                values: row.map(x => ({
                  userEnteredValue:
                    typeof x === "number"
                      ? { numberValue: x }
                      : { stringValue: x },
                })),
              })),
            },
          ],
        },
      ],
    },
    {
      spreadsheetId: "local-98",
      sheet,
      options: { sheetId: 0, currency: "SAR", ...patch },
      readAt: "2026-09-30T12:00:00.000Z",
    }
  );
};
const basic = () =>
  snapshot([
    ["name", "price", "sku"],
    ["Tea", 12.34, "T1"],
  ]);
describe("Google Sheets change plan", () => {
  it("creates from validated fields and preserves explicit free price / unknown stock", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price"],
        ["Free", 0],
      ]),
      "create_only",
      []
    );
    expect(p.counts).toEqual({
      create: 1,
      update: 0,
      unchanged: 0,
      blocked: 0,
    });
    expect(p.rows[0]).toMatchObject({
      number: 2,
      productId: null,
      before: null,
      expectedDigest: null,
      after: { price: "0", stock: null, categoryId: null, status: "draft" },
    });
  });
  it("updates only explicitly mapped fields and preserves unmapped state", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price", "sku"],
        ["New Tea", 20, "T1"],
      ]),
      "sku",
      [item()]
    );
    expect(p.rows[0]).toMatchObject({
      action: "update",
      productId: 1,
      before: fields,
      after: { ...fields, name: "New Tea", price: "20" },
      changes: ["name", "price"],
    });
  });
  it("recognizes equivalent money formatting without reporting a change", () => {
    const current = item({ price: "12.3400" });
    const p = planProductSheet(basic(), "sku", [current]);
    expect(p.rows[0]).toMatchObject({
      action: "unchanged",
      changes: [],
      before: current.fields,
      after: current.fields,
    });
  });
  it("compares optional money by value and distinguishes null from zero", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price", "sku", "cost", "compareAtPrice"],
        ["Tea", 12.34, "T1", 0, 15],
      ]),
      "sku",
      [item({ costPrice: null, compareAtPrice: "15.00" })]
    );
    expect(p.rows[0].changes).toEqual(["costPrice"]);
    expect(p.rows[0].after).toMatchObject({
      costPrice: "0",
      compareAtPrice: "15.00",
    });
  });
  it("allows an explicitly blank nullable column to clear a value", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price", "description"],
        ["Tea", 12.34, ""],
      ]),
      "name",
      [item()]
    );
    expect(p.rows[0]).toMatchObject({
      action: "update",
      changes: ["description"],
      after: { description: null, sku: "T1" },
    });
  });
  it("does not equate accented or punctuation-different names", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price"],
        ["Café", 10],
        ["Tea!", 10],
      ]),
      "name",
      [item({ name: "Cafe" }), item({}, { id: 2 })]
    );
    expect(p.counts.create).toBe(2);
  });
  it("matches trimmed case-insensitive keys, retaining actual source spelling as a visible change", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price", "sku"],
        ["Tea", 12.34, "t1"],
      ]),
      "sku",
      [item({ sku: " T1 " })]
    );
    expect(p.rows[0]).toMatchObject({
      productId: 1,
      action: "update",
      changes: ["sku"],
    });
  });
  it("requires an explicit SKU in SKU mode", () => {
    expect(
      planProductSheet(
        snapshot([
          ["name", "price"],
          ["Tea", 12],
        ]),
        "sku",
        [item()]
      ).rows[0].issues
    ).toEqual(["missing_key"]);
  });
  it.each(["sku", "name"] as const)("blocks ambiguous %s matches", mode => {
    const p = planProductSheet(basic(), mode, [item(), item({}, { id: 2 })]);
    expect(p.rows[0]).toMatchObject({
      action: "blocked",
      productId: null,
      issues: ["ambiguous_match"],
    });
  });
  it.each(["create_only", "name"] as const)(
    "blocks SKU collisions with another product in %s mode",
    mode => {
      const p = planProductSheet(basic(), mode, [item({ name: "Other" })]);
      expect(p.rows[0].issues).toEqual(["existing_sku"]);
    }
  );
  it("create-only never updates by name and warns of an existing name", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price"],
        ["Tea", 10],
      ]),
      "create_only",
      [item()]
    );
    expect(p.rows[0]).toMatchObject({
      action: "create",
      warnings: ["existing_name"],
      productId: null,
    });
  });
  it("does not edit externally managed targets", () => {
    expect(
      planProductSheet(basic(), "sku", [item({}, { locked: true })]).rows[0]
        .issues
    ).toEqual(["source_locked"]);
  });
  it.each([{ fields: null }, { digest: null }])(
    "blocks missing current fields or version %o",
    extra => {
      expect(
        planProductSheet(basic(), "sku", [item({}, extra)]).rows[0].issues
      ).toEqual(["current_fields_invalid"]);
    }
  );
  it.each([true, false])(
    "blocks cross-currency update even when the currency column is %s",
    mapped => {
      const s = mapped
        ? snapshot([
            ["name", "price", "currency"],
            ["Tea", 12, "SAR"],
          ])
        : snapshot([
            ["name", "price"],
            ["Tea", 12],
          ]);
      expect(
        planProductSheet(s, "name", [item({ currency: "USD" })]).rows[0].issues
      ).toEqual(["currency_mismatch"]);
    }
  );
  it("accepts the matching default currency when no currency column exists", () => {
    expect(
      planProductSheet(
        snapshot(
          [
            ["name", "price"],
            ["Tea", 12.34],
          ],
          { currency: "USD" }
        ),
        "name",
        [item({ currency: "USD" })]
      ).rows[0].action
    ).toBe("unchanged");
  });
  it("prevents category label changes that would contradict an existing linked category", () => {
    expect(
      planProductSheet(
        snapshot([
          ["name", "price", "category"],
          ["Tea", 12, "Other"],
        ]),
        "name",
        [item()]
      ).rows[0].issues
    ).toEqual(["category_linked"]);
  });
  it("allows a descriptive category change without a linked category", () => {
    expect(
      planProductSheet(
        snapshot([
          ["name", "price", "category"],
          ["Tea", 12.34, "Other"],
        ]),
        "name",
        [item({ categoryId: null })]
      ).rows[0]
    ).toMatchObject({
      action: "update",
      changes: ["category"],
      after: { categoryId: null },
    });
  });
  it("blocks every row aiming at the same existing name", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price"],
        ["Tea", 12],
        ["Tea", 13],
      ]),
      "name",
      [item()]
    );
    expect(p.counts.blocked).toBe(2);
    expect(
      p.rows.every(
        r =>
          r.issues.includes("duplicate_match") &&
          r.after === null &&
          r.changes.length === 0
      )
    ).toBe(true);
  });
  it("blocks duplicate new matching keys", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price"],
        ["Tea", 12],
        ["tea", 13],
      ]),
      "name",
      []
    );
    expect(p.rows.map(r => r.issues)).toEqual([
      ["duplicate_match"],
      ["duplicate_match"],
    ]);
  });
  it("retains common-parser invalid rows including missing price and duplicate SKU", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "price", "sku"],
        ["Tea", "", "T1"],
        ["Water", 10, "W1"],
        ["Juice", 12, "W1"],
      ]),
      "sku",
      []
    );
    expect(p.counts.blocked).toBe(3);
    expect(p.rows.every(r => r.issues.includes("invalid_row"))).toBe(true);
  });
  it("blocks all rows when the source has global mapping errors", () => {
    const p = planProductSheet(
      snapshot([
        ["name", "cost"],
        ["Tea", 10],
      ]),
      "create_only",
      []
    );
    expect(p.rows[0].issues).toEqual(["invalid_row"]);
  });
  it("retains physical row numbers across skipped blank rows", () => {
    expect(
      planProductSheet(
        snapshot([["name", "price"], [], ["Tea", 10]]),
        "create_only",
        []
      ).rows[0].number
    ).toBe(3);
  });
  it("resolves sorted unique candidate IDs with only catalog metadata", () => {
    const s = snapshot([
      ["name", "price"],
      ["Tea", 12],
      ["Coffee", 13],
      ["Tea", 14],
    ]);
    expect(
      productSheetTargetIds(s, "name", [
        item({}, { fields: null, digest: null, id: 9 }),
        item(
          { name: "Coffee", sku: null },
          { fields: null, digest: null, id: 2 }
        ),
      ])
    ).toEqual([2, 9]);
    expect(productSheetTargetIds(s, "create_only", [item()])).toEqual([]);
  });
  it("does not resolve ambiguous candidates", () => {
    expect(
      productSheetTargetIds(basic(), "name", [item(), item({}, { id: 2 })])
    ).toEqual([]);
  });
  it("rejects duplicate IDs, inconsistent metadata and excessive catalog size", () => {
    expect(() => planProductSheet(basic(), "sku", [item(), item()])).toThrow(
      "Duplicate catalog identity"
    );
    expect(() =>
      planProductSheet(basic(), "sku", [item({}, { sku: "wrong" })])
    ).toThrow("Inconsistent catalog identity");
    expect(() =>
      productSheetTargetIds(basic(), "sku", Array(20001).fill(item()))
    ).toThrow();
  });
  it("is deterministic, does not mutate inputs and versions source, mode and target", () => {
    const s = basic(),
      catalog = [item()],
      saved = JSON.stringify({ s, catalog });
    const p = planProductSheet(s, "sku", catalog);
    expect(planProductSheet(s, "sku", catalog)).toEqual(p);
    expect(JSON.stringify({ s, catalog })).toBe(saved);
    expect(
      planProductSheet(
        { ...s, readAt: "2026-10-01T12:00:00.000Z" },
        "sku",
        catalog
      ).digest
    ).toBe(p.digest);
    expect(
      planProductSheet({ ...s, digest: "b".repeat(64) }, "sku", catalog).digest
    ).not.toBe(p.digest);
    expect(planProductSheet(s, "name", catalog).digest).not.toBe(p.digest);
    expect(
      planProductSheet(s, "sku", [item({}, { digest: "b".repeat(64) })]).digest
    ).not.toBe(p.digest);
  });
  it("rejects forged counts and impossible action metadata", () => {
    const p = planProductSheet(basic(), "sku", [item()]);
    expect(
      productSheetPlan.safeParse({ ...p, counts: { ...p.counts, create: 1 } })
        .success
    ).toBe(false);
    for (const patch of [
      { action: "update" },
      { action: "create" },
      { action: "blocked" },
      { changes: ["price"] },
    ])
      expect(
        productSheetPlan.safeParse({ ...p, rows: [{ ...p.rows[0], ...patch }] })
          .success
      ).toBe(false);
  });
});
