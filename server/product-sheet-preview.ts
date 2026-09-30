import { z } from "zod";
import { createHash } from "node:crypto";
import {
  PRODUCT_SHEET_ROWS,
  PRODUCT_SHEET_COLUMNS,
  productSpreadsheetId,
  productSheet,
  productSheetOptions,
  productSheetSnapshot,
} from "../shared/product-sheet-import";
import { previewProductImportRows } from "./product-import-preview";
export class ProductSheetReadError extends Error {
  constructor(
    public readonly reason:
      | "response_size"
      | "response_invalid"
      | "sheet_missing"
      | "sheet_type"
      | "source_changed"
      | "cell_limit"
  ) {
    super(`product_sheet:${reason}`);
  }
}
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const properties = z
  .object({
    sheetId: z.number().int().min(0),
    title: z.string(),
    hidden: z.boolean().optional(),
    sheetType: z.string().optional(),
    gridProperties: z
      .object({ rowCount: z.number().int(), columnCount: z.number().int() })
      .optional(),
  })
  .strict();
function bounded(raw: unknown) {
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    throw new ProductSheetReadError("response_invalid");
  }
  if (typeof text !== "string")
    throw new ProductSheetReadError("response_invalid");
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES)
    throw new ProductSheetReadError("response_size");
  return raw;
}
export function readProductSheetList(
  raw: unknown,
  expectedSpreadsheetId: string
) {
  const id = productSpreadsheetId.parse(expectedSpreadsheetId);
  const data = z
    .object({
      spreadsheetId: productSpreadsheetId,
      sheets: z.array(z.object({ properties }).strict()).max(100),
    })
    .strict()
    .parse(bounded(raw));
  if (data.spreadsheetId !== id)
    throw new ProductSheetReadError("source_changed");
  const ids = new Set<number>();
  return data.sheets
    .filter(s => !s.properties.sheetType || s.properties.sheetType === "GRID")
    .map(s => {
      const p = s.properties;
      if (ids.has(p.sheetId))
        throw new ProductSheetReadError("response_invalid");
      ids.add(p.sheetId);
      return productSheet.parse({
        id: p.sheetId,
        title: p.title,
        hidden: p.hidden ?? false,
        rows: p.gridProperties?.rowCount,
        columns: p.gridProperties?.columnCount,
      });
    });
}
export function productSheetRange(raw: unknown) {
  const sheet = productSheet.parse(raw),
    columns = Math.min(sheet.columns, PRODUCT_SHEET_COLUMNS);
  let n = columns,
    end = "";
  while (n > 0) {
    n--;
    end = String.fromCharCode(65 + (n % 26)) + end;
    n = Math.floor(n / 26);
  }
  return `'${sheet.title.replace(/'/g, "''")}'!A1:${end}${Math.min(sheet.rows, PRODUCT_SHEET_ROWS)}`;
}
const value = z
  .object({
    stringValue: z.string().optional(),
    numberValue: z.number().finite().optional(),
    boolValue: z.boolean().optional(),
    formulaValue: z.string().optional(),
    errorValue: z
      .object({ type: z.string().optional(), message: z.string().optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(v => Object.values(v).filter(v => v !== undefined).length <= 1);
const cell = z
  .object({
    userEnteredValue: value.optional(),
    effectiveValue: value.optional(),
    effectiveFormat: z
      .object({
        numberFormat: z
          .object({ type: z.string().optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const grid = z
  .object({
    startRow: z.number().int().min(0).optional(),
    startColumn: z.number().int().min(0).optional(),
    rowData: z
      .array(
        z
          .object({
            values: z.array(cell).max(PRODUCT_SHEET_COLUMNS).optional(),
          })
          .strict()
      )
      .max(PRODUCT_SHEET_ROWS)
      .optional(),
  })
  .strict();
export function previewProductSheet(
  raw: unknown,
  selection: {
    spreadsheetId: string;
    sheet: unknown;
    options: unknown;
    readAt: string;
  }
) {
  const spreadsheetId = productSpreadsheetId.parse(selection.spreadsheetId),
    sheet = productSheet.parse(selection.sheet),
    options = productSheetOptions.parse(selection.options);
  if (options.sheetId !== sheet.id)
    throw new ProductSheetReadError("source_changed");
  const data = z
    .object({
      spreadsheetId: productSpreadsheetId,
      sheets: z
        .array(
          z
            .object({ properties, data: z.array(grid).max(1).optional() })
            .strict()
        )
        .length(1),
    })
    .strict()
    .parse(bounded(raw));
  const selected = data.sheets[0],
    p = selected.properties;
  if (
    data.spreadsheetId !== spreadsheetId ||
    p.sheetId !== sheet.id ||
    p.title !== sheet.title ||
    (p.hidden ?? false) !== sheet.hidden ||
    p.gridProperties?.rowCount !== sheet.rows ||
    p.gridProperties?.columnCount !== sheet.columns
  )
    throw new ProductSheetReadError("source_changed");
  if (p.sheetType && p.sheetType !== "GRID")
    throw new ProductSheetReadError("sheet_type");
  const block = selected.data?.[0];
  if ((block?.startRow ?? 0) !== 0 || (block?.startColumn ?? 0) !== 0)
    throw new ProductSheetReadError("response_invalid");
  const coveredRows = Math.min(sheet.rows, PRODUCT_SHEET_ROWS),
    coveredColumns = Math.min(sheet.columns, PRODUCT_SHEET_COLUMNS);
  if (
    (block?.rowData?.length ?? 0) > coveredRows ||
    block?.rowData?.some(r => (r.values?.length ?? 0) > coveredColumns)
  )
    throw new ProductSheetReadError("response_invalid");
  const rows = (block?.rowData ?? []).map((row, i) => ({
    number: i + 1,
    cells: (row.values ?? []).map(c => {
      const entered = c.userEnteredValue,
        effective = c.effectiveValue,
        v = entered ?? effective;
      const formula =
        entered?.formulaValue !== undefined ||
        effective?.formulaValue !== undefined;
      const unsupported =
        !!effective?.errorValue ||
        !!entered?.errorValue ||
        ["DATE", "TIME", "DATE_TIME"].includes(
          c.effectiveFormat?.numberFormat?.type ?? ""
        );
      const text = String(
        v?.formulaValue ??
          v?.stringValue ??
          v?.numberValue ??
          (v?.boolValue === undefined ? "" : v.boolValue ? 1 : 0)
      );
      if (text.length > 16000) throw new ProductSheetReadError("cell_limit");
      return {
        text,
        ...(formula
          ? { issue: "formula" as const }
          : unsupported
            ? { issue: "unsupported_cell" as const }
            : {}),
      };
    }),
  }));
  const { sheetId, ...defaults } = options;
  const preview = previewProductImportRows(
    {
      ...defaults,
      fileName: `${sheet.title}.csv`,
      format: "csv",
      csvData: "provider grid",
      delimiter: ",",
    },
    rows
  );
  const source = {
    kind: "google_sheets" as const,
    spreadsheetId,
    sheet,
    range: productSheetRange(sheet),
    readAt: selection.readAt,
    coveredRows,
    coveredColumns,
    limitedRange: sheet.rows > coveredRows || sheet.columns > coveredColumns,
    preview,
  };
  // Include ignored/formula cells too; a changed source must change its review identity.
  const digest = createHash("sha256")
    .update(JSON.stringify({ source: { ...source, readAt: null }, rows }))
    .digest("hex");
  return productSheetSnapshot.parse({ ...source, digest });
}
