import type { PoolConnection } from "mysql2/promise";
import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";
import {
  paymentHistoryInput,
  paymentHistoryDetailInput,
  paymentHistoryItem,
  paymentHistoryWorkspace,
  paymentHistoryDetail,
  paymentHistoryTotals,
  paymentHistoryStatuses,
  type PaymentHistoryDetail,
} from "../../shared/payment-history-workspace";

const validStates = paymentHistoryStatuses.filter(s => s !== "unknown");
const checkedText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max ? value : null;
const integer = (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2147483647
    ? value
    : null;
function timestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  let candidate: Date;
  if (value instanceof Date) candidate = value;
  else {
    if (typeof value !== "string") return null;
    const match =
      /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(
        value
      );
    if (
      !match ||
      Number(match[2]) > 23 ||
      Number(match[3]) > 59 ||
      Number(match[4]) > 59
    )
      return null;
    const day = new Date(match[1] + "T00:00:00Z");
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== match[1]
    )
      return null;
    candidate = new Date(value.replace(" ", "T") + (match[5] ? "" : "Z"));
  }
  return candidate && Number.isFinite(candidate.getTime())
    ? candidate.toISOString()
    : null;
}
export function projectPaymentHistoryItem(row: any) {
  const amountMinor = integer(row.amount),
    currency = ["SAR", "USD"].includes(row.currency) ? row.currency : null;
  const status = validStates.includes(row.status) ? row.status : "unknown",
    createdAt = timestamp(row.created_at);
  const customerName = checkedText(row.customer_name, 255),
    customerPhone = checkedText(row.customer_phone, 50),
    chargeId = checkedText(row.tap_charge_id, 255);
  return paymentHistoryItem.parse({
    id: row.id,
    amountMinor,
    currency,
    status,
    customerName,
    customerPhone,
    chargeId,
    paymentMethod: checkedText(row.payment_method, 50),
    createdAt,
    warnings: [
      ...(amountMinor === null ? ["amount"] : []),
      ...(currency === null ? ["currency"] : []),
      ...(status === "unknown" ? ["status"] : []),
      ...(createdAt === null ? ["createdAt"] : []),
      ...(customerPhone === null ? ["customer"] : []),
      ...(row.tap_charge_id != null && chargeId === null ? ["reference"] : []),
    ],
  });
}
function aggregateNumber(value: unknown) {
  if (
    !(
      typeof value === "number" ||
      (typeof value === "string" && /^\d+$/.test(value))
    )
  )
    throw Error("payment_history:invalid_aggregate");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw Error("payment_history:invalid_aggregate");
  return number;
}
export function projectPaymentHistoryTotals(groups: any[]) {
  const states = {
    pending: 0,
    authorized: 0,
    captured: 0,
    failed: 0,
    cancelled: 0,
    refunded: 0,
    unknown: 0,
  };
  const currencies = new Map<
    string,
    {
      currency: "SAR" | "USD";
      records: number;
      totalMinor: number;
      capturedMinor: number;
      authorizedMinor: number;
      refundedMinor: number;
    }
  >();
  let total = 0,
    excludedAmounts = 0;
  for (const row of groups) {
    if (!paymentHistoryStatuses.includes(row.status))
      throw Error("payment_history:invalid_aggregate");
    const records = aggregateNumber(row.records),
      invalid = aggregateNumber(row.invalid_amounts),
      amount = aggregateNumber(row.amount_minor);
    if (invalid > records) throw Error("payment_history:invalid_aggregate");
    total += records;
    states[row.status as keyof typeof states] += records;
    if (row.currency !== "SAR" && row.currency !== "USD") {
      if (row.currency !== null)
        throw Error("payment_history:invalid_aggregate");
      excludedAmounts += records;
      continue;
    }
    excludedAmounts += invalid;
    const currency = currencies.get(row.currency) ?? {
      currency: row.currency,
      records: 0,
      totalMinor: 0,
      capturedMinor: 0,
      authorizedMinor: 0,
      refundedMinor: 0,
    };
    currency.records += records - invalid;
    currency.totalMinor += amount;
    if (row.status === "captured") currency.capturedMinor += amount;
    if (row.status === "authorized") currency.authorizedMinor += amount;
    if (row.status === "refunded") currency.refundedMinor += amount;
    currencies.set(row.currency, currency);
  }
  return paymentHistoryTotals.parse({
    total,
    states,
    excludedAmounts,
    currencies: Array.from(currencies.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency)
    ),
  });
}
async function rows(tx: PoolConnection, sql: string, args: any[]) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw Error("payment_history:unavailable");
  return result as any[];
}
const listColumns =
  "p.id,p.amount,p.currency,p.status,p.customer_name,p.customer_phone,p.tap_charge_id,p.payment_method,p.created_at";
const statusSql =
  "CASE WHEN BINARY p.status IN ('pending','authorized','captured','failed','cancelled','refunded') THEN p.status ELSE 'unknown' END";
