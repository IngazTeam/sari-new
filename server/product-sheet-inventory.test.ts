import { describe, it, expect } from "vitest";
import {
  previewSheetInventory,
  planSheetInventory,
} from "./product-sheet-inventory";
import {
  readProductSheetGrid,
  previewProductSheet,
} from "./product-sheet-preview";
const sheet = {
  id: 5,
  title: "المخزون",
  rows: 12000,
  columns: 70,
  hidden: true,
};
const selection = {
  spreadsheetId: "fixture-inventory",
  sheet,
  readAt: "2026-09-30T14:00:00.000Z",
};
const cell = (v: unknown) =>
  typeof v === "object" && v !== null
    ? v
    : {
        userEnteredValue:
          typeof v === "number"
            ? { numberValue: v }
            : typeof v === "boolean"
              ? { boolValue: v }
              : { stringValue: String(v) },
      };
const payload = (rows: unknown[][]) => ({
  spreadsheetId: selection.spreadsheetId,
  sheets: [
    {
      properties: {
        sheetId: sheet.id,
        title: sheet.title,
        hidden: true,
        sheetType: "GRID",
        gridProperties: { rowCount: sheet.rows, columnCount: sheet.columns },
      },
      data: [{ rowData: rows.map(row => ({ values: row.map(cell) })) }],
    },
  ],
});
const grid = (rows: unknown[][]) =>
  readProductSheetGrid(payload(rows), selection);
