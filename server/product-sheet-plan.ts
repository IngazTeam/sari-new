import { z } from "zod";
import { createHash } from "node:crypto";
import {
  productSheetSnapshot,
  productSheetMatchMode,
  productSheetCatalogItem,
  productSheetPlan,
  type ProductSheetSnapshot,
} from "../shared/product-sheet-import";
import { productImportFields } from "../shared/product-import";
import { productEditableFields } from "../shared/product-editor";
import { majorToMinor } from "../shared/product-money";
type Item = z.infer<typeof productSheetCatalogItem>;
type Mode = z.infer<typeof productSheetMatchMode>;
type Row = z.infer<typeof productSheetPlan>["rows"][number];
const key = (v: string | null) => v?.trim().toLocaleLowerCase("en-US") ?? "";
function index(catalog: unknown) {
  const items = z.array(productSheetCatalogItem).max(20000).parse(catalog);
  if (new Set(items.map(i => i.id)).size !== items.length)
    throw Error("Duplicate catalog identity");
  if (
    items.some(
      i => i.fields && (i.name !== i.fields.name || i.sku !== i.fields.sku)
    )
  )
    throw Error("Inconsistent catalog identity");
  const names = new Map<string, Item[]>(),
    skus = new Map<string, Item[]>();
  for (const item of items)
    for (const [map, k] of [
      [names, key(item.name)],
      [skus, key(item.sku)],
    ] as const)
      if (k) {
        const group = map.get(k);
        if (group) group.push(item);
        else map.set(k, [item]);
      }
  return { names, skus };
}
const matches = (
  fields: ProductSheetSnapshot["preview"]["rows"][number]["fields"],
  mode: Mode,
  idx: ReturnType<typeof index>
) =>
  !fields || mode === "create_only"
    ? []
    : ((mode === "sku"
        ? idx.skus.get(key(fields.sku))
        : idx.names.get(key(fields.name))) ?? []);
/** Resolve only candidate IDs first so the database adapter need not load every description. */
export function productSheetTargetIds(
  raw: unknown,
  rawMode: unknown,
  catalog: unknown
) {
  const snapshot = productSheetSnapshot.parse(raw),
    mode = productSheetMatchMode.parse(rawMode),
    idx = index(catalog);
  return Array.from(
    new Set(
      snapshot.preview.rows.flatMap(row => {
        const found = matches(row.fields, mode, idx);
        return found.length === 1 ? [found[0].id] : [];
      })
    )
  ).sort((a, b) => a - b);
}
const same = (field: string, a: unknown, b: unknown) =>
  ["price", "compareAtPrice", "costPrice"].includes(field) &&
  a !== null &&
  b !== null
    ? majorToMinor(String(a)) === majorToMinor(String(b))
    : a === b;
export function planProductSheet(
  raw: unknown,
  rawMode: unknown,
  catalog: unknown
) {
  const snapshot = productSheetSnapshot.parse(raw),
    mode = productSheetMatchMode.parse(rawMode),
    idx = index(catalog);
  const mapped = Array.from(
    new Set(snapshot.preview.headers.flatMap(h => (h.field ? [h.field] : [])))
  );
  const rows: Row[] = snapshot.preview.rows.map(row => {
    const fields = row.fields,
      found = matches(fields, mode, idx),
      target = found.length === 1 ? found[0] : null;
    const result: Row = {
      number: row.number,
      action: "blocked",
      productId: target?.id ?? null,
      expectedDigest: target?.digest ?? null,
      before: target?.fields ?? null,
      after: null,
      changes: [],
      issues: [],
      warnings: [],
    };
    if (!fields || snapshot.preview.issues.length) {
      result.issues.push("invalid_row");
      return result;
    }
    if (mode === "sku" && !key(fields.sku)) {
      result.issues.push("missing_key");
      return result;
    }
    if (found.length > 1) {
      result.issues.push("ambiguous_match");
      return result;
    }
    const skuOwners = key(fields.sku)
      ? (idx.skus.get(key(fields.sku)) ?? [])
      : [];
    if (skuOwners.some(p => p.id !== target?.id)) {
      result.issues.push("existing_sku");
      return result;
    }
    if (!target) {
      result.action = "create";
      result.after = fields;
      result.changes = [...productImportFields];
      if (idx.names.has(key(fields.name)))
        result.warnings.push("existing_name");
      return result;
    }
    if (target.locked) {
      result.issues.push("source_locked");
      return result;
    }
    if (!target.fields || !target.digest) {
      result.issues.push("current_fields_invalid");
      return result;
    }
    if (fields.currency !== target.fields.currency) {
      result.issues.push("currency_mismatch");
      return result;
    }
    if (
      mapped.includes("category") &&
      target.fields.categoryId !== null &&
      fields.category !== target.fields.category
    ) {
      result.issues.push("category_linked");
      return result;
    }
    const after = productEditableFields.parse({
      ...target.fields,
      ...Object.fromEntries(mapped.map(field => [field, fields[field]])),
    });
    result.changes = mapped.filter(
      field => !same(field, target.fields![field], after[field])
    );
    // Equivalent money formatting must not look like an unreported field change.
    for (const field of ["price", "compareAtPrice", "costPrice"] as const)
      if (same(field, target.fields[field], after[field]))
        after[field] = target.fields[field] as never;
    result.after = after;
    result.action = result.changes.length ? "update" : "unchanged";
    return result;
  });
  const byTarget = new Map<number, Row[]>(),
    byNewKey = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.productId !== null) {
      const group = byTarget.get(row.productId);
      if (group) group.push(row);
      else byTarget.set(row.productId, [row]);
    } else if (row.after && mode !== "create_only") {
      const k = mode === "sku" ? key(row.after.sku) : key(row.after.name);
      if (k) {
        const group = byNewKey.get(k);
        if (group) group.push(row);
        else byNewKey.set(k, [row]);
      }
    }
  }
  for (const group of Array.from(byTarget.values()).concat(
    Array.from(byNewKey.values())
  ))
    if (group.length > 1)
      for (const row of group) {
        row.action = "blocked";
        row.after = null;
        row.changes = [];
        if (!row.issues.includes("duplicate_match"))
          row.issues.push("duplicate_match");
      }
  const counts = { create: 0, update: 0, unchanged: 0, blocked: 0 };
  for (const row of rows) counts[row.action]++;
  const result = { mode, sourceDigest: snapshot.digest, rows, counts };
  return productSheetPlan.parse({
    ...result,
    digest: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
  });
}
