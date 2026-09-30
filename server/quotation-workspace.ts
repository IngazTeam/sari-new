import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  quotationListInput,
  quotationReadInput,
  quotationStatuses,
  quotationMinor,
  quotationMonth,
  type QuotationSelection,
  type QuotationRow,
  type QuotationDetail,
  type QuotationWorkspace,
} from "../shared/quotation-workspace";

function count(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("Invalid quotation aggregate");
  return n;
}
function owner(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw Error("Invalid merchant");
}
const stamp = (v: string) => v.slice(0, 19).replace("T", " ");
const known = sql.join(
  quotationStatuses.filter(v => v !== "unknown").map(v => sql`${v}`),
  sql`, `
);
const status = sql`CASE WHEN BINARY q.status IN (${known}) THEN q.status ELSE 'unknown' END`;
// These fields identify agreements governed by the checkout/consent lifecycle.
export const quotationManagedSql = sql`(q.source_message_id IS NOT NULL OR q.consent_message_id IS NOT NULL
  OR q.checkout_snapshot IS NOT NULL OR q.external_provider IS NOT NULL OR q.external_snapshot IS NOT NULL
  OR q.execution_state IS NOT NULL OR q.order_id IS NOT NULL OR q.external_result IS NOT NULL
  OR q.execution_attempt_id IS NOT NULL OR q.external_order_key IS NOT NULL OR q.offer_expires_at IS NOT NULL)`;
const columns = sql`q.id,q.merchant_id merchantId,q.quotation_number number,q.customer_name customerName,q.customer_phone customerPhone,
  ${status} status,q.currency,q.subtotal,q.tax_amount taxAmount,q.total,
  DATE_FORMAT(q.created_at,'%Y-%m-%dT%H:%i:%s.000Z') createdAt,DATE_FORMAT(q.valid_until,'%Y-%m-%d') validUntil,
  ${quotationManagedSql} managed,q.external_provider provider,q.offer_version revision,q.tax_basis_points taxBasisPoints,
  CASE WHEN EXISTS (SELECT 1 FROM conversations c WHERE c.id=q.conversation_id AND c.merchantId=q.merchant_id) THEN q.conversation_id END conversationId,
  CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.id=q.order_id AND o.merchantId=q.merchant_id) THEN q.order_id END orderId`;
