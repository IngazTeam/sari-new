import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  discardSalesPolicyDraft,
  parseSalesPolicyRead,
  parseSalesPolicySnapshot,
  policyFromForm,
  readSalesPolicyDraft,
  salesPolicyDraftEpoch,
  salesPolicyForm,
  writeSalesPolicyDraft,
  type SalesPolicyForm,
  type SalesPolicyKind,
  type SalesPolicySnapshot,
} from "@/lib/sales-policy-draft";

type QueryResult = { data?: unknown; error?: unknown; isError?: boolean };
type Props = {
  kind: SalesPolicyKind;
  scope: string;
  query: QueryResult & {
    isLoading?: boolean;
    isFetching?: boolean;
    refetch: () => Promise<QueryResult>;
  };
  save: (input: {
    policy: SalesPolicySnapshot["policy"];
    expectedRevision: number;
    evidence: string;
    reviewed: true;
  }) => Promise<unknown>;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function ReviewedSalesPolicy({ kind, scope, query, save }: Props) {
  const { t, i18n } = useTranslation(),
    discount = kind === "discount",
    merchantId = Number(scope.split(":")[1]);
  const copy = {
    title: discount
      ? t("merchantUx.discountPolicy.title")
      : t("merchantUx.marginPolicy.title"),
    description: discount
      ? t("merchantUx.discountPolicy.description")
      : t("merchantUx.marginPolicy.description"),
    loading: discount
      ? t("merchantUx.discountPolicy.loading")
      : t("merchantUx.marginPolicy.loading"),
    loadFailed: discount
      ? t("merchantUx.discountPolicy.loadFailed")
      : t("merchantUx.marginPolicy.loadFailed"),
    refresh: discount
      ? t("merchantUx.discountPolicy.refresh")
      : t("merchantUx.marginPolicy.refresh"),
    enabled: discount
      ? t("merchantUx.discountPolicy.enabled")
      : t("merchantUx.marginPolicy.enabled"),
    percent: discount
      ? t("merchantUx.discountPolicy.maxPercent")
      : t("merchantUx.marginPolicy.minimum"),
    scope: discount
      ? t("merchantUx.discountPolicy.scope")
      : t("merchantUx.marginPolicy.scope"),
    invalid: discount
      ? t("merchantUx.discountPolicy.invalid")
      : t("merchantUx.marginPolicy.invalid"),
    reviewed: discount
      ? t("merchantUx.discountPolicy.reviewed")
      : t("merchantUx.marginPolicy.reviewed"),
    save: discount
      ? t("merchantUx.discountPolicy.save")
      : t("merchantUx.marginPolicy.save"),
    saving: discount
      ? t("merchantUx.discountPolicy.saving")
      : t("merchantUx.marginPolicy.saving"),
    saved: discount
      ? t("merchantUx.discountPolicy.saved")
      : t("merchantUx.marginPolicy.saved"),
    readOnly: discount
      ? t("merchantUx.discountPolicy.readOnly")
      : t("merchantUx.marginPolicy.readOnly"),
    history: discount
      ? t("merchantUx.discountPolicy.history")
      : t("merchantUx.marginPolicy.history"),
    empty: discount
      ? t("merchantUx.discountPolicy.empty")
      : t("merchantUx.marginPolicy.empty"),
    before: discount
      ? t("merchantUx.discountPolicy.before")
      : t("merchantUx.marginPolicy.before"),
    after: discount
      ? t("merchantUx.discountPolicy.after")
      : t("merchantUx.marginPolicy.after"),
  };
  const terms = (p: SalesPolicySnapshot["policy"]) =>
    "maxPercent" in p
      ? t("merchantUx.discountPolicy.terms", {
          state: p.enabled
            ? t("merchantUx.discountPolicy.on")
            : t("merchantUx.discountPolicy.off"),
          percent: p.maxPercent,
          hours: p.expireHours,
        })
      : t("merchantUx.marginPolicy.terms", {
          state: p.enabled
            ? t("merchantUx.marginPolicy.on")
            : t("merchantUx.marginPolicy.off"),
          percent: p.minPercent,
        });
  let data: ReturnType<typeof parseSalesPolicyRead> | null = null;
  try {
    if (!query.isError && !query.error)
      data = parseSalesPolicyRead(kind, query.data, merchantId);
  } catch {
    /* Failed or mismatched reads cannot authorize editing. */
  }
  const [base, setBase] = useState<SalesPolicySnapshot | null>(null),
    [form, setForm] = useState<SalesPolicyForm | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [recovery, setRecovery] = useState(() => {
    const value = readSalesPolicyDraft(scope, kind);
    return value.state === "missing" ? null : value;
  });
  const [submitted, setSubmitted] = useState(false),
    [needsReview, setNeedsReview] = useState(false),
    [storageFailed, setStorageFailed] = useState(false),
    [failed, setFailed] = useState(false),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<ReturnType<
    typeof parseSalesPolicyRead
  > | null>(null);
  const alive = useRef(true),
    locked = useRef(false),
    epoch = useRef(salesPolicyDraftEpoch());
  const current = () =>
    alive.current && epoch.current === salesPolicyDraftEpoch();
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const accept = (value: SalesPolicySnapshot) => {
    setBase(parseSalesPolicySnapshot(kind, value, merchantId));
    setForm(salesPolicyForm(value));
    setReviewed(false);
  };
  useEffect(() => {
    if (!base && data && current()) accept(data);
  }, [query.data, query.isError, query.error, base]);
  const dirty = !!form && !!base && !same(form, salesPolicyForm(base));
  const stale = !!base && !!data && base.evidence !== data.evidence;
  const canManage = data?.canManage === true && current();
  let policy: SalesPolicySnapshot["policy"] | null = null;
  try {
    if (form) policy = policyFromForm(kind, form);
  } catch {
    /* Empty or invalid numeric input remains a draft. */
  }
  const remember = (
    nextForm: SalesPolicyForm,
    nextBase: SalesPolicySnapshot,
    sent: boolean,
  ) => {
    const ok = writeSalesPolicyDraft(
      scope,
      kind,
      {
        form: nextForm,
        base: parseSalesPolicySnapshot(kind, nextBase, merchantId),
        submitted: sent,
      },
      epoch.current,
    );
    setStorageFailed(!ok);
    return ok;
  };
  useEffect(() => {
    if (!form || !base || recovery || !current()) return;
    if (dirty || submitted) remember(form, base, submitted);
    else if (!discardSalesPolicyDraft(scope, epoch.current))
      setStorageFailed(true);
  }, [form, base, recovery, dirty, submitted]);
  useEffect(() => {
    setReviewed(false);
  }, [data?.evidence]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const disabled =
    !canManage || busy || !!query.isFetching || !!recovery || submitted;
  function change(key: keyof SalesPolicyForm, value: string | boolean) {
    if (disabled || !form) return;
    setForm({ ...form, [key]: value });
    setReviewed(false);
    setSaved(false);
  }
  async function submit() {
    if (
      locked.current ||
      disabled ||
      !policy ||
      !base ||
      !form ||
      !dirty ||
      !reviewed ||
      stale ||
      needsReview ||
      !current()
    )
      return;
    if (!remember(form, base, true)) {
      remember(form, base, false);
      return;
    }
    locked.current = true;
    setBusy(true);
    setSubmitted(true);
    setFailed(false);
    setSaved(false);
    try {
      const result = await save({
        policy,
        expectedRevision: base.revision,
        evidence: base.evidence,
        reviewed: true,
      });
      if (!current()) return;
      const receipt = parseSalesPolicySnapshot(kind, result, merchantId);
      if (!same(receipt.policy, policy) || receipt.revision < base.revision)
        throw Error("Invalid policy response");
      accept(receipt);
      setSubmitted(false);
      setNeedsReview(false);
      setStorageFailed(!discardSalesPolicyDraft(scope, epoch.current));
      setSaved(true);
      void query.refetch().catch(() => {});
    } catch {
      if (current()) {
        setFailed(true);
        setNeedsReview(true);
        setLatest(null);
        setReviewed(false);
      }
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  async function loadLatest() {
    if (locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    setReviewed(false);
    setSaved(false);
    setLatest(null);
    try {
      const result = await query.refetch();
      if (!current()) return;
      if (result.error || result.isError) throw Error("Policy unavailable");
      const fresh = parseSalesPolicyRead(kind, result.data, merchantId);
      if ((dirty || submitted || needsReview) && !recovery) setLatest(fresh);
      else if (!recovery) accept(fresh);
    } catch {
      if (current()) setFailed(true);
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  function useLatest(keep: boolean) {
    if (
      !latest ||
      !form ||
      busy ||
      !current() ||
      !latest.canManage ||
      data?.evidence !== latest.evidence ||
      !canManage
    )
      return;
    const nextForm = keep ? form : salesPolicyForm(latest);
    if (!remember(nextForm, latest, false)) return;
    setBase(parseSalesPolicySnapshot(kind, latest, merchantId));
    setForm(nextForm);
    setSubmitted(false);
    setNeedsReview(false);
    setLatest(null);
    setReviewed(false);
    setFailed(false);
    setSaved(false);
  }
  function restore() {
    if (recovery?.state !== "ready" || busy || !canManage) return;
    setBase(recovery.value.base);
    setForm(recovery.value.form);
    setSubmitted(recovery.value.submitted);
    setNeedsReview(true);
    setReviewed(false);
    setStorageFailed(!recovery.persisted);
    setRecovery(null);
    setLatest(null);
    setSaved(false);
  }
  function discard() {
    if (busy || !current()) return;
    if (!discardSalesPolicyDraft(scope, epoch.current)) {
      setStorageFailed(true);
      return;
    }
    setRecovery(null);
    setStorageFailed(false);
    setSubmitted(false);
    setNeedsReview(false);
    setLatest(null);
    setReviewed(false);
    setFailed(false);
    setSaved(false);
    if (data) accept(data);
  }
  const reviewRequired = needsReview || submitted || stale;
  return (
    <section
      aria-labelledby={`${kind}-policy-title`}
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div>
        <h2 id={`${kind}-policy-title`} className="text-lg font-semibold">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("salesPolicyDraftUx.privacy")}
      </p>
      {recovery && (
        <div role="status" className="space-y-3 rounded-lg border p-3">
          <p>
            {recovery.state === "ready"
              ? recovery.value.submitted
                ? t("salesPolicyDraftUx.pendingFound")
                : t("salesPolicyDraftUx.found")
              : t("salesPolicyDraftUx.unreadable")}
          </p>
          <div className="flex flex-wrap gap-2">
            {recovery.state === "ready" && (
              <Button
                type="button"
                disabled={!canManage || busy}
                onClick={restore}
              >
                {t("salesPolicyDraftUx.restore")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={discard}
            >
              {t("salesPolicyDraftUx.discard")}
            </Button>
          </div>
        </div>
      )}
      {storageFailed && (
        <p role="alert">{t("salesPolicyDraftUx.storageFailed")}</p>
      )}
      {query.isLoading ? (
        <p role="status">{copy.loading}</p>
      ) : !data ? (
        <div role="alert">
          <p>{copy.loadFailed}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            disabled={busy || query.isFetching}
            onClick={loadLatest}
          >
            {copy.refresh}
          </Button>
        </div>
      ) : (
        base &&
        form && (
          <>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                id={`${kind}-policy-enabled`}
                type="checkbox"
                className="h-5 w-5"
                checked={form.enabled}
                disabled={disabled}
                onChange={(e) => change("enabled", e.target.checked)}
              />
              {copy.enabled}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span>{copy.percent}</span>
                <input
                  id={`${kind}-policy-percent`}
                  type="number"
                  required
                  min={discount ? 1 : 0}
                  max={discount ? 50 : 100}
                  step={1}
                  inputMode="numeric"
                  dir="ltr"
                  className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
                  value={form.percent}
                  disabled={disabled}
                  aria-invalid={!policy}
                  aria-describedby={
                    !policy ? `${kind}-policy-invalid` : undefined
                  }
                  onChange={(e) => change("percent", e.target.value)}
                />
              </label>
              {discount && (
                <label className="block space-y-2 text-sm">
                  <span>{t("merchantUx.discountPolicy.expireHours")}</span>
                  <input
                    id="discount-policy-hours"
                    type="number"
                    required
                    min={1}
                    max={168}
                    step={1}
                    inputMode="numeric"
                    dir="ltr"
                    className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
                    value={form.hours}
                    disabled={disabled}
                    aria-invalid={!policy}
                    aria-describedby={
                      !policy ? "discount-policy-invalid" : undefined
                    }
                    onChange={(e) => change("hours", e.target.value)}
                  />
                </label>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{copy.scope}</p>
            {discount && (
              <p className="text-sm text-muted-foreground">
                {t("merchantUx.discountPolicy.margin")}
              </p>
            )}
            <p className="text-sm">
              {discount
                ? t("merchantUx.discountPolicy.current", {
                    revision: data.revision,
                  })
                : t("merchantUx.marginPolicy.current", {
                    revision: data.revision,
                  })}{" "}
              {terms(data.policy)}
            </p>
            {!policy && (
              <p
                id={`${kind}-policy-invalid`}
                role="alert"
                className="text-sm text-destructive"
              >
                {copy.invalid}
              </p>
            )}
            {data.canManage ? (
              <>
                <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                  <input
                    id={`${kind}-policy-reviewed`}
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={reviewed}
                    disabled={disabled || !policy || !dirty || reviewRequired}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  {copy.reviewed}
                </label>
                <Button
                  id={`${kind}-policy-save`}
                  type="button"
                  className="h-auto min-h-11 whitespace-normal"
                  disabled={
                    disabled || !policy || !dirty || !reviewed || reviewRequired
                  }
                  onClick={submit}
                >
                  {busy ? t("salesPolicyDraftUx.working") : copy.save}
                </Button>
              </>
            ) : (
              <p className="text-sm">{copy.readOnly}</p>
            )}
            {(reviewRequired || failed) && !recovery && (
              <div role="alert" className="space-y-3 rounded-lg border p-3">
                <p>
                  {submitted
                    ? t("salesPolicyDraftUx.uncertain")
                    : t("salesPolicyDraftUx.reviewRequired")}
                </p>
                {failed && <p>{t("salesPolicyDraftUx.readFailed")}</p>}
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal"
                  disabled={busy || query.isFetching}
                  onClick={loadLatest}
                >
                  {t("salesPolicyDraftUx.reviewLatest")}
                </Button>
              </div>
            )}
            {latest && (
              <div
                role="region"
                aria-label={t("salesPolicyDraftUx.reviewTitle")}
                className="space-y-3 rounded-lg border p-3"
              >
                <h3 className="font-semibold">
                  {t("salesPolicyDraftUx.reviewTitle")}
                </h3>
                <p>
                  {t("salesPolicyDraftUx.latest")} {terms(latest.policy)}
                </p>
                <p>
                  {t("salesPolicyDraftUx.draft")}{" "}
                  {policy ? terms(policy) : copy.invalid}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("salesPolicyDraftUx.reviewHelp")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal"
                    disabled={
                      busy ||
                      !canManage ||
                      !latest.canManage ||
                      data.evidence !== latest.evidence
                    }
                    onClick={() => useLatest(false)}
                  >
                    {t("salesPolicyDraftUx.useLatest")}
                  </Button>
                  <Button
                    type="button"
                    className="h-auto min-h-11 whitespace-normal"
                    disabled={
                      busy ||
                      !canManage ||
                      !latest.canManage ||
                      data.evidence !== latest.evidence
                    }
                    onClick={() => useLatest(true)}
                  >
                    {t("salesPolicyDraftUx.keepDraft")}
                  </Button>
                </div>
              </div>
            )}
            {(dirty || submitted) && !recovery && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                disabled={busy || query.isFetching}
                onClick={discard}
              >
                {t("salesPolicyDraftUx.discard")}
              </Button>
            )}
            {saved && !dirty && !stale && !failed && (
              <p role="status">{copy.saved}</p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                {copy.history}
              </summary>
              <p className="mb-3 text-sm text-muted-foreground">
                {t("salesPolicyDraftUx.historyScope")}
              </p>
              {!data.history.length ? (
                <p className="text-sm">{copy.empty}</p>
              ) : (
                <ol className="space-y-3">
                  {data.history.map((row) => (
                    <li
                      key={row.revision}
                      className="space-y-1 rounded-lg border p-3 text-sm"
                    >
                      <p>
                        {discount
                          ? t("merchantUx.discountPolicy.change", {
                              revision: row.revision,
                              actor: row.actorUserId,
                            })
                          : t("merchantUx.marginPolicy.change", {
                              revision: row.revision,
                              actor: row.actorUserId,
                            })}
                      </p>
                      <time
                        className="block break-words"
                        dateTime={row.createdAt}
                      >
                        {new Date(row.createdAt).toLocaleString(i18n.language)}
                      </time>
                      <p>
                        {copy.before} {terms(row.beforePolicy)}
                      </p>
                      <p>
                        {copy.after} {terms(row.afterPolicy)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </>
        )
      )}
    </section>
  );
}
