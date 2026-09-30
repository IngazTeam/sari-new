import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import { orderMinor } from "../shared/order-workspace";
import { parseOrderItems } from "./order-workspace";
import {
  reportWindow,
  reportWorkspaceInput,
  reportSnapshotSchema,
  reportProductLimit,
  reportItemCharacters,
  type ReportSnapshot,
} from "../shared/report-workspace";

const count = (v: unknown) => {
  const n = orderMinor(v);
  if (n === null) throw Error("Invalid report aggregate");
  return n;
};
const percent = (a: number, b: number) =>
  b ? Math.round((a / b) * 10000) / 100 : null;

export function reportProducts(
  rows: { items: string; characters: unknown }[],
  eligibleOrders: number
) {
  const products = new Map<
    string,
    { name: string; quantity: number; revenue: number }
  >();
  let excludedOrders = 0,
    includedItems = 0,
    excludedItems = 0;
  for (const row of rows) {
    const parsed = parseOrderItems(
      row.items,
      count(row.characters) > reportItemCharacters
    );
    if (!parsed.items.length) {
      excludedOrders++;
      continue;
    }
    let excluded = false;
    for (const item of parsed.items) {
      const name = item.name?.trim();
      if (!name || item.quantity === null || item.totalMinor === null) {
        excludedItems++;
        excluded = true;
        continue;
      }
      const prior = products.get(name) ?? { name, quantity: 0, revenue: 0 };
      products.set(name, {
        name,
        quantity: count(prior.quantity + item.quantity),
        revenue: count(prior.revenue + item.totalMinor),
      });
      includedItems++;
    }
    if (excluded) excludedOrders++;
  }
  return {
    productSample: {
      inspectedOrders: rows.length,
      eligibleOrders,
      excludedOrders,
      includedItems,
      excludedItems,
      omittedOrders: count(eligibleOrders - rows.length),
      orderLimit: reportProductLimit as 250,
    },
    topProducts: Array.from(products.values())
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      )
      .slice(0, 5),
  };
}

