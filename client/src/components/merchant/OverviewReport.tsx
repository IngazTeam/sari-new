import type { ReactNode } from "react";
import type { OverviewSnapshot } from "@shared/overview-workspace";
import { overviewLabels } from "@/lib/overview-labels";
import "@/styles/overview-workspace.css";
export function OverviewReport({
  data: d,
  t,
  language = "ar-SA",
  href = (path: string) => path,
}: {
  data: OverviewSnapshot;
  t: (key: string) => string;
  language?: string;
  href?: (path: string) => string;
}) {
  const l = overviewLabels(t),
    n = (v: number) =>
      new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(v),
    ratio = (v: number | null) => (v === null ? l.unavailable : n(v) + "%"),
    money = (v: number | null, currency: string) =>
      v === null
        ? l.unavailable
        : new Intl.NumberFormat(language, {
            style: "currency",
            currency,
          }).format(v / 100);
  const pair = (title: string, value: ReactNode) => (
    <div className="ov-pair">
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
  const section = (
    id: string,
    title: string,
    note: string,
    children: ReactNode
  ) => (
    <section className="ov-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="ov-note">{note}</p>
      {children}
    </section>
  );
  return (
    <div className="ov-report">
      <div className="ov-metrics">
        {[
          [l.totalOrders, n(d.orders.total)],
          [
            l.averageRating,
            d.reviews.average === null
              ? l.unavailable
              : n(d.reviews.average) + " / 5",
          ],
          [l.recoveryShare, ratio(d.carts.share)],
          [l.completionShare, ratio(d.referrals.share)],
        ].map(([title, value]) => (
          <div className="ov-metric" key={title}>
            <p>{title}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {section(
        "ov-values",
        l.values,
        l.valueNote,
        <>
          <div className="ov-grid">
            {d.orders.values.map(row => (
              <article className="ov-subpanel" key={row.currency}>
                <h3>{l[row.currency]}</h3>
                <dl>
                  {pair(
                    l.totalValue,
                    <strong>{money(row.totalMinor, row.currency)}</strong>
                  )}
                  {pair(l.amountSample, n(row.count))}
                  {pair(l.averageValue, money(row.averageMinor, row.currency))}
                  {pair(l.markedPaid, money(row.markedPaidMinor, row.currency))}
                  {pair(l.paidSample, n(row.markedPaidCount))}
                  {pair(l.invalidAmounts, n(row.excludedAmounts))}
                </dl>
              </article>
            ))}
          </div>
          <p className="ov-note">{l.paidNote}</p>
          <a href={href("/merchant/orders")}>{l.openOrders}</a>
        </>
      )}
      {section(
        "ov-orders",
        l.orders,
        l.periodNote,
        <div className="ov-grid">
          {[
            { title: l.statuses, rows: d.orders.statuses },
            { title: l.payments, rows: d.orders.payments },
          ].map(group => (
            <table key={group.title}>
              <caption>{group.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{l.status}</th>
                  <th scope="col">{l.count}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(row => (
                  <tr key={row.status}>
                    <th scope="row">{l[row.status]}</th>
                    <td>{n(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
      {section(
        "ov-reviews",
        l.reviews,
        l.ratingNote,
        <>
          <dl>
            {pair(
              l.averageRating,
              d.reviews.average === null
                ? l.unavailable
                : n(d.reviews.average) + " / 5"
            )}
            {pair(
              l.ratingSample,
              `${n(d.reviews.valid)} / ${n(d.reviews.total)}`
            )}
            {pair(l.invalidRatings, n(d.reviews.invalid))}
          </dl>
          <table>
            <caption>{l.distribution}</caption>
            <thead>
              <tr>
                <th scope="col">{l.stars}</th>
                <th scope="col">{l.count}</th>
                <th scope="col">{l.share}</th>
              </tr>
            </thead>
            <tbody>
              {d.reviews.distribution.map(r => (
                <tr key={r.stars}>
                  <th scope="row">{n(r.stars)} / 5</th>
                  <td>{n(r.count)}</td>
                  <td>{ratio(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="ov-grid">
        {section(
          "ov-carts",
          l.carts,
          l.cartNote,
          <dl>
            {pair(l.cartTotal, n(d.carts.total))}
            {pair(l.recovered, n(d.carts.markedRecovered))}
            {pair(l.notRecovered, n(d.carts.other))}
            {pair(l.invalidFlags, n(d.carts.invalidFlags))}
            {pair(l.recoveryShare, ratio(d.carts.share))}
          </dl>
        )}
        {section(
          "ov-referrals",
          l.referrals,
          l.referralNote,
          <dl>
            {pair(l.referralTotal, n(d.referrals.total))}
            {pair(l.completed, n(d.referrals.markedCompleted))}
            {pair(l.notCompleted, n(d.referrals.pending))}
            {pair(l.invalidFlags, n(d.referrals.invalidFlags))}
            {pair(l.completionShare, ratio(d.referrals.share))}
          </dl>
        )}
      </div>
      {section(
        "ov-association",
        l.association,
        l.associationNote,
        <>
          <dl>
            {pair(
              l.associationShare,
              <strong>{ratio(d.association.ratio)}</strong>
            )}
            {pair(
              l.associationSample,
              `${n(d.association.positive)} / ${n(d.association.total)}`
            )}
          </dl>
          <a href={href("/merchant/message-analytics")}>{l.openMessages}</a>
        </>
      )}
      {section(
        "ov-evidence",
        l.evidence,
        l.evidenceNote,
        <>
          <dl>{pair(l.salesSkill, <strong>{l.unmeasured}</strong>)}</dl>
          <a href={href("/merchant/sari-brain")}>{l.openKnowledge}</a>
        </>
      )}
    </div>
  );
}
