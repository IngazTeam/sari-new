import type { PoolConnection } from "mysql2/promise";
import {
  productEditorStore,
  ProductEditorConflict,
  ProductEditorLocked,
  ProductEditorMissing,
} from "./product-editor";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  categoryRow,
  categorySnapshot,
  categoryWrite,
  categoryReceipt,
  categoryReceiptInput,
  planCategoryChange,
  PRODUCT_CATEGORY_LIMIT,
} from "../shared/product-categories";
const store = productEditorStore;
const schema = () =>
  assertRuntimeSchema("product category receipts", [
    {
      table: "product_category_receipts",
      columns: ["actor_id", "input_hash", "result"],
      uniqueIndexes: [
        {
          name: "uq_product_category_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
async function snapshot(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  merchant: any,
  lock: boolean
) {
  const [raw] = await c.execute<any[]>(
    `SELECT id,merchant_id AS merchantId,name,name_en AS nameEn,parent_id AS parentId,sort_order AS sortOrder,is_active AS isActive,updated_at AS updatedAt FROM product_categories WHERE merchant_id=? ORDER BY id LIMIT ${PRODUCT_CATEGORY_LIMIT + 1}${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  if (raw.length > PRODUCT_CATEGORY_LIMIT)
    throw Error("Category limit exceeded");
  // Counts include all product statuses. Under SERIALIZABLE the aggregate read
  // also holds relationship locks until the write/receipt transaction commits.
  const [counts] = await c.execute<any[]>(
    `SELECT p.category_id AS id,COUNT(*) AS n FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.merchantId=? AND c.merchant_id=? GROUP BY p.category_id`,
    [merchantId, merchantId]
  );
  const byId = new Map(counts.map(row => [Number(row.id), Number(row.n)]));
  const rows = raw.map(({ updatedAt, ...row }) =>
    categoryRow.parse({ ...row, productCount: byId.get(row.id) ?? 0 })
  );
  return categorySnapshot.parse({
    merchantId,
    actorId,
    canManage: merchant.canManage,
    locked: merchant.integration_source !== "none",
    digest: store.hash({ source: merchant.integration_source, raw, rows }),
    rows,
  });
}
function receipt(
  raw: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  if (Number(raw.actor_id) !== actorId) throw new ProductEditorConflict();
  const result = categoryReceipt.parse(
    typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid category receipt");
  return result;
}
export async function readProductCategories(
  merchantId: number,
  actorId: number
) {
  store.validId(merchantId);
  store.validId(actorId);
  return store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    return snapshot(c, merchantId, actorId, merchant, false);
  });
}
export async function writeProductCategory(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = categoryWrite.parse(raw),
    inputHash = store.hash(input);
  await schema();
  return store.transaction(
    true,
    async c => {
      const merchant = await store.authority(c, merchantId, actorId, true);
      const [prior] = await c.execute<any[]>(
        "SELECT actor_id,input_hash,result FROM product_category_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
        [merchantId, input.requestId]
      );
      if (prior.length) {
        if (prior.length !== 1 || prior[0].input_hash !== inputHash)
          throw new ProductEditorConflict();
        return receipt(prior[0], merchantId, actorId, input.requestId);
      }
      if (merchant.integration_source !== "none")
        throw new ProductEditorLocked();
      const current = await snapshot(c, merchantId, actorId, merchant, true);
      if (current.digest !== input.expectedDigest)
        throw new ProductEditorConflict();
      const plan = planCategoryChange(merchantId, current.rows, input);
      let categoryId: number;
      if (input.kind === "create") {
        const f = plan.after!;
        const [result] = await c.execute<any>(
          "INSERT INTO product_categories (merchant_id,name,name_en,parent_id,sort_order,is_active) VALUES (?,?,?,?,?,?)",
          [merchantId, f.name, f.nameEn, f.parentId, f.sortOrder, f.isActive]
        );
        categoryId = Number(result.insertId);
      } else {
        categoryId = input.id;
        if (input.kind === "delete") {
          // Corrupt legacy cross-tenant references must not be orphaned either.
          const [linked] = await c.execute<any[]>(
            "SELECT id FROM products WHERE category_id=? LIMIT 1 FOR UPDATE",
            [categoryId]
          );
          const [children] = await c.execute<any[]>(
            "SELECT id FROM product_categories WHERE parent_id=? LIMIT 1 FOR UPDATE",
            [categoryId]
          );
          if (linked.length || children.length)
            throw new ProductEditorConflict();
          const [deleted] = await c.execute<any>(
            "DELETE FROM product_categories WHERE id=? AND merchant_id=?",
            [categoryId, merchantId]
          );
          if (deleted.affectedRows !== 1) throw new ProductEditorMissing();
        } else {
          const f = plan.after!;
          const [updated] = await c.execute<any>(
            "UPDATE product_categories SET name=?,name_en=?,parent_id=?,sort_order=?,is_active=? WHERE id=? AND merchant_id=?",
            [
              f.name,
              f.nameEn,
              f.parentId,
              f.sortOrder,
              f.isActive,
              categoryId,
              merchantId,
            ]
          );
          if (updated.affectedRows !== 1) throw new ProductEditorConflict();
        }
      }
      const saved = await snapshot(c, merchantId, actorId, merchant, true);
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const result = categoryReceipt.parse({
        merchantId,
        actorId,
        requestId: input.requestId,
        categoryId,
        kind: input.kind,
        digest: saved.digest,
        confirmedAt: clock[0]?.now,
      });
      await c.execute(
        "INSERT INTO product_category_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
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
export async function readProductCategoryReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  store.validId(merchantId);
  store.validId(actorId);
  const input = categoryReceiptInput.parse(raw);
  await schema();
  return store.transaction(false, async c => {
    await store.authority(c, merchantId, actorId, false);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,result FROM product_category_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (rows.length > 1) throw Error("Invalid category receipts");
    return rows.length
      ? receipt(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}
