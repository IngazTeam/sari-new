import { currencyWorkspaceLabels } from "@/lib/currency-workspace-labels";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, Check, RefreshCw, ArrowRightLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { scopedCurrency, verifiedCurrencySave } from "@/lib/currency-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { type CurrencyWorkspace as Snapshot } from "@shared/currency-workspace";
import "@/styles/service-catalog-workspace.css";
import "@/styles/currency-workspace.css";

export function CurrencyWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    labels = currencyWorkspaceLabels(t),
    c = (key: string) => labels[key as keyof typeof labels];
  const query = trpc.merchants.currencyWorkspace.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const mutation = trpc.merchants.currencySaveReviewed.useMutation({
      retry: false,
    }),
    utils = trpc.useUtils();
  const data = query.error
    ? null
    : scopedCurrency(query.data, actorId, merchantId);
  const [base, setBase] = useState<Snapshot | null>(null),
    [draft, setDraft] = useState<"SAR" | "USD" | null>(null),
    [notice, setNotice] = useState(""),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    lock = useRef(false),
    epoch = useRef(knowledgeCacheEpoch()),
    submitted = useRef<string | null>(null),
    feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const alive = () =>
    mounted.current && epoch.current === knowledgeCacheEpoch();
  const adopt = (value: Snapshot) => {
    setBase(value);
    setDraft(value.currency);
    setBlocked(false);
    submitted.current = null;
  };
  useEffect(() => {
    if (data && !base) adopt(data);
  }, [data, base]);
  const dirty = !!base && draft !== base.currency;
  useEffect(() => {
    if (!dirty && !blocked) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, blocked]);
  useEffect(() => {
    if (notice) feedback.current?.focus();
  }, [notice]);
  const reload = async (checkOnly = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await query.refetch();
      if (!alive()) return;
      const value = result.error
        ? null
        : scopedCurrency(result.data, actorId, merchantId);
      if (!value) throw Error("unavailable");
      if (
        checkOnly &&
        (!submitted.current || value.currency !== submitted.current)
      ) {
        setBlocked(true);
        setNotice("different");
        return;
      }
      adopt(value);
      setNotice(checkOnly ? "verified" : "");
    } catch {
      if (alive()) {
        setBlocked(true);
        setNotice("failedRead");
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  const save = async () => {
    if (
      lock.current ||
      blocked ||
      !base ||
      !draft ||
      !data?.canManage ||
      data.revision !== base.revision ||
      query.isFetching ||
      !dirty
    )
      return;
    const desired = draft;
    lock.current = true;
    setBusy(true);
    setNotice("");
    submitted.current = desired;
    try {
      const result = await mutation.mutateAsync({
        currency: desired,
        expectedRevision: base.revision,
      });
      if (!alive()) return;
      const verified = verifiedCurrencySave(
        result,
        actorId,
        merchantId,
        desired
      );
      if (!verified) throw Error("unverified");
      utils.merchants.currencyWorkspace.setData(undefined, verified.workspace);
      adopt(verified.workspace);
      setNotice(verified.changed ? "saved" : "noChanges");
    } catch (error) {
      if (alive()) {
        setBlocked(true);
        setNotice(
          ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(
            (error as any)?.data?.code
          )
            ? "conflict"
            : "uncertain"
        );
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void reload()}
      />
    );
  if (query.isLoading || (!base && data))
    return <WorkspaceState kind="loading" />;
  if (!data || !base)
    return <WorkspaceState kind="error" onRetry={() => void reload()} />;
  const remoteChanged = data.revision !== base.revision,
    disabled =
      busy || blocked || remoteChanged || !data.canManage || query.isFetching;
  return (
    <section
      className="cw-workspace sc-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="cw-heading">
        <span className="cw-icon">
          <Coins aria-hidden="true" />
        </span>
        <div>
          <p className="cw-eyebrow">{c("eyebrow")}</p>
          <h1>{c("title")}</h1>
          <p>{c("description")}</p>
        </div>
      </header>
      {!data.canManage && (
        <p className="cw-notice" role="status">
          {c("readonly")}
        </p>
      )}
      {base.currency === null && (
        <p className="cw-notice" role="status">
          {c("unknown")}
        </p>
      )}
      {remoteChanged && (
        <p className="cw-notice" role="alert">
          {c("conflict")}
        </p>
      )}
      <div className="cw-layout">
        <form
          className="cw-panel"
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="cw-current">
            <span>{c("current")}</span>
            <strong>
              {base.currency
                ? c(base.currency.toLowerCase())
                : c("unknownShort")}
            </strong>
            {base.currency && <code>{base.currency}</code>}
          </div>
          <fieldset disabled={disabled}>
            <legend>{c("choose")}</legend>
            <div className="cw-options">
              {(["SAR", "USD"] as const).map(code => (
                <label
                  className={
                    "cw-option" + (draft === code ? " is-selected" : "")
                  }
                  key={code}
                >
                  <input
                    type="radio"
                    name="currency"
                    value={code}
                    checked={draft === code}
                    onChange={() => {
                      setDraft(code);
                      setNotice("");
                    }}
                  />
                  <span>
                    <strong>{c(code.toLowerCase())}</strong>
                    <small>{code}</small>
                  </span>
                  <span className="cw-symbol" aria-hidden="true">
                    {code === "SAR" ? "﷼" : "$"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cw-example">
            <span>{c("example")}</span>
            <strong dir="ltr">
              {draft
                ? new Intl.NumberFormat(
                    i18n.language.startsWith("ar") ? "ar-SA" : "en-US",
                    { style: "currency", currency: draft }
                  ).format(100)
                : "—"}
            </strong>
            <small>{c("exampleHint")}</small>
          </div>
          {notice && (
            <p ref={feedback} tabIndex={-1} role="status" className="cw-notice">
              {c(notice)}
            </p>
          )}
          <footer className="cw-actions">
            <p>{c(blocked ? "needsCheck" : dirty ? "dirty" : "inSync")}</p>
            <div>
              {blocked && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void reload(true)}
                >
                  <Check aria-hidden="true" />
                  {c("check")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw aria-hidden="true" />
                {c(dirty || blocked ? "discard" : "refresh")}
              </Button>
              {data.canManage && (
                <Button type="submit" disabled={disabled || !draft || !dirty}>
                  {c(busy ? "saving" : "save")}
                </Button>
              )}
            </div>
          </footer>
        </form>
        <aside className="cw-panel cw-impact">
          <ArrowRightLeft aria-hidden="true" />
          <h2>{c("impactTitle")}</h2>
          <p>{c("impactDisplay")}</p>
          <p>{c("impactAmounts")}</p>
          <p>{c("impactRecords")}</p>
        </aside>
      </div>
    </section>
  );
}
