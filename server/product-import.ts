import type { PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import { majorToMinor } from "../shared/product-money";
import {
  productImportPrepareInput,
  productImportReadInput,
  productImportCommitInput,
  productImportDiscardInput,
  productImportReceiptInput,
  productImportReceiptSchema,
  productImportPreviewSchema,
  productImportReviewSchema,
  type ProductImportReceipt,
} from "../shared/product-import";
import {
  previewProductImport,
  type ProductImportPreview,
} from "./product-import-preview";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
  ProductEditorInvalid,
} from "./product-editor";
import { assertRuntimeSchema } from "./db/schema-readiness";

export class ProductImportExpired extends Error {}
export class ProductImportLimit extends Error {}
export class ProductImportSize extends Error {}
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const ready = () =>
  assertRuntimeSchema("product import reviews", [
    {
      table: "product_import_reviews",
      columns: [
        "actor_id",
        "input_hash",
        "digest",
        "preview",
        "receipt",
        "expires_at",
      ],
      uniqueIndexes: [
        {
          name: "uq_product_import_review",
          columns: ["merchant_id", "review_id"],
        },
      ],
    },
  ]);
const json = (value: unknown) =>
  typeof value === "string" ? JSON.parse(value) : value;
const previewDigest = (inputHash: string, preview: ProductImportPreview) =>
  store.hash({ inputHash, preview: { ...preview, digest: null } });
