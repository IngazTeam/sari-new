import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { RefreshCw, Layers, ArrowRightLeft, CreditCard } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { openSubscriptionCheckout } from "@/lib/subscription-checkout-navigation";
import { scopedUsage, usageQueryOptions } from "@/lib/usage-workspace-view";
import {
  catalogSelection,
  scopedCatalog,
  scopedCheckoutReview,
  annualSaving,
  safeTapCheckoutUrl,
  planLabels,
  type PlanCycle,
} from "@/lib/plan-catalog-view";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/plan-catalog-workspace.css";
type Props = {
  actorId: number;
  merchantId: number;
  view: "plans" | "compare" | "checkout";
};
export function PlanCatalogWorkspace({ actorId, merchantId, view }: Props) {
  const { t, i18n } = useTranslation(),
    c = planLabels(t),
    ar = i18n.language.startsWith("ar"),
    locale = ar ? "ar-SA" : "en-US";
  const [path, navigate] = useLocation(),
    search = useSearch(),
    selection = catalogSelection(search, view === "checkout");
  const catalog = trpc.subscriptionPlans.workspace.useQuery(
    undefined,
    usageQueryOptions
  );
  const usage = trpc.usage.workspace.useQuery(undefined, usageQueryOptions);
  const data = scopedCatalog(catalog.data, actorId, merchantId),
    current = scopedUsage(usage.data, actorId, merchantId);
  const refresh = () => {
    void catalog.refetch();
    void usage.refetch();
  };
  const money = (value: number | null, currency: string | null) =>
    value === null || !currency
      ? c.unknown
      : new Intl.NumberFormat(locale, { style: "currency", currency }).format(
          value / 100
        );
  const update = (cycle: PlanCycle, q = selection?.q ?? "") =>
    navigate(`${path}?${new URLSearchParams({ cycle, ...(q ? { q } : {}) })}`, {
      replace: true,
    });
  const cycle = selection?.cycle ?? "monthly",
    base = `?cycle=${cycle}${selection?.q ? "&q=" + encodeURIComponent(selection.q) : ""}`;
  const error = catalog.error || usage.error,
    loading =
      catalog.isLoading ||
      catalog.isFetching ||
      usage.isLoading ||
      usage.isFetching;
  const sub = current?.subscription,
    stable = !!sub && !["ambiguous", "unknown"].includes(sub.state);
  const plans =
    data?.plans.filter(p =>
      `${p.nameAr ?? ""} ${p.nameEn ?? ""} ${p.descriptionAr ?? ""} ${p.descriptionEn ?? ""}`
        .toLocaleLowerCase()
        .includes(selection?.q.toLocaleLowerCase() ?? "")
    ) ?? [];
  return (
    <div className="pc-workspace" dir={ar ? "rtl" : "ltr"}>
      <header className="pc-header">
        <div>
          <span className="pc-eyebrow">
            <Layers size={18} aria-hidden="true" />
            {c.cycle}
          </span>
          <h1>
            {view === "checkout"
              ? c.reviewTitle
              : view === "compare"
                ? c.compare
                : c.title}
          </h1>
          <p>
            {view === "checkout"
              ? c.reviewIntro
              : view === "compare"
                ? c.compareIntro
                : c.intro}
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          {c.refresh}
        </button>
      </header>
      <nav className="pc-nav" aria-label={c.title}>
        <Link
          href={"/merchant/subscription/plans" + base}
          aria-current={view === "plans" ? "page" : undefined}
        >
          {c.title}
        </Link>
        <Link
          href={"/merchant/subscription/compare" + base}
          aria-current={view === "compare" ? "page" : undefined}
        >
          <ArrowRightLeft size={17} aria-hidden="true" />
          {c.compare}
        </Link>
        <Link href="/merchant/usage">{c.usage}</Link>
      </nav>
      {!selection ? (
        <section className="pc-notice" role="alert">
          <p>{c.badQuery}</p>
          <Link href="/merchant/subscription/plans">{c.reset}</Link>
        </section>
      ) : error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(error)}
          onRetry={refresh}
        />
      ) : loading ? (
        <WorkspaceState inline kind="loading" />
      ) : !data || !current ? (
        <WorkspaceState inline kind="offline" onRetry={refresh} />
      ) : view === "checkout" ? (
        !stable ? (
          <section className="pc-notice" role="alert">
            <p>{c.currentUnknown}</p>
          </section>
        ) : (
          <CheckoutReview
            key={`${actorId}:${merchantId}:${selection.planId}:${cycle}`}
            actorId={actorId}
            merchantId={merchantId}
            planId={selection.planId!}
            cycle={cycle}
            canManage={data.canManage}
            c={c}
            ar={ar}
            money={money}
          />
        )
      ) : (
        <>
          <section className="pc-current">
            <div>
              <strong>{c.current}</strong>
              <p>
                {!stable
                  ? c.currentUnknown
                  : sub?.nameAr || sub?.nameEn
                    ? ar
                      ? sub.nameAr || sub.nameEn
                      : sub.nameEn || sub.nameAr
                    : c.currentNone}
              </p>
            </div>
            <Link href="/merchant/usage?tab=subscription">{c.usage}</Link>
          </section>
          {!data.canManage && <p className="pc-notice">{c.readonly}</p>}
          <div className="pc-controls">
            <fieldset>
              <legend>{c.cycle}</legend>
              {(["monthly", "yearly"] as const).map(v => (
                <label key={v} className={cycle === v ? "selected" : ""}>
                  <input
                    type="radio"
                    name="plan-cycle"
                    checked={cycle === v}
                    onChange={() => update(v)}
                  />
                  {c[v]}
                </label>
              ))}
            </fieldset>
            <label className="pc-search">
              {c.search}
              <input
                type="search"
                value={selection.q}
                maxLength={100}
                onChange={e => update(cycle, e.target.value)}
              />
            </label>
          </div>
          <p className="pc-note">{c.priceNote}</p>
          <p className="pc-note">{c.quotaNote}</p>
          {!data.plans.length ? (
            <section className="pc-empty">
              <h2>{c.empty}</h2>
            </section>
          ) : !plans.length ? (
            <section className="pc-empty">
              <h2>{c.noResults}</h2>
              <button type="button" onClick={() => update(cycle, "")}>
                {c.reset}
              </button>
            </section>
          ) : (
            <div
              className={`pc-grid ${view === "compare" ? "pc-compare" : ""}`}
            >
              {plans.map(p => {
                const price =
                    cycle === "monthly" ? p.monthlyMinor : p.yearlyMinor,
                  saving =
                    cycle === "yearly"
                      ? annualSaving(p.monthlyMinor, p.yearlyMinor)
                      : null;
                const isCurrent =
                  sub?.state === "active" &&
                  sub.planId === p.id &&
                  sub.billingCycle === cycle;
                const unavailable =
                  price === null ||
                  price <= 0 ||
                  price > 100_000_000 ||
                  !p.currency ||
                  p.invalidFields.length > 0;
                return (
                  <article
                    className={`pc-plan${isCurrent ? " pc-plan-current" : ""}`}
                    key={p.id}
                  >
                    <div className="pc-plan-heading">
                      <h2>
                        {(ar ? p.nameAr || p.nameEn : p.nameEn || p.nameAr) ||
                          c.unknown}
                      </h2>
                      {isCurrent && (
                        <span className="pc-badge">{c.current}</span>
                      )}
                    </div>
                    <p className="pc-description">
                      {ar
                        ? p.descriptionAr || p.descriptionEn
                        : p.descriptionEn || p.descriptionAr}
                    </p>
                    <p className="pc-price">
                      <bdi>{money(price, p.currency)}</bdi>
                    </p>
                    <p>{cycle === "yearly" ? c.annualTotal : c.monthlyTotal}</p>
                    {saving !== null && (
                      <p className="pc-saving">
                        {c.saving}: <bdi>{money(saving, p.currency)}</bdi>
                      </p>
                    )}
                    <dl className="pc-limits">
                      {(Object.keys(p.limits) as (keyof typeof p.limits)[]).map(
                        key => (
                          <div key={key}>
                            <dt>{c[key]}</dt>
                            <dd>
                              {p.limits[key].unlimited === true
                                ? c.unlimited
                                : p.limits[key].limit === null
                                  ? c.unknown
                                  : new Intl.NumberFormat(locale).format(
                                      p.limits[key].limit!
                                    )}
                            </dd>
                          </div>
                        )
                      )}
                    </dl>
                    {!!p.features.length && (
                      <details>
                        <summary>
                          {c.features} ({p.features.length})
                        </summary>
                        <ul>
                          {p.features.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {unavailable && <p className="pc-warning">{c.invalid}</p>}
                    <div className="pc-plan-action">
                      {!isCurrent &&
                      data.canManage &&
                      stable &&
                      !unavailable ? (
                        <Link
                          className="pc-primary"
                          href={`/merchant/checkout?planId=${p.id}&cycle=${cycle}`}
                        >
                          {c.choose}
                        </Link>
                      ) : (
                        <button type="button" disabled>
                          {isCurrent
                            ? c.current
                            : !data.canManage
                              ? c.readonly
                              : unavailable
                                ? c.invalid
                                : c.currentUnknown}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="pc-note">
            {c.checkedAt}:{" "}
            <bdi>
              {new Date(data.checkedAt).toLocaleString(locale, {
                timeZone: "UTC",
              })}{" "}
              UTC
            </bdi>
          </p>
        </>
      )}
    </div>
  );
}

function CheckoutReview({
  actorId,
  merchantId,
  planId,
  cycle,
  canManage,
  c,
  ar,
  money,
}: {
  actorId: number;
  merchantId: number;
  planId: number;
  cycle: PlanCycle;
  canManage: boolean;
  c: Record<string, string>;
  ar: boolean;
  money: (value: number | null, currency: string | null) => string;
}) {
  const quote = trpc.merchantSubscription.reviewCheckout.useQuery(
    { planId, billingCycle: cycle },
    { ...usageQueryOptions, enabled: canManage }
  );
  const subscribe = trpc.merchantSubscription.subscribe.useMutation(),
    upgrade = trpc.merchantSubscription.upgradePlan.useMutation();
  const review = scopedCheckoutReview(
    quote.data,
    actorId,
    merchantId,
    planId,
    cycle
  );
  const [accepted, setAccepted] = useState(false),
    [failure, setFailure] = useState<"conflict" | "failed" | null>(null),
    [done, setDone] = useState(false),
    [now, setNow] = useState(Date.now());
  const checkoutAttemptId = useRef(window.crypto.randomUUID()).current,
    busy = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setAccepted(false);
  }, [review?.token]);
  const pending = subscribe.isPending || upgrade.isPending,
    expired = !review || now >= Date.parse(review.expiresAt);
  const refresh = () => {
    setAccepted(false);
    setFailure(null);
    void quote.refetch();
  };
  const confirm = async () => {
    if (
      busy.current ||
      pending ||
      !review ||
      !accepted ||
      Date.now() >= Date.parse(review.expiresAt) ||
      failure
    )
      return;
    busy.current = true;
    try {
      const proof = { reviewedAt: review.reviewedAt, token: review.token };
      const result =
        review.mode === "subscribe"
          ? await subscribe.mutateAsync({
              planId,
              billingCycle: cycle,
              checkoutAttemptId,
              review: proof,
            })
          : await upgrade.mutateAsync({
              newPlanId: planId,
              newBillingCycle: cycle,
              checkoutAttemptId,
              review: proof,
            });
      if (!live.current) return;
      if (result.success !== true) {
        setFailure("failed");
        return;
      }
      if ("immediate" in result && result.immediate === true) {
        setDone(true);
        return;
      }
      const url =
        "paymentUrl" in result ? safeTapCheckoutUrl(result.paymentUrl) : null;
      if (!url) {
        setFailure("failed");
        return;
      }
      openSubscriptionCheckout(url);
    } catch (error: any) {
      if (live.current)
        setFailure(error?.data?.code === "CONFLICT" ? "conflict" : "failed");
    } finally {
      busy.current = false;
    }
  };
  if (!canManage)
    return (
      <section className="pc-notice">
        <p>{c.readonly}</p>
      </section>
    );
  if (quote.error)
    return (
      <WorkspaceState
        inline
        kind={workspaceFailureKind(quote.error)}
        onRetry={refresh}
      />
    );
  if (quote.isLoading || quote.isFetching)
    return <WorkspaceState inline kind="loading" />;
  if (!review)
    return <WorkspaceState inline kind="missing" onRetry={refresh} />;
  if (done)
    return (
      <section className="pc-empty" role="status">
        <h2>{c.completed}</h2>
        <Link className="pc-primary" href="/merchant/usage?tab=subscription">
          {c.usage}
        </Link>
      </section>
    );
  return (
    <section className="pc-checkout">
      <div className="pc-review">
        <span className="pc-eyebrow">
          <CreditCard size={20} aria-hidden="true" />
          {c.plan}
        </span>
        <h2>{ar ? review.nameAr : review.nameEn}</h2>
        <p>{c[cycle]}</p>
        <dl>
          <div>
            <dt>{c.price}</dt>
            <dd>
              <bdi>{money(review.priceMinor, review.currency)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{c.credit}</dt>
            <dd>
              <bdi>{money(review.creditMinor, review.currency)}</bdi>
            </dd>
          </div>
          <div className="pc-total">
            <dt>{c.due}</dt>
            <dd>
              <bdi>{money(review.chargeMinor, review.currency)}</bdi>
            </dd>
          </div>
        </dl>
        {review.creditMinor > 0 && <p className="pc-note">{c.creditNote}</p>}
        <p className="pc-note">{c.priceNote}</p>
        <Link href={`/merchant/subscription/plans?cycle=${cycle}`}>
          {c.changePlan}
        </Link>
      </div>
      <div className="pc-confirm">
        <h2>{c.reviewTitle}</h2>
        <p>{c.gatewayNote}</p>
        <p className="pc-note">
          {c.expires}:{" "}
          <bdi>
            {new Date(review.expiresAt).toLocaleTimeString(
              ar ? "ar-SA" : "en-US"
            )}
          </bdi>
        </p>
        {expired && (
          <div className="pc-warning" role="alert">
            <p>{c.expired}</p>
            <button type="button" onClick={refresh} disabled={pending}>
              {c.refresh}
            </button>
          </div>
        )}
        {failure && (
          <div className="pc-warning" role="alert">
            <p>{c[failure]}</p>
            {failure === "conflict" && (
              <button type="button" onClick={refresh}>
                {c.refresh}
              </button>
            )}
            <Link href="/merchant/payments">{c.history}</Link>
          </div>
        )}
        <label className="pc-ack">
          <input
            type="checkbox"
            checked={accepted}
            disabled={expired || pending || !!failure}
            onChange={e => setAccepted(e.target.checked)}
          />
          <span>{c.acknowledge}</span>
        </label>
        <button
          type="button"
          className="pc-primary"
          onClick={() => {
            void confirm();
          }}
          disabled={!accepted || expired || pending || !!failure}
        >
          {pending ? c.pending : review.chargeMinor === 0 ? c.apply : c.pay}
        </button>
      </div>
    </section>
  );
}
