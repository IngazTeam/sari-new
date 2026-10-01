import { dashboardAnalyticsLabels } from "@/lib/dashboard-labels";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  dashboardWorkspaceSchema,
  type DashboardWorkspace,
} from "@shared/dashboard-workspace";
import { Button } from "@/components/ui/button";

export function DashboardAnalytics({
  merchantId,
  days,
  data,
  loading,
  failed,
  onRetry,
}: {
  merchantId: number;
  days: 7 | 30 | 90;
  data?: DashboardWorkspace;
  loading?: boolean;
  failed?: boolean;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [measure, setMeasure] = useState<"orders" | "value">("orders");
  const label = dashboardAnalyticsLabels(t);
  const parsed = dashboardWorkspaceSchema.safeParse(data);
  const snapshot =
    !failed &&
    !loading &&
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    parsed.data.days === days
      ? parsed.data
      : null;
  if (loading)
    return (
      <section className="mw-panel" role="status" aria-busy="true">
        {label("loading")}
      </section>
    );
  if (!snapshot)
    return (
      <section className="mw-panel space-y-3" role="alert">
        <h2 className="font-semibold">{label("title")}</h2>
        <p>{label("failed")}</p>
        <Button variant="outline" onClick={onRetry}>
          {label("retry")}
        </Button>
      </section>
    );
  const locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-GB";
  const number = (value: number) => value.toLocaleString(locale);
  const money = (minor: number | null) =>
    minor === null
      ? label("unknown")
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: snapshot.currency,
        }).format(minor / 100);
  const stamp = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso + "T00:00:00Z"));
  const growth = (value: number | null) =>
    value === null
      ? label("noComparison")
      : label("growth", {
          value: new Intl.NumberFormat(locale, {
            style: "percent",
            maximumFractionDigits: 1,
            signDisplay: "exceptZero",
          }).format(value / 100),
        });
  const current = snapshot.current,
    sample = snapshot.productSample;
  const daily = new Map(snapshot.trend.map(row => [row.date, row]));
  const rows: DashboardWorkspace["trend"] = [];
  for (
    let day = new Date(snapshot.from.slice(0, 10) + "T00:00:00Z").getTime();
    day < Date.parse(snapshot.through);
    day += 86400000
  ) {
    const key = new Date(day).toISOString().slice(0, 10);
    rows.push(
      daily.get(key) ?? {
        date: key,
        orders: 0,
        deliveredOrders: 0,
        valueMinor: 0,
        deliveredValueMinor: 0,
        excludedValues: 0,
      }
    );
    if (rows.length >= 92) break;
  }
  const value = (row: (typeof rows)[number]) =>
    measure === "orders" ? row.orders : row.deliveredValueMinor;
  const maximum = Math.max(1, ...rows.map(value));
  return (
    <section
      className="mw-home-analytics space-y-5"
      aria-label={label("title")}
      dir={i18n.dir()}
    >
      <div className="mw-panel space-y-2">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="font-semibold">{label("title")}</h2>
          <Button variant="outline" onClick={onRetry}>
            {label("refresh")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {label(days === 7 ? "scopeWeek" : "scope", {
            days,
            currency: snapshot.currency,
          })}
        </p>
        <details>
          <summary className="min-h-11 py-3 cursor-pointer text-sm">
            {label("window")}
          </summary>
          <dl className="space-y-2 text-sm">
            <div>
              <dt>{label("from")}</dt>
              <dd>
                <time dateTime={snapshot.from}>{stamp(snapshot.from)}</time>
              </dd>
            </div>
            <div>
              <dt>{label("through")}</dt>
              <dd>
                <time dateTime={snapshot.through}>
                  {stamp(snapshot.through)}
                </time>
              </dd>
            </div>
            <div>
              <dt>{label("previous")}</dt>
              <dd>
                <time dateTime={snapshot.previousFrom}>
                  {stamp(snapshot.previousFrom)}
                </time>{" "}
                — {stamp(snapshot.from)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{label("utc")}</p>
        </details>
        {!!current.excludedValueOrders && (
          <p role="status" className="rounded-lg border p-3 text-sm">
            {label("excludedValues", { count: current.excludedValueOrders })}
          </p>
        )}
      </div>
      <div className="mw-metrics">
        {(
          [
            {
              title: "value",
              value: money(current.totalValueMinor),
              note: label("allStates"),
              growth: growth(snapshot.growth.value),
              path: "/merchant/reports",
            },
            {
              title: "orders",
              value: number(current.totalOrders),
              note: label("created"),
              growth: growth(snapshot.growth.orders),
              path: "/merchant/orders",
            },
            {
              title: "average",
              value: money(current.averageValueMinor),
              note: label("averageScope", { count: current.validValueOrders }),
              path: "/merchant/analytics",
            },
            {
              title: "delivered",
              value: number(current.deliveredOrders),
              note: label("deliveredScope"),
              path: "/merchant/orders",
            },
          ] as const
        ).map(metric => (
          <Link key={metric.title} href={metric.path} className="mw-metric">
            <span>{label(metric.title)}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
            {"growth" in metric && metric.growth && <small>{metric.growth}</small>}
          </Link>
        ))}
      </div>
      <section className="mw-panel">
        <div className="mw-panel-header">
          <div>
            <h2>{label("trend")}</h2>
            <p>{label("trendScope")}</p>
          </div>
          <div
            className="mw-chart-switch"
            role="group"
            aria-label={label("measure")}
          >
            <button
              type="button"
              aria-pressed={measure === "orders"}
              onClick={() => setMeasure("orders")}
            >
              {label("orders")}
            </button>
            <button
              type="button"
              aria-pressed={measure === "value"}
              onClick={() => setMeasure("value")}
            >
              {label("deliveredValue")}
            </button>
          </div>
        </div>
        {!current.totalOrders ? (
          <p className="mw-empty-inline">{label("empty")}</p>
        ) : (
          <>
            <div className="mw-daily-chart" aria-hidden="true">
              {rows.map(row => (
                <div
                  key={row.date}
                  className="mw-daily-column"
                  title={`${row.date}: ${measure === "orders" ? number(value(row)) : money(value(row))}`}
                >
                  <span
                    style={{ height: `${(value(row) / maximum) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div
              className="flex justify-between gap-3 text-xs text-muted-foreground"
              dir="ltr"
            >
              <span>{rows[0] && date(rows[0].date)}</span>
              <span>{rows.length > 1 && date(rows[rows.length - 1].date)}</span>
            </div>
            <details className="mt-4">
              <summary className="min-h-11 py-3 cursor-pointer">
                {label("table")}
              </summary>
              <div
                className="mw-daily-table"
                tabIndex={0}
                role="region"
                aria-label={label("table")}
              >
                <table>
                  <caption className="sr-only">{label("trendScope")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{label("date")}</th>
                      <th scope="col">{label("orders")}</th>
                      <th scope="col">{label("deliveredValue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.date}>
                        <th scope="row">
                          <time dateTime={row.date}>{row.date}</time>
                        </th>
                        <td>{number(row.orders)}</td>
                        <td>{money(row.deliveredValueMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        {!!current.excludedDeliveredValues && (
          <p className="text-sm mt-3">
            {label("deliveredExcluded", {
              count: current.excludedDeliveredValues,
            })}
          </p>
        )}
        <Link href="/merchant/analytics-hub" className="mw-link">
          {label("analytics")}
        </Link>
      </section>
      <section className="mw-panel">
        <div className="mw-panel-header">
          <div>
            <h2>{label("products")}</h2>
            <p>{label("productsScope")}</p>
          </div>
          <Link href="/merchant/products" className="mw-link">
            {label("catalog")}
          </Link>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          {label("sample", {
            inspected: number(sample.inspectedOrders),
            eligible: number(sample.eligibleOrders),
            limit: number(sample.orderLimit),
          })}
        </p>
        {(sample.omittedOrders > 0 ||
          sample.excludedOrders > 0 ||
          sample.excludedItems > 0) && (
          <p
            className="mb-4 rounded-lg border p-3 text-sm leading-7"
            role="status"
          >
            {label("partialSample", {
              omitted: number(sample.omittedOrders),
              orders: number(sample.excludedOrders),
              items: number(sample.excludedItems),
            })}
          </p>
        )}
        {snapshot.products.length ? (
          <ol className="mw-home-list">
            {snapshot.products.map((product, index) => (
              <li className="mw-product-row" key={product.name}>
                <span aria-hidden="true">{number(index + 1)}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium break-words">{product.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {label("productUnits", {
                      quantity: number(product.quantity),
                      average: money(product.averageUnitMinor),
                    })}
                  </p>
                </div>
                <strong>{money(product.valueMinor)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mw-empty-inline">
            {label(sample.eligibleOrders ? "noEvidence" : "noDelivered")}
          </p>
        )}
      </section>
    </section>
  );
}
