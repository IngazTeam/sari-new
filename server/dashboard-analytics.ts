import { getDb } from "./db";
import { dashboardWindow } from "../shared/dashboard-window";
import { orders } from "../drizzle/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";

/**
 * الحصول على اتجاه الطلبات لآخر 30 يوم
 */
export async function getOrdersTrend(merchantId: number, days: number = 30, currency?: "SAR" | "USD", now = new Date()) {
  const window = dashboardWindow(merchantId, days, now);
  if (currency !== undefined && currency !== "SAR" && currency !== "USD") throw Error("Invalid dashboard currency");
  const db = await getDb();
  if (!db) throw Error("Dashboard data unavailable");

  const startDate = window.sqlFrom;

  const result = await db
    .select({
      date: sql<string>`DATE(${orders.createdAt})`.as('date'),
      count: sql<number>`COUNT(*)`.as('count'),
      total: sql<number>`SUM(${orders.totalAmount})`.as('total'),
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        currency ? eq(orders.currency, currency) : undefined,
        gte(orders.createdAt, startDate),
        lt(orders.createdAt, window.sqlThrough)
      )
    )
    .groupBy(sql`date`);

  return result;
}

/**
 * الحصول على اتجاه الإيرادات لآخر 30 يوم
 */
export async function getRevenueTrend(merchantId: number, days: number = 30, currency?: "SAR" | "USD", now = new Date()) {
  const window = dashboardWindow(merchantId, days, now);
  if (currency !== undefined && currency !== "SAR" && currency !== "USD") throw Error("Invalid dashboard currency");
  const db = await getDb();
  if (!db) throw Error("Dashboard data unavailable");

  const startDate = window.sqlFrom;

  const result = await db
    .select({
      date: sql<string>`DATE(${orders.createdAt})`.as('date'),
      revenue: sql<number>`SUM(${orders.totalAmount})`.as('revenue'),
      ordersCount: sql<number>`COUNT(*)`.as('ordersCount'),
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        currency ? eq(orders.currency, currency) : undefined,
        sql`${orders.status} = 'delivered'`,
        gte(orders.createdAt, startDate),
        lt(orders.createdAt, window.sqlThrough)
      )
    )
    .groupBy(sql`date`);

  return result;
}

/**
 * مقارنة الفترة الحالية مع الفترة السابقة
 */
