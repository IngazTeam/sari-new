import type { PoolConnection } from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import { majorToMinor } from "../shared/product-money";
import {
  productSheetPrepareInput,
  productSheetReadInput,
  productSheetCommitInput,
  productSheetDiscardInput,
  productSheetReceiptInput,
  productSheetStoredPayload,
  productSheetReview,
  productSheetReceipt,
  type ProductSheetReceipt,
} from "../shared/product-sheet-review";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
  ProductEditorInvalid,
} from "./product-editor";
import {
  snapshotProductSheetSource,
  assertProductSheetSource,
  readProductSheetConnectionOn,
} from "./product-sheet-source";
import { readProductSheetCatalog } from "./product-sheet-catalog";
import { planProductSheet } from "./product-sheet-plan";
import { assertRuntimeSchema } from "./db/schema-readiness";
export class ProductSheetReviewExpired extends Error {}
export class ProductSheetReviewLimit extends Error {}
export class ProductSheetReviewSize extends Error {}
const MAX_BYTES = 8 * 1024 * 1024;
const ready = () =>
  assertRuntimeSchema("product Sheet reviews", [
    {
      table: "product_sheet_reviews",
      columns: [
        "actor_id",
        "input_hash",
        "digest",
        "payload",
        "receipt",
        "expires_at",
      ],
      uniqueIndexes: [
        {
          name: "uq_product_sheet_review",
          columns: ["merchant_id", "review_id"],
        },
      ],
    },
  ]);
