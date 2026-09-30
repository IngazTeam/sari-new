import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  sheetsSettingsView,
  type SheetsSettingsView,
} from "@shared/sheets-settings";
import { sheetsSetupAttempt, sheetsSetupTabs } from "@shared/sheets-setup";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { ProductHeading } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
type Flags = SheetsSettingsView["reports"];
const defaults: Flags = {
  sendDailyReports: false,
  sendWeeklyReports: false,
  sendMonthlyReports: false,
};
const sameFlags = (a: Flags, b: Flags) =>
  Object.keys(defaults).every(k => a[k as keyof Flags] === b[k as keyof Flags]);
export function SheetsSettingsWorkspace({
  scope,
  href = (p: string) => p,
  navigate = (url: string) => window.location.assign(url),
  sheetHref = (id: string) =>
    `https://docs.google.com/spreadsheets/d/${id}/edit`,
  openSheet,
}: {
  scope: string;
  href?: (p: string) => string;
  navigate?: (url: string) => void;
  sheetHref?: (id: string) => string;
  openSheet?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const status = trpc.sheets.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const setup = trpc.sheets.setup.read.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const connect = trpc.sheets.beginOAuth.useMutation({ retry: false }),
    start = trpc.sheets.setup.start.useMutation({ retry: false }),
    recover = trpc.sheets.setup.recover.useMutation({ retry: false }),
    acknowledge = trpc.sheets.setup.acknowledge.useMutation({ retry: false });
  const save = trpc.sheets.updateReportSettings.useMutation({ retry: false }),
    disconnect = trpc.sheets.disconnect.useMutation({ retry: false });
  const [draft, setDraft] = useState<Flags>(defaults),
    [base, setBase] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [disconnectOpen, setDisconnectOpen] = useState(false),
    [disconnectReviewed, setDisconnectReviewed] = useState(false),
    [ackOpen, setAckOpen] = useState(false),
    [ackReviewed, setAckReviewed] = useState(false),
    [saveReviewed, setSaveReviewed] = useState(false),
    [mustRefresh, setMustRefresh] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    epoch = useRef(knowledgeCacheEpoch()),
    currentScope = useRef(scope);
  currentScope.current = scope;
  const decoded = sheetsSettingsView.safeParse(status.data),
    data = decoded.success ? decoded.data : null;
  const decodedAttempt = sheetsSetupAttempt.safeParse(setup.data),
    attempt = decodedAttempt.success ? decodedAttempt.data : null;
  const scoped =
    !!data && `${data.actorId}:${data.merchantId}:sheets-settings` === scope;
  const attemptScoped =
    setup.data === null ||
    (!!attempt &&
      `${attempt.actorId}:${attempt.merchantId}:sheets-settings` === scope);
  const loading = status.isLoading || setup.isLoading;
  const paused =
    status.fetchStatus === "paused" || setup.fetchStatus === "paused";
  const error = status.error || setup.error;
  const valid =
    scoped &&
    attemptScoped &&
    !error &&
    !loading &&
    !paused &&
    epoch.current === knowledgeCacheEpoch();
  const ready =
    valid && !busy && !mustRefresh && !status.isFetching && !setup.isFetching;
  const currentAccess = useRef({ valid, digest: data?.digest });
  currentAccess.current = { valid, digest: data?.digest };
  const dirty = !!data && !sameFlags(draft, data.reports),
    conflict = dirty && base !== data?.digest;
  const openAttempt =
    !!attempt &&
    ["preparing", "dispatching", "uncertain", "created"].includes(
      attempt.state
    );
  const reportLabels = {
    sendDailyReports: t("sheetsSettingsUx.daily"),
    sendWeeklyReports: t("sheetsSettingsUx.weekly"),
    sendMonthlyReports: t("sheetsSettingsUx.monthly"),
  };
  const connectionLabels = {
    unlinked: t("sheetsSettingsUx.unlinked"),
    credentials_invalid: t("sheetsSettingsUx.credentialsInvalid"),
    oauth_disabled: t("sheetsSettingsUx.oauthDisabled"),
    needs_destination: t("sheetsSettingsUx.needsDestination"),
    ready: t("sheetsSettingsUx.ready"),
  };
  const attemptLabels = {
    preparing: t("sheetsSettingsUx.preparing"),
    dispatching: t("sheetsSettingsUx.dispatching"),
    uncertain: t("sheetsSettingsUx.uncertain"),
    created: t("sheetsSettingsUx.created"),
    completed: t("sheetsSettingsUx.completed"),
    detached: t("sheetsSettingsUx.detached"),
    rejected: t("sheetsSettingsUx.rejected"),
    acknowledged: t("sheetsSettingsUx.acknowledged"),
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (data && scoped && (base === null || !dirty)) {
      setDraft(data.reports);
      setBase(data.digest);
    }
    setReviewed(false);
    setDisconnectOpen(false);
    setDisconnectReviewed(false);
    setSaveReviewed(false);
  }, [data?.digest, scoped]);
  useEffect(() => {
    setAckOpen(false);
    setAckReviewed(false);
  }, [attempt?.requestId, attempt?.state]);
  useEffect(() => {
    if (!busy && !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, dirty]);
  useEffect(() => {
    const url = new URL(window.location.href),
      result = url.searchParams.get("oauth");
    if (!result) return;
    url.searchParams.delete("oauth");
    window.history.replaceState(window.history.state, "", url);
    setNotice(
      result === "connected"
        ? t("sheetsOAuth.connected")
        : result === "cancelled"
          ? t("sheetsOAuth.cancelled")
          : t("sheetsOAuth.failed")
    );
  }, [t]);
  const fresh = () =>
    alive.current &&
    currentScope.current === scope &&
    epoch.current === knowledgeCacheEpoch() &&
    currentAccess.current.valid;
  async function refresh() {
    if (lock.current) return;
    const results = await Promise.all([status.refetch(), setup.refetch()]);
    if (
      alive.current &&
      currentScope.current === scope &&
      epoch.current === knowledgeCacheEpoch() &&
      results.every(r => !r.error)
    )
      setMustRefresh(false);
  }
  function checkedSettings(raw: unknown) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("success" in raw) ||
      raw.success !== true
    )
      throw Error();
    const { success, ...rest } = raw as any,
      value = sheetsSettingsView.parse(rest);
    if (`${value.actorId}:${value.merchantId}:sheets-settings` !== scope)
      throw Error();
    return value;
  }
  function checkedAttempt(raw: unknown) {
    const result = sheetsSetupAttempt.parse(raw);
    if (`${result.actorId}:${result.merchantId}:sheets-settings` !== scope)
      throw Error();
    return result;
  }
  async function run(
    action: () => Promise<string>,
    kind: "connect" | "write" = "write"
  ) {
    if (lock.current || !ready) return;
    const startedDigest = data?.digest;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const message = await action();
      if (fresh()) {
        if (currentAccess.current.digest === startedDigest) setNotice(message);
        if (kind !== "connect")
          await Promise.all([status.refetch(), setup.refetch()]);
      }
    } catch {
      if (fresh()) {
        setNotice(
          kind === "connect"
            ? t("sheetsOAuth.failed")
            : t("sheetsSettingsUx.checkAfterError")
        );
        if (kind !== "connect") setMustRefresh(true);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const connectNow = () =>
    run(async () => {
      if (!data?.oauthReady) throw Error();
      const expected = data.digest,
        result = await connect.mutateAsync();
      const target = new URL(result.authorizationUrl);
      if (
        target.origin !== "https://accounts.google.com" ||
        target.pathname !== "/o/oauth2/v2/auth" ||
        target.username ||
        target.password
      )
        throw Error();
      if (fresh() && currentAccess.current.digest === expected)
        navigate(target.href);
      return t("sheetsSettingsUx.connecting");
    }, "connect");
  const createNow = () =>
    run(async () => {
      if (
        !data ||
        !reviewed ||
        data.state !== "needs_destination" ||
        openAttempt
      )
        throw Error();
      setReviewed(false);
      const requestId = crypto.randomUUID(),
        result = checkedAttempt(
          await start.mutateAsync({
            requestId,
            reviewed: true,
            expectedDigest: data.digest,
          })
        );
      if (result.requestId !== requestId) throw Error();
      return attemptLabels[result.state];
    });
  const saveNow = () =>
    run(async () => {
      if (
        !data ||
        !dirty ||
        conflict ||
        (Object.values(draft).some(Boolean) && !saveReviewed)
      )
        throw Error();
      const intended = { ...draft },
        result = checkedSettings(
          await save.mutateAsync({
            expectedDigest: data.digest,
            reviewed: true,
            changes: intended,
          })
        );
      if (!sameFlags(result.reports, intended)) throw Error();
      if (fresh() && currentAccess.current.digest === data.digest) {
        setDraft(result.reports);
        setBase(result.digest);
        setSaveReviewed(false);
      }
      return t("sheetsSettingsUx.saved");
    });
  const disconnectNow = () =>
    run(async () => {
      if (!data || !disconnectReviewed) throw Error();
      const result = checkedSettings(
        await disconnect.mutateAsync({
          expectedDigest: data.digest,
          reviewed: true,
        })
      );
      if (
        result.isConnected ||
        result.state !== "unlinked" ||
        Object.values(result.reports).some(Boolean)
      )
        throw Error();
      if (fresh() && currentAccess.current.digest === data.digest) {
        setDraft(result.reports);
        setBase(result.digest);
        setDisconnectOpen(false);
        setDisconnectReviewed(false);
      }
      return t("sheetsSettingsUx.disconnected");
    });
  const recoverNow = () =>
    run(async () => {
      if (!attempt || attempt.state !== "created") throw Error();
      const result = checkedAttempt(
        await recover.mutateAsync({ requestId: attempt.requestId })
      );
      if (result.requestId !== attempt.requestId) throw Error();
      return attemptLabels[result.state];
    });
  const acknowledgeNow = () =>
    run(async () => {
      if (!attempt?.canAcknowledge || !ackReviewed) throw Error();
      const result = checkedAttempt(
        await acknowledge.mutateAsync({
          requestId: attempt.requestId,
          reviewed: true,
        })
      );
      if (
        result.requestId !== attempt.requestId ||
        result.state !== "acknowledged"
      )
        throw Error();
      if (fresh()) {
        setAckOpen(false);
        setAckReviewed(false);
      }
      return t("sheetsSettingsUx.acknowledged");
    });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language.startsWith("ar") ? "ar-SA" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
      calendar: "gregory",
    }).format(new Date(value));
  return (
    <div className="pw-workspace" aria-busy={busy}>
      <header className="pw-header">
        <div>
          <p className="pw-eyebrow">Google Sheets</p>
          <ProductHeading>{t("sheetsSettingsUx.title")}</ProductHeading>
          <p>{t("sheetsSettingsUx.subtitle")}</p>
        </div>
        <button
          disabled={busy || status.isFetching || setup.isFetching}
          onClick={() => void refresh()}
        >
          {t("sheetsSettingsUx.refresh")}
        </button>
      </header>
      {error || (!loading && !paused && !valid) ? (
        <WorkspaceState
          inline
          kind={error ? workspaceFailureKind(error) : "error"}
          onRetry={() => void refresh()}
        />
      ) : paused ? (
        <WorkspaceState inline kind="offline" onRetry={() => void refresh()} />
      ) : loading ? (
        <WorkspaceState inline kind="loading" />
      ) : (
        data && (
          <>
            {notice && (
              <section className="pw-panel" role="status">
                <p>{notice}</p>
              </section>
            )}
            {mustRefresh && (
              <section className="pw-panel" role="alert">
                <p>{t("sheetsSettingsUx.refreshRequired")}</p>
                <button disabled={busy} onClick={() => void refresh()}>
                  {t("sheetsSettingsUx.refresh")}
                </button>
              </section>
            )}
            <section
              className="pw-panel"
              aria-labelledby="sheets-connection-title"
            >
              <h2 id="sheets-connection-title">
                {t("sheetsSettingsUx.connection")}
              </h2>
              <p>
                <strong>{connectionLabels[data.state]}</strong>
              </p>
              <p>{t("sheetsSettingsUx.connectionEvidence")}</p>
              {data.spreadsheetId && (
                <a
                  className="pw-button"
                  href={sheetHref(data.spreadsheetId)}
                  onClick={
                    openSheet
                      ? e => {
                          e.preventDefault();
                          openSheet(data.spreadsheetId!);
                        }
                      : undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("sheetsSettingsUx.openSheet")} ↗
                </a>
              )}
              {data.lastSync && (
                <p className="pw-muted">
                  {t("sheetsSettingsUx.lastActivity", {
                    date: formatDate(data.lastSync),
                  })}
                </p>
              )}
              {!data.oauthReady && (
                <p role="note">{t("sheetsSettingsUx.oauthUnavailable")}</p>
              )}
              <details open={!data.isConnected}>
                <summary>{t("sheetsSettingsUx.accountActions")}</summary>
                <div className="pw-panel">
                  <p>{t("sheetsOAuth.notice")}</p>
                  <div className="pw-actions">
                    <button
                      className="pw-primary"
                      disabled={!ready || !data.oauthReady || openAttempt}
                      onClick={() => void connectNow()}
                    >
                      {data.isConnected
                        ? t("sheetsSettingsUx.reconnect")
                        : t("sheetsSettingsUx.connect")}
                    </button>
                    {data.hasIntegration && (
                      <button
                        disabled={!ready}
                        onClick={() => {
                          setDisconnectOpen(true);
                          setDisconnectReviewed(false);
                        }}
                      >
                        {t("sheetsSettingsUx.disconnect")}
                      </button>
                    )}
                  </div>
                </div>
              </details>
              {disconnectOpen && (
                <div
                  className="pw-panel"
                  role="region"
                  aria-label={t("sheetsSettingsUx.disconnect")}
                >
                  <p>{t("sheetsConnectionUx.disconnectConfirm")}</p>
                  <label className="ds-consent">
                    <input
                      type="checkbox"
                      checked={disconnectReviewed}
                      disabled={busy}
                      onChange={e => setDisconnectReviewed(e.target.checked)}
                    />
                    {t("sheetsSettingsUx.disconnectReviewed")}
                  </label>
                  <div className="pw-actions">
                    <button
                      className="pw-danger"
                      disabled={!ready || !disconnectReviewed}
                      onClick={() => void disconnectNow()}
                    >
                      {t("sheetsSettingsUx.confirmDisconnect")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setDisconnectOpen(false)}
                    >
                      {t("sheetsSettingsUx.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </section>
            {attempt && (
              <section
                className="pw-panel"
                aria-labelledby="sheets-attempt-title"
              >
                <h2 id="sheets-attempt-title">
                  {t("sheetsSettingsUx.attempt")}
                </h2>
                <p>
                  <strong>{attemptLabels[attempt.state]}</strong>
                </p>
                <p className="pw-muted">{formatDate(attempt.startedAt)}</p>
                <p className="pw-muted">
                  {t("sheetsSettingsUx.requestReference")}{" "}
                  <bdi>{attempt.requestId}</bdi>
                </p>
                {attempt.spreadsheetId && (
                  <a
                    className="pw-button"
                    href={sheetHref(attempt.spreadsheetId)}
                    onClick={
                      openSheet
                        ? e => {
                            e.preventDefault();
                            openSheet(attempt.spreadsheetId!);
                          }
                        : undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("sheetsSettingsUx.openAttempt")} ↗
                  </a>
                )}
                {attempt.state === "completed" &&
                  data.spreadsheetId !== attempt.spreadsheetId && (
                    <p>{t("sheetsSettingsUx.oldReceipt")}</p>
                  )}
                {openAttempt && <p>{t("sheetsSettingsUx.noRetry")}</p>}
                {attempt.state === "created" && (
                  <button disabled={!ready} onClick={() => void recoverNow()}>
                    {t("sheetsSettingsUx.recover")}
                  </button>
                )}
                {attempt.canAcknowledge && (
                  <button
                    disabled={!ready}
                    onClick={() => {
                      setAckOpen(true);
                      setAckReviewed(false);
                    }}
                  >
                    {t("sheetsSettingsUx.reviewAttempt")}
                  </button>
                )}
                {ackOpen && (
                  <div className="pw-panel">
                    <p>{t("sheetsSettingsUx.ackHint")}</p>
                    <label className="ds-consent">
                      <input
                        type="checkbox"
                        checked={ackReviewed}
                        disabled={busy}
                        onChange={e => setAckReviewed(e.target.checked)}
                      />
                      {t("sheetsSettingsUx.ackChecked")}
                    </label>
                    <div className="pw-actions">
                      <button
                        disabled={!ready || !ackReviewed}
                        onClick={() => void acknowledgeNow()}
                      >
                        {t("sheetsSettingsUx.confirmReview")}
                      </button>
                      <button disabled={busy} onClick={() => setAckOpen(false)}>
                        {t("sheetsSettingsUx.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            {data.state === "needs_destination" && (
              <section
                className="pw-panel"
                aria-labelledby="sheets-create-title"
              >
                <h2 id="sheets-create-title">{t("sheetsSettingsUx.create")}</h2>
                <p>{t("sheetsSettingsUx.createHint")}</p>
                <ul>
                  {sheetsSetupTabs.map(tab => (
                    <li key={tab.id}>{tab.title}</li>
                  ))}
                </ul>
                <label className="ds-consent">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={!ready || openAttempt}
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  {t("sheetsSettingsUx.createReviewed")}
                </label>
                <button
                  className="pw-primary"
                  disabled={!ready || !reviewed || openAttempt}
                  onClick={() => void createNow()}
                >
                  {t("sheetsSettingsUx.createButton")}
                </button>
              </section>
            )}
            {data.hasIntegration && (
              <section
                className="pw-panel"
                aria-labelledby="sheets-reports-title"
              >
                <h2 id="sheets-reports-title">
                  {t("sheetsSettingsUx.reports")}
                </h2>
                <p>{t("sheetsSettingsUx.reportsHint")}</p>
                {(Object.keys(defaults) as (keyof Flags)[]).map(key => (
                  <label className="ds-consent" key={key}>
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      disabled={
                        !ready || (!draft[key] && data.state !== "ready")
                      }
                      onChange={e => {
                        setDraft(v => ({ ...v, [key]: e.target.checked }));
                        setSaveReviewed(false);
                      }}
                    />
                    {reportLabels[key]}
                  </label>
                ))}
                {conflict && (
                  <p role="alert">{t("sheetsSettingsUx.conflict")}</p>
                )}
                {dirty && Object.values(draft).some(Boolean) && (
                  <label className="ds-consent">
                    <input
                      type="checkbox"
                      checked={saveReviewed}
                      disabled={!ready}
                      onChange={e => setSaveReviewed(e.target.checked)}
                    />
                    {t("sheetsSettingsUx.reportsReviewed")}
                  </label>
                )}
                <div className="pw-actions">
                  <button
                    className="pw-primary"
                    disabled={
                      !ready ||
                      !dirty ||
                      conflict ||
                      (Object.values(draft).some(Boolean) && !saveReviewed)
                    }
                    onClick={() => void saveNow()}
                  >
                    {t("sheetsSettingsUx.save")}
                  </button>
                  {dirty && (
                    <button
                      disabled={!ready}
                      onClick={() => {
                        setDraft(data.reports);
                        setBase(data.digest);
                        setSaveReviewed(false);
                      }}
                    >
                      {t("sheetsSettingsUx.reloadOptions")}
                    </button>
                  )}
                </div>
              </section>
            )}
            <section className="pw-panel" aria-labelledby="sheets-data-title">
              <h2 id="sheets-data-title">{t("sheetsSettingsUx.data")}</h2>
              <p>{t("sheetsSettingsUx.dataHint")}</p>
              <div className="pw-actions">
                <a
                  className="pw-button"
                  href={href("/merchant/products/upload")}
                >
                  {t("sheetsSettingsUx.products")}
                </a>
                <a
                  className="pw-button"
                  href={href("/merchant/sheets/inventory")}
                >
                  {t("sheetsSettingsUx.stock")}
                </a>
                <a className="pw-button" href={href("/merchant/data-sync")}>
                  {t("sheetsSettingsUx.export")}
                </a>
                <a
                  className="pw-button"
                  href={href("/merchant/sheets/reports")}
                >
                  {t("sheetsSettingsUx.manualReports")}
                </a>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
