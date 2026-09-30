import { describe, expect, it } from "vitest";
import {
  previewProductSheet,
  readProductSheetList,
  productSheetRange,
} from "./product-sheet-preview";
import { productSheetSnapshot } from "../shared/product-sheet-import";
import { previewProductImport } from "./product-import-preview";
const spreadsheetId = "local-sheet-95",
  readAt = "2026-09-30T12:00:00.000Z";
const sheet = {
  id: 0,
  title: "Products",
  hidden: false,
  rows: 1000,
  columns: 26,
};
const properties = (s = sheet) => ({
  sheetId: s.id,
  title: s.title,
  hidden: s.hidden,
  sheetType: "GRID",
  gridProperties: { rowCount: s.rows, columnCount: s.columns },
});
const v = (x: string | number | boolean) => ({
  userEnteredValue:
    typeof x === "string"
      ? { stringValue: x }
      : typeof x === "number"
        ? { numberValue: x }
        : { boolValue: x },
});
const raw = (values: any[][], s = sheet) => ({
  spreadsheetId,
  sheets: [
    {
      properties: properties(s),
      data: [{ rowData: values.map(values => ({ values })) }],
    },
  ],
});
const options = { sheetId: 0, currency: "SAR" };
const run = (data: unknown, s = sheet, patch = {}) =>
  previewProductSheet(data, {
    spreadsheetId,
    sheet: s,
    options: { ...options, ...patch },
    readAt,
  });
