import type { PoolConnection } from "mysql2/promise";
import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";
import { privacyHashExact } from "../accounts/privacy-hash";
import { getPaymentLinkAvailability } from "../../shared/payment-link-availability";
import { PAYMENT_LINK_ID_PATTERN } from "../../shared/subscription-payment-status";
import {
  paymentLinkRecord,
  paymentLinkDetail,
  paymentLinksInput,
  paymentLinkDetailInput,
  paymentLinksWorkspace,
  paymentLinksTotals,
  paymentLinkAvailabilityStates,
  type PaymentLinkRecord,
} from "../../shared/payment-links-workspace";
import { publicPaymentUrls } from "../utils/public-url";
const columns = [
  "id",
  "merchant_id",
  "link_id",
  "title",
  "description",
  "amount",
  "currency",
  "is_fixed_amount",
  "min_amount",
  "max_amount",
  "tap_payment_url",
  "tap_charge_id",
  "max_usage_count",
  "usage_count",
  "expires_at",
  "status",
  "is_active",
  "order_id",
  "booking_id",
  "total_collected",
  "successful_payments",
  "failed_payments",
  "metadata",
  "booking_checkout_policy_version",
  "created_at",
  "updated_at",
];
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max ? v : null;
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647
    ? v
    : null;
const bool = (v: unknown) =>
  v === 1 || v === true ? true : v === 0 || v === false ? false : null;
function timestamp(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date)
    return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v !== "string") return null;
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(
      v
    );
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59)
    return null;
  const day = new Date(m[1] + "T00:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== m[1]
  )
    return null;
  const date = new Date(v.replace(" ", "T") + (m[5] ? "" : "Z"));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function projectPaymentLinkRecord(
  actorId: number,
  merchantId: number,
  row: any,
  checkedAt: Date
): PaymentLinkRecord {
  if (row.merchant_id !== merchantId)
    throw Error("payment_links:foreign_record");
  const linkId =
    typeof row.link_id === "string" && PAYMENT_LINK_ID_PATTERN.test(row.link_id)
      ? row.link_id
      : null;
  let related: PaymentLinkRecord["related"] = { kind: "none" };
  if (row.order_id != null && row.booking_id != null)
    related = { kind: "unavailable" };
  else if (row.order_id != null)
    related =
      row.owned_order_id === row.order_id
        ? { kind: "order", id: row.order_id }
        : { kind: "unavailable" };
  else if (row.booking_id != null)
    related =
      row.owned_booking_id === row.booking_id &&
      integer(row.booking_service_id) !== null &&
      row.booking_service_id > 0 &&
      row.owned_service_id === row.booking_service_id
        ? { kind: "booking", id: row.booking_id }
        : { kind: "unavailable" };
  const canonical = linkId ? publicPaymentUrls.link(linkId) : null;
  const availability = getPaymentLinkAvailability(
    {
      isActive: row.is_active,
      status: row.status,
      usageCount: row.usage_count,
      maxUsageCount: row.max_usage_count,
      expiresAt: row.expires_at,
    },
    checkedAt
  );
  const amountMinor = integer(row.amount),
    currency = ["SAR", "USD"].includes(row.currency) ? row.currency : null,
    title = text(row.title, 255),
    description = row.description == null ? null : text(row.description, 10000);
  const enabled = bool(row.is_active),
    fixedAmount = bool(row.is_fixed_amount),
    storedStatus = ["active", "disabled", "expired", "completed"].includes(
      row.status
    )
      ? row.status
      : null;
  const usageCount = integer(row.usage_count),
    maxUsageCount =
      row.max_usage_count == null ? null : integer(row.max_usage_count),
    totalCollectedMinor = integer(row.total_collected),
    successfulPayments = integer(row.successful_payments),
    failedPayments = integer(row.failed_payments);
  return paymentLinkRecord.parse({
    id: row.id,
    revision: privacyHashExact(
      JSON.stringify([
        "payment-link:v1",
        actorId,
        merchantId,
        columns.map(k => row[k]),
        related,
      ])
    ),
    linkId,
    title,
    description,
    amountMinor,
    currency,
    fixedAmount,
    minAmountMinor: integer(row.min_amount),
    maxAmountMinor: integer(row.max_amount),
    storedStatus,
    enabled,
    availability: availability.available ? "available" : availability.reason,
    usageCount,
    maxUsageCount: maxUsageCount && maxUsageCount > 0 ? maxUsageCount : null,
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    publicUrl: related.kind === "unavailable" ? null : canonical,
    related,
    totalCollectedMinor,
    successfulPayments,
    failedPayments,
    warnings: [
      ...(!linkId ? ["identity"] : []),
      ...(title === null || (row.description != null && description === null)
        ? ["text"]
        : []),
      ...(amountMinor === null ? ["amount"] : []),
      ...(currency === null ? ["currency"] : []),
      ...(enabled === null ||
      fixedAmount === null ||
      storedStatus === null ||
      (row.min_amount != null && integer(row.min_amount) === null) ||
      (row.max_amount != null && integer(row.max_amount) === null)
        ? ["configuration"]
        : []),
      ...(usageCount === null ||
      successfulPayments === null ||
      failedPayments === null ||
      totalCollectedMinor === null ||
      (row.max_usage_count != null && (!maxUsageCount || maxUsageCount < 1))
        ? ["counters"]
        : []),
      ...(["created_at", "updated_at"].some(k => timestamp(row[k]) === null) ||
      (row.expires_at != null && timestamp(row.expires_at) === null)
        ? ["timestamps"]
        : []),
      ...(related.kind === "unavailable" ? ["target"] : []),
      ...(canonical !== row.tap_payment_url ? ["url"] : []),
    ],
  });
}
const joins =
  "LEFT JOIN orders o ON o.id=p.order_id AND o.merchantId=p.merchant_id LEFT JOIN bookings b ON b.id=p.booking_id AND b.merchant_id=p.merchant_id LEFT JOIN services s ON s.id=b.service_id AND s.merchant_id=p.merchant_id";
