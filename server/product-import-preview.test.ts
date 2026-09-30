import { describe, expect, it, vi, afterEach } from "vitest";
import ExcelJS from "exceljs";
import {
  parseProductCsv,
  previewProductImport,
  ProductImportFileError,
} from "./product-import-preview";
import { productImportInput } from "../shared/product-import";

const csv = (csvData: string, options: Record<string, unknown> = {}) =>
  previewProductImport({
    format: "csv",
    fileName: "products.csv",
    currency: "SAR",
    csvData,
    ...options,
  });
async function workbook(
  edit: (book: ExcelJS.Workbook) => void,
  options: Record<string, unknown> = {}
) {
  const book = new ExcelJS.Workbook();
  edit(book);
  return previewProductImport({
    format: "xlsx",
    fileName: "products.xlsx",
    currency: "SAR",
    fileBase64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    ...options,
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("product file preview without writes or providers", () => {
  it("understands Arabic templates and preserves exact decimals and unknown stock", async () => {
    const result = await csv(
      "\uFEFFاسم المنتج,السعر,الوصف,الكمية,التكلفة\r\nمنتج,12.34,وصف,,0"
    );
    expect(result).toMatchObject({
      total: 1,
      valid: 1,
      invalid: 0,
      issues: [],
    });
    expect(result.rows[0].fields).toMatchObject({
      name: "منتج",
      price: "12.34",
      costPrice: "0",
      stock: null,
      status: "draft",
      currency: "SAR",
    });
    expect(result.headers[4].field).toBe("costPrice");
  });
  it("reads all 17 fields without silently discarding an edited value", async () => {
    const result = await csv(
      "name,description,price,currency,image_url,stock,sku,barcode,compare_at_price,cost_price,weight,category,tags,product_type,status,low_stock_alert,track_inventory\nTest,Details,1.01,USD,https://example.test/a.png,0,S-1,B-1,2.02,0.01,1kg,Group,a|b,service,active,0,0"
    );
    expect(result.valid).toBe(1);
    expect(result.rows[0].fields).toEqual({
      name: "Test",
      description: "Details",
      price: "1.01",
      currency: "USD",
      imageUrl: "https://example.test/a.png",
      stock: 0,
      sku: "S-1",
      barcode: "B-1",
      compareAtPrice: "2.02",
      costPrice: "0.01",
      weight: "1kg",
      category: "Group",
      categoryId: null,
      tags: "a|b",
      productType: "service",
      status: "active",
      lowStockAlert: 0,
      trackInventory: 0,
    });
  });
  it("supports quoted separators, escaped quotes, CRLF, and physical starting lines", async () => {
    const result = await csv(
      '\nname,price,description\r\n"Tea, coffee",0,"First\r\n""quoted"" line"\r\n\r\nLast,2,end\r\n'
    );
    expect(result.valid).toBe(2);
    expect(result.rows.map(row => row.number)).toEqual([3, 6]);
    expect(result.rows[0].fields).toMatchObject({
      name: "Tea, coffee",
      price: "0",
      description: 'First\r\n"quoted" line',
    });
  });
  it.each([";", "\t"] as const)(
    "supports explicit %j delimiter",
    async delimiter => {
      expect(
        (
          await csv(`name${delimiter}price\nTest${delimiter}12.34`, {
            delimiter,
          })
        ).valid
      ).toBe(1);
    }
  );
  it.each([
    'name,price\n"open,1',
    'name,price\nBad"quote,1',
    'name,price\n"Closed"junk,1',
  ])("rejects malformed quoting %j", async source => {
    await expect(csv(source)).rejects.toMatchObject({ reason: "csv_syntax" });
  });
  it("requires sale price independently from cost and does not create free products", async () => {
    const result = await csv("name,cost\nTest,12");
    expect(result.issues).toContainEqual({
      code: "missing_mapping",
      field: "price",
      column: null,
    });
    expect(result.valid).toBe(0);
    const missing = await csv("name,price\nTest,");
    expect(missing.rows[0].issues).toContainEqual({
      code: "missing_price",
      field: "price",
      column: 1,
    });
    expect(missing.rows[0].fields).toBeNull();
  });
  it.each(["12oops", "1e2", "-1", "12.345", "١٢", "1,200", "NaN", "Infinity"])(
    "rejects ambiguous or invalid price %s",
    async price => {
      const result = await csv(`name,price\nTest,"${price}"`);
      expect(result.valid).toBe(0);
      expect(result.rows[0].issues.some(issue => issue.field === "price")).toBe(
        true
      );
    }
  );
  it.each(["2x", "2.5", "-1", "2147483648"])(
    "rejects invalid stock %s",
    async stock => {
      const result = await csv(`name,price,stock\nTest,1,${stock}`);
      expect(result.rows[0].issues).toContainEqual({
        code: "invalid_value",
        field: "stock",
        column: 2,
      });
    }
  );
  it("reports row errors separately and never returns invalid fields as importable", async () => {
    const result = await csv(
      "name,price,currency,image\n,1,SAR,\nGood,1,EUR,javascript:alert(1)\nValid,0,SAR,"
    );
    expect(result).toMatchObject({ total: 3, valid: 1, invalid: 2 });
    expect(result.rows[0].issues.map(issue => issue.field)).toContain("name");
    expect(result.rows[1].issues.map(issue => issue.field)).toEqual([
      "currency",
      "imageUrl",
    ]);
    expect(result.rows[0].fields).toBeNull();
    expect(result.rows[1].fields).toBeNull();
  });
  it("detects duplicate mappings and supports an explicit correction", async () => {
    const source = "name,title,price,extra\nFirst,Second,1,Unmapped";
    expect((await csv(source)).issues).toContainEqual({
      code: "duplicate_mapping",
      field: "name",
      column: 1,
    });
    const mapped = await csv(source, {
      mapping: [
        { column: 0, field: null },
        { column: 1, field: "name" },
        { column: 2, field: "price" },
      ],
    });
    expect(mapped.valid).toBe(1);
    expect(mapped.rows[0].fields?.name).toBe("Second");
    expect(mapped.rows[0].values[3]).toBe("Unmapped");
    expect(mapped.headers[3].field).toBeNull();
  });
  it("does not guess unknown headers or allow nonexistent columns", async () => {
    const unmapped = await csv("Something,Amount\nTest,1");
    expect(unmapped.valid).toBe(0);
    expect(
      unmapped.issues.filter(issue => issue.code === "missing_mapping")
    ).toHaveLength(2);
    const unknown = await csv("name,price\nTest,1", {
      mapping: [
        { column: 0, field: "name" },
        { column: 1, field: "price" },
        { column: 5, field: "sku" },
      ],
    });
    expect(unknown.valid).toBe(0);
    expect(unknown.issues.some(issue => issue.code === "unknown_column")).toBe(
      true
    );
  });
  it("rejects repeated mapping indices and unexpected payload properties", () => {
    for (const options of [
      {
        mapping: [
          { column: 0, field: "name" },
          { column: 0, field: "price" },
        ],
      },
      { merchantId: 5 },
      { mapping: [{ column: 60, field: "name" }] },
    ])
      expect(
        productImportInput.safeParse({
          format: "csv",
          fileName: "p.csv",
          currency: "SAR",
          csvData: "name,price\nTest,1",
          ...options,
        }).success
      ).toBe(false);
  });
  it("marks every duplicate SKU, including whitespace/case variants", async () => {
    const result = await csv(
      "name,price,sku\nFirst,1,ABC\nSecond,2, abc \nThird,3,\nFourth,4,"
    );
    expect(result.valid).toBe(2);
    for (const row of result.rows.slice(0, 2)) {
      expect(row.fields).toBeNull();
      expect(row.issues.some(issue => issue.code === "duplicate_sku")).toBe(
        true
      );
    }
  });
  it("binds the digest to file content, defaults, mapping, and file identity", async () => {
    const source = "name,price\nTest,1",
      initial = await csv(source);
    expect((await csv(source)).digest).toBe(initial.digest);
    expect(initial.digest).toMatch(/^[a-f0-9]{64}$/);
    for (const options of [
      { status: "active" },
      { currency: "USD" },
      { fileName: "other.csv" },
      {
        mapping: [
          { column: 0, field: "name" },
          { column: 1, field: "price" },
        ],
      },
    ])
      expect((await csv(source, options)).digest).not.toBe(initial.digest);
    expect((await csv(source + "0")).digest).not.toBe(initial.digest);
  });
  it("treats markup and CSV formulas as literal text without fetching", async () => {
    const fetch = vi.fn(() => {
      throw Error("No provider calls");
    });
    vi.stubGlobal("fetch", fetch);
    const result = await csv(
      'name,price,description\n<script>alert(1)</script>,1,=HYPERLINK(""bad"")'.replace(
        '=HYPERLINK(""bad"")',
        '"=HYPERLINK(""bad"")"'
      )
    );
    expect(result.valid).toBe(1);
    expect(result.rows[0].fields?.description).toBe('=HYPERLINK("bad")');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["", "name,price", "\n \n", "name,price\n,,"])(
    "requires actual data rows: %j",
    async source => {
      await expect(csv(source)).rejects.toBeInstanceOf(Error);
    }
  );
  it("enforces row, column, and cell limits", async () => {
    expect(
      (
        await csv(
          "name,price\n" +
            Array.from({ length: 5000 }, (_, i) => `Item ${i},1`).join("\n")
        )
      ).valid
    ).toBe(5000);
    await expect(
      csv("name,price\n" + "Test,1\n".repeat(5001))
    ).rejects.toMatchObject({ reason: "row_limit" });
    expect(
      parseProductCsv(Array(60).fill("x").join(","), ",")[0].cells
    ).toHaveLength(60);
    expect(() => parseProductCsv(Array(61).fill("x").join(","), ",")).toThrow(
      ProductImportFileError
    );
    expect(() => parseProductCsv("x".repeat(16001), ",")).toThrow(
      ProductImportFileError
    );
    await expect(csv("س".repeat(3 * 1024 * 1024))).rejects.toMatchObject({
      reason: "file_size",
    });
  });
  it("requires extension matching the parser without guessing", async () => {
    await expect(
      csv("name,price\nTest,1", { fileName: "payload.xlsx" })
    ).rejects.toMatchObject({ reason: "file_type" });
    expect(
      (await csv("name,price\nTest,1", { fileName: "PRODUCTS.CSV" })).valid
    ).toBe(1);
  });
});
describe("bounded Excel preview", () => {
  it("selects the requested worksheet and exposes hidden sheets for explicit review", async () => {
    const result = await workbook(
      book => {
        book.addWorksheet("Summary").addRow(["not products"]);
        const sheet = book.addWorksheet("Products", { state: "hidden" });
        sheet.addRows([
          ["name", "price", "stock"],
          ["Test", 12.34, 0],
        ]);
      },
      { sheet: 1 }
    );
    expect(result).toMatchObject({ valid: 1, sheet: 1 });
    expect(result.sheets[1]).toMatchObject({ name: "Products", hidden: true });
    expect(result.rows[0].fields).toMatchObject({
      name: "Test",
      price: "12.34",
      stock: 0,
    });
  });
  it("rejects formulas even when a cached result is valid and preserves row numbers", async () => {
    const result = await workbook(book => {
      const sheet = book.addWorksheet("Products");
      sheet.addRow(["name", "price"]);
      sheet.getRow(4).values = ["Test", { formula: "1+1", result: 2 }];
    });
    expect(result.rows[0].number).toBe(4);
    expect(result.valid).toBe(0);
    expect(result.rows[0].issues).toContainEqual({
      code: "formula",
      field: "price",
      column: 1,
    });
  });
  it("reads rich text and hyperlink labels without following the URL; ignored formulas are not imported", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await workbook(book =>
      book.addWorksheet("Products").addRows([
        ["name", "price", "description", "ignored"],
        [
          { richText: [{ text: "Hello " }, { text: "world" }] },
          1,
          { text: "Useful label", hyperlink: "https://private.invalid/" },
          { formula: "1+1", result: 2 },
        ],
      ])
    );
    expect(result.valid).toBe(1);
    expect(result.rows[0].fields).toMatchObject({
      name: "Hello world",
      description: "Useful label",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects error cells and formula headers without trusting cached results", async () => {
    const result = await workbook(book =>
      book.addWorksheet("Products").addRows([
        ["name", "price"],
        ["Test", { error: "#VALUE!" }],
      ])
    );
    expect(
      result.rows[0].issues.some(issue => issue.code === "unsupported_cell")
    ).toBe(true);
    const header = await workbook(book =>
      book.addWorksheet("Products").addRows([
        [{ formula: '"name"', result: "name" }, "price"],
        ["Test", 1],
      ])
    );
    expect(header.issues.some(issue => issue.code === "formula")).toBe(true);
    expect(header.valid).toBe(0);
  });
  it("rejects a nonexistent sheet", async () => {
    await expect(
      workbook(
        book =>
          book.addWorksheet("Products").addRows([
            ["name", "price"],
            ["Test", 1],
          ]),
        { sheet: 1 }
      )
    ).rejects.toMatchObject({ reason: "sheet_missing" });
  });
  it.each(["garbage", "UEs=", "data:application/zip;base64,UEs="])(
    "rejects invalid base64/ZIP %j",
    async fileBase64 => {
      await expect(
        previewProductImport({
          format: "xlsx",
          fileName: "p.xlsx",
          currency: "SAR",
          fileBase64,
        })
      ).rejects.toMatchObject({ reason: "xlsx_invalid" });
    }
  );
  it("enforces Excel dimension and sheet bounds", async () => {
    await expect(
      workbook(book => {
        const sheet = book.addWorksheet("Products");
        sheet.addRow(["name", "price"]);
        sheet.getCell("A5002").value = "Test";
      })
    ).rejects.toMatchObject({ reason: "row_limit" });
    await expect(
      workbook(book => {
        const sheet = book.addWorksheet("Products");
        sheet.getRow(1).getCell(61).value = "Header";
      })
    ).rejects.toMatchObject({ reason: "column_limit" });
    await expect(
      workbook(book => {
        for (let i = 0; i < 21; i++) book.addWorksheet(`Sheet ${i}`);
      })
    ).rejects.toMatchObject({ reason: "sheet_limit" });
  });
});
