import { z } from "zod";
import { createHash } from "node:crypto";
import { productSheetGrid } from "../shared/product-sheet-grid";
import {
  sheetInventoryOptions,
  sheetInventoryPreview,
  sheetInventoryCatalogItem,
  sheetInventoryPlan,
  type sheetInventoryIssue,
} from "../shared/product-sheet-inventory";
export class SheetInventoryEmpty extends Error {}
type Issue = z.infer<typeof sheetInventoryIssue>;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const integer = (raw: string, minimum: number) => {
  const value = raw
    .trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= minimum && n <= 2147483647 ? n : null;
};
const names = {
  productId: new Set([
    "id",
    "product id",
    "productid",
    "product_id",
    "رقم المنتج",
    "معرف المنتج",
    "معرّف المنتج",
  ]),
  stock: new Set([
    "stock",
    "quantity",
    "الكمية",
    "المخزون",
    "كمية",
    "الكمية المسجلة",
  ]),
};
/** Stock-only source interpretation: no price conversion, product creation, name matching or writes. */
export function previewSheetInventory(raw: unknown, rawOptions: unknown = {}) {
  const grid = productSheetGrid.parse(raw),
    options = sheetInventoryOptions.parse(rawOptions),
    headers = grid.rows[0]?.cells ?? [],
    issues: ("missing_mapping" | "ambiguous_mapping")[] = [];
  const mapping: { productId: number | null; stock: number | null } = {
    productId: null,
    stock: null,
  };
  for (const field of ["productId", "stock"] as const) {
    if (options.mapping) {
      mapping[field] = options.mapping[field];
      if (
        mapping[field] >= grid.coveredColumns ||
        mapping[field] >= headers.length
      )
        issues.push("missing_mapping");
    } else {
      const matches = headers.flatMap((h, i) =>
        !h.issue &&
        !h.boolean &&
        names[field].has(h.text.trim().toLowerCase().replace(/\s+/g, " "))
          ? [i]
          : []
      );
      if (matches.length === 1) mapping[field] = matches[0];
      else
        issues.push(matches.length ? "ambiguous_mapping" : "missing_mapping");
    }
    const header = mapping[field] === null ? null : headers[mapping[field]!];
    if (header?.issue || header?.boolean) issues.push("missing_mapping");
  }
  const globalIssues = Array.from(new Set(issues));
  const rows = grid.rows
    .slice(1)
    .filter(row => row.cells.some(c => c.text.trim() || c.issue || c.boolean))
    .map(row => {
      const rowIssues: Issue[] = [...globalIssues];
      const parse = (field: "productId" | "stock") => {
        const col = mapping[field],
          c = col === null ? null : row.cells[col];
        if (c?.issue) rowIssues.push(c.issue);
        else if (c?.boolean) rowIssues.push("unsupported_cell");
        else if (!c?.text.trim())
          rowIssues.push(
            field === "productId" ? "missing_id" : "missing_stock"
          );
        else {
          const value = integer(c.text, field === "productId" ? 1 : 0);
          if (value !== null) return value;
          rowIssues.push(
            field === "productId" ? "invalid_id" : "invalid_stock"
          );
        }
        return null;
      };
      const productId = parse("productId"),
        stock = parse("stock");
      return { ...row, productId, stock, issues: Array.from(new Set(rowIssues)) };
    });
  if (!rows.length) throw new SheetInventoryEmpty();
  const ids = new Map<number, number>();
  for (const row of rows)
    if (row.productId !== null)
      ids.set(row.productId, (ids.get(row.productId) ?? 0) + 1);
  for (const row of rows)
    if (row.productId !== null && ids.get(row.productId)! > 1)
      row.issues.push("duplicate_product");
  const { rows: _, ...snapshot } = grid;
  return sheetInventoryPreview.parse({
    kind: "sheet_inventory",
    snapshot,
    headers,
    mapping,
    issues: globalIssues,
    rows,
    digest: hash({
      grid: { ...grid, readAt: null },
      mapping,
      issues: globalIssues,
    }),
  });
}
/** The catalog is a bounded list already resolved for the current tenant, including externally managed IDs. */
export function planSheetInventory(raw: unknown, rawCatalog: unknown) {
  const source = sheetInventoryPreview.parse(raw),
    items = z.array(sheetInventoryCatalogItem).max(20000).parse(rawCatalog);
  if (new Set(items.map(p => p.id)).size !== items.length)
    throw Error("Duplicate inventory identity");
  const byId = new Map(items.map(p => [p.id, p]));
  const rows = source.rows.map(row => {
    const item = row.productId === null ? null : byId.get(row.productId),
      issues: Issue[] = [...row.issues];
    if (row.productId !== null && !item) issues.push("product_missing");
    if (item?.locked) issues.push("source_locked");
    if (item && !item.stockValid) issues.push("current_stock_invalid");
    const blocked = issues.length > 0;
    return {
      number: row.number,
      productId: row.productId,
      name: item?.name ?? null,
      before: item?.stock ?? null,
      after: blocked ? null : row.stock,
      expectedDigest: item?.digest ?? null,
      action: blocked
        ? "blocked"
        : item?.stock === row.stock
          ? "unchanged"
          : "update",
      issues: Array.from(new Set(issues)),
    };
  });
  const counts = {
    update: rows.filter(r => r.action === "update").length,
    unchanged: rows.filter(r => r.action === "unchanged").length,
    blocked: rows.filter(r => r.action === "blocked").length,
  };
  const plan = { sourceDigest: source.digest, rows, counts };
  return sheetInventoryPlan.parse({ ...plan, digest: hash(plan) });
}
