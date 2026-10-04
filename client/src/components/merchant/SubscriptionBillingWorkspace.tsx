import {
  cancellationReview,
  type SubscriptionCancellationInput,
} from "@shared/subscription-cancellation";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { CreditCard, RefreshCw, ArrowUpRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions, usageLabels } from "@/lib/usage-workspace-view";
import {
  scopedBilling,
  scopedBillingHistory,
  subscriptionReviewIdentity,
} from "@/lib/subscription-billing-view";
import { billingLabels } from "@/lib/subscription-billing-labels";
import {
  billingStates,
  billingTypes,
  type BillingHistoryInput,
} from "@shared/subscription-billing-workspace";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { UsageMeter } from "./UsageWorkspace";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import "@/styles/settings-workspace.css";
import "@/styles/usage-workspace.css";
import "@/styles/subscription-billing-workspace.css";

export function SubscriptionBillingPage() {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const merchant = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const refresh = () => {
      void user.refetch();
      void merchant.refetch();
    },
    error = user.error || merchant.error;
  if (error)
    return (
      <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh} />
    );
  if (
    user.isLoading ||
    user.isFetching ||
    merchant.isLoading ||
    merchant.isFetching
  )
    return <WorkspaceState kind="loading" />;
  if (
    !user.data?.id ||
    !merchant.data?.id ||
    merchant.data.actorId !== user.data.id
  )
    return (
      <WorkspaceState
        kind={!user.data?.id ? "session" : "missing"}
        onRetry={refresh}
      />
    );
  return (
    <SubscriptionBillingWorkspace
      key={`${user.data.id}:${merchant.data.id}`}
      actorId={user.data.id}
      merchantId={merchant.data.id}
    />
  );
}
export function SubscriptionBillingWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = billingLabels(t),
    usageCopy = usageLabels(t),
    locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-US";
  const [path] = useLocation(),
    tab = new URLSearchParams(useSearch()).get("tab") ?? "overview";
  const query = trpc.merchantSubscription.workspace.useQuery(
      undefined,
      usageQueryOptions
    ),
    data = scopedBilling(query.data, actorId, merchantId);
  const [review, setReview] = useState<{
      id: number;
      identity: string;
      expected: SubscriptionCancellationInput["expected"];
    } | null>(null),
    [outcome, setOutcome] = useState<
      "review" | "sending" | "conflict" | "unknown" | "done"
    >("review");
  const busy = useRef(false),
    trigger = useRef<HTMLButtonElement>(null);
  const cancel = trpc.merchantSubscription.cancelSubscription.useMutation();
  const s = data?.subscription;
  const date = (v: string | null | undefined) =>
    v
      ? new Intl.DateTimeFormat(locale, {
          timeZone: "UTC",
          calendar: "gregory",
          dateStyle: "medium",
        }).format(new Date(v))
      : c.unknown;
  const canCancel =
    !!data?.canManage &&
    data.state === "active" &&
    !!cancellationReview(s ?? null) &&
    !query.isFetching &&
    !query.error;
  const sameReview =
    canCancel && review?.identity === subscriptionReviewIdentity(s ?? null);
  const verifyCancellation = async (id: number) => {
    const fresh = await query.refetch(),
      checked = !fresh.error && scopedBilling(fresh.data, actorId, merchantId);
    setOutcome(
      checked &&
        checked.state === "cancelled" &&
        checked.subscription?.id === id
        ? "done"
        : "unknown"
    );
  };
  const confirm = async () => {
    if (!sameReview || !review || busy.current || outcome !== "review") return;
    busy.current = true;
    setOutcome("sending");
    try {
      const result = await cancel.mutateAsync({
        expected: review.expected,
      });
      if (result?.success !== true || result.subscriptionId !== review.id) {
        setOutcome("unknown");
        return;
      }
      await verifyCancellation(review.id);
    } catch (error) {
      setOutcome(
        (error as any)?.data?.code === "CONFLICT" ? "conflict" : "unknown"
      );
    } finally {
      busy.current = false;
    }
  };
  return (
    <section
      className="sw-workspace sbw-workspace"
      dir={locale.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sw-heading">
        <span aria-hidden="true">
          <CreditCard />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </header>
      <nav className="uw-tabs" aria-label={c.title}>
        {(["overview", "payments"] as const).map(v => (
          <Link
            key={v}
            href={`${path}?tab=${v}`}
            aria-current={tab === v ? "page" : undefined}
          >
            {c[v]}
          </Link>
        ))}
      </nav>
      {!["overview", "payments"].includes(tab) ? (
        <WorkspaceState
          inline
          kind="missing"
          action={
            <Link className="sbw-button" href={`${path}?tab=overview`}>
              {c.overview}
            </Link>
          }
        />
      ) : tab === "payments" ? (
        data && !data.canReadPayments ? (
          <div className="sw-panel" role="status">
            <h2>{c.ownerHistory}</h2>
            <p>{c.ownerHistoryBody}</p>
          </div>
        ) : (
          <BillingHistory actorId={actorId} merchantId={merchantId} />
        )
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
          <div className="sbw-toolbar">
            <p>
              {c.checkedAt}{" "}
              <time dateTime={data.checkedAt}>
                {date(data.checkedAt)} · UTC
              </time>
            </p>
            <button
              type="button"
              className="sbw-button"
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={18} aria-hidden="true" />
              {c.refresh}
            </button>
          </div>
          {
            <>
              <section className="sw-panel sbw-summary">
                <div className="sbw-toolbar">
                  <div>
                    <p>{c.recordedPlan}</p>
                    <h2>
                      {s?.limitsSource === "trial"
                        ? c.trial
                        : (locale.startsWith("ar") ? s?.nameAr : s?.nameEn) ||
                          c.unknownPlan}
                    </h2>
                  </div>
                  <span className={`sbw-status sbw-${data.state}`}>
                    {c[data.state]}
                  </span>
                </div>
                {["none", "ambiguous", "unknown"].includes(data.state) && (
                  <p className="sbw-notice" role="status">
                    {c[data.state + "Body"]}
                  </p>
                )}
                {s && (
                  <>
                    <dl className="sbw-facts">
                      <div>
                        <dt>{c.days}</dt>
                        <dd>
                          {s.daysRemaining === null
                            ? c.unknown
                            : new Intl.NumberFormat(locale).format(
                                s.daysRemaining
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt>{c.cycle}</dt>
                        <dd>
                          {s.billingCycle ? c[s.billingCycle] : c.unknown}
                        </dd>
                      </div>
                      <div>
                        <dt>{c.start}</dt>
                        <dd>{date(s.startDate)}</dd>
                      </div>
                      <div>
                        <dt>{c.end}</dt>
                        <dd>{date(s.endDate)}</dd>
                      </div>
                    </dl>
                    {data.state === "cancelled" && (
                      <p>
                        {c.cancelledAt}: {date(s.cancelledAt)}
                      </p>
                    )}
                    {["active", "trial"].includes(data.state) &&
                      s.daysRemaining !== null &&
                      s.daysRemaining <= 7 && (
                        <p className="sbw-notice">{c.endingSoon}</p>
                      )}
                  </>
                )}
                <p>{c.sourceNotice}</p>
                <div className="sbw-actions">
                  <Link
                    className="sbw-button sbw-primary"
                    href="/merchant/subscription/plans"
                  >
                    {c.plans}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <Link
                    className="sbw-button"
                    href="/merchant/subscription/compare"
                  >
                    {c.compare}
                  </Link>
                  <Link className="sbw-button" href="/merchant/usage-dashboard">
                    {c.limits}
                  </Link>
                </div>
              </section>
              {s && (
                <section className="sw-panel">
                  <h2>{c.usage}</h2>
                  <p>{c.usageHint}</p>
                  <div className="sbw-meters">
                    {(
                      ["conversations", "messages", "voiceMessages"] as const
                    ).map(k => (
                      <UsageMeter
                        key={k}
                        name={usageCopy[k]}
                        value={s.quotas[k]}
                        c={usageCopy}
                        locale={locale}
                      />
                    ))}
                  </div>
                  <dl className="sbw-facts">
                    {(["customers", "whatsappNumbers"] as const).map(k => (
                      <div key={k}>
                        <dt>{usageCopy[k]}</dt>
                        <dd>
                          {s.resources[k].unlimited === true
                            ? c.unlimited
                            : s.resources[k].limit === null
                              ? c.unknown
                              : new Intl.NumberFormat(locale).format(
                                  s.resources[k].limit!
                                )}
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt>{c.reset}</dt>
                      <dd>{date(s.lastResetAt)}</dd>
                    </div>
                  </dl>
                </section>
              )}
              {canCancel && (
                <details className="sw-panel sbw-management">
                  <summary>{c.manage}</summary>
                  <p>{c.cancelImpact}</p>
                  <button
                    ref={trigger}
                    type="button"
                    className="sbw-button"
                    onClick={() => {
                      if (s) {
                        setReview({
                          expected: cancellationReview(s)!,
                          id: s.id,
                          identity: subscriptionReviewIdentity(s)!,
                        });
                        setOutcome("review");
                      }
                    }}
                  >
                    {c.cancel}
                  </button>
                </details>
              )}
              {!data.canManage && <p className="sbw-notice">{c.readonly}</p>}
            </>
          }
        </>
      )}
      <AlertDialog
        open={!!review}
        onOpenChange={open => {
          if (!open && !busy.current) setReview(null);
        }}
      >
        <AlertDialogContent
          className="sbw-dialog"
          dir={locale.startsWith("ar") ? "rtl" : "ltr"}
          onCloseAutoFocus={event => {
            if (trigger.current) {
              event.preventDefault();
              trigger.current.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{c.cancelTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.cancelImpact}</AlertDialogDescription>
          </AlertDialogHeader>
          {outcome !== "review" && (
            <p role={outcome === "sending" ? "status" : "alert"}>
              {c["cancel_" + outcome]}
            </p>
          )}
          {outcome === "review" && !sameReview && (
            <p role="alert">{c.cancel_conflict}</p>
          )}
          <AlertDialogFooter>
            <button
              className="sbw-button"
              type="button"
              disabled={outcome === "sending"}
              onClick={() => setReview(null)}
            >
              {outcome === "review" ? c.keep : c.close}
            </button>
            {outcome === "review" && (
              <button
                className="sbw-button sbw-danger"
                type="button"
                disabled={!sameReview}
                onClick={() => void confirm()}
              >
                {c.cancelConfirm}
              </button>
            )}
            {outcome === "unknown" && (
              <button
                className="sbw-button"
                type="button"
                disabled={query.isFetching}
                onClick={() => {
                  if (review) void verifyCancellation(review.id);
                }}
              >
                {c.refresh}
              </button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
function BillingHistory({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = billingLabels(t),
    locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-US";
  const [input, setInput] = useState<BillingHistoryInput>({
      beforeId: null,
      pageSize: 25,
      status: "all",
      type: "all",
    }),
    [previous, setPrevious] = useState<Array<number | null>>([]);
  const query = trpc.merchantSubscription.paymentHistory.useQuery(
      input,
      usageQueryOptions
    ),
    data = scopedBillingHistory(query.data, actorId, merchantId, input);
  const change = (value: Partial<BillingHistoryInput>) => {
    setInput({ ...input, ...value, beforeId: null });
    setPrevious([]);
  };
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(locale, {
          timeZone: "UTC",
          calendar: "gregory",
          dateStyle: "medium",
        }).format(new Date(v))
      : c.unknown;
  return (
    <section className="sw-panel sbw-history">
      <div className="sbw-toolbar">
        <div>
          <h2>{c.payments}</h2>
          <p>{c.historyHint}</p>
        </div>
        <button
          type="button"
          className="sbw-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {c.refresh}
        </button>
      </div>
      <div className="sbw-filters">
        <label>
          {c.status}
          <select
            value={input.status}
            onChange={e =>
              change({
                status: e.target.value as BillingHistoryInput["status"],
              })
            }
          >
            <option value="all">{c.all}</option>
            {billingStates.map(v => (
              <option key={v} value={v}>
                {c["payment_" + v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {c.type}
          <select
            value={input.type}
            onChange={e =>
              change({ type: e.target.value as BillingHistoryInput["type"] })
            }
          >
            <option value="all">{c.all}</option>
            {billingTypes.map(v => (
              <option key={v} value={v}>
                {c["type_" + v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {c.pageSize}
          <select
            value={input.pageSize}
            onChange={e =>
              change({ pageSize: Number(e.target.value) as 25 | 50 })
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      {query.error ? (
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
          {!data.rows.length ? (
            <p role="status" className="sbw-notice">
              {c.noPayments}
            </p>
          ) : (
            <div className="sbw-records">
              {data.rows.map(r => (
                <article className="sbw-record" key={r.id}>
                  <div className="sbw-toolbar">
                    <h3>
                      {c.reference} <bdi>#{r.id}</bdi>
                    </h3>
                    <span className={`sbw-status sbw-${r.status}`}>
                      {c["payment_" + r.status]}
                    </span>
                  </div>
                  <dl className="sbw-facts">
                    <div>
                      <dt>{c.amount}</dt>
                      <dd>
                        <bdi>
                          {r.amountMinor !== null && r.currency
                            ? new Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: r.currency,
                              }).format(r.amountMinor / 100)
                            : c.unknown}
                        </bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{c.type}</dt>
                      <dd>{c["type_" + r.type]}</dd>
                    </div>
                    <div>
                      <dt>{c.createdAt}</dt>
                      <dd>{date(r.createdAt)}</dd>
                    </div>
                  </dl>
                  <details>
                    <summary>{c.recordDetails}</summary>
                    <dl className="sbw-facts">
                      <div>
                        <dt>{c.paidAt}</dt>
                        <dd>{date(r.paidAt)}</dd>
                      </div>
                      <div>
                        <dt>{c.refundedAt}</dt>
                        <dd>{date(r.refundedAt)}</dd>
                      </div>
                    </dl>
                    <p>{c.recordHint}</p>
                  </details>
                </article>
              ))}
            </div>
          )}
          <nav className="sbw-pagination" aria-label={c.pagination}>
            <button
              type="button"
              className="sbw-button"
              disabled={!previous.length}
              onClick={() => {
                setInput({ ...input, beforeId: previous[previous.length - 1] });
                setPrevious(previous.slice(0, -1));
              }}
            >
              {c.previous}
            </button>
            <p>
              {c.page}{" "}
              {new Intl.NumberFormat(locale).format(previous.length + 1)}
            </p>
            <button
              type="button"
              className="sbw-button"
              disabled={data.nextBeforeId === null}
              onClick={() => {
                setPrevious([...previous, input.beforeId]);
                setInput({ ...input, beforeId: data.nextBeforeId });
              }}
            >
              {c.next}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
