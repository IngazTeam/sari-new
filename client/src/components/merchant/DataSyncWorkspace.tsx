import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { inventoryExportReceipt } from "@shared/inventory-sheet-export";
import { ProductHeading } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";

/** Reflect only facts returned by the Sheets service; a resolved request can still fail. */
export function DataSyncWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils();
  const status = trpc.sheets.inventoryStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const mutation = trpc.sheets.syncInventory.useMutation({ retry: false });
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<
      "success" | "failed" | "uncertain" | "blocked" | null
    >(null);
  const [reason, setReason] = useState<
    "empty" | "limit" | "destination" | "rateLimit" | "refreshRequired"
  >("refreshRequired");
  const explanations = {
    empty: t("dataSyncUx.empty"),
    limit: t("dataSyncUx.limit"),
    destination: t("dataSyncUx.destination"),
    rateLimit: t("dataSyncUx.rateLimit"),
    refreshRequired: t("dataSyncUx.refreshRequired"),
  };
  const [receipt, setReceipt] = useState<{
    rows: number;
    unknownStock: number;
    unverifiedPrice: number;
  } | null>(null);
  const lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  const spreadsheetId = status.data?.spreadsheetId;
  const sameScope =
    !!status.data &&
    `${status.data.actorId}:${status.data.merchantId}:data-sync` === scope;
  const validSheet =
    typeof spreadsheetId === "string" &&
    /^[A-Za-z0-9_-]{1,255}$/.test(spreadsheetId);
  const ready =
    !status.error &&
    sameScope &&
    !status.isLoading &&
    typeof status.data?.sourceDigest === "string" &&
    /^[a-f0-9]{64}$/.test(status.data.sourceDigest) &&
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
    setReceipt(null);
  }, [
    spreadsheetId,
    status.data?.isConnected,
    status.data?.sourceDigest,
    sameScope,
  ]);
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
      const response = await mutation.mutateAsync({
        expectedSourceDigest: status.data!.sourceDigest!,
        reviewed: true,
      });
      if (alive.current && generation.current === started) {
        const checked = inventoryExportReceipt.safeParse(response);
        if (
          checked.success &&
          `${checked.data.actorId}:${checked.data.merchantId}:data-sync` ===
            scope &&
          checked.data.spreadsheetId === spreadsheetId &&
          checked.data.sourceDigest === status.data?.sourceDigest
        ) {
          setResult("success");
          setReceipt(checked.data);
        } else setResult(response.success === true ? "uncertain" : "failed");
        void utils.sheets.inventoryStatus.invalidate().catch(() => {});
      }
    } catch (error) {
      // A transport error is not proof that Google rejected the write.
      if (alive.current && generation.current === started) {
        const e = error as { data?: { code?: string }; message?: string },
          code = e?.data?.code;
        const reason = e?.message?.replace(/^inventory_export:/, "");
        if (
          [
            "BAD_REQUEST",
            "FORBIDDEN",
            "UNAUTHORIZED",
            "CONFLICT",
            "PRECONDITION_FAILED",
            "TOO_MANY_REQUESTS",
          ].includes(code || "") ||
          (code === "BAD_GATEWAY" &&
            ["authentication", "destination", "size", "unavailable"].includes(
              reason || ""
            ))
        ) {
          setResult("blocked");
          setReason(
            reason === "empty"
              ? "empty"
              : reason === "limit" || reason === "size"
                ? "limit"
                : reason === "destination"
                  ? "destination"
                  : code === "TOO_MANY_REQUESTS"
                    ? "rateLimit"
                    : "refreshRequired"
          );
          void utils.sheets.inventoryStatus.invalidate().catch(() => {});
        } else setResult("uncertain");
      }
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
      {status.error || (status.data && !sameScope) ? (
        <WorkspaceState
          kind={status.error ? workspaceFailureKind(status.error) : "error"}
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
              : status.data?.reason && status.data.reason !== "unlinked"
                ? t("dataSyncUx.oauthUnavailable")
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
            {result === "success" && receipt && (
              <p>
                {t("dataSyncUx.summary", {
                  count: receipt.rows,
                  stock: receipt.unknownStock,
                  price: receipt.unverifiedPrice,
                })}
              </p>
            )}
            <p>
              {result === "success"
                ? t("dataSyncUx.success")
                : result === "failed"
                  ? t("dataSyncUx.failed")
                  : result === "blocked"
                    ? explanations[reason]
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
