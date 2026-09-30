import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { ProductHeading } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";

/** Reflect only facts returned by the Sheets service; a resolved request can still fail. */
export function DataSyncWorkspace({
  href = (path: string) => path,
}: {
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils();
  const status = trpc.sheets.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const mutation = trpc.sheets.syncInventory.useMutation({ retry: false });
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<"success" | "failed" | "uncertain" | null>(
      null
    );
  const lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  const spreadsheetId = status.data?.spreadsheetId;
  const validSheet =
    typeof spreadsheetId === "string" &&
    /^[A-Za-z0-9_-]{1,255}$/.test(spreadsheetId);
  const ready =
    !status.error &&
    !status.isLoading &&
    status.fetchStatus !== "paused" &&
    !status.isFetching &&
    status.data?.isConnected === true &&
    validSheet;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setReviewed(false);
    setResult(null);
  }, [spreadsheetId, status.data?.isConnected]);
  const needsCheck = result === "uncertain" || result === "failed";
  const date = status.data?.lastSync ? new Date(status.data.lastSync) : null;
  const lastActivity =
    date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(
          i18n.language.startsWith("ar") ? "ar-SA" : "en",
          { dateStyle: "medium", timeStyle: "short", calendar: "gregory" }
        ).format(date)
      : t("dataSyncUx.noActivity");
  async function send() {
    if (lock.current || !ready || !reviewed || needsCheck) return;
    const started = generation.current;
    lock.current = true;
    setBusy(true);
    setResult(null);
    setReviewed(false);
    try {
      const response = await mutation.mutateAsync();
      if (alive.current && generation.current === started) {
        setResult(response.success === true ? "success" : "failed");
        void utils.sheets.getStatus.invalidate().catch(() => {});
      }
    } catch {
      // A transport error is not proof that Google rejected the write.
      if (alive.current && generation.current === started)
        setResult("uncertain");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="pw-workspace" aria-busy={busy}>
      <header className="pw-header">
        <div>
          <p className="pw-eyebrow">Google Sheets</p>
          <ProductHeading>{t("dataSyncUx.title")}</ProductHeading>
          <p>{t("dataSyncUx.subtitle")}</p>
        </div>
        <a className="pw-button" href={href("/merchant/sheets/settings")}>
          {t("dataSyncUx.settings")}
        </a>
      </header>
      {status.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(status.error)}
          onRetry={() => {
            void status.refetch();
          }}
        />
      ) : status.fetchStatus === "paused" ? (
        <WorkspaceState
          kind="offline"
          onRetry={() => {
            void status.refetch();
          }}
        />
      ) : status.isLoading || status.isFetching ? (
        <p role="status">{t("dataSyncUx.loading")}</p>
      ) : (
        <section className="pw-panel" aria-labelledby="sheet-connection-title">
          <h2 id="sheet-connection-title">{t("dataSyncUx.connection")}</h2>
          <p>
            {ready
              ? t("dataSyncUx.connected")
              : status.data?.isConnected
                ? t("dataSyncUx.setupRequired")
                : t("dataSyncUx.unlinked")}
          </p>
          {ready && (
            <>
              <p>{t("dataSyncUx.activity", { date: lastActivity })}</p>
              <p className="pw-muted">{t("dataSyncUx.activityHint")}</p>
              <a
                className="pw-button"
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("dataSyncUx.openSheet")}
              </a>
            </>
          )}
          <div className="pw-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReviewed(false);
                void status.refetch();
              }}
            >
              {t("dataSyncUx.refresh")}
            </button>
          </div>
        </section>
      )}
      <section className="pw-panel" aria-labelledby="sheet-export-title">
        <h2 id="sheet-export-title">{t("dataSyncUx.exportTitle")}</h2>
        <p>{t("dataSyncUx.exportHint")}</p>
        <p className="pw-muted">{t("dataSyncUx.destinationHint")}</p>
        {result && (
          <div role={result === "success" ? "status" : "alert"}>
            <p>
              {result === "success"
                ? t("dataSyncUx.success")
                : result === "failed"
                  ? t("dataSyncUx.failed")
                  : t("dataSyncUx.uncertain")}
            </p>
            {needsCheck && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setReviewed(false);
                  void status.refetch();
                }}
              >
                {t("dataSyncUx.checkedSheet")}
              </button>
            )}
          </div>
        )}
        <label className="ds-consent">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={!ready || busy || needsCheck}
            onChange={event => setReviewed(event.target.checked)}
          />
          {t("dataSyncUx.consent")}
        </label>
        <div className="pw-actions">
          <button
            type="button"
            className="pw-primary"
            disabled={!ready || !reviewed || busy || needsCheck}
            onClick={() => {
              void send();
            }}
          >
            {busy ? t("dataSyncUx.sending") : t("dataSyncUx.exportAction")}
          </button>
        </div>
      </section>
      <section className="pw-panel" aria-labelledby="sheet-import-title">
        <h2 id="sheet-import-title">{t("dataSyncUx.importTitle")}</h2>
        <p>{t("dataSyncUx.importHint")}</p>
        <div className="pw-actions">
          <a className="pw-button" href={href("/merchant/products/upload")}>
            {t("dataSyncUx.importProducts")}
          </a>
          <a className="pw-button" href={href("/merchant/sheets/inventory")}>
            {t("dataSyncUx.importInventory")}
          </a>
        </div>
      </section>
    </div>
  );
}
