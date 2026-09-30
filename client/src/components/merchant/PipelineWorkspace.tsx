import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { pipelineLabels } from "@/lib/pipeline-labels";
import type { PipelineInput } from "@shared/pipeline-workspace";
import { PipelineReport, pipelineSelectionKey } from "./PipelineReport";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { Button } from "@/components/ui/button";
export function PipelineWorkspace() {
  const { t, i18n } = useTranslation(),
    l = pipelineLabels(t),
    language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA";
  const [selection, setSelection] = useState<PipelineInput>({
      queue: "ready",
      page: 1,
      pageSize: 20,
    }),
    [refreshing, setRefreshing] = useState(false);
  const merchant = trpc.merchants.getCurrent.useQuery(),
    query = trpc.salesPipeline.workspace.useQuery(selection, {
      staleTime: 0,
      refetchOnMount: "always",
    });
  const mounted = useRef(true),
    lock = useRef(false),
    current = useRef("");
  current.current = merchant.data?.id + ":" + pipelineSelectionKey(selection);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const failure = merchant.error || query.error;
  const data =
    !failure &&
    query.data &&
    merchant.data &&
    query.data?.merchantId === merchant.data?.id &&
    pipelineSelectionKey(query.data.selection) ===
      pipelineSelectionKey(selection)
      ? query.data
      : undefined;
  const waiting =
    query.isFetching || merchant.isFetching || refreshing || !data;
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setRefreshing(true);
    const token = current.current;
    try {
      const [result, owner] = await Promise.all([
        query.refetch(),
        merchant.refetch(),
      ]);
      if (!mounted.current || token !== current.current) return;
      if (
        result.error ||
        owner.error ||
        !result.data ||
        result.data.merchantId !== owner.data?.id ||
        pipelineSelectionKey(result.data.selection) !==
          pipelineSelectionKey(selection)
      )
        throw Error("Unconfirmed refresh");
      toast.success(l.refreshed);
    } catch {
      if (mounted.current && token === current.current)
        toast.error(l.refreshFailed);
    } finally {
      lock.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }
  return (
    <div
      className="ov-workspace pl-workspace"
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
          <Button asChild>
            <a href="/merchant/sales-hub">{l.quotes}</a>
          </Button>
        </div>
      </header>
      <p className="ov-note">{l.scope}</p>
      {failure ? (
        <WorkspaceState
          inline
          focus
          kind={workspaceFailureKind(failure)}
          onRetry={() => void refresh()}
        />
      ) : waiting ? (
        <WorkspaceState inline kind="loading" />
      ) : (
        <PipelineReport
          data={data!}
          t={t}
          language={language}
          onSelect={setSelection}
          onPage={page => setSelection(s => ({ ...s, page }))}
        />
      )}
    </div>
  );
}
