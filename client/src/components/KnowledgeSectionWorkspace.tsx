import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readSectionDraft,
  writeSectionDraft,
  forgetSectionDraft,
  type SectionDraftSnapshot,
} from "@/lib/knowledge-section-draft";
import { useKnowledgeSectionCopy } from "@/hooks/useKnowledgeSectionCopy";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./ui/alert-dialog";
import { knowledgeSectionType } from "../../../shared/knowledge-plan";
import {
  sectionStates,
  sectionState,
  sectionContentFits,
  type SectionReview,
} from "../../../shared/knowledge-sections";
type Draft = {
  id: number | null;
  title: string;
  content: string;
  useInBot: boolean;
  sectionType: string;
  parentId: number | null;
  requestId: string;
  baseline: string;
  review: SectionReview | null;
};
const signature = (d: Draft) =>
  JSON.stringify([d.title, d.content, d.useInBot, d.sectionType]);
export function KnowledgeSectionWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="sections">
      {key => <Workspace key={key} scope={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function Workspace({ scope }: { scope: string }) {
  const c = useKnowledgeSectionCopy(),
    { t } = useTranslation(),
    utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      search: "",
      type: "all" as "all" | (typeof knowledgeSectionType.options)[number],
      state: "all" as "all" | (typeof sectionStates)[number],
      page: 1,
    });
  const list = trpc.sariBrain.sectionWorkspace.useQuery(filters, {
    retry: false,
  });
  const create = trpc.sariBrain.createWorkspaceSection.useMutation(),
    update = trpc.sariBrain.updateWorkspaceSection.useMutation(),
    remove = trpc.sariBrain.deleteWorkspaceSection.useMutation();
  const [initial] = useState(() => {
    try {
      return { draft: readSectionDraft(scope), error: false };
    } catch {
      return { draft: null, error: true };
    }
  });
  const [restorable, setRestorable] = useState(initial.draft),
    [storageError, setStorageError] = useState(initial.error),
    [rebaseReview, setRebaseReview] = useState<SectionReview | null>(null);
  const epoch = useRef(knowledgeCacheEpoch());
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [deleting, setDeleting] = useState(false),
    [discard, setDiscard] = useState(false);
  const locked = useRef(false),
    alive = useRef(true),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft) panel.current?.focus();
  }, [draft?.id, draft?.requestId]);
  const canManage = !!list.data?.canManage && !list.isError;
  const persist = (value: Draft, phase: SectionDraftSnapshot["phase"]) => {
    try {
      writeSectionDraft(
        scope,
        {
          version: 1,
          savedAt: Date.now(),
          id: value.id,
          title: value.title,
          content: value.content,
          useInBot: value.useInBot,
          sectionType: value.sectionType as SectionDraftSnapshot["sectionType"],
          parentId: value.parentId,
          requestId: value.requestId,
          revision: value.review?.revision || null,
          phase,
        },
        epoch.current
      );
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  };
  useEffect(() => {
    if (draft && canManage)
      persist(
        draft,
        uncertain ? "uncertain" : busy && !deleting ? "submitting" : "editing"
      );
  }, [draft, canManage, busy, uncertain, deleting]);
  useEffect(() => {
    if (list.data && !list.data.canManage && !list.isError) {
      setRestorable(null);
      try {
        forgetSectionDraft(scope);
      } catch {
        setStorageError(true);
      }
    }
  }, [list.data?.canManage, list.isError, scope]);
  const name = (key: string) => c[key as keyof typeof c] || key;
  const close = () => {
    try {
      forgetSectionDraft(scope);
    } catch {
      setStorageError(true);
    }
    setRestorable(null);
    setRebaseReview(null);
    setDraft(null);
    setAck(false);
    setError("");
    setUncertain(false);
    setDiscard(false);
    setDeleting(false);
  };
  const refresh = () => {
    void list.refetch();
    void utils.sariBrain.getHealthScore.invalidate();
    void utils.sariBrain.getKnowledgeSections.invalidate();
    void utils.sariBrain.getActivityLog.invalidate();
    void utils.sariBrain.getChangelog.invalidate();
    void utils.sariBrain.conflictWorkspace.invalidate();
  };
  const failure = (e: unknown) => {
    const code = (e as { data?: { code?: string } }).data?.code;
    return code === "CONFLICT"
      ? c.changed
      : code === "NOT_FOUND" ||
          code === "FORBIDDEN" ||
          code === "PRECONDITION_FAILED"
        ? c.denied
        : c.unknown;
  };
  const open = async (id: number) => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const review = await utils.sariBrain.sectionReview.fetch(
        { id },
        { staleTime: 0 }
      );
      if (!alive.current) return;
      const d: Draft = {
        id,
        title: review.section.title,
        content: review.section.content,
        useInBot: review.section.useInBot,
        sectionType: review.section.sectionType,
        parentId: review.section.parentId,
        requestId: crypto.randomUUID(),
        baseline: "",
        review,
      };
      d.baseline = signature(d);
      setDraft(d);
      setRebaseReview(null);
      setAck(false);
      setUncertain(false);
      setDeleting(false);
    } catch {
      if (alive.current) setError(c.loadError);
    } finally {
      locked.current = false;
      if (alive.current) setLoading(false);
    }
  };
  const fresh = (parentId: number | null = null) => {
    const d: Draft = {
      id: null,
      title: "",
      content: "",
      useInBot: false,
      sectionType: "custom",
      parentId,
      requestId: crypto.randomUUID(),
      baseline: "",
      review: null,
    };
    d.baseline = signature(d);
    setDraft(d);
    setRebaseReview(null);
    setAck(false);
    setError("");
    setMessage("");
    setUncertain(false);
  };
  const patch = (values: Partial<Draft>) => {
    setDraft(d => (d ? { ...d, ...values } : d));
    setAck(false);
    setError("");
  };
  const restore = async () => {
    if (!restorable || !canManage || locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    try {
      const current = restorable.id
        ? await utils.sariBrain.sectionReview.fetch(
            { id: restorable.id },
            { staleTime: 0 }
          )
        : null;
      if (!alive.current || epoch.current !== knowledgeCacheEpoch()) return;
      const changed =
        current &&
        (current.revision !== restorable.revision ||
          restorable.phase !== "editing");
      setRebaseReview(changed ? current : null);
      setDraft({
        id: restorable.id,
        title: restorable.title,
        content: restorable.content,
        useInBot: restorable.useInBot,
        sectionType: restorable.sectionType,
        parentId: restorable.parentId,
        requestId: restorable.requestId,
        baseline: "",
        review: current
          ? { ...current, revision: restorable.revision || current.revision }
          : null,
      });
      setUncertain(restorable.phase !== "editing");
      setAck(false);
      setDeleting(false);
      setRestorable(null);
      setMessage(c.draftRestored);
    } catch {
      if (alive.current) setError(c.loadError);
    } finally {
      locked.current = false;
      if (alive.current) setLoading(false);
    }
  };
  const receiptMessage = (state?: string) =>
    state === "deleted"
      ? c.creationDeleted
      : state === "changed"
        ? c.creationChanged
        : c.creationSaved;
  const checkCreation = async () => {
    if (!draft || draft.id !== null || !canManage || locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    setAck(false);
    try {
      const result = await utils.sariBrain.sectionCreationReceipt.fetch(
        { requestId: draft.requestId },
        { staleTime: 0 }
      );
      if (!alive.current) return;
      if (result.state === "not_found") setMessage(c.creationMissing);
      else {
        close();
        setMessage(receiptMessage(result.state));
        refresh();
      }
    } catch {
      if (alive.current) setError(c.loadError);
    } finally {
      locked.current = false;
      if (alive.current) setLoading(false);
    }
  };
  const canEnable =
    !draft?.review ||
    sectionState({ ...draft.review.section, useInBot: true }) === "eligible";
  const pending = draft?.review?.section.status === "pending_review";
  const save = async () => {
    if (
      locked.current ||
      !draft ||
      !canManage ||
      !!rebaseReview ||
      !ack ||
      (uncertain && draft.id !== null)
    )
      return;
    if (
      !deleting &&
      (!draft.title.trim() ||
        draft.title.trim().length > 500 ||
        !draft.content.trim() ||
        draft.content.trim().length > 50000)
    ) {
      setError(c.required);
      return;
    }
    if (!deleting && !sectionContentFits(draft.content.trim())) {
      setError(c.tooLarge);
      return;
    }
    if (!deleting && (pending || (draft.useInBot && !canEnable))) return;
    if (draft.id === null && !persist(draft, "submitting")) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let result: {
        success: boolean;
        indexing?: string;
        replayed?: boolean;
        state?: string;
      };
      if (deleting && draft.id && draft.review)
        result = await remove.mutateAsync({
          id: draft.id,
          expectedRevision: draft.review.deleteRevision,
          acknowledged: true,
        });
      else if (draft.id && draft.review)
        result = await update.mutateAsync({
          id: draft.id,
          title: draft.title,
          content: draft.content,
          useInBot: draft.useInBot,
          expectedRevision: draft.review.revision,
          acknowledged: true,
        });
      else
        result = await create.mutateAsync({
          title: draft.title,
          content: draft.content,
          useInBot: draft.useInBot,
          sectionType: draft.sectionType as "custom",
          parentId: draft.parentId,
          requestId: draft.requestId,
          acknowledged: true,
        });
      if (!alive.current) return;
      close();
      setMessage(
        (result.replayed ? receiptMessage(result.state) : c.saved) +
          (result.indexing === "ready"
            ? " " + c.indexed
            : result.indexing === "unconfirmed"
              ? " " + c.indexPending
              : "")
      );
      refresh();
    } catch (e) {
      if (alive.current) {
        setError(failure(e));
        setUncertain(true);
        setAck(false);
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Card className="min-w-0" data-section-workspace>
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription className="leading-7">{c.help}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 min-w-0">
        {storageError && (
          <p role="alert" className="leading-7">
            {c.draftStorageError}
          </p>
        )}
        {restorable && canManage && !draft && (
          <section
            className="rounded-xl border p-4 space-y-3"
            aria-label={c.draftAvailable}
          >
            <h3 className="font-semibold">{c.draftAvailable}</h3>
            <p className="text-sm leading-7">{c.draftPolicy}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={loading} onClick={() => void restore()}>
                {c.restoreDraft}
              </Button>
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => {
                  try {
                    forgetSectionDraft(scope);
                    setRestorable(null);
                    setStorageError(false);
                  } catch {
                    setStorageError(true);
                  }
                }}
              >
                {c.discardDraft}
              </Button>
            </div>
          </section>
        )}
        {message && <p role="status">{message}</p>}
        {error && !draft && (
          <p role="alert" className="leading-7">
            {error}
          </p>
        )}
        {loading && <p role="status">{c.loading}</p>}
        {!draft && (
          <>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={e => {
                e.preventDefault();
                setFilters(f => ({ ...f, search, page: 1 }));
              }}
            >
              <label className="space-y-2">
                {c.search}
                <Input
                  value={search}
                  maxLength={200}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <label className="space-y-2">
                {c.type}
                <select
                  className="h-11 w-full rounded-md border bg-background px-3"
                  value={filters.type}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      type: e.target.value as typeof f.type,
                      page: 1,
                    }))
                  }
                >
                  <option value="all">{c.all}</option>
                  {knowledgeSectionType.options.map(k => (
                    <option key={k} value={k}>
                      {name(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                {c.state}
                <select
                  className="h-11 w-full rounded-md border bg-background px-3"
                  value={filters.state}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      state: e.target.value as typeof f.state,
                      page: 1,
                    }))
                  }
                >
                  <option value="all">{c.all}</option>
                  {sectionStates.map(k => (
                    <option key={k} value={k}>
                      {name(k)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="submit" disabled={loading || list.isFetching}>
                  {c.searchAction}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || list.isFetching}
                  onClick={() => void list.refetch()}
                >
                  {c.retry}
                </Button>
              </div>
            </form>
            {canManage && (
              <Button
                disabled={loading || !!restorable}
                onClick={() => fresh()}
              >
                {c.new}
              </Button>
            )}
            {list.isError ? (
              <p role="alert">{c.loadError}</p>
            ) : list.isLoading ? (
              <p role="status">{c.loading}</p>
            ) : (
              <>
                {!canManage && <p>{c.readOnly}</p>}
                <p role="status">
                  {t("merchantUx.knowledgeSections.count", {
                    count: list.data?.total || 0,
                    page: list.data?.page || 1,
                    pages: list.data?.totalPages || 1,
                  })}
                </p>
                {!list.data?.items.length ? (
                  <p>{c.empty}</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {list.data.items.map(row => (
                      <li
                        key={row.id}
                        className="min-w-0 rounded-xl border p-4 space-y-3"
                      >
                        <h3
                          className="font-semibold [overflow-wrap:anywhere]"
                          dir="auto"
                        >
                          {row.title}
                        </h3>
                        <p className="text-sm">
                          {name(row.sectionType)} · #{row.id}
                        </p>
                        <p className="text-sm">{name(row.state)}</p>
                        {row.parentId && (
                          <p className="text-sm">
                            {c.parent}: #{row.parentId}
                          </p>
                        )}
                        <Button
                          variant="outline"
                          disabled={loading || !!restorable}
                          onClick={() => void open(row.id)}
                        >
                          {c.open}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      loading || list.isFetching || (list.data?.page || 1) <= 1
                    }
                    onClick={() =>
                      setFilters(f => ({ ...f, page: list.data!.page - 1 }))
                    }
                  >
                    {c.previous}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      loading ||
                      list.isFetching ||
                      (list.data?.page || 1) >= (list.data?.totalPages || 1)
                    }
                    onClick={() =>
                      setFilters(f => ({ ...f, page: list.data!.page + 1 }))
                    }
                  >
                    {c.next}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {draft && (
          <section
            ref={panel}
            tabIndex={-1}
            aria-label={c.reviewTitle}
            className="space-y-4 min-w-0"
            data-section-editor
          >
            <h3 className="font-semibold">
              {deleting ? c.deleteTitle : draft.id ? c.reviewTitle : c.new}
            </h3>
            {canManage && <p className="text-sm leading-7">{c.draftPolicy}</p>}
            {rebaseReview && (
              <section
                className="rounded-xl border p-4 space-y-3"
                aria-label={c.currentText}
              >
                <p role="alert" className="leading-7">
                  {c.restoreChanged}
                </p>
                <h4 className="font-semibold">{c.currentText}</h4>
                <p className="[overflow-wrap:anywhere]" dir="auto">
                  {rebaseReview.section.title} ·{" "}
                  {name(rebaseReview.section.state)}
                </p>
                <p
                  className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-7"
                  dir="auto"
                >
                  {rebaseReview.section.content}
                </p>
                <Button
                  className="whitespace-normal h-auto min-h-11"
                  disabled={busy || loading || !canManage}
                  onClick={() => {
                    setDraft(d => (d ? { ...d, review: rebaseReview } : d));
                    setRebaseReview(null);
                    setUncertain(false);
                    setAck(false);
                    setError("");
                  }}
                >
                  {c.useDraft}
                </Button>
              </section>
            )}
            {draft.review && (
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm [overflow-wrap:anywhere]">
                <p>
                  {c.number}: #{draft.id} · {name(draft.review.section.state)}
                </p>
                <p>
                  {c.source}:{" "}
                  {draft.review.section.sourceUrl ||
                    (
                      {
                        manual: c.manual,
                        website: c.website,
                        document: c.document,
                        ai_evolved: c.aiEvolved,
                        byaan_sync: c.byaanSync,
                      } as Record<string, string>
                    )[draft.review.section.source] ||
                    draft.review.section.source}
                </p>
                <p>
                  {c.expiry}: {draft.review.section.validUntil || c.noExpiry}
                </p>
                {draft.parentId && (
                  <p>
                    {c.parent}: {draft.review.parent?.title || c.missingParent}{" "}
                    · #{draft.parentId}
                  </p>
                )}
              </div>
            )}
            {!draft.id && (
              <p className="leading-7">
                {c.newHelp}
                {draft.parentId ? ` · ${c.parent}: #${draft.parentId}` : ""}
              </p>
            )}
            {draft.review?.section.state === "unverified" && (
              <p
                role="status"
                className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 leading-7"
              >
                {c.unverifiedHelp}
              </p>
            )}
            {!deleting && draft.review?.section.replacesTeachingSource && (
              <p className="rounded-xl border p-4 leading-7">
                {c.teachingReviewHelp}
              </p>
            )}
            {deleting ? (
              <>
                <p className="leading-7">{c.deleteHelp}</p>
                <h4 className="font-semibold [overflow-wrap:anywhere]">
                  {draft.review?.section.title}
                </h4>
                <p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">
                  {draft.review?.section.content}
                </p>
                <h4>
                  {c.children} ({draft.review?.descendants.length})
                </h4>
                <ul className="space-y-2">
                  {draft.review?.descendants.map(r => (
                    <li key={r.id} className="[overflow-wrap:anywhere]">
                      #{r.id} · {r.title}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <fieldset
                  disabled={
                    !canManage || busy || uncertain || pending || !!rebaseReview
                  }
                  className="space-y-4"
                >
                  {!draft.id && (
                    <label className="block space-y-2">
                      {c.type}
                      <select
                        className="h-11 w-full rounded-md border bg-background px-3"
                        value={draft.sectionType}
                        onChange={e => patch({ sectionType: e.target.value })}
                      >
                        {knowledgeSectionType.options
                          .filter(
                            k => !["sales_intel", "opportunities"].includes(k)
                          )
                          .map(k => (
                            <option key={k} value={k}>
                              {name(k)}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="block space-y-2">
                    {c.sectionTitle} (500)
                    <Input
                      dir="auto"
                      value={draft.title}
                      maxLength={500}
                      onChange={e => patch({ title: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-2">
                    {c.content} (50000)
                    <Textarea
                      dir="auto"
                      className="min-h-64 leading-7"
                      value={draft.content}
                      maxLength={50000}
                      onChange={e => patch({ content: e.target.value })}
                    />
                  </label>
                  <label className="flex gap-3 items-start min-h-11">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      checked={draft.useInBot}
                      disabled={!canEnable && !draft.useInBot}
                      onChange={e => patch({ useInBot: e.target.checked })}
                    />
                    <span>{c.use}</span>
                  </label>
                </fieldset>
                <p className="text-sm leading-7">{c.useHelp}</p>
                {pending ? (
                  <p role="status">{c.pendingHelp}</p>
                ) : (
                  !canEnable && <p role="status">{c.blocked}</p>
                )}
                {draft.review?.section.summary && (
                  <details>
                    <summary>{c.summary}</summary>
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-7">
                      {draft.review.section.summary}
                    </p>
                    <p>{c.summaryHelp}</p>
                  </details>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="leading-7">
                {error}
              </p>
            )}
            {canManage && (
              <label className="flex items-start gap-3 rounded-xl border p-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={ack}
                  disabled={
                    busy ||
                    loading ||
                    !!rebaseReview ||
                    (uncertain && draft.id !== null) ||
                    (!deleting && pending)
                  }
                  onChange={e => setAck(e.target.checked)}
                />
                <span>{c.ack}</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button
                  className="whitespace-normal h-auto min-h-11"
                  disabled={
                    busy ||
                    loading ||
                    !ack ||
                    !!rebaseReview ||
                    (uncertain && draft.id !== null) ||
                    (!deleting && (pending || (draft.useInBot && !canEnable)))
                  }
                  onClick={() => void save()}
                >
                  {busy
                    ? c.saving
                    : deleting
                      ? c.deleteConfirm
                      : uncertain && draft.id === null
                        ? c.retrySame
                        : c.save}
                </Button>
              )}
              {canManage && draft.id === null && uncertain && (
                <Button
                  variant="outline"
                  className="whitespace-normal h-auto min-h-11"
                  disabled={busy || loading}
                  onClick={() => void checkCreation()}
                >
                  {c.checkCreation}
                </Button>
              )}
              {draft.id && (
                <Button
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() => void open(draft.id!)}
                >
                  {c.refreshReview}
                </Button>
              )}
              {draft.id && canManage && !deleting && (
                <Button
                  variant="outline"
                  disabled={busy || loading || uncertain || !!rebaseReview}
                  onClick={() => {
                    setDeleting(true);
                    setAck(false);
                  }}
                >
                  {c.remove}
                </Button>
              )}
              {draft.id && canManage && !deleting && (
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    loading ||
                    uncertain ||
                    !!rebaseReview ||
                    signature(draft) !== draft.baseline
                  }
                  onClick={() => fresh(draft.id)}
                >
                  {c.child}
                </Button>
              )}
              {deleting && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(false);
                    setAck(false);
                  }}
                >
                  {c.cancel}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() =>
                  signature(draft) !== draft.baseline || uncertain
                    ? setDiscard(true)
                    : close()
                }
              >
                {c.close}
              </Button>
            </div>
          </section>
        )}
        <AlertDialog open={discard} onOpenChange={setDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{c.discardTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {uncertain ? c.unknown : c.discardHelp}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setDiscard(false)}>
                {c.keep}
              </Button>
              <Button onClick={close}>{c.leave}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
export function KnowledgeSectionReadiness() {
  const c = useKnowledgeSectionCopy(),
    { t } = useTranslation(),
    query = trpc.sariBrain.getHealthScore.useQuery(undefined, { retry: false });
  return (
    <Card data-section-readiness>
      <CardHeader>
        <CardTitle>{c.coverageTitle}</CardTitle>
        <CardDescription className="leading-7">
          {c.coverageHelp}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {c.retry}
        </Button>
        {query.isError ? (
          <p role="alert">{c.healthError}</p>
        ) : query.isLoading ? (
          <p role="status">{c.loading}</p>
        ) : (
          query.data && (
            <>
              <p className="text-2xl font-semibold" role="status">
                {t("merchantUx.knowledgeSections.coverage", {
                  covered: query.data.covered,
                  areas: query.data.areas,
                  total: query.data.total,
                })}
              </p>
              <p>
                {t("merchantUx.knowledgeSections.savedCount", {
                  count: query.data.saved,
                })}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionStates.map(state => (
                  <div key={state} className="rounded-xl border p-3">
                    <dt>{c[state]}</dt>
                    <dd className="mt-2 text-xl">
                      {query.data!.counts[state]}
                    </dd>
                  </div>
                ))}
              </dl>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.breakdown.map(area => (
                  <li key={area.key} className="rounded-xl border p-4">
                    <h3 className="font-semibold">{c[area.key]}</h3>
                    <p className="mt-2">
                      {t("merchantUx.knowledgeSections.areaCount", {
                        count: area.count,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
