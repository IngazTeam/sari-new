import { getPool } from "./db/connection";
import { catalogVisibleSql } from "./integrations/catalog-scope";
import {
  productStockInput,
  productStockSnapshot,
} from "../shared/product-stock";

// Static identifiers only. Parent visibility and tenant identity apply to every variant.
const source = `WITH visible AS (
  SELECT p.id,p.merchantId,p.name,p.sku,p.stock,p.low_stock_alert,p.has_variants
  FROM products p WHERE p.merchantId=? AND ${catalogVisibleSql("p")}
    AND p.status='active' AND p.isActive=1 AND p.track_inventory=1 AND p.product_type='physical'
), stock_rows AS (
  SELECT p.merchantId,p.id AS productId,NULL AS variantId,'product' AS kind,p.name AS productName,p.name,p.sku,p.stock,p.low_stock_alert AS threshold,NULL AS issue
  FROM visible p WHERE p.has_variants=0
  UNION ALL
  SELECT p.merchantId,p.id,v.id,'variant',p.name,v.name,v.sku,v.stock,p.low_stock_alert,NULL
  FROM visible p JOIN product_variants v ON v.product_id=p.id AND v.merchant_id=p.merchantId AND v.is_active=1 WHERE p.has_variants=1
  UNION ALL
  SELECT p.merchantId,p.id,NULL,'product',p.name,p.name,p.sku,NULL,p.low_stock_alert,
    CASE WHEN p.has_variants=1 THEN 'no_available_variants' ELSE 'invalid_variant_setup' END
  FROM visible p WHERE p.has_variants NOT IN (0,1) OR (p.has_variants=1 AND NOT EXISTS (
    SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.merchant_id=p.merchantId AND v.is_active=1))
), classified AS (
  SELECT merchantId,productId,variantId,kind,productName,name,sku,stock,threshold,
    COALESCE(issue,CASE WHEN stock IS NULL OR stock<0 THEN 'stock_unknown' ELSE NULL END) AS issue,
    CASE WHEN issue IS NOT NULL OR stock IS NULL OR stock<0 THEN 'unknown' WHEN stock=0 THEN 'out'
      WHEN stock>0 AND threshold>=stock THEN 'low' ELSE 'available' END AS state
  FROM stock_rows
), attention AS (SELECT * FROM classified WHERE state<>'available')`;
const integer = (raw: unknown) => {
  if (
    (typeof raw !== "number" &&
      (typeof raw !== "string" || !/^\d+$/.test(raw))) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 0
  )
    throw Error("Invalid stock count");
  return Number(raw);
};
export async function readProductStock(
  merchantId: number,
  raw?: unknown,
  now = new Date()
) {
  const selection = productStockInput.parse(raw);
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    merchantId > 2147483647 ||
    !Number.isFinite(now.getTime())
  )
    throw Error("Invalid stock scope");
  const pool = await getPool();
  if (!pool) throw Error("Stock storage unavailable");
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const [merchants] = await c.execute<any[]>(
      "SELECT id FROM merchants WHERE id=?",
      [merchantId]
    );
    if (merchants.length !== 1 || merchants[0].id !== merchantId)
      throw Error("Stock merchant unavailable");
    const [summaryRows] = await c.execute<any[]>(
      `${source} SELECT COUNT(*) AS total,COALESCE(SUM(state='out'),0) AS outCount,COALESCE(SUM(state='low'),0) AS lowCount,COALESCE(SUM(state='unknown'),0) AS unknownCount FROM attention`,
      [merchantId]
    );
    const where =
      " WHERE (?='all' OR kind=?) AND (?='all' OR state=?) AND (?='' OR LOCATE(?,productName)>0 OR LOCATE(?,name)>0 OR LOCATE(?,COALESCE(sku,''))>0)";
    const params = [
      merchantId,
      selection.kind,
      selection.kind,
      selection.state,
      selection.state,
      selection.search,
      selection.search,
      selection.search,
      selection.search,
    ];
    const [counts] = await c.execute<any[]>(
      `${source} SELECT COUNT(*) AS total FROM attention${where}`,
      params
    );
    // These numeric bounds are schema validated; mysql prepared LIMIT typing differs by driver.
    const [items] = await c.execute<any[]>(
      `${source} SELECT * FROM attention${where} ORDER BY FIELD(state,'unknown','out','low'),productId,COALESCE(variantId,0) LIMIT ${selection.pageSize} OFFSET ${(selection.page - 1) * selection.pageSize}`,
      params
    );
    const total = integer(counts[0]?.total),
      summary = summaryRows[0];
    const result = productStockSnapshot.parse({
      merchantId,
      readAt: now.toISOString(),
      selection,
      items,
      total,
      totalPages: Math.ceil(total / selection.pageSize),
      summary: {
        total: integer(summary?.total),
        out: integer(summary?.outCount),
        low: integer(summary?.lowCount),
        unknown: integer(summary?.unknownCount),
      },
    });
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
