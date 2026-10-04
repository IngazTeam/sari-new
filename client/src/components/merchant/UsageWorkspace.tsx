import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { Gauge, RefreshCw, CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  scopedUsage,
  usageLabels,
  usageViews,
  type UsageView,
} from "@/lib/usage-workspace-view";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import type { UsageWorkspace as Snapshot } from "@shared/usage-workspace";
import "@/styles/settings-workspace.css";
import "@/styles/usage-workspace.css";

type Copy = ReturnType<typeof usageLabels>;
function Meter({
  name,
  value,
  note,
  c,
  locale,
}: {
  name: string;
  value: Snapshot["quotas"]["messages"];
  note?: string;
  c: Copy;
  locale: string;
}) {
  const id = useId(),
    number = (n: number | null) =>
      n === null ? c.unknown : new Intl.NumberFormat(locale).format(n);
  return (
    <section
      className={`uw-meter${value.percentage !== null && value.percentage >= 80 ? " uw-meter-warning" : ""}`}
      aria-labelledby={id}
    >
      <h3 id={id}>{name}</h3>
      {note && <p>{note}</p>}
      <dl>
        <div>
          <dt>{c.used}</dt>
          <dd className="uw-number">
            <bdi>{number(value.used)}</bdi>
          </dd>
        </div>
        <div>
          <dt>{c.limit}</dt>
          <dd>{value.unlimited ? c.unlimited : number(value.limit)}</dd>
        </div>
      </dl>
      {value.percentage !== null && value.limit !== null && value.limit > 0 && (
        <progress aria-label={name} max={100} value={value.percentage} />
      )}
      {value.percentage !== null && value.limit !== null && value.limit > 0 && (
        <p>
          {c.percentUsed}: <bdi>{number(Math.round(value.percentage))}%</bdi>
        </p>
      )}
      {value.percentage !== null &&
        value.percentage >= 80 &&
        value.percentage < 100 && <p className="uw-near">{c.nearLimit}</p>}
      <p className="uw-meter-state">
        {value.used === null
          ? c.unknownCount
          : value.unlimited === true
            ? c.unlimited
            : value.unlimited === null
              ? c.unknownLimit
              : value.limit === 0
                ? c.noAllowance
                : value.remaining === 0
                  ? c.reached
                  : `${c.remaining}: ${number(value.remaining)}`}
      </p>
    </section>
  );
}
export function UsageWorkspace({
  actorId,
  merchantId,
  defaultView,
}: {
  actorId: number;
  merchantId: number;
  defaultView: UsageView;
}) {
  const { t, i18n } = useTranslation(),
    c = usageLabels(t),
    locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-US";
  const [path] = useLocation(),
    search = new URLSearchParams(useSearch()),
    rawView = search.get("tab") ?? defaultView;
  const view = usageViews.includes(rawView as UsageView)
    ? (rawView as UsageView)
    : null;
  const query = trpc.usage.workspace.useQuery(undefined, usageQueryOptions);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const data = scopedUsage(query.data, actorId, merchantId);
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          timeZone: "UTC",
          calendar: "gregory",
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(value))
      : c.unknown;
  const month = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      calendar: "gregory",
      year: "numeric",
      month: "long",
    }).format(new Date(value + "-01T00:00:00Z"));
  const historyRow =
    data?.history.find(row => row.month === selectedMonth) ??
    data?.history.at(-1);
  return (
    <section
      className="sw-workspace uw-workspace"
      dir={locale.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sw-heading">
        <span aria-hidden="true">
          <Gauge />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </header>
      <nav className="uw-tabs" aria-label={c.title}>
        {usageViews.map(item => (
          <Link
            key={item}
            href={`${path}?tab=${item}`}
            aria-current={view === item ? "page" : undefined}
          >
            {c[item]}
          </Link>
        ))}
      </nav>
      {!view ? (
        <div className="sw-panel" role="alert">
          <p>{c.invalidView}</p>
          <Link className="uw-link" href={path}>
            {c.resetView}
          </Link>
        </div>
      ) : query.error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading || query.isFetching ? (
        <WorkspaceState inline kind="loading" />
      ) : !data ? (
        <WorkspaceState
          inline
          kind="error"
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="uw-toolbar">
            <p>
              {c.checkedAt}:{" "}
              <time dateTime={data.checkedAt}>
                {date(data.checkedAt)} ·{" "}
                {new Intl.DateTimeFormat(locale, {
                  timeZone: "UTC",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(data.checkedAt))}{" "}
                UTC
              </time>
            </p>
            <button type="button" onClick={() => void query.refetch()}>
              <RefreshCw aria-hidden="true" size={18} />
              {c.refresh}
            </button>
          </div>
          {view === "subscription" && (
            <>
              <div className="sw-panel uw-subscription">
                <div>
                  <p>{c.plan}</p>
                  <h2>
                    {(locale.startsWith("ar")
                      ? data.subscription.nameAr
                      : data.subscription.nameEn) ||
                      (data.subscription.limitsSource === "trial"
                        ? c.trial
                        : c.noPlan)}
                  </h2>
                </div>
                <span
                  className={"uw-status uw-status-" + data.subscription.state}
                >
                  {
                    c[
                      data.subscription.state === "unknown"
                        ? "unknownState"
                        : data.subscription.state
                    ]
                  }
                </span>
                {!["active", "trial"].includes(data.subscription.state) && (
                  <p role="status" className="uw-notice">
                    {
                      c[
                        data.subscription.state === "ambiguous"
                          ? "ambiguousHint"
                          : data.subscription.state === "none"
                            ? "noneHint"
                            : data.subscription.state === "expired"
                              ? "expiredHint"
                              : "unknownHint"
                      ]
                    }
                  </p>
                )}
                <dl className="uw-dates">
                  <div>
                    <dt>{c.start}</dt>
                    <dd>{date(data.subscription.startDate)}</dd>
                  </div>
                  <div>
                    <dt>{c.end}</dt>
                    <dd>{date(data.subscription.endDate)}</dd>
                  </div>
                  <div>
                    <dt>{c.reset}</dt>
                    <dd>{date(data.subscription.lastResetAt)}</dd>
                  </div>
                  <div>
                    <dt>{c.billingCycle}</dt>
                    <dd>
                      {data.subscription.billingCycle
                        ? c[data.subscription.billingCycle]
                        : c.unknown}
                    </dd>
                  </div>
                </dl>
                <p>{c.resetHint}</p>
                <div className="uw-actions">
                  <Link className="uw-link" href="/merchant/subscription/plans">
                    {c.plans}
                  </Link>
                  <Link
                    className="uw-link uw-secondary"
                    href="/merchant/subscription/compare"
                  >
                    {c.compare}
                  </Link>
                </div>
              </div>
              <div className="uw-section-heading">
                <h2>{c.subscription}</h2>
                <p>{c.quotaHint}</p>
              </div>
              <div className="uw-grid">
                {(["conversations", "messages", "voiceMessages"] as const).map(
                  key => (
                    <Meter
                      key={key}
                      name={c[key]}
                      value={data.quotas[key]}
                      c={c}
                      locale={locale}
                    />
                  )
                )}
              </div>
            </>
          )}
          {view === "resources" && (
            <>
              <div className="uw-section-heading">
                <h2>{c.resources}</h2>
                <p>{c.resourceHint}</p>
              </div>
              <div className="uw-grid">
                {(["customers", "whatsappNumbers", "products"] as const).map(
                  (key, i) => (
                    <Meter
                      key={key}
                      name={c[key]}
                      value={data.resources[key]}
                      note={
                        c[["customerHint", "whatsappHint", "productHint"][i]]
                      }
                      c={c}
                      locale={locale}
                    />
                  )
                )}
              </div>
              <div className="uw-section-heading">
                <h2>
                  {c.currentMonth} · {month(data.activity.month)}
                </h2>
                <p>{c.activityHint}</p>
              </div>
              <div className="uw-grid uw-activity">
                <section className="uw-meter">
                  <h3>{c.campaigns}</h3>
                  <p className="uw-number">{number(data.activity.campaigns)}</p>
                </section>
                <section className="uw-meter">
                  <h3>{c.outgoingMessages}</h3>
                  <p className="uw-number">
                    {number(data.activity.outgoingMessages)}
                  </p>
                </section>
              </div>
              <p className="uw-caption">
                {c.from} {date(data.activity.from)} · {c.to}{" "}
                {date(data.activity.to)} UTC
              </p>
            </>
          )}
          {view === "history" && (
            <div className="sw-panel uw-history">
              <div className="uw-section-heading">
                <h2>
                  <CalendarDays aria-hidden="true" size={20} /> {c.history}
                </h2>
                <p>{c.historyHint}</p>
              </div>
              <div className="uw-months" aria-label={c.month}>
                {data.history.map(row => (
                  <button
                    type="button"
                    key={row.month}
                    aria-pressed={historyRow?.month === row.month}
                    onClick={() => setSelectedMonth(row.month)}
                  >
                    {month(row.month)}
                  </button>
                ))}
              </div>
              {historyRow && (
                <div className="uw-month-summary" role="status">
                  <strong>{month(historyRow.month)}</strong>
                  <span>
                    {c.campaigns}: {number(historyRow.campaigns)}
                  </span>
                  <span>
                    {c.outgoingMessages}: {number(historyRow.outgoingMessages)}
                  </span>
                </div>
              )}
              <table>
                <caption>{c.historyHint}</caption>
                <thead>
                  <tr>
                    <th scope="col">{c.month}</th>
                    <th scope="col">{c.campaigns}</th>
                    <th scope="col">{c.outgoingMessages}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map(row => (
                    <tr key={row.month}>
                      <th scope="row">{month(row.month)}</th>
                      <td>{number(row.campaigns)}</td>
                      <td>{number(row.outgoingMessages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.history.every(
                row => !row.campaigns && !row.outgoingMessages
              ) && <p className="uw-notice">{c.historyEmpty}</p>}
            </div>
          )}
          <details className="uw-explainer">
            <summary>{c.details}</summary>
            <p>{c.sourceNotice}</p>
            <p>{c.basePlan}</p>
            <p>{c.notSalesScore}</p>
            <p>{c.zeroHint}</p>
          </details>
        </>
      )}
    </section>
  );
}
