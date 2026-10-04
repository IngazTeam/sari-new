import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Link2, Plus, Copy, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { paymentHistoryDate as date } from "@/lib/payment-history-view";
import {
  readPaymentLinksSearch,
  paymentLinksHref,
} from "@/lib/payment-links-view";
import {
  paymentLinksInput,
  paymentLinksWorkspace,
  paymentLinkDetail,
  paymentLinkDisableResult,
  paymentLinkAvailabilityStates,
} from "@shared/payment-links-workspace";
import {
  PaymentLinksFrame as Frame,
  LinkState as State,
  LinkPairs as Pairs,
  linkNumber as number,
  linkMoney as money,
  useLinkCopy,
  useLinkLive,
  linkScoped as scoped,
  type LinkScope as Scope,
  type LinkCopy,
} from "./PaymentLinksPrimitives";
export function PaymentLinksList(scope: Scope) {
  const { c, locale } = useLinkCopy(),
    search = useSearch(),
    [, navigate] = useLocation(),
    parsed = readPaymentLinksSearch(search),
    filter = parsed.success ? parsed.data : null;
  const seed = () => {
    const p = new URLSearchParams(search);
    return {
      search: p.get("search") ?? "",
      availability: p.get("availability") ?? "all",
      pageSize: p.get("pageSize") ?? "25",
    };
  };
  const [draft, setDraft] = useState(seed),
    [errors, setErrors] = useState<string[]>([]),
    form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setDraft(seed());
    setErrors([]);
  }, [search]);
  useEffect(() => {
    if (errors.length)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [errors]);
  const query = trpc.payments.linksWorkspace.list.useQuery(filter ?? {}, {
    enabled: !!filter,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const dto = paymentLinksWorkspace.safeParse(query.data),
    snapshot =
      dto.success &&
      scoped(dto.data, scope) &&
      filter &&
      JSON.stringify(dto.data.filters) === JSON.stringify(filter)
        ? dto.data
        : null;
  const change = (key: keyof typeof draft, value: string) => {
    setDraft(d => ({ ...d, [key]: value }));
    setErrors([]);
  };
  const attrs = (key: string) => ({
    "aria-invalid": errors.includes(key) || undefined,
    "aria-describedby": errors.includes(key) ? "pl-filter-error" : undefined,
  });
  return (
    <Frame title="title">
      <form
        className="sw-panel ph-filters"
        ref={form}
        noValidate
        onSubmit={e => {
          e.preventDefault();
          const result = paymentLinksInput.safeParse({
            ...draft,
            pageSize: Number(draft.pageSize),
            page: 1,
          });
          if (!result.success) {
            setErrors(result.error.issues.map(i => String(i.path[0])));
            return;
          }
          setErrors([]);
          navigate(paymentLinksHref(result.data));
        }}
      >
        <div className="ph-filter-row">
          <label htmlFor="pl-search">
            {c.search}
            <input
              id="pl-search"
              maxLength={100}
              {...attrs("search")}
              value={draft.search}
              placeholder={c.searchHint}
              onChange={e => change("search", e.target.value)}
            />
          </label>
          <label htmlFor="pl-availability">
            {c.availability}
            <select
              id="pl-availability"
              {...attrs("availability")}
              value={draft.availability}
              onChange={e => change("availability", e.target.value)}
            >
              <option value="all">{c.all}</option>
              {paymentLinkAvailabilityStates.map(s => (
                <option key={s} value={s}>
                  {c[s]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="pl-page-size">
            {c.pageSize}
            <select
              id="pl-page-size"
              {...attrs("pageSize")}
              value={draft.pageSize}
              onChange={e => change("pageSize", e.target.value)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
          <Button type="submit">{c.apply}</Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setDraft({ search: "", availability: "all", pageSize: "25" });
              setErrors([]);
              navigate(paymentLinksHref({}));
            }}
          >
            {c.reset}
          </Button>
        </div>
        {(!filter || errors.length > 0) && (
          <p id="pl-filter-error" role="alert" className="ph-error">
            {c.filterError}
          </p>
        )}
      </form>
      {filter &&
        (query.error ? (
          <WorkspaceState
            kind={workspaceFailureKind(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : query.isLoading || query.isFetching ? (
          <WorkspaceState kind="loading" />
        ) : !snapshot ? (
          <WorkspaceState kind="error" onRetry={() => void query.refetch()} />
        ) : !snapshot.canView ? (
          <div className="ph-warning" role="status">
            {c.ownerOnly}
          </div>
        ) : (
          <>
            <div className="ph-section-head">
              <div>
                <h2>{c.summary}</h2>
                <p className="ph-muted">{c.filteredHint}</p>
              </div>
              <div className="ph-actions">
                <Button variant="outline" onClick={() => void query.refetch()}>
                  <RefreshCw aria-hidden="true" />
                  {c.refresh}
                </Button>
                {snapshot.canManage && (
                  <Link
                    className="pl-primary"
                    href={paymentLinksHref(filter, { create: true })}
                  >
                    <Plus aria-hidden="true" />
                    {c.newLink}
                  </Link>
                )}
              </div>
            </div>
            <div className="ph-counts pl-counts">
              <div>
                <span>{c.total}</span>
                <strong>{number(snapshot.totals!.total, locale, c)}</strong>
              </div>
              {paymentLinkAvailabilityStates.map(s => (
                <div key={s}>
                  <span>{c[s]}</span>
                  <strong>
                    {number(snapshot.totals!.states[s], locale, c)}
                  </strong>
                </div>
              ))}
            </div>
            <section className="sw-panel">
              <p className="ph-muted">{c.sourceHint}</p>
              {snapshot.items.length === 0 ? (
                <div className="ph-empty">
                  <Link2 aria-hidden="true" />
                  <h2>{c.empty}</h2>
                  <p>{c.emptyHint}</p>
                </div>
              ) : (
                <table className="ph-table">
                  <caption className="sr-only">{c.title}</caption>
                  <thead>
                    <tr>
                      {[
                        c.name,
                        c.amount,
                        c.availability,
                        c.uses,
                        c.expires,
                        c.details,
                      ].map(h => (
                        <th scope="col" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.items.map(row => (
                      <tr key={row.id}>
                        <td data-label={c.name}>
                          <strong>{row.title ?? c.unknown}</strong>
                          <small>#{row.id}</small>
                        </td>
                        <td data-label={c.amount}>
                          <bdi>
                            {money(row.amountMinor, row.currency, locale, c)}
                          </bdi>
                        </td>
                        <td data-label={c.availability}>
                          <State value={row.availability} c={c} />
                        </td>
                        <td data-label={c.uses}>
                          <span>
                            {number(row.usageCount, locale, c)} /{" "}
                            {row.maxUsageCount === null
                              ? row.warnings.includes("counters")
                                ? c.unknown
                                : c.unlimited
                              : number(row.maxUsageCount, locale, c)}
                          </span>
                        </td>
                        <td data-label={c.expires}>
                          <span>
                            {row.expiresAt
                              ? date(row.expiresAt, locale, c.unknown)
                              : row.warnings.includes("timestamps")
                                ? c.unknown
                                : c.noExpiry}
                          </span>
                        </td>
                        <td>
                          <Link
                            className="ph-detail-link"
                            href={paymentLinksHref(filter, { link: row.id })}
                            aria-label={`${c.details}: ${row.title ?? row.id}`}
                          >
                            {c.details}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <nav className="ph-pagination" aria-label={c.page}>
                <Button
                  variant="outline"
                  disabled={filter.page <= 1}
                  onClick={() =>
                    navigate(
                      paymentLinksHref({ ...filter, page: filter.page - 1 })
                    )
                  }
                >
                  {c.previous}
                </Button>
                <span>
                  {c.page} {number(filter.page, locale, c)}
                </span>
                <Button
                  variant="outline"
                  disabled={!snapshot.hasNext || filter.page >= 10000}
                  onClick={() =>
                    navigate(
                      paymentLinksHref({ ...filter, page: filter.page + 1 })
                    )
                  }
                >
                  {c.next}
                </Button>
              </nav>
              <p className="ph-muted">
                {c.checkedAt}: {date(snapshot.checkedAt, locale, c.unknown)} ·{" "}
                {c.utc}
              </p>
            </section>
          </>
        ))}
    </Frame>
  );
}
export function PaymentLinkView({
  linkId,
  ...scope
}: Scope & { linkId: number }) {
  const { c, locale } = useLinkCopy(),
    live = useLinkLive(),
    lock = useRef(false);
  const query = trpc.payments.linksWorkspace.detail.useQuery(
    { id: linkId },
    {
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const mutation = trpc.payments.linksWorkspace.disableReviewed.useMutation({
    retry: false,
  });
  const parse = (value: unknown) => {
    const p = paymentLinkDetail.safeParse(value);
    return p.success &&
      scoped(p.data, scope) &&
      (!p.data.link || p.data.link.id === linkId)
      ? p.data
      : null;
  };
  const [accepted, setAccepted] = useState<ReturnType<typeof parse>>(null),
    [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<keyof LinkCopy | null>(null);
  const snapshot = query.error ? null : (accepted ?? parse(query.data)),
    row = snapshot?.link;
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setReview(false);
    setConfirm(false);
    try {
      const r = await query.refetch();
      if (!live()) return;
      const result = r.error ? null : parse(r.data);
      if (!result) throw Error("read");
      setAccepted(result);
      setBlocked(false);
      setNotice(null);
    } catch {
      if (live()) {
        setBlocked(true);
        setNotice("readFailed");
      }
    } finally {
      lock.current = false;
      if (live()) setBusy(false);
    }
  };
  const disable = async () => {
    if (
      lock.current ||
      busy ||
      blocked ||
      !review ||
      !confirm ||
      !row ||
      !snapshot?.canManage ||
      query.isFetching
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = paymentLinkDisableResult.parse(
        await mutation.mutateAsync({
          id: row.id,
          expectedRevision: row.revision,
          reviewed: true,
        })
      );
      if (!live()) return;
      const value = parse(result.workspace);
      if (!value) throw Error("receipt");
      setAccepted(value);
      setReview(false);
      setConfirm(false);
      setNotice("disabledSaved");
    } catch (error: any) {
      if (live()) {
        setBlocked(true);
        setReview(false);
        setConfirm(false);
        setNotice(
          error?.data?.code === "CONFLICT" ? "changed" : "actionUnknown"
        );
      }
    } finally {
      lock.current = false;
      if (live()) setBusy(false);
    }
  };
  const copy = async () => {
    if (!row?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(row.publicUrl);
      if (live()) setNotice("copied");
    } catch {
      if (live()) setNotice("copyFailed");
    }
  };
  const warningNames = {
    identity: c.warningIdentity,
    text: c.warningText,
    amount: c.warningAmount,
    currency: c.warningCurrency,
    configuration: c.warningConfiguration,
    counters: c.warningCounters,
    timestamps: c.warningTimestamps,
    target: c.warningTarget,
    url: c.warningUrl,
  };
  return (
    <Frame title="detailTitle" back>
      {query.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void refresh()}
        />
      ) : query.isLoading || query.isFetching ? (
        <WorkspaceState kind="loading" />
      ) : !snapshot ? (
        <WorkspaceState kind="error" onRetry={() => void refresh()} />
      ) : !snapshot.canView ? (
        <p role="status" className="ph-warning">
          {c.ownerOnly}
        </p>
      ) : !row ? (
        <WorkspaceState kind="missing" />
      ) : (
        <>
          <div className="ph-section-head">
            <State value={row.availability} c={c} />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" />
              {c.refresh}
            </Button>
          </div>
          {notice && (
            <p role="status" className={blocked ? "ph-warning" : "ph-notice"}>
              {c[notice]}
            </p>
          )}
          <div className="ph-detail-grid">
            <section className="sw-panel ph-payment-summary">
              <h2>{row.title ?? c.unknown}</h2>
              <p className="ph-amount">
                <bdi>{money(row.amountMinor, row.currency, locale, c)}</bdi>
              </p>
              {row.description && (
                <p className="pl-description">{row.description}</p>
              )}
              <p className="ph-muted">{c.sourceHint}</p>
              {row.publicUrl ? (
                <div className="pl-url">
                  <label htmlFor="pl-customer-url">{c.url}</label>
                  <input
                    id="pl-customer-url"
                    dir="ltr"
                    value={row.publicUrl}
                    readOnly
                    onFocus={e => e.target.select()}
                  />
                  <Button variant="outline" onClick={() => void copy()}>
                    <Copy aria-hidden="true" />
                    {c.copy}
                  </Button>
                </div>
              ) : (
                <p className="ph-warning">{c.urlUnavailable}</p>
              )}
              <Pairs
                rows={[
                  [
                    c.uses,
                    `${number(row.usageCount, locale, c)} / ${row.maxUsageCount === null ? (row.warnings.includes("counters") ? c.unknown : c.unlimited) : number(row.maxUsageCount, locale, c)}`,
                  ],
                  [
                    c.expires,
                    row.expiresAt
                      ? date(row.expiresAt, locale, c.unknown)
                      : row.warnings.includes("timestamps")
                        ? c.unknown
                        : c.noExpiry,
                  ],
                  [
                    c.related,
                    row.related.kind === "order" ? (
                      <Link
                        className="ph-detail-link"
                        href={`/merchant/orders/${row.related.id}`}
                      >
                        {c.order}
                      </Link>
                    ) : row.related.kind === "booking" ? (
                      <Link
                        className="ph-detail-link"
                        href={`/merchant/bookings?booking=${row.related.id}`}
                      >
                        {c.booking}
                      </Link>
                    ) : row.related.kind === "none" ? (
                      c.general
                    ) : (
                      c.unavailableReference
                    ),
                  ],
                ]}
              />
              {snapshot.canManage && row.enabled !== false && (
                <div className="pl-disable">
                  <p className="ph-muted">{c.disableHint}</p>
                  {!confirm ? (
                    <Button
                      variant="outline"
                      disabled={busy || blocked}
                      onClick={() => setConfirm(true)}
                    >
                      {c.disable}
                    </Button>
                  ) : (
                    <>
                      <label className="pl-check">
                        <input
                          type="checkbox"
                          checked={review}
                          disabled={busy || blocked}
                          onChange={e => setReview(e.target.checked)}
                        />
                        {c.disableReview}
                      </label>
                      <div className="ph-actions">
                        <Button
                          disabled={!review || busy || blocked}
                          onClick={() => void disable()}
                        >
                          {busy ? c.creating : c.disableConfirm}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setConfirm(false);
                            setReview(false);
                          }}
                        >
                          {c.cancel}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
            <section className="sw-panel">
              <h2>{c.storedStats}</h2>
              <p className="ph-muted">{c.statsHint}</p>
              <Pairs
                rows={[
                  [
                    c.collected,
                    money(row.totalCollectedMinor, row.currency, locale, c),
                  ],
                  [c.successful, number(row.successfulPayments, locale, c)],
                  [c.failed, number(row.failedPayments, locale, c)],
                ]}
              />
              <Link className="ph-detail-link" href="/merchant/payments">
                {c.history}
              </Link>
              {row.warnings.length > 0 && (
                <div className="ph-warning">
                  <p>{c.warnings}</p>
                  <ul>
                    {row.warnings.map(w => (
                      <li key={w}>{warningNames[w]}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
          <details className="sw-panel ph-filter-details">
            <summary>{c.technical}</summary>
            <Pairs
              rows={[
                [c.reference, row.linkId ?? c.unknown],
                [
                  c.amountMode,
                  row.fixedAmount === null
                    ? c.unknown
                    : row.fixedAmount
                      ? c.fixed
                      : c.variable,
                ],
                [c.minimum, money(row.minAmountMinor, row.currency, locale, c)],
                [c.maximum, money(row.maxAmountMinor, row.currency, locale, c)],
                [
                  c.storedStatus,
                  row.storedStatus ? c[row.storedStatus] : c.unknown,
                ],
                [
                  c.enabled,
                  row.enabled === null ? c.unknown : row.enabled ? c.yes : c.no,
                ],
                [c.createdAt, date(row.createdAt, locale, c.unknown)],
                [c.updatedAt, date(row.updatedAt, locale, c.unknown)],
                [c.checkedAt, date(snapshot.checkedAt, locale, c.unknown)],
              ]}
            />
            <p className="ph-muted">{c.utc}</p>
          </details>
        </>
      )}
    </Frame>
  );
}
