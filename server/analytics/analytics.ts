/**
 * Advanced Analytics System
 *
 * Provides comprehensive analytics for campaigns, products, customers, and trends
 */

import { getDb, getDiscountCodesByMerchantId } from "../db";
import { eq, and, gte, lt } from "drizzle-orm";
import {
  orders,
  products,
  campaigns,
  conversations,
} from "../../drizzle/schema";

// Helper function to format Date for MySQL timestamp comparison
function formatDateForDB(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/** Validate before touching storage. Windows are [start, end) in UTC. */
function analyticsWindow(merchantId: number, range: DateRange): DateRange {
  const start = range.startDate?.getTime(),
    end = range.endDate?.getTime();
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 366 * 86400000
  )
    throw Error("Invalid analytics scope");
  const through = Math.min(end, Date.now());
  const from = Math.floor(start / 1000) * 1000,
    until = Math.floor(through / 1000) * 1000;
  if (from >= until) throw Error("Invalid analytics scope");
  return { startDate: new Date(from), endDate: new Date(until) };
}
async function analyticsDatabase() {
  const database = await getDb();
  if (!database) throw Error("Analytics storage unavailable");
  return database;
}
const orderDate = (value: string) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");

// ============================================
// Dashboard KPIs
// ============================================

export interface DashboardKPIs {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  conversionRate: number;
  revenueGrowth: number;
  ordersGrowth: number;
}

export async function getDashboardKPIs(
  merchantId: number,
  dateRange: DateRange
): Promise<DashboardKPIs> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  // Current period orders
  const currentOrders = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  const totalRevenue = currentOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );
  const totalOrders = currentOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Unique customers
  const uniqueCustomers = new Set(currentOrders.map(o => o.customerPhone)).size;

  // Total conversations for conversion rate
  const totalConversations = await database
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        gte(conversations.createdAt, formatDateForDB(dateRange.startDate)),
        lt(conversations.createdAt, formatDateForDB(dateRange.endDate))
      )
    );

  const conversionRate =
    totalConversations.length > 0
      ? (totalOrders / totalConversations.length) * 100
      : 0;

  // Previous period for growth calculation
  const periodDuration =
    dateRange.endDate.getTime() - dateRange.startDate.getTime();
  const previousStartDate = new Date(
    dateRange.startDate.getTime() - periodDuration
  );
  const previousEndDate = dateRange.startDate;

  const previousOrders = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(previousStartDate)),
        lt(orders.createdAt, formatDateForDB(previousEndDate)),
        eq(orders.status, "paid" as any)
      )
    );

  const previousRevenue = previousOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );
  const previousOrderCount = previousOrders.length;

  const revenueGrowth =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

  const ordersGrowth =
    previousOrderCount > 0
      ? ((totalOrders - previousOrderCount) / previousOrderCount) * 100
      : 0;

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    totalCustomers: uniqueCustomers,
    conversionRate,
    revenueGrowth,
    ordersGrowth,
  };
}

// ============================================
// Revenue & Orders Trends
// ============================================

export interface TrendDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

