import { describe, it, expect } from "vitest";
import { projectInventoryExport } from "./inventory-sheet-export";
import {
  previewProductImportRows,
  previewProductImport,
} from "./product-import-preview";
const options = {
  format: "csv" as const,
  fileName: "inventory.csv",
  csvData: "grid",
  delimiter: ",",
  currency: "SAR" as const,
  productType: "physical" as const,
  status: "active" as const,
};
const header = [
  "رقم المنتج",
  "اسم المنتج",
  "الفئة",
  "السعر",
  "الكمية المتاحة",
  "آخر تحديث",
];
const at = "2026-09-30T12:00:00.000Z";
const item = {
  id: 1,
  merchantId: 20,
  name: "Tea",
  category: "Drinks",
  price: 1234,
  priceUnit: "minor",
  currency: "USD",
  stock: 0,
};
const matrix = (rows: string[][]) =>
  rows.map((r, i) => ({ number: i + 1, cells: r.map(text => ({ text })) }));
describe("inventory export can be reviewed as product input", () => {
  it("reads the real six-column export with price currency, explicit zero and raw cell evidence", () => {
    const rows = projectInventoryExport(
      [item, { ...item, id: 2, name: "Water", currency: "SAR", stock: null }],
      20,
      at
    ).rows;
    const p = previewProductImportRows(options, matrix([header, ...rows]));
    expect(p.valid).toBe(2);
    expect(p.rows[0].values[3]).toBe("12.34 USD");
    expect(p.rows[0].fields).toMatchObject({
      name: "Tea",
      price: "12.34",
      currency: "USD",
      stock: 0,
      category: "Drinks",
    });
    expect(p.rows[1].fields).toMatchObject({ currency: "SAR", stock: null });
  });
  it.each(["SAR", "USD"])(
    "reads the same currency in an explicit column (%s)",
    currency => {
      const p = previewProductImportRows(
        options,
        matrix([
          ["name", "price", "currency"],
          ["Tea", `1.00 ${currency}`, currency],
        ])
      );
      expect(p.valid).toBe(1);
      expect(p.rows[0].fields?.currency).toBe(currency);
    }
  );
  it.each([
    ["SAR", "USD"],
    ["USD", "SAR"],
    ["USD", "EUR"],
  ])(
    "blocks conflicting suffix %s and currency column %s",
    (suffix, column) => {
      const p = previewProductImportRows(
        options,
        matrix([
          ["name", "price", "currency"],
          ["Tea", `1.00 ${suffix}`, column],
        ])
      );
      expect(p.invalid).toBe(1);
      expect(p.rows[0].fields).toBeNull();
      expect(p.rows[0].issues).toContainEqual({
        code: "invalid_value",
        field: "currency",
        column: 2,
      });
    }
  );
  it("treats a blank currency column as absent, preserving the literal suffix", () => {
    const p = previewProductImportRows(
      options,
      matrix([
        ["name", "price", "currency"],
        ["Tea", "0.00 USD", ""],
      ])
    );
    expect(p.rows[0].fields).toMatchObject({ price: "0.00", currency: "USD" });
  });
  it.each([
    "1.001 USD",
    "1e3 USD",
    "-1 USD",
    "1.00 XYZ",
    "1.00 usd",
    "=1+2 USD",
    "1,000 USD",
    "Infinity USD",
  ])("does not broaden price parsing to ambiguous input %s", value => {
    const p = previewProductImportRows(
      options,
      matrix([
        ["name", "price"],
        ["Tea", value],
      ])
    );
    expect(p.invalid).toBe(1);
  });
  it("keeps blank unverified exported prices blocked and leaves formulas blocked", () => {
    const rows = projectInventoryExport(
      [{ ...item, priceUnit: "unverified" }],
      20,
      at
    ).rows;
    const p = previewProductImportRows(options, matrix([header, ...rows]));
    expect(p.invalid).toBe(1);
    expect(p.rows[0].issues).toContainEqual({
      code: "missing_price",
      field: "price",
      column: 3,
    });
    const raw = matrix([
      ["name", "price"],
      ["Tea", "12.34 USD"],
    ]);
    (raw[1].cells[1] as any).issue = "formula";
    expect(previewProductImportRows(options, raw).invalid).toBe(1);
  });
  it("applies the same rules to a downloaded CSV, without changing plain numeric imports", async () => {
    const p = await previewProductImport({
      ...options,
      csvData: "name,price,quantity\nTea,12.34 USD,0\nWater,5.00,2",
    });
    expect(p.valid).toBe(2);
    expect(p.rows[0].fields).toMatchObject({
      price: "12.34",
      currency: "USD",
      stock: 0,
    });
    expect(p.rows[1].fields).toMatchObject({
      price: "5.00",
      currency: "SAR",
      stock: 2,
    });
  });
});
