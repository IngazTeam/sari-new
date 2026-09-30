import type { PoolConnection } from "mysql2/promise";
import {
  sheetInventoryPreview,
  sheetInventoryCatalogItem,
} from "../shared/product-sheet-inventory";
import { productEditorStore as store } from "./product-editor";
import { catalogVisibleSql } from "./integrations/catalog-scope";

const validStock = (n: unknown): n is number | null =>
  n === null ||
  (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 2147483647);
/** Fetch only IDs present in the snapshot, scoped before resolving product fields. No money normalization is needed for a stock-only write. */
export async function readSheetInventoryCatalog(
  c: PoolConnection,
  merchantId: number,
  raw: unknown,
  lock: boolean
) {
  const preview = sheetInventoryPreview.parse(raw),
    ids = Array.from(
      new Set(
        preview.rows.flatMap(r => (r.productId === null ? [] : [r.productId]))
      )
    ).sort((a, b) => a - b);
  if (!ids.length) return [];
  const [rows] = await c.execute<any[]>(
    `SELECT p.id,p.name,p.stock,
    (COALESCE(p.sallaProductId,'')<>'' OR NOT ${catalogVisibleSql("p")}
    OR EXISTS(SELECT 1 FROM woocommerce_products w WHERE w.product_id=p.id)
    OR EXISTS(SELECT 1 FROM zid_products z WHERE z.sari_product_id=p.id)
    OR EXISTS(SELECT 1 FROM salla_product_projections s WHERE s.local_product_id=p.id)) AS source_locked
    FROM products p WHERE p.merchantId=? AND p.id IN (${ids.map(() => "?").join(",")}) ORDER BY p.id${lock ? " FOR UPDATE" : ""}`,
    [merchantId, ...ids]
  );
  const result = [];
  for (const row of rows) {
    let product = row,
      locked = !!Number(row.source_locked),
      digest = store.hash(row);
    if (!locked) {
      const current = await store.snapshot(c, merchantId, row.id, lock);
      product = current.product;
      locked = current.external;
      digest = current.digest;
    }
    result.push(
      sheetInventoryCatalogItem.parse({
        id: product.id,
        name: product.name,
        stock: validStock(product.stock) ? product.stock : null,
        stockValid: validStock(product.stock),
        locked,
        digest,
      })
    );
  }
  return result;
}
