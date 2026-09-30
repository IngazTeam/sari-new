import { createHash } from "node:crypto";
import {
  productImportInput,
  productImportFields,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_MAX_COLUMNS,
  type ProductImportField,
  type ProductImportIssue,
  type ProductImportInput,
} from "../shared/product-import";
import { productEditableFields } from "../shared/product-editor";
import {
  assertOfficeOpenXml,
  decodeCanonicalBase64Upload,
} from "./security/upload-validation";
import type { z } from "zod";

export class ProductImportFileError extends Error {
  constructor(
    public readonly reason:
      | "file_type"
      | "file_size"
      | "csv_syntax"
      | "row_limit"
      | "column_limit"
      | "cell_limit"
      | "empty_file"
      | "sheet_missing"
      | "sheet_limit"
      | "xlsx_invalid"
  ) {
    super(reason);
    this.name = "ProductImportFileError";
  }
}
type Cell = { text: string; issue?: "formula" | "unsupported_cell" };
type Row = { number: number; cells: Cell[] };
type Sheet = { index: number; name: string; hidden: boolean; rows: number };
const aliases: Record<ProductImportField, string[]> = {
  name: [
    "name",
    "product name",
    "title",
    "الاسم",
    "اسم",
    "اسم المنتج",
    "اسم الخدمة",
    "اسم الدورة",
    "العنوان",
  ],
  description: [
    "description",
    "product description",
    "الوصف",
    "وصف",
    "وصف المنتج",
    "وصف الخدمة",
    "وصف الدورة",
    "التفاصيل",
  ],
  price: [
    "price",
    "unit price",
    "السعر",
    "سعر",
    "سعر الوحدة",
    "سعر المنتج",
    "سعر الخدمة",
    "رسوم",
  ],
  currency: ["currency", "العملة", "عملة"],
  imageUrl: ["imageurl", "image url", "image", "رابط الصورة", "الصورة"],
  stock: ["stock", "quantity", "الكمية", "المخزون", "كمية", "seats", "المقاعد"],
  sku: ["sku", "رمز الصنف", "رمز المنتج"],
  barcode: ["barcode", "الباركود", "باركود"],
  compareAtPrice: [
    "compareatprice",
    "compare at price",
    "سعر المقارنة",
    "السعر قبل الخصم",
  ],
  costPrice: ["costprice", "cost price", "cost", "التكلفة"],
  weight: ["weight", "الوزن"],
  category: ["category", "التصنيف", "الفئة"],
  tags: ["tags", "الوسوم"],
  productType: ["producttype", "product type", "نوع المنتج"],
  status: ["status", "الحالة"],
  lowStockAlert: ["lowstockalert", "low stock alert", "حد تنبيه المخزون"],
  trackInventory: ["trackinventory", "track inventory", "تتبع المخزون"],
};
const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
const headerFields = new Map(
  Object.entries(aliases).flatMap(([field, names]) =>
    names.map(
      name => [normalizeHeader(name), field as ProductImportField] as const
    )
  )
);
const nonempty = (row: Row) =>
  row.cells.some(cell => cell.issue || cell.text.trim());
const limitCell = (text: string) => {
  if (text.length > 16000) throw new ProductImportFileError("cell_limit");
  return text;
};

