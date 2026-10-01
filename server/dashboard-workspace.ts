import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import { parseOrderItems } from "./order-workspace";
import { orderMinor } from "../shared/order-workspace";
import { dashboardWindow } from "../shared/dashboard-window";
import {
  dashboardWorkspaceInput,
  dashboardWorkspaceSchema,
  dashboardProductOrderLimit,
  dashboardProductCharacters,
  type DashboardWorkspace,
} from "../shared/dashboard-workspace";
const count = (v: unknown) => {
  const n = orderMinor(v);
  if (n === null) throw Error("Invalid dashboard aggregate");
  return n;
};
export function dashboardProductSample(
  rows: { items: string; characters: unknown }[],
  eligibleOrders: number
) {
  const grouped = new Map<
    string,
    { name: string; quantity: number; valueMinor: number }
  >();
  let excludedOrders = 0,
    excludedItems = 0,
    includedItems = 0;
  for (const row of rows) {
    const parsed = parseOrderItems(
      row.items,
      count(row.characters) > dashboardProductCharacters
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
      const prior = grouped.get(name) || { name, quantity: 0, valueMinor: 0 };
      grouped.set(name, {
        name,
        quantity: count(prior.quantity + item.quantity),
        valueMinor: count(prior.valueMinor + item.totalMinor),
      });
      includedItems++;
    }
    if (excluded) excludedOrders++;
  }
  return {
    products: Array.from(grouped.values())
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      )
      .slice(0, 5)
      .map(p => ({
        ...p,
        averageUnitMinor: Math.round(p.valueMinor / p.quantity),
      })),
    productSample: {
      eligibleOrders: count(eligibleOrders),
      inspectedOrders: rows.length,
      omittedOrders: count(eligibleOrders - rows.length),
      excludedOrders,
      excludedItems,
      includedItems,
      orderLimit: dashboardProductOrderLimit as 250,
    },
  };
}
export async function readDashboardWorkspace(
  merchantId: number,
  raw: unknown,
  now = new Date()
): Promise<DashboardWorkspace> {
  const { days } = dashboardWorkspaceInput.parse(raw),
    w = dashboardWindow(merchantId, days, now),
    db = await getDb();
  if (!db) throw Error("Dashboard unavailable");
  const from = Date.parse(w.from) / 1000,
    through = Date.parse(w.through) / 1000,
    previousFrom = Date.parse(w.previousFrom) / 1000;
  return db.transaction(
    async tx => {
      const rows = async (
        q: ReturnType<typeof sql>
      ): Promise<Record<string, any>[]> => {
        const result = (await tx.execute(q))[0];
        if (!Array.isArray(result)) throw Error("Invalid dashboard rows");
        return result as any;
      };
      const one = async (q: ReturnType<typeof sql>) => {
        const values = await rows(q);
        if (values.length !== 1) throw Error("Missing dashboard aggregate");
        return values[0];
      };
      const merchant = await one(
        sql`SELECT id,currency FROM merchants WHERE id=${merchantId}`
      );
      if (
        count(merchant.id) !== merchantId ||
        !["SAR", "USD"].includes(merchant.currency)
      )
        throw Error("Invalid dashboard owner");
      const currency = merchant.currency as "SAR" | "USD";
      // FROM_UNIXTIME compares in the connection's session zone. Grouping below
      // derives UTC dates from epoch seconds without needing MySQL zone tables.
      const scope = sql`merchantId=${merchantId} AND BINARY currency=${currency}`;
      const aggregate = async (start: number, end: number) => {
        const row =
          await one(sql`SELECT COUNT(*) total,COALESCE(SUM(totalAmount>=0),0) valid,
        COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) value,
        COALESCE(SUM(BINARY status='delivered'),0) delivered,
        COALESCE(SUM(CASE WHEN BINARY status='delivered' AND totalAmount>=0 THEN totalAmount ELSE 0 END),0) deliveredValue,
        COALESCE(SUM(BINARY status='delivered' AND totalAmount<0),0) invalidDelivered
        FROM orders WHERE ${scope} AND createdAt>=FROM_UNIXTIME(${start}) AND createdAt<FROM_UNIXTIME(${end})`);
        const totalOrders = count(row.total),
          validValueOrders = count(row.valid),
          totalValueMinor = count(row.value);
        return {
          totalOrders,
          validValueOrders,
          excludedValueOrders: count(totalOrders - validValueOrders),
          totalValueMinor,
          deliveredOrders: count(row.delivered),
          deliveredValueMinor: count(row.deliveredValue),
          excludedDeliveredValues: count(row.invalidDelivered),
          averageValueMinor: validValueOrders
            ? Math.round(totalValueMinor / validValueOrders)
            : null,
        };
      };
      const current = await aggregate(from, through),
        previous = await aggregate(previousFrom, from);
      const trendRows =
        await rows(sql`SELECT DATE_FORMAT(DATE_ADD('1970-01-01',INTERVAL UNIX_TIMESTAMP(createdAt) SECOND),'%Y-%m-%d') date,
      COUNT(*) total,COALESCE(SUM(BINARY status='delivered'),0) delivered,
      COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) value,
      COALESCE(SUM(CASE WHEN BINARY status='delivered' AND totalAmount>=0 THEN totalAmount ELSE 0 END),0) deliveredValue,
      COALESCE(SUM(totalAmount<0),0) invalid
      FROM orders WHERE ${scope} AND createdAt>=FROM_UNIXTIME(${from}) AND createdAt<FROM_UNIXTIME(${through}) GROUP BY date ORDER BY date`);
      const items =
        await rows(sql`SELECT LEFT(items,${dashboardProductCharacters}) items,CHAR_LENGTH(items) characters FROM orders
      WHERE ${scope} AND BINARY status='delivered' AND createdAt>=FROM_UNIXTIME(${from}) AND createdAt<FROM_UNIXTIME(${through}) ORDER BY createdAt DESC,id DESC LIMIT ${dashboardProductOrderLimit}`);
      const growth = (value: number, prior: number) =>
        prior ? Math.round(((value - prior) / prior) * 10000) / 100 : null;
      return dashboardWorkspaceSchema.parse({
        version: 1,
        merchantId,
        days,
        currency,
        timeZone: "UTC",
        from: w.from,
        through: w.through,
        previousFrom: w.previousFrom,
        current,
        previous,
        growth: {
          orders: growth(current.totalOrders, previous.totalOrders),
          value:
            current.excludedValueOrders || previous.excludedValueOrders
              ? null
              : growth(current.totalValueMinor, previous.totalValueMinor),
        },
        trend: trendRows.map(row => ({
          date: row.date,
          orders: count(row.total),
          deliveredOrders: count(row.delivered),
          valueMinor: count(row.value),
          deliveredValueMinor: count(row.deliveredValue),
          excludedValues: count(row.invalid),
        })),
        ...dashboardProductSample(items as any, current.deliveredOrders),
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
