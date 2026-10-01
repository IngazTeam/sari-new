import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { faqCreateInput, type FaqItem } from "@shared/knowledge-faq";
import {
  cacheKnowledgeDraft,
  discardKnowledgeDraft,
  knowledgeCacheEpoch,
  readKnowledgeDraft,
} from "@/lib/knowledge-workspace-cache";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./ui/alert-dialog";

type Draft = {
  question: string;
  answer: string;
  category: string;
  isActive: boolean;
  useInBot: boolean;
  id?: number;
  revision?: string;
  requestId: string;
  baseline: string;
  uncertain: boolean;
};
const signature = (
  d: Pick<Draft, "question" | "answer" | "category" | "isActive" | "useInBot">
) => JSON.stringify([d.question, d.answer, d.category, d.isActive, d.useInBot]);
export function KnowledgeFaqWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="faq">
      {key => <FaqWorkspace key={key} cacheKey={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function FaqWorkspace({ cacheKey }: { cacheKey: string }) {
  const { t } = useTranslation(),
    id = useId(),
    utils = trpc.useUtils(),
    busyRef = useRef(false),
    [epoch] = useState(knowledgeCacheEpoch);
  const labels = {
    cancelDelete: t("merchantUx.knowledgeFaq.cancelDelete"),
    deleteConflict: t("merchantUx.knowledgeFaq.deleteConflict"),
    deleteUnknown: t("merchantUx.knowledgeFaq.deleteUnknown"),
    uncertainDiscard: t("merchantUx.knowledgeFaq.uncertainDiscard"),
    title: t("merchantUx.knowledgeFaq.title"),
    description: t("merchantUx.knowledgeFaq.description"),
    add: t("merchantUx.knowledgeFaq.add"),
    edit: t("merchantUx.knowledgeFaq.edit"),
    remove: t("merchantUx.knowledgeFaq.remove"),
    search: t("merchantUx.knowledgeFaq.search"),
    filter: t("merchantUx.knowledgeFaq.filter"),
    all: t("merchantUx.knowledgeFaq.all"),
    enabled: t("merchantUx.knowledgeFaq.enabled"),
    paused: t("merchantUx.knowledgeFaq.paused"),
    searchAction: t("merchantUx.knowledgeFaq.searchAction"),
    question: t("merchantUx.knowledgeFaq.question"),
    answer: t("merchantUx.knowledgeFaq.answer"),
    category: t("merchantUx.knowledgeFaq.category"),
    available: t("merchantUx.knowledgeFaq.available"),
    useInBot: t("merchantUx.knowledgeFaq.useInBot"),
    approve: t("merchantUx.knowledgeFaq.approve"),
    saveActive: t("merchantUx.knowledgeFaq.saveActive"),
    saveDraft: t("merchantUx.knowledgeFaq.saveDraft"),
    saving: t("merchantUx.knowledgeFaq.saving"),
    cancel: t("merchantUx.knowledgeFaq.cancel"),
    editTitle: t("merchantUx.knowledgeFaq.editTitle"),
    newTitle: t("merchantUx.knowledgeFaq.newTitle"),
    limits: t("merchantUx.knowledgeFaq.limits"),
    invalid: t("merchantUx.knowledgeFaq.invalid"),
    empty: t("merchantUx.knowledgeFaq.empty"),
    noMatch: t("merchantUx.knowledgeFaq.noMatch"),
    loadError: t("merchantUx.knowledgeFaq.loadError"),
    retry: t("merchantUx.knowledgeFaq.retry"),
    loading: t("merchantUx.knowledgeFaq.loading"),
    readOnly: t("merchantUx.knowledgeFaq.readOnly"),
    previous: t("merchantUx.knowledgeFaq.previous"),
    next: t("merchantUx.knowledgeFaq.next"),
    saved: t("merchantUx.knowledgeFaq.saved"),
    deleted: t("merchantUx.knowledgeFaq.deleted"),
    conflict: t("merchantUx.knowledgeFaq.conflict"),
    failed: t("merchantUx.knowledgeFaq.failed"),
    missing: t("merchantUx.knowledgeFaq.missing"),
    unknown: t("merchantUx.knowledgeFaq.unknown"),
    retrySame: t("merchantUx.knowledgeFaq.retrySame"),
    draft: t("merchantUx.knowledgeFaq.draft"),
    discardTitle: t("merchantUx.knowledgeFaq.discardTitle"),
    discardDescription: t("merchantUx.knowledgeFaq.discardDescription"),
    discard: t("merchantUx.knowledgeFaq.discard"),
    keep: t("merchantUx.knowledgeFaq.keep"),
    deleteTitle: t("merchantUx.knowledgeFaq.deleteTitle"),
    deleteDescription: t("merchantUx.knowledgeFaq.deleteDescription"),
    confirmDelete: t("merchantUx.knowledgeFaq.confirmDelete"),
    sourcePage: t("merchantUx.knowledgeFaq.sourcePage"),
    sourceApi: t("merchantUx.knowledgeFaq.sourceApi"),
    sourceManual: t("merchantUx.knowledgeFaq.sourceManual"),
    sourceHint: t("merchantUx.knowledgeFaq.sourceHint"),
  };
  const copy = (key: keyof typeof labels) => labels[key];
  const [draft, setDraft] = useState<Draft | null>(() => {
    const saved = readKnowledgeDraft(cacheKey);
    return saved?.faq
      ? { ...saved.faq, question: saved.name, answer: saved.content }
      : null;
  });
  const [search, setSearch] = useState(""),
    [querySearch, setQuerySearch] = useState(""),
    [status, setStatus] = useState<"all" | "enabled" | "paused">("all"),
    [page, setPage] = useState(1);
  const query = trpc.sariBrain.faqWorkspace.useQuery(
    { search: querySearch, status, page },
    { retry: false }
  );
  const create = trpc.sariBrain.createFaq.useMutation(),
    update = trpc.sariBrain.updateFaq.useMutation(),
    remove = trpc.sariBrain.deleteFaq.useMutation();
  const [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState<FaqItem | null>(null);
  const dirty =
      !!draft && (signature(draft) !== draft.baseline || draft.uncertain),
    canManage = !!query.data?.canManage && !query.isError;
  useEffect(() => {
    if (draft && dirty)
      cacheKnowledgeDraft(
        cacheKey,
        {
          name: draft.question,
          content: draft.answer,
          type: "custom",
          faq: {
            id: draft.id,
            revision: draft.revision,
            category: draft.category,
            isActive: draft.isActive,
            useInBot: draft.useInBot,
            requestId: draft.requestId,
            baseline: draft.baseline,
            uncertain: draft.uncertain,
          },
        },
        epoch
      );
    else discardKnowledgeDraft(cacheKey);
  }, [draft, dirty, cacheKey, epoch]);
  const refresh = () => {
    void query.refetch();
    void utils.sariBrain.getSources.invalidate();
    void utils.sariBrain.getFaqs.invalidate();
    void utils.sariBrain.getActivityLog.invalidate();
    void utils.sariBrain.getHealthScore.invalidate();
  };
  const start = (row?: FaqItem) => {
    if (busyRef.current || draft) return;
    const values = {
      question: row?.question || "",
      answer: row?.answer || "",
      category: row?.category || "",
      isActive: row?.isActive ?? true,
      useInBot: row?.useInBot ?? false,
    };
    setDraft({
      ...values,
      id: row?.id,
      revision: row?.revision,
      requestId: crypto.randomUUID(),
      baseline: signature(values),
      uncertain: false,
    });
    setReviewed(false);
    setError("");
    setMessage("");
  };
  const change = (patch: Partial<Draft>) => {
    if (busyRef.current || draft?.uncertain) return;
    setDraft(d => (d ? { ...d, ...patch } : d));
    setReviewed(false);
    setError("");
  };
  const close = () => {
    setDraft(null);
    setReviewed(false);
    setDiscard(false);
    discardKnowledgeDraft(cacheKey);
    setError("");
  };
  const failure = (err: unknown) => {
    const code = (err as { data?: { code?: string } }).data?.code;
    return code === "CONFLICT"
      ? "conflict"
      : code === "NOT_FOUND"
        ? "missing"
        : ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED"].includes(code || "")
          ? "failed"
          : "unknown";
  };
  const save = async () => {
    if (
      !draft ||
      busyRef.current ||
      !canManage ||
      (draft.isActive && draft.useInBot && !reviewed)
    )
      return;
    const parsed = faqCreateInput.safeParse(draft);
    if (!parsed.success) {
      setError(copy("invalid"));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (draft.id)
        await update.mutateAsync({
          id: draft.id,
          expectedRevision: draft.revision,
          ...parsed.data,
        });
      else await create.mutateAsync(parsed.data);
      close();
      setMessage(copy("saved"));
      refresh();
    } catch (err) {
      const reason = failure(err);
      setError(copy(reason));
      if (reason === "unknown")
        setDraft(d => (d ? { ...d, uncertain: true } : d));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const deleteSelected = async () => {
    if (!deleting || busyRef.current || !canManage) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await remove.mutateAsync({
        id: deleting.id,
        expectedRevision: deleting.revision,
      });
      setDeleting(null);
      setMessage(copy("deleted"));
      refresh();
    } catch (err) {
      const reason = failure(err);
      setError(
        copy(
          reason === "unknown"
            ? "deleteUnknown"
            : reason === "conflict"
              ? "deleteConflict"
              : reason
        )
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const formDisabled = busy || !canManage || !!draft?.uncertain;
  return (
    <Card className="min-w-0" data-faq-workspace>
      <CardHeader>
        <CardTitle>{copy("title")}</CardTitle>
        <CardDescription className="leading-7">
          {copy("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 min-w-0">
        {message && <p role="status">{message}</p>}
        {error && !deleting && (
          <p role="alert" className="text-sm leading-7">
            {error}
          </p>
        )}
        {query.isError ? (
          <div role="alert" className="space-y-3">
            <p>{copy("loadError")}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {copy("retry")}
            </Button>
          </div>
        ) : query.isLoading ? (
          <p role="status">{copy("loading")}</p>
        ) : (
          <>
            {!canManage && <p>{copy("readOnly")}</p>}
            <form
              className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              onSubmit={e => {
                e.preventDefault();
                setQuerySearch(search);
                setPage(1);
              }}
            >
              <label
                className="block min-w-0 text-sm space-y-2"
                htmlFor={id + "search"}
              >
                {copy("search")}
                <Input
                  id={id + "search"}
                  value={search}
                  maxLength={100}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <label
                className="block min-w-0 text-sm space-y-2"
                htmlFor={id + "filter"}
              >
                {copy("filter")}
                <select
                  className="block min-h-11 w-full max-w-full rounded-xl border bg-background p-2"
                  id={id + "filter"}
                  value={status}
                  onChange={e => {
                    setStatus(e.target.value as typeof status);
                    setPage(1);
                  }}
                >
                  {(["all", "enabled", "paused"] as const).map(v => (
                    <option value={v} key={v}>
                      {copy(v)}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline">{copy("searchAction")}</Button>
            </form>
            {canManage && (
              <Button disabled={busy || !!draft} onClick={() => start()}>
                {copy("add")}
              </Button>
            )}
          </>
        )}
        {draft && (
          <section
            className="space-y-4 rounded-xl border p-4 min-w-0"
            data-faq-editor
          >
            <h3 className="font-semibold">
              {copy(draft.id ? "editTitle" : "newTitle")}
            </h3>
            <p className="text-sm leading-7">{copy("draft")}</p>
            <p className="text-sm leading-7 text-muted-foreground">
              {copy("limits")}
            </p>
            <label className="block space-y-2" htmlFor={id + "question"}>
              {copy("question")}
              <Textarea
                id={id + "question"}
                value={draft.question}
                disabled={formDisabled}
                maxLength={500}
                dir="auto"
                onChange={e => change({ question: e.target.value })}
              />
            </label>
            <label className="block space-y-2" htmlFor={id + "answer"}>
              {copy("answer")}
              <Textarea
                id={id + "answer"}
                value={draft.answer}
                disabled={formDisabled}
                maxLength={2000}
                rows={6}
                dir="auto"
                onChange={e => change({ answer: e.target.value })}
              />
            </label>
            <label className="block space-y-2" htmlFor={id + "category"}>
              {copy("category")}
              <Input
                id={id + "category"}
                value={draft.category}
                disabled={formDisabled}
                maxLength={100}
                dir="auto"
                onChange={e => change({ category: e.target.value })}
              />
            </label>
            <label className="flex gap-3 items-start min-h-11">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={draft.isActive}
                disabled={formDisabled}
                onChange={e => change({ isActive: e.target.checked })}
              />
              <span>{copy("available")}</span>
            </label>
            <label className="flex gap-3 items-start min-h-11">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={draft.useInBot}
                disabled={formDisabled}
                onChange={e => change({ useInBot: e.target.checked })}
              />
              <span>{copy("useInBot")}</span>
            </label>
            {draft.isActive && draft.useInBot && (
              <label className="flex gap-3 items-start rounded-xl border p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={reviewed}
                  disabled={busy || !canManage}
                  onChange={e => setReviewed(e.target.checked)}
                />
                <span>{copy("approve")}</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className="whitespace-normal"
                disabled={
                  busy ||
                  !canManage ||
                  (draft.isActive && draft.useInBot && !reviewed)
                }
                onClick={() => void save()}
              >
                {copy(
                  busy
                    ? "saving"
                    : draft.uncertain
                      ? "retrySame"
                      : draft.isActive && draft.useInBot
                        ? "saveActive"
                        : "saveDraft"
                )}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => (dirty ? setDiscard(true) : close())}
              >
                {copy("cancel")}
              </Button>
            </div>
          </section>
        )}
        {!query.isError && !query.isLoading && query.data && (
          <>
            <p role="status" className="text-sm">
              {t("merchantUx.knowledgeFaq.count", {
                count: query.data.total,
                page: query.data.page,
                pages: query.data.totalPages,
              })}
            </p>
            {!query.data.items.length ? (
              <p>
                {copy(querySearch || status !== "all" ? "noMatch" : "empty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {query.data.items.map(row => (
                  <li
                    key={row.id}
                    className="min-w-0 rounded-xl border p-4 space-y-3"
                    data-faq-row
                  >
                    <h3
                      className="font-semibold break-words [overflow-wrap:anywhere]"
                      dir="auto"
                    >
                      {row.question}
                    </h3>
                    <p
                      className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7"
                      dir="auto"
                    >
                      {row.answer}
                    </p>
                    <p className="text-sm">
                      {copy(
                        row.isActive && row.useInBot ? "enabled" : "paused"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      {row.category} ·{" "}
                      {copy(
                        row.syncSource === "api"
                          ? "sourceApi"
                          : row.pageId
                            ? "sourcePage"
                            : "sourceManual"
                      )}
                    </p>
                    {(row.pageId || row.syncSource === "api") && (
                      <p className="text-xs leading-6">{copy("sourceHint")}</p>
                    )}
                    {canManage && (
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          disabled={busy || !!draft}
                          onClick={() => start(row)}
                          aria-label={`${copy("edit")}: ${row.question}`}
                        >
                          {copy("edit")}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || !!draft}
                          onClick={() => {
                            setDeleting(row);
                            setError("");
                          }}
                          aria-label={`${copy("remove")}: ${row.question}`}
                        >
                          {copy("remove")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={query.isFetching || query.data.page <= 1}
                onClick={() => setPage(query.data!.page - 1)}
              >
                {copy("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  query.isFetching || query.data.page >= query.data.totalPages
                }
                onClick={() => setPage(query.data!.page + 1)}
              >
                {copy("next")}
              </Button>
            </div>
          </>
        )}
        <AlertDialog
          open={discard}
          onOpenChange={open => !busy && setDiscard(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy("discardTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy(
                  draft?.uncertain ? "uncertainDiscard" : "discardDescription"
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setDiscard(false)}>
                {copy("keep")}
              </Button>
              <Button onClick={close}>{copy("discard")}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={!!deleting}
          onOpenChange={open => !open && !busy && setDeleting(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy("deleteDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="break-words [overflow-wrap:anywhere]">
              {deleting?.question}
            </p>
            {error && <p role="alert">{error}</p>}
            <AlertDialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                {copy("cancelDelete")}
              </Button>
              <Button
                variant="destructive"
                disabled={busy || !canManage}
                onClick={() => void deleteSelected()}
              >
                {copy(busy ? "saving" : "confirmDelete")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
