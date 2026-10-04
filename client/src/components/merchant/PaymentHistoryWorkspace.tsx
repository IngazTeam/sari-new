import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CreditCard,
  Receipt,
  RefreshCw,
  Printer,
  Download,
  ArrowLeft,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  paymentHistoryInput,
  paymentHistoryWorkspace,
  paymentHistoryDetail,
  paymentHistoryStatuses,
} from "@shared/payment-history-workspace";
import {
  formatStoredPaymentMoney,
  formatPaymentTotalMoney,
} from "@shared/payment-money";
import {
  readPaymentHistorySearch,
  paymentHistorySearch,
  paymentHistoryDate,
  downloadPaymentHistory,
} from "@/lib/payment-history-view";
import { paymentHistoryLabels } from "@/lib/payment-history-labels";
import "@/styles/settings-workspace.css";
import "@/styles/payment-history-workspace.css";
type Scope = { actorId: number; merchantId: number };
type Copy = ReturnType<typeof paymentHistoryLabels>;
const states = (c: Copy) => ({
  pending: c.pending,
  authorized: c.authorized,
  captured: c.captured,
  failed: c.failed,
  cancelled: c.cancelled,
  refunded: c.refunded,
  unknown: c.unknownStatus,
});
function Header({ detail = false }: { detail?: boolean }) {
  const { t } = useTranslation(),
    c = paymentHistoryLabels(t);
  return (
    <header className="sw-heading">
      <span aria-hidden="true">{detail ? <Receipt /> : <CreditCard />}</span>
      <div>
        <p>{c.eyebrow}</p>
        <h1>{detail ? c.detailTitle : c.title}</h1>
        <p>{c.sourceHint}</p>
      </div>
    </header>
  );
}
function Nav() {
  const { t } = useTranslation(),
    c = paymentHistoryLabels(t);
  return (
    <nav className="ph-nav ph-print-hidden" aria-label={c.relatedTools}>
      <Link href="/merchant/payment-settings">{c.settings}</Link>
      <Link href="/merchant/payment-links">{c.links}</Link>
    </nav>
  );
}
function Status({
  status,
  c,
}: {
  status: (typeof paymentHistoryStatuses)[number];
  c: Copy;
}) {
  return (
    <span className={`ph-status ph-status-${status}`}>{states(c)[status]}</span>
  );
}
export function PaymentHistoryList({ actorId, merchantId }: Scope) {
  const { t, i18n } = useTranslation(),
    c = paymentHistoryLabels(t),
    search = useSearch(),
    [, navigate] = useLocation();
  const parsed = readPaymentHistorySearch(search),
    filter = parsed.success ? parsed.data : null;
  const seed = () => {
    const p = new URLSearchParams(search);
    return {
      search: p.get("search") ?? "",
      status: p.get("status") ?? "all",
      from: p.get("from") ?? "",
      to: p.get("to") ?? "",
      pageSize: p.get("pageSize") ?? "25",
    };
  };
  const [draft, setDraft] = useState(seed),
    [invalid, setInvalid] = useState(false),
    [invalidFields, setInvalidFields] = useState<string[]>([]);
  const filterForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!invalidFields.length) return;
    const form = filterForm.current;
    if (invalidFields.some(x => ["from", "to", "pageSize"].includes(x))) {
      const advanced = form?.querySelector("details");
      if (advanced) advanced.open = true;
    }
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [invalidFields]);
  useEffect(() => {
    setDraft(seed());
    setInvalid(false);
    setInvalidFields([]);
  }, [search]);
  const query = trpc.payments.workspace.list.useQuery(filter ?? {}, {
    enabled: !!filter,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const dto = paymentHistoryWorkspace.safeParse(query.data);
  const snapshot =
    dto.success &&
    dto.data.actorId === actorId &&
    dto.data.merchantId === merchantId &&
    filter &&
    JSON.stringify(dto.data.filters) === JSON.stringify(filter)
      ? dto.data
      : null;
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const change = (key: keyof typeof draft, value: string) => {
    setDraft(d => ({ ...d, [key]: value }));
    setInvalid(false);
    setInvalidFields([]);
  };
  const page = (value: number) =>
    filter &&
    navigate(
      "/merchant/payments" + paymentHistorySearch({ ...filter, page: value })
    );
  return (
    <section
      className="sw-workspace ph-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
    >
      <Header />
      <Nav />
      <form
        ref={filterForm}
        className="sw-panel ph-filters"
        noValidate
        onSubmit={e => {
          e.preventDefault();
          const r = paymentHistoryInput.safeParse({
            ...draft,
            from: draft.from || undefined,
            to: draft.to || undefined,
            pageSize: Number(draft.pageSize),
            page: 1,
          });
          if (!r.success) {
            setInvalidFields(
              r.error.issues.map(issue => String(issue.path[0]))
            );
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setInvalidFields([]);
          navigate("/merchant/payments" + paymentHistorySearch(r.data));
        }}
      >
        <div className="ph-filter-row">
          <label htmlFor="ph-search">
            {c.search}
            <input
              id="ph-search"
              aria-invalid={
                (invalid && invalidFields.includes("search")) || undefined
              }
              aria-describedby={
                invalid && invalidFields.includes("search")
                  ? "ph-filter-error"
                  : undefined
              }
              maxLength={100}
              value={draft.search}
              onChange={e => change("search", e.target.value)}
              placeholder={c.searchHint}
            />
          </label>
          <label htmlFor="ph-status">
            {c.status}
            <select
              id="ph-status"
              aria-invalid={
                (invalid && invalidFields.includes("status")) || undefined
              }
              aria-describedby={
                invalid && invalidFields.includes("status")
                  ? "ph-filter-error"
                  : undefined
              }
              value={draft.status}
              onChange={e => change("status", e.target.value)}
            >
              <option value="all">{c.allStatuses}</option>
              {paymentHistoryStatuses.map(s => (
                <option key={s} value={s}>
                  {states(c)[s]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">{c.apply}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({
                search: "",
                status: "all",
                from: "",
                to: "",
                pageSize: "25",
              });
              setInvalid(false);
              setInvalidFields([]);
              navigate("/merchant/payments");
            }}
          >
            {c.reset}
          </Button>
        </div>
        <details className="ph-filter-details">
          <summary>{c.dateFilters}</summary>
          <div className="ph-filter-row">
            <label htmlFor="ph-from">
              {c.from}
              <input
                id="ph-from"
                aria-invalid={
                  (invalid && invalidFields.includes("from")) || undefined
                }
                aria-describedby={
                  invalid && invalidFields.includes("from")
                    ? "ph-filter-error"
                    : undefined
                }
                type="date"
                value={draft.from}
                onChange={e => change("from", e.target.value)}
              />
            </label>
            <label htmlFor="ph-to">
              {c.to}
              <input
                id="ph-to"
                aria-invalid={
                  (invalid && invalidFields.includes("to")) || undefined
                }
                aria-describedby={
                  invalid && invalidFields.includes("to")
                    ? "ph-filter-error"
                    : undefined
                }
                type="date"
                value={draft.to}
                onChange={e => change("to", e.target.value)}
              />
            </label>
            <label htmlFor="ph-page-size">
              {c.pageSize}
              <select
                id="ph-page-size"
                aria-invalid={
                  (invalid && invalidFields.includes("pageSize")) || undefined
                }
                aria-describedby={
                  invalid && invalidFields.includes("pageSize")
                    ? "ph-filter-error"
                    : undefined
                }
                value={draft.pageSize}
                onChange={e => change("pageSize", e.target.value)}
              >
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
          <p className="ph-muted">{c.utc}</p>
        </details>
        {(invalid || !filter) && (
          <p id="ph-filter-error" className="ph-error" role="alert">
            {c.invalidFilter}
          </p>
        )}
      </form>
      {!filter ? null : query.error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading || query.isFetching ? (
        <WorkspaceState inline kind="loading" />
      ) : !snapshot ? (
        <WorkspaceState
          inline
          kind="error"
          onRetry={() => void query.refetch()}
        />
      ) : !snapshot.canView ? (
        <WorkspaceState inline kind="forbidden" description={c.ownerOnly} />
      ) : (
        <>
          <section className="sw-panel ph-overview" aria-label={c.summary}>
            <div className="ph-section-head">
              <div>
                <h2>{c.summary}</h2>
                <p className="ph-muted">{c.filteredScope}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                <RefreshCw aria-hidden="true" />
                {c.refresh}
              </Button>
            </div>
            <div className="ph-counts">
              <div>
                <span>{c.totalRecords}</span>
                <strong>{number(snapshot.totals!.total)}</strong>
              </div>
              {(["captured", "pending", "failed"] as const).map(s => (
                <div key={s}>
                  <span>{states(c)[s]}</span>
                  <strong>{number(snapshot.totals!.states[s])}</strong>
                </div>
              ))}
            </div>
            <details className="ph-filter-details ph-summary-details">
              <summary>{c.moreSummary}</summary>
              <div className="ph-counts">
                {(
                  ["authorized", "cancelled", "refunded", "unknown"] as const
                ).map(s => (
                  <div key={s}>
                    <span>{states(c)[s]}</span>
                    <strong>{number(snapshot.totals!.states[s])}</strong>
                  </div>
                ))}
              </div>
              {snapshot.totals!.currencies.length > 0 && (
                <div className="ph-currencies">
                  {snapshot.totals!.currencies.map(x => (
                    <article key={x.currency}>
                      <h3>{x.currency}</h3>
                      <dl>
                        {[
                          [c.captured, x.capturedMinor],
                          [c.authorized, x.authorizedMinor],
                          [c.refunded, x.refundedMinor],
                          [c.attemptedValue, x.totalMinor],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <dt>{label}</dt>
                            <dd>
                              <bdi>
                                {formatPaymentTotalMoney(
                                  value,
                                  x.currency,
                                  i18n.language
                                ) ?? c.moneyUnknown}
                              </bdi>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </details>
            <p className="ph-muted">{c.financialHint}</p>
            {snapshot.totals!.excludedAmounts > 0 && (
              <p className="ph-warning" role="status">
                {c.excluded}: {number(snapshot.totals!.excludedAmounts)}
              </p>
            )}
          </section>
          <section className="sw-panel ph-records" aria-label={c.title}>
            <div className="ph-section-head">
              <h2>{c.title}</h2>
              <span className="ph-muted">
                {c.checkedAt}:{" "}
                {paymentHistoryDate(
                  snapshot.checkedAt,
                  i18n.language,
                  c.notAvailable
                )}{" "}
                · UTC
              </span>
            </div>
            {snapshot.items.length === 0 ? (
              <div className="ph-empty">
                <Receipt aria-hidden="true" />
                <h3>
                  {snapshot.totals!.total === 0 &&
                  (filter.search ||
                    filter.status !== "all" ||
                    filter.from ||
                    filter.to)
                    ? c.noMatches
                    : snapshot.totals!.total > 0
                      ? c.pageEmpty
                      : c.empty}
                </h3>
                <p>{c.emptyHint}</p>
              </div>
            ) : (
              <table className="ph-table">
                <thead>
                  <tr>
                    {[
                      c.reference,
                      c.customer,
                      c.amount,
                      c.status,
                      c.method,
                      c.createdAt,
                      c.details,
                    ].map(label => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.items.map(item => (
                    <tr key={item.id}>
                      <td data-label={c.reference}>
                        <strong>#{item.id}</strong>
                        <small dir="ltr">
                          {item.chargeId ?? c.notAvailable}
                        </small>
                      </td>
                      <td data-label={c.customer}>
                        <span>{item.customerName ?? c.notAvailable}</span>
                        <small dir="ltr">
                          {item.customerPhone ?? c.notAvailable}
                        </small>
                      </td>
                      <td data-label={c.amount}>
                        <bdi>
                          {formatStoredPaymentMoney(
                            item.amountMinor,
                            item.currency,
                            i18n.language
                          ) ?? c.moneyUnknown}
                        </bdi>
                      </td>
                      <td data-label={c.status}>
                        <Status status={item.status} c={c} />
                        {item.warnings.length > 0 && (
                          <small>{c.needsReview}</small>
                        )}
                      </td>
                      <td data-label={c.method}>
                        {item.paymentMethod ?? c.notAvailable}
                      </td>
                      <td data-label={c.createdAt}>
                        {paymentHistoryDate(
                          item.createdAt,
                          i18n.language,
                          c.notAvailable
                        )}
                      </td>
                      <td>
                        <Link
                          className="ph-detail-link"
                          aria-label={`${c.details} #${item.id}`}
                          href={`/merchant/payments/${item.id}${paymentHistorySearch(filter)}`}
                        >
                          {c.details}
                          <ArrowLeft aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="ph-pagination">
              <Button
                type="button"
                variant="outline"
                disabled={filter.page === 1}
                onClick={() => page(filter.page - 1)}
              >
                {c.previous}
              </Button>
              <span>
                {c.page} {number(filter.page)}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={!snapshot.hasNext || filter.page >= 10000}
                onClick={() => page(filter.page + 1)}
              >
                {c.next}
              </Button>
            </div>
            <p className="ph-muted">{c.utc}</p>
          </section>
        </>
      )}
    </section>
  );
}
export function PaymentHistoryRecord({
  actorId,
  merchantId,
  paymentId,
}: Scope & { paymentId: number }) {
  const { t, i18n } = useTranslation(),
    c = paymentHistoryLabels(t),
    search = useSearch();
  const filter = readPaymentHistorySearch(search),
    back =
      "/merchant/payments" +
      (filter.success ? paymentHistorySearch(filter.data) : "");
  const query = trpc.payments.workspace.detail.useQuery(
    { id: paymentId },
    { retry: false, staleTime: 0, refetchOnWindowFocus: false }
  );
  const parsed = paymentHistoryDetail.safeParse(query.data),
    snapshot =
      parsed.success &&
      parsed.data.actorId === actorId &&
      parsed.data.merchantId === merchantId &&
      (!parsed.data.payment || parsed.data.payment.id === paymentId)
        ? parsed.data
        : null;
  const [notice, setNotice] = useState<
    "downloadStarted" | "actionFailed" | null
  >(null);
  const p = snapshot?.payment;
  const date = (value: string | null) =>
    paymentHistoryDate(value, i18n.language, c.notAvailable);
  return (
    <section
      className="sw-workspace ph-workspace ph-detail"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
    >
      <Link href={back} className="ph-back ph-print-hidden">
        <ArrowLeft aria-hidden="true" />
        {c.back}
      </Link>
      <Header detail />
      {query.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(query.error)}
          inline
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading || query.isFetching ? (
        <WorkspaceState inline kind="loading" />
      ) : !snapshot ? (
        <WorkspaceState
          inline
          kind="error"
          onRetry={() => void query.refetch()}
        />
      ) : !snapshot.canView ? (
        <WorkspaceState inline kind="forbidden" description={c.ownerOnly} />
      ) : !p ? (
        <WorkspaceState
          inline
          kind="missing"
          title={c.missing}
          action={
            <Button asChild>
              <Link href={back}>{c.back}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="ph-actions ph-print-hidden">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNotice(null);
                void query.refetch();
              }}
            >
              <RefreshCw aria-hidden="true" />
              {c.refresh}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  window.print();
                } catch {
                  setNotice("actionFailed");
                }
              }}
            >
              <Printer aria-hidden="true" />
              {c.print}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  downloadPaymentHistory(snapshot);
                  setNotice("downloadStarted");
                } catch {
                  setNotice("actionFailed");
                }
              }}
            >
              <Download aria-hidden="true" />
              {c.export}
            </Button>
          </div>
          {notice && (
            <p
              className={notice === "actionFailed" ? "ph-error" : "ph-notice"}
              role="status"
            >
              {c[notice]}
            </p>
          )}
          <div className="ph-detail-grid">
            <section className="sw-panel ph-payment-summary">
              <div className="ph-section-head">
                <h2>
                  {c.reference} #{p.id}
                </h2>
                <Status status={p.status} c={c} />
              </div>
              <p className="ph-muted">{c.amount}</p>
              <p className="ph-amount" data-payment-amount>
                <bdi>
                  {formatStoredPaymentMoney(
                    p.amountMinor,
                    p.currency,
                    i18n.language
                  ) ?? c.moneyUnknown}
                </bdi>
              </p>
              <p className="ph-muted">{c.financialHint}</p>
              {p.warnings.length > 0 && (
                <p className="ph-warning">{c.needsReview}</p>
              )}
              <dl className="ph-definition">
                <div>
                  <dt>{c.chargeId}</dt>
                  <dd dir="ltr">{p.chargeId ?? c.notAvailable}</dd>
                </div>
                <div>
                  <dt>{c.method}</dt>
                  <dd>{p.paymentMethod ?? c.notAvailable}</dd>
                </div>
                <div>
                  <dt>{c.description}</dt>
                  <dd>{p.description ?? c.notAvailable}</dd>
                </div>
              </dl>
              {p.hasRecordedError && (
                <p className="ph-warning">{c.recordedError}</p>
              )}
            </section>
            <section className="sw-panel">
              <h2>{c.customer}</h2>
              <dl className="ph-definition">
                <div>
                  <dt>{c.customerName}</dt>
                  <dd>{p.customerName ?? c.notAvailable}</dd>
                </div>
                <div>
                  <dt>{c.phone}</dt>
                  <dd dir="ltr">{p.customerPhone ?? c.notAvailable}</dd>
                </div>
                <div>
                  <dt>{c.email}</dt>
                  <dd dir="ltr">{p.customerEmail ?? c.notAvailable}</dd>
                </div>
              </dl>
              <h3>{c.relatedRecord}</h3>
              {p.related.kind === "order" ? (
                <Link
                  className="ph-detail-link"
                  href={`/merchant/orders/${p.related.id}`}
                >
                  {c.order} #{p.related.id}
                </Link>
              ) : p.related.kind === "booking" ? (
                <Link
                  className="ph-detail-link"
                  href={`/merchant/bookings?booking=${p.related.id}`}
                >
                  {c.booking} #{p.related.id}
                </Link>
              ) : (
                <p className="ph-muted">
                  {p.related.kind === "unavailable"
                    ? c.relatedUnavailable
                    : c.noRelated}
                </p>
              )}
            </section>
          </div>
          <section className="sw-panel ph-timeline">
            <h2>{c.timeline}</h2>
            <p className="ph-muted">{c.utc}</p>
            <dl>
              {(
                [
                  [c.createdAt, p.createdAt],
                  [c.authorizedAt, p.authorizedAt],
                  [c.capturedAt, p.capturedAt],
                  [c.failedAt, p.failedAt],
                  [c.refundedAt, p.refundedAt],
                  [c.expiresAt, p.expiresAt],
                  [c.updatedAt, p.updatedAt],
                ] as Array<[string, string | null]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{date(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="ph-muted ph-print-hidden">{c.exportHint}</p>
          <p className="ph-muted">
            {c.checkedAt}: {date(snapshot.checkedAt)} · UTC
          </p>
          <Nav />
        </>
      )}
    </section>
  );
}
