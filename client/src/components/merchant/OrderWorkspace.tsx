import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readOrderStatusCache,
  saveOrderStatusCache,
  clearOrderStatusCache,
  type OrderStatusCache,
  type OrderStatusDraft,
} from "@/lib/order-status-cache";
import {
  orderListInput,
  orderSelectionKey,
  orderStates,
  orderPayments,
} from "@shared/order-workspace";
import {
  orderStatusIntent,
  orderStatusReceipt,
  type OrderStatusReview,
  type OrderStatusReceipt,
} from "@shared/order-status-review";
import {
  OrderSummary,
  OrderList,
  OrderDetailReport,
  orderStatusLabels,
  orderPaymentLabels,
  orderTime,
} from "./OrderReport";
import { OrderStatusForm } from "./OrderStatusForm";
import { OrderHistory } from "./OrderHistory";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { CheckoutInvoiceReview } from "@/components/CheckoutInvoiceReview";
import { CheckoutMarginExceptionAudit } from "@/components/CheckoutMarginExceptionAudit";
import { CheckoutDiscountBreakdown } from "@/components/CheckoutDiscountBreakdown";
import { OrderCheckoutAttempts } from "@/components/OrderCheckoutAttempts";
import { CheckoutDiscountRelease } from "@/components/CheckoutDiscountRelease";
import { ZidCheckoutReconciliation } from "@/components/ZidCheckoutReconciliation";
import { SallaCheckoutReview } from "@/components/SallaCheckoutReview";
import "@/styles/quotation-workspace.css";
import "@/styles/order-workspace.css";

