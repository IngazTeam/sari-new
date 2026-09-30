import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  quotationDeliveryInput,
  quotationDeliveryIdentity,
  quotationDeliveryGuard,
} from "../shared/quotation-delivery";
import {
  quotationActor,
  quotationClock,
  quotationDigest,
  quotationReviewTransaction,
  readQuotationReviewRecord,
  loadQuotationReviewBasis,
} from "./quotation-review";
import { QuotationConflict, QuotationUnavailable } from "./quotation-mutations";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { databaseTimeEpoch } from "./db/time";
import { renderPreparedQuotationPDF } from "./services/quotation-pdf";
import { sendMerchantWhatsApp } from "./channels/whatsapp/service";
import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "./channels/whatsapp/types";

const schema = () =>
  assertRuntimeSchema("reviewed quotation delivery", [
    {
      table: "quotation_deliveries",
      columns: ["review_id", "input_hash", "active_quotation_id", "projection"],
      uniqueIndexes: [
        {
          name: "uq_quotation_delivery_once",
          columns: ["merchant_id", "active_quotation_id"],
        },
      ],
    },
  ]);
const id = z.number().int().positive();
const pdfUrl = z
  .string()
  .max(4096)
  .url()
  .refine(value => {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  });
export const quotationDeliveryKey = (merchant: number, delivery: number) =>
  `quotation_review:${merchant}:${delivery}`;