export function paymentHistoryFilter(merchantId: number, raw: unknown) {
  const input = paymentHistoryInput.parse(raw),
    clauses = ["p.merchant_id=?"],
    args: any[] = [merchantId];
  if (input.status !== "all") {
    clauses.push(`(${statusSql})=?`);
    args.push(input.status);
  }
  if (input.from) {
    clauses.push("p.created_at>=?");
    args.push(input.from + " 00:00:00");
  }
  if (input.to) {
    clauses.push("p.created_at<DATE_ADD(?, INTERVAL 1 DAY)");
    args.push(input.to + " 00:00:00");
  }
  if (input.search) {
    const value = "%" + input.search.replace(/[!%_]/g, "!$&") + "%";
    clauses.push(
      "(p.customer_name LIKE ? ESCAPE '!' OR p.customer_phone LIKE ? ESCAPE '!' OR p.tap_charge_id LIKE ? ESCAPE '!' OR CAST(p.id AS CHAR) LIKE ? ESCAPE '!')"
    );
    args.push(value, value, value, value);
  }
  return { input, where: clauses.join(" AND "), args };
}
export function readPaymentHistoryWorkspace(
  actorId: number,
  merchantId: number,
  raw: unknown
) {
  const { input, where, args } = paymentHistoryFilter(merchantId, raw);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, { isOwner }) => {
      const base = {
        actorId,
        merchantId,
        canView: isOwner,
        filters: input,
        checkedAt: new Date().toISOString(),
        source: "local_payment_records" as const,
      };
      if (!isOwner)
        return paymentHistoryWorkspace.parse({
          ...base,
          state: "restricted",
          totals: null,
          items: [],
          hasNext: false,
        });
      const groups = await rows(
        tx,
        `SELECT CASE WHEN BINARY p.currency='SAR' THEN 'SAR' WHEN BINARY p.currency='USD' THEN 'USD' ELSE NULL END AS currency,${statusSql} AS status,COUNT(*) AS records,SUM(CASE WHEN p.amount IS NULL OR p.amount<0 THEN 1 ELSE 0 END) AS invalid_amounts,SUM(CASE WHEN p.amount>=0 THEN p.amount ELSE 0 END) AS amount_minor FROM order_payments p WHERE ${where} GROUP BY 1,2`,
        args
      );
      const totals = projectPaymentHistoryTotals(groups);
      const saved = await rows(
        tx,
        `SELECT ${listColumns} FROM order_payments p WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
        args
      );
      return paymentHistoryWorkspace.parse({
        ...base,
        state: "ready",
        totals,
        items: saved.map(projectPaymentHistoryItem),
        hasNext: input.page * input.pageSize < totals.total,
      });
    }
  );
}
export function projectPaymentHistoryDetail(row: any) {
  const base = projectPaymentHistoryItem(row);
  let related: NonNullable<PaymentHistoryDetail["payment"]>["related"] = {
    kind: "none",
  };
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
      row.owned_service_id === row.booking_service_id
        ? { kind: "booking", id: row.booking_id }
        : { kind: "unavailable" };
  const times = {
    authorizedAt: timestamp(row.authorized_at),
    capturedAt: timestamp(row.captured_at),
    failedAt: timestamp(row.failed_at),
    refundedAt: timestamp(row.refunded_at),
    expiresAt: timestamp(row.expires_at),
    updatedAt: timestamp(row.updated_at),
  };
  const invalidTime = [
    "authorized_at",
    "captured_at",
    "failed_at",
    "refunded_at",
    "expires_at",
    "updated_at",
  ].some(key => row[key] != null && timestamp(row[key]) === null);
  return {
    ...base,
    customerEmail: checkedText(row.customer_email, 255),
    description: checkedText(row.description, 5000),
    related,
    ...times,
    hasRecordedError: !!(row.error_message || row.error_code),
    warnings: [
      ...base.warnings,
      ...(related.kind === "unavailable" ? ["target" as const] : []),
      ...(invalidTime ? ["timestamps" as const] : []),
    ],
  };
}
export function readPaymentHistoryDetail(
  actorId: number,
  merchantId: number,
  raw: unknown
) {
  const input = paymentHistoryDetailInput.parse(raw);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, { isOwner }) => {
      const base = {
        actorId,
        merchantId,
        canView: isOwner,
        checkedAt: new Date().toISOString(),
        source: "local_payment_records" as const,
      };
      if (!isOwner)
        return paymentHistoryDetail.parse({
          ...base,
          state: "restricted",
          payment: null,
        });
      const saved = await rows(
        tx,
        `SELECT ${listColumns},p.customer_email,p.description,p.order_id,p.booking_id,p.authorized_at,p.captured_at,p.failed_at,p.refunded_at,p.expires_at,p.updated_at,p.error_message,p.error_code,o.id AS owned_order_id,b.id AS owned_booking_id,b.service_id AS booking_service_id,s.id AS owned_service_id FROM order_payments p LEFT JOIN orders o ON o.id=p.order_id AND o.merchantId=p.merchant_id LEFT JOIN bookings b ON b.id=p.booking_id AND b.merchant_id=p.merchant_id LEFT JOIN services s ON s.id=b.service_id AND s.merchant_id=p.merchant_id WHERE p.id=? AND p.merchant_id=?`,
        [input.id, merchantId]
      );
      if (saved.length > 1) throw Error("payment_history:duplicate");
      return paymentHistoryDetail.parse({
        ...base,
        state: saved.length ? "found" : "missing",
        payment: saved.length ? projectPaymentHistoryDetail(saved[0]) : null,
      });
    }
  );
}
