import type { PoolConnection } from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import {
  inventorySheetPrepareInput,
  inventorySheetReadInput,
  inventorySheetCommitInput,
  inventorySheetDiscardInput,
  inventorySheetReceiptInput,
  inventorySheetStoredPayload,
  inventorySheetReview,
  inventorySheetReceipt,
  type InventorySheetReceipt,
} from "../shared/product-sheet-inventory-review";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
  ProductEditorInvalid,
} from "./product-editor";
import {
  snapshotSheetInventorySource,
  assertProductSheetSource,
  readProductSheetConnectionOn,
} from "./product-sheet-source";
import { readSheetInventoryCatalog } from "./product-sheet-inventory-catalog";
import { planSheetInventory } from "./product-sheet-inventory";
import { assertRuntimeSchema } from "./db/schema-readiness";
export class InventorySheetReviewExpired extends Error {}
export class InventorySheetReviewLimit extends Error {}
export class InventorySheetReviewSize extends Error {}
const MAX_BYTES = 8 * 1024 * 1024;
const ready = () =>
  assertRuntimeSchema("inventory Sheet reviews", [
    {
      table: "inventory_sheet_reviews",
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
          name: "uq_inventory_sheet_review",
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
    throw new InventorySheetReviewSize();
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
    `SELECT *,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created,DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS expires,(expires_at<=UTC_TIMESTAMP(3)) AS expired FROM inventory_sheet_reviews WHERE merchant_id=? AND review_id=?${lock ? " FOR UPDATE" : ""}`,
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
  const payload = inventorySheetStoredPayload.parse(raw);
  const p = payload.plan;
  if (
    payload.input.reviewId !== row.review_id ||
    store.hash(payload.input) !== row.input_hash ||
    store.hash({ inputHash: row.input_hash, payload }) !== row.digest ||
    store.hash({
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
  const r = inventorySheetReceipt.parse(json(raw));
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
  input: ReturnType<typeof inventorySheetReadInput.parse>
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
  const { rows: sourceRows, ...meta } = payload.snapshot;
  const pairs = payload.plan.rows.map((change, i) => ({
    source: sourceRows[i],
    change,
  }));
  const filtered =
    input.filter === "all"
      ? pairs
      : pairs.filter(r => r.change.action === input.filter);
  return inventorySheetReview.parse({
    merchantId: Number(row.merchant_id),
    actorId: Number(row.actor_id),
    reviewId: row.review_id,
    digest: row.digest,
    selection: input,
    source: payload.source,
    options: payload.input.selection,
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
export async function prepareInventorySheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = inventorySheetPrepareInput.parse(raw),
    inputHash = store.hash(input),
    selection = inventorySheetReadInput.parse({ reviewId: input.reviewId });
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
  const source = await snapshotSheetInventorySource(
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
        "DELETE FROM inventory_sheet_reviews WHERE merchant_id=? AND expires_at<=UTC_TIMESTAMP(3)",
        [merchantId]
      );
      const [counts] = await c.execute<any[]>(
        "SELECT COUNT(*) AS total,SUM(actor_id=?) AS own FROM inventory_sheet_reviews WHERE merchant_id=?",
        [actorId, merchantId]
      );
      if (Number(counts[0].total) >= 10 || Number(counts[0].own) >= 3)
        throw new InventorySheetReviewLimit();
      const catalog = await readSheetInventoryCatalog(
        c,
        merchantId,
        source.snapshot,
        true
      );
      const payload = inventorySheetStoredPayload.parse({
          input,
          source: source.source,
          snapshot: source.snapshot,
          plan: planSheetInventory(source.snapshot, catalog),
        }),
        encoded = bounded(payload),
        digest = store.hash({ inputHash, payload });
      await c.execute(
        "INSERT INTO inventory_sheet_reviews (merchant_id,actor_id,review_id,input_hash,digest,payload,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))",
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
export async function readInventorySheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = inventorySheetReadInput.parse(raw);
  await ready();
  return store.transaction(false, async c => {
    const merchant = await authority(c, merchantId, actorId, false),
      row = await find(c, merchantId, actorId, input.reviewId);
    if (!row) throw new ProductEditorMissing();
    return view(c, row, merchant, input);
  });
}
export async function commitInventorySheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = inventorySheetCommitInput.parse(raw),
    inputHash = store.hash({ kind: "sheet_inventory", ...input });
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
      if (Number(row.expired)) throw new InventorySheetReviewExpired();
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
      const catalog = await readSheetInventoryCatalog(
        c,
        merchantId,
        payload.snapshot,
        true
      );
      if (
        planSheetInventory(payload.snapshot, catalog).digest !==
        payload.plan.digest
      )
        throw new ProductEditorConflict();
      const db = drizzle({ client: c }),
        rows: InventorySheetReceipt["rows"] = [];
      for (const change of payload.plan.rows) {
        if (
          change.action === "blocked" ||
          change.productId === null ||
          change.after === null
        )
          throw new ProductEditorInvalid();
        if (change.action === "update") {
          const [updated] = await db
            .update(products)
            .set({ stock: change.after })
            .where(
              and(
                eq(products.id, change.productId),
                eq(products.merchantId, merchantId)
              )
            );
          if (updated.affectedRows !== 1) throw new ProductEditorConflict();
        }
        rows.push({
          number: change.number,
          action: change.action,
          productId: change.productId,
          before: change.before,
          after: change.after,
        });
      }
      const [clock] = await c.query<any[]>(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
      );
      const r = inventorySheetReceipt.parse({
        merchantId,
        actorId,
        reviewId: input.reviewId,
        requestId: input.requestId,
        kind: "sheet_inventory",
        digest: row.digest,
        sourceDigest: payload.source.digest,
        snapshotDigest: payload.snapshot.digest,
        rows,
        counts: {
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
        "UPDATE inventory_sheet_reviews SET receipt=? WHERE merchant_id=? AND actor_id=? AND review_id=? AND receipt IS NULL",
        [JSON.stringify(r), merchantId, actorId, input.reviewId]
      );
      if (saved.affectedRows !== 1) throw new ProductEditorConflict();
      return r;
    },
    true
  );
}
export async function readInventorySheetReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = inventorySheetReceiptInput.parse(raw);
  return store.transaction(false, async c => {
    await authority(c, merchantId, actorId, false);
    return priorReceipt(c, merchantId, actorId, input.requestId);
  });
}
export async function discardInventorySheetReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = inventorySheetDiscardInput.parse(raw);
  await ready();
  return store.transaction(true, async c => {
    await authority(c, merchantId, actorId, true);
    const row = await find(c, merchantId, actorId, input.reviewId, true);
    if (!row) return { discarded: true as const };
    if (row.digest !== input.expectedDigest) throw new ProductEditorConflict();
    await c.execute(
      "DELETE FROM inventory_sheet_reviews WHERE merchant_id=? AND actor_id=? AND review_id=?",
      [merchantId, actorId, input.reviewId]
    );
    return { discarded: true as const };
  });
}
