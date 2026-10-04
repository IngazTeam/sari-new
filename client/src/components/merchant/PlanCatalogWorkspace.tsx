import { PlanCatalogCheckout } from "./PlanCatalogCheckout";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearch } from "wouter";
import { RefreshCw, Layers, ArrowRightLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { scopedUsage, usageQueryOptions } from "@/lib/usage-workspace-view";
import {
  catalogSelection,
  scopedCatalog,
  annualSaving,
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
        <PlanCatalogCheckout
          key={`${actorId}:${merchantId}:${selection.planId}:${cycle}`}
          actorId={actorId}
          merchantId={merchantId}
          planId={selection.planId!}
          cycle={cycle}
          canManage={data.canManage}
          canReview={stable}
          c={c}
          ar={ar}
          money={money}
        />
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