const catalog = [
  {
    id: 7,
    name: "Coffee",
    stock: 4,
    stockValid: true,
    locked: false,
    digest: "a".repeat(64),
  },
  {
    id: 8,
    name: "Tea",
    stock: null,
    stockValid: true,
    locked: false,
    digest: "b".repeat(64),
  },
];
describe("reviewed inventory interpretation", () => {
  it("updates stock only by explicit product ID, retaining unknown versus zero and physical row numbers", () => {
    const p = previewSheetInventory(
      grid([
        ["رقم المنتج", "الكمية", "السعر"],
        [7, 0, "invalid ignored price"],
        [],
        [8, 0, "=do not follow"],
      ])
    );
    expect(p.rows.map(r => r.number)).toEqual([2, 4]);
    expect(p.snapshot).toMatchObject({
      range: "'المخزون'!A1:BH5001",
      limitedRange: true,
      coveredRows: 5001,
      coveredColumns: 60,
    });
    expect(planSheetInventory(p, catalog)).toMatchObject({
      counts: { update: 2, unchanged: 0, blocked: 0 },
      rows: [
        { productId: 7, before: 4, after: 0 },
        { productId: 8, before: null, after: 0 },
      ],
    });
  });
  it.each([
    "",
    " ",
    "-1",
    "1.2",
    "1e3",
    "1,000",
    "0x10",
    "12x",
    "01",
    "2147483648",
    true,
    {
      userEnteredValue: { formulaValue: "=1+1" },
      effectiveValue: { numberValue: 2 },
    },
    {
      userEnteredValue: { numberValue: 4 },
      effectiveFormat: { numberFormat: { type: "DATE" } },
    },
    { effectiveValue: { errorValue: { type: "ERROR" } } },
  ])(
    "blocks invalid or unsupported quantity %j without making it zero",
    value => {
      const p = previewSheetInventory(
          grid([
            ["id", "stock"],
            [7, value],
          ])
        ),
        plan = planSheetInventory(p, catalog);
      expect(p.rows[0].stock).toBeNull();
      expect(plan.rows[0].after).toBeNull();
      expect(plan.counts.blocked).toBe(1);
    }
  );
  it.each(["0", "-1", "7.0", "7e0", "2147483648", true, "Coffee", "7x"])(
    "does not match invalid ID %j by name or numeric coercion",
    value => {
      const p = previewSheetInventory(
        grid([
          ["id", "stock"],
          [value, 4],
        ])
      );
      expect(p.rows[0].productId).toBeNull();
      expect(planSheetInventory(p, catalog).counts.blocked).toBe(1);
    }
  );
  it("accepts Arabic digits, Persian digits, exact zero and max integer", () => {
    const p = previewSheetInventory(
      grid([
        ["product_id", "quantity"],
        ["٧", "٢١٤٧٤٨٣٦٤٧"],
        ["۸", "۰"],
      ])
    );
    expect(p.rows.map(r => [r.productId, r.stock])).toEqual([
      [7, 2147483647],
      [8, 0],
    ]);
  });
  it("blocks every duplicated target even when one duplicate has invalid stock", () => {
    const p = previewSheetInventory(
      grid([
        ["id", "stock"],
        [7, 4],
        ["٧", ""],
      ])
    );
    expect(p.rows.every(r => r.issues.includes("duplicate_product"))).toBe(
      true
    );
    expect(planSheetInventory(p, catalog).counts.blocked).toBe(2);
  });
  it("does not expose another tenant's product name or create missing IDs", () => {
    const p = previewSheetInventory(
        grid([
          ["id", "stock"],
          [99, 4],
        ])
      ),
      r = planSheetInventory(p, catalog).rows[0];
    expect(r).toMatchObject({
      action: "blocked",
      name: null,
      before: null,
      after: null,
      expectedDigest: null,
      issues: ["product_missing"],
    });
  });
  it("blocks externally managed and invalid current stock but preserves unchanged rows", () => {
    const p = previewSheetInventory(
      grid([
        ["id", "stock"],
        [7, 4],
        [8, 0],
      ])
    );
    expect(planSheetInventory(p, catalog).counts).toEqual({
      update: 1,
      unchanged: 1,
      blocked: 0,
    });
    expect(
      planSheetInventory(p, [
        { ...catalog[0], locked: true },
        { ...catalog[1], stockValid: false },
      ]).rows.map(r => r.issues)
    ).toEqual([["source_locked"], ["current_stock_invalid"]]);
  });
  it.each(
    [
      ["name", "stock"],
      ["id", "price"],
      ["id", "stock", "quantity"],
      ["id", "product id", "stock"],
    ].map(headers => ({ headers }))
  )("blocks missing or ambiguous headers %j on all rows", ({ headers }) => {
    const p = previewSheetInventory(grid([headers, [7, 4, 5], [8, 3, 2]]));
    expect(p.issues.length).toBeGreaterThan(0);
    expect(planSheetInventory(p, catalog).counts.blocked).toBe(2);
  });
  it("explicit mapping resolves ambiguity and rejects out of bounds, repeated or formula headers", () => {
    const g = grid([
      ["stock", "id", "stock"],
      [4, 7, 8],
    ]);
    expect(
      previewSheetInventory(g, { mapping: { productId: 1, stock: 2 } }).rows[0]
    ).toMatchObject({ productId: 7, stock: 8, issues: [] });
    expect(() =>
      previewSheetInventory(g, { mapping: { productId: 1, stock: 1 } })
    ).toThrow();
    expect(
      previewSheetInventory(g, { mapping: { productId: 1, stock: 59 } }).issues
    ).toContain("missing_mapping");
    const formula = grid([
      [
        "id",
        {
          userEnteredValue: { formulaValue: '="stock"' },
          effectiveValue: { stringValue: "stock" },
        },
      ],
      [7, 4],
    ]);
    expect(
      previewSheetInventory(formula, { mapping: { productId: 0, stock: 1 } })
        .issues
    ).toContain("missing_mapping");
  });
  it("binds ignored cells and mapping but not read time; catalog changes invalidate the plan", () => {
    const g = grid([
        ["id", "stock", "notes"],
        [7, 4, "A"],
      ]),
      a = previewSheetInventory(g);
    expect(
      previewSheetInventory({ ...g, readAt: "2026-10-01T00:00:00.000Z" }).digest
    ).toBe(a.digest);
    expect(
      previewSheetInventory(
        grid([
          ["id", "stock", "notes"],
          [7, 4, "B"],
        ])
      ).digest
    ).not.toBe(a.digest);
    expect(
      planSheetInventory(a, [
        { ...catalog[0], digest: "c".repeat(64) },
        catalog[1],
      ]).digest
    ).not.toBe(planSheetInventory(a, catalog).digest);
    expect(() => planSheetInventory(a, [catalog[0], catalog[0]])).toThrow();
  });
  it("rejects an empty sheet instead of inventing a zero-row success", () => {
    expect(() =>
      previewSheetInventory(grid([["id", "stock"], [], ["", ""]]))
    ).toThrow();
  });
  it("retains existing product boolean semantics while inventory rejects booleans", () => {
    const p = previewProductSheet(
      payload([
        ["name", "price", "trackInventory"],
        ["Coffee", 1, true],
      ]),
      { ...selection, options: { sheetId: 5, currency: "SAR" } }
    );
    expect(p.preview.rows[0].fields?.trackInventory).toBe(1);
    const stock = previewSheetInventory(
      grid([
        ["id", "stock"],
        [7, true],
      ])
    );
    expect(stock.rows[0].issues).toContain("unsupported_cell");
  });
});
