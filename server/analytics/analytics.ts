/**
 * Advanced Analytics System
 *
 * Provides comprehensive analytics for campaigns, products, customers, and trends
 */

import { getDb, getDiscountCodesByMerchantId } from "../db";
import { TRPCError } from "@trpc/server";
import { orderMinor } from "../../shared/order-workspace";
import { eq, and, gte, lt } from "drizzle-orm";
import { orders, products, campaigns } from "../../drizzle/schema";

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
export function resolveAnalyticsCurrency(
  actual: string,
  expected?: string
): "SAR" | "USD" {
  validateCurrency(actual);
  if (expected !== undefined && expected !== actual)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Store currency changed. Reload analytics.",
    });
  return actual as "SAR" | "USD";
}
function validateCurrency(currency: string) {
  if (currency !== "SAR" && currency !== "USD")
    throw Error("Invalid analytics currency");
}
function amount(value: unknown): number {
  const n = orderMinor(value);
  if (n === null) throw Error("Invalid analytics amount");
  return n;
}
function addAmount(a: number, b: number): number {
  return amount(a + b);
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
  averageOrderValue: number | null;
  totalCustomers: number;
  conversionRate: null;
  revenueGrowth: number | null;
  ordersGrowth: number | null;
}

export async function getDashboardKPIs(
  merchantId: number,
  dateRange: DateRange,
  currency: "SAR" | "USD" = "SAR"
): Promise<DashboardKPIs> {
  validateCurrency(currency);
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  // Current period orders
  const currentOrders = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
      )
    );

  const totalRevenue = currentOrders.reduce(
    (sum, order) => addAmount(sum, amount(order.totalAmount)),
    0
  );
  const totalOrders = currentOrders.length;
  const averageOrderValue =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : null;

  // Unique customers
  const uniqueCustomers = new Set(
    currentOrders.map(o => o.customerPhone.trim()).filter(Boolean)
  ).size;

  const conversionRate = null;

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
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(previousStartDate)),
        lt(orders.createdAt, formatDateForDB(previousEndDate)),
        eq(orders.status, "paid")
      )
    );

  const previousRevenue = previousOrders.reduce(
    (sum, order) => addAmount(sum, amount(order.totalAmount)),
    0
  );
  const previousOrderCount = previousOrders.length;

  const revenueGrowth =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : null;

  const ordersGrowth =
    previousOrderCount > 0
      ? ((totalOrders - previousOrderCount) / previousOrderCount) * 100
      : null;

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
  groupBy: "day" | "week" | "month" = "day",
  currency: "SAR" | "USD" = "SAR"
): Promise<TrendDataPoint[]> {
  validateCurrency(currency);
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
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
    data.revenue = addAmount(data.revenue, amount(order.totalAmount));
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
  limit: number = 10,
  currency: "SAR" | "USD" = "SAR"
): Promise<ProductAnalytics[]> {
  validateCurrency(currency);
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
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
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
          if (!item || typeof item !== "object" || Array.isArray(item)) return;
          const productId = item.productId ?? item.id;
          if (!Number.isSafeInteger(productId) || productId < 1) return;

          const quantity = item.quantity;
          const price =
            item.unitPriceMinor !== undefined
              ? orderMinor(item.unitPriceMinor)
              : item.priceUnit === "minor"
                ? orderMinor(item.price)
                : null;
          if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            price === null ||
            !Number.isSafeInteger(quantity * price)
          )
            return;
          if (!productStats.has(productId)) {
            productStats.set(productId, {
              name:
                typeof item.name === "string"
                  ? item.name
                  : typeof item.productName === "string"
                    ? item.productName
                    : "Unknown",
              sales: 0,
              revenue: 0,
            });
          }

          const stats = productStats.get(productId)!;
          stats.sales = addAmount(stats.sales, quantity);
          stats.revenue = addAmount(stats.revenue, price * quantity);
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
      averagePrice: Math.round(stats.revenue / stats.sales),
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
  averageOrderValue: number | null;
}

