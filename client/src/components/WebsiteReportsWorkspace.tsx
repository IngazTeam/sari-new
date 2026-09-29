import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useWebsiteReportsCopy } from "@/hooks/useWebsiteReportsCopy";
import {
  estimatedScore,
  REPORT_LIMITATIONS,
} from "../../../shared/website-reports";
import { safePageUrl } from "../../../shared/knowledge-pages";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function WebsiteReportsWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="website-reports">
      {key => <Workspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function Workspace() {
  const c = useWebsiteReportsCopy(),
    utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [state, setState] = useState<
      "all" | "pending" | "analyzing" | "completed" | "failed"
    >("all"),
    [page, setPage] = useState(1);
  const [id, setId] = useState<number | null>(null),
    [ack, setAck] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [startOpen, setStartOpen] = useState(false),
    [url, setUrl] = useState(""),
    [startAck, setStartAck] = useState(false),
    [startError, setStartError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const gate = useRef(false),
    alive = useRef(true);
  const reportTitle = useRef<HTMLHeadingElement>(null),
    startTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const list = trpc.websiteAnalysis.reports.useQuery(
    { search, state, page },
    {
      retry: false,
      refetchInterval: query =>
        query.state.data?.items.some(
          r => r.status === "analyzing" || r.status === "pending"
        )
          ? 5000
          : false,
    }
  );
  const detail = trpc.websiteAnalysis.report.useQuery(
    { id: id || 1 },
    {
      enabled: !!id,
      retry: false,
      refetchInterval: query =>
        ["analyzing", "pending"].includes(query.state.data?.report.status || "")
          ? 5000
          : false,
    }
  );
  const remove = trpc.websiteAnalysis.deleteReviewedReport.useMutation(),
    start = trpc.websiteAnalysis.analyze.useMutation();
  const review = detail.data,
    report = review?.report,
    canManage = !!list.data?.canManage && !list.error && !list.isLoading;
  const running = !!report && ["pending", "analyzing"].includes(report.status),
    busy = remove.isPending || start.isPending;
  useEffect(() => setAck(false), [id, review?.revision]);
  const refresh = async () => {
    setAck(false);
    setBlocked(true);
    setError("");
    const result = await detail.refetch();
    if (alive.current && !result.error) setBlocked(false);
  };
  const refreshList = async () => {
    const result = await list.refetch();
    if (alive.current && !result.error) setUncertain(false);
  };
  const open = (next: number) => {
    setId(next);
    setAck(false);
    setBlocked(false);
    setError("");
  };
  const deleteReport = async () => {
    if (
      gate.current ||
      !canManage ||
      !ack ||
      !review ||
      running ||
      blocked ||
      detail.error ||
      detail.isFetching
    )
      return;
    gate.current = true;
    setAck(false);
    setError("");
    try {
      await remove.mutateAsync({
        id: review.report.id,
        expectedRevision: review.revision,
        acknowledged: true,
      });
      if (!alive.current) return;
      setId(null);
      setNotice(c.deleted);
      void utils.websiteAnalysis.invalidate();
      void utils.sariBrain.invalidate();
    } catch (e) {
      if (!alive.current) return;
      setBlocked(true);
      const code = (e as { data?: { code?: string } }).data?.code;
      setError(
        code === "CONFLICT" || code === "PRECONDITION_FAILED"
          ? c.conflict
          : c.deleteError
      );
      void list.refetch();
    } finally {
      gate.current = false;
    }
  };
  const begin = async () => {
    if (gate.current || !canManage || !startAck || uncertain) return;
    const normalized = url.trim().match(/^https?:\/\//i)
      ? url.trim()
      : `https://${url.trim()}`;
    if (!url.trim() || normalized.length > 500 || !safePageUrl(normalized)) {
      setStartError(c.invalid);
      return;
    }
    gate.current = true;
    setStartError("");
    try {
      const result = await start.mutateAsync({
        url: normalized,
        acknowledged: true,
      });
      if (!alive.current) return;
      setStartOpen(false);
      setStartAck(false);
      setNotice(c.startAccepted);
      setSearch("");
      setState("all");
      setPage(1);
      open(result.analysisId);
      void utils.websiteAnalysis.invalidate();
    } catch {
      if (alive.current) {
        setStartError(c.startError);
        setStartAck(false);
        setUncertain(true);
      }
    } finally {
      gate.current = false;
    }
  };
  const download = () => {
    if (!review || blocked || detail.error || detail.isFetching) return;
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              limitations: REPORT_LIMITATIONS,
              notice: c.limitations,
              ...review,
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
      const href = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = href;
      a.download = `website-report-${review.report.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setError(c.exportError);
    }
  };
  const text = (value: unknown) =>
    value === null || value === undefined || value === ""
      ? c.none
      : String(value);
  const storedJson = (value: string | null) => {
    if (!value) return c.none;
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  };
  const link = (value: string | null) =>
    value && safePageUrl(value) ? (
      <a
        className="underline break-all"
        href={safePageUrl(value)!}
        target="_blank"
        rel="noopener noreferrer"
      >
        {value}
      </a>
    ) : (
      <span className="break-all">{value}</span>
    );
  return (
    <section className="space-y-4 min-w-0" aria-label={c.title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{c.title}</h2>
          <p className="text-sm text-muted-foreground">{c.description}</p>
        </div>
        <Button
          disabled={!canManage || busy || uncertain}
          onClick={() => {
            setStartAck(false);
            setStartError("");
            setStartOpen(true);
          }}
        >
          {c.start}
        </Button>
      </header>
      <p className="rounded-xl border bg-muted/40 p-4 text-sm">
        {c.limitations}
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="space-y-1">
          <span className="text-sm">{c.search}</span>
          <Input
            maxLength={200}
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm">{c.state}</span>
          <select
            className="block min-h-11 w-full rounded-md border bg-background px-3"
            value={state}
            onChange={e => {
              setState(e.target.value as typeof state);
              setPage(1);
            }}
          >
            {(
              ["all", "pending", "analyzing", "completed", "failed"] as const
            ).map(s => (
              <option key={s} value={s}>
                {c[s]}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="self-end"
          variant="outline"
          disabled={list.isFetching}
          onClick={() => void refreshList()}
        >
          {c.retry}
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {uncertain && <p role="alert">{c.startError}</p>}
      {list.isLoading ? (
        <p role="status">{c.loading}</p>
      ) : list.error ? (
        <p role="alert">{c.readError}</p>
      ) : (
        <>
          {!canManage && !list.isFetching && <p>{c.readonly}</p>}
          <p className="text-sm text-muted-foreground">
            {c.total}: {list.data?.total}
          </p>
          {list.data?.items.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {list.data.items.map(r => (
                <article
                  key={r.id}
                  className="rounded-xl border p-4 min-w-0 space-y-2"
                >
                  <h3 className="font-semibold break-words">
                    {r.title || r.url}
                  </h3>
                  <p
                    className="break-all text-sm text-muted-foreground"
                    dir="ltr"
                  >
                    {r.url}
                  </p>
                  <p className="text-sm">
                    #{r.id} · {c[r.status]} · <bdi>{r.createdAt}</bdi>
                  </p>
                  <Button variant="outline" onClick={() => open(r.id)}>
                    {c.open} #{r.id}
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p role="status">{c.empty}</p>
          )}
          <nav
            className="flex flex-wrap items-center gap-3"
            aria-label={c.page}
          >
            <Button
              variant="outline"
              disabled={!list.data || list.isFetching || list.data.page <= 1}
              onClick={() => setPage((list.data?.page || 1) - 1)}
            >
              {c.previous}
            </Button>
            <span>
              {c.page} {list.data?.page} / {list.data?.totalPages}
            </span>
            <Button
              variant="outline"
              disabled={
                !list.data ||
                list.isFetching ||
                list.data.page >= list.data.totalPages
              }
              onClick={() => setPage((list.data?.page || 1) + 1)}
            >
              {c.next}
            </Button>
          </nav>
        </>
      )}
      <Dialog
        open={!!id}
        onOpenChange={value => {
          if (!value && !busy) setId(null);
        }}
      >
        <DialogContent
          className="mw-form-dialog mw-team-dialog sm:max-w-4xl"
          onOpenAutoFocus={event => {
            event.preventDefault();
            reportTitle.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle ref={reportTitle} tabIndex={-1}>
              {c.open} #{id}
            </DialogTitle>
            <DialogDescription>{c.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain space-y-4 p-1 [overflow-wrap:anywhere]">
            {error && <p role="alert">{error}</p>}
            {detail.isLoading ? (
              <p role="status">{c.loading}</p>
            ) : detail.error || blocked ? (
              <p role="alert">{c.readError}</p>
            ) : (
              report &&
              review && (
                <>
                  <h3 className="text-lg font-semibold">
                    {report.title || report.url}
                  </h3>
                  {link(report.url)}
                  <p>{c[report.status]}</p>
                  {running && (
                    <p role="status" className="rounded-xl border p-3">
                      {c.running}
                    </p>
                  )}
                  {!!report.errorMessage && (
                    <p role="alert" className="rounded-xl border p-3">
                      {c.partial}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {c.limitations}
                  </p>
                  <dl className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 gap-3">
                    {(
                      [
                        [c.overall, report.overallScore],
                        [c.seo, report.seoScore],
                        [c.performance, report.performanceScore],
                        [c.ux, report.uxScore],
                        [c.content, report.contentQuality],
                      ] as const
                    ).map(([label, raw]) => (
                      <div className="rounded-xl border p-3" key={label}>
                        <dt className="text-sm">{label}</dt>
                        <dd className="text-xl font-semibold mt-2 whitespace-nowrap">
                          {estimatedScore(raw, report.status) === null
                            ? c.unavailable
                            : `${raw}/100`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="text-sm space-y-1">
                    {(
                      [
                        [c.created, report.createdAt],
                        [c.updated, report.updatedAt],
                        [c.finished, report.analyzedAt],
                        [c.industry, report.industry],
                        [c.language, report.language],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="inline font-medium">{k}: </dt>
                        <dd className="inline">
                          <bdi>{text(v)}</bdi>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="whitespace-pre-wrap">
                    {text(report.description)}
                  </p>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold">
                      {c.source}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">
                      {text(report.scrapedContent)}
                    </pre>
                  </details>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold">
                      {c.issues}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">
                      {storedJson(report.seoIssues)}
                    </pre>
                  </details>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold">
                      {c.metadata}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap text-sm">
                      {storedJson(report.metaTags)}
                    </pre>
                    <pre className="mt-3 whitespace-pre-wrap text-sm">
                      {JSON.stringify(
                        {
                          loadTimeMilliseconds: report.loadTime,
                          pageSizeBytes: report.pageSize,
                          wordCount: report.wordCount,
                          imageCount: report.imageCount,
                          videoCount: report.videoCount,
                          mobileOptimized: report.mobileOptimized,
                          hasContactInfo: report.hasContactInfo,
                          hasWhatsapp: report.hasWhatsapp,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold">
                      {c.products} ({review.products.length})
                    </summary>
                    <p className="my-3 text-sm text-muted-foreground">
                      {c.extractionNote}
                    </p>
                    {review.products.length ? (
                      review.products.map(p => (
                        <article key={p.id} className="space-y-2 border-t py-3">
                          <h4 className="font-semibold">
                            {p.name} · #{p.id}
                          </h4>
                          <p className="whitespace-pre-wrap">{p.description}</p>
                          <p>
                            {c.price}:{" "}
                            <bdi>
                              {p.price ?? c.unknown} {p.currency}
                            </bdi>{" "}
                            · {c.stock}:{" "}
                            {p.inStock === 1
                              ? c.inStock
                              : p.inStock === 0
                                ? c.outOfStock
                                : c.unknown}
                          </p>
                          {link(p.productUrl)}
                          <p>{p.category}</p>
                          <details>
                            <summary>{c.metadata}</summary>
                            <pre className="whitespace-pre-wrap text-sm">
                              {JSON.stringify(p, null, 2)}
                            </pre>
                          </details>
                        </article>
                      ))
                    ) : (
                      <p>{c.none}</p>
                    )}
                  </details>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer font-semibold">
                      {c.insights} ({review.insights.length})
                    </summary>
                    {review.insights.length ? (
                      review.insights.map(i => (
                        <article key={i.id} className="space-y-2 border-t py-3">
                          <h4 className="font-semibold">{i.title}</h4>
                          <p>
                            {c.priority}: <bdi>{i.priority}</bdi> ·{" "}
                            <bdi>
                              {i.category} / {i.type}
                            </bdi>
                          </p>
                          <p className="whitespace-pre-wrap">{i.description}</p>
                          {i.recommendation && (
                            <p className="whitespace-pre-wrap">
                              <strong>{c.recommendation}: </strong>
                              {i.recommendation}
                            </p>
                          )}
                          {i.impact && (
                            <p>
                              {c.impact}: {i.impact}
                            </p>
                          )}
                          <details>
                            <summary>{c.metadata}</summary>
                            <pre className="whitespace-pre-wrap text-sm">
                              {JSON.stringify(i, null, 2)}
                            </pre>
                          </details>
                        </article>
                      ))
                    ) : (
                      <p>{c.none}</p>
                    )}
                  </details>
                  {canManage && !running && (
                    <div className="rounded-xl border border-destructive/30 p-4 space-y-3">
                      <p className="text-sm">{c.deleteEffect}</p>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          className="mt-1 h-5 w-5 shrink-0"
                          type="checkbox"
                          checked={ack}
                          disabled={busy || detail.isFetching}
                          onChange={e => setAck(e.target.checked)}
                        />
                        <span>{c.acknowledge}</span>
                      </label>
                      <Button
                        variant="destructive"
                        disabled={!ack || busy || detail.isFetching}
                        onClick={() => void deleteReport()}
                      >
                        {remove.isPending ? c.busy : c.remove}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
          <footer className="shrink-0 flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setId(null)}
            >
              {c.close}
            </Button>
            <Button
              variant="outline"
              disabled={busy || detail.isFetching}
              onClick={() => void refresh()}
            >
              {c.retry}
            </Button>
            <Button
              disabled={
                !review ||
                !!detail.error ||
                detail.isFetching ||
                blocked ||
                busy
              }
              onClick={download}
            >
              {c.export}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
      <Dialog
        open={startOpen}
        onOpenChange={value => {
          if (!busy) setStartOpen(value);
        }}
      >
        <DialogContent
          className="mw-form-dialog mw-team-dialog"
          onOpenAutoFocus={event => {
            event.preventDefault();
            startTitle.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle ref={startTitle} tabIndex={-1}>
              {c.startTitle}
            </DialogTitle>
            <DialogDescription>{c.start}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain space-y-4 p-1">
            <p>{c.startEffect}</p>
            <label className="block space-y-2">
              <span>{c.url}</span>
              <Input
                dir="ltr"
                type="url"
                maxLength={500}
                value={url}
                disabled={busy}
                onChange={e => {
                  setUrl(e.target.value);
                  setStartAck(false);
                }}
              />
            </label>
            <label className="flex gap-3 items-start">
              <input
                className="mt-1 h-5 w-5 shrink-0"
                type="checkbox"
                checked={startAck}
                disabled={busy || uncertain}
                onChange={e => setStartAck(e.target.checked)}
              />
              <span>{c.startAck}</span>
            </label>
            {startError && <p role="alert">{startError}</p>}
          </div>
          <footer className="shrink-0 flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setStartOpen(false)}
            >
              {c.close}
            </Button>
            <Button
              disabled={!canManage || !startAck || busy || uncertain}
              onClick={() => void begin()}
            >
              {busy ? c.busy : c.start}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </section>
  );
}