async function review(c: PoolConnection, merchant: number, reviewId: number) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM quotation_delivery_reviews WHERE merchant_id=? AND id=?",
    [merchant, reviewId]
  );
  if (rows.length !== 1) throw new QuotationUnavailable();
  return readQuotationReviewRecord(rows[0]);
}
async function load(c: PoolConnection, merchant: number, deliveryId: number) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM quotation_deliveries WHERE merchant_id=? AND id=? FOR UPDATE",
    [merchant, deliveryId]
  );
  if (rows.length !== 1) throw new QuotationUnavailable();
  const row = rows[0],
    r = await review(c, merchant, Number(row.review_id)),
    s = r.snapshot;
  if (
    Number(row.quotation_id) !== s.input.quotationId ||
    Number(row.actor_id) !== s.actorId ||
    !["preparing", "ready", "dispatching"].includes(row.state) ||
    row.input_hash !==
      quotationDigest({
        merchantId: merchant,
        actorId: s.actorId,
        input: {
          requestId: row.request_id,
          reviewId: r.id,
          snapshotHash: r.snapshotHash,
          confirmed: true,
        },
      }) ||
    (row.state !== "preparing" && !pdfUrl.safeParse(row.pdf_url).success) ||
    (row.state === "dispatching" &&
      !Number.isFinite(databaseTimeEpoch(row.dispatch_started_at)))
  )
    throw new QuotationConflict();
  return { row, review: r };
}
type Loaded = Awaited<ReturnType<typeof load>>;
function sendInput(d: Loaded): SendMerchantWhatsAppInput {
  const s = d.review.snapshot;
  return {
    merchantId: s.merchantId,
    instanceRecordId: s.input.instanceRecordId,
    to: s.prepared.data.customerPhone!,
    kind: "document",
    text: s.caption,
    mediaUrl: pdfUrl.parse(d.row.pdf_url),
    fileName: `sari-${s.prepared.data.quotationNumber.replace(/[^a-zA-Z0-9-]/g, "")}.pdf`,
    idempotencyKey: quotationDeliveryKey(s.merchantId, Number(d.row.id)),
    quotationGuard: {
      deliveryId: Number(d.row.id),
      snapshotHash: d.review.snapshotHash,
    },
  };
}
async function outbox(c: PoolConnection, d: Loaded) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?",
    [
      d.review.snapshot.merchantId,
      quotationDeliveryKey(d.review.snapshot.merchantId, Number(d.row.id)),
    ]
  );
  if (!rows.length) return null;
  if (d.row.state === "preparing" || rows.length !== 1)
    throw new QuotationConflict();
  const row = rows[0],
    expected = sendInput(d),
    request =
      typeof row.request_json === "string"
        ? JSON.parse(row.request_json)
        : row.request_json;
  if (
    row.direction !== "outgoing" ||
    row.provider !== d.review.snapshot.provider ||
    Number(row.instance_id) !== expected.instanceRecordId ||
    row.message_id !== null ||
    quotationDigest(request) !==
      quotationDigest({
        to: expected.to,
        kind: expected.kind,
        text: expected.text,
        mediaUrl: expected.mediaUrl,
        fileName: expected.fileName,
        quotationGuard: expected.quotationGuard,
      })
  )
    throw new QuotationConflict();
  return row;
}
async function noEarlierSend(
  c: PoolConnection,
  d: Pick<Loaded, "review">,
  excludeId = 0
) {
  const s = d.review.snapshot;
  const [prior] = await c.execute<any[]>(
    "SELECT id FROM quotation_deliveries WHERE merchant_id=? AND quotation_id=? AND state='dispatching' AND id<>? LIMIT 1",
    [s.merchantId, s.input.quotationId, excludeId]
  );
  const [legacy] = await c.execute<any[]>(
    "SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key IN (?,?) LIMIT 1",
    [
      s.merchantId,
      `quotation:${s.merchantId}:${s.input.quotationId}:text`,
      `quotation:${s.merchantId}:${s.input.quotationId}:pdf`,
    ]
  );
  if (prior.length || legacy.length) throw new QuotationConflict();
}
async function current(c: PoolConnection, r: Loaded["review"]) {
  const s = r.snapshot,
    b = await loadQuotationReviewBasis(c, s.merchantId, s.actorId, s.input);
  if (
    b.basisDigest !== s.basisDigest ||
    b.now < s.createdAt ||
    b.now >= s.expiresAt
  )
    throw new QuotationConflict();
  return b;
}
async function receipt(c: PoolConnection, d: Loaded) {
  const row = await outbox(c, d),
    s = d.review.snapshot;
  let transport:
    | "not_attempted"
    | "unknown"
    | "suppressed"
    | "rejected"
    | "accepted"
    | "delivered"
    | "read"
    | "failed" = d.row.state === "dispatching" ? "unknown" : "not_attempted";
  if (row) {
    transport = "unknown";
    if (
      row.status === "failed" &&
      !row.provider_message_id &&
      row.error_code !== "provider_unreachable" &&
      !/^http_(?:[235]\d\d|408)$/.test(row.error_code ?? "")
    )
      transport =
        row.error_code === "quotation_suppressed" ? "suppressed" : "rejected";
    if (d.row.state === "dispatching" && row.provider_message_id) {
      if (["sent", "delivered", "read"].includes(row.status))
        transport = row.status === "sent" ? "accepted" : row.status;
      else if (row.status === "failed") transport = "failed";
    }
  }
  return {
    id: Number(d.row.id),
    requestId: String(d.row.request_id),
    merchantId: s.merchantId,
    quotationId: s.input.quotationId,
    reviewId: d.review.id,
    snapshotHash: d.review.snapshotHash,
    state: d.row.state as "preparing" | "ready" | "dispatching",
    transport,
    providerMessageId:
      d.row.state === "dispatching" && row?.provider_message_id
        ? String(row.provider_message_id)
        : null,
    projection: d.row.projection as "pending" | "recorded" | "quote_changed",
    preparationFailed: d.row.prepare_error === "pdf_unavailable",
    expired: (await quotationClock(c)) >= s.expiresAt,
    recipient: s.prepared.data.customerPhone!,
    caption: s.caption,
  };
}
/** Read/reconcile only: no provider call, file generation or retry is started here. */
async function reconcile(c: PoolConnection, d: Loaded) {
  const r = await receipt(c, d),
    s = d.review.snapshot;
  if (
    d.row.projection !== "pending" ||
    !["accepted", "delivered", "read", "failed"].includes(r.transport) ||
    !r.providerMessageId
  )
    return r;
  let sourceMatches = false;
  try {
    const currentBasis = await loadQuotationReviewBasis(
      c,
      s.merchantId,
      s.actorId,
      s.input
    );
    sourceMatches = currentBasis.basisDigest === s.basisDigest;
  } catch (error) {
    if (
      !(error instanceof QuotationConflict) &&
      !(error instanceof QuotationUnavailable) &&
      !(error instanceof z.ZodError)
    )
      throw error;
  }
  let projection: "recorded" | "quote_changed" = "quote_changed";
  if (sourceMatches) {
    if (s.status === "draft")
      await c.execute(
        "UPDATE sales_quotations SET status='sent',offer_version=offer_version+1 WHERE merchant_id=? AND id=? AND offer_version=? AND status='draft'",
        [s.merchantId, s.input.quotationId, s.input.expectedRevision]
      );
    projection = "recorded";
  }
  await c.execute(
    "UPDATE quotation_deliveries SET projection=? WHERE merchant_id=? AND id=? AND projection='pending'",
    [projection, s.merchantId, d.row.id]
  );
  await c.execute(
    "INSERT INTO sari_activity_log (merchant_id,action_type,description,details) VALUES (?,?,?,?)",
    [
      s.merchantId,
      "quotation_provider_receipt",
      "ثبت إيصال مزود لعرض السعر؛ الوصول والدفع لهما أدلة مستقلة",
      JSON.stringify({
        deliveryId: r.id,
        reviewId: r.reviewId,
        providerMessageId: r.providerMessageId,
        transport: r.transport,
        projection,
      }),
    ]
  );
  return { ...r, projection };
}
export async function readQuotationDelivery(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = quotationDeliveryIdentity.parse(raw);
  await schema();
  return quotationReviewTransaction(async c => {
    await quotationActor(c, merchantId, actorId);
    const [rows] = await c.execute<any[]>(
      "SELECT id FROM quotation_deliveries WHERE merchant_id=? AND actor_id=? AND request_id=?",
      [merchantId, actorId, input.requestId]
    );
    return rows.length
      ? reconcile(c, await load(c, merchantId, Number(rows[0].id)))
      : null;
  });
}
export async function sendReviewedQuotation(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = quotationDeliveryInput.parse(raw);
  id.parse(merchantId);
  id.parse(actorId);
  await schema();
  const hash = quotationDigest({ merchantId, actorId, input }),
    token = randomUUID();
  let d = await quotationReviewTransaction(async c => {
    await quotationActor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT id,input_hash FROM quotation_deliveries WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    let loaded: Loaded;
    if (prior.length) {
      if (prior[0].input_hash !== hash) throw new QuotationConflict();
      loaded = await load(c, merchantId, Number(prior[0].id));
    } else {
      const r = await review(c, merchantId, input.reviewId);
      if (
        r.snapshot.actorId !== actorId ||
        r.snapshotHash !== input.snapshotHash
      )
        throw new QuotationConflict();
      const [used] = await c.execute<any[]>(
        "SELECT id FROM quotation_deliveries WHERE merchant_id=? AND review_id=?",
        [merchantId, r.id]
      );
      if (used.length) throw new QuotationConflict();
      await current(c, r);
      await noEarlierSend(c, { review: r });
      const [insert] = await c.execute<any>(
        `INSERT INTO quotation_deliveries (merchant_id,quotation_id,review_id,actor_id,request_id,input_hash)
        VALUES (?,?,?,?,?,?)`,
        [
          merchantId,
          r.snapshot.input.quotationId,
          r.id,
          actorId,
          input.requestId,
          hash,
        ]
      );
      loaded = await load(c, merchantId, Number(insert.insertId));
    }
    if (loaded.row.state === "dispatching" || (await outbox(c, loaded)))
      return { loaded, claimed: false, observed: true };
    await current(c, loaded.review);
    await noEarlierSend(c, loaded, Number(loaded.row.id));
    if (loaded.row.state === "ready")
      return { loaded, claimed: false, observed: false };
    const now = Date.parse(await quotationClock(c));
    if (
      loaded.row.prepare_token &&
      databaseTimeEpoch(loaded.row.prepare_until) > now
    )
      return { loaded, claimed: false, observed: true };
    await c.execute(
      "UPDATE quotation_deliveries SET prepare_token=?,prepare_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND),prepare_error=NULL WHERE merchant_id=? AND id=? AND state='preparing'",
      [token, merchantId, loaded.row.id]
    );
    return { loaded, claimed: true, observed: false };
  });
  if (d.observed)
    return readQuotationDelivery(merchantId, actorId, {
      requestId: input.requestId,
    });
  if (d.claimed) {
    let url: string;
    try {
      url = pdfUrl.parse(
        await renderPreparedQuotationPDF(
          d.loaded.review.snapshot.prepared,
          d.loaded.review.snapshot.htmlDigest
        )
      );
    } catch {
      await quotationReviewTransaction(async c => {
        await quotationActor(c, merchantId, actorId);
        await c.execute(
          "UPDATE quotation_deliveries SET prepare_token=NULL,prepare_until=NULL,prepare_error='pdf_unavailable' WHERE merchant_id=? AND id=? AND prepare_token=? AND state='preparing'",
          [merchantId, d.loaded.row.id, token]
        );
      });
      return readQuotationDelivery(merchantId, actorId, {
        requestId: input.requestId,
      });
    }
    const saved = await quotationReviewTransaction(async c => {
      await quotationActor(c, merchantId, actorId);
      const loaded = await load(c, merchantId, Number(d.loaded.row.id));
      if (
        loaded.row.state !== "preparing" ||
        loaded.row.prepare_token !== token ||
        databaseTimeEpoch(loaded.row.prepare_until) <=
          Date.parse(await quotationClock(c))
      )
        return null;
      await current(c, loaded.review);
      await noEarlierSend(c, loaded, Number(loaded.row.id));
      await c.execute(
        "UPDATE quotation_deliveries SET state='ready',pdf_url=?,prepare_token=NULL,prepare_until=NULL WHERE merchant_id=? AND id=? AND prepare_token=?",
        [url, merchantId, loaded.row.id, token]
      );
      return load(c, merchantId, Number(loaded.row.id));
    });
    if (!saved)
      return readQuotationDelivery(merchantId, actorId, {
        requestId: input.requestId,
      });
    d = { loaded: saved, claimed: false, observed: false };
  }
  // The transport claims authorization after its lookups, immediately before provider I/O.
  try {
    await sendMerchantWhatsApp(sendInput(d.loaded));
  } catch {
    /* The durable outbox determines what is known; an exception never authorizes a resend. */
  }
  return readQuotationDelivery(merchantId, actorId, {
    requestId: input.requestId,
  });
}
export async function canDispatchQuotation(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
): Promise<boolean> {
  const parsed = quotationDeliveryGuard.safeParse(input.quotationGuard);
  if (
    !parsed.success ||
    input.retryFailed ||
    input.idempotencyKey !==
      quotationDeliveryKey(input.merchantId, parsed.data.deliveryId)
  )
    return false;
  try {
    await schema();
    return await quotationReviewTransaction(async c => {
      // Merchant -> delivery -> source; every reservation and state projection takes the same parent first.
      const [parent] = await c.execute<any[]>(
        "SELECT id FROM merchants WHERE id=? FOR UPDATE",
        [input.merchantId]
      );
      if (parent.length !== 1) return false;
      const d = await load(c, input.merchantId, parsed.data.deliveryId),
        s = d.review.snapshot;
      if (
        d.row.state !== "ready" ||
        d.review.snapshotHash !== parsed.data.snapshotHash ||
        quotationDigest(input) !== quotationDigest(sendInput(d))
      )
        return false;
      const b = await current(c, d.review);
      await noEarlierSend(c, d, Number(d.row.id));
      if (
        b.basis.accountDigest !==
        quotationDigest({
          provider: config.provider,
          instanceId: config.instanceId,
          token: config.token,
          apiUrl: config.apiUrl ?? null,
          phoneNumberId: config.phoneNumberId ?? null,
          providerAccountId: config.providerAccountId ?? null,
        })
      )
        return false;
      const observed = await outbox(c, d),
        now = await quotationClock(c);
      if (
        !observed ||
        observed.status !== "queued" ||
        observed.provider_message_id ||
        now < s.createdAt ||
        now >= s.expiresAt
      )
        return false;
      const [changed] = await c.execute<any>(
        "UPDATE quotation_deliveries SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND id=? AND state='ready' AND UTC_TIMESTAMP(3)<?",
        [s.merchantId, d.row.id, s.expiresAt.slice(0, 23).replace("T", " ")]
      );
      return Number(changed.affectedRows) === 1;
    });
  } catch {
    return false;
  }
}