export async function getCustomerSegments(
  merchantId: number,
  dateRange: DateRange,
  currency: "SAR" | "USD" = "SAR"
): Promise<CustomerSegment[]> {
  validateCurrency(currency);
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
      )
    );

  // Get all orders for customer lifetime analysis
  const allOrders = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
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
    new: { count: 0, revenue: 0, orders: 0 },
    returning: { count: 0, revenue: 0, orders: 0 },
    vip: { count: 0, revenue: 0, orders: 0 },
  };

  const processedCustomers = new Set<string>();

  ordersList.forEach(order => {
    if (
      !order.customerPhone.trim() ||
      processedCustomers.has(order.customerPhone)
    )
      return;
    processedCustomers.add(order.customerPhone);

    const totalOrders = customerOrders.get(order.customerPhone) || 1;
    const customerRevenue = ordersList
      .filter(o => o.customerPhone === order.customerPhone)
      .reduce((sum, o) => addAmount(sum, amount(o.totalAmount)), 0);

    const ordersInPeriod = ordersList.filter(
      o => o.customerPhone === order.customerPhone
    ).length;
    if (totalOrders === 1) {
      segments.new.count++;
      segments.new.revenue = addAmount(segments.new.revenue, customerRevenue);
      segments.new.orders += ordersInPeriod;
    } else if (totalOrders >= 5) {
      segments.vip.count++;
      segments.vip.revenue = addAmount(segments.vip.revenue, customerRevenue);
      segments.vip.orders += ordersInPeriod;
    } else {
      segments.returning.count++;
      segments.returning.revenue = addAmount(
        segments.returning.revenue,
        customerRevenue
      );
      segments.returning.orders += ordersInPeriod;
    }
  });

  return [
    {
      segment: "new",
      count: segments.new.count,
      revenue: segments.new.revenue,
      averageOrderValue:
        segments.new.orders > 0
          ? Math.round(segments.new.revenue / segments.new.orders)
          : null,
    },
    {
      segment: "returning",
      count: segments.returning.count,
      revenue: segments.returning.revenue,
      averageOrderValue:
        segments.returning.orders > 0
          ? Math.round(segments.returning.revenue / segments.returning.orders)
          : null,
    },
    {
      segment: "vip",
      count: segments.vip.count,
      revenue: segments.vip.revenue,
      averageOrderValue:
        segments.vip.orders > 0
          ? Math.round(segments.vip.revenue / segments.vip.orders)
          : null,
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
  dateRange: DateRange,
  currency: "SAR" | "USD" = "SAR"
): Promise<HourlyAnalytics[]> {
  validateCurrency(currency);
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
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
    data.revenue = addAmount(data.revenue, amount(order.totalAmount));
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
  dateRange: DateRange,
  currency: "SAR" | "USD" = "SAR"
): Promise<WeekdayAnalytics[]> {
  validateCurrency(currency);
  dateRange = analyticsWindow(merchantId, dateRange);
  const database = await analyticsDatabase();

  const ordersList = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.currency, currency),
        gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
        lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
        eq(orders.status, "paid")
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
    data.revenue = addAmount(data.revenue, amount(order.totalAmount));
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
  averageOrderValue: number | null;
}

export async function getDiscountCodeAnalytics(
  merchantId: number,
  dateRange: DateRange,
  currency: "SAR" | "USD" = "SAR"
): Promise<DiscountAnalytics[]> {
  validateCurrency(currency);
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
          eq(orders.currency, currency),
          eq(orders.discountCode, code.code),
          gte(orders.createdAt, formatDateForDB(dateRange.startDate)),
          lt(orders.createdAt, formatDateForDB(dateRange.endDate)),
          eq(orders.status, "paid")
        )
      );

    const revenue = codeOrders.reduce(
      (sum, order) => addAmount(sum, amount(order.totalAmount)),
      0
    );
    const usageCount = codeOrders.length;

    analytics.push({
      code: code.code,
      type: code.type,
      value: code.value,
      usageCount,
      revenue,
      averageOrderValue:
        usageCount > 0 ? Math.round(revenue / usageCount) : null,
    });
  }

  return analytics.sort((a, b) => b.revenue - a.revenue);
}