type Attempt = NonNullable<OrderStatusCache["attempt"]>;
export function OrderWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    [actorId, merchantId] = scope.split(":").map(Number);
  const epoch = useRef(knowledgeCacheEpoch()),
    mounted = useRef(true),
    lock = useRef(false),
    cacheRef = useRef<OrderStatusCache>({});
  const [selection, setSelection] = useState(orderListInput.parse({})),
    [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "detail" | "status">("list"),
    [detailId, setDetailId] = useState<number | null>(null);
  const [cache, setCache] = useState<OrderStatusCache>({}),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [review, setReview] = useState<OrderStatusReview | null>(null),
    [consent, setConsent] = useState(false),
    [discard, setDiscard] = useState(false),
    [receipt, setReceipt] = useState<OrderStatusReceipt | null>(null);
  const query = trpc.orders.workspace.list.useQuery(selection, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const detailQuery = trpc.orders.workspace.detail.useQuery(
    { id: detailId ?? 1 },
    { enabled: detailId !== null, staleTime: 0, refetchOnMount: "always" }
  );
  const mutation = trpc.orders.workspace.statusWrite.useMutation();
  const data =
    !query.error &&
    !query.isFetching &&
    query.data?.merchantId === merchantId &&
    orderSelectionKey(query.data.selection) === orderSelectionKey(selection)
      ? query.data
      : undefined;
  const row =
    !detailQuery.error &&
    !detailQuery.isFetching &&
    detailQuery.data?.merchantId === merchantId &&
    detailQuery.data.id === detailId
      ? detailQuery.data
      : undefined;
  const canManage = !!data?.canManage,
    draft = cache.draft,
    attempt = cache.attempt;
  const alive = () =>
    mounted.current && epoch.current === knowledgeCacheEpoch();
  const persist = (value: OrderStatusCache) => {
    saveOrderStatusCache(scope, value, epoch.current);
    cacheRef.current = value;
    setCache(value);
  };
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = readOrderStatusCache(scope);
      cacheRef.current = saved;
      setCache(saved);
    } catch {
      setStorageError(true);
    }
    return () => {
      mounted.current = false;
    };
  }, [scope]);
  useEffect(() => {
    if (!draft && !attempt) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, attempt]);
  function change(value: OrderStatusDraft) {
    if (lock.current || attempt || storageError || !alive()) return;
    try {
      persist({ draft: value });
      setReview(null);
      setConsent(false);
      setErrors([]);
      setNotice("");
    } catch {
      setStorageError(true);
    }
  }
  function start() {
    if (
      !row ||
      !canManage ||
      draft ||
      attempt ||
      storageError ||
      lock.current ||
      row.externalReference ||
      ["delivered", "cancelled", "unknown"].includes(row.status)
    )
      return;
    change({
      id: row.id,
      status:
        row.status === "shipped"
          ? "delivered"
          : row.status === "processing"
            ? "shipped"
            : "processing",
      trackingNumber: "",
      reason: "",
      notify: false,
    });
    setView("status");
  }
  function retryStorage() {
    try {
      const saved = readOrderStatusCache(scope);
      persist(
        cacheRef.current.draft || cacheRef.current.attempt
          ? cacheRef.current
          : saved
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setConsent(false);
    try {
      await Promise.all([
        query.refetch(),
        ...(detailId ? [detailQuery.refetch()] : []),
      ]);
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  const intentOf = (value: OrderStatusDraft) =>
    orderStatusIntent.safeParse({
      id: value.id,
      status: value.status,
      notify: value.notify,
      ...(value.trackingNumber.trim()
        ? { trackingNumber: value.trackingNumber }
        : {}),
      ...(value.reason.trim() ? { reason: value.reason } : {}),
    });
  async function prepare() {
    if (
      !draft ||
      attempt ||
      !canManage ||
      storageError ||
      lock.current ||
      !alive()
    )
      return;
    const input = intentOf(draft);
    if (!input.success) {
      setErrors(input.error.issues.map(v => String(v.path[0])));
      return;
    }
    lock.current = true;
    setBusy(true);
    setReview(null);
    setConsent(false);
    setNotice("");
    try {
      const result = await utils.orders.workspace.statusReview.fetch(
        input.data
      );
      if (!alive()) return;
      if (
        result.merchantId !== merchantId ||
        result.actorId !== actorId ||
        JSON.stringify(result.intent) !== JSON.stringify(input.data)
      )
        throw Error("Review mismatch");
      setReview(result);
    } catch (error) {
      if (alive())
        setNotice(
          (error as any)?.data?.code === "PRECONDITION_FAILED"
            ? "blocked"
            : (error as any)?.data?.code === "NOT_FOUND"
              ? "missing"
              : "reviewFailed"
        );
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function complete(raw: unknown, a: Attempt) {
    if (!alive()) return;
    const result = orderStatusReceipt.parse(raw);
    if (
      result.merchantId !== merchantId ||
      result.actorId !== actorId ||
      result.requestId !== a.requestId ||
      result.orderId !== a.intent.id ||
      result.status !== a.intent.status ||
      result.reason !== (a.intent.reason ?? null) ||
      result.notificationQueued !== a.intent.notify ||
      (a.intent.trackingNumber !== undefined &&
        result.trackingNumber !== a.intent.trackingNumber)
    )
      throw Error("Receipt mismatch");
    clearOrderStatusCache(scope, epoch.current);
    cacheRef.current = {};
    setCache({});
    setReceipt(result);
    setReview(null);
    setConsent(false);
    setNotice("");
    setDetailId(result.orderId);
    setView("detail");
    void Promise.all([
      utils.orders.workspace.list.invalidate(),
      utils.orders.workspace.detail.invalidate(),
      utils.orders.workspace.statusHistory.invalidate(),
    ]).catch(() => {
      if (alive()) setNotice("reviewFailed");
    });
  }
  async function run(a: Attempt) {
    if (lock.current || storageError || !canManage || !alive()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    let retained = false;
    try {
      persist({ ...cacheRef.current, attempt: a });
      retained = true;
      await complete(await mutation.mutateAsync(a), a);
    } catch (error) {
      if (!alive()) return;
      if (!retained) {
        setStorageError(true);
        return;
      }
      const code = (error as any)?.data?.code;
      if (
        [
          "CONFLICT",
          "BAD_REQUEST",
          "PRECONDITION_FAILED",
          "NOT_FOUND",
        ].includes(code || "")
      ) {
        try {
          persist({ draft: cacheRef.current.draft });
        } catch {
          setStorageError(true);
        }
        setReview(null);
        setConsent(false);
        setNotice(
          code === "PRECONDITION_FAILED"
            ? "blocked"
            : code === "NOT_FOUND"
              ? "missing"
              : "conflict"
        );
        void utils.orders.workspace.detail.invalidate().catch(() => {});
      } else setNotice("uncertain");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  function save() {
    if (!draft || !review || !consent || attempt) return;
    const input = intentOf(draft);
    if (
      !input.success ||
      JSON.stringify(input.data) !== JSON.stringify(review.intent)
    )
      return;
    void run({
      requestId: crypto.randomUUID(),
      intent: input.data,
      expectedDigest: review.digest,
      reviewed: true,
    });
  }
  async function recover() {
    const a = cacheRef.current.attempt;
    if (!a || lock.current || storageError || !canManage || !alive()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await utils.orders.workspace.statusReceipt.fetch({
        requestId: a.requestId,
      });
      if (!alive()) return;
      if (result) await complete(result, a);
      else setNotice("noReceipt");
    } catch {
      if (alive()) setNotice("uncertain");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  function discardDraft() {
    if (attempt || lock.current) return;
    try {
      clearOrderStatusCache(scope, epoch.current);
      cacheRef.current = {};
      setCache({});
      setReview(null);
      setConsent(false);
      setDiscard(false);
      setView("list");
    } catch {
      setStorageError(true);
    }
  }
  const statusLabels = orderStatusLabels(t),
    paymentLabels = orderPaymentLabels(t);
  const noticeText =
    notice === "blocked"
      ? t("orderWorkspace.blocked")
      : notice === "missing"
        ? t("orderWorkspace.missing")
        : notice === "conflict"
          ? t("orderWorkspace.conflict")
          : notice === "uncertain"
            ? t("orderWorkspace.uncertain")
            : notice === "noReceipt"
              ? t("orderWorkspace.noReceipt")
              : t("orderWorkspace.reviewFailed");
  return (
    <div
      className="qt-workspace ow-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
    >
      <header className="qt-header">
        <div>
          <h1>{t("ordersPage.title")}</h1>
          <p>{t("orderWorkspace.description")}</p>
        </div>
        <div className="qt-tools">
          <a href={href("/merchant/payment-links")}>
            {t("orderWorkspace.paymentLinks")}
          </a>
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            {t("orderWorkspace.refresh")}
          </button>
          {view !== "list" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("list")}
            >
              {t("orderWorkspace.list")}
            </button>
          )}
        </div>
      </header>
      {storageError && (
        <div className="ow-warning" role="alert">
          <p>{t("orderWorkspace.storageError")}</p>
          <button type="button" onClick={retryStorage}>
            {t("orderWorkspace.retryStorage")}
          </button>
        </div>
      )}
      {attempt && (
        <section
          className="ow-warning"
          aria-label={t("orderWorkspace.uncertain")}
        >
          <p>{t("orderWorkspace.uncertain")}</p>
          <span>{t("orderWorkspace.request")}</span>
          <code dir="ltr">{attempt.requestId}</code>
          <p>
            <bdi>ORD-{attempt.intent.id}</bdi> ·{" "}
            {statusLabels[attempt.intent.status]}
          </p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy || storageError || !canManage}
              onClick={() => void recover()}
            >
              {t("orderWorkspace.checkReceipt")}
            </button>
            <button
              type="button"
              disabled={busy || storageError || !canManage}
              onClick={() => void run(attempt)}
            >
              {t("orderWorkspace.repeat")}
            </button>
          </div>
        </section>
      )}
      {draft && !attempt && view !== "status" && (
        <section className="ow-warning">
          <p>
            {t("orderWorkspace.draft")} · <bdi>ORD-{draft.id}</bdi>
          </p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDetailId(draft.id);
                setView("status");
                setReview(null);
                setConsent(false);
              }}
            >
              {t("orderWorkspace.resume")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDiscard(true)}
            >
              {t("orderWorkspace.discard")}
            </button>
          </div>
        </section>
      )}
      {discard && !attempt && (
        <section className="ow-warning" role="alert">
          <p>{t("orderWorkspace.discardConfirm")}</p>
          <div className="qt-tools">
            <button type="button" onClick={discardDraft}>
              {t("orderWorkspace.confirmDiscard")}
            </button>
            <button type="button" onClick={() => setDiscard(false)}>
              {t("orderWorkspace.cancel")}
            </button>
          </div>
        </section>
      )}
      {notice && notice !== "uncertain" && (
        <p className="ow-warning" role="alert">
          {noticeText}
        </p>
      )}
      {receipt && (
        <section className="ow-review" role="status">
          <h2>{t("orderWorkspace.receipt")}</h2>
          <p>
            {t("orderWorkspace.saved")} · <bdi>ORD-{receipt.orderId}</bdi> ·{" "}
            {statusLabels[receipt.status]}
          </p>
          <time dateTime={receipt.committedAt}>
            {orderTime(receipt.committedAt, i18n.language)}
          </time>
          <p>
            {t(
              receipt.notificationQueued
                ? "orderWorkspace.queued"
                : "orderWorkspace.savedWithoutNotification"
            )}
          </p>
        </section>
      )}
      {data && !canManage && (
        <p className="ow-help">{t("orderWorkspace.readOnly")}</p>
      )}
      {view === "list" ? (
        <>
          <section className="qt-panel">
            <h2>{t("orderWorkspace.list")}</h2>
            <form
              className="qt-filters"
              onSubmit={e => {
                e.preventDefault();
                setSelection(v => ({ ...v, search: search.trim(), page: 1 }));
              }}
            >
              <label htmlFor="ow-search">
                {t("orderWorkspace.search")}
                <input
                  id="ow-search"
                  value={search}
                  maxLength={100}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <label htmlFor="ow-filter-status">
                {t("ordersPage.status")}
                <select
                  id="ow-filter-status"
                  value={selection.status}
                  onChange={e =>
                    setSelection(v => ({
                      ...v,
                      status: e.target.value as typeof v.status,
                      page: 1,
                    }))
                  }
                >
                  <option value="all">{t("orderWorkspace.allStatuses")}</option>
                  {orderStates.map(status => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="ow-filter-payment">
                {t("orderWorkspace.paymentFilter")}
                <select
                  id="ow-filter-payment"
                  value={selection.payment}
                  onChange={e =>
                    setSelection(v => ({
                      ...v,
                      payment: e.target.value as typeof v.payment,
                      page: 1,
                    }))
                  }
                >
                  <option value="all">{t("orderWorkspace.allPayments")}</option>
                  {orderPayments.map(status => (
                    <option key={status} value={status}>
                      {paymentLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="qt-primary" type="submit">
                {t("orderWorkspace.apply")}
              </button>
            </form>
            {query.error ? (
              <WorkspaceState
                inline
                kind={workspaceFailureKind(query.error)}
                onRetry={() => void query.refetch()}
              />
            ) : !data ? (
              <WorkspaceState inline kind="loading" />
            ) : data.items.length ? (
              <OrderList
                rows={data.items}
                open={id => {
                  setDetailId(id);
                  setView("detail");
                }}
              />
            ) : (
              <WorkspaceState
                inline
                kind="empty"
                title={t(
                  data.total
                    ? "orderWorkspace.noMatches"
                    : "orderWorkspace.empty"
                )}
                description={t(
                  data.total
                    ? "orderWorkspace.noMatchesHint"
                    : "orderWorkspace.emptyHint"
                )}
              />
            )}
            {data && (
              <div className="qt-pagination">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() =>
                    setSelection(v => ({ ...v, page: data.page - 1 }))
                  }
                >
                  {t("merchantUx.actions.previousPage")}
                </button>
                <span>
                  {t("orderWorkspace.page", {
                    page: data.page,
                    pages: data.pages,
                  })}
                </span>
                <button
                  type="button"
                  disabled={data.page >= data.pages}
                  onClick={() =>
                    setSelection(v => ({ ...v, page: data.page + 1 }))
                  }
                >
                  {t("merchantUx.actions.nextPage")}
                </button>
              </div>
            )}
          </section>
          {data && <OrderSummary data={data} />}
          {data && (
            <section className="ow-operations">
              <details>
                <summary>{t("orderWorkspace.platforms")}</summary>
                <details className="ow-platform-tool" data-zid-checkout-review>
                  <summary>{t("merchantUx.zidReconciliation.title")}</summary>
                  <ZidCheckoutReconciliation />
                </details>
                <SallaCheckoutReview key={scope} />
              </details>
            </section>
          )}
        </>
      ) : (
        <>
          {view === "status" && draft && (
            <>
              <OrderStatusForm
                draft={draft}
                change={change}
                review={review}
                consent={consent}
                setConsent={setConsent}
                prepare={() => void prepare()}
                save={save}
                busy={busy}
                currentStatus={row?.status}
                orderNumber={row?.number}
                disabled={
                  !!attempt ||
                  storageError ||
                  !canManage ||
                  !!row?.externalReference ||
                  ["delivered", "cancelled", "unknown"].includes(
                    row?.status || ""
                  )
                }
                errors={errors}
              />
              {row?.externalReference && (
                <p className="ow-warning">{t("orderWorkspace.externalHint")}</p>
              )}
              {row && ["delivered", "cancelled"].includes(row.status) && (
                <p className="ow-warning">{t("orderWorkspace.finalHint")}</p>
              )}
              <div className="qt-tools">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setView("detail")}
                >
                  {t("orderWorkspace.close")}
                </button>
                <button
                  type="button"
                  disabled={busy || !!attempt}
                  onClick={() => setDiscard(true)}
                >
                  {t("orderWorkspace.discard")}
                </button>
              </div>
            </>
          )}
          {detailQuery.error ? (
            <WorkspaceState
              inline
              kind={workspaceFailureKind(detailQuery.error)}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : detailQuery.data === null ? (
            <WorkspaceState
              inline
              kind="missing"
              title={t("orderWorkspace.missing")}
              description={t("orderWorkspace.missingHint")}
            />
          ) : !row ? (
            <WorkspaceState inline kind="loading" />
          ) : (
            <>
              {view === "detail" && (
                <>
                  <OrderDetailReport row={row} />
                  {row.externalReference ? (
                    <p className="ow-help">
                      {t("orderWorkspace.externalHint")}
                    </p>
                  ) : ["delivered", "cancelled"].includes(row.status) ? (
                    <p className="ow-help">{t("orderWorkspace.finalHint")}</p>
                  ) : (
                    <button
                      type="button"
                      className="qt-primary"
                      disabled={
                        !canManage ||
                        !!draft ||
                        !!attempt ||
                        busy ||
                        storageError ||
                        row.status === "unknown"
                      }
                      onClick={start}
                    >
                      {t("orderWorkspace.statusChange")}
                    </button>
                  )}
                  <OrderHistory
                    key={`${scope}:${row.id}`}
                    merchantId={merchantId}
                    orderId={row.id}
                  />
                  {canManage && (
                    <section className="ow-operations">
                      <h2>{t("orderWorkspace.operations")}</h2>
                      <p className="ow-help">
                        {t("orderWorkspace.operationsHint")}
                      </p>
                      {row.currency === "SAR" &&
                      row.totalMinor !== null &&
                      !row.externalReference ? (
                        <>
                          <details>
                            <summary>{t("orderWorkspace.invoice")}</summary>
                            {row.checkoutReviewRequired ? (
                              <CheckoutInvoiceReview
                                key={row.id}
                                orderId={row.id}
                                totalAmount={row.totalMinor}
                                onApproved={() => void refresh()}
                                discount={
                                  row.discountMinor !== null &&
                                  row.subtotalMinor !== null
                                    ? {
                                        code: row.discountCode,
                                        subtotalMinor: row.subtotalMinor,
                                        discountMinor: row.discountMinor,
                                      }
                                    : undefined
                                }
                              />
                            ) : (
                              <>
                                <CheckoutMarginExceptionAudit
                                  key={row.id}
                                  orderId={row.id}
                                />
                                {row.discountMinor !== null &&
                                  row.subtotalMinor !== null && (
                                    <CheckoutDiscountBreakdown
                                      discount={{
                                        code: row.discountCode,
                                        subtotalMinor: row.subtotalMinor,
                                        discountMinor: row.discountMinor,
                                      }}
                                      totalMinor={row.totalMinor}
                                      approved
                                      historical={row.status === "cancelled"}
                                    />
                                  )}
                              </>
                            )}
                          </details>
                          {!row.externalReference && (
                            <details>
                              <summary>
                                {t("orderWorkspace.paymentAttempts")}
                              </summary>
                              <OrderCheckoutAttempts
                                key={row.id}
                                orderId={row.id}
                                onUpdated={refresh}
                              />
                            </details>
                          )}
                          {!row.externalReference &&
                            row.status === "cancelled" &&
                            row.discountMinor !== null && (
                              <details>
                                <summary>
                                  {t("orderWorkspace.discountRelease")}
                                </summary>
                                <CheckoutDiscountRelease
                                  key={row.id}
                                  orderId={row.id}
                                  onUpdated={refresh}
                                />
                              </details>
                            )}
                        </>
                      ) : (
                        <p>{t("orderWorkspace.advancedCurrency")}</p>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
