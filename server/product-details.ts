import type { PoolConnection } from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { productOptions, productVariants } from "../drizzle/schema";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorLocked,
} from "./product-editor";
import {
  productDetailsRead,
  productDetailsSnapshot,
  productDetailWrite,
  productDetailReceipt,
  productDetailReceiptInput,
  planProductDetailChange,
  PRODUCT_DETAIL_READ_LIMIT,
  type ProductOptionRow,
  type ProductVariantRow,
} from "../shared/product-details";

const schema = () =>
  assertRuntimeSchema("product detail receipts", [
    {
      table: "product_detail_receipts",
      columns: ["actor_id", "product_id", "input_hash", "result"],
      uniqueIndexes: [
        {
          name: "uq_product_detail_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
async function snapshot(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  productId: number,
  merchant: any,
  lock: boolean
) {
  const product = await store.snapshot(c, merchantId, productId, lock),
    db = drizzle({ client: c });
  const optionQuery = db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .orderBy(productOptions.id)
    .limit(PRODUCT_DETAIL_READ_LIMIT + 1);
  const variantQuery = db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(productVariants.id)
    .limit(PRODUCT_DETAIL_READ_LIMIT + 1);
  const rawOptions = await (lock ? optionQuery.for("update") : optionQuery);
  const rawVariants = await (lock ? variantQuery.for("update") : variantQuery);
  // Read by product first to detect corrupt cross-tenant child rows without exposing them.
  if (
    rawOptions.length > PRODUCT_DETAIL_READ_LIMIT ||
    rawVariants.length > PRODUCT_DETAIL_READ_LIMIT ||
    [...rawOptions, ...rawVariants].some(row => row.merchantId !== merchantId)
  )
    throw new ProductEditorLocked("Product details require repair");
  const options = rawOptions.map(({ createdAt, ...row }) => row);
  const variants = rawVariants.map(({ createdAt, updatedAt, ...row }) => row);
  return productDetailsSnapshot.parse({
    merchantId,
    actorId,
    productId,
    productName: product.product.name,
    currency: product.product.currency,
    hasVariants: product.product.hasVariants,
    canManage: merchant.canManage,
    locked: merchant.integration_source !== "none" || product.external,
    digest: store.hash({
      product,
      source: merchant.integration_source,
      rawOptions,
      rawVariants,
    }),
    options,
    variants,
  });
}
function receipt(
  raw: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  if (Number(raw.actor_id) !== actorId) throw new ProductEditorConflict();
  const result = productDetailReceipt.parse(
    typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result
  );
  if (
    result.actorId !== actorId ||
    result.merchantId !== merchantId ||
    result.requestId !== requestId ||
    result.productId !== Number(raw.product_id)
  )
    throw Error("Product detail receipt mismatch");
  return result;
}
export async function readProductDetails(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDetailsRead.parse(raw);
  return store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    return snapshot(c, merchantId, actorId, input.productId, merchant, false);
  });
}
export async function writeProductDetail(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDetailWrite.parse(raw),
    inputHash = store.hash(input);
  await schema();
  return store.transaction(
    true,
    async c => {
      const merchant = await store.authority(c, merchantId, actorId, true);
      const [prior] = await c.execute<any[]>(
        "SELECT actor_id,product_id,input_hash,result FROM product_detail_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
        [merchantId, input.requestId]
      );
      if (prior.length) {
        if (prior.length !== 1 || prior[0].input_hash !== inputHash)
          throw new ProductEditorConflict();
        return receipt(prior[0], merchantId, actorId, input.requestId);
      }
      const current = await snapshot(
        c,
        merchantId,
        actorId,
        input.productId,
        merchant,
        true
      );
      if (current.locked) throw new ProductEditorLocked();
      if (current.digest !== input.expectedDigest)
        throw new ProductEditorConflict();
      const plan = planProductDetailChange(current, input),
        db = drizzle({ client: c });
      let detailId: number;
      if (input.kind === "option_create") {
        const { id: _, ...value } = plan.after as ProductOptionRow;
        const [created] = await db
          .insert(productOptions)
          .values(value)
          .$returningId();
        detailId = created.id;
      } else if (input.kind === "variant_create") {
        const { id: _, ...value } = plan.after as ProductVariantRow;
        const [created] = await db
          .insert(productVariants)
          .values(value)
          .$returningId();
        detailId = created.id;
      } else {
        detailId = input.id;
        const optionWhere = and(
          eq(productOptions.id, detailId),
          eq(productOptions.productId, input.productId),
          eq(productOptions.merchantId, merchantId)
        );
        const variantWhere = and(
          eq(productVariants.id, detailId),
          eq(productVariants.productId, input.productId),
          eq(productVariants.merchantId, merchantId)
        );
        const [changed] =
          input.kind === "option_delete"
            ? await db.delete(productOptions).where(optionWhere)
            : input.kind === "variant_delete"
              ? await db.delete(productVariants).where(variantWhere)
              : input.kind === "option_update"
                ? await db
                    .update(productOptions)
                    .set(plan.after as ProductOptionRow)
                    .where(optionWhere)
                : await db
                    .update(productVariants)
                    .set(plan.after as ProductVariantRow)
                    .where(variantWhere);
        if (changed.affectedRows !== 1) throw new ProductEditorConflict();
      }
      // The parent flag and revision participate in the same transaction and receipt.
      const [parent] = await c.execute<any>(
        "UPDATE products SET has_variants=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND merchantId=?",
        [plan.hasVariants, input.productId, merchantId]
      );
      if (parent.affectedRows !== 1) throw new ProductEditorConflict();
      const saved = await snapshot(
        c,
        merchantId,
        actorId,
        input.productId,
        merchant,
        true
      );
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const result = productDetailReceipt.parse({
        merchantId,
        actorId,
        productId: input.productId,
        requestId: input.requestId,
        detailId,
        kind: input.kind,
        digest: saved.digest,
        confirmedAt: clock[0]?.now,
      });
      await c.execute(
        "INSERT INTO product_detail_receipts (merchant_id,actor_id,product_id,request_id,input_hash,result) VALUES (?,?,?,?,?,?)",
        [
          merchantId,
          actorId,
          input.productId,
          input.requestId,
          inputHash,
          JSON.stringify(result),
        ]
      );
      return result;
    },
    true
  );
}
export async function readProductDetailReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDetailReceiptInput.parse(raw);
  await schema();
  return store.transaction(false, async c => {
    await store.authority(c, merchantId, actorId, false);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,product_id,result FROM product_detail_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (rows.length > 1) throw Error("Invalid product detail receipts");
    return rows.length
      ? receipt(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}