const selected =
  columns.map(k => `p.${k}`).join(",") +
  ",o.id AS owned_order_id,b.id AS owned_booking_id,b.service_id AS booking_service_id,s.id AS owned_service_id";
// Matches the shared availability policy for MySQL's typed counters/timestamps.
const availabilitySql = `CASE WHEN p.is_active=0 THEN 'disabled' WHEN p.is_active IS NULL OR p.is_active<>1 THEN 'invalid' WHEN BINARY p.status='disabled' THEN 'disabled' WHEN BINARY p.status='completed' THEN 'exhausted' WHEN BINARY p.status='expired' THEN 'expired' WHEN p.status IS NULL OR BINARY p.status<>'active' THEN 'invalid' WHEN p.usage_count IS NULL OR p.usage_count<0 OR (p.max_usage_count IS NOT NULL AND p.max_usage_count<1) THEN 'invalid' WHEN p.expires_at IS NOT NULL AND (YEAR(p.expires_at)=0 OR MONTH(p.expires_at)=0 OR DAY(p.expires_at)=0) THEN 'invalid' WHEN p.expires_at<=? THEN 'expired' WHEN p.max_usage_count IS NOT NULL AND p.usage_count>=p.max_usage_count THEN 'exhausted' ELSE 'available' END`;
export function paymentLinksFilter(
  merchantId: number,
  raw: unknown,
  checkedAt: Date
) {
  const input = paymentLinksInput.parse(raw),
    clauses = ["p.merchant_id=?"],
    args: any[] = [merchantId],
    at = checkedAt.toISOString().slice(0, 23).replace("T", " ");
  if (input.availability !== "all") {
    clauses.push(`(${availabilitySql})=?`);
    args.push(at, input.availability);
  }
  if (input.search) {
    const term = "%" + input.search.replace(/[!%_]/g, "!$&") + "%";
    clauses.push(
      "(p.title LIKE ? ESCAPE '!' OR p.link_id LIKE ? ESCAPE '!' OR CAST(p.id AS CHAR) LIKE ? ESCAPE '!')"
    );
    args.push(term, term, term);
  }
  return { input, where: clauses.join(" AND "), args, at };
}
async function rows(tx: PoolConnection, sql: string, args: any[]) {
  const [r] = await tx.execute(sql, args);
  if (!Array.isArray(r)) throw Error("payment_links:unavailable");
  return r as any[];
}
export function readPaymentLinksWorkspace(
  actorId: number,
  merchantId: number,
  raw: unknown
) {
  const checkedAt = new Date(),
    { input, where, args, at } = paymentLinksFilter(merchantId, raw, checkedAt);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, a) => {
      const base = {
        actorId,
        merchantId,
        canView: a.isOwner,
        canManage: a.canManage,
        checkedAt: checkedAt.toISOString(),
        source: "local_payment_links",
        filters: input,
      };
      if (!a.isOwner)
        return paymentLinksWorkspace.parse({
          ...base,
          canManage: false,
          state: "restricted",
          totals: null,
          items: [],
          hasNext: false,
        });
      const groups = await rows(
        tx,
        `SELECT ${availabilitySql} AS availability,COUNT(*) AS total FROM payment_links p WHERE ${where} GROUP BY 1`,
        [at, ...args]
      );
      const states = {
        available: 0,
        disabled: 0,
        expired: 0,
        exhausted: 0,
        invalid: 0,
      };
      let total = 0;
      for (const g of groups) {
        if (
          !paymentLinkAvailabilityStates.includes(g.availability) ||
          !(
            typeof g.total === "number" ||
            (typeof g.total === "string" && /^\d+$/.test(g.total))
          )
        )
          throw Error("payment_links:invalid_total");
        const n = Number(g.total);
        if (!Number.isSafeInteger(n) || n < 0)
          throw Error("payment_links:invalid_total");
        states[g.availability as keyof typeof states] += n;
        total += n;
      }
      const totals = paymentLinksTotals.parse({ total, states });
      const saved = await rows(
        tx,
        `SELECT ${selected} FROM payment_links p ${joins} WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
        args
      );
      return paymentLinksWorkspace.parse({
        ...base,
        state: "ready",
        totals,
        items: saved.map(r =>
          projectPaymentLinkRecord(actorId, merchantId, r, checkedAt)
        ),
        hasNext: input.page * input.pageSize < total,
      });
    }
  );
}
export function readPaymentLinkDetail(
  actorId: number,
  merchantId: number,
  raw: unknown
) {
  const input = paymentLinkDetailInput.parse(raw),
    checkedAt = new Date();
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, a) => {
      const base = {
        actorId,
        merchantId,
        canView: a.isOwner,
        canManage: a.canManage,
        checkedAt: checkedAt.toISOString(),
        source: "local_payment_links",
      };
      if (!a.isOwner)
        return paymentLinkDetail.parse({
          ...base,
          canManage: false,
          state: "restricted",
          link: null,
        });
      const saved = await rows(
        tx,
        `SELECT ${selected} FROM payment_links p ${joins} WHERE p.id=? AND p.merchant_id=?`,
        [input.id, merchantId]
      );
      if (saved.length > 1) throw Error("payment_links:duplicate");
      return paymentLinkDetail.parse({
        ...base,
        state: saved.length ? "found" : "missing",
        link: saved.length
          ? projectPaymentLinkRecord(actorId, merchantId, saved[0], checkedAt)
          : null,
      });
    }
  );
}
