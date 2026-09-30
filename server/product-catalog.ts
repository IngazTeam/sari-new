import { and, desc, eq, sql } from "drizzle-orm";
import { merchants, products } from "../drizzle/schema";
import { productCatalogInput } from "../shared/product-catalog";
import { getDb } from "./db/connection";
import { catalogVisibleSql } from "./integrations/catalog-scope";

function count(value: unknown): number {
  const parsed = Number(value);
  if (
    (typeof value !== "number" &&
      (typeof value !== "string" || !/^\d+$/.test(value))) ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  )
    throw Error("Invalid catalog count");
  return parsed;
}

/** One read-only snapshot for the merchant, visible catalog counters and selected page. */
export async function readProductCatalog(
  merchantId: number,
  raw?: unknown,
  now = new Date()
) {
  const selection = productCatalogInput.parse(raw);
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isFinite(now.getTime())
  )
    throw Error("Invalid catalog scope");
  const db = await getDb();
  if (!db) throw Error("Catalog storage unavailable");
  return db.transaction(
    async tx => {
      const [merchant] = await tx
        .select({
          id: merchants.id,
          currency: merchants.currency,
          integrationSource: merchants.integrationSource,
        })
        .from(merchants)
        .where(eq(merchants.id, merchantId));
      if (!merchant || merchant.id !== merchantId)
        throw Error("Catalog merchant unavailable");

      const visible = and(
        eq(products.merchantId, merchantId),
        sql.raw(catalogVisibleSql())
      );
      const verified = sql`(${products.priceUnit}='minor' AND ${products.price}>=0 AND ${products.currency} IN ('SAR','USD'))`;
      const out = sql`(${products.trackInventory}=1 AND ${products.stock}=0)`;
      const low = sql`(${products.trackInventory}=1 AND ${products.stock}>0 AND ${products.lowStockAlert}>=0 AND ${products.stock}<=${products.lowStockAlert})`;
      const untracked = eq(products.trackInventory, 0);
      const unknown = sql`(${products.trackInventory} NOT IN (0,1) OR (${products.trackInventory}=1 AND (${products.stock} IS NULL OR ${products.stock}<0)))`;
      const inventory = { all: undefined, out, low, untracked, unknown }[
        selection.inventory
      ];
      const searched = selection.search
        ? sql`(LOCATE(${selection.search},${products.name})>0
      OR LOCATE(${selection.search},COALESCE(${products.nameAr},''))>0
      OR LOCATE(${selection.search},COALESCE(${products.description},''))>0
      OR LOCATE(${selection.search},COALESCE(${products.category},''))>0
      OR LOCATE(${selection.search},COALESCE(${products.sku},''))>0
      OR LOCATE(${selection.search},COALESCE(${products.barcode},''))>0)`
        : undefined;
      const filtered = and(
        visible,
        searched,
        inventory,
        selection.status === "all"
          ? undefined
          : eq(products.status, selection.status),
        selection.price === "all"
          ? undefined
          : selection.price === "verified"
            ? verified
            : sql`NOT ${verified}`
      );
      const [summary] = await tx
        .select({
          all: sql`COUNT(*)`,
          out: sql`COALESCE(SUM(${out}),0)`,
          low: sql`COALESCE(SUM(${low}),0)`,
          untracked: sql`COALESCE(SUM(${untracked}),0)`,
          unknown: sql`COALESCE(SUM(${unknown}),0)`,
          priceReview: sql`COALESCE(SUM(NOT ${verified}),0)`,
        })
        .from(products)
        .where(visible);
      const [matching] = await tx
        .select({ total: sql`COUNT(*)` })
        .from(products)
        .where(filtered);
      const total = count(matching?.total);
      const items = await tx
        .select()
        .from(products)
        .where(filtered)
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(selection.pageSize)
        .offset((selection.page - 1) * selection.pageSize);
      if (items.some(item => item.merchantId !== merchantId))
        throw Error("Catalog scope mismatch");
      return {
        merchantId,
        readAt: now.toISOString(),
        selection,
        currency: merchant.currency,
        integrationSource: merchant.integrationSource,
        items,
        total,
        page: selection.page,
        pageSize: selection.pageSize,
        totalPages: Math.ceil(total / selection.pageSize),
        summary: {
          all: count(summary.all),
          out: count(summary.out),
          low: count(summary.low),
          untracked: count(summary.untracked),
          unknown: count(summary.unknown),
          priceReview: count(summary.priceReview),
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