export async function getComparisonStats(merchantId: number, days: number = 30, currency?: "SAR" | "USD", now = new Date()) {
  const window = dashboardWindow(merchantId, days, now);
  if (currency !== undefined && currency !== "SAR" && currency !== "USD") throw Error("Invalid dashboard currency");
  const db = await getDb();
  if (!db) throw Error("Dashboard data unavailable");

  const currentPeriodStart = window.sqlFrom;
  const previousPeriodStart = window.sqlPreviousFrom;

  // الفترة الحالية
  const currentPeriod = await db
    .select({
      totalOrders: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      completedOrders: sql<number>`SUM(CASE WHEN ${orders.status} = 'delivered' THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        currency ? eq(orders.currency, currency) : undefined,
        gte(orders.createdAt, currentPeriodStart),
        lt(orders.createdAt, window.sqlThrough)
      )
    );

  // الفترة السابقة
  const previousPeriod = await db
    .select({
      totalOrders: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      completedOrders: sql<number>`SUM(CASE WHEN ${orders.status} = 'delivered' THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        currency ? eq(orders.currency, currency) : undefined,
        gte(orders.createdAt, previousPeriodStart),
        lt(orders.createdAt, currentPeriodStart)
      )
    );

  const current = currentPeriod[0] || { totalOrders: 0, totalRevenue: 0, completedOrders: 0 };
  const previous = previousPeriod[0] || { totalOrders: 0, totalRevenue: 0, completedOrders: 0 };

  // حساب نسب النمو
  const ordersGrowth = previous.totalOrders > 0
    ? ((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100
    : current.totalOrders > 0 ? 100 : 0;

  const revenueGrowth = previous.totalRevenue > 0
    ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100
    : current.totalRevenue > 0 ? 100 : 0;

  const completedGrowth = previous.completedOrders > 0
    ? ((current.completedOrders - previous.completedOrders) / previous.completedOrders) * 100
    : current.completedOrders > 0 ? 100 : 0;

  const currentAOV = Number(current.totalOrders) > 0
    ? Number(current.totalRevenue) / Number(current.totalOrders)
    : 0;
  const previousAOV = Number(previous.totalOrders) > 0
    ? Number(previous.totalRevenue) / Number(previous.totalOrders)
    : 0;
  const aovGrowth = previousAOV > 0
    ? ((currentAOV - previousAOV) / previousAOV) * 100
    : currentAOV > 0 ? 100 : 0;

  return {
    current: {
      totalOrders: Number(current.totalOrders),
      totalRevenue: Number(current.totalRevenue),
      completedOrders: Number(current.completedOrders),
      averageOrderValue: Math.round(currentAOV * 100) / 100,
    },
    previous: {
      totalOrders: Number(previous.totalOrders),
      totalRevenue: Number(previous.totalRevenue),
      completedOrders: Number(previous.completedOrders),
      averageOrderValue: Math.round(previousAOV * 100) / 100,
    },
    growth: {
      orders: Math.round(ordersGrowth * 10) / 10,
      revenue: Math.round(revenueGrowth * 10) / 10,
      completed: Math.round(completedGrowth * 10) / 10,
      aov: Math.round(aovGrowth * 10) / 10,
    },
  };
}

/**
 * الحصول على أفضل المنتجات مبيعاً
 * محسّن: يستخدم JSON_TABLE في MySQL للتجميع على مستوى قاعدة البيانات
 * بدلاً من تحميل جميع الطلبات في الذاكرة
 */
export async function getTopProducts(merchantId: number, limit: number = 5, days: number = 90, currency?: "SAR" | "USD", now = new Date()): Promise<Array<{ productName: string; totalSales: number; totalRevenue: number; averagePrice: number }>> {
  const window = dashboardWindow(merchantId, days, now);
  if (currency !== undefined && currency !== "SAR" && currency !== "USD") throw Error("Invalid dashboard currency");
  const db = await getDb();
  if (!db) throw Error("Dashboard data unavailable");

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error("Invalid dashboard product limit");

  try {
    // محاولة استخدام JSON_TABLE (MySQL 8.0+) للتجميع على مستوى DB
    const results = await db.execute(sql`
      SELECT 
        item_name AS productName,
        SUM(item_qty) AS totalSales,
        ROUND(SUM(item_price * item_qty), 2) AS totalRevenue,
        ROUND(AVG(item_price), 2) AS averagePrice
      FROM ${orders},
      JSON_TABLE(${orders.items}, '$[*]' COLUMNS (
        item_name VARCHAR(255) PATH '$.name' DEFAULT '"Unknown"' ON EMPTY,
        item_qty INT PATH '$.quantity' DEFAULT '1' ON EMPTY,
        item_price DECIMAL(10,2) PATH '$.price' DEFAULT '0' ON EMPTY
      )) AS jt
      WHERE ${orders.merchantId} = ${merchantId}
        AND ${currency ? eq(orders.currency, currency) : sql`1 = 1`}
        AND ${orders.status} = 'delivered'
        AND ${orders.createdAt} >= ${window.sqlFrom}
        AND ${orders.createdAt} < ${window.sqlThrough}
      GROUP BY item_name
      ORDER BY totalSales DESC
      LIMIT ${limit}
    `);

    const rows = (results as any)[0] || [];
    return rows.map((row: any) => ({
      productName: row.productName || 'Unknown',
      totalSales: Number(row.totalSales) || 0,
      totalRevenue: Number(row.totalRevenue) || 0,
      averagePrice: Number(row.averagePrice) || 0,
    }));
  } catch (e) {
    // Fallback: الطريقة القديمة (لـ MySQL < 8.0 أو مشاكل التوافق)
    // محدود لآخر 90 يوم لتقليل حجم البيانات
    const allOrders = await db
      .select({
        items: orders.items,
      })
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, merchantId),
          currency ? eq(orders.currency, currency) : undefined,
          sql`${orders.status} = 'delivered'`,
          gte(orders.createdAt, window.sqlFrom),
          lt(orders.createdAt, window.sqlThrough)
        )
      );

    const productStats: Record<string, {
      productName: string;
      totalSales: number;
      totalRevenue: number;
    }> = Object.create(null);

    for (const order of allOrders) {
      try {
        const items = JSON.parse(order.items);
        for (const item of items) {
          const key = item.name || item.productName || 'Unknown';
          if (!productStats[key]) {
            productStats[key] = { productName: key, totalSales: 0, totalRevenue: 0 };
          }
          productStats[key].totalSales += item.quantity || 1;
          productStats[key].totalRevenue += (item.price || 0) * (item.quantity || 1);
        }
      } catch { /* ignore JSON parse errors */ }
    }

    return Object.values(productStats)
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, limit)
      .map(item => ({
        productName: item.productName,
        totalSales: item.totalSales,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        averagePrice: item.totalSales > 0
          ? Math.round((item.totalRevenue / item.totalSales) * 100) / 100
          : 0,
      }));
  }
}

