export const salesModes = [
  "normal",
  "empty",
  "loading",
  "section-loading",
  "failure",
  "store-failure",
  "partial",
  "stale",
  "currency",
] as const;
export type SalesMode = (typeof salesModes)[number];
export const salesQueries = [
  "merchants.getCurrent",
  "analytics.getDashboardKPIs",
  "analytics.getRevenueTrends",
  "analytics.getTopProducts",
  "analytics.getCampaignAnalytics",
  "analytics.getCustomerSegments",
  "analytics.getHourlyAnalytics",
  "analytics.getWeekdayAnalytics",
  "analytics.getDiscountCodeAnalytics",
] as const;
type Query = (typeof salesQueries)[number];
export class SalesPreviewModel {
  private version = 0;
  private listeners = new Set<() => void>();
  private recovered = new Set<string>();
  retries = 0;
  constructor(
    readonly merchantId = 206,
    readonly mode: SalesMode = "normal"
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private notify() {
    this.version++;
    this.listeners.forEach(f => f());
  }
  complete() {
    salesQueries.forEach(q => this.recovered.add(q));
    this.notify();
  }
  get currency(): "SAR" | "USD" {
    return this.merchantId === 207 ||
      (this.mode === "currency" && this.recovered.has("merchants.getCurrent"))
      ? "USD"
      : "SAR";
  }
  read(name: Query, input?: any) {
    if (!salesQueries.includes(name)) throw Error("Unsupported local query");
    const store = name === "merchants.getCurrent";
    if (
      !store &&
      (input?.merchantId !== this.merchantId ||
        !["SAR", "USD"].includes(input?.currency))
    )
      throw Error("Invalid local tenant scope");
    const currencyConflict =
      !store &&
      (input.currency !== this.currency ||
        (this.mode === "currency" &&
          !this.recovered.has("merchants.getCurrent")));
    const recovered = this.recovered.has(name);
    const isFetching =
      !recovered &&
      ((this.mode === "loading" && store) ||
        (this.mode === "section-loading" && !store));
    const failed =
      currencyConflict ||
      (!recovered &&
        (store
          ? this.mode === "store-failure"
          : this.mode === "failure" ||
            this.mode === "stale" ||
            (this.mode === "partial" &&
              name === "analytics.getRevenueTrends")));
    const data = store
      ? { id: this.merchantId, currency: this.currency }
      : this.sample(name, input);
    return {
      data:
        this.mode === "stale" && !recovered && !store
          ? name === "analytics.getDashboardKPIs"
            ? { ...data, totalRevenue: 99999999 }
            : data
          : data,
      isLoading: isFetching,
      isFetching,
      isError: failed,
      error: failed
        ? {
            data: {
              code: currencyConflict ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
            },
          }
        : null,
    };
  }
  async refetch(name: Query, input?: any) {
    this.read(name, input);
    this.retries++;
    this.recovered.add(name);
    this.notify();
    return this.read(name, input);
  }
  private sample(name: Query, input: any): any {
    const from = Date.parse(input.startDate),
      through = Date.parse(input.endDate);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(through) ||
      from >= through ||
      through - from > 366 * 86400000
    )
      throw Error("Invalid local period");
    const events =
      this.mode === "empty"
        ? []
        : [1, 3, 10, 40, 100, 200]
            .map((days, i) => ({
              at: through - days * 86400000,
              value: (i + 1) * (this.merchantId === 207 ? 12500 : 10000),
            }))
            .filter(e => e.at >= from);
    const revenue = events.reduce((sum, e) => sum + e.value, 0),
      count = events.length;
    const grouped = (key: (at: number) => string) => {
      const map = new Map<string, { orders: number; revenue: number }>();
      for (const event of events) {
        const id = key(event.at),
          row = map.get(id) ?? { orders: 0, revenue: 0 };
        row.orders++;
        row.revenue += event.value;
        map.set(id, row);
      }
      return map;
    };
    switch (name) {
      case "analytics.getDashboardKPIs":
        return {
          totalRevenue: revenue,
          totalOrders: count,
          averageOrderValue: count ? Math.round(revenue / count) : null,
          totalCustomers: count,
          conversionRate: null,
          revenueGrowth: null,
          ordersGrowth: null,
        };
      case "analytics.getRevenueTrends":
        return Array.from(
          grouped(at => {
            const d = new Date(at);
            if (input.groupBy === "week")
              d.setUTCDate(d.getUTCDate() - d.getUTCDay());
            return d.toISOString().slice(0, 10);
          }),
          ([date, row]) => ({ date, ...row })
        ).sort((a, b) => a.date.localeCompare(b.date));
      case "analytics.getTopProducts":
        return count
          ? [
              {
                productId: this.merchantId,
                productName:
                  this.merchantId === 207
                    ? "Sample product B · منتج ب"
                    : "Sample product A · منتج أ",
                totalSales: count,
                totalRevenue: revenue,
                averagePrice: Math.round(revenue / count),
                stockLevel: null,
              },
            ]
          : [];
      case "analytics.getCampaignAnalytics":
        return count
          ? [
              {
                campaignId: this.merchantId,
                campaignName: "Sample campaign · حملة تجريبية",
                sentCount: 12,
                openRate: null,
                clickRate: null,
                conversionRate: null,
                revenue: null,
                roi: null,
              },
            ]
          : [];
      case "analytics.getCustomerSegments":
        return ["new", "returning", "vip"].map(segment => ({
          segment,
          count: segment === "new" ? count : 0,
          revenue: segment === "new" ? revenue : 0,
          averageOrderValue:
            segment === "new" && count ? Math.round(revenue / count) : null,
        }));
      case "analytics.getHourlyAnalytics": {
        const rows = grouped(at => String(new Date(at).getUTCHours()));
        return Array.from({ length: 24 }, (_, hour) => ({
          hour,
          ...(rows.get(String(hour)) ?? { orders: 0, revenue: 0 }),
        }));
      }
      case "analytics.getWeekdayAnalytics": {
        const rows = grouped(at => String(new Date(at).getUTCDay()));
        return Array.from({ length: 7 }, (_, dayNumber) => ({
          dayNumber,
          ...(rows.get(String(dayNumber)) ?? { orders: 0, revenue: 0 }),
        }));
      }
      case "analytics.getDiscountCodeAnalytics":
        return count
          ? [
              {
                code: "SAMPLE10",
                type: "fixed",
                value: 10,
                usageCount: 1,
                revenue: events[0].value,
                averageOrderValue: events[0].value,
              },
            ]
          : [];
      default:
        throw Error("Unsupported analytics query");
    }
  }
}