describe("Google Sheets product source contract", () => {
  it("preserves the same field semantics as file imports", async () => {
    const columns = [
        "name",
        "price",
        "cost",
        "stock",
        "currency",
        "trackinventory",
      ],
      values = ["Example", 12.34, 5, 0, "USD", false];
    const result = run(raw([columns.map(v), values.map(v)]));
    const csv = await previewProductImport({
      format: "csv",
      fileName: "Products.csv",
      currency: "SAR",
      csvData: columns.join(",") + "\nExample,12.34,5,0,USD,0",
    });
    expect(result.preview.rows).toEqual(csv.rows);
    expect(result.preview.headers).toEqual(csv.headers);
    expect(result.preview.rows[0].fields).toMatchObject({
      price: "12.34",
      costPrice: "5",
      stock: 0,
      trackInventory: 0,
      currency: "USD",
    });
    expect(result).toMatchObject({
      kind: "google_sheets",
      range: "'Products'!A1:Z1000",
      limitedRange: false,
    });
    expect(productSheetSnapshot.safeParse(result).success).toBe(true);
  });
  it("keeps missing price invalid, zero explicit and unknown stock null", () => {
    const r = run(
      raw([
        [v("name"), v("price"), v("stock")],
        [v("No price"), {}, {}],
        [v("Free"), v(0), {}],
      ])
    );
    expect(r.preview.rows[0].fields).toBeNull();
    expect(r.preview.rows[0].issues.map(i => i.code)).toContain(
      "missing_price"
    );
    expect(r.preview.rows[1].fields).toMatchObject({ price: "0", stock: null });
  });
  it("does not turn cost into a sale price", () => {
    const r = run(
      raw([
        [v("name"), v("cost")],
        [v("Example"), v(5)],
      ])
    );
    expect(r.preview.valid).toBe(0);
    expect(r.preview.headers[1].field).toBe("costPrice");
    expect(r.preview.issues).toContainEqual({
      code: "missing_mapping",
      field: "price",
      column: null,
    });
  });
  it.each([
    [
      {
        userEnteredValue: { formulaValue: "=1+1" },
        effectiveValue: { numberValue: 2 },
      },
      "formula",
    ],
    [
      {
        effectiveValue: {
          errorValue: {
            type: "DIVIDE_BY_ZERO",
            message: "private provider error",
          },
        },
      },
      "unsupported_cell",
    ],
    [
      {
        userEnteredValue: { numberValue: 45100 },
        effectiveFormat: { numberFormat: { type: "DATE" } },
      },
      "unsupported_cell",
    ],
    [
      {
        userEnteredValue: { numberValue: 0.5 },
        effectiveFormat: { numberFormat: { type: "TIME" } },
      },
      "unsupported_cell",
    ],
  ] as const)("rejects unsafe mapped cell %s", (cell, issue) => {
    const r = run(
      raw([
        [v("name"), v("price")],
        [v("Example"), cell],
      ])
    );
    expect(r.preview.rows[0].fields).toBeNull();
    expect(r.preview.rows[0].issues).toContainEqual({
      code: issue,
      field: "price",
      column: 1,
    });
    expect(JSON.stringify(r)).not.toContain("private provider error");
  });
  it("keeps physical row and column numbers across empty cells and rows", () => {
    const r = run(
      raw([[v("name"), {}, v("price")], [], [v("Example"), {}, v(1)]])
    );
    expect(r.preview.rows[0]).toMatchObject({
      number: 3,
      values: ["Example", "", "1"],
    });
    expect(r.preview.headers[2]).toMatchObject({ column: 2, field: "price" });
  });
  it("rejects a formula header and retains literal formula-looking text", () => {
    expect(
      run(
        raw([
          [{ userEnteredValue: { formulaValue: '="name"' } }, v("price")],
          [v("Example"), v(1)],
        ])
      ).preview.valid
    ).toBe(0);
    expect(
      run(
        raw([
          [v("name"), v("price")],
          [v("=not executable"), v(1)],
        ])
      ).preview.rows[0].fields?.name
    ).toBe("=not executable");
  });
  it("discloses bounded ranges without pretending allocated rows are data rows", () => {
    const wide = { ...sheet, rows: 10000, columns: 100 };
    const r = run(
      raw(
        [
          [v("name"), v("price")],
          [v("Example"), v(1)],
        ],
        wide
      ),
      wide
    );
    expect(r).toMatchObject({
      coveredRows: 5001,
      coveredColumns: 60,
      limitedRange: true,
      range: "'Products'!A1:BH5001",
    });
    expect(r.preview.total).toBe(1);
  });
  it("escapes quotes in A1 sheet names rather than treating them as ranges", () => {
    expect(productSheetRange({ ...sheet, title: "O'Brien ! Sheet" })).toBe(
      "'O''Brien ! Sheet'!A1:Z1000"
    );
  });
  it("accepts renamed and hidden sheets only when selected metadata matches", () => {
    const hidden = { ...sheet, title: "مبيعات", hidden: true };
    expect(
      run(
        raw(
          [
            [v("name"), v("price")],
            [v("Example"), v(1)],
          ],
          hidden
        ),
        hidden
      ).sheet.hidden
    ).toBe(true);
    expect(() =>
      run(
        raw(
          [
            [v("name"), v("price")],
            [v("Example"), v(1)],
          ],
          hidden
        )
      )
    ).toThrow();
  });
  it.each([
    "spreadsheet",
    "id",
    "title",
    "hidden",
    "rows",
    "columns",
    "type",
    "offset",
    "multiple",
    "outside",
  ])("rejects changed or malformed %s", kind => {
    const r: any = raw([
        [v("name"), v("price")],
        [v("Example"), v(1)],
      ]),
      p = r.sheets[0].properties;
    if (kind === "spreadsheet") r.spreadsheetId = "different";
    if (kind === "id") p.sheetId = 9;
    if (kind === "title") p.title = "Other";
    if (kind === "hidden") p.hidden = true;
    if (kind === "rows") p.gridProperties.rowCount = 2000;
    if (kind === "columns") p.gridProperties.columnCount = 27;
    if (kind === "type") p.sheetType = "OBJECT";
    if (kind === "offset") r.sheets[0].data[0].startRow = 1;
    if (kind === "multiple") r.sheets.push(r.sheets[0]);
    if (kind === "outside")
      r.sheets[0].data[0].rowData[0].values = Array.from({ length: 27 }, () =>
        v("x")
      );
    expect(() => run(r)).toThrow();
  });
  it("lists only grids and rejects duplicate sheet IDs or another spreadsheet", () => {
    const data = {
      spreadsheetId,
      sheets: [
        { properties: properties() },
        { properties: { sheetId: 2, title: "Chart", sheetType: "OBJECT" } },
      ],
    };
    expect(readProductSheetList(data, spreadsheetId)).toEqual([sheet]);
    expect(() =>
      readProductSheetList({ ...data, spreadsheetId: "other" }, spreadsheetId)
    ).toThrow();
    expect(() =>
      readProductSheetList(
        { ...data, sheets: [data.sheets[0], data.sheets[0]] },
        spreadsheetId
      )
    ).toThrow();
  });
  it("changes identity when source, ignored cells or options change, but not read time", () => {
    const data = raw([
        [v("name"), v("price"), v("custom")],
        [v("Example"), v(1), v("one")],
      ]),
      a = run(data);
    expect(
      previewProductSheet(data, {
        spreadsheetId,
        sheet,
        options,
        readAt: "2026-09-30T13:00:00.000Z",
      }).digest
    ).toBe(a.digest);
    data.sheets[0].data[0].rowData[1].values[2] = v("two");
    expect(run(data).digest).not.toBe(a.digest);
    expect(run(data, sheet, { currency: "USD" }).digest).not.toBe(
      run(data).digest
    );
  });
  it.each(["cell", "columns", "rows", "bytes", "invalidUnion", "empty"])(
    "bounds %s before any write",
    kind => {
      const r: any = raw([
        [v("name"), v("price")],
        [v("Example"), v(1)],
      ]);
      if (kind === "cell")
        r.sheets[0].data[0].rowData[1].values[0] = v("a".repeat(16001));
      if (kind === "columns")
        r.sheets[0].data[0].rowData[0].values = Array.from({ length: 61 }, () =>
          v("x")
        );
      if (kind === "rows")
        r.sheets[0].data[0].rowData = Array.from({ length: 5002 }, () => ({
          values: [],
        }));
      if (kind === "bytes") r.extra = "x".repeat(8 * 1024 * 1024);
      if (kind === "invalidUnion")
        r.sheets[0].data[0].rowData[1].values[0] = {
          userEnteredValue: { stringValue: "text", numberValue: 4 },
        };
      if (kind === "empty") r.sheets[0].data = [];
      expect(() => run(r)).toThrow();
    }
  );
});