export async function getRevenueTrends(
  merchantId: number,
  dateRange: DateRange,
  groupBy: "day" | "week" | "month" = "day"
): Promise<TrendDataPoint[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  // Group by date
  const grouped = new Map<string, { revenue: number; orders: number }>();

  ordersList.forEach(order => {
    const date = orderDate(order.createdAt);
    let key: string;

    if (groupBy === "day") {
      key = date.toISOString().split("T")[0];
    } else if (groupBy === "week") {
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
      key = weekStart.toISOString().split("T")[0];
    } else {
      key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    if (!grouped.has(key)) {
      grouped.set(key, { revenue: 0, orders: 0 });
    }

    const data = grouped.get(key)!;
    data.revenue += order.totalAmount;
    data.orders += 1;
  });

  return Array.from(grouped.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================
// Top Products Analytics
// ============================================

export interface ProductAnalytics {
  productId: number;
  productName: string;
  totalSales: number;
  totalRevenue: number;
  averagePrice: number;
  stockLevel: number | null;
}

export async function getTopProducts(
  merchantId: number,
  dateRange: DateRange,
  limit: number = 10
): Promise<ProductAnalytics[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw Error("Invalid analytics limit");
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  // Parse order items and aggregate
  const productStats = new Map<
    number,
    { name: string; sales: number; revenue: number }
  >();

  for (const order of ordersList) {
    try {
      const items =
        typeof order.items === "string" ? JSON.parse(order.items) : order.items;

      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const productId = item.productId ?? item.id;
          if (!Number.isSafeInteger(productId) || productId < 1) return;

          if (!productStats.has(productId)) {
            productStats.set(productId, {
              name: item.name || item.productName || "Unknown",
              sales: 0,
              revenue: 0,
            });
          }

          const stats = productStats.get(productId)!;
          stats.sales += item.quantity || 1;
          stats.revenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    } catch (error) {
      console.error("Error parsing order items:", error);
    }
  }

  // Get product details
  const productAnalytics: ProductAnalytics[] = [];

  for (const [productId, stats] of Array.from(productStats.entries())) {
    const [product] = await database
      .select()
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.merchantId, merchantId))
      )
      .limit(1);

    productAnalytics.push({
      productId,
      productName: product?.name || stats.name,
      totalSales: stats.sales,
      totalRevenue: stats.revenue,
      averagePrice: stats.sales > 0 ? stats.revenue / stats.sales : 0,
      stockLevel: product?.stock ?? null,
    });
  }

  return productAnalytics
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

// ============================================
// Campaign Analytics
// ============================================

export interface CampaignAnalytics {
  campaignId: number;
  campaignName: string;
  sentCount: number | null;
  openRate: null;
  clickRate: null;
  conversionRate: null;
  revenue: null;
  roi: null;
}

export async function getCampaignAnalytics(
  merchantId: number,
  dateRange: DateRange
): Promise<CampaignAnalytics[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();
  const rows = await database
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.merchantId, merchantId),
        gte(campaigns.createdAt, formatDateForDB(dateRange.startDate)),
        lt(campaigns.createdAt, formatDateForDB(dateRange.endDate))
      )
    );
  // Lifetime recorded send count for campaigns created in the window. No event-level attribution exists here.
  return rows
    .map(campaign => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      sentCount:
        Number.isSafeInteger(campaign.sentCount) && campaign.sentCount >= 0
          ? campaign.sentCount
          : null,
      openRate: null,
      clickRate: null,
      conversionRate: null,
      revenue: null,
      roi: null,
    }))
    .sort((a, b) => b.campaignId - a.campaignId);
}

// ============================================
// Customer Analytics
// ============================================

export interface CustomerSegment {
  segment: "new" | "returning" | "vip";
  count: number;
  revenue: number;
  averageOrderValue: number;
}

