import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { salesAnalyticsLabels } from "@/lib/sales-analytics-labels";
import { completeSalesTrend } from "@/lib/sales-analytics-trend";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryStateCard } from "@/components/QueryStateCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

const periods = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;
const tabIds = [
  "overview",
  "products",
  "campaigns",
  "customers",
  "time",
] as const;
type TabId = (typeof tabIds)[number];
type Copy = ReturnType<typeof salesAnalyticsLabels>;
type Query<T> = {
  data?: T;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
  error?: unknown;
};
const RefreshStore = createContext<() => void>(() => {});
const fresh = { retry: false, staleTime: 0, refetchOnMount: "always" as const };

function Read<T>({
  query,
  l,
  children,
}: {
  query: Query<T>;
  l: Copy;
  children: (value: T) => ReactNode;
}) {
  const refreshStore = useContext(RefreshStore);
  const currencyChanged =
    (query.error as { data?: { code?: string } } | null)?.data?.code ===
    "CONFLICT";
  if (query.isLoading || query.isFetching)
    return (
      <p role="status" aria-busy="true" className="mw-sales-wait">
        {l.loading}
      </p>
    );
  if (query.isError || query.data === undefined)
    return (
      <div role="alert" className="space-y-3">
        <p>{l.failedHelp}</p>
        <Button
          variant="outline"
          onClick={() =>
            currencyChanged ? refreshStore() : void query.refetch()
          }
        >
          {l.retry}
        </Button>
      </div>
    );
  return children(query.data);
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mw-panel min-w-0 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 leading-6">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
function DataTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <p className="mw-empty-inline">{empty}</p>;
  return (
    <div
      className="mw-sales-table"
      role="region"
      aria-label={title}
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, i) =>
                i === 0 ? (
                  <th scope="row" key={i}>
                    {cell}
                  </th>
                ) : (
                  <td key={i}>{cell}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Trend({
  rows,
  l,
  money,
  number,
}: {
  rows: Array<{ label: string; orders: number; revenue: number }>;
  l: Copy;
  money: (value: number | null) => string;
  number: (value: number) => string;
}) {
  const [measure, setMeasure] = useState<"orders" | "revenue">("orders");
  const max = Math.max(1, ...rows.map(r => r[measure]));
  const active = rows.some(r => r.orders > 0);
  return (
    <div className="mw-sales-trend">
      <div className="mw-chart-switch" role="group" aria-label={l.measure}>
        <button
          type="button"
          aria-pressed={measure === "orders"}
          onClick={() => setMeasure("orders")}
        >
          {l.orders}
        </button>
        <button
          type="button"
          aria-pressed={measure === "revenue"}
          onClick={() => setMeasure("revenue")}
        >
          {l.value}
        </button>
      </div>
      {!active ? (
        <p className="mw-empty-inline">{l.emptyOrders}</p>
      ) : (
        <>
          <div className="mw-sales-bars" aria-hidden="true">
            {rows.map((row, i) => (
              <div
                key={i}
                title={
                  row.label +
                  ": " +
                  (measure === "orders"
                    ? number(row.orders)
                    : money(row.revenue))
                }
              >
                <span style={{ height: `${(row[measure] / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div
            className="flex justify-between gap-3 text-xs text-muted-foreground"
            dir="ltr"
          >
            <span>{rows[0]?.label}</span>
            <span>{rows.at(-1)?.label}</span>
          </div>
        </>
      )}
      <details className="mw-sales-details">
        <summary>{l.showNumbers}</summary>
        <DataTable
          title={l.showNumbers}
          headers={[l.bucket, l.orders, l.value]}
          rows={rows.map(r => [r.label, number(r.orders), money(r.revenue)])}
          empty={l.emptyOrders}
        />
      </details>
    </div>
  );
}
export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const query = trpc.merchants.getCurrent.useQuery(undefined, fresh);
  if (query.isFetching || query.isLoading) return <DashboardSkeleton />;
  if (query.isError || !query.data)
    return (
      <QueryStateCard
        kind="error"
        title={t("analyticsEvidenceUx.failed")}
        description={t("analyticsEvidenceUx.storeFailed")}
        retryLabel={t("analyticsEvidenceUx.retry")}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <RefreshStore.Provider value={() => void query.refetch()}>
      <SalesAnalyticsContent
        key={query.data.id + ":" + query.data.currency}
        merchant={query.data}
      />
    </RefreshStore.Provider>
  );
}
function SalesAnalyticsContent({
  merchant,
}: {
  merchant: { id: number; currency: "SAR" | "USD" };
}) {
  const { t, i18n } = useTranslation(),
    l = salesAnalyticsLabels(t, merchant.currency),
    search = useSearch(),
    [, navigate] = useLocation();
  const params = new URLSearchParams(search),
    requested = params.get("range") ?? "30d";
  const period: keyof typeof periods = Object.hasOwn(periods, requested)
    ? (requested as keyof typeof periods)
    : "30d";
  const tab: TabId = tabIds.includes(params.get("tab") as TabId)
    ? (params.get("tab") as TabId)
    : "overview";
  const select = (key: "range" | "tab", value: string) => {
    const next = new URLSearchParams(search);
    next.set(key, value);
    navigate("/merchant/analytics?" + next.toString());
  };
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    return {
      startDate: new Date(
        end.getTime() - periods[period] * 86400000
      ).toISOString(),
      endDate: end.toISOString(),
    };
  }, [period, refreshVersion]);
  const scope = {
    merchantId: merchant.id,
    currency: merchant.currency,
    startDate,
    endDate,
  };
  const kpis = trpc.analytics.getDashboardKPIs.useQuery(scope, fresh);
  const trends = trpc.analytics.getRevenueTrends.useQuery(
    { ...scope, groupBy: period === "7d" || period === "30d" ? "day" : "week" },
    { ...fresh, enabled: tab === "overview" }
  );
  const products = trpc.analytics.getTopProducts.useQuery(
    { ...scope, limit: 10 },
    { ...fresh, enabled: tab === "overview" || tab === "products" }
  );
  const campaigns = trpc.analytics.getCampaignAnalytics.useQuery(scope, {
    ...fresh,
    enabled: tab === "campaigns",
  });
  const segments = trpc.analytics.getCustomerSegments.useQuery(scope, {
    ...fresh,
    enabled: tab === "overview" || tab === "customers",
  });
  const hours = trpc.analytics.getHourlyAnalytics.useQuery(scope, {
    ...fresh,
    enabled: tab === "time",
  });
  const weekdays = trpc.analytics.getWeekdayAnalytics.useQuery(scope, {
    ...fresh,
    enabled: tab === "time",
  });
  const discounts = trpc.analytics.getDiscountCodeAnalytics.useQuery(scope, {
    ...fresh,
    enabled: tab === "campaigns",
  });
  const active = [
    kpis,
    ...(tab === "overview"
      ? [trends, products, segments]
      : tab === "products"
        ? [products]
        : tab === "customers"
          ? [segments]
          : tab === "campaigns"
            ? [campaigns, discounts]
            : [hours, weekdays]),
  ];
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (Date.now() > Date.parse(endDate)) setRefreshVersion(v => v + 1);
      else await Promise.allSettled(active.map(q => q.refetch()));
    } finally {
      setRefreshing(false);
    }
  };
  const locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-GB";
  const number = (v: number) =>
    Number.isFinite(v) ? v.toLocaleString(locale) : l.unavailable;
  const money = (v: number | null) =>
    v === null || !Number.isFinite(v)
      ? l.unavailable
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: merchant.currency,
        }).format(v / 100);
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(v));
  const growth = (v: number | null) =>
    v === null
      ? l.noComparison
      : new Intl.NumberFormat(locale, {
          style: "percent",
          signDisplay: "exceptZero",
          maximumFractionDigits: 1,
        }).format(v / 100) +
        " " +
        l.previous;
  const groupLabels = { new: l.once, returning: l.repeated, vip: l.frequent };
  const customerCards = (
    <Read query={segments} l={l}>
      {data => (
        <div className="mw-sales-segments">
          {data.map(row => (
            <article
              key={row.segment}
              className="rounded-xl border p-4 min-w-0"
            >
              <h3 className="font-semibold">{groupLabels[row.segment]}</h3>
              <dl className="mw-sales-facts">
                <div>
                  <dt>{l.customers}</dt>
                  <dd>{number(row.count)}</dd>
                </div>
                <div>
                  <dt>{l.value}</dt>
                  <dd>{money(row.revenue)}</dd>
                </div>
                <div>
                  <dt>{l.average}</dt>
                  <dd>{money(row.averageOrderValue)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </Read>
  );
  const productTable = (
    <Read query={products} l={l}>
      {data => (
        <DataTable
          title={l.products}
          headers={[l.product, l.quantity, l.value, l.unitPrice, l.stock]}
          rows={data.map(row => [
            row.productName,
            number(row.totalSales),
            money(row.totalRevenue),
            money(row.averagePrice),
            row.stockLevel === null ? l.unavailable : number(row.stockLevel),
          ])}
          empty={l.emptyProducts}
        />
      )}
    </Read>
  );
  return (
    <div
      className="mw-sales-analytics min-w-0 space-y-6"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">{l.eyebrow}</p>
          <h1>{l.title}</h1>
          <p>{l.subtitle}</p>
        </div>
        <Link href="/merchant/reports" className="mw-link">
          {l.reports}
        </Link>
      </header>
      <div className="mw-sales-toolbar">
        <label htmlFor="sales-period">
          {l.period}
          <select
            id="sales-period"
            value={period}
            onChange={e => select("range", e.target.value)}
          >
            <option value="7d">{l.days7}</option>
            <option value="30d">{l.days30}</option>
            <option value="90d">{l.days90}</option>
            <option value="1y">{l.year}</option>
          </select>
        </label>
        <Button
          variant="outline"
          disabled={refreshing || active.some(q => q.isFetching)}
          onClick={() => void refresh()}
        >
          {l.refresh}
        </Button>
        <p>
          <time dateTime={startDate}>{date(startDate)}</time> —{" "}
          <time dateTime={endDate}>{date(endDate)}</time> · UTC ·{" "}
          {merchant.currency}
        </p>
      </div>
      <p className="text-sm text-muted-foreground leading-6">{l.scope}</p>
      <Read query={kpis} l={l}>
        {data => (
          <div className="mw-metrics">
            {[
              {
                title: l.value,
                value: money(data.totalRevenue),
                note: growth(data.revenueGrowth),
              },
              {
                title: l.orders,
                value: number(data.totalOrders),
                note: growth(data.ordersGrowth),
              },
              {
                title: l.average,
                value: money(data.averageOrderValue),
                note: l.perOrder,
              },
              {
                title: l.buyers,
                value: number(data.totalCustomers),
                note: l.buyersScope,
              },
            ].map(row => (
              <article className="mw-panel mw-metric" key={row.title}>
                <h2 className="text-sm font-medium">{row.title}</h2>
                <strong>{row.value}</strong>
                <p className="text-xs text-muted-foreground leading-6">
                  {row.note}
                </p>
              </article>
            ))}
          </div>
        )}
      </Read>
      <Tabs
        value={tab}
        onValueChange={value => select("tab", value)}
        dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
      >
        <TabsList className="mw-sales-tabs" aria-label={l.sections}>
          {tabIds.map(id => (
            <TabsTrigger key={id} value={id}>
              {
                {
                  overview: l.overview,
                  products: l.products,
                  campaigns: l.campaigns,
                  customers: l.customers,
                  time: l.time,
                }[id]
              }
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-5">
          <Panel
            title={l.trend}
            description={
              period === "7d" || period === "30d" ? l.daily : l.weekly
            }
          >
            <Read query={trends} l={l}>
              {data => (
                <Trend
                  rows={completeSalesTrend(
                    data,
                    startDate,
                    endDate,
                    period === "7d" || period === "30d" ? "day" : "week"
                  ).map(row => ({
                    ...row,
                    label: date(row.date + "T00:00:00Z"),
                  }))}
                  l={l}
                  money={money}
                  number={number}
                />
              )}
            </Read>
          </Panel>
          <Panel title={l.products} description={l.productScope}>
            {productTable}
          </Panel>
          <Panel title={l.customerGroups} description={l.groupScope}>
            {customerCards}
          </Panel>
        </TabsContent>
        <TabsContent value="products">
          <Panel title={l.products} description={l.productScope}>
            {productTable}
            <Link href="/merchant/products" className="mw-link">
              {l.catalog}
            </Link>
          </Panel>
        </TabsContent>
        <TabsContent value="campaigns" className="space-y-5">
          <Panel title={l.campaigns} description={l.campaignScope}>
            <Read query={campaigns} l={l}>
              {data =>
                data.length ? (
                  <div className="grid gap-3">
                    {data.map(row => (
                      <article
                        className="rounded-xl border p-4 space-y-3"
                        key={row.campaignId}
                      >
                        <h3 className="font-semibold break-words">
                          {row.campaignName}
                        </h3>
                        <p>
                          {l.sent}:{" "}
                          <strong>
                            {row.sentCount === null
                              ? l.unavailable
                              : number(row.sentCount)}
                          </strong>
                        </p>
                        <details className="mw-sales-details">
                          <summary>{l.attribution}</summary>
                          <dl className="mw-sales-facts">
                            {[
                              l.opens,
                              l.clicks,
                              l.conversion,
                              l.value,
                              l.roi,
                            ].map(label => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{l.unavailable}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mw-empty-inline">{l.emptyCampaigns}</p>
                )
              }
            </Read>
            <Link href="/merchant/campaigns" className="mw-link">
              {l.manageCampaigns}
            </Link>
          </Panel>
          <Panel title={l.discounts} description={l.discountScope}>
            <Read query={discounts} l={l}>
              {data => (
                <DataTable
                  title={l.discounts}
                  headers={[
                    l.code,
                    l.type,
                    l.discountValue,
                    l.uses,
                    l.value,
                    l.average,
                  ]}
                  rows={data.map(row => [
                    row.code,
                    row.type === "percentage" ? l.percentage : l.fixed,
                    row.type === "percentage"
                      ? number(row.value) + "%"
                      : money(row.value * 100),
                    number(row.usageCount),
                    money(row.revenue),
                    money(row.averageOrderValue),
                  ])}
                  empty={l.emptyDiscounts}
                />
              )}
            </Read>
          </Panel>
        </TabsContent>
        <TabsContent value="customers">
          <Panel title={l.customerGroups} description={l.groupScope}>
            {customerCards}
            <Link href="/merchant/customers" className="mw-link">
              {l.manageCustomers}
            </Link>
          </Panel>
        </TabsContent>
        <TabsContent value="time" className="space-y-5">
          <Panel title={l.hourly} description={l.timeScope}>
            <Read query={hours} l={l}>
              {data => (
                <Trend
                  rows={data.map(row => ({
                    ...row,
                    label: String(row.hour).padStart(2, "0") + ":00",
                  }))}
                  l={l}
                  money={money}
                  number={number}
                />
              )}
            </Read>
          </Panel>
          <Panel title={l.weekdays} description={l.timeScope}>
            <Read query={weekdays} l={l}>
              {data => (
                <Trend
                  rows={data.map(row => ({
                    ...row,
                    label: new Intl.DateTimeFormat(locale, {
                      weekday: "long",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2024, 0, 7 + row.dayNumber))),
                  }))}
                  l={l}
                  money={money}
                  number={number}
                />
              )}
            </Read>
          </Panel>
          <details className="mw-panel mw-sales-details">
            <summary>{l.timingAdvice}</summary>
            <p className="text-sm leading-7">{l.advice}</p>
          </details>
        </TabsContent>
      </Tabs>
      <details className="mw-panel mw-sales-details">
        <summary>{l.limits}</summary>
        <div className="space-y-3 text-sm leading-7">
          <p>{l.fullScope}</p>
          <p>{l.conversionScope}</p>
          <p>{l.independentReads}</p>
          <Link href="/merchant/sari-brain?view=sales" className="mw-link">
            {l.salesEvidence}
          </Link>
          <Link href="/merchant/analytics-hub" className="mw-link">
            {l.hub}
          </Link>
        </div>
      </details>
    </div>
  );
}