/**
 * الحصول على إحصائيات Dashboard الرئيسية
 */
export async function getDashboardStats(merchantId: number, days: number = 30, currency?: "SAR" | "USD", now = new Date()) {
  const window = dashboardWindow(merchantId, days, now);
  if (currency !== undefined && currency !== "SAR" && currency !== "USD") throw Error("Invalid dashboard currency");
  const db = await getDb();
  if (!db) throw Error("Dashboard data unavailable");

  const last30Days = window.sqlFrom;

  // إجمالي الطلبات والإيرادات
  const stats = await db
    .select({
      totalOrders: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      pendingOrders: sql<number>`SUM(CASE WHEN ${orders.status} = 'pending' THEN 1 ELSE 0 END)`,
      completedOrders: sql<number>`SUM(CASE WHEN ${orders.status} = 'delivered' THEN 1 ELSE 0 END)`,
      cancelledOrders: sql<number>`SUM(CASE WHEN ${orders.status} = 'cancelled' THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        currency ? eq(orders.currency, currency) : undefined,
        gte(orders.createdAt, last30Days),
        lt(orders.createdAt, window.sqlThrough)
      )
    );

  const result = stats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
  };

  return {
    totalOrders: Number(result.totalOrders),
    totalRevenue: Number(result.totalRevenue),
    pendingOrders: Number(result.pendingOrders),
    completedOrders: Number(result.completedOrders),
    cancelledOrders: Number(result.cancelledOrders),
    averageOrderValue: result.totalOrders > 0
      ? Math.round((Number(result.totalRevenue) / Number(result.totalOrders)) * 100) / 100
      : 0,
  };
}

/**
 * ملخص لوحة التحكم - يجمع كل البيانات في استدعاء واحد
 * يقلل عدد الطلبات المتزامنة من 5 إلى 1
 */
export async function getDashboardSummary(merchantId: number, days: number = 30, topProductsLimit: number = 5, currency: "SAR" | "USD" = "SAR", now = new Date()) {
  const window = dashboardWindow(merchantId, days, now);
  const [stats, comparison, ordersTrend, revenueTrend, topProducts] = await Promise.all([
    getDashboardStats(merchantId, days, currency, now),
    getComparisonStats(merchantId, days, currency, now),
    getOrdersTrend(merchantId, days, currency, now),
    getRevenueTrend(merchantId, days, currency, now),
    getTopProducts(merchantId, topProductsLimit, days, currency, now),
  ]);

  return {
    merchantId, days, from: window.from, through: window.through, timeZone: "UTC" as const,
    currency,
    stats,
    comparison,
    ordersTrend,
    revenueTrend,
    topProducts,
  };
}
