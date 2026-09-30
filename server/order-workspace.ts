import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  orderListInput,
  orderReadInput,
  orderStates,
  orderPayments,
  orderMinor,
  type OrderListRow,
  type OrderDetail,
  type OrderWorkspace,
} from "../shared/order-workspace";

const count = (value: unknown) => {
  const n = orderMinor(value);
  if (n === null) throw Error("Invalid order aggregate");
  return n;
};
const owner = (merchantId: number) => orderReadInput.parse({ id: merchantId });
const recognized = (
  column: ReturnType<typeof sql>,
  values: readonly string[]
) =>
  sql`CASE WHEN BINARY ${column} IN (${sql.join(
    values.filter(v => v !== "unknown").map(v => sql`${v}`),
    sql`,`
  )}) THEN ${column} ELSE 'unknown' END`;
const status = recognized(sql`o.status`, orderStates),
  payment = recognized(sql`o.payment_status`, orderPayments);
const columns = sql`o.id,o.merchantId,o.orderNumber number,o.customerName,o.customerPhone,${status} status,${payment} paymentStatus,
  o.currency,o.totalAmount totalMinor,o.sallaOrderId externalReference,o.checkout_review_required checkoutReviewRequired,
  DATE_FORMAT(o.createdAt,'%Y-%m-%dT%H:%i:%s.000Z') createdAt,DATE_FORMAT(o.updatedAt,'%Y-%m-%dT%H:%i:%s.000Z') updatedAt`;
