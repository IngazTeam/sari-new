import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { testMetricsLabels } from "@/lib/test-metrics-labels";
import { testMetricsCsv } from "@/lib/test-metrics-report";
import { Button } from "@/components/ui/button";
import { TestMetricsReport } from "./TestMetricsReport";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import type { TestMetricsInput } from "@shared/test-metrics-workspace";
export function TestMetricsWorkspace() {
  const { t, i18n } = useTranslation(),
    l = testMetricsLabels(t),
    language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA";
  const [period, setPeriod] = useState<TestMetricsInput["period"]>("day"),
    [refreshing, setRefreshing] = useState(false);
  const merchant = trpc.merchants.getCurrent.useQuery(),
    query = trpc.testMetricsWorkspace.read.useQuery(
      { period },
      { staleTime: 0, refetchOnMount: "always" }
    );
  const live = useRef(true),
    lock = useRef(false),
    selection = useRef("");
  selection.current = JSON.stringify([period, merchant.data?.id]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const failed = query.error || merchant.error,
    data =
      !failed &&
      query.data?.merchantId === merchant.data?.id &&
      query.data?.period === period
        ? query.data
        : undefined;
  const waiting = query.isFetching || refreshing || !data;
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setRefreshing(true);
    const started = selection.current;
    try {
      const result = await query.refetch();
      if (!live.current || started !== selection.current) return;
      if (
        result.error ||
        result.data?.merchantId !== merchant.data?.id ||
        result.data?.period !== period
      )
        throw Error("Unavailable");
      toast.success(l.refreshed);
    } catch {
      if (live.current && started === selection.current)
        toast.error(l.refreshFailed);
    } finally {
      lock.current = false;
      if (live.current) setRefreshing(false);
    }
  }
  function exportSnapshot() {
    if (!data || waiting) return;
    try {
      const url = URL.createObjectURL(
          new Blob([testMetricsCsv(data, t)], {
            type: "text/csv;charset=utf-8",
          })
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `sary-test-metrics-${data.merchantId}-${period}.csv`;
      a.hidden = true;
      document.body.append(a);
      try {
        a.click();
      } finally {
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(l.exportReady);
    } catch {
      toast.error(l.exportFailed);
    }
  }
  const date = (s: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      calendar: "gregory",
      timeZone: "UTC",
    }).format(new Date(s));
  return (
    <div className="ov-workspace" dir={language === "ar-SA" ? "rtl" : "ltr"}>
      <header className="ov-header">
        <div>
          <h1>{l.title}</h1>
          <p>{l.subtitle}</p>
        </div>
        <div className="ov-tools tm-tools">
          <label>
            {l.period}
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as typeof period)}
            >
              <option value="day">{l.day}</option>
              <option value="week">{l.week}</option>
              <option value="month">{l.month}</option>
            </select>
          </label>
          <Button
            variant="outline"
            disabled={query.isFetching || refreshing}
            onClick={() => void refresh()}
          >
            {l.refresh}
          </Button>
          <Button disabled={waiting || !!failed} onClick={exportSnapshot}>
            {l.export}
          </Button>
        </div>
      </header>
      {failed ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(failed)}
          onRetry={() => void refresh()}
        />
      ) : waiting ? (
        <WorkspaceState inline kind="loading" />
      ) : data ? (
        <>
          <div className="ov-period">
            <p>
              {l.from}: <time dateTime={data.from}>{date(data.from)}</time> ·{" "}
              {l.through}:{" "}
              <time dateTime={data.through}>{date(data.through)}</time> UTC
            </p>
            <p>{l.periodNote}</p>
          </div>
          <TestMetricsReport data={data} t={t} language={language} />
          <p className="ov-note">{l.exportNote}</p>
        </>
      ) : null}
    </div>
  );
}
