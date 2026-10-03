import { CompetitorComparison } from "./CompetitorComparison";
import { competitorComparisonLabels } from "@/lib/competitor-comparison-labels";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { competitorLabels } from "@/lib/competitor-workspace-labels";
import {
  competitorNavigation,
  scopedCompetitors,
  scopedCompetitorDetail,
  competitorFields,
} from "@/lib/competitor-workspace";
import { catalogHref } from "@/lib/service-catalog-navigation";
import {
  readCompetitorAttempt,
  rememberCompetitorAttempt,
  forgetCompetitorAttempt,
  scopedCompetitorReceipt,
} from "@/lib/competitor-analysis-attempt";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import "@/styles/service-catalog-workspace.css";
import "@/styles/competitor-workspace.css";

export function CompetitorWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = competitorLabels(t),
    cc = competitorComparisonLabels(t),
    locale = i18n.language.startsWith("ar") ? "ar" : "en";
  const [path, navigate] = useLocation(),
    search = useSearch(),
    selection = competitorNavigation(search),
    params = new URLSearchParams(search);
  const requested = params.get("report"),
    selected =
      requested &&
      /^[1-9]\d*$/.test(requested) &&
      Number(requested) <= 2147483647
        ? Number(requested)
        : null;
  const productParam = params.get("products"),
    productPage =
      productParam &&
      /^[1-9]\d*$/.test(productParam) &&
      Number(productParam) <= 100000
        ? Number(productParam)
        : 1;
  const query = trpc.websiteAnalysis.competitorWorkspace.useQuery(selection, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: q => (q.state.data?.stats.running ? 5000 : false),
  });
  const data = query.error
    ? null
    : scopedCompetitors(query.data, actorId, merchantId, selection);
  const attemptScope = `${actorId}:${merchantId}`;
  const [attempt, setAttempt] = useState(() => {
    try {
      return { id: readCompetitorAttempt(attemptScope), storageError: false };
    } catch {
      return { id: null, storageError: true };
    }
  });
  const attemptQuery = trpc.websiteAnalysis.competitorAnalysisAttempt.useQuery(
    { requestId: attempt.id || "00000000-0000-4000-8000-000000000000" },
    {
      enabled: !!attempt.id && !!data,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: q => (q.state.data?.state === "running" ? 5000 : false),
    }
  );
  const receipt = attemptQuery.error
    ? null
    : scopedCompetitorReceipt(
        attemptQuery.data,
        actorId,
        merchantId,
        attempt.id
      );
  const closeAttempt =
    trpc.websiteAnalysis.closeCompetitorAnalysisAttempt.useMutation({
      retry: false,
    });
  const detailQuery = trpc.websiteAnalysis.competitorDetail.useQuery(
    { id: selected || 1, productPage },
    {
      enabled: !!selected && !!data,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: q =>
        ["pending", "analyzing"].includes(q.state.data?.report.status || "")
          ? 5000
          : false,
    }
  );
  const detail =
    detailQuery.error || !selected
      ? null
      : scopedCompetitorDetail(
          detailQuery.data,
          actorId,
          merchantId,
          selected,
          productPage
        );
  const [productsExpanded, setProductsExpanded] = useState(productPage > 1);
  useEffect(() => {
    setProductsExpanded(productPage > 1);
  }, [selected]);
  const add = trpc.websiteAnalysis.addCompetitor.useMutation({ retry: false }),
    remove = trpc.websiteAnalysis.deleteReviewedCompetitor.useMutation({
      retry: false,
    });
  const [comparing, setComparing] = useState(false);
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [errors, setErrors] = useState({ name: false, url: false });
  const [ack, setAck] = useState(false),
    [failure, setFailure] = useState(""),
    [blocked, setBlocked] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [searchDraft, setSearchDraft] = useState<string | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    scope = useRef(""),
    epoch = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    dialogHeading = useRef<HTMLHeadingElement>(null),
    nameField = useRef<HTMLInputElement>(null),
    urlField = useRef<HTMLInputElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (attempt.id && !busy) void attemptQuery.refetch();
  }, [attempt.id, busy]);
  scope.current = `${actorId}:${merchantId}:${search}:${locale}`;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    epoch.current++;
    setAck(false);
    setFailure("");
    setBlocked(false);
    setSearchDraft(null);
    setComparing(false);
    setAdding(false);
  }, [search, locale]);
  useEffect(() => {
    setAck(false);
  }, [detail?.revision]);
  useEffect(() => {
    if (query.error) {
      epoch.current++;
      setAdding(false);
      setAck(false);
    }
  }, [query.error]);
  useEffect(() => {
    if (errors.name) nameField.current?.focus();
    else if (errors.url) urlField.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (!busy && failure) feedback.current?.focus();
  }, [failure, busy]);
  const change = (patch: Record<string, string | number | null>) =>
    navigate(catalogHref(path, search, patch));
  const number = (n: number) => n.toLocaleString(locale),
    stamp = (v: string | null) =>
      v
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(v))
        : c.unknown;
  const state = (v: string) =>
    v === "completed"
      ? c.completed
      : v === "analyzing"
        ? c.analyzing
        : v === "pending"
          ? c.pending
          : v === "failed"
            ? c.failed
            : c.unknown;
  const refresh = async () => {
    await query.refetch();
  };
  const remember = () => {
    opener.current = document.activeElement as HTMLElement;
    setFailure("");
    setBlocked(false);
    setAck(false);
  };
  async function submitAdd() {
    if (
      lock.current ||
      blocked ||
      attempt.id ||
      attempt.storageError ||
      !data?.canManage
    )
      return;
    const invalid = competitorFields(name, url);
    setErrors(invalid);
    if (invalid.name || invalid.url) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    const view = scope.current,
      token = ++epoch.current;
    let requestId: string;
    try {
      requestId = crypto.randomUUID();
      rememberCompetitorAttempt(attemptScope, requestId, knowledgeCacheEpoch());
      setAttempt({ id: requestId, storageError: false });
    } catch {
      setAttempt(current => ({ ...current, storageError: true }));
      setFailure(c.attemptStorage);
      lock.current = false;
      setBusy(false);
      return;
    }
    try {
      const accepted = await add.mutateAsync({
        requestId,
        name: name.trim(),
        url: url.trim(),
      });
      if (
        accepted.requestId !== requestId ||
        !Number.isInteger(accepted.competitorId) ||
        accepted.competitorId <= 0 ||
        typeof accepted.created !== "boolean"
      )
        throw Error("Unverified receipt");
      if (!alive.current || view !== scope.current || token !== epoch.current)
        return;
      setAdding(false);
      setName("");
      setUrl("");
      setNotice(c.added);
      await refresh();
    } catch {
      if (alive.current && view === scope.current && token === epoch.current) {
        setFailure(c.addFailed);
        setBlocked(true);
        setAdding(false);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function closeUnacceptedAttempt() {
    if (
      lock.current ||
      !attempt.id ||
      !data?.canManage ||
      receipt?.state !== "idle" ||
      attemptQuery.isFetching
    )
      return;
    const view = scope.current,
      token = ++epoch.current;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const result = await closeAttempt.mutateAsync({ requestId: attempt.id });
      if (!alive.current || scope.current !== view || epoch.current !== token)
        return;
      if (!scopedCompetitorReceipt(result, actorId, merchantId, attempt.id))
        throw Error();
      await attemptQuery.refetch();
      await refresh();
    } catch {
      if (alive.current && scope.current === view && epoch.current === token)
        setFailure(c.attemptUnavailable);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function startNextAttempt() {
    if (
      busy ||
      attemptQuery.isFetching ||
      !attempt.id ||
      !receipt ||
      !["completed", "failed", "interrupted", "closed"].includes(receipt.state)
    )
      return;
    try {
      forgetCompetitorAttempt(attemptScope, attempt.id, knowledgeCacheEpoch());
      setAttempt({ id: null, storageError: false });
      remember();
      setName("");
      setUrl("");
      setAdding(true);
    } catch {
      setAttempt(current => ({ ...current, storageError: true }));
    }
  }
  async function submitDelete() {
    if (
      lock.current ||
      blocked ||
      !ack ||
      !detail?.canManage ||
      detailQuery.isFetching ||
      !["completed", "failed"].includes(detail.report.status) ||
      detail.report.excludedProducts
    )
      return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    const view = scope.current,
      token = ++epoch.current;
    try {
      const result = await remove.mutateAsync({
        id: detail.report.id,
        expectedRevision: detail.revision,
        acknowledged: true,
      });
      if (!alive.current || view !== scope.current || token !== epoch.current)
        return;
      if (
        result.merchantId !== merchantId ||
        result.id !== detail.report.id ||
        result.success !== true
      )
        throw Error();
      change({ report: null, products: null });
      setNotice(c.removed);
      await refresh();
    } catch (error) {
      if (alive.current && view === scope.current && token === epoch.current) {
        setAck(false);
        setBlocked(true);
        setFailure(
          (error as any)?.data?.code === "CONFLICT" ? c.changed : c.deleteFailed
        );
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const dialogProps = {
    className: "sc-dialog cmp-dialog",
    dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const),
    closeLabel: c.close,
    showCloseButton: !busy,
    onInteractOutside: (e: Event) => {
      if (busy) e.preventDefault();
    },
    onEscapeKeyDown: (e: KeyboardEvent) => {
      if (busy) e.preventDefault();
    },
    onOpenAutoFocus: (e: Event) => {
      e.preventDefault();
      dialogHeading.current?.focus();
    },
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault();
      if (opener.current?.isConnected) opener.current.focus();
      else heading.current?.focus();
    },
  };
  const feedbackNode = failure && (
    <p className="sc-feedback" role="alert" tabIndex={-1} ref={feedback}>
      {failure}
    </p>
  );
  return (
    <div
      className="service-catalog competitor-workspace"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="sc-header">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {c.title}
          </h1>
          <p>{c.help}</p>
        </div>
        <div className="sc-actions">
          <Button
            variant="outline"
            disabled={busy || query.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden />
            {c.refresh}
          </Button>
          {data && (
            <Button
              variant="outline"
              disabled={busy || query.isFetching}
              onClick={() => {
                remember();
                setComparing(true);
              }}
            >
              {cc.title}
            </Button>
          )}
          {data?.canManage && (
            <Button
              disabled={
                busy || query.isFetching || !!attempt.id || attempt.storageError
              }
              onClick={() => {
                remember();
                setErrors({ name: false, url: false });
                setAdding(true);
              }}
            >
              <Plus aria-hidden />
              {c.add}
            </Button>
          )}
        </div>
      </header>
      {(attempt.id || attempt.storageError) && (
        <section className="cmp-evidence" aria-label={c.attemptTitle}>
          <h2>{c.attemptTitle}</h2>
          <p role="status">
            {attempt.storageError
              ? c.attemptStorage
              : !receipt
                ? c.attemptUnavailable
                : receipt.state === "idle"
                  ? c.attemptAbsent
                  : receipt.state === "closed"
                    ? c.attemptClosed
                    : receipt.state === "running"
                      ? c.attemptRunning
                      : receipt.state === "interrupted"
                        ? c.attemptInterrupted
                        : receipt.state === "completed"
                          ? c.attemptCompleted
                          : c.attemptFailed}
          </p>
          {feedbackNode}
          <div className="cmp-attempt-actions">
            <Button
              variant="outline"
              disabled={busy || attemptQuery.isFetching}
              onClick={() => {
                if (attempt.storageError) {
                  try {
                    setAttempt({
                      id: readCompetitorAttempt(attemptScope),
                      storageError: false,
                    });
                  } catch {
                    setFailure(c.attemptStorage);
                  }
                } else void attemptQuery.refetch();
              }}
            >
              {c.attemptCheck}
            </Button>
            {data && receipt?.reportAvailable && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  change({ report: receipt.competitorId, products: null })
                }
              >
                {c.details}
              </Button>
            )}
            {data?.canManage && receipt?.state === "idle" && (
              <Button
                disabled={busy || attemptQuery.isFetching}
                onClick={() => void closeUnacceptedAttempt()}
              >
                {c.attemptClose}
              </Button>
            )}
            {data?.canManage &&
              receipt &&
              ["completed", "failed", "interrupted", "closed"].includes(
                receipt.state
              ) && (
                <Button
                  disabled={busy || attemptQuery.isFetching}
                  onClick={startNextAttempt}
                >
                  {c.attemptNew}
                </Button>
              )}
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className="sc-feedback">
          {notice}
        </p>
      )}
      <p className="cmp-evidence">{c.evidence}</p>
      {query.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(query.error)}
          title={c.loadFailed}
          description={c.loadHelp}
          onRetry={() => void refresh()}
        />
      ) : !data ? (
        <WorkspaceState
          kind={query.isLoading || query.isFetching ? "loading" : "error"}
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          {!data.canManage && <p className="sc-feedback">{c.readonly}</p>}
          <dl className="sc-summary">
            {(["total", "completed", "running", "failed"] as const).map(key => (
              <div key={key}>
                <dt>{c[key]}</dt>
                <dd>{number(data.stats[key])}</dd>
              </div>
            ))}
          </dl>
          <section className="sc-list" aria-label={c.title}>
            <form
              className="sc-filters"
              onSubmit={e => {
                e.preventDefault();
                change({
                  q: searchDraft ?? selection.query,
                  page: null,
                  report: null,
                  products: null,
                });
              }}
            >
              <label className="sc-search">
                <span>{c.search}</span>
                <input
                  maxLength={200}
                  value={searchDraft ?? selection.query}
                  onChange={e => setSearchDraft(e.target.value)}
                />
              </label>
              <Button variant="outline" type="submit">
                {c.searchAction}
              </Button>
              <label>
                <span>{c.state}</span>
                <select
                  value={selection.state}
                  onChange={e =>
                    change({
                      state: e.target.value === "all" ? null : e.target.value,
                      page: null,
                      report: null,
                      products: null,
                    })
                  }
                >
                  {(
                    [
                      "all",
                      "pending",
                      "analyzing",
                      "completed",
                      "failed",
                    ] as const
                  ).map(s => (
                    <option key={s} value={s}>
                      {s === "all" ? c.all : state(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{c.sort}</span>
                <select
                  value={selection.sort}
                  onChange={e =>
                    change({
                      sort: e.target.value === "newest" ? null : e.target.value,
                      page: null,
                      report: null,
                      products: null,
                    })
                  }
                >
                  <option value="newest">{c.newest}</option>
                  <option value="oldest">{c.oldest}</option>
                </select>
              </label>
              {(selection.query ||
                selection.state !== "all" ||
                selection.sort !== "newest") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    change({
                      q: null,
                      state: null,
                      sort: null,
                      page: null,
                      report: null,
                      products: null,
                    })
                  }
                >
                  {c.clear}
                </Button>
              )}
            </form>
            <p className="sc-results" aria-live="polite">
              {c.matches}: {number(data.matched)}
            </p>
            {!data.rows.length ? (
              <div className="sc-empty">
                <p>{data.stats.total ? c.noResults : c.empty}</p>
              </div>
            ) : (
              <div className="cmp-grid">
                {data.rows.map(r => (
                  <article className="cmp-card" key={r.id}>
                    <div className="cmp-card-head">
                      <h2>{r.name}</h2>
                      <Badge variant="outline">{state(r.status)}</Badge>
                    </div>
                    <p className="sc-muted">
                      {r.url ? <bdi>{new URL(r.url).hostname}</bdi> : c.unknown}
                    </p>
                    <dl className="cmp-facts">
                      <div>
                        <dt>{c.overall}</dt>
                        <dd>
                          {r.scores.overall === null ? (
                            c.unknown
                          ) : (
                            <bdi>{number(r.scores.overall)} / 100</bdi>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{c.products}</dt>
                        <dd>{number(r.products)}</dd>
                      </div>
                    </dl>
                    <p className="sc-muted">{stamp(r.createdAt)}</p>
                    <div className="sc-record-actions">
                      <Button
                        variant="outline"
                        onClick={() => {
                          remember();
                          change({ report: r.id, products: null });
                        }}
                      >
                        {c.details}
                        <span className="sr-only"> · {r.name}</span>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {data.pages > 1 && (
              <nav className="sc-pagination" aria-label={c.title}>
                <Button
                  variant="outline"
                  disabled={data.currentPage <= 1 || query.isFetching}
                  onClick={() => change({ page: data.currentPage - 1 })}
                >
                  {c.previous}
                </Button>
                <span>
                  {c.page} {number(data.currentPage)} {c.of}{" "}
                  {number(data.pages)}
                </span>
                <Button
                  variant="outline"
                  disabled={data.currentPage >= data.pages || query.isFetching}
                  onClick={() => change({ page: data.currentPage + 1 })}
                >
                  {c.next}
                </Button>
              </nav>
            )}
          </section>
        </>
      )}
      {comparing && data && (
        <Dialog open onOpenChange={setComparing}>
          <DialogContent {...dialogProps}>
            <DialogHeader>
              <DialogTitle ref={dialogHeading} tabIndex={-1}>
                {cc.title}
              </DialogTitle>
              <DialogDescription>{cc.help}</DialogDescription>
            </DialogHeader>
            <CompetitorComparison actorId={actorId} merchantId={merchantId} />
          </DialogContent>
        </Dialog>
      )}
      <Dialog
        open={adding && !!data}
        onOpenChange={open => {
          if (!busy) setAdding(open);
        }}
      >
        <DialogContent {...dialogProps}>
          <DialogHeader>
            <DialogTitle ref={dialogHeading} tabIndex={-1}>
              {c.add}
            </DialogTitle>
            <DialogDescription>{c.addHelp}</DialogDescription>
          </DialogHeader>
          <form
            className="cmp-form"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              void submitAdd();
            }}
          >
            <label htmlFor="competitor-name">{c.name}</label>
            <input
              ref={nameField}
              id="competitor-name"
              maxLength={255}
              value={name}
              disabled={busy}
              aria-invalid={errors.name}
              aria-describedby={
                errors.name ? "competitor-name-error" : undefined
              }
              onChange={e => setName(e.target.value)}
            />
            {errors.name && (
              <p id="competitor-name-error" className="cmp-field-error">
                {c.nameError}
              </p>
            )}
            <label htmlFor="competitor-url">{c.url}</label>
            <input
              ref={urlField}
              id="competitor-url"
              type="url"
              dir="ltr"
              inputMode="url"
              maxLength={500}
              placeholder="https://example.com"
              value={url}
              disabled={busy}
              aria-invalid={errors.url}
              aria-describedby={errors.url ? "competitor-url-error" : undefined}
              onChange={e => setUrl(e.target.value)}
            />
            {errors.url && (
              <p id="competitor-url-error" className="cmp-field-error">
                {c.urlError}
              </p>
            )}
            {feedbackNode}
            {blocked && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || query.isFetching}
                onClick={async () => {
                  const result = await query.refetch();
                  if (!result.error) {
                    setBlocked(false);
                    setFailure("");
                  }
                }}
              >
                {c.refresh}
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                blocked ||
                !!attempt.id ||
                attempt.storageError ||
                !data?.canManage
              }
            >
              {busy ? c.busy : c.start}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected && !!data}
        onOpenChange={open => {
          if (!open && !busy) change({ report: null, products: null });
        }}
      >
        <DialogContent {...dialogProps}>
          <DialogHeader>
            <DialogTitle ref={dialogHeading} tabIndex={-1}>
              {detail?.report.name || c.details}
            </DialogTitle>
            <DialogDescription>{c.detailsHelp}</DialogDescription>
          </DialogHeader>
          {detailQuery.error ||
          (!detail && !detailQuery.isLoading && !detailQuery.isFetching) ? (
            <WorkspaceState
              inline
              kind={workspaceFailureKind(detailQuery.error)}
              title={c.detailFailed}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : !detail ? (
            <WorkspaceState inline kind="loading" />
          ) : (
            <>
              <div className="cmp-card-head">
                <Badge variant="outline">{state(detail.report.status)}</Badge>
                {detail.report.url && (
                  <a
                    className="cmp-link"
                    href={detail.report.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.visit}
                    <ExternalLink aria-hidden />
                  </a>
                )}
              </div>
              {detail.report.status !== "completed" && (
                <p className="sc-feedback">{c.partial}</p>
              )}
              <p className="sc-muted">{c.evidence}</p>
              <dl className="cmp-scores">
                {(
                  ["overall", "seo", "performance", "ux", "content"] as const
                ).map(key => (
                  <div key={key}>
                    <dt>{c[key]}</dt>
                    <dd>
                      {detail.report.scores[key] === null ? (
                        c.unknown
                      ) : (
                        <bdi>{number(detail.report.scores[key]!)} / 100</bdi>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <dl className="cmp-facts">
                <div>
                  <dt>{c.created}</dt>
                  <dd>{stamp(detail.report.createdAt)}</dd>
                </div>
                <div>
                  <dt>{c.analyzed}</dt>
                  <dd>{stamp(detail.report.analyzedAt)}</dd>
                </div>
                {detail.report.industry && (
                  <div>
                    <dt>{c.industry}</dt>
                    <dd>{detail.report.industry}</dd>
                  </div>
                )}
              </dl>
              <details className="cmp-notes cmp-pricing-section">
                <summary>{c.prices}</summary>
                <p className="sc-muted">{c.priceHelp}</p>
                {detail.pricing.groups.map(g => (
                  <div className="cmp-currency" key={g.currency}>
                    <strong>
                      <bdi>{g.currency}</bdi> · {number(g.count)} {c.products}
                    </strong>
                    <dl className="cmp-facts">
                      {(["minimum", "maximum", "average"] as const).map(key => (
                        <div key={key}>
                          <dt>{c[key]}</dt>
                          <dd>
                            <bdi>
                              {Number(g[key]).toLocaleString(locale, {
                                maximumFractionDigits: 2,
                              })}{" "}
                              {g.currency}
                            </bdi>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <p className="sc-muted">
                  {c.unverified}: {number(detail.pricing.unverifiedCount)}
                </p>
              </details>
              <details
                className="cmp-notes cmp-product-section"
                open={productsExpanded}
                onToggle={e => setProductsExpanded(e.currentTarget.open)}
              >
                <summary>
                  {c.products} · {number(detail.report.products)}
                </summary>
                <p className="sc-muted">
                  {c.recorded}:{" "}
                  {detail.report.recordedProductCount === null
                    ? c.unknown
                    : number(detail.report.recordedProductCount)}
                  . {c.recordedHelp}
                </p>
                {detail.report.excludedProducts > 0 && (
                  <p role="status" className="sc-feedback">
                    {c.excluded}: {number(detail.report.excludedProducts)}
                  </p>
                )}
                {!detail.products.length ? (
                  <p>{c.noProducts}</p>
                ) : (
                  <ul className="cmp-products">
                    {detail.products.map(p => (
                      <li key={p.id}>
                        <div className="cmp-card-head">
                          <h4>{p.name}</h4>
                          <bdi>
                            {p.price !== null
                              ? `${Number(p.price).toLocaleString(locale, { maximumFractionDigits: 2 })} ${p.currency}`
                              : c.unknown}
                          </bdi>
                        </div>
                        {p.category && <p className="sc-muted">{p.category}</p>}
                        {p.description && (
                          <p className="cmp-text">{p.description}</p>
                        )}
                        {p.matchedProduct && (
                          <p className="sc-muted">
                            {c.matched}: {p.matchedProduct.name}
                          </p>
                        )}
                        <div className="sc-actions">
                          {p.url && (
                            <a
                              className="cmp-link"
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.productLink}
                              <ExternalLink aria-hidden />
                            </a>
                          )}
                          {p.imageUrl && (
                            <a
                              className="cmp-link"
                              href={p.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.imageLink}
                              <ExternalLink aria-hidden />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {detail.productPages > 1 && (
                  <nav className="sc-pagination" aria-label={c.products}>
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        detailQuery.isFetching ||
                        detail.productPage <= 1
                      }
                      onClick={() =>
                        change({ products: detail.productPage - 1 })
                      }
                    >
                      {c.previous}
                    </Button>
                    <span>
                      {c.page} {number(detail.productPage)} {c.of}{" "}
                      {number(detail.productPages)}
                    </span>
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        detailQuery.isFetching ||
                        detail.productPage >= detail.productPages
                      }
                      onClick={() =>
                        change({ products: detail.productPage + 1 })
                      }
                    >
                      {c.next}
                    </Button>
                  </nav>
                )}
              </details>
              {(["strengths", "weaknesses", "opportunities"] as const).map(
                key => (
                  <details className="cmp-notes" key={key}>
                    <summary>
                      {c[key]} · {number(detail.notes[key].items.length)}
                    </summary>
                    {detail.notes[key].invalid ? (
                      <p>{c.invalidNotes}</p>
                    ) : !detail.notes[key].items.length ? (
                      <p className="sc-muted">{c.noNotes}</p>
                    ) : (
                      <ul>
                        {detail.notes[key].items.map((item, i) => (
                          <li className="cmp-text" key={i}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                )
              )}
              {feedbackNode}
              <div className="cmp-footer">
                <Button
                  variant="outline"
                  disabled={busy || detailQuery.isFetching}
                  onClick={async () => {
                    setAck(false);
                    const result = await detailQuery.refetch();
                    if (!result.error) {
                      setFailure("");
                      setBlocked(false);
                    }
                  }}
                >
                  <RefreshCw aria-hidden />
                  {c.refresh}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => change({ report: null, products: null })}
                >
                  {c.close}
                </Button>
              </div>
              {detail.canManage && (
                <details className="cmp-notes cmp-remove">
                  <summary>{c.remove}</summary>
                  {!["completed", "failed"].includes(detail.report.status) ||
                  detail.report.excludedProducts > 0 ? (
                    <p>{c.deleteBlocked}</p>
                  ) : (
                    <div className="cmp-form">
                      <p>{c.removeHelp}</p>
                      <label className="cmp-check">
                        <input
                          type="checkbox"
                          checked={ack}
                          disabled={busy || blocked}
                          onChange={e => setAck(e.target.checked)}
                        />
                        <span>{c.acknowledge}</span>
                      </label>
                      <Button
                        variant="destructive"
                        disabled={
                          busy || blocked || !ack || detailQuery.isFetching
                        }
                        onClick={() => void submitDelete()}
                      >
                        {busy ? c.busy : c.confirmDelete}
                      </Button>
                    </div>
                  )}
                </details>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
