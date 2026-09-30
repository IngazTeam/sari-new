import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db/connection";
import { orderMinor } from "../shared/order-workspace";
import {
  customerListInput,
  customerDetailInput,
  customerListSchema,
  customerDetailSchema,
  customerRowSchema,
  customerPageSize,
  type CustomerRow,
} from "../shared/customer-workspace";

const integer = (value: unknown) => {
  const result = orderMinor(value);
  if (result === null) throw Error("Invalid customer aggregate");
  return result;
};
const iso = (value: unknown): string | null => {
  if (value == null) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const parsed = new Date(
    /[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(" ", "T") + "Z"
  );
  if (!Number.isFinite(parsed.getTime())) throw Error("Invalid customer date");
  return parsed.toISOString();
};
const text = (value: unknown) => (value == null ? null : String(value));
const paging = (total: number, page: number) => ({
  total,
  page,
  pageSize: customerPageSize as 25,
  pages: Math.ceil(total / customerPageSize),
});

/** Read-only identity projection. Stored phones and customer memory are never rewritten. */
export function customerSourceCte(merchantId: number, through: string) {
  const time = through.slice(0, 19).replace("T", " ");
  return sql`WITH raw AS (
    SELECT 'conversation' AS source, id, customerPhone AS phone, customerName AS name,
      createdAt AS created, CASE WHEN lastMessageAt<=${time} THEN lastMessageAt END AS interaction, 1 AS priority
      FROM conversations WHERE merchantId=${merchantId} AND createdAt<=${time}
    UNION ALL SELECT 'order', id, customerPhone, customerName, createdAt, createdAt, 3
      FROM orders WHERE merchantId=${merchantId} AND createdAt<=${time}
    UNION ALL SELECT 'profile', id, customer_phone, display_name, created_at,
      CASE WHEN last_seen_at<=${time} THEN last_seen_at END, 2
      FROM customer_profiles WHERE merchant_id=${merchantId} AND created_at<=${time}
    UNION ALL SELECT 'zid', id, phone, name, created_at,
      CASE WHEN last_order_at<=${time} THEN last_order_at END, 4
      FROM zid_customers WHERE merchant_id=${merchantId} AND is_active=1 AND created_at<=${time}
    UNION ALL SELECT 'loyalty', id, customer_phone, customer_name, created_at, NULL, 5
      FROM loyalty_points WHERE merchant_id=${merchantId} AND created_at<=${time}
  ), cleaned AS (
    SELECT *, TRIM(phone) AS rawPhone, REGEXP_REPLACE(TRIM(phone), '[^0-9]', '') AS digits,
      CASE WHEN TRIM(phone) REGEXP '^[+]?[0-9 ().-]+$' AND CHAR_LENGTH(TRIM(phone))<=50 THEN 1 ELSE 0 END AS numericPhone
      FROM raw
  ), normalized AS (
    SELECT *, CASE
      WHEN digits REGEXP '^00966' THEN SUBSTRING(digits,3)
      WHEN digits REGEXP '^05[0-9]{8}$' THEN CONCAT('966',SUBSTRING(digits,2))
      WHEN digits REGEXP '^5[0-9]{8}$' THEN CONCAT('966',digits)
      ELSE digits END AS normalizedDigits FROM cleaned
  ), identities AS (
    SELECT *, CAST(CASE WHEN numericPhone=1 AND normalizedDigits REGEXP '^[0-9]{8,15}$'
      AND normalizedDigits NOT REGEXP '^0+$' THEN normalizedDigits ELSE rawPhone END AS BINARY) AS customerKey
      FROM normalized WHERE rawPhone IS NOT NULL AND rawPhone<>'' AND rawPhone NOT REGEXP '[[:cntrl:]]'
  ), named AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customerKey ORDER BY
      CASE WHEN name IS NULL OR TRIM(name)='' THEN 1 ELSE 0 END,
      interaction DESC, priority ASC, id DESC) AS nameRank FROM identities
  ), grouped AS (
    SELECT customerKey,
      MAX(CASE WHEN nameRank=1 THEN NULLIF(TRIM(name),'') END) AS name,
      MIN(created) AS firstRecordedAt, MAX(interaction) AS lastInteractionAt,
      SUM(source='conversation') AS conversationCount, SUM(source='order') AS orderCount,
      SUM(source='profile') AS profileCount, SUM(source='zid') AS zidCount, SUM(source='loyalty') AS loyaltyCount
      FROM named GROUP BY customerKey
  ), customers AS (
    SELECT *, CASE WHEN lastInteractionAt IS NULL THEN 'unknown'
      WHEN lastInteractionAt>=DATE_SUB(${time}, INTERVAL 7 DAY) THEN 'active'
      WHEN lastInteractionAt>=DATE_SUB(${time}, INTERVAL 30 DAY) THEN 'recent'
      ELSE 'inactive' END AS activity FROM grouped
  )`;
}
function customer(row: Record<string, any>): CustomerRow {
  const counts = {
    conversationCount: integer(row.conversationCount),
    orderCount: integer(row.orderCount),
    profileCount: integer(row.profileCount),
    zidCount: integer(row.zidCount),
    loyaltyCount: integer(row.loyaltyCount),
  };
  return customerRowSchema.parse({
    key: String(row.customerKey),
    name: text(row.name),
    firstRecordedAt: iso(row.firstRecordedAt),
    lastInteractionAt: iso(row.lastInteractionAt),
    activity: row.activity,
    ...counts,
    sources: (
      [
        ["conversation", counts.conversationCount],
        ["order", counts.orderCount],
        ["profile", counts.profileCount],
        ["zid", counts.zidCount],
        ["loyalty", counts.loyaltyCount],
      ] as const
    )
      .filter(([, n]) => n > 0)
      .map(([source]) => source),
  });
}
async function snapshot<T>(
  merchantId: number,
  now: Date,
  run: (
    rows: (query: SQL) => Promise<Record<string, any>[]>,
    cte: SQL,
    through: string
  ) => Promise<T>
): Promise<T> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0)
    throw Error("Invalid customer merchant");
  if (!Number.isFinite(now.getTime())) throw Error("Invalid customer clock");
  const through = new Date(
    Math.floor(now.getTime() / 1000) * 1000
  ).toISOString();
  const db = await getDb();
  if (!db) throw Error("Customers unavailable");
  return db.transaction(
    async tx => {
      const rows = async (query: SQL): Promise<Record<string, any>[]> => {
        const packet = await tx.execute(query);
        if (!Array.isArray(packet[0])) throw Error("Invalid customer rows");
        return packet[0] as unknown as Record<string, any>[];
      };
      const owner = await rows(
        sql`SELECT id FROM merchants WHERE id=${merchantId}`
      );
      if (owner.length !== 1 || integer(owner[0].id) !== merchantId)
        throw Error("Customer merchant unavailable");
      return run(rows, customerSourceCte(merchantId, through), through);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
const one = (rows: Record<string, any>[]) => {
  if (rows.length !== 1) throw Error("Customer aggregate unavailable");
  return rows[0];
};
export async function readCustomerList(
  merchantId: number,
  raw: unknown,
  now = new Date()
) {
  const selection = customerListInput.parse(raw);
  return snapshot(merchantId, now, async (rows, cte, through) => {
    const month = through.slice(0, 7) + "-01 00:00:00";
    const totals = one(
      await rows(sql`${cte} SELECT COUNT(*) AS total,
      COALESCE(SUM(activity='active'),0) AS active, COALESCE(SUM(activity='recent'),0) AS recent,
      COALESCE(SUM(activity='inactive'),0) AS inactive, COALESCE(SUM(activity='unknown'),0) AS unknownCount,
      COALESCE(SUM(firstRecordedAt>=${month}),0) AS firstRecordedThisMonth,
      (SELECT COUNT(*) FROM raw WHERE phone IS NULL OR TRIM(phone)='') AS excludedEmptyIdentifiers,
      (SELECT COUNT(*) FROM raw WHERE TRIM(phone)<>'' AND TRIM(phone) REGEXP '[[:cntrl:]]') AS excludedInvalidIdentifiers FROM customers`)
    );
    const where = sql`(${selection.activity}='all' OR activity=${selection.activity})
      AND (${selection.search}='' OR LOCATE(LOWER(${selection.search}),LOWER(COALESCE(name,'')))>0
        OR LOCATE(${selection.search},CONVERT(customerKey USING utf8mb4))>0
        OR EXISTS(SELECT 1 FROM identities i WHERE i.customerKey=customers.customerKey AND LOCATE(${selection.search},i.rawPhone)>0))`;
    const filtered = integer(
      one(
        await rows(
          sql`${cte} SELECT COUNT(*) AS total FROM customers WHERE ${where}`
        )
      ).total
    );
    const records = await rows(sql`${cte} SELECT * FROM customers WHERE ${where}
      ORDER BY lastInteractionAt DESC, customerKey ASC LIMIT ${customerPageSize} OFFSET ${(selection.page - 1) * customerPageSize}`);
    return customerListSchema.parse({
      merchantId,
      through,
      selection,
      totals: {
        all: integer(totals.total),
        active: integer(totals.active),
        recent: integer(totals.recent),
        inactive: integer(totals.inactive),
        unknown: integer(totals.unknownCount),
        firstRecordedThisMonth: integer(totals.firstRecordedThisMonth),
        excludedEmptyIdentifiers: integer(totals.excludedEmptyIdentifiers),
        excludedInvalidIdentifiers: integer(totals.excludedInvalidIdentifiers),
      },
      pagination: paging(filtered, selection.page),
      rows: records.map(customer),
    });
  });
}
export async function readCustomerDetail(
  merchantId: number,
  raw: unknown,
  now = new Date()
) {
  const selection = customerDetailInput.parse(raw);
  return snapshot(merchantId, now, async (rows, cte, through) => {
    // Both the canonical key and an exact stored spelling resolve to the same scoped identity.
    const target = sql`customerKey IN (SELECT customerKey FROM identities WHERE customerKey=CAST(${selection.key} AS BINARY) OR BINARY rawPhone=BINARY ${selection.key})`;
    const found = await rows(
      sql`${cte} SELECT * FROM customers WHERE ${target}`
    );
    if (found.length > 1) throw Error("Ambiguous customer identity");
    const base = {
      merchantId,
      through,
      selection,
      customer: found[0] ? customer(found[0]) : null,
    };
    if (!base.customer)
      return customerDetailSchema.parse({
        ...base,
        amounts: [],
        loyalty: { records: 0, points: null },
        orders: { pagination: paging(0, selection.ordersPage), rows: [] },
        conversations: {
          pagination: paging(0, selection.conversationsPage),
          rows: [],
        },
      });
    const key = base.customer.key;
    const matching = (source: string) =>
      sql`SELECT id FROM identities WHERE source=${source} AND customerKey=CAST(${key} AS BINARY)`;
    const amounts =
      await rows(sql`${cte} SELECT currency, COUNT(*) AS eligibleOrders,
      SUM(totalAmount<0) AS excludedAmounts, COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) AS totalMinor,
      COALESCE(SUM(CASE WHEN totalAmount>=0 AND payment_status='paid' THEN totalAmount ELSE 0 END),0) AS markedPaidMinor
      FROM orders WHERE merchantId=${merchantId} AND id IN (${matching("order")})
      AND BINARY status IN ('paid','processing','shipped','delivered') GROUP BY currency ORDER BY currency`);
    const loyalty = one(
      await rows(sql`${cte} SELECT COUNT(*) AS records, MAX(total_points) AS points
      FROM loyalty_points WHERE merchant_id=${merchantId} AND id IN (${matching("loyalty")})`)
    );
    const orderRows =
      await rows(sql`${cte} SELECT id, orderNumber, customerPhone, currency, totalAmount, status, payment_status, createdAt
      FROM orders WHERE merchantId=${merchantId} AND id IN (${matching("order")})
      ORDER BY createdAt DESC, id DESC LIMIT ${customerPageSize} OFFSET ${(selection.ordersPage - 1) * customerPageSize}`);
    const conversationRows =
      await rows(sql`${cte} SELECT id, customerPhone, customerName, status, createdAt, lastMessageAt
      FROM conversations WHERE merchantId=${merchantId} AND id IN (${matching("conversation")})
      ORDER BY createdAt DESC, id DESC LIMIT ${customerPageSize} OFFSET ${(selection.conversationsPage - 1) * customerPageSize}`);
    const loyaltyRecords = integer(loyalty.records);
    return customerDetailSchema.parse({
      ...base,
      amounts: amounts.map(row => ({
        currency: row.currency,
        eligibleOrders: integer(row.eligibleOrders),
        excludedAmounts: integer(row.excludedAmounts),
        totalMinor: integer(row.totalMinor),
        markedPaidMinor: integer(row.markedPaidMinor),
      })),
      loyalty: {
        records: loyaltyRecords,
        points: loyaltyRecords === 1 ? orderMinor(loyalty.points) : null,
      },
      orders: {
        pagination: paging(base.customer.orderCount, selection.ordersPage),
        rows: orderRows.map(row => ({
          id: integer(row.id),
          reference: text(row.orderNumber),
          customerPhone: String(row.customerPhone),
          currency: row.currency,
          totalMinor: orderMinor(row.totalAmount),
          status: row.status,
          paymentStatus: row.payment_status,
          createdAt: iso(row.createdAt),
        })),
      },
      conversations: {
        pagination: paging(
          base.customer.conversationCount,
          selection.conversationsPage
        ),
        rows: conversationRows.map(row => ({
          id: integer(row.id),
          customerPhone: String(row.customerPhone),
          name: text(row.customerName),
          status: row.status,
          createdAt: iso(row.createdAt),
          lastMessageAt: iso(row.lastMessageAt),
        })),
      },
    });
  });
}
