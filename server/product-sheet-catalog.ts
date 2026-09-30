import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { productEditableFields } from "../shared/product-editor";
import { productImportFields } from "../shared/product-import";
import { productSheetCatalogItem } from "../shared/product-sheet-import";
import { requireMinor, verifiedProductMoney } from "../shared/product-money";
import { productEditorStore as store } from "./product-editor";
import { catalogVisibleSql } from "./integrations/catalog-scope";
import { productSheetTargetIds } from "./product-sheet-plan";
export class ProductSheetCatalogLimit extends Error {}
const decimal = (value: unknown) => {
  const n = requireMinor(value);
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
};
export function productSheetCurrentFields(product: Record<string, unknown>) {
  try {
    verifiedProductMoney(product as any);
    const result = Object.fromEntries(
      productImportFields.map(k => [k, product[k]])
    );
    for (const k of ["price", "compareAtPrice", "costPrice"] as const)
      result[k] = product[k] == null ? null : decimal(product[k]);
    return productEditableFields.parse({
      ...result,
      categoryId: product.categoryId,
    });
  } catch {
    return null;
  }
}
/** Include hidden/external products for collisions, but only load editable fields for matched local products. */
export async function readProductSheetCatalog(
  c: PoolConnection,
  merchantId: number,
  snapshot: unknown,
  mode: unknown,
  lock: boolean
) {
  const [rows] = await c.execute<any[]>(
    `SELECT p.id,p.name,p.sku,
    (COALESCE(p.sallaProductId,'')<>'' OR NOT ${catalogVisibleSql("p")}
    OR EXISTS(SELECT 1 FROM woocommerce_products w WHERE w.product_id=p.id)
    OR EXISTS(SELECT 1 FROM zid_products z WHERE z.sari_product_id=p.id)
    OR EXISTS(SELECT 1 FROM salla_product_projections s WHERE s.local_product_id=p.id)) AS source_locked
    FROM products p WHERE p.merchantId=? ORDER BY p.id LIMIT 20001${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  if (rows.length > 20000) throw new ProductSheetCatalogLimit();
  const items = z
    .array(productSheetCatalogItem)
    .parse(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        locked: !!Number(r.source_locked),
        fields: null,
        digest: null,
      }))
    );
  const byId = new Map(items.map(i => [i.id, i]));
  for (const id of productSheetTargetIds(snapshot, mode, items)) {
    const item = byId.get(id)!;
    if (item.locked) continue;
    const current = await store.snapshot(c, merchantId, id, lock);
    item.locked = current.external;
    item.digest = current.digest;
    item.fields = productSheetCurrentFields(current.product);
  }
  return items;
}