const scope = (merchantId: number, actorId: number) => {
  store.validId(merchantId);
  store.validId(actorId);
};
async function findReview(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  reviewId: string,
  lock = false
) {
  const [rows] = await c.execute<any[]>(
    `SELECT *,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created,DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires,(expires_at<=UTC_TIMESTAMP(3)) AS expired FROM product_import_reviews WHERE merchant_id=? AND actor_id=? AND review_id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId, actorId, reviewId]
  );
  if (rows.length > 1) throw Error("Invalid import review");
  return rows[0] ?? null;
}
function storedPreview(row: any) {
  const preview = productImportPreviewSchema.parse(json(row.preview));
  if (
    preview.digest !== row.digest ||
    previewDigest(row.input_hash, preview) !== row.digest
  )
    throw Error("Invalid import review digest");
  return preview;
}
function parseReceipt(
  raw: unknown,
  merchantId: number,
  actorId: number,
  requestId?: string
): ProductImportReceipt {
  const result = productImportReceiptSchema.parse(json(raw));
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    (requestId && result.requestId !== requestId)
  )
    throw new ProductEditorConflict();
  return result;
}
function view(
  row: any,
  merchant: any,
  input: ReturnType<typeof productImportReadInput.parse>
) {
  const preview = storedPreview(row),
    receipt =
      row.receipt == null
        ? null
        : parseReceipt(
            row.receipt,
            Number(row.merchant_id),
            Number(row.actor_id)
          );
  if (
    receipt &&
    (receipt.reviewId !== row.review_id || receipt.digest !== row.digest)
  )
    throw Error("Invalid import receipt");
  const filtered =
    input.filter === "errors"
      ? preview.rows.filter(item => !item.fields)
      : preview.rows;
  return productImportReviewSchema.parse({
    merchantId: Number(row.merchant_id),
    actorId: Number(row.actor_id),
    reviewId: row.review_id,
    selection: input,
    createdAt: row.created,
    expiresAt: row.expires,
    expired: Boolean(Number(row.expired)),
    canManage: merchant.canManage,
    integrationSource: merchant.integration_source,
    canCommit:
      merchant.canManage &&
      merchant.integration_source === "none" &&
      !Number(row.expired) &&
      !receipt &&
      preview.invalid === 0 &&
      preview.issues.length === 0,
    receipt,
    preview: {
      ...preview,
      rows: filtered.slice(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize
      ),
      filteredTotal: filtered.length,
      totalPages: Math.ceil(filtered.length / input.pageSize),
    },
  });
}
async function existingSkus(
  c: PoolConnection,
  merchantId: number,
  preview: ProductImportPreview,
  lock: boolean
) {
  const keys = Array.from(
      new Set(
        preview.rows
          .map(row => row.fields?.sku?.trim().toLocaleLowerCase("en-US"))
          .filter((value): value is string => Boolean(value))
      )
    ),
    found = new Set<string>();
  for (let offset = 0; offset < keys.length; offset += 200) {
    const group = keys.slice(offset, offset + 200);
    const [rows] = await c.execute<any[]>(
      `SELECT sku FROM products WHERE merchantId=? AND LOWER(TRIM(sku)) COLLATE utf8mb4_bin IN (${group.map(() => "?").join(",")})${lock ? " FOR UPDATE" : ""}`,
      [merchantId, ...group]
    );
    for (const row of rows)
      found.add(String(row.sku).trim().toLocaleLowerCase("en-US"));
  }
  return found;
}
async function priorReceipt(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  requestId: string,
  inputHash?: string
) {
  const [rows] = await c.execute<any[]>(
    "SELECT actor_id,input_hash,result FROM product_editor_receipts WHERE merchant_id=? AND request_id=?",
    [merchantId, requestId]
  );
  if (rows.length > 1) throw Error("Invalid import receipts");
  if (!rows.length) return null;
  if (
    Number(rows[0].actor_id) !== actorId ||
    (inputHash && rows[0].input_hash !== inputHash)
  )
    throw new ProductEditorConflict();
  return parseReceipt(rows[0].result, merchantId, actorId, requestId);
}
export async function prepareProductImport(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productImportPrepareInput.parse(raw),
    inputHash = store.hash(input),
    selection = productImportReadInput.parse({ reviewId: input.reviewId });
  await ready();
  // Access is checked before parsing, then again under the tenant lock before persisting.
  const prior = await store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    if (!merchant.canManage) throw new ProductEditorForbidden();
    const row = await findReview(c, merchantId, actorId, input.reviewId);
    if (row) {
      if (row.input_hash !== inputHash) throw new ProductEditorConflict();
      return view(row, merchant, selection);
    }
    if (merchant.integration_source !== "none") throw new ProductEditorLocked();
    return null;
  });
  if (prior) return prior;
  const preview = await previewProductImport(input.file);
  if (Buffer.byteLength(JSON.stringify(preview), "utf8") > MAX_PREVIEW_BYTES)
    throw new ProductImportSize();
  return store.transaction(true, async c => {
    const merchant = await store.authority(c, merchantId, actorId, true),
      prior = await findReview(c, merchantId, actorId, input.reviewId, true);
    if (prior) {
      if (prior.input_hash !== inputHash) throw new ProductEditorConflict();
      return view(prior, merchant, selection);
    }
    if (merchant.integration_source !== "none") throw new ProductEditorLocked();
    // Completed receipts remain durable separately; obsolete file contents are bounded per tenant.
    await c.execute(
      "DELETE FROM product_import_reviews WHERE merchant_id=? AND expires_at<=UTC_TIMESTAMP(3)",
      [merchantId]
    );
    const [counts] = await c.execute<any[]>(
      "SELECT COUNT(*) AS total,SUM(actor_id=?) AS own FROM product_import_reviews WHERE merchant_id=?",
      [actorId, merchantId]
    );
    if (Number(counts[0].total) >= 10 || Number(counts[0].own) >= 3)
      throw new ProductImportLimit();
    const existing = await existingSkus(c, merchantId, preview, false),
      skuColumn =
        preview.headers.find(header => header.field === "sku")?.column ?? null;
    for (const row of preview.rows)
      if (
        row.fields?.sku &&
        existing.has(row.fields.sku.trim().toLocaleLowerCase("en-US"))
      ) {
        row.issues.push({
          code: "existing_sku",
          field: "sku",
          column: skuColumn,
        });
        row.fields = null;
      }
    preview.valid = preview.rows.filter(row => row.fields).length;
    preview.invalid = preview.total - preview.valid;
    preview.digest = previewDigest(inputHash, preview);
    const encoded = JSON.stringify(productImportPreviewSchema.parse(preview));
    if (Buffer.byteLength(encoded, "utf8") > MAX_PREVIEW_BYTES)
      throw new ProductImportSize();
    await c.execute(
      "INSERT INTO product_import_reviews (merchant_id,actor_id,review_id,input_hash,digest,preview,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))",
      [merchantId, actorId, input.reviewId, inputHash, preview.digest, encoded]
    );
    return view(
      await findReview(c, merchantId, actorId, input.reviewId),
      merchant,
      selection
    );
  });
}
export async function readProductImport(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productImportReadInput.parse(raw);
  await ready();
  return store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false),
      row = await findReview(c, merchantId, actorId, input.reviewId);
    if (!row) throw new ProductEditorMissing();
    return view(row, merchant, input);
  });
}
export async function commitProductImport(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productImportCommitInput.parse(raw),
    inputHash = store.hash({ kind: "import", ...input });
  await ready();
  return store.transaction(
    true,
    async c => {
      const merchant = await store.authority(c, merchantId, actorId, true),
        prior = await priorReceipt(
          c,
          merchantId,
          actorId,
          input.requestId,
          inputHash
        );
      if (prior) return prior;
      if (merchant.integration_source !== "none")
        throw new ProductEditorLocked();
      const row = await findReview(
        c,
        merchantId,
        actorId,
        input.reviewId,
        true
      );
      if (!row) throw new ProductEditorMissing();
      if (row.receipt != null) throw new ProductEditorConflict();
      if (Number(row.expired)) throw new ProductImportExpired();
      if (row.digest !== input.expectedDigest)
        throw new ProductEditorConflict();
      const preview = storedPreview(row);
      if (
        preview.invalid ||
        preview.issues.length ||
        preview.valid !== preview.total
      )
        throw new ProductEditorInvalid("Import rows require correction");
      if ((await existingSkus(c, merchantId, preview, true)).size)
        throw new ProductEditorConflict();
      const db = drizzle({ client: c }),
        productIds: number[] = [];
      for (const item of preview.rows) {
        const fields = item.fields!;
        // categoryId is not accepted by the file mapping. A category label is descriptive only.
        if (fields.categoryId !== null)
          throw new ProductEditorInvalid("Invalid file category");
        const [created] = await db
          .insert(products)
          .values({
            ...fields,
            merchantId,
            price: majorToMinor(fields.price),
            priceUnit: "minor",
            compareAtPrice:
              fields.compareAtPrice == null
                ? null
                : majorToMinor(fields.compareAtPrice),
            costPrice:
              fields.costPrice == null ? null : majorToMinor(fields.costPrice),
            isActive: fields.status === "active" ? 1 : 0,
          })
          .$returningId();
        if (!created?.id) throw Error("Product import insert unavailable");
        productIds.push(created.id);
      }
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const receipt = productImportReceiptSchema.parse({
        merchantId,
        actorId,
        requestId: input.requestId,
        reviewId: input.reviewId,
        kind: "import",
        digest: row.digest,
        productIds,
        count: productIds.length,
        createdAt: clock[0]?.now,
      });
      await c.execute(
        "INSERT INTO product_editor_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
        [
          merchantId,
          actorId,
          input.requestId,
          inputHash,
          JSON.stringify(receipt),
        ]
      );
      const [saved] = await c.execute<any>(
        "UPDATE product_import_reviews SET receipt=? WHERE merchant_id=? AND actor_id=? AND review_id=? AND receipt IS NULL",
        [JSON.stringify(receipt), merchantId, actorId, input.reviewId]
      );
      if (saved.affectedRows !== 1) throw new ProductEditorConflict();
      return receipt;
    },
    true
  );
}
export async function readProductImportReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productImportReceiptInput.parse(raw);
  return store.transaction(false, async c => {
    await store.authority(c, merchantId, actorId, false);
    return priorReceipt(c, merchantId, actorId, input.requestId);
  });
}
export async function discardProductImport(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productImportDiscardInput.parse(raw);
  await ready();
  return store.transaction(true, async c => {
    await store.authority(c, merchantId, actorId, true);
    const row = await findReview(c, merchantId, actorId, input.reviewId, true);
    if (!row) return { discarded: true as const };
    if (row.digest !== input.expectedDigest) throw new ProductEditorConflict();
    await c.execute(
      "DELETE FROM product_import_reviews WHERE merchant_id=? AND actor_id=? AND review_id=?",
      [merchantId, actorId, input.reviewId]
    );
    return { discarded: true as const };
  });
}