/** CSV records preserve physical starting lines, quoted line breaks and escaped quotes. */
export function parseProductCsv(
  text: string,
  delimiter: "," | ";" | "\t"
): Row[] {
  if (Buffer.byteLength(text, "utf8") > 5 * 1024 * 1024)
    throw new ProductImportFileError("file_size");
  text = text.replace(/^\uFEFF/, "");
  const rows: Row[] = [];
  let cells: Cell[] = [],
    value = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const cell = () => {
    cells.push({ text: limitCell(value) });
    if (cells.length > PRODUCT_IMPORT_MAX_COLUMNS)
      throw new ProductImportFileError("column_limit");
    value = "";
    closed = false;
  };
  const row = () => {
    cell();
    const next = { number: start, cells };
    if (nonempty(next)) rows.push(next);
    if (rows.length > PRODUCT_IMPORT_MAX_ROWS + 1)
      throw new ProductImportFileError("row_limit");
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += char;
        if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) line++;
      }
      if (value.length > 16000) throw new ProductImportFileError("cell_limit");
      continue;
    }
    if (char === delimiter) {
      cell();
      continue;
    }
    if (char === "\n" || char === "\r") {
      row();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
      continue;
    }
    if (closed) {
      if (char === " " || char === "\t") continue;
      throw new ProductImportFileError("csv_syntax");
    }
    if (char === '"') {
      if (value !== "") throw new ProductImportFileError("csv_syntax");
      quoted = true;
    } else value += char;
    if (value.length > 16000) throw new ProductImportFileError("cell_limit");
  }
  if (quoted) throw new ProductImportFileError("csv_syntax");
  if (value || cells.length || closed) row();
  return rows;
}
async function parseXlsx(
  input: Extract<ProductImportInput, { format: "xlsx" }>
): Promise<{ rows: Row[]; sheets: Sheet[] }> {
  let buffer: Buffer;
  try {
    buffer = decodeCanonicalBase64Upload(input.fileBase64, 10 * 1024 * 1024);
    assertOfficeOpenXml(buffer, "xlsx");
  } catch {
    throw new ProductImportFileError("xlsx_invalid");
  }
  const ExcelJS = (await import("exceljs")).default,
    book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer as any);
  } catch {
    throw new ProductImportFileError("xlsx_invalid");
  }
  if (book.worksheets.length > 20)
    throw new ProductImportFileError("sheet_limit");
  const sheets = book.worksheets.map((sheet, index) => ({
      index,
      name: sheet.name,
      hidden: sheet.state !== "visible",
      rows: sheet.actualRowCount,
    })),
    sheet = book.worksheets[input.sheet];
  if (!sheet) throw new ProductImportFileError("sheet_missing");
  if (sheet.rowCount > PRODUCT_IMPORT_MAX_ROWS + 1)
    throw new ProductImportFileError("row_limit");
  if (sheet.columnCount > PRODUCT_IMPORT_MAX_COLUMNS)
    throw new ProductImportFileError("column_limit");
  const rows: Row[] = [];
  sheet.eachRow((row, number) => {
    const cells: Cell[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      const value = row.getCell(column).value;
      let cell: Cell;
      if (value == null) cell = { text: "" };
      else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        cell = { text: String(value) };
      else if (value instanceof Date) cell = { text: value.toISOString() };
      else if ("formula" in value || "sharedFormula" in value)
        cell = { text: "", issue: "formula" };
      else if ("richText" in value)
        cell = { text: value.richText.map(part => part.text).join("") };
      else if ("hyperlink" in value) cell = { text: value.text };
      else cell = { text: "", issue: "unsupported_cell" };
      limitCell(cell.text);
      cells.push(cell);
    }
    const parsed = { number, cells };
    if (nonempty(parsed)) rows.push(parsed);
  });
  return { rows, sheets };
}
export type ProductImportRow = {
  number: number;
  values: string[];
  fields: z.infer<typeof productEditableFields> | null;
  issues: ProductImportIssue[];
};
export type ProductImportPreview = {
  fileName: string;
  format: "csv" | "xlsx";
  digest: string;
  currency: "SAR" | "USD";
  productType: ProductImportInput["productType"];
  status: ProductImportInput["status"];
  sheets: Sheet[];
  sheet: number | null;
  headers: {
    column: number;
    label: string;
    field: ProductImportField | null;
  }[];
  issues: ProductImportIssue[];
  rows: ProductImportRow[];
  total: number;
  valid: number;
  invalid: number;
};
export async function previewProductImport(
  raw: unknown
): Promise<ProductImportPreview> {
  const input = productImportInput.parse(raw);
  if (!new RegExp(`\\.${input.format}$`, "i").test(input.fileName))
    throw new ProductImportFileError("file_type");
  const parsed =
    input.format === "csv"
      ? {
          rows: parseProductCsv(input.csvData, input.delimiter),
          sheets: [] as Sheet[],
        }
      : await parseXlsx(input);
  if (parsed.rows.length < 2) throw new ProductImportFileError("empty_file");
  const [header, ...body] = parsed.rows,
    width = Math.max(header.cells.length, ...body.map(row => row.cells.length));
  if (width > PRODUCT_IMPORT_MAX_COLUMNS)
    throw new ProductImportFileError("column_limit");
  const headers = Array.from({ length: width }, (_, column) => ({
    column,
    label: header.cells[column]?.text.trim() || "",
    field: input.mapping
      ? (input.mapping.find(value => value.column === column)?.field ?? null)
      : (headerFields.get(normalizeHeader(header.cells[column]?.text ?? "")) ??
        null),
  }));
  const issues: ProductImportIssue[] = [];
  const byField = new Map<ProductImportField, number>();
  for (const entry of headers) {
    if (entry.field) {
      if (byField.has(entry.field))
        issues.push({
          code: "duplicate_mapping",
          field: entry.field,
          column: entry.column,
        });
      else byField.set(entry.field, entry.column);
    }
    if (header.cells[entry.column]?.issue)
      issues.push({
        code: header.cells[entry.column].issue!,
        field: entry.field,
        column: entry.column,
      });
  }
  for (const field of ["name", "price"] as const)
    if (!byField.has(field))
      issues.push({ code: "missing_mapping", field, column: null });
  for (const entry of input.mapping ?? [])
    if (entry.column >= width)
      issues.push({
        code: "unknown_column",
        field: entry.field,
        column: entry.column,
      });
  const rows: ProductImportRow[] = body.map(row => {
    const rowIssues: ProductImportIssue[] = [],
      values = Array.from(
        { length: width },
        (_, column) => row.cells[column]?.text ?? ""
      );
    const fields: Record<string, unknown> = {
      name: "",
      description: null,
      price: "",
      currency: input.currency,
      imageUrl: null,
      stock: null,
      sku: null,
      barcode: null,
      compareAtPrice: null,
      costPrice: null,
      weight: null,
      category: null,
      categoryId: null,
      tags: null,
      productType: input.productType,
      status: input.status,
      lowStockAlert: 5,
      trackInventory: 1,
    };
    for (const [field, column] of Array.from(byField)) {
      const value = values[column].trim(),
        cellIssue = row.cells[column]?.issue;
      if (cellIssue) {
        rowIssues.push({ code: cellIssue, field, column });
        continue;
      }
      if (["stock", "lowStockAlert", "trackInventory"].includes(field)) {
        fields[field] =
          value === ""
            ? field === "trackInventory"
              ? 1
              : null
            : /^\d+$/.test(value)
              ? Number(value)
              : value;
      } else if (value === "")
        fields[field] = ["name", "price"].includes(field)
          ? ""
          : ["currency", "productType", "status"].includes(field)
            ? fields[field]
            : null;
      else fields[field] = value;
    }
    if (!fields.name)
      rowIssues.push({
        code: "missing_name",
        field: "name",
        column: byField.get("name") ?? null,
      });
    if (!fields.price)
      rowIssues.push({
        code: "missing_price",
        field: "price",
        column: byField.get("price") ?? null,
      });
    const validated = productEditableFields.safeParse(fields);
    if (!validated.success)
      for (const issue of validated.error.issues) {
        const field = issue.path[0] as ProductImportField;
        if (!rowIssues.some(value => value.field === field))
          rowIssues.push({
            code: "invalid_value",
            field: productImportFields.includes(field) ? field : null,
            column: byField.get(field) ?? null,
          });
      }
    return {
      number: row.number,
      values,
      fields:
        validated.success && !rowIssues.length && !issues.length
          ? validated.data
          : null,
      issues: rowIssues,
    };
  });
  const skus = new Map<string, ProductImportRow[]>();
  for (const row of rows) {
    const column = byField.get("sku"),
      sku =
        column === undefined
          ? ""
          : row.values[column].trim().toLocaleLowerCase("en-US");
    if (sku) skus.set(sku, [...(skus.get(sku) ?? []), row]);
  }
  for (const duplicates of Array.from(skus.values()))
    if (duplicates.length > 1)
      for (const row of duplicates) {
        row.issues.push({
          code: "duplicate_sku",
          field: "sku",
          column: byField.get("sku")!,
        });
        row.fields = null;
      }
  const digest = createHash("sha256")
    .update(JSON.stringify({ input, headers, rows, issues }))
    .digest("hex");
  const valid = rows.filter(row => row.fields).length;
  return {
    fileName: input.fileName,
    format: input.format,
    digest,
    currency: input.currency,
    productType: input.productType,
    status: input.status,
    sheets: parsed.sheets,
    sheet: input.format === "xlsx" ? input.sheet : null,
    headers,
    issues,
    rows,
    total: rows.length,
    valid,
    invalid: rows.length - valid,
  };
}
