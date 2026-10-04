import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  CreditCard,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { paymentSettingsLabels } from "@/lib/payment-settings-labels";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  paymentSettingsWorkspace,
  paymentSettingsSave,
  paymentSettingsSaveResult,
  paymentSettingsProbeResult,
  type PaymentSettingsWorkspace as Snapshot,
} from "@shared/payment-settings-workspace";
import "@/styles/service-catalog-workspace.css";
import "@/styles/settings-workspace.css";
import "@/styles/payment-settings-workspace.css";
type Draft = {
  tapEnabled: boolean | null;
  tapPublicKey: string | null;
  tapTestMode: boolean | null;
  defaultCurrency: "SAR" | null;
  secretAction: "keep" | "replace" | "clear";
  secretInput: string;
};
const fields = (data: Snapshot): Draft => ({
  tapEnabled: data.values?.tapEnabled ?? null,
  tapPublicKey: data.values?.tapPublicKey ?? null,
  tapTestMode: data.values?.tapTestMode ?? null,
  defaultCurrency: data.values?.defaultCurrency ?? null,
  secretAction: "keep",
  secretInput: "",
});
export function PaymentSettingsWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = paymentSettingsLabels(t),
    utils = trpc.useUtils();
  const query = trpc.merchantPayments.workspace.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const saveMutation = trpc.merchantPayments.saveReviewed.useMutation({
      retry: false,
    }),
    probeMutation = trpc.merchantPayments.probeReviewed.useMutation({
      retry: false,
    });
  const parse = (value: unknown) => {
    const r = paymentSettingsWorkspace.safeParse(value);
    return r.success &&
      r.data.actorId === actorId &&
      r.data.merchantId === merchantId
      ? r.data
      : null;
  };
  const current = query.error ? null : parse(query.data);
  const [base, setBase] = useState<Snapshot | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [notice, setNotice] = useState<keyof typeof c | null>(null),
    [busy, setBusy] = useState<"save" | "probe" | "read" | null>(null),
    [blocked, setBlocked] = useState(false),
    [errors, setErrors] = useState<string[]>([]),
    [shown, setShown] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    form = useRef<HTMLFormElement>(null),
    feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const valid = () => alive.current && epoch.current === knowledgeCacheEpoch();
  const adopt = (value: Snapshot) => {
    setBase(value);
    setDraft(fields(value));
    setShown(false);
    setErrors([]);
    setBlocked(false);
  };
  useEffect(() => {
    if (current && !base) adopt(current);
  }, [current, base]);
  const dirty =
    !!draft && !!base && JSON.stringify(draft) !== JSON.stringify(fields(base));
  const remoteChanged =
    !!current && !!base && current.revision !== base.revision;
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
    if (errors.length)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    else if (notice) feedback.current?.focus();
  }, [errors, notice]);
  const disabled =
    !!busy ||
    blocked ||
    remoteChanged ||
    !current?.canManage ||
    query.isFetching;
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : null));
    setNotice(null);
    setErrors(e =>
      e.filter(k => k !== key && !(key.startsWith("secret") && k === "secret"))
    );
    if (key === "secretAction") {
      setShown(false);
      setDraft(d => (d ? { ...d, secretInput: "" } : null));
    }
  };
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy("read");
    try {
      const r = await query.refetch();
      if (!valid()) return;
      const value = r.error ? null : parse(r.data);
      if (!value) throw Error("unavailable");
      adopt(value);
      setNotice("refreshed");
    } catch {
      if (valid()) {
        setBlocked(true);
        setNotice("failedRead");
      }
    } finally {
      lock.current = false;
      if (valid()) setBusy(null);
    }
  };
  const commit = async () => {
    if (
      disabled ||
      lock.current ||
      !draft ||
      !base?.revision ||
      (!dirty && base.state !== "missing")
    )
      return;
    const input = paymentSettingsSave.safeParse({
      expectedRevision: base.revision,
      tapEnabled: draft.tapEnabled,
      tapPublicKey: draft.tapPublicKey,
      tapTestMode: draft.tapTestMode,
      defaultCurrency: draft.defaultCurrency,
      secret:
        draft.secretAction === "replace"
          ? { action: "replace", value: draft.secretInput }
          : { action: draft.secretAction },
    });
    if (!input.success) {
      setErrors(input.error.issues.map(i => String(i.path[0])));
      setNotice("invalid");
      return;
    }
    if (
      input.data.tapEnabled &&
      input.data.secret.action === "keep" &&
      (base.secretState !== "stored" || !base.keysMatchMode)
    ) {
      setErrors(["secret"]);
      setNotice("keyRequired");
      return;
    }
    lock.current = true;
    setBusy("save");
    setErrors([]);
    setNotice(null);
    try {
      const result = await saveMutation.mutateAsync(input.data);
      if (!valid()) return;
      const r = paymentSettingsSaveResult.safeParse(result),
        value = r.success ? parse(r.data.workspace) : null;
      if (
        !r.success ||
        !value?.values ||
        (
          [
            "tapEnabled",
            "tapPublicKey",
            "tapTestMode",
            "defaultCurrency",
          ] as const
        ).some(k => value.values![k] !== input.data[k]) ||
        (input.data.secret.action === "replace" &&
          value.secretState !== "stored") ||
        (input.data.secret.action === "clear" &&
          value.secretState !== "missing")
      )
        throw Error("unverified");
      utils.merchantPayments.workspace.setData(undefined, value);
      adopt(value);
      setNotice(r.data.changed ? "saved" : "noChanges");
    } catch (e) {
      if (valid()) {
        setBlocked(true);
        setNotice(
          ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(
            (e as any)?.data?.code
          )
            ? "conflict"
            : "uncertain"
        );
        setDraft(d =>
          d ? { ...d, secretAction: "keep", secretInput: "" } : null
        );
        setShown(false);
      }
    } finally {
      lock.current = false;
      if (valid()) setBusy(null);
    }
  };
  const check = async () => {
    if (
      disabled ||
      lock.current ||
      dirty ||
      !base?.revision ||
      !base.keysMatchMode
    )
      return;
    lock.current = true;
    setBusy("probe");
    setNotice(null);
    setErrors([]);
    try {
      const result = await probeMutation.mutateAsync({
        expectedRevision: base.revision,
      });
      if (!valid()) return;
      const r = paymentSettingsProbeResult.safeParse(result),
        value = r.success ? parse(r.data.workspace) : null;
      if (!r.success || !value) throw Error("unverified");
      utils.merchantPayments.workspace.setData(undefined, value);
      adopt(value);
      setNotice(
        r.data.outcome === "verified" ? "checkSuccess" : "checkRejected"
      );
    } catch (e) {
      if (valid()) {
        setBlocked(true);
        setNotice(
          ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(
            (e as any)?.data?.code
          )
            ? "conflict"
            : "uncertain"
        );
      }
    } finally {
      lock.current = false;
      if (valid()) setBusy(null);
    }
  };
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void refresh()}
      />
    );
  if (query.isLoading || (current && !base))
    return <WorkspaceState kind="loading" />;
  if (!current || !base || !draft)
    return <WorkspaceState kind="error" onRetry={() => void refresh()} />;
  const boolText = (value: boolean | null) =>
    value === null ? c.unknown : value ? c.on : c.off;
  const secretText =
    base.secretState === "stored"
      ? c.secretStored
      : base.secretState === "invalid"
        ? c.secretInvalid
        : base.secretState === "unreadable"
          ? c.secretUnreadable
          : c.secretMissing;
  const err = (key: string) =>
    errors.includes(key) ? (
      <small id={"pw-" + key + "-error"} className="sw-error" role="alert">
        {key === "secret" && notice === "keyRequired"
          ? c.keyRequired
          : c.fieldError}
      </small>
    ) : null;
  return (
    <section
      className="sw-workspace pw-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sw-heading">
        <span>
          <CreditCard aria-hidden="true" />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.subtitle}</p>
        </div>
      </header>
      {current.state === "restricted" ? (
        <p className="sw-panel" role="status">
          {c.restricted}
        </p>
      ) : current.state === "duplicate" ? (
        <p className="sw-panel sw-notice" role="alert">
          {c.duplicate}
        </p>
      ) : (
        <>
          {base.state === "missing" && <p className="sw-notice">{c.missing}</p>}
          {base.state === "invalid" && (
            <p className="sw-notice" role="status">
              {c.legacy}
            </p>
          )}
          {!current.canManage && <p className="sw-notice">{c.readOnly}</p>}
          <div className="pw-layout">
            <form
              ref={form}
              className="sw-panel pw-form"
              noValidate
              onSubmit={e => {
                e.preventDefault();
                void commit();
              }}
            >
              <div className="sw-section-head">
                <KeyRound aria-hidden="true" />
                <div>
                  <h2>{c.configuration}</h2>
                  <p>{c.configurationHint}</p>
                </div>
              </div>
              <div className="sw-fields">
                <div className="sw-field">
                  <label htmlFor="pw-mode">{c.mode}</label>
                  <select
                    id="pw-mode"
                    value={
                      draft.tapTestMode === null
                        ? ""
                        : draft.tapTestMode
                          ? "test"
                          : "live"
                    }
                    disabled={disabled}
                    aria-invalid={errors.includes("tapTestMode")}
                    aria-describedby="pw-mode-hint pw-tapTestMode-error"
                    onChange={e =>
                      change("tapTestMode", e.target.value === "test")
                    }
                  >
                    <option value="" disabled>
                      {c.choose}
                    </option>
                    <option value="test">{c.sandbox}</option>
                    <option value="live">{c.live}</option>
                  </select>
                  <small id="pw-mode-hint">{c.modeHint}</small>
                  {err("tapTestMode")}
                </div>
                <div className="sw-field">
                  <label htmlFor="pw-currency">{c.currency}</label>
                  <select
                    id="pw-currency"
                    value={draft.defaultCurrency ?? ""}
                    disabled={disabled}
                    aria-invalid={errors.includes("defaultCurrency")}
                    aria-describedby="pw-currency-hint pw-defaultCurrency-error"
                    onChange={() => change("defaultCurrency", "SAR")}
                  >
                    <option value="" disabled>
                      {c.choose}
                    </option>
                    <option value="SAR">
                    SAR · {c.sar}
                    </option>
                  </select>
                  <small id="pw-currency-hint">{c.currencyHint}</small>
                  {err("defaultCurrency")}
                </div>
                <div className="sw-field pw-full">
                  <label htmlFor="pw-public">{c.publicKey}</label>
                  <input
                    id="pw-public"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.tapPublicKey ?? ""}
                    disabled={disabled}
                    maxLength={500}
                    aria-invalid={errors.includes("tapPublicKey")}
                    aria-describedby="pw-public-hint pw-tapPublicKey-error"
                    onChange={e => change("tapPublicKey", e.target.value)}
                  />
                  <small id="pw-public-hint">{c.publicHint}</small>
                  {err("tapPublicKey")}
                </div>
                <div className="sw-field pw-full">
                  <label htmlFor="pw-secret-action">{c.secretAction}</label>
                  <select
                    id="pw-secret-action"
                    value={draft.secretAction}
                    disabled={disabled}
                    onChange={e =>
                      change(
                        "secretAction",
                        e.target.value as Draft["secretAction"]
                      )
                    }
                    aria-invalid={errors.includes("secret")}
                    aria-describedby="pw-secret-error"
                  >
                    <option value="keep">{c.keep}</option>
                    <option value="replace">{c.replace}</option>
                    <option value="clear">{c.clear}</option>
                  </select>
                  <small>{secretText}</small>
                  {err("secret")}
                </div>
                {draft.secretAction === "replace" && (
                  <div className="sw-field pw-full">
                    <label htmlFor="pw-secret">{c.newSecret}</label>
                    <div className="pw-secret-input">
                      <input
                        id="pw-secret"
                        dir="ltr"
                        autoComplete="new-password"
                        spellCheck={false}
                        type={shown ? "text" : "password"}
                        maxLength={500}
                        disabled={disabled}
                        value={draft.secretInput}
                        onChange={e => change("secretInput", e.target.value)}
                        aria-invalid={errors.includes("secret")}
                        aria-describedby="pw-secret-hint pw-secret-error"
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setShown(v => !v)}
                        aria-label={shown ? c.hide : c.show}
                      >
                        {shown ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <small id="pw-secret-hint">{c.secretHint}</small>
                  </div>
                )}
              </div>
              {draft.secretAction === "clear" && (
                <p className="sw-notice">{c.clearHint}</p>
              )}
              {draft.tapTestMode === false && (
                <p className="sw-notice">{c.liveHint}</p>
              )}
              <div className="sw-field pw-enabled">
                <label htmlFor="pw-enabled">{c.enabled}</label>
                <select
                  id="pw-enabled"
                  value={
                    draft.tapEnabled === null
                      ? ""
                      : draft.tapEnabled
                        ? "on"
                        : "off"
                  }
                  disabled={disabled}
                  aria-invalid={errors.includes("tapEnabled")}
                  aria-describedby="pw-enabled-hint pw-tapEnabled-error"
                  onChange={e => change("tapEnabled", e.target.value === "on")}
                >
                  <option value="" disabled>
                    {c.choose}
                  </option>
                  <option value="off">{c.off}</option>
                  <option value="on">{c.on}</option>
                </select>
                <small id="pw-enabled-hint">{c.enabledHint}</small>
                {err("tapEnabled")}
              </div>
              {remoteChanged && (
                <p className="sw-notice" role="alert">
                  {c.conflict}
                </p>
              )}
              {notice && (
                <p
                  ref={feedback}
                  tabIndex={-1}
                  role={
                    [
                      "uncertain",
                      "conflict",
                      "failedRead",
                      "invalid",
                      "keyRequired",
                      "checkRejected",
                    ].includes(notice)
                      ? "alert"
                      : "status"
                  }
                  className="sw-notice"
                >
                  {c[notice]}
                </p>
              )}
              {dirty && !notice && (
                <p className="pw-dirty" role="status">
                  {c.dirty}
                </p>
              )}
              <div className="sw-actions">
                <Button
                  type="submit"
                  disabled={disabled || (!dirty && base.state !== "missing")}
                >
                  {busy === "save" ? c.saving : c.save}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!busy || query.isFetching}
                  onClick={() => void refresh()}
                >
                  <RefreshCw aria-hidden="true" />
                  {dirty ? c.discard : c.refresh}
                </Button>
              </div>
            </form>
            <aside className="sw-panel pw-status" aria-label={c.savedState}>
              <div className="sw-section-head">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <h2>{c.savedState}</h2>
                  <p>{c.readyHint}</p>
                </div>
              </div>
              <strong
                className={"pw-readiness " + (base.ready ? "pw-ready" : "")}
              >
                {base.ready ? c.ready : c.notReady}
              </strong>
              <details className="pw-status-details">
                <summary>{c.statusDetails}</summary>
                <dl>
                  <div>
                    <dt>{c.storedMode}</dt>
                    <dd>
                      {base.values!.tapTestMode === null
                        ? c.unknown
                        : base.values!.tapTestMode
                          ? c.sandbox
                          : c.live}
                    </dd>
                  </div>
                  <div>
                    <dt>{c.enabled}</dt>
                    <dd>{boolText(base.values!.tapEnabled)}</dd>
                  </div>
                  <div>
                    <dt>{c.storedSecret}</dt>
                    <dd>{secretText}</dd>
                  </div>
                  <div>
                    <dt>{c.checkedAt}</dt>
                    <dd>
                      {base.verifiedAt
                        ? new Date(base.verifiedAt).toLocaleString(
                            i18n.language
                          )
                        : c.none}
                    </dd>
                  </div>
                </dl>
              </details>
              <p>{base.verified ? c.verified : c.notVerified}</p>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || dirty || !base.keysMatchMode}
                onClick={() => void check()}
              >
                {busy === "probe" ? c.checking : c.check}
              </Button>
              <small>{c.checkHint}</small>
            </aside>
          </div>
          <details className="sw-panel pw-details">
            <summary>{c.oldOptions}</summary>
            <p>{c.oldHint}</p>
            <dl>
              <div>
                <dt>{c.autoLink}</dt>
                <dd>{boolText(base.values!.autoSendPaymentLink)}</dd>
              </div>
              <div>
                <dt>{c.oldMessage}</dt>
                <dd className="pw-message">
                  {base.values!.paymentLinkMessage === null
                    ? c.unknown
                    : base.values!.paymentLinkMessage || c.none}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
      <details className="sw-panel pw-details">
        <summary>{c.help}</summary>
        <p>{c.helpText}</p>
        <a href="https://tap.company" target="_blank" rel="noopener noreferrer">
          {c.openTap}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </details>
      <nav className="pw-links" aria-label={c.title}>
        <Link href="/merchant/settings">{c.back}</Link>
        <Link href="/merchant/payment-links">{c.links}</Link>
        <Link href="/merchant/payments">{c.payments}</Link>
      </nav>
    </section>
  );
}
