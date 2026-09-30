import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { performanceLabels } from "@/lib/performance-labels";
import { performanceCsv } from "@/lib/performance-report";
import {
  performanceWindows,
  type PerformanceInput,
} from "@shared/performance-workspace";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { PerformanceReport } from "./PerformanceReport";
export function performancePreset(
  days: number,
  now = new Date()
): PerformanceInput {
  const first = new Date(now);
  first.setUTCDate(first.getUTCDate() - days + 1);
  return {
    startDate: first.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}
export function PerformanceWorkspace() {
  const { t, i18n } = useTranslation(),
    l = performanceLabels(t),
    language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA";
  const [applied, setApplied] = useState(() => performancePreset(30)),
    [draft, setDraft] = useState(applied),
    [invalid, setInvalid] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const merchant = trpc.merchants.getCurrent.useQuery(),
    query = trpc.performance.workspace.useQuery(applied, {
      staleTime: 0,
      refetchOnMount: "always",
    });
  const mounted = useRef(true),
    lock = useRef(false),
    selection = useRef("");
  selection.current = JSON.stringify([applied, merchant.data?.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty =
      draft.startDate !== applied.startDate ||
      draft.endDate !== applied.endDate,
    failed = query.error || merchant.error;
  const data =
    !failed &&
    query.data?.merchantId === merchant.data?.id &&
    query.data?.selection.startDate === applied.startDate &&
    query.data?.selection.endDate === applied.endDate
      ? query.data
      : undefined;
  const waiting =
    query.isFetching || merchant.isFetching || refreshing || !data;
  function apply(range: PerformanceInput) {
    try {
      performanceWindows(range);
      setApplied({ ...range });
      setDraft({ ...range });
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setRefreshing(true);
    const started = selection.current;
    try {
      const [result, owner] = await Promise.all([
        query.refetch(),
        merchant.refetch(),
      ]);
      if (!mounted.current || selection.current !== started) return;
      if (
        result.error ||
        owner.error ||
        result.data?.merchantId !== owner.data?.id ||
        result.data?.selection.startDate !== applied.startDate ||
        result.data?.selection.endDate !== applied.endDate
      )
        throw Error("Unconfirmed refresh");
      toast.success(l.refreshed);
    } catch {
      if (mounted.current && selection.current === started)
        toast.error(l.refreshFailed);
    } finally {
      lock.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }
  function exportSnapshot() {
    if (!data || waiting || dirty) return;
    try {
      const url = URL.createObjectURL(
          new Blob([performanceCsv(data, t)], {
            type: "text/csv;charset=utf-8",
          })
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `sary-performance-${data.merchantId}-${data.selection.startDate}-${data.selection.endDate}.csv`;
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
  return (
    <div
      className="ov-workspace pf-workspace"
      dir={language === "ar-SA" ? "rtl" : "ltr"}
    >
      <header className="ov-header">
        <div>
          <h1>{l.title}</h1>
          <p>{l.subtitle}</p>
        </div>
        <div className="ov-tools">
          <Button
            variant="outline"
            disabled={query.isFetching || merchant.isFetching || refreshing}
            onClick={() => void refresh()}
          >
            {l.refresh}
          </Button>
          <Button
            disabled={waiting || !!failed || dirty}
            onClick={exportSnapshot}
          >
            {l.export}
          </Button>
        </div>
      </header>
      <section className="ov-panel" aria-label={l.apply}>
        <form
          className="pf-range"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <label htmlFor="pf-start">
            {l.start}
            <input
              id="pf-start"
              type="date"
              value={draft.startDate}
              max={new Date().toISOString().slice(0, 10)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "pf-range-error" : undefined}
              onChange={e => setDraft({ ...draft, startDate: e.target.value })}
            />
          </label>
          <label htmlFor="pf-end">
            {l.end}
            <input
              id="pf-end"
              type="date"
              value={draft.endDate}
              max={new Date().toISOString().slice(0, 10)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "pf-range-error" : undefined}
              onChange={e => setDraft({ ...draft, endDate: e.target.value })}
            />
          </label>
          <Button type="submit" disabled={!dirty && !invalid}>
            {l.apply}
          </Button>
        </form>
        {invalid && (
          <p id="pf-range-error" role="alert">
            {l.rangeError}
          </p>
        )}
        {dirty && (
          <p role="status" className="ov-note">
            {l.dirty}
          </p>
        )}
        <div className="pf-presets">
          {([7, 30, 90] as const).map(days => (
            <Button
              key={days}
              variant="outline"
              type="button"
              onClick={() => apply(performancePreset(days))}
            >
              {l[days === 7 ? "days7" : days === 30 ? "days30" : "days90"]}
            </Button>
          ))}
        </div>
      </section>
      {failed ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(failed)}
          onRetry={() => void refresh()}
        />
      ) : waiting ? (
        <WorkspaceState inline kind="loading" />
      ) : data ? (
        <PerformanceReport data={data} t={t} language={language} />
      ) : null}
    </div>
  );
}
