import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { PoolConnection } from "mysql2/promise";
import { products, productCategories } from "../drizzle/schema";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { catalogVisibleSql } from "./integrations/catalog-scope";
import { majorToMinor } from "../shared/product-money";
import {
  productEditorReadInput,
  productEditorWrite,
  productEditorReceiptInput,
  productEditorReceipt,
  type ProductEditorReceipt,
} from "../shared/product-editor";

export class ProductEditorMissing extends Error {}
export class ProductEditorForbidden extends Error {}
export class ProductEditorConflict extends Error {}
export class ProductEditorLocked extends Error {}
export class ProductEditorInvalid extends Error {}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validId = (value: number) => {
  if (!Number.isInteger(value) || value < 1 || value > 2147483647)
    throw Error("Invalid product scope");
};
const connectionDb = (c: PoolConnection) => drizzle({ client: c });
async function transaction<T>(
  writes: boolean,
  run: (c: PoolConnection) => Promise<T>,
  serialize = false
): Promise<T> {
  if (writes)
    await assertRuntimeSchema("product editor receipts", [
      {
        table: "product_editor_receipts",
        columns: ["actor_id", "input_hash", "result"],
        uniqueIndexes: [
          {
            name: "uq_product_editor_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
    ]);
  const pool = await getPool();
  if (!pool) throw Error("Product storage unavailable");
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query(
      writes
        ? serialize
          ? "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
          : "SET TRANSACTION ISOLATION LEVEL READ COMMITTED"
        : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );
    if (!writes) await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
async function authority(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  writes: boolean
) {
  const [merchants] = await c.execute<any[]>(
    `SELECT id,userId,status,integration_source,currency FROM merchants WHERE id=?${writes ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  if (merchants.length !== 1) throw new ProductEditorMissing();
  const merchant = merchants[0];
  const [users] = await c.execute<any[]>(
    `SELECT account_status FROM users WHERE id=?${writes ? " FOR SHARE" : ""}`,
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    `SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=?${writes ? " FOR SHARE" : ""}`,
    [merchantId, actorId]
  );
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(merchant.userId) === actorId
        ? "owner"
        : null;
  if (
    merchant.status === "suspended" ||
    users[0]?.account_status !== "active" ||
    !role ||
    !hasPermission(
      role as MerchantRole,
      writes ? "products.manage" : "conversations.read"
    )
  )
    throw new ProductEditorForbidden();
  return {
    ...merchant,
    canManage: hasPermission(role as MerchantRole, "products.manage"),
  };
}
async function snapshot(
  c: PoolConnection,
  merchantId: number,
  productId: number,
  lock: boolean
) {
  const query = connectionDb(c)
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.merchantId, merchantId),
        sql.raw(catalogVisibleSql())
      )
    );
  const rows = await (lock ? query.for("update") : query);
  if (rows.length !== 1) throw new ProductEditorMissing();
  const product = rows[0];
  // An external identifier/projection stays managed by its source even if the global setting is cleared.
  const [linked] = await c.execute<any[]>(
    `SELECT
    EXISTS(SELECT 1 FROM woocommerce_products WHERE product_id=?) AS woo,
    EXISTS(SELECT 1 FROM zid_products WHERE sari_product_id=?) AS zid,
    EXISTS(SELECT 1 FROM salla_product_projections WHERE local_product_id=?) AS salla`,
    [productId, productId, productId]
  );
  if (linked.length !== 1) throw Error("Product source unavailable");
  const external =
    Boolean(product.sallaProductId) ||
    Object.values(linked[0]).some(value => Number(value) !== 0);
  return { product, digest: hash(product), external };
}
function parseReceipt(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
): ProductEditorReceipt {
  if (Number(row.actor_id) !== actorId) throw new ProductEditorConflict();
  const result = productEditorReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid product receipt");
  return result;
}
export async function readProductEditor(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validId(merchantId);
  validId(actorId);
  const input = productEditorReadInput.parse(raw);
  return transaction(false, async c => {
    const merchant = await authority(c, merchantId, actorId, false);
    const result = await snapshot(c, merchantId, input.id, false);
    return {
      merchantId,
      selection: input,
      ...result,
      canManage: merchant.canManage,
      integrationSource: merchant.integration_source as string | null,
      locked: merchant.integration_source !== "none" || result.external,
    };
  });
}
export async function writeProductEditor(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validId(merchantId);
  validId(actorId);
  const input = productEditorWrite.parse(raw),
    inputHash = hash(input);
  return transaction(true, async c => {
    const merchant = await authority(c, merchantId, actorId, true);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM product_editor_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior.length !== 1 || prior[0].input_hash !== inputHash)
        throw new ProductEditorConflict();
      return parseReceipt(prior[0], merchantId, actorId, input.requestId);
    }
    if (merchant.integration_source !== "none") throw new ProductEditorLocked();
    const current =
      input.kind === "update"
        ? await snapshot(c, merchantId, input.id, true)
        : null;
    if (current?.external) throw new ProductEditorLocked();
    if (
      current &&
      input.kind === "update" &&
      current.digest !== input.expectedDigest
    )
      throw new ProductEditorConflict();
    const fields = input.fields;
    if (
      current &&
      fields.currency !== undefined &&
      fields.currency !== current.product.currency
    )
      throw new ProductEditorInvalid(
        "Currency changes require a separate conversion workflow"
      );
    if (fields.categoryId != null) {
      const categories = await connectionDb(c)
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(
          and(
            eq(productCategories.id, fields.categoryId),
            eq(productCategories.merchantId, merchantId)
          )
        )
        .for("share");
      if (categories.length !== 1)
        throw new ProductEditorInvalid("Category unavailable");
    }
    if (
      current?.product.priceUnit !== "minor" &&
      fields.price === undefined &&
      (fields.compareAtPrice != null || fields.costPrice != null)
    )
      throw new ProductEditorInvalid("Verify the base price first");
    const converted = {
      ...fields,
      ...(fields.status === undefined
        ? {}
        : { isActive: fields.status === "active" ? 1 : 0 }),
      ...(fields.price === undefined
        ? {}
        : { price: majorToMinor(fields.price), priceUnit: "minor" as const }),
      ...(fields.compareAtPrice === undefined
        ? {}
        : {
            compareAtPrice:
              fields.compareAtPrice === null
                ? null
                : majorToMinor(fields.compareAtPrice),
          }),
      ...(fields.costPrice === undefined
        ? {}
        : {
            costPrice:
              fields.costPrice === null ? null : majorToMinor(fields.costPrice),
          }),
    };
    // An explicit verification does not silently re-label historical auxiliary prices.
    if (
      current &&
      current.product.priceUnit !== "minor" &&
      fields.price !== undefined
    ) {
      converted.compareAtPrice ??= null;
      converted.costPrice ??= null;
    }
    let productId: number;
    if (input.kind === "create") {
      const [created] = await connectionDb(c)
        .insert(products)
        .values({ ...converted, merchantId } as typeof products.$inferInsert)
        .$returningId();
      productId = created.id;
    } else {
      productId = input.id;
      const [updated] = await connectionDb(c)
        .update(products)
        .set(converted as Partial<typeof products.$inferInsert>)
        .where(
          and(eq(products.id, productId), eq(products.merchantId, merchantId))
        );
      if (updated.affectedRows !== 1) throw new ProductEditorConflict();
    }
    const saved = await snapshot(c, merchantId, productId, true);
    const [clock] = await c.query<any[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
    );
    const result = productEditorReceipt.parse({
      merchantId,
      actorId,
      requestId: input.requestId,
      kind: input.kind,
      productId,
      digest: saved.digest,
      createdAt: clock[0]?.now,
    });
    await c.execute(
      "INSERT INTO product_editor_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
      [merchantId, actorId, input.requestId, inputHash, JSON.stringify(result)]
    );
    return result;
  });
}
export async function readProductEditorReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validId(merchantId);
  validId(actorId);
  const input = productEditorReceiptInput.parse(raw);
  return transaction(false, async c => {
    await authority(c, merchantId, actorId, false);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM product_editor_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (rows.length > 1) throw Error("Invalid product receipts");
    return rows.length
      ? parseReceipt(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}

/** Shared transaction and source checks for the reviewed deletion workflow. */
export const productEditorStore = {
  transaction,
  authority,
  snapshot,
  hash,
  validId,
};
