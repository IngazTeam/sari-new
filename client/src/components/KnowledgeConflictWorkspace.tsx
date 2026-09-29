import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./ui/alert-dialog";
export function KnowledgeConflictWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="conflicts">
      {key => <ConflictWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function ConflictWorkspace() {
  const { t } = useTranslation(),
    utils = trpc.useUtils();
  const c = {
    teachingTitle: t("merchantUx.knowledgeConflicts.teachingTitle"),
    teachingHelp: t("merchantUx.knowledgeConflicts.teachingHelp"),
    teachingAnalyze: t("merchantUx.knowledgeConflicts.teachingAnalyze"),
    teachingAnalyzing: t("merchantUx.knowledgeConflicts.teachingAnalyzing"),
    teachingError: t("merchantUx.knowledgeConflicts.teachingError"),
    teachingUnavailable: t("merchantUx.knowledgeConflicts.teachingUnavailable"),
    teachingPending: t("merchantUx.knowledgeConflicts.teachingPending"),
    teachingReady: t("merchantUx.knowledgeConflicts.teachingReady"),
    teachingBlocked: t("merchantUx.knowledgeConflicts.teachingBlocked"),
    teachingCompatible: t("merchantUx.knowledgeConflicts.teachingCompatible"),
    teachingReplace: t("merchantUx.knowledgeConflicts.teachingReplace"),
    teachingReview: t("merchantUx.knowledgeConflicts.teachingReview"),
    teachingUncompared: t("merchantUx.knowledgeConflicts.teachingUncompared"),
    teachingApprove: t("merchantUx.knowledgeConflicts.teachingApprove"),
    indexed: t("merchantUx.knowledgeConflicts.indexed"),
    indexPending: t("merchantUx.knowledgeConflicts.indexPending"),
    title: t("merchantUx.knowledgeConflicts.title"),
    description: t("merchantUx.knowledgeConflicts.description"),
    loading: t("merchantUx.knowledgeConflicts.loading"),
    loadError: t("merchantUx.knowledgeConflicts.loadError"),
    retry: t("merchantUx.knowledgeConflicts.retry"),
    empty: t("merchantUx.knowledgeConflicts.empty"),
    review: t("merchantUx.knowledgeConflicts.review"),
    previous: t("merchantUx.knowledgeConflicts.previous"),
    next: t("merchantUx.knowledgeConflicts.next"),
    readOnly: t("merchantUx.knowledgeConflicts.readOnly"),
    reviewTitle: t("merchantUx.knowledgeConflicts.reviewTitle"),
    proposal: t("merchantUx.knowledgeConflicts.proposal"),
    current: t("merchantUx.knowledgeConflicts.current"),
    previousText: t("merchantUx.knowledgeConflicts.previousText"),
    reason: t("merchantUx.knowledgeConflicts.reason"),
    source: t("merchantUx.knowledgeConflicts.source"),
    linked: t("merchantUx.knowledgeConflicts.linked"),
    unlinked: t("merchantUx.knowledgeConflicts.unlinked"),
    unavailable: t("merchantUx.knowledgeConflicts.unavailable"),
    blocked: t("merchantUx.knowledgeConflicts.blocked"),
    approve: t("merchantUx.knowledgeConflicts.approve"),
    replace: t("merchantUx.knowledgeConflicts.replace"),
    reject: t("merchantUx.knowledgeConflicts.reject"),
    rejectHelp: t("merchantUx.knowledgeConflicts.rejectHelp"),
    ack: t("merchantUx.knowledgeConflicts.ack"),
    save: t("merchantUx.knowledgeConflicts.save"),
    saving: t("merchantUx.knowledgeConflicts.saving"),
    close: t("merchantUx.knowledgeConflicts.close"),
    choose: t("merchantUx.knowledgeConflicts.choose"),
    reviewError: t("merchantUx.knowledgeConflicts.reviewError"),
    changed: t("merchantUx.knowledgeConflicts.changed"),
    missing: t("merchantUx.knowledgeConflicts.missing"),
    unknown: t("merchantUx.knowledgeConflicts.unknown"),
    denied: t("merchantUx.knowledgeConflicts.denied"),
    saved: t("merchantUx.knowledgeConflicts.saved"),
    reloadReview: t("merchantUx.knowledgeConflicts.reloadReview"),
    retained: t("merchantUx.knowledgeConflicts.retained"),
    retainedHelp: t("merchantUx.knowledgeConflicts.retainedHelp"),
    keep: t("merchantUx.knowledgeConflicts.keep"),
    discard: t("merchantUx.knowledgeConflicts.discard"),
    active: t("merchantUx.knowledgeConflicts.active"),
    inactive: t("merchantUx.knowledgeConflicts.inactive"),
    indexing: t("merchantUx.knowledgeConflicts.indexing"),
  };
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    [action, setAction] = useState<"approve" | "reject" | "">(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [discard, setDiscard] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [approvedRevision, setApprovedRevision] = useState("");
  const reviewPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected !== null) reviewPanel.current?.focus();
  }, [selected]);
  const saving = useRef(false),
    list = trpc.sariBrain.conflictWorkspace.useQuery(
      { page },
      { retry: false }
    );
  const review = trpc.sariBrain.conflictReview.useQuery(
    { sectionId: selected || 1 },
    { enabled: selected !== null, retry: false }
  );
  const mutation = trpc.sariBrain.approveSection.useMutation();
  const compare = trpc.sariBrain.analyzeTeachingPolicy.useMutation();
  const detail =
    selected && review.data?.section.id === selected && !review.isError
      ? review.data
      : null;
  const canManage = !!list.data?.canManage && !list.isError;
  const analyze = async () => {
    if (
      saving.current ||
      !canManage ||
      !detail?.teaching?.available ||
      !detail.teaching.basisHash ||
      review.isFetching
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    setAction("");
    setAck(false);
    setUncertain(false);
    try {
      await compare.mutateAsync({
        sectionId: detail.section.id,
        expectedBasisHash: detail.teaching.basisHash,
      });
      await review.refetch();
    } catch {
      setError(c.teachingError);
      setUncertain(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    setSelected(null);
    setAction("");
    setAck(false);
    setDiscard(false);
    setError("");
    setUncertain(false);
  };
  const reload = () => {
    setAck(false);
    setAction("");
    setError("");
    setUncertain(false);
    void review.refetch();
  };
  const save = async () => {
    if (
      saving.current ||
      !detail ||
      !canManage ||
      !ack ||
      approvedRevision !== detail.revision ||
      !action ||
      uncertain ||
      review.isFetching ||
      (action === "approve" && !detail.canApprove)
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutation.mutateAsync({
        sectionId: detail.section.id,
        action,
        expectedRevision: detail.revision,
        acknowledged: true,
      });
      close();
      setMessage(
        c.saved +
          (result.indexing === "ready"
            ? " " + c.indexed
            : result.indexing === "unconfirmed"
              ? " " + c.indexPending
              : "")
      );
      void list.refetch();
      void utils.sariBrain.getKnowledgeSections.invalidate();
      void utils.sariBrain.getPendingReviews.invalidate();
      void utils.sariBrain.getActivityLog.invalidate();
      void utils.sariBrain.getChangelog.invalidate();
      void utils.sariBrain.getHealthScore.invalidate();
    } catch (e) {
      const code = (e as { data?: { code?: string } }).data?.code;
      setError(
        code === "CONFLICT"
          ? c.changed
          : code === "NOT_FOUND"
            ? c.missing
            : code === "FORBIDDEN" ||
                code === "PRECONDITION_FAILED" ||
                code === "BAD_REQUEST"
              ? c.denied
              : c.unknown
      );
      setAck(false);
      setUncertain(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Card className="min-w-0" data-conflict-workspace>
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription className="leading-7">{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 min-w-0">
        {message && <p role="status">{message}</p>}
        {list.isError ? (
          <div role="alert">
            <p>{c.loadError}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              {c.retry}
            </Button>
          </div>
        ) : list.isLoading ? (
          <p role="status">{c.loading}</p>
        ) : (
          <>
            {!canManage && <p>{c.readOnly}</p>}
            <Button
              variant="outline"
              disabled={busy || list.isFetching}
              onClick={() => void list.refetch()}
            >
              {c.retry}
            </Button>
            <p role="status">
              {t("merchantUx.knowledgeConflicts.count", {
                count: list.data?.total || 0,
                page: list.data?.page || 1,
                pages: list.data?.totalPages || 1,
              })}
            </p>
            <div hidden={selected !== null} className="space-y-4">
              {!list.data?.items.length ? (
                <p>{c.empty}</p>
              ) : (
                <ul className="space-y-3">
                  {list.data.items.map(row => (
                    <li
                      key={row.id}
                      className="rounded-xl border p-4 space-y-2"
                    >
                      <h3
                        className="font-semibold [overflow-wrap:anywhere]"
                        dir="auto"
                      >
                        {row.title}
                      </h3>
                      <Button
                        variant="outline"
                        disabled={busy || selected !== null}
                        onClick={() => {
                          setSelected(row.id);
                          setAction("");
                          setAck(false);
                          setError("");
                          setMessage("");
                          setUncertain(false);
                        }}
                      >
                        {c.review}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={
                    busy || list.isFetching || (list.data?.page || 1) <= 1
                  }
                  onClick={() => setPage(list.data!.page - 1)}
                >
                  {c.previous}
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    list.isFetching ||
                    (list.data?.page || 1) >= (list.data?.totalPages || 1)
                  }
                  onClick={() => setPage(list.data!.page + 1)}
                >
                  {c.next}
                </Button>
              </div>
            </div>
          </>
        )}
        {selected !== null && (
          <section
            className="space-y-4 rounded-xl border p-4 min-w-0"
            data-conflict-review
            ref={reviewPanel}
            tabIndex={-1}
            aria-label={c.reviewTitle}
          >
            <h3 className="font-semibold">{c.reviewTitle}</h3>
            {review.isError ? (
              <p role="alert">{c.reviewError}</p>
            ) : !detail ? (
              <p role="status">{c.loading}</p>
            ) : (
              <>
                {!detail.teaching && (
                  <p className="leading-7">
                    {detail.link === "verified"
                      ? c.linked
                      : detail.link === "unavailable"
                        ? c.unavailable
                        : c.unlinked}
                  </p>
                )}
                {detail.teaching && (
                  <section
                    className="space-y-3 min-w-0"
                    aria-label={c.teachingTitle}
                  >
                    <h4 className="font-semibold">{c.teachingTitle}</h4>
                    <p className="text-sm leading-7">{c.teachingHelp}</p>
                    <p role="status" className="text-sm leading-7">
                      {!detail.teaching.available
                        ? c.teachingUnavailable
                        : !detail.teaching.analyzed
                          ? c.teachingPending
                          : detail.teaching.canApprove
                            ? c.teachingReady
                            : c.teachingBlocked}
                    </p>
                    {detail.teaching.reason && (
                      <p
                        dir="auto"
                        className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm"
                      >
                        {detail.teaching.reason}
                      </p>
                    )}
                    {canManage && (
                      <Button
                        className="min-h-11 whitespace-normal"
                        variant="outline"
                        disabled={
                          busy ||
                          uncertain ||
                          review.isFetching ||
                          !detail.teaching.available
                        }
                        onClick={() => void analyze()}
                      >
                        {compare.isPending
                          ? c.teachingAnalyzing
                          : c.teachingAnalyze}
                      </Button>
                    )}
                    <details>
                      <summary className="min-h-11 cursor-pointer">
                        {t("merchantUx.knowledgeConflicts.teachingSources", {
                          count: detail.teaching.candidates.length,
                        })}
                      </summary>
                      <div className="grid gap-3 md:grid-cols-2">
                        {detail.teaching.candidates.map(source => (
                          <article
                            key={source.key}
                            className="border rounded-lg p-3 min-w-0 space-y-2"
                          >
                            <h5
                              dir="auto"
                              className="font-semibold [overflow-wrap:anywhere]"
                            >
                              {source.title}
                            </h5>
                            <p className="font-medium text-sm">
                              {source.relation === "replace"
                                ? c.teachingReplace
                                : source.relation === "review"
                                  ? c.teachingReview
                                  : source.relation === "compatible"
                                    ? c.teachingCompatible
                                    : c.teachingUncompared}
                            </p>
                            <p
                              dir="auto"
                              className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-7"
                            >
                              {source.content}
                            </p>
                            {source.reason && (
                              <p
                                dir="auto"
                                className="[overflow-wrap:anywhere] text-sm"
                              >
                                {source.reason}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    </details>
                  </section>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { label: c.proposal, row: detail.section },
                    { label: c.current, row: detail.current },
                  ].map(
                    ({ label, row }) =>
                      row && (
                        <article
                          className="min-w-0 rounded-xl bg-muted/40 p-3 space-y-2"
                          key={label}
                        >
                          <h4 className="font-semibold">{label}</h4>
                          <p className="[overflow-wrap:anywhere]" dir="auto">
                            {row.title}
                          </p>
                          <p
                            className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-7 text-sm"
                            dir="auto"
                          >
                            {row.content}
                          </p>
                          <p className="text-sm">
                            {row.useInBot ? c.active : c.inactive}
                          </p>
                          {row.sourceUrl && (
                            <p
                              className="text-xs [overflow-wrap:anywhere]"
                              dir="auto"
                            >
                              {c.source}: {row.sourceUrl}
                            </p>
                          )}
                        </article>
                      )
                  )}
                </div>
                {detail.reason && (
                  <p className="text-sm leading-7 [overflow-wrap:anywhere]">
                    {c.reason}: {detail.reason}
                  </p>
                )}
                {detail.previousText && (
                  <details>
                    <summary>{c.previousText}</summary>
                    <p
                      className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]"
                      dir="auto"
                    >
                      {detail.previousText}
                    </p>
                  </details>
                )}
                <p className="text-sm leading-7">{c.indexing}</p>
                {!detail.canApprove && <p role="status">{c.blocked}</p>}
                {canManage && (
                  <fieldset
                    className="space-y-3"
                    disabled={busy || uncertain || review.isFetching}
                  >
                    <legend className="mb-3 font-semibold">{c.choose}</legend>
                    <label className="flex gap-3 items-start min-h-11">
                      <input
                        type="radio"
                        className="mt-1 size-5 shrink-0"
                        name="conflict-decision"
                        checked={action === "approve"}
                        disabled={!detail.canApprove}
                        onChange={() => {
                          setAction("approve");
                          setAck(false);
                        }}
                      />
                      <span>
                        {detail.teaching
                          ? c.teachingApprove
                          : detail.link === "verified"
                            ? c.replace
                            : c.approve}
                      </span>
                    </label>
                    <label className="flex gap-3 items-start min-h-11">
                      <input
                        type="radio"
                        className="mt-1 size-5 shrink-0"
                        name="conflict-decision"
                        checked={action === "reject"}
                        onChange={() => {
                          setAction("reject");
                          setAck(false);
                        }}
                      />
                      <span>{c.reject}</span>
                    </label>
                    <p className="text-sm leading-7">{c.rejectHelp}</p>
                    <label className="flex items-start gap-3 border rounded-xl p-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0"
                        checked={ack && approvedRevision === detail.revision}
                        onChange={e => {
                          setAck(e.target.checked);
                          setApprovedRevision(detail.revision);
                        }}
                      />
                      <span>{c.ack}</span>
                    </label>
                  </fieldset>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="leading-7">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className="whitespace-normal"
                disabled={
                  !detail ||
                  !canManage ||
                  !action ||
                  !ack ||
                  approvedRevision !== detail.revision ||
                  busy ||
                  uncertain ||
                  review.isFetching ||
                  (action === "approve" && !detail.canApprove)
                }
                onClick={() => void save()}
              >
                {busy ? c.saving : c.save}
              </Button>
              <Button
                variant="outline"
                disabled={busy || review.isFetching}
                onClick={reload}
              >
                {c.reloadReview}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => (action || ack ? setDiscard(true) : close())}
              >
                {c.close}
              </Button>
            </div>
          </section>
        )}
        <AlertDialog open={discard} onOpenChange={setDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{c.retained}</AlertDialogTitle>
              <AlertDialogDescription>
                {uncertain ? c.unknown : c.retainedHelp}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setDiscard(false)}>
                {c.keep}
              </Button>
              <Button onClick={close}>{c.discard}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
