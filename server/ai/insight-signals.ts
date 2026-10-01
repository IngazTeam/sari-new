import { sql } from 'drizzle-orm';
import { getDb } from '../db/connection';
import { readDashboardWorkspace } from '../dashboard-workspace';
import { orderMinor } from '../../shared/order-workspace';

/** Only scoped aggregates are sent to the suggestion provider, never customer records. */
export async function readInsightSignals(merchantId: number, now = new Date()) {
  const snapshot = await readDashboardWorkspace(merchantId, { days: 7 }, now);
  const db = await getDb();
  if (!db) throw Error('Insight source unavailable');
  const [rows] = await db.execute(sql`SELECT m.id, m.currency,
    (SELECT COUNT(*) FROM conversations c WHERE c.merchantId=m.id) AS conversations,
    (SELECT COUNT(*) FROM campaigns c WHERE c.merchantId=m.id) AS campaigns,
    (SELECT COUNT(*) FROM products p WHERE p.merchantId=m.id AND p.isActive=1) AS activeProducts
    FROM merchants m WHERE m.id=${merchantId}`);
  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (
    !row ||
    Number(row.id) !== merchantId ||
    row.currency !== snapshot.currency
  )
    throw Error('Insight scope changed');
  const count = (value: unknown) => {
    const result = orderMinor(value);
    if (result === null) throw Error('Invalid insight aggregate');
    return result;
  };
  return {
    currency: snapshot.currency,
    ordersPeriod: {
      from: snapshot.from,
      through: snapshot.through,
      timeZone: snapshot.timeZone,
      days: snapshot.days,
    },
    orderGrowthPercent: snapshot.growth.orders,
    orderValueGrowthPercent: snapshot.growth.value,
    orders: snapshot.current.totalOrders,
    knownOrderValueMinor: snapshot.current.totalValueMinor,
    excludedOrderValues: snapshot.current.excludedValueOrders,
    averageOrderValueMinor: snapshot.current.averageValueMinor,
    deliveredOrders: snapshot.current.deliveredOrders,
    topProductInSample: snapshot.products[0]?.name.slice(0, 100) ?? null,
    productSample: snapshot.productSample,
    storeLifetimeCounts: {
      conversations: count(row.conversations),
      campaigns: count(row.campaigns),
      activeProducts: count(row.activeProducts),
    },
  };
}