export function mapOrderRow(row: any): OrderListRow {
  return {
    id: count(row.id),
    merchantId: count(row.merchantId),
    number: row.number,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    status: row.status,
    paymentStatus: row.paymentStatus,
    currency: String(row.currency),
    totalMinor: orderMinor(row.totalMinor),
    externalReference: row.externalReference,
    checkoutReviewRequired: Boolean(Number(row.checkoutReviewRequired)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
/** Raw historical JSON is preserved. Untagged price values do not prove minor units. */
export function parseOrderItems(
  rawItems: string,
  truncated: boolean
): Pick<OrderDetail, "items" | "rawItems" | "itemsState"> {
  if (truncated) return { items: [], rawItems, itemsState: "truncated" };
  try {
    const rows = JSON.parse(rawItems);
    if (
      !Array.isArray(rows) ||
      rows.length > 200 ||
      rows.some(v => !v || typeof v !== "object" || Array.isArray(v))
    )
      throw Error("Legacy items");
    const items = rows.map(v => {
      const quantity =
        typeof v.quantity === "number" &&
        Number.isSafeInteger(v.quantity) &&
        v.quantity > 0
          ? v.quantity
          : null;
      const unitPriceMinor =
        v.unitPriceMinor !== undefined
          ? orderMinor(v.unitPriceMinor)
          : v.priceUnit === "minor"
            ? orderMinor(v.price)
            : null;
      const total =
        quantity !== null && unitPriceMinor !== null
          ? quantity * unitPriceMinor
          : null;
      return {
        name: typeof v.name === "string" ? v.name : null,
        quantity,
        unitPriceMinor,
        totalMinor:
          total !== null && Number.isSafeInteger(total) ? total : null,
      };
    });
    return {
      items,
      rawItems,
      itemsState: items.every(
        v =>
          v.name !== null &&
          v.quantity !== null &&
          v.unitPriceMinor !== null &&
          v.totalMinor !== null
      )
        ? "parsed"
        : "legacy",
    };
  } catch {
    return { items: [], rawItems, itemsState: "legacy" };
  }
}
export async function readOrderWorkspace(
  merchantId: number,
  raw: unknown,
  now = new Date()
): Promise<OrderWorkspace> {
  owner(merchantId);
  if (!Number.isFinite(now.getTime())) throw Error("Invalid order clock");
  const selection = orderListInput.parse(raw),
    db = await getDb();
  if (!db) throw Error("Orders unavailable");
  return db.transaction(
    async tx => {
      const rows = async (q: ReturnType<typeof sql>) =>
        (await tx.execute(q))[0] as unknown as any[];
      const owned = sql`o.merchantId=${merchantId}`;
      const search = sql`(${selection.search}='' OR LOCATE(${selection.search},o.customerName)>0 OR LOCATE(${selection.search},o.customerPhone)>0 OR LOCATE(${selection.search},COALESCE(o.orderNumber,''))>0)`;
      const filter = sql`${owned} AND ${search} AND (${selection.status}='all' OR ${status}=${selection.status}) AND (${selection.payment}='all' OR ${payment}=${selection.payment})`;
      const [all] = await rows(
        sql`SELECT COUNT(*) n FROM orders o WHERE ${owned}`
      );
      const groups =
        await rows(sql`SELECT ${status} status,${payment} payment,BINARY o.currency currency,COUNT(*) n,
      COALESCE(SUM(o.totalAmount>=0),0) valid,COALESCE(SUM(CASE WHEN o.totalAmount>=0 THEN o.totalAmount ELSE 0 END),0) minor
      FROM orders o WHERE ${filter} GROUP BY ${status},${payment},BINARY o.currency`);
      const filtered = count(groups.reduce((n, v) => n + count(v.n), 0)),
        pages = Math.max(1, Math.ceil(filtered / 25)),
        page = Math.min(selection.page, pages);
      const items = await rows(
        sql`SELECT ${columns} FROM orders o WHERE ${filter} ORDER BY o.createdAt DESC,o.id DESC LIMIT 25 OFFSET ${(page - 1) * 25}`
      );
      const currencies = Array.from(
        new Set(
          groups.map(v =>
            Buffer.isBuffer(v.currency)
              ? v.currency.toString("utf8")
              : String(v.currency)
          )
        ),
      ).sort();
      return {
        merchantId,
        selection,
        generatedAt: now.toISOString(),
        timeZone: "UTC",
        total: count(all.n),
        filtered,
        page,
        pages,
        pageSize: 25,
        items: items.map(mapOrderRow),
        statuses: orderStates.map(s => ({
          status: s,
          count: count(
            groups
              .filter(v => v.status === s)
              .reduce((n, v) => n + count(v.n), 0)
          ),
        })),
        payments: orderPayments.map(s => ({
          status: s,
          count: count(
            groups
              .filter(v => v.payment === s)
              .reduce((n, v) => n + count(v.n), 0)
          ),
        })),
        values: currencies.map(currency => {
          const group = groups.filter(
            v =>
              (Buffer.isBuffer(v.currency)
                ? v.currency.toString("utf8")
                : String(v.currency)) === currency && v.status !== "cancelled"
          );
          return {
            currency,
            count: count(group.reduce((n, v) => n + count(v.valid), 0)),
            totalMinor: count(group.reduce((n, v) => n + count(v.minor), 0)),
            markedPaidMinor: count(
              group
                .filter(v => v.payment === "paid")
                .reduce((n, v) => n + count(v.minor), 0)
            ),
            excludedAmounts: count(
              group.reduce((n, v) => n + count(v.n) - count(v.valid), 0)
            ),
          };
        }),
        valueBasis: "filtered_non_cancelled_stored_orders",
        unmeasured: {
          settledRevenue: null,
          profit: null,
          salesConversion: null,
          salesProficiency: null,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function readOrderDetail(
  merchantId: number,
  id: number
): Promise<OrderDetail | null> {
  owner(merchantId);
  orderReadInput.parse({ id });
  const db = await getDb();
  if (!db) throw Error("Orders unavailable");
  const [result] =
    await db.execute(sql`SELECT ${columns},o.customerEmail,o.city,o.trackingNumber,o.discountCode,
    LEFT(o.address,4096) address,LEFT(o.notes,8192) notes,LEFT(o.paymentUrl,2048) paymentUrl,LEFT(o.giftMessage,8192) giftMessage,
    o.isGift,o.giftRecipientName,o.reviewRequested,DATE_FORMAT(o.reviewRequestedAt,'%Y-%m-%dT%H:%i:%s.000Z') reviewRequestedAt,
    o.checkout_subtotal_minor subtotalMinor,o.checkout_discount_minor discountMinor,o.checkout_discount_released discountReleased,
    LEFT(o.items,131072) rawItems,CHAR_LENGTH(o.items)>131072 itemsTruncated,
    CHAR_LENGTH(o.address)>4096 addressTruncated,CHAR_LENGTH(o.notes)>8192 notesTruncated,
    CHAR_LENGTH(o.paymentUrl)>2048 paymentUrlTruncated,CHAR_LENGTH(o.giftMessage)>8192 giftMessageTruncated
    FROM orders o WHERE o.merchantId=${merchantId} AND o.id=${id} LIMIT 1`);
  const row = (result as unknown as any[])[0];
  if (!row) return null;
  return {
    ...mapOrderRow(row),
    customerEmail: row.customerEmail,
    address: row.address,
    city: row.city,
    trackingNumber: row.trackingNumber,
    notes: row.notes,
    paymentUrl: row.paymentUrl,
    discountCode: row.discountCode,
    subtotalMinor: orderMinor(row.subtotalMinor),
    discountMinor: orderMinor(row.discountMinor),
    discountReleased: Boolean(Number(row.discountReleased)),
    isGift: Boolean(Number(row.isGift)),
    giftRecipientName: row.giftRecipientName,
    giftMessage: row.giftMessage,
    reviewRequested: Boolean(Number(row.reviewRequested)),
    reviewRequestedAt: row.reviewRequestedAt,
    ...parseOrderItems(
      String(row.rawItems),
      Boolean(Number(row.itemsTruncated))
    ),
    truncatedFields: ["address", "notes", "paymentUrl", "giftMessage"].filter(
      key => Boolean(Number(row[key + "Truncated"]))
    ),
  };
}
