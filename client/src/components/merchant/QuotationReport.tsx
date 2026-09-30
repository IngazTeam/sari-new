import { useState } from "react";
import {
  quotationStatuses,
  type QuotationSelection,
  type QuotationWorkspace,
  type QuotationRow,
  type QuotationDetail,
} from "@shared/quotation-workspace";
import { quotationDisplay } from "@/lib/quotation-display";
import "@/styles/quotation-workspace.css";
type Labels = (key: string) => string;
export function QuotationReport({
  data: d,
  t,
  language,
  onSelect,
  onOpen,
  onTarget,
  canSetTarget = false,
  href = (p: string) => p,
}: {
  data: QuotationWorkspace;
  t: Labels;
  language: string;
  onSelect: (s: QuotationSelection) => void;
  onOpen: (id: number) => void;
  onTarget: () => void;
  canSetTarget?: boolean;
  href?: (path: string) => string;
}) {
  const f = quotationDisplay(t, language),
    [search, setSearch] = useState(d.selection.search);
  const accepted = d.statuses.find(v => v.status === "accepted")?.count ?? 0;
  const row = (q: QuotationRow) => (
    <li key={q.id} className="qt-row">
      <div className="qt-row-main">
        <div className="qt-row-title">
          <strong dir="auto">
            {q.customerName || t("quotationWorkspace.unnamed")}
          </strong>
          <span className="qt-status" data-status={q.status}>
            {f.statuses[q.status]}
          </span>
        </div>
        <p className="qt-number" dir="ltr">
          {q.number}
        </p>
        <div className="qt-row-meta">
          <span>
            {t("quotationWorkspace.created")}: {f.date(q.createdAt)}
          </span>
          <span>
            {t("quotationWorkspace.validUntil")}: {f.date(q.validUntil)}
          </span>
          {q.validityElapsed && <span>{t("quotationWorkspace.elapsed")}</span>}
          {q.managed && <span>{t("quotationWorkspace.managed")}</span>}
        </div>
      </div>
      <div className="qt-row-side">
        <strong>{f.money(q.totalMinor, q.currency)}</strong>
        <button
          type="button"
          onClick={() => onOpen(q.id)}
          aria-label={`${t("quotationWorkspace.open")} ${q.number}`}
        >
          {t("quotationWorkspace.open")}
        </button>
      </div>
    </li>
  );
  return (
    <div className="qt-report">
      <section
        className="qt-summary"
        aria-label={t("quotationWorkspace.summary")}
      >
        <article>
          <span>{t("quotationWorkspace.allCount")}</span>
          <strong>{f.number(d.total)}</strong>
        </article>
        <article>
          <span>{t("quotationWorkspace.acceptedCount")}</span>
          <strong>{f.number(accepted)}</strong>
        </article>
        <article>
          <span>{t("quotationWorkspace.acceptedShare")}</span>
          <strong>
            {d.acceptedShare === null ? "—" : `${f.number(d.acceptedShare)}%`}
          </strong>
          <small>
            {f.number(accepted)} {t("quotationWorkspace.outOf")} {f.number(d.total)}
          </small>
        </article>
      </section>
      <section className="qt-target">
        <div>
          <p className="qt-eyebrow">
            {t("quotationWorkspace.monthTarget")} ·{" "}
            <bdi>{d.currentMonth.from.slice(0, 7)}</bdi>
          </p>
          <h2>
            <bdi>{f.money(d.targetBasis.acceptedSarMinor, "SAR")}</bdi>{" "}
            <small>
              /{" "}
              <bdi>
                {d.target
                  ? f.money(d.target.amountMinor, "SAR")
                  : t("quotationWorkspace.noTarget")}
              </bdi>
            </small>
          </h2>
          <p>{t("quotationWorkspace.targetBasis")}</p>
        </div>
        <div className="qt-target-action">
          <strong>
            {d.targetBasis.progress === null
              ? "—"
              : `${f.number(d.targetBasis.progress)}%`}
          </strong>
          <button type="button" disabled={!canSetTarget} onClick={onTarget}>
            {t("quotationWorkspace.editTarget")}
          </button>
        </div>
        {d.targetBasis.progress !== null && (
          <progress
            max={100}
            value={Math.min(100, d.targetBasis.progress)}
            aria-label={t("quotationWorkspace.targetProgress")}
          />
        )}
      </section>
      <section className="qt-panel">
        <div className="qt-section-heading">
          <h2>{t("quotationWorkspace.list")}</h2>
          <span>
            {f.number(d.list.total)} {t("quotationWorkspace.matches")}
          </span>
        </div>
        <form
          className="qt-filters"
          onSubmit={e => {
            e.preventDefault();
            onSelect({ ...d.selection, search: search.trim(), page: 1 });
          }}
        >
          <label>
            {t("quotationWorkspace.search")}
            <input
              type="search"
              value={search}
              maxLength={120}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("quotationWorkspace.searchHint")}
            />
          </label>
          <label>
            {t("quotationWorkspace.status")}
            <select
              value={d.selection.status}
              onChange={e =>
                onSelect({
                  ...d.selection,
                  status: e.target.value as QuotationSelection["status"],
                  page: 1,
                })
              }
            >
              <option value="all">{t("quotationWorkspace.allStatuses")}</option>
              {quotationStatuses.map(s => (
                <option key={s} value={s}>
                  {f.statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t("quotationWorkspace.apply")}</button>
          {(d.selection.search || d.selection.status !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                onSelect({
                  ...d.selection,
                  search: "",
                  status: "all",
                  page: 1,
                });
              }}
            >
              {t("quotationWorkspace.reset")}
            </button>
          )}
        </form>
        {d.list.items.length ? (
          <ul className="qt-list">{d.list.items.map(row)}</ul>
        ) : (
          <p className="qt-empty">
            {d.total
              ? t("quotationWorkspace.noMatches")
              : t("quotationWorkspace.empty")}
          </p>
        )}
        <nav
          className="qt-pagination"
          aria-label={t("quotationWorkspace.pagination")}
        >
          <button
            type="button"
            disabled={d.selection.page <= 1}
            onClick={() =>
              onSelect({ ...d.selection, page: d.selection.page - 1 })
            }
          >
            {t("quotationWorkspace.previous")}
          </button>
          <span>
            {t("quotationWorkspace.page")} {f.number(d.selection.page)} /{" "}
            {f.number(Math.max(1, d.list.totalPages))}
          </span>
          <button
            type="button"
            disabled={d.selection.page >= d.list.totalPages}
            onClick={() =>
              onSelect({ ...d.selection, page: d.selection.page + 1 })
            }
          >
            {t("quotationWorkspace.next")}
          </button>
        </nav>
      </section>
      <details className="qt-panel qt-evidence">
        <summary>{t("quotationWorkspace.evidence")}</summary>
        <p>{t("quotationWorkspace.measurementNote")}</p>
        <h3>{t("quotationWorkspace.acceptedValues")}</h3>
        {d.values.length ? (
          <dl className="qt-values">
            {d.values.map(v => (
              <div key={v.currency}>
                <dt>{v.currency}</dt>
                <dd>
                  <strong>{f.money(v.totalMinor, v.currency)}</strong>
                  <span>
                    {f.number(v.count)} {t("quotationWorkspace.acceptedCount")}{" "}
                    · {f.number(v.excludedAmounts)}{" "}
                    {t("quotationWorkspace.excluded")}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>{t("quotationWorkspace.noAccepted")}</p>
        )}
        <p>
          {t("quotationWorkspace.monthSample")}:{" "}
          {f.number(d.targetBasis.created)} /{" "}
          {t("quotationWorkspace.acceptedSarSample")}:{" "}
          {f.number(d.targetBasis.acceptedSar)} /{" "}
          {t("quotationWorkspace.excluded")}:{" "}
          {f.number(d.targetBasis.excludedSarAmounts)}
        </p>
        <p>
          {t("quotationWorkspace.period")}: <bdi>{d.currentMonth.from}</bdi> —{" "}
          <bdi>{d.currentMonth.through}</bdi>
        </p>
        <p>
          {t("quotationWorkspace.asOf")}: <bdi>{d.generatedAt}</bdi>
        </p>
        <a href={href("/merchant/sales-pipeline")}>
          {t("quotationWorkspace.pipeline")}
        </a>
      </details>
    </div>
  );
}
export function QuotationDetailView({
  data: q,
  t,
  language,
  href = (p: string) => p,
}: {
  data: QuotationDetail;
  t: Labels;
  language: string;
  href?: (path: string) => string;
}) {
  const f = quotationDisplay(t, language);
  return (
    <article className="qt-detail">
      <div className="qt-row-title">
        <h3 dir="auto">{q.customerName || t("quotationWorkspace.unnamed")}</h3>
        <span className="qt-status" data-status={q.status}>
          {f.statuses[q.status]}
        </span>
      </div>
      <p className="qt-number" dir="ltr">
        {q.number}
      </p>
      <dl className="qt-detail-meta">
        <div>
          <dt>{t("quotationWorkspace.phone")}</dt>
          <dd>
            <bdi>{q.customerPhone || "—"}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.created")}</dt>
          <dd>{f.date(q.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.validUntil")}</dt>
          <dd>{f.date(q.validUntil)}</dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.revision")}</dt>
          <dd>{f.number(q.revision)}</dd>
        </div>
      </dl>
      {q.managed && (
        <p className="qt-note">{t("quotationWorkspace.managedNote")}</p>
      )}
      {q.validityElapsed && (
        <p className="qt-note">{t("quotationWorkspace.elapsed")}</p>
      )}
      {q.rawItems !== null && (
        <details className="qt-note">
          <summary>{t("quotationWorkspace.legacyItems")}</summary>
          <pre dir="auto">{q.rawItems}</pre>
        </details>
      )}
      {q.itemsTruncated && (
        <p role="alert">{t("quotationWorkspace.truncatedItems")}</p>
      )}
      <ol className="qt-detail-items">
        {q.items.map((v, i) => (
          <li key={i}>
            <strong dir="auto">{v.name}</strong>
            {v.description && <p dir="auto">{v.description}</p>}
            <dl>
              <div>
                <dt>{t("quotationWorkspace.quantity")}</dt>
                <dd>{v.quantity === null ? "—" : f.number(v.quantity)}</dd>
              </div>
              <div>
                <dt>{t("quotationWorkspace.unitPrice")}</dt>
                <dd>{f.money(v.unitPriceMinor, q.currency)}</dd>
              </div>
              <div>
                <dt>{t("quotationWorkspace.lineTotal")}</dt>
                <dd>{f.money(v.totalMinor, q.currency)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      <dl className="qt-totals">
        <div>
          <dt>{t("quotationWorkspace.subtotal")}</dt>
          <dd>{f.money(q.subtotalMinor, q.currency)}</dd>
        </div>
        <div>
          <dt>
            {t("quotationWorkspace.tax")}
            {q.taxBasisPoints !== null
              ? ` (${f.number(q.taxBasisPoints / 100)}%)`
              : ""}
          </dt>
          <dd>{f.money(q.taxMinor, q.currency)}</dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.total")}</dt>
          <dd>{f.money(q.totalMinor, q.currency)}</dd>
        </div>
      </dl>
      <p className="qt-note">{t("quotationWorkspace.measurementNote")}</p>
      {q.conversationId !== null && (
        <a
          href={href(
            `/merchant/conversations?conversationId=${q.conversationId}`
          )}
        >
          {t("quotationWorkspace.conversation")}
        </a>
      )}
    </article>
  );
}
