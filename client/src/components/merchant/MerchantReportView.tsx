import type { MerchantReportDocument } from "@/lib/merchant-report-document";
import "@/styles/report-workspace.css";

export function MerchantReportView({
  document: d,
  sourceLabel,
  emptyLabel,
  printing = false,
}: {
  document: MerchantReportDocument;
  sourceLabel: string;
  emptyLabel: string;
  printing?: boolean;
}) {
  return (
    <section className="rw-report" data-report-result>
      <header className="rw-period">
        <h2>{d.title}</h2>
        <p>{d.period}</p>
      </header>
      {d.empty && (
        <p className="rw-notice" role="status">
          {emptyLabel}
        </p>
      )}
      {d.warning && (
        <p className="rw-notice" role="status">
          {d.warning}
        </p>
      )}
      <dl className="rw-metrics">
        {d.metrics.map(m => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
      <details className="rw-method" open={printing ? true : undefined}>
        <summary>{sourceLabel}</summary>
        <p>{d.note}</p>
        <dl className="rw-facts">
          {d.details?.map(m => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <section className="rw-table-panel" aria-label={d.tableTitle}>
        <h3>{d.tableTitle}</h3>
        {d.tableNote && <p>{d.tableNote}</p>}
        {d.rows.length ? (
          <div
            className="rw-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={d.tableTitle}
          >
            <table>
              <caption>{d.tableTitle}</caption>
              <thead>
                <tr>
                  {d.columns.map(c => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} dir="auto">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rw-empty-table">{d.tableEmptyText}</p>
        )}
      </section>
    </section>
  );
}
