import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  reportSnapshotSchema,
  reportSelectionKey,
  type ReportSelection,
} from "@shared/report-workspace";
import { reportWorkbook } from "@/lib/report-export";
import {
  merchantReportDocument,
  type MerchantReportDocument,
} from "@/lib/merchant-report-document";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { MerchantReportView } from "./MerchantReportView";

export function ReportsWorkspace({ scope }: { scope: string }) {
  const { t, i18n } = useTranslation(),
    language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA",
    rtl = language === "ar-SA";
  const [selection, setSelection] = useState<ReportSelection>({
    kind: "sales",
    period: "month",
    currency: "SAR",
  });
  const [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
      null
    );
  const [printJob, setPrintJob] = useState<{
    document: MerchantReportDocument;
    key: string;
    rtl: boolean;
  } | null>(null);
  const query = trpc.reports.workspace.useQuery(selection, {
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const [, merchantId] = scope.split(":").map(Number),
    parsed = reportSnapshotSchema.safeParse(query.data);
  const snapshot =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    parsed.data.kind === selection.kind &&
    parsed.data.period === selection.period &&
    (parsed.data.kind !== "sales" ||
      parsed.data.currency === selection.currency)
      ? parsed.data
      : null;
  const paused = query.fetchStatus === "paused",
    waiting = query.isFetching || query.isLoading;
  const ready = !!snapshot && !query.error && !paused && !waiting;
  const doc = ready ? merchantReportDocument(snapshot!, t, language) : null;
  const readyKey = useRef(""),
    mounted = useRef(true),
    exportLock = useRef(false);
  readyKey.current = ready
    ? JSON.stringify([
        scope,
        language,
        reportSelectionKey(selection),
        query.dataUpdatedAt,
        snapshot,
      ])
    : "";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readyKey.current = "";
    };
  }, []);
  useEffect(() => {
    setNotice(null);
    setPrintJob(null);
  }, [scope, selection, language]);
  useEffect(() => {
    if (!printJob) return;
    let second = 0;
    const afterPrint = () => setPrintJob(null);
    window.addEventListener("afterprint", afterPrint);
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!mounted.current || readyKey.current !== printJob.key) {
          setPrintJob(null);
          return;
        }
        try {
          window.print();
        } catch {
          setNotice({ error: true, text: t("reportWorkspaceUx.printFailed") });
          setPrintJob(null);
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [printJob]);
  async function excel() {
    if (!doc || !snapshot || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setNotice(null);
    const key = readyKey.current,
      started = snapshot;
    try {
      const buffer = await reportWorkbook(doc, rtl);
      if (!mounted.current || readyKey.current !== key) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(buffer)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sary-report-${started.merchantId}-${started.kind}-${started.period}-${started.kind === "sales" ? started.currency : "UTC"}.xlsx`;
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice({ error: false, text: t("reportWorkspaceUx.downloadStarted") });
    } catch {
      if (mounted.current && readyKey.current === key)
        setNotice({ error: true, text: t("reportWorkspaceUx.exportFailed") });
    } finally {
      exportLock.current = false;
      if (mounted.current) setExporting(false);
    }
  }
  const kinds = [
    { id: "sales", label: t("reportWorkspaceUx.sales") },
    { id: "customers", label: t("reportWorkspaceUx.customers") },
    { id: "conversations", label: t("reportWorkspaceUx.conversations") },
  ] as const;
  const periods = [
    { id: "day", label: t("reportWorkspaceUx.day") },
    { id: "week", label: t("reportWorkspaceUx.week") },
    { id: "month", label: t("reportWorkspaceUx.month") },
    { id: "year", label: t("reportWorkspaceUx.year") },
  ] as const;
  return (
    <div className="rw-workspace" dir={rtl ? "rtl" : "ltr"}>
      <header className="rw-header">
        <div>
          <p className="rw-eyebrow">{t("reportWorkspaceUx.eyebrow")}</p>
          <h1>{t("reportWorkspaceUx.title")}</h1>
          <p>{t("reportWorkspaceUx.subtitle")}</p>
        </div>
        <div className="rw-actions">
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {t("reportWorkspaceUx.refresh")}
          </button>
          <button
            type="button"
            className="rw-primary"
            disabled={!ready || exporting}
            onClick={() => void excel()}
          >
            {exporting
              ? t("reportWorkspaceUx.exporting")
              : t("reportWorkspaceUx.excel")}
          </button>
          <button
            type="button"
            disabled={!ready || exporting}
            onClick={() =>
              doc && setPrintJob({ document: doc, key: readyKey.current, rtl })
            }
          >
            {t("reportWorkspaceUx.print")}
          </button>
        </div>
      </header>
      <div className="rw-filters">
        <nav aria-label={t("reportWorkspaceUx.kind")} className="rw-kinds">
          {kinds.map(k => (
            <button
              key={k.id}
              type="button"
              aria-pressed={selection.kind === k.id}
              onClick={() => setSelection(s => ({ ...s, kind: k.id }))}
            >
              {k.label}
            </button>
          ))}
        </nav>
        <div className="rw-selects">
          <label htmlFor="report-period">
            {t("reportWorkspaceUx.period")}
            <select
              id="report-period"
              value={selection.period}
              onChange={e =>
                setSelection(s => ({
                  ...s,
                  period: e.target.value as ReportSelection["period"],
                }))
              }
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {selection.kind === "sales" && (
            <label htmlFor="report-currency">
              {t("reportWorkspaceUx.currency")}
              <select
                id="report-currency"
                value={selection.currency}
                onChange={e =>
                  setSelection(s => ({
                    ...s,
                    currency: e.target.value as ReportSelection["currency"],
                  }))
                }
              >
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </select>
            </label>
          )}
        </div>
      </div>
      {notice && (
        <p className="rw-feedback" role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {query.error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : paused ? (
        <WorkspaceState
          inline
          kind="offline"
          onRetry={() => void query.refetch()}
        />
      ) : waiting ? (
        <WorkspaceState inline kind="loading" />
      ) : !doc ? (
        <WorkspaceState
          inline
          kind="error"
          description={t("reportWorkspaceUx.invalidSnapshot")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <MerchantReportView
          key={reportSelectionKey(selection)}
          document={doc}
          sourceLabel={t("reportWorkspaceUx.method")}
          emptyLabel={t("reportWorkspaceUx.empty")}
        />
      )}
      {printJob &&
        createPortal(
          <div
            className="sary-report-print rw-print"
            dir={printJob.rtl ? "rtl" : "ltr"}
          >
            <MerchantReportView
              document={printJob.document}
              sourceLabel={t("reportWorkspaceUx.method")}
              emptyLabel={t("reportWorkspaceUx.empty")}
              printing
            />
          </div>,
          document.body
        )}
    </div>
  );
}