export async function getCustomerSegments(
  merchantId: number,
  dateRange: DateRange
): Promise<CustomerSegment[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  // Get all orders for customer lifetime analysis
  const allOrders = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  // Group by customer
  const customerOrders = new Map<string, number>();
  allOrders.forEach(order => {
    const count = customerOrders.get(order.customerPhone) || 0;
    customerOrders.set(order.customerPhone, count + 1);
  });

  // Categorize customers
  const segments = {
    new: { count: 0, revenue: 0 },
    returning: { count: 0, revenue: 0 },
    vip: { count: 0, revenue: 0 },
  };

  const processedCustomers = new Set<string>();

  ordersList.forEach(order => {
    if (processedCustomers.has(order.customerPhone)) return;
    processedCustomers.add(order.customerPhone);

    const totalOrders = customerOrders.get(order.customerPhone) || 1;
    const customerRevenue = ordersList
      .filter(o => o.customerPhone === order.customerPhone)
      .reduce((sum, o) => sum + o.totalAmount, 0);

    if (totalOrders === 1) {
      segments.new.count++;
      segments.new.revenue += customerRevenue;
    } else if (totalOrders >= 5) {
      segments.vip.count++;
      segments.vip.revenue += customerRevenue;
    } else {
      segments.returning.count++;
      segments.returning.revenue += customerRevenue;
    }
  });

  return [
    {
      segment: "new",
      count: segments.new.count,
      revenue: segments.new.revenue,
      averageOrderValue:
        segments.new.count > 0 ? segments.new.revenue / segments.new.count : 0,
    },
    {
      segment: "returning",
      count: segments.returning.count,
      revenue: segments.returning.revenue,
      averageOrderValue:
        segments.returning.count > 0
          ? segments.returning.revenue / segments.returning.count
          : 0,
    },
    {
      segment: "vip",
      count: segments.vip.count,
      revenue: segments.vip.revenue,
      averageOrderValue:
        segments.vip.count > 0 ? segments.vip.revenue / segments.vip.count : 0,
    },
  ];
}

// ============================================
// Time-based Analytics
// ============================================

export interface HourlyAnalytics {
  hour: number;
  orders: number;
  revenue: number;
}

export async function getHourlyAnalytics(
  merchantId: number,
  dateRange: DateRange
): Promise<HourlyAnalytics[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  const hourlyData = new Map<number, { orders: number; revenue: number }>();

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourlyData.set(i, { orders: 0, revenue: 0 });
  }

  ordersList.forEach(order => {
    const hour = orderDate(order.createdAt).getUTCHours();
    const data = hourlyData.get(hour)!;
    data.orders++;
    data.revenue += order.totalAmount;
  });

  return Array.from(hourlyData.entries())
    .map(([hour, data]) => ({ hour, ...data }))
    .sort((a, b) => a.hour - b.hour);
}

export interface WeekdayAnalytics {
  day: string;
  dayNumber: number;
  orders: number;
  revenue: number;
}

export async function getWeekdayAnalytics(
  merchantId: number,
  dateRange: DateRange
): Promise<WeekdayAnalytics[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid" as any)
      )
    );

  const dayNames = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  const weekdayData = new Map<number, { orders: number; revenue: number }>();

  // Initialize all days
  for (let i = 0; i < 7; i++) {
    weekdayData.set(i, { orders: 0, revenue: 0 });
  }

  ordersList.forEach(order => {
    const dayNumber = orderDate(order.createdAt).getUTCDay();
    const data = weekdayData.get(dayNumber)!;
    data.orders++;
    data.revenue += order.totalAmount;
  });

  return Array.from(weekdayData.entries())
    .map(([dayNumber, data]) => ({
      day: dayNames[dayNumber],
      dayNumber,
      ...data,
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

// ============================================
// Discount Code Analytics
// ============================================

export interface DiscountAnalytics {
  code: string;
  type: string;
  value: number;
  usageCount: number;
  revenue: number;
  averageOrderValue: number;
}

export async function getDiscountCodeAnalytics(
  merchantId: number,
  dateRange: DateRange
): Promise<DiscountAnalytics[]> {
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const codes = await getDiscountCodesByMerchantId(merchantId);
  const analytics: DiscountAnalytics[] = [];

  for (const code of codes) {
    // Get orders that used this discount code
    const codeOrders = await database
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, merchantId),
          eq(orders.discountCode, code.code),
          gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
          lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
          eq(orders.status, "paid" as any)
        )
      );

    const revenue = codeOrders.reduce(
      (sum, order) => sum + order.totalAmount,
      0
    );
    const usageCount = codeOrders.length;

    analytics.push({
      code: code.code,
      type: code.type,
      value: code.value,
      usageCount,
      revenue,
      averageOrderValue: usageCount > 0 ? revenue / usageCount : 0,
    });
  }

  return analytics.sort((a, b) => b.revenue - a.revenue);
}
