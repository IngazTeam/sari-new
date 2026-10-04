import { getPool } from "./db/connection";
import { orderMinor, orderStates } from "../shared/order-workspace";
import {
  sheetsReportData,
  type SheetsReportData,
} from "../shared/sheets-report-data";
const count = (v: unknown) => {
  const n = orderMinor(v);
  if (n === null) throw Error("Invalid report count");
  return n;
};
export function projectSheetReportOrders(records: any[]) {
  const values = new Map<string, SheetsReportData["orderValues"][number]>(),
    products = new Map<string, number>(),
    ordersByStatus: Record<string, number> = Object.create(null);
  let excludedAmounts = 0,
    excludedItemOrders = 0;
  for (const row of records) {
    const status = orderStates.includes(row.status) ? row.status : "unknown";
    ordersByStatus[status] = (ordersByStatus[status] ?? 0) + 1;
    if (status === "cancelled") continue;
    const amount = orderMinor(row.totalAmount);
    if (amount === null || !["SAR", "USD"].includes(row.currency))
      excludedAmounts++;
    else {
      const old = values.get(row.currency) ?? {
        currency: row.currency,
        count: 0,
        totalMinor: 0,
        markedPaidMinor: 0,
      };
      old.count++;
      old.totalMinor = count(old.totalMinor + amount);
      if (row.payment_status === "paid")
        old.markedPaidMinor = count(old.markedPaidMinor + amount);
      values.set(row.currency, old);
    }
    let items: any;
    try {
      items = JSON.parse(row.items);
      if (
        !Array.isArray(items) ||
        items.length > 1000 ||
        items.some(
          item =>
            !item ||
            typeof (item.name ?? item.productName) !== "string" ||
            !(item.name ?? item.productName).trim() ||
            (item.name ?? item.productName).length > 255 ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1
        )
      )
        throw Error();
    } catch {
      excludedItemOrders++;
      continue;
    }
    for (const item of items) {
      const name = (item.name ?? item.productName).trim();
      products.set(name, count((products.get(name) ?? 0) + item.quantity));
    }
  }
  return {
    totalOrders: records.length,
    orderValues: Array.from(values.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency)
    ),
    excludedAmounts,
    excludedItemOrders,
    ordersByStatus,
    topProducts: Array.from(products)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
/** One read-only consistent snapshot. A source failure never becomes a zero report. */
export async function collectSheetReportData(
  merchantId: number,
  start: Date,
  end: Date
): Promise<SheetsReportData> {
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end < start ||
    end.getTime() - start.getTime() > 366 * 86400000
  )
    throw Error("Invalid report selection");
  const pool = await getPool();
  if (!pool) throw Error("Report storage unavailable");
  const tx = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.query("SET TRANSACTION READ ONLY");
    await tx.beginTransaction();
    const args = [merchantId, start, end],
      sqlWhere = "merchantId=? AND createdAt>=? AND createdAt<?";
    const [size] = await tx.execute<any[]>(
      `SELECT COUNT(*) AS records,COALESCE(SUM(OCTET_LENGTH(items)),0) AS bytes FROM orders WHERE ${sqlWhere}`,
      args
    );
    if (
      size.length !== 1 ||
      count(size[0].records) > 5000 ||
      count(size[0].bytes) > 2 * 1024 * 1024
    )
      throw Error("Report selection too large");
    const [orders] = await tx.execute<any[]>(
      `SELECT totalAmount,currency,status,payment_status,items FROM orders WHERE ${sqlWhere} ORDER BY id LIMIT 5001`,
      args
    );
    if (orders.length !== count(size[0].records))
      throw Error("Report snapshot mismatch");
    const [conversations] = await tx.execute<any[]>(
      `SELECT COUNT(*) AS total FROM conversations WHERE ${sqlWhere}`,
      args
    );
    const [messages] = await tx.execute<any[]>(
      "SELECT COUNT(*) AS total FROM messages m JOIN conversations c ON c.id=m.conversationId WHERE c.merchantId=? AND m.createdAt>=? AND m.createdAt<?",
      args
    );
    const [customers] = await tx.execute<any[]>(
      "SELECT COUNT(*) AS total FROM customer_profiles WHERE merchant_id=? AND created_at>=? AND created_at<?",
      args
    );
    const data = sheetsReportData.parse({
      merchantId,
      period: `${start.toISOString()} — ${end.toISOString()} (UTC)`,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      timeZone: "UTC",
      ...projectSheetReportOrders(orders),
      totalConversations: count(conversations[0]?.total),
      totalMessages: count(messages[0]?.total),
      newCustomers: count(customers[0]?.total),
    });
    committing = true;
    await tx.commit();
    return data;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await tx.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) tx.release();
    else tx.destroy();
  }
}
