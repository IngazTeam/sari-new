import type { PerformanceSnapshot } from "@shared/performance-workspace";
import { performanceChange } from "@shared/performance-workspace";
import { performanceLabels } from "@/lib/performance-labels";
import { performanceSections } from "@/lib/performance-report";
import "@/styles/performance-workspace.css";
export function PerformanceReport({
  data: d,
  t,
  language = "ar-SA",
  href = (p: string) => p,
}: {
  data: PerformanceSnapshot;
  t: (key: string) => string;
  language?: string;
  href?: (p: string) => string;
}) {
  const l = performanceLabels(t),
    n = (v: number) =>
      new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(v),
    value = (v: number | null, percent = false) =>
      v === null ? l.unavailable : n(v) + (percent ? "%" : ""),
    money = (v: number, currency: string) =>
      new Intl.NumberFormat(language, { style: "currency", currency }).format(
        v / 100
      );
  const date = (s: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      calendar: "gregory",
      timeZone: "UTC",
    }).format(new Date(s));
  const comparison = (a: number, b: number) => {
    const change = performanceChange(a, b);
    return change === null
      ? l.noBase
      : l.change + ": " + (change > 0 ? "+" : "") + n(change) + "%";
  };
  return (
    <div className="ov-report pf-report">
      <div className="ov-period">
        <p>
          {l.current}:{" "}
          <time dateTime={d.current.from}>{date(d.current.from)}</time> —{" "}
          <time dateTime={d.current.through}>{date(d.current.through)}</time>{" "}
          UTC
        </p>
        <p>
          {l.previous}:{" "}
          <time dateTime={d.previous.from}>{date(d.previous.from)}</time> —{" "}
          <time dateTime={d.previous.through}>{date(d.previous.through)}</time>{" "}
          UTC
        </p>
        <details className="pf-method">
          <summary>{l.periodDetails}</summary>
          <p>{l.periodNote}</p>
          {d.partialCurrentDay && <p>{l.partial}</p>}
        </details>
      </div>
      {!d.current.messages.total &&
        !d.current.orders.total &&
        !d.current.reviews.total && (
          <p role="status" className="ov-period">
            {l.empty}
          </p>
        )}
      <div className="ov-metrics">
        {[
          {
            title: l.messages,
            text: n(d.current.messages.total),
            note: comparison(
              d.current.messages.total,
              d.previous.messages.total
            ),
          },
          {
            title: l.orders,
            text: n(d.current.orders.total),
            note: comparison(d.current.orders.total, d.previous.orders.total),
          },
          {
            title: l.deliveryShare,
            text: value(d.current.orders.deliveredShare, true),
            note: `${l.delivered}: ${n(d.current.orders.delivered)} / ${n(d.current.orders.total)}`,
          },
          {
            title: l.average,
            text: value(d.current.reviews.average),
            note: `${l.validReviews}: ${n(d.current.reviews.valid)}`,
          },
        ].map(row => (
          <article className="ov-metric" key={row.title}>
            <p>{row.title}</p>
            <strong>{row.text}</strong>
            <p>{row.note}</p>
          </article>
        ))}
      </div>
      <p className="ov-note">{l.sampleNote}</p>
      <div className="ov-grid">
        {performanceSections(t).map(section => (
          <section
            className="ov-panel"
            key={section.key}
            aria-labelledby={"pf-" + section.key}
          >
            <h2 id={"pf-" + section.key}>{section.title}</h2>
            <p className="ov-note">{section.note}</p>
            <table>
              <caption className="sr-only">{section.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{l.metric}</th>
                  <th scope="col">{l.current}</th>
                  <th scope="col">{l.previous}</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map(row => (
                  <tr key={row.key} data-performance={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {value(row.value(d.current), row.unit === "percent")}
                    </td>
                    <td>
                      {value(row.value(d.previous), row.unit === "percent")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <section className="ov-panel" aria-labelledby="pf-values">
        <h2 id="pf-values">{l.values}</h2>
        <p className="ov-note">{l.valueNote}</p>
        <div className="ov-grid">
          {d.current.orders.values.map(current => {
            const previous = d.previous.orders.values.find(
              p => p.currency === current.currency
            )!;
            return (
              <article className="ov-subpanel" key={current.currency}>
                <h3>{current.currency}</h3>
                <table>
                  <caption className="sr-only">
                    {l.values} {current.currency}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{l.metric}</th>
                      <th scope="col">{l.current}</th>
                      <th scope="col">{l.previous}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["count", l.amountSample],
                        ["totalMinor", l.totalValue],
                        ["markedPaidMinor", l.markedPaid],
                        ["excludedAmounts", l.invalidAmounts],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row">{label}</th>
                        <td>
                          {key.endsWith("Minor")
                            ? money(current[key], current.currency)
                            : n(current[key])}
                        </td>
                        <td>
                          {key.endsWith("Minor")
                            ? money(previous[key], current.currency)
                            : n(previous[key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            );
          })}
        </div>
        <a href={href("/merchant/orders")}>{l.openOrders}</a>
      </section>
      <section className="ov-panel" aria-labelledby="pf-limits">
        <h2 id="pf-limits">{l.limits}</h2>
        <p className="ov-note">{l.limitsNote}</p>
        <dl>
          {[
            l.conversion,
            l.responseTime,
            l.satisfaction,
            l.costs,
            l.profit,
            l.roi,
            l.proficiency,
          ].map(label => (
            <div className="ov-pair" key={label}>
              <dt>{label}</dt>
              <dd>{l.unavailable}</dd>
            </div>
          ))}
        </dl>
        <a href={href("/merchant/sari-brain")}>{l.openBrain}</a>
      </section>
    </div>
  );
}