export function mapQuotationRow(r: any, now: Date): QuotationRow {
  return {
    id: count(r.id),
    merchantId: count(r.merchantId),
    number: String(r.number),
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    status: r.status,
    currency: String(r.currency),
    subtotalMinor: quotationMinor(r.subtotal),
    taxMinor: quotationMinor(r.taxAmount),
    totalMinor: quotationMinor(r.total),
    createdAt: r.createdAt,
    validUntil: r.validUntil,
    validityElapsed: Boolean(
      r.validUntil && r.validUntil < now.toISOString().slice(0, 10)
    ),
    managed: Boolean(Number(r.managed)),
    provider: r.provider,
    conversationId: r.conversationId == null ? null : count(r.conversationId),
    orderId: r.orderId == null ? null : count(r.orderId),
    revision: count(r.revision),
    taxBasisPoints: r.taxBasisPoints == null ? null : count(r.taxBasisPoints),
  };
}
export function parseQuotationItems(
  raw: string,
  truncated: boolean
): Pick<QuotationDetail, "items" | "rawItems" | "itemsTruncated"> {
  if (truncated) return { items: [], rawItems: raw, itemsTruncated: true };
  try {
    const data = JSON.parse(raw);
    if (
      !Array.isArray(data) ||
      !data.length ||
      data.length > 200 ||
      data.some(v => !v || typeof v !== "object" || typeof v.name !== "string")
    )
      throw Error("Legacy shape");
    const items = data.map(v => ({
      name: v.name,
      description: typeof v.description === "string" ? v.description : null,
      quantity:
        typeof v.quantity === "number" &&
        Number.isFinite(v.quantity) &&
        v.quantity > 0
          ? v.quantity
          : null,
      unitPriceMinor: quotationMinor(v.unitPrice),
      totalMinor: quotationMinor(v.total),
    }));
    // Keep the saved representation when its units/shape are not fully understood.
    return {
      items,
      rawItems: items.some(
        v =>
          v.quantity === null ||
          v.unitPriceMinor === null ||
          v.totalMinor === null
      )
        ? raw
        : null,
      itemsTruncated: false,
    };
  } catch {
    return { items: [], rawItems: raw, itemsTruncated: false };
  }
}
export async function readQuotationWorkspace(
  merchantId: number,
  raw: QuotationSelection,
  now = new Date()
): Promise<QuotationWorkspace> {
  owner(merchantId);
  const selection = quotationListInput.parse(raw),
    currentMonth = quotationMonth(now),
    db = await getDb();
  if (!db) throw Error("Quotations unavailable");
  return db.transaction(
    async tx => {
      const rows = async (q: ReturnType<typeof sql>) =>
        (await tx.execute(q))[0] as unknown as any[];
      const owned = sql`q.merchant_id=${merchantId}`;
      const groups = await rows(
        sql`SELECT ${status} status,COUNT(*) n FROM sales_quotations q WHERE ${owned} GROUP BY ${status}`
      );
      const statuses = quotationStatuses.map(status => ({
        status,
        count: count(groups.find(v => v.status === status)?.n ?? 0),
      }));
      const total = statuses.reduce((s, v) => s + v.count, 0),
        accepted = statuses.find(v => v.status === "accepted")!.count;
      const values =
        await rows(sql`SELECT BINARY q.currency currency,COUNT(*) n,
      SUM(CASE WHEN q.total>=0 THEN 1 ELSE 0 END) valid,SUM(CASE WHEN q.total>=0 THEN q.total*100 ELSE 0 END) minor
      FROM sales_quotations q WHERE ${owned} AND BINARY q.status='accepted' GROUP BY BINARY q.currency ORDER BY BINARY q.currency`);
      const month = sql`q.created_at>=${stamp(currentMonth.from)} AND q.created_at<=${stamp(currentMonth.through)}`;
      const [cohort] =
        await rows(sql`SELECT COUNT(*) created,COALESCE(SUM(BINARY q.status='accepted'),0) accepted,
      COALESCE(SUM(BINARY q.status='accepted' AND BINARY q.currency='SAR' AND q.total>=0),0) valid,
      COALESCE(SUM(BINARY q.status='accepted' AND BINARY q.currency='SAR' AND q.total<0),0) invalid,
      COALESCE(SUM(CASE WHEN BINARY q.status='accepted' AND BINARY q.currency='SAR' AND q.total>=0 THEN q.total*100 ELSE 0 END),0) minor
      FROM sales_quotations q WHERE ${owned} AND ${month}`);
      const [targetRow] =
        await rows(sql`SELECT id,revision,target_amount amount,DATE_FORMAT(period_start,'%Y-%m-%d') periodStart,DATE_FORMAT(period_end,'%Y-%m-%d') periodEnd
      FROM sales_targets WHERE merchant_id=${merchantId} AND period_type='monthly' AND period_start=${currentMonth.from.slice(0, 10)} LIMIT 1`);
      const target = targetRow
        ? {
            id: count(targetRow.id),
            revision: count(targetRow.revision),
            amountMinor: quotationMinor(targetRow.amount),
            periodStart: targetRow.periodStart,
            periodEnd: targetRow.periodEnd,
          }
        : null;
      // LOCATE gives literal substring search: %, _ and quotes are not SQL wildcards.
      const search = sql`(${selection.search}='' OR LOCATE(${selection.search},COALESCE(q.customer_name,''))>0
      OR LOCATE(${selection.search},COALESCE(q.customer_phone,''))>0 OR LOCATE(${selection.search},q.quotation_number)>0)`;
      const filter = sql`${owned} AND ${search} AND (${selection.status}='all' OR ${status}=${selection.status})`;
      const [matched] = await rows(
        sql`SELECT COUNT(*) n FROM sales_quotations q WHERE ${filter}`
      );
      const items =
        await rows(sql`SELECT ${columns} FROM sales_quotations q WHERE ${filter}
      ORDER BY q.created_at DESC,q.id DESC LIMIT ${selection.pageSize} OFFSET ${(selection.page - 1) * selection.pageSize}`);
      return {
        merchantId,
        selection,
        generatedAt: now.toISOString(),
        timeZone: "UTC",
        total,
        statuses,
        acceptedShare: total ? (accepted / total) * 100 : null,
        values: values.map(v => ({
          currency: Buffer.isBuffer(v.currency)
            ? v.currency.toString("utf8")
            : String(v.currency),
          count: count(v.valid),
          totalMinor: count(v.minor),
          excludedAmounts: count(v.n) - count(v.valid),
        })),
        currentMonth,
        target,
        targetBasis: {
          created: count(cohort.created),
          accepted: count(cohort.accepted),
          acceptedSar: count(cohort.valid),
          acceptedSarMinor: count(cohort.minor),
          excludedSarAmounts: count(cohort.invalid),
          progress:
            target?.amountMinor && target.amountMinor > 0
              ? (count(cohort.minor) / target.amountMinor) * 100
              : null,
        },
        list: {
          items: items.map(r => mapQuotationRow(r, now)),
          total: count(matched.n),
          totalPages: Math.ceil(count(matched.n) / selection.pageSize),
        },
        unmeasured: {
          delivered: null,
          settledRevenue: null,
          salesConversion: null,
          salesProficiency: null,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function readQuotationDetail(
  merchantId: number,
  id: number,
  now = new Date()
): Promise<QuotationDetail | null> {
  owner(merchantId);
  quotationReadInput.parse({ id });
  quotationMonth(now);
  const db = await getDb();
  if (!db) throw Error("Quotations unavailable");
  const [result] =
    await db.execute(sql`SELECT ${columns},LEFT(q.items,131072) rawItems,CHAR_LENGTH(q.items)>131072 itemsTruncated
    FROM sales_quotations q WHERE q.merchant_id=${merchantId} AND q.id=${id} LIMIT 1`);
  const r = (result as unknown as any[])[0];
  return r
    ? {
        ...mapQuotationRow(r, now),
        ...parseQuotationItems(
          String(r.rawItems),
          Boolean(Number(r.itemsTruncated))
        ),
      }
    : null;
}

/** Compatibility read retains the old bounded list size without leaking checkout snapshots. */
export async function readQuotationLegacyList(
  merchantId: number,
  limit: number,
  now = new Date()
): Promise<QuotationDetail[]> {
  owner(merchantId);
  quotationMonth(now);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw Error("Invalid quotation limit");
  const db = await getDb();
  if (!db) throw Error("Quotations unavailable");
  const [result] =
    await db.execute(sql`SELECT ${columns},LEFT(q.items,131072) rawItems,CHAR_LENGTH(q.items)>131072 itemsTruncated
    FROM sales_quotations q WHERE q.merchant_id=${merchantId} ORDER BY q.created_at DESC,q.id DESC LIMIT ${limit}`);
  return (result as unknown as any[]).map(r => ({
    ...mapQuotationRow(r, now),
    ...parseQuotationItems(
      String(r.rawItems),
      Boolean(Number(r.itemsTruncated))
    ),
  }));
}