const scope = (merchantId: number, actorId: number) => {
  store.validId(merchantId);
  store.validId(actorId);
};
const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const bounded = (v: unknown) => {
  const encoded = JSON.stringify(v);
  if (Buffer.byteLength(encoded, "utf8") > MAX_BYTES)
    throw new ProductSheetReviewSize();
  return encoded;
};
async function authority(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  lock: boolean
) {
  const merchant = await store.authority(c, merchantId, actorId, lock);
  if (!merchant.canManage) throw new ProductEditorForbidden();
  return merchant;
}
async function find(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  reviewId: string,
  lock = false
) {
  // Merchant/review identity is unique across actors. An actor cannot reuse a colleague's UUID.
  const [rows] = await c.execute<any[]>(
    `SELECT *,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created,DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires,(expires_at<=UTC_TIMESTAMP(3)) AS expired FROM product_sheet_reviews WHERE merchant_id=? AND review_id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId, reviewId]
  );
  if (rows.length > 1) throw Error("Invalid Sheet review");
  if (rows[0] && Number(rows[0].actor_id) !== actorId)
    throw new ProductEditorMissing();
  return rows[0] ?? null;
}
function stored(row: any) {
  const raw = json(row.payload);
  bounded(raw);
  const payload = productSheetStoredPayload.parse(raw);
  const p = payload.plan;
  if (
    payload.input.reviewId !== row.review_id ||
    store.hash(payload.input) !== row.input_hash ||
    store.hash({ inputHash: row.input_hash, payload }) !== row.digest ||
    store.hash({
      mode: p.mode,
      sourceDigest: p.sourceDigest,
      rows: p.rows,
      counts: p.counts,
    }) !== p.digest
  )
    throw Error("Invalid Sheet review digest");
  return payload;
}
function receipt(
  raw: unknown,
  merchantId: number,
  actorId: number,
  requestId?: string
) {
  const r = productSheetReceipt.parse(json(raw));
  if (
    r.merchantId !== merchantId ||
    r.actorId !== actorId ||
    (requestId && r.requestId !== requestId)
  )
    throw new ProductEditorConflict();
  return r;
}
async function view(
  c: PoolConnection,
  row: any,
  merchant: any,
  input: ReturnType<typeof productSheetReadInput.parse>
) {
  const payload = stored(row),
    r =
      row.receipt == null
        ? null
        : receipt(row.receipt, Number(row.merchant_id), Number(row.actor_id));
  const connection = await readProductSheetConnectionOn(
      c,
      Number(row.merchant_id),
      Number(row.actor_id)
    ),
    sourceCurrent = connection.source?.digest === payload.source.digest;
  const { preview, ...snapshot } = payload.snapshot,
    { rows: sourceRows, ...meta } = preview;
  const pairs = payload.plan.rows.map((change, i) => ({
    source: sourceRows[i],
    change,
  }));
  const filtered =
    input.filter === "all"
      ? pairs
      : pairs.filter(r => r.change.action === input.filter);
  return productSheetReview.parse({
    merchantId: Number(row.merchant_id),
    actorId: Number(row.actor_id),
    reviewId: row.review_id,
    digest: row.digest,
    selection: input,
    source: payload.source,
    options: payload.input.selection,
    mode: payload.input.mode,
    createdAt: row.created,
    expiresAt: row.expires,
    expired: !!Number(row.expired),
    canManage: merchant.canManage,
    integrationSource: merchant.integration_source,
    sourceCurrent,
    canCommit:
      merchant.canManage &&
      merchant.integration_source === "none" &&
      sourceCurrent &&
      !Number(row.expired) &&
      !r &&
      payload.plan.counts.blocked === 0,
    receipt: r,
    snapshot,
    preview: meta,
    counts: payload.plan.counts,
    rows: filtered.slice(
      (input.page - 1) * input.pageSize,
      input.page * input.pageSize
    ),
    filteredTotal: filtered.length,
    totalPages: Math.ceil(filtered.length / input.pageSize),
  });
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
  if (rows.length > 1) throw Error("Invalid Sheet receipt");
  if (!rows.length) return null;
  if (
    Number(rows[0].actor_id) !== actorId ||
    (inputHash && rows[0].input_hash !== inputHash)
  )
    throw new ProductEditorConflict();
  return receipt(rows[0].result, merchantId, actorId, requestId);
}
export async function prepareProductSheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productSheetPrepareInput.parse(raw),
    inputHash = store.hash(input),
    selection = productSheetReadInput.parse({ reviewId: input.reviewId });
  await ready();
  const prior = await store.transaction(false, async c => {
    const merchant = await authority(c, merchantId, actorId, false),
      row = await find(c, merchantId, actorId, input.reviewId);
    if (row) {
      if (row.input_hash !== inputHash) throw new ProductEditorConflict();
      return view(c, row, merchant, selection);
    }
    if (merchant.integration_source !== "none") throw new ProductEditorLocked();
    return null;
  });
  if (prior) return prior;
  // Read-only provider work takes place outside product locks. Never accepts browser-supplied rows.
  const source = await snapshotProductSheetSource(
    merchantId,
    actorId,
    input.selection
  );
  bounded(source.snapshot);
  return store.transaction(
    true,
    async c => {
      const merchant = await authority(c, merchantId, actorId, true),
        old = await find(c, merchantId, actorId, input.reviewId, true);
      if (old) {
        if (old.input_hash !== inputHash) throw new ProductEditorConflict();
        return view(c, old, merchant, selection);
      }
      const current = await assertProductSheetSource(
        c,
        merchantId,
        actorId,
        input.selection.expectedSourceDigest,
        true
      );
      if (
        source.merchantId !== merchantId ||
        source.actorId !== actorId ||
        current.source.digest !== source.source.digest
      )
        throw new ProductEditorConflict();
      await c.execute(
        "DELETE FROM product_sheet_reviews WHERE merchant_id=? AND expires_at<=UTC_TIMESTAMP(3)",
        [merchantId]
      );
      const [counts] = await c.execute<any[]>(
        "SELECT COUNT(*) AS total,SUM(actor_id=?) AS own FROM product_sheet_reviews WHERE merchant_id=?",
        [actorId, merchantId]
      );
      if (Number(counts[0].total) >= 10 || Number(counts[0].own) >= 3)
        throw new ProductSheetReviewLimit();
      const catalog = await readProductSheetCatalog(
        c,
        merchantId,
        source.snapshot,
        input.mode,
        true
      );
      const payload = productSheetStoredPayload.parse({
          input,
          source: source.source,
          snapshot: source.snapshot,
          plan: planProductSheet(source.snapshot, input.mode, catalog),
        }),
        encoded = bounded(payload),
        digest = store.hash({ inputHash, payload });
      await c.execute(
        "INSERT INTO product_sheet_reviews (merchant_id,actor_id,review_id,input_hash,digest,payload,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))",
        [merchantId, actorId, input.reviewId, inputHash, digest, encoded]
      );
      return view(
        c,
        await find(c, merchantId, actorId, input.reviewId),
        merchant,
        selection
      );
    },
    true
  );
}
export async function readProductSheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productSheetReadInput.parse(raw);
  await ready();
  return store.transaction(false, async c => {
    const merchant = await authority(c, merchantId, actorId, false),
      row = await find(c, merchantId, actorId, input.reviewId);
    if (!row) throw new ProductEditorMissing();
    return view(c, row, merchant, input);
  });
}
export async function commitProductSheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productSheetCommitInput.parse(raw),
    inputHash = store.hash({ kind: "sheet_import", ...input });
  await ready();
  return store.transaction(
    true,
    async c => {
      await authority(c, merchantId, actorId, true);
      const prior = await priorReceipt(
        c,
        merchantId,
        actorId,
        input.requestId,
        inputHash
      );
      if (prior) return prior;
      const row = await find(c, merchantId, actorId, input.reviewId, true);
      if (!row) throw new ProductEditorMissing();
      if (row.receipt != null || row.digest !== input.expectedDigest)
        throw new ProductEditorConflict();
      if (Number(row.expired)) throw new ProductSheetReviewExpired();
      const payload = stored(row);
      if (payload.plan.counts.blocked)
        throw new ProductEditorInvalid("Sheet rows require correction");
      await assertProductSheetSource(
        c,
        merchantId,
        actorId,
        payload.source.digest,
        true
      );
      const catalog = await readProductSheetCatalog(
        c,
        merchantId,
        payload.snapshot,
        payload.input.mode,
        true
      );
      if (
        planProductSheet(payload.snapshot, payload.input.mode, catalog)
          .digest !== payload.plan.digest
      )
        throw new ProductEditorConflict();
      const db = drizzle({ client: c }),
        rows: ProductSheetReceipt["rows"] = [];
      for (const change of payload.plan.rows) {
        const fields = change.after!;
        if (change.action === "blocked") throw new ProductEditorInvalid();
        let productId = change.productId;
        if (change.action === "create") {
          if (fields.categoryId !== null) throw new ProductEditorInvalid();
          const [created] = await db
            .insert(products)
            .values({
              ...fields,
              merchantId,
              price: majorToMinor(fields.price),
              priceUnit: "minor",
              compareAtPrice:
                fields.compareAtPrice === null
                  ? null
                  : majorToMinor(fields.compareAtPrice),
              costPrice:
                fields.costPrice === null
                  ? null
                  : majorToMinor(fields.costPrice),
              isActive: fields.status === "active" ? 1 : 0,
            })
            .$returningId();
          if (!created?.id) throw Error("Sheet product insert unavailable");
          productId = created.id;
        } else if (change.action === "update") {
          const patch: Record<string, unknown> = Object.fromEntries(
            change.changes.map(k => [k, fields[k]])
          );
          for (const k of ["price", "compareAtPrice", "costPrice"] as const)
            if (change.changes.includes(k))
              patch[k] = fields[k] === null ? null : majorToMinor(fields[k]!);
          if (change.changes.includes("price")) patch.priceUnit = "minor";
          if (change.changes.includes("status"))
            patch.isActive = fields.status === "active" ? 1 : 0;
          const [updated] = await db
            .update(products)
            .set(patch)
            .where(
              and(
                eq(products.id, productId!),
                eq(products.merchantId, merchantId)
              )
            );
          if (updated.affectedRows !== 1) throw new ProductEditorConflict();
        }
        rows.push({
          number: change.number,
          action: change.action,
          productId: productId!,
        });
      }
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const r = productSheetReceipt.parse({
        merchantId,
        actorId,
        reviewId: input.reviewId,
        requestId: input.requestId,
        kind: "sheet_import",
        digest: row.digest,
        sourceDigest: payload.source.digest,
        snapshotDigest: payload.snapshot.digest,
        rows,
        counts: {
          create: payload.plan.counts.create,
          update: payload.plan.counts.update,
          unchanged: payload.plan.counts.unchanged,
        },
        createdAt: clock[0]?.now,
      });
      await c.execute(
        "INSERT INTO product_editor_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
        [merchantId, actorId, input.requestId, inputHash, JSON.stringify(r)]
      );
      const [saved] = await c.execute<any>(
        "UPDATE product_sheet_reviews SET receipt=? WHERE merchant_id=? AND actor_id=? AND review_id=? AND receipt IS NULL",
        [JSON.stringify(r), merchantId, actorId, input.reviewId]
      );
      if (saved.affectedRows !== 1) throw new ProductEditorConflict();
      return r;
    },
    true
  );
}
export async function readProductSheetReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productSheetReceiptInput.parse(raw);
  return store.transaction(false, async c => {
    await authority(c, merchantId, actorId, false);
    return priorReceipt(c, merchantId, actorId, input.requestId);
  });
}
export async function discardProductSheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productSheetDiscardInput.parse(raw);
  await ready();
  return store.transaction(true, async c => {
    await authority(c, merchantId, actorId, true);
    const row = await find(c, merchantId, actorId, input.reviewId, true);
    if (!row) return { discarded: true as const };
    if (row.digest !== input.expectedDigest) throw new ProductEditorConflict();
    await c.execute(
      "DELETE FROM product_sheet_reviews WHERE merchant_id=? AND actor_id=? AND review_id=?",
      [merchantId, actorId, input.reviewId]
    );
    return { discarded: true as const };
  });
}
