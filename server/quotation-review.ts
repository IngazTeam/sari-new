import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { quotationMinor } from "../shared/quotation-workspace";
import {
  quotationReviewInput,
  quotationReviewReadInput,
  type QuotationReviewInput,
} from "../shared/quotation-review";
import { QuotationConflict, QuotationUnavailable } from "./quotation-mutations";
import { parseQuotationItems } from "./quotation-workspace";
import {
  quotationDocumentInput,
  prepareQuotationDocument,
  safeQuotationLogoDataUrl,
} from "./services/quotation-document";
import { buildQuotationHTML } from "./services/quotation-pdf";

const id = z.number().int().positive();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// Canonical JSON also verifies MySQL JSON objects, whose key order can change on read.
export function quotationDigest(value: unknown): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter(key => v[key] !== undefined)
              .map(key => [key, canonical(v[key])])
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export const quotationReviewSnapshot = z
  .object({
    version: z.literal("quotation-review.v1"),
    merchantId: id,
    actorId: id,
    input: quotationReviewInput,
    status: z.enum(["draft", "sent", "viewed"]),
    provider: z.enum(["green_api", "meta_cloud", "mock"]),
    accountLabel: z.string().max(255),
    basisDigest: digest,
    htmlDigest: digest,
    prepared: z
      .object({
        data: quotationDocumentInput,
        logoDataUrl: z.string().max(1400000).nullable(),
        logoOmitted: z.boolean(),
      })
      .strict(),
    caption: z.string().min(1).max(1024),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type QuotationReviewSnapshot = z.infer<typeof quotationReviewSnapshot>;
export async function quotationReviewTransaction<T>(
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema("quotation delivery review", [
    {
      table: "quotation_delivery_reviews",
      columns: ["snapshot_hash", "snapshot", "input_hash"],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Quotations unavailable");
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const result = await run(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
export async function quotationClock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>(
    "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') now"
  );
  return z
    .string()
    .datetime()
    .parse(String(rows[0]?.now).replace(/(\.\d{3})\d{3}Z$/, "$1Z"));
}
/** Rechecks current account/membership inside the write transaction, including explicit revocation of an owner membership. */
export async function quotationActor(
  c: PoolConnection,
  merchantId: number,
  actorId: number
) {
  id.parse(merchantId);
  id.parse(actorId);
  const [merchants] = await c.execute<any[]>(
    "SELECT id,userId,status,businessName,phone,logo_url FROM merchants WHERE id=? FOR UPDATE",
    [merchantId]
  );
  if (merchants.length !== 1) throw new QuotationUnavailable();
  const merchant = merchants[0];
  const [users] = await c.execute<any[]>(
    "SELECT account_status FROM users WHERE id=? FOR SHARE",
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
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
    !hasPermission(role as MerchantRole, "orders.manage")
  )
    throw new QuotationConflict();
  return merchant;
}
/** The caller holds the merchant lock; all commercial material is re-read in this transaction. */
export async function loadQuotationReviewBasis(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  input: QuotationReviewInput
) {
  const merchant = await quotationActor(c, merchantId, actorId),
    now = await quotationClock(c);
  const [quotes] = await c.execute<any[]>(
    `SELECT id,quotation_number,customer_name,customer_phone,offer_version,status,currency,subtotal,tax_amount,total,tax_basis_points,
    LEFT(items,131072) items,OCTET_LENGTH(items)>131072 truncated,DATE_FORMAT(valid_until,'%Y-%m-%d') valid_until,DATE_FORMAT(created_at,'%Y-%m-%d') created_at,
    (source_message_id IS NOT NULL OR consent_message_id IS NOT NULL OR checkout_snapshot IS NOT NULL OR external_provider IS NOT NULL OR external_snapshot IS NOT NULL
     OR execution_state IS NOT NULL OR order_id IS NOT NULL OR external_result IS NOT NULL OR execution_attempt_id IS NOT NULL OR external_order_key IS NOT NULL OR offer_expires_at IS NOT NULL) managed
    FROM sales_quotations WHERE merchant_id=? AND id=? FOR UPDATE`,
    [merchantId, input.quotationId]
  );
  if (quotes.length !== 1) throw new QuotationUnavailable();
  const q = quotes[0],
    parsed = parseQuotationItems(String(q.items), Boolean(Number(q.truncated)));
  if (
    Number(q.managed) ||
    Number(q.offer_version) !== input.expectedRevision ||
    !["draft", "sent", "viewed"].includes(q.status) ||
    (q.valid_until && q.valid_until < now.slice(0, 10)) ||
    parsed.rawItems !== null ||
    parsed.itemsTruncated ||
    !/^\+?\d{8,20}$/.test(q.customer_phone ?? "")
  )
    throw new QuotationConflict();
  const [accounts] = await c.execute<any[]>(
    "SELECT * FROM whatsapp_instances WHERE merchant_id=? AND id=? FOR UPDATE",
    [merchantId, input.instanceRecordId]
  );
  const a = accounts[0];
  if (
    accounts.length !== 1 ||
    a.status !== "active" ||
    !a.token ||
    !a.instance_id ||
    !["green_api", "meta_cloud", "mock"].includes(a.provider) ||
    (a.provider === "mock" && process.env.NODE_ENV !== "test") ||
    (a.provider === "meta_cloud" && !a.phone_number_id)
  )
    throw new QuotationConflict();
  let template: any = null;
  if (input.templateId !== null) {
    const [templates] = await c.execute<any[]>(
      "SELECT id,name,header_image_url,terms_text,footer_text FROM quotation_templates WHERE merchant_id=? AND id=? FOR SHARE",
      [merchantId, input.templateId]
    );
    if (templates.length !== 1) throw new QuotationUnavailable();
    template = templates[0];
  }
  const major = (v: unknown) => {
    const n = quotationMinor(v);
    if (n === null) throw new QuotationConflict();
    return n / 100;
  };
  const data = quotationDocumentInput.parse({
    quotationNumber: q.quotation_number,
    merchantName: merchant.businessName,
    merchantPhone: merchant.phone,
    merchantLogo: merchant.logo_url || template?.header_image_url || null,
    customerName: q.customer_name,
    customerPhone: q.customer_phone,
    items: parsed.items.map(v => ({
      name: v.name,
      description: v.description,
      quantity: v.quantity,
      unitPrice: v.unitPriceMinor === null ? null : v.unitPriceMinor / 100,
      total: v.totalMinor === null ? null : v.totalMinor / 100,
    })),
    subtotal: major(q.subtotal),
    taxAmount: major(q.tax_amount),
    total: major(q.total),
    taxRate:
      q.tax_basis_points === null
        ? undefined
        : Number(q.tax_basis_points) / 10000,
    currency: q.currency,
    createdAt: q.created_at,
    validUntil: q.valid_until,
    termsText: template?.terms_text ?? null,
    footerText: template?.footer_text ?? null,
  });
  const caption = `📄 عرض سعر #${data.quotationNumber} — ${data.merchantName}`;
  const basis = {
    merchantId,
    actorId,
    quotationId: input.quotationId,
    revision: input.expectedRevision,
    status: q.status,
    instanceRecordId: input.instanceRecordId,
    provider: a.provider,
    accountLabel: String(a.phone_number || a.instance_id),
    accountDigest: quotationDigest({
      provider: a.provider,
      instanceId: a.instance_id,
      token: a.token,
      apiUrl: a.api_url ?? null,
      phoneNumberId: a.phone_number_id ?? null,
      providerAccountId: a.provider_account_id ?? null,
    }),
    templateId: input.templateId,
    templateName: template?.name ?? null,
    data,
    caption,
  };
  return { basis, basisDigest: quotationDigest(basis), now };
}
export function readQuotationReviewRecord(row: any) {
  try {
    const raw =
      typeof row.snapshot === "string"
        ? JSON.parse(row.snapshot)
        : row.snapshot;
    const snapshot = quotationReviewSnapshot.parse(raw);
    if (
      quotationDigest(raw) !== row.snapshot_hash ||
      quotationDigest(snapshot) !== row.snapshot_hash ||
      snapshot.merchantId !== Number(row.merchant_id) ||
      snapshot.actorId !== Number(row.actor_id) ||
      snapshot.input.quotationId !== Number(row.quotation_id) ||
      snapshot.input.requestId !== row.request_id ||
      snapshot.prepared.data.merchantLogo != null ||
      (snapshot.prepared.logoDataUrl !== null &&
        safeQuotationLogoDataUrl(snapshot.prepared.logoDataUrl) === null) ||
      Date.parse(snapshot.expiresAt) - Date.parse(snapshot.createdAt) !==
        15 * 60_000
    )
      throw new QuotationConflict();
    return {
      id: id.parse(Number(row.id)),
      snapshot,
      snapshotHash: String(row.snapshot_hash),
    };
  } catch {
    throw new QuotationConflict();
  }
}
export function publicQuotationReview(
  record: ReturnType<typeof readQuotationReviewRecord>,
  now: string
) {
  const s = record.snapshot;
  return {
    id: record.id,
    requestId: s.input.requestId,
    merchantId: s.merchantId,
    quotationId: s.input.quotationId,
    revision: s.input.expectedRevision,
    actorId: s.actorId,
    snapshotHash: record.snapshotHash,
    status: s.status,
    instanceRecordId: s.input.instanceRecordId,
    provider: s.provider,
    accountLabel: s.accountLabel,
    templateId: s.input.templateId,
    document: s.prepared,
    caption: s.caption,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    expired: now < s.createdAt || now >= s.expiresAt,
    sent: false as const,
  };
}
export async function prepareQuotationReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = quotationReviewInput.parse(raw),
    inputHash = quotationDigest({ merchantId, actorId, input });
  // A retry restores the first snapshot, even if the source/remote logo has changed since.
  const first = await quotationReviewTransaction(async c => {
    await quotationActor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT * FROM quotation_delivery_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior[0].input_hash !== inputHash) throw new QuotationConflict();
      return {
        prior: publicQuotationReview(
          readQuotationReviewRecord(prior[0]),
          await quotationClock(c)
        ),
        current: null,
      };
    }
    return {
      prior: null,
      current: await loadQuotationReviewBasis(c, merchantId, actorId, input),
    };
  });
  if (first.prior) return first.prior;
  const initial = first.current!,
    prepared = await prepareQuotationDocument(initial.basis.data);
  // Resource fetches happen outside locks; compare the complete source after they finish.
  return quotationReviewTransaction(async c => {
    await quotationActor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT * FROM quotation_delivery_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior[0].input_hash !== inputHash) throw new QuotationConflict();
      return publicQuotationReview(
        readQuotationReviewRecord(prior[0]),
        await quotationClock(c)
      );
    }
    const current = await loadQuotationReviewBasis(
      c,
      merchantId,
      actorId,
      input
    );
    if (
      current.basisDigest !== initial.basisDigest ||
      current.now < initial.now
    )
      throw new QuotationConflict();
    const snapshot = quotationReviewSnapshot.parse({
      version: "quotation-review.v1",
      merchantId,
      actorId,
      input,
      status: current.basis.status,
      provider: current.basis.provider,
      accountLabel: current.basis.accountLabel,
      basisDigest: current.basisDigest,
      htmlDigest: quotationDigest(
        buildQuotationHTML(prepared.data, prepared.logoDataUrl)
      ),
      prepared,
      caption: current.basis.caption,
      createdAt: current.now,
      expiresAt: new Date(Date.parse(current.now) + 15 * 60_000).toISOString(),
    });
    const snapshotHash = quotationDigest(snapshot);
    const [insert] = await c.execute<any>(
      `INSERT INTO quotation_delivery_reviews (merchant_id,quotation_id,actor_id,request_id,input_hash,snapshot_hash,snapshot,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`,
      [
        merchantId,
        input.quotationId,
        actorId,
        input.requestId,
        inputHash,
        snapshotHash,
        JSON.stringify(snapshot),
        snapshot.expiresAt.slice(0, 23).replace("T", " "),
      ]
    );
    return publicQuotationReview(
      { id: Number(insert.insertId), snapshot, snapshotHash },
      current.now
    );
  });
}
export async function readQuotationReview(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = quotationReviewReadInput.parse(raw);
  return quotationReviewTransaction(async c => {
    await quotationActor(c, merchantId, actorId);
    const [rows] = await c.execute<any[]>(
      "SELECT * FROM quotation_delivery_reviews WHERE merchant_id=? AND actor_id=? AND request_id=?",
      [merchantId, actorId, input.requestId]
    );
    return rows.length
      ? publicQuotationReview(
          readQuotationReviewRecord(rows[0]),
          await quotationClock(c)
        )
      : null;
  });
}