export async function readReportWorkspace(
  merchantId: number,
  raw: unknown,
  now = new Date()
): Promise<ReportSnapshot> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid report merchant");
  const selection = reportWorkspaceInput.parse(raw),
    w = reportWindow(selection.period, now),
    db = await getDb();
  if (!db) throw Error("Reports unavailable");
  return db.transaction(
    async tx => {
      const rows = async (
        query: ReturnType<typeof sql>
      ): Promise<Record<string, any>[]> => {
        const packet = await tx.execute(query);
        if (!Array.isArray(packet[0])) throw Error("Invalid report rows");
        return packet[0] as unknown as Record<string, any>[];
      };
      const one = async (query: ReturnType<typeof sql>) => {
        const result = await rows(query);
        if (result.length !== 1) throw Error("Missing report aggregate");
        return result[0];
      };
      const merchant = await one(
        sql`SELECT id FROM merchants WHERE id=${merchantId}`
      );
      if (count(merchant.id) !== merchantId)
        throw Error("Invalid report owner");
      const base = {
        merchantId,
        period: selection.period,
        from: w.from,
        through: w.through,
        timeZone: "UTC" as const,
      };
      if (selection.kind === "sales") {
        // Order state alone is not evidence of settlement or revenue attribution.
        const scope = sql`merchantId=${merchantId} AND BINARY currency=${selection.currency}
        AND BINARY status IN ('paid','processing','shipped','delivered')`;
        const aggregate = (from: string, through: string) =>
          one(sql`SELECT COUNT(*) total,
        COALESCE(SUM(totalAmount>=0),0) valid,
        COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) value,
        COALESCE(SUM(CASE WHEN totalAmount>=0 AND BINARY payment_status='paid' THEN totalAmount ELSE 0 END),0) markedPaid
        FROM orders WHERE ${scope} AND createdAt>=${from} AND createdAt<=${through}`);
        const current = await aggregate(w.sqlFrom, w.sqlThrough),
          previous = await aggregate(w.sqlPreviousFrom, w.sqlPreviousThrough);
        const conv =
          await one(sql`SELECT COUNT(*) total FROM conversations WHERE merchantId=${merchantId}
        AND createdAt>=${w.sqlFrom} AND createdAt<=${w.sqlThrough}`);
        const items =
          await rows(sql`SELECT LEFT(items,${reportItemCharacters}) items,CHAR_LENGTH(items) characters FROM orders
        WHERE ${scope} AND createdAt>=${w.sqlFrom} AND createdAt<=${w.sqlThrough} ORDER BY createdAt DESC,id DESC LIMIT ${reportProductLimit}`);
        const totalOrders = count(current.total),
          valid = count(current.valid),
          value = count(current.value),
          prevValue = count(previous.value),
          conversations = count(conv.total);
        return reportSnapshotSchema.parse({
          ...base,
          kind: "sales",
          currency: selection.currency,
          previousFrom: w.previousFrom,
          previousThrough: w.previousThrough,
          totalOrders,
          validAmountOrders: valid,
          excludedAmounts: count(totalOrders - valid),
          totalRevenue: value,
          markedPaidMinor: count(current.markedPaid),
          averageOrderValue: valid ? Math.round(value / valid) : null,
          totalConversations: conversations,
          conversionRate: percent(totalOrders, conversations),
          previousRevenue: prevValue,
          previousExcludedAmounts: count(
            count(previous.total) - count(previous.valid)
          ),
          growth: prevValue
            ? Math.round(((value - prevValue) / prevValue) * 10000) / 100
            : null,
          growthAvailable: prevValue > 0,
          ...reportProducts(
            items as { items: string; characters: unknown }[],
            totalOrders
          ),
        });
      }
      if (selection.kind === "customers") {
        // Exact trimmed phone identifiers, not verified unique people.
        const stats =
          await one(sql`SELECT COUNT(DISTINCT BINARY NULLIF(TRIM(customerPhone),'')) total,
        COUNT(DISTINCT CASE WHEN createdAt>=${w.sqlFrom} THEN BINARY NULLIF(TRIM(customerPhone),'') END) recent,
        COUNT(DISTINCT CASE WHEN BINARY status='active' AND lastMessageAt>=${w.sqlFrom} AND lastMessageAt<=${w.sqlThrough}
          THEN BINARY NULLIF(TRIM(customerPhone),'') END) active,
        COALESCE(SUM(NULLIF(TRIM(customerPhone),'') IS NULL),0) unknownPhones
        FROM conversations WHERE merchantId=${merchantId} AND createdAt<=${w.sqlThrough}`);
        // Spend has no currency/unit contract. Rank by the recorded counter; retain the raw value separately.
        const top =
          await rows(sql`SELECT id conversationId,customerPhone,customerName,totalSpent,purchaseCount
        FROM conversations WHERE merchantId=${merchantId} AND createdAt<=${w.sqlThrough} AND purchaseCount>0
        ORDER BY purchaseCount DESC,id DESC LIMIT 5`);
        const total = count(stats.total),
          active = count(stats.active);
        return reportSnapshotSchema.parse({
          ...base,
          kind: "customers",
          totalCustomers: total,
          newCustomers: count(stats.recent),
          activeCustomers: active,
          unknownPhoneConversations: count(stats.unknownPhones),
          retentionRate: percent(active, total),
          topCustomers: top.map(v => ({
            conversationId: count(v.conversationId),
            customerPhone: v.customerPhone,
            customerName: v.customerName,
            purchaseCount: count(v.purchaseCount),
            totalSpent: orderMinor(v.totalSpent),
          })),
        });
      }
      const stats =
        await one(sql`SELECT COUNT(*) total,COALESCE(SUM(purchaseCount>0),0) purchases,
      COALESCE(SUM(purchaseCount<0),0) invalid FROM conversations WHERE merchantId=${merchantId}
      AND createdAt>=${w.sqlFrom} AND createdAt<=${w.sqlThrough}`);
      const total = count(stats.total),
        withPurchase = count(stats.purchases);
      return reportSnapshotSchema.parse({
        ...base,
        kind: "conversations",
        totalConversations: total,
        withPurchase,
        invalidPurchaseCounters: count(stats.invalid),
        averageResponseTime: null,
        satisfactionRate: null,
        responseTimeAvailable: false,
        satisfactionAvailable: false,
        topicsAvailable: false,
        conversionRate: percent(withPurchase, total),
        topTopics: [],
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
