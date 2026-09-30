import type { PoolConnection } from "mysql2/promise";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorLocked,
} from "./product-editor";
import {
  productDeleteReviewInput,
  productDeleteWriteInput,
  productDeleteReceiptInput,
  productDeleteReceipt,
} from "../shared/product-delete";

function count(value: unknown) {
  const n = Number(value);
  if (
    value === null ||
    value === undefined ||
    !Number.isSafeInteger(n) ||
    n < 0
  )
    throw Error("Invalid deletion counts");
  return n;
}
async function review(
  c: PoolConnection,
  merchantId: number,
  ids: number[],
  lock: boolean,
  integrationSource: unknown
) {
  const snapshots = [],
    items = [];
  for (const id of ids) {
    const snapshot = await store.snapshot(c, merchantId, id, lock);
    const [variants] = await c.query<any[]>(
      `SELECT * FROM product_variants WHERE product_id=? ORDER BY id LIMIT 501${lock ? " FOR UPDATE" : ""}`,
      [id]
    );
    const [options] = await c.query<any[]>(
      `SELECT * FROM product_options WHERE product_id=? ORDER BY id LIMIT 501${lock ? " FOR UPDATE" : ""}`,
      [id]
    );
    if (variants.length > 500 || options.length > 500)
      throw new ProductEditorLocked("Product details exceed review limit");
    const [dependencies] = await c.execute<any[]>(
      `SELECT
      (SELECT COUNT(*) FROM loyalty_rewards WHERE product_id=?) AS rewards,
      (SELECT COUNT(*) FROM competitor_products WHERE similar_to_merchant_product=?) AS comparisons,
      (SELECT COUNT(*) FROM customer_reviews WHERE productId=?) AS reviews,
      (SELECT COUNT(*) FROM promotions WHERE merchant_id=? AND scope='products' AND
        (JSON_CONTAINS(IF(JSON_VALID(product_ids),product_ids,'[]'),CAST(? AS JSON)) OR
         JSON_CONTAINS(IF(JSON_VALID(product_ids),product_ids,'[]'),JSON_QUOTE(?)))) AS promotions,
      (SELECT COUNT(*) FROM promotions WHERE merchant_id=? AND scope='products' AND
        (product_ids IS NULL OR NOT JSON_VALID(product_ids) OR JSON_TYPE(IF(JSON_VALID(product_ids),product_ids,'[]'))<>'ARRAY')) AS unreadablePromotions`,
      [id, id, id, merchantId, String(id), String(id), merchantId]
    );
    if (dependencies.length !== 1)
      throw Error("Product dependencies unavailable");
    const references = {
      rewards: count(dependencies[0].rewards),
      comparisons: count(dependencies[0].comparisons),
      reviews: count(dependencies[0].reviews),
      promotions: count(dependencies[0].promotions),
      unreadablePromotions: count(dependencies[0].unreadablePromotions),
      foreignDetails: [...variants, ...options].filter(
        row => Number(row.merchant_id) !== merchantId
      ).length,
    };
    const locked = integrationSource !== "none" || snapshot.external;
    const blocked = locked || Object.values(references).some(n => n > 0);
    const product = snapshot.product;
    items.push({
      id,
      name: product.name,
      price: product.price,
      priceUnit: product.priceUnit,
      currency: product.currency,
      status: product.status,
      variants: variants.length,
      options: options.length,
      references,
      locked,
      blocked,
    });
    snapshots.push({
      ...snapshot,
      variants,
      options,
      references,
      integrationSource,
    });
  }
  return {
    merchantId,
    selection: { ids },
    digest: store.hash(snapshots),
    items,
    canDelete: items.every(item => !item.blocked),
  };
}
export async function reviewProductDeletion(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDeleteReviewInput.parse(raw);
  return store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    const result = await review(
      c,
      merchantId,
      input.ids,
      false,
      merchant.integration_source
    );
    return {
      ...result,
      canManage: merchant.canManage,
      canDelete: result.canDelete && merchant.canManage,
    };
  });
}
function receipt(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  if (Number(row.actor_id) !== actorId) throw new ProductEditorConflict();
  const result = productDeleteReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid deletion receipt");
  return result;
}
export async function deleteReviewedProducts(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDeleteWriteInput.parse(raw),
    inputHash = store.hash({ kind: "delete", ...input });
  return store.transaction(
    true,
    async c => {
      const merchant = await store.authority(c, merchantId, actorId, true);
      const [prior] = await c.execute<any[]>(
        "SELECT actor_id,input_hash,result FROM product_editor_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
        [merchantId, input.requestId]
      );
      if (prior.length) {
        if (prior.length !== 1 || prior[0].input_hash !== inputHash)
          throw new ProductEditorConflict();
        return receipt(prior[0], merchantId, actorId, input.requestId);
      }
      const current = await review(
        c,
        merchantId,
        input.ids,
        true,
        merchant.integration_source
      );
      if (current.digest !== input.expectedDigest)
        throw new ProductEditorConflict();
      if (!current.canDelete) throw new ProductEditorLocked();
      for (const id of input.ids) {
        const [removed] = await c.execute<any>(
          "DELETE FROM products WHERE merchantId=? AND id=?",
          [merchantId, id]
        );
        if (removed.affectedRows !== 1) throw new ProductEditorConflict();
      }
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const result = productDeleteReceipt.parse({
        merchantId,
        actorId,
        requestId: input.requestId,
        kind: "delete",
        ids: input.ids,
        digest: input.expectedDigest,
        createdAt: clock[0]?.now,
      });
      await c.execute(
        "INSERT INTO product_editor_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
        [
          merchantId,
          actorId,
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
export async function readProductDeletionReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = productDeleteReceiptInput.parse(raw);
  return store.transaction(false, async c => {
    await store.authority(c, merchantId, actorId, false);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM product_editor_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (rows.length > 1) throw Error("Invalid deletion receipts");
    return rows.length
      ? receipt(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}
