import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WorkspaceState } from "./WorkspaceState";
import { AssistantOptionReview } from "./AssistantOptionReview";
import {
  matchQuickResponse,
  quickResponseDraft,
  quickResponseDraftSchema,
  quickResponseKeywords,
  type QuickResponseDraft,
} from "@shared/quick-response";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
type RouterOutputs = inferRouterOutputs<AppRouter>;

type Workspace = RouterOutputs["quickResponses"]["workspace"];
type Row = Workspace["rows"][number];
type Editor = {
  kind: "create" | "edit" | "delete";
  row?: Row;
  draft: QuickResponseDraft;
  base: QuickResponseDraft;
  revision: string;
  conflict: boolean;
  latest: Workspace | null;
};
const blank = (): QuickResponseDraft => ({
  trigger: "",
  response: "",
  keywords: "",
  priority: 5,
  isActive: false,
});
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const canonicalDraft = (draft: QuickResponseDraft) =>
  quickResponseDraft({
    ...draft,
    trigger: draft.trigger.trim(),
    response: draft.response.trim(),
  });
export function QuickResponseWorkspace() {
  const { t } = useTranslation(),
    utils = trpc.useUtils();
  const merchant = trpc.merchants.getCurrent.useQuery();
  const query = trpc.quickResponses.workspace.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const create = trpc.quickResponses.create.useMutation(),
    update = trpc.quickResponses.update.useMutation(),
    remove = trpc.quickResponses.delete.useMutation();
  const data =
    query.data?.merchantId === merchant.data?.id ? query.data : undefined;
  const canManage = !!data?.canManage && !query.isError;
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [reviewed, setReviewed] = useState(false);
  const [question, setQuestion] = useState(""),
    [sample, setSample] = useState<{
      question: string;
      row: Row | null;
    } | null>(null);
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setSample(null), [query.data, query.isError]);
  const labels = {
    trigger: t("quickResponsesPage.text21"),
    response: t("quickResponsesPage.text22"),
    keywords: t("quickResponsesPage.text12"),
    priority: t("quickResponsesPage.text23"),
    isActive: t("quickResponsesPage.text25"),
  };
  const display = (
    key: keyof QuickResponseDraft,
    value: QuickResponseDraft[keyof QuickResponseDraft]
  ) =>
    key === "isActive"
      ? t(value ? "quickResponsesPage.text27" : "quickResponsesPage.text28")
      : String(value || value === 0 ? value : t("virtualTeamReview.empty"));
  const failureText = (error: unknown) => {
    const e = error as { data?: { code?: string }; message?: string };
    return t(
      e.data?.code === "PRECONDITION_FAILED"
        ? "quickResponsesUx.experimentReference"
        : e.data?.code === "CONFLICT" || e.data?.code === "NOT_FOUND"
          ? "quickResponseWorkspace.changed"
          : "quickResponsesUx.failed"
    );
  };
  function begin(kind: Editor["kind"], row?: Row) {
    if (!data || !canManage || lock.current || editor) return;
    const draft = row ? quickResponseDraft(row) : blank();
    setEditor({
      kind,
      row,
      draft,
      base: draft,
      revision: row?.revision || data.revision,
      conflict: false,
      latest: null,
    });
    setFields({});
    setFailure("");
    setReviewed(false);
    setOpen(true);
  }
  function close() {
    if (lock.current) return;
    setOpen(false);
    setFailure("");
    if (editor?.kind === "delete" || equal(editor?.draft, editor?.base))
      setEditor(null);
  }
  function change<K extends keyof QuickResponseDraft>(
    key: K,
    value: QuickResponseDraft[K]
  ) {
    if (!editor || lock.current) return;
    setEditor({ ...editor, draft: { ...editor.draft, [key]: value } });
    setFields(old => ({ ...old, [key]: "" }));
  }
  async function refreshReview() {
    if (!editor || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const result = await query.refetch();
      if (!alive.current) return;
      if (
        result.error ||
        !result.data ||
        result.data.merchantId !== merchant.data?.id
      )
        throw Error("Unavailable");
      setEditor(old => (old ? { ...old, latest: result.data! } : old));
      setReviewed(false);
    } catch {
      if (alive.current) setFailure(t("quickResponsesUx.failed"));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function acceptReview(draft: QuickResponseDraft) {
    if (!editor?.latest || !canManage || busy) return;
    const row = editor.latest.rows.find(row => row.id === editor.row?.id);
    if (editor.kind !== "create" && !row) return;
    setEditor({
      ...editor,
      row: row || editor.row,
      draft,
      base: row ? quickResponseDraft(row) : editor.base,
      revision: row?.revision || editor.latest.revision,
      conflict: false,
      latest: null,
    });
    setReviewed(false);
    setFailure("");
  }
  async function save() {
    if (!editor || lock.current || !canManage || editor.conflict) return;
    const parsed = quickResponseDraftSchema.safeParse(editor.draft);
    if (editor.kind !== "delete" && !parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] = t(
          key === "priority"
            ? "quickResponseWorkspace.priorityError"
            : key === "keywords"
              ? "quickResponseWorkspace.keywordsError"
              : key === "trigger"
                ? "quickResponseWorkspace.triggerError"
                : "quickResponseWorkspace.responseError"
        );
      }
      setFields(next);
      document.getElementById("quick-" + Object.keys(next)[0])?.focus();
      return;
    }
    if (editor.kind === "delete" && !reviewed) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      if (editor.kind === "delete")
        await remove.mutateAsync({
          id: editor.row!.id,
          expectedRevision: editor.revision,
        });
      else if (editor.kind === "edit")
        await update.mutateAsync({
          id: editor.row!.id,
          expectedRevision: editor.revision,
          ...parsed.data!,
        });
      else
        await create.mutateAsync({
          ...parsed.data!,
          expectedRevision: editor.revision,
        });
      if (!alive.current) return;
      toast.success(
        t(
          editor.kind === "delete"
            ? "quickResponsesPage.text4"
            : editor.kind === "create"
              ? "quickResponsesPage.text0"
              : "quickResponsesPage.text2"
        )
      );
      setEditor(null);
      setOpen(false);
      setSample(null);
      void utils.quickResponses.invalidate().catch(() => {});
    } catch (error) {
      if (alive.current) {
        const e = error as { data?: { code?: string }; message?: string };
        if (e.data?.code === "CONFLICT" || e.data?.code === "NOT_FOUND")
          setEditor(old =>
            old ? { ...old, conflict: true, latest: null } : old
          );
        else if (
          e.data?.code === "BAD_REQUEST" &&
          e.message === "Response claims an unverified action"
        )
          setFields({ response: t("quickResponseWorkspace.actionClaim") });
        else setFailure(failureText(error));
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function toggle(row: Row) {
    if (!canManage || lock.current || editor) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      await update.mutateAsync({
        id: row.id,
        expectedRevision: row.revision,
        isActive: !row.isActive,
      });
      if (!alive.current) return;
      toast.success(
        t(
          row.isActive
            ? "quickResponsesPage.text34"
            : "quickResponsesPage.text35"
        )
      );
      setSample(null);
      void utils.quickResponses.invalidate().catch(() => {});
    } catch (error) {
      if (alive.current)
        setFailure(
          (error as { message?: string })?.message ===
            "Response claims an unverified action"
            ? t("quickResponseWorkspace.actionClaim")
            : failureText(error)
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (!data)
    return query.isError ? (
      <WorkspaceState kind="error" onRetry={() => void query.refetch()} />
    ) : (
      <p role="status">{t("common.loading")}</p>
    );
  const filtered = data.rows
    .filter(
      row =>
        (status === "all" || (status === "active") == Boolean(row.isActive)) &&
        [
          row.trigger,
          row.response,
          quickResponseKeywords(row.keywords).join(" "),
        ].some(value =>
          value.toLowerCase().includes(search.trim().toLowerCase())
        )
    )
    .sort(
      (a, b) =>
        b.priority - a.priority || b.useCount - a.useCount || a.id - b.id
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    shownPage = Math.min(page, pages),
    rows = filtered.slice((shownPage - 1) * 10, shownPage * 10);
  const latestRow = editor?.latest?.rows.find(row => row.id === editor.row?.id);
  const recovered =
    editor?.kind === "create"
      ? editor.latest?.rows.find(row =>
          equal(quickResponseDraft(row), canonicalDraft(editor.draft))
        )
      : undefined;
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold">
            {t("quickResponsesPage.text36")}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {t("quickResponseWorkspace.intro")}
          </p>
        </div>
        <Button
          className="min-h-11"
          disabled={!canManage || busy || !!editor}
          onClick={() => begin("create")}
        >
          {t("quickResponsesPage.text38")}
        </Button>
      </header>
      {!canManage && (
        <p role="note" className="rounded-xl border p-4 text-sm">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      {query.isError && (
        <WorkspaceState
          kind="error"
          inline
          onRetry={() => void query.refetch()}
        />
      )}
      {failure && !open && (
        <p
          role="alert"
          className="rounded-xl border p-4 text-sm text-destructive"
        >
          {failure}
        </p>
      )}
      <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          [t("quickResponsesPage.text15"), data.total],
          [t("quickResponsesPage.text16"), data.active],
          [t("quickResponsesPage.text17"), data.inactive],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border bg-card p-3 sm:p-4"
          >
            <dt className="text-xs text-muted-foreground sm:text-sm">
              {label}
            </dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {editor && !open && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm">{t("quickResponseWorkspace.retained")}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => setOpen(true)}>
              {t("quickResponseWorkspace.continueDraft")}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setEditor(null);
                setFailure("");
              }}
            >
              {t("quickResponseWorkspace.discardDraft")}
            </Button>
          </div>
        </section>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-2">
            <Label htmlFor="quick-search">
              {t("quickResponseWorkspace.search")}
            </Label>
            <Input
              id="quick-search"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-status">{labels.isActive}</Label>
            <select
              id="quick-status"
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={e => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t("quickResponseWorkspace.all")}</option>
              <option value="active">{t("quickResponsesPage.text27")}</option>
              <option value="inactive">{t("quickResponsesPage.text28")}</option>
            </select>
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("quickResponseWorkspace.refresh")}
          </Button>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          {t("quickResponseWorkspace.orderHelp")}
        </p>
        {!rows.length ? (
          query.isError ? null : (
            <p className="py-6 text-sm text-muted-foreground">
              {t(
                data.total
                  ? "quickResponseWorkspace.noResults"
                  : "quickResponsesPage.text19"
              )}
            </p>
          )
        ) : (
          <ul className="space-y-3">
            {rows.map(row => (
              <li
                key={row.id}
                className="min-w-0 space-y-3 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                    {row.trigger}
                  </h2>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs">
                    {t(
                      row.isActive
                        ? "quickResponsesPage.text27"
                        : "quickResponsesPage.text28"
                    )}
                  </span>
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                  {row.response}
                </p>
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                    {t("quickResponseWorkspace.details")}
                  </summary>
                  <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                    <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                      {row.response}
                    </p>
                    <p className="text-sm [overflow-wrap:anywhere]">
                      {labels.keywords}:{" "}
                      {quickResponseKeywords(row.keywords).join("، ") ||
                        t("virtualTeamReview.empty")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("quickResponseWorkspace.usageHelp")}
                    </p>
                  </div>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {t("quickResponseWorkspace.rowStats", {
                      priority: row.priority,
                      count: row.useCount,
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={!canManage || busy || !!editor}
                      aria-label={t("merchantUx.actions.editNamed", {
                        name: row.trigger,
                      })}
                      onClick={() => begin("edit", row)}
                    >
                      {t("quickResponseWorkspace.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={!canManage || busy || !!editor}
                      aria-label={t(
                        row.isActive
                          ? "merchantUx.actions.deactivateNamed"
                          : "merchantUx.actions.activateNamed",
                        { name: row.trigger }
                      )}
                      onClick={() => void toggle(row)}
                    >
                      {t(
                        row.isActive
                          ? "quickResponseWorkspace.deactivate"
                          : "quickResponseWorkspace.activate"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11 text-destructive"
                      disabled={!canManage || busy || !!editor}
                      aria-label={t("merchantUx.actions.deleteNamed", {
                        name: row.trigger,
                      })}
                      onClick={() => begin("delete", row)}
                    >
                      {t("quickResponseWorkspace.delete")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={shownPage <= 1}
            onClick={() => setPage(shownPage - 1)}
          >
            {t("common.previous")}
          </Button>
          <p className="text-sm">
            {t("quickResponseWorkspace.page", {
              page: shownPage,
              pages,
              count: filtered.length,
            })}
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={shownPage >= pages}
            onClick={() => setPage(shownPage + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      </section>
      <details className="rounded-xl border bg-card p-4 sm:p-6">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          {t("quickResponseWorkspace.test")}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-7 text-muted-foreground">
            {t("quickResponseWorkspace.testHelp")}
          </p>
          <Label htmlFor="quick-question">
            {t("quickResponseWorkspace.question")}
          </Label>
          <Textarea
            id="quick-question"
            rows={3}
            maxLength={2000}
            value={question}
            onChange={e => {
              setQuestion(e.target.value);
              setSample(null);
            }}
          />
          <Button
            className="min-h-11"
            disabled={!question.trim() || query.isError || busy}
            onClick={() =>
              setSample({
                question,
                row: matchQuickResponse(data.rows, question),
              })
            }
          >
            {t("quickResponseWorkspace.runTest")}
          </Button>
          {sample && (
            <section
              role="status"
              className="space-y-2 rounded-xl border bg-muted/30 p-4"
            >
              {sample.row ? (
                <>
                  <h3 className="font-semibold [overflow-wrap:anywhere]">
                    {sample.row.trigger}
                  </h3>
                  <p className="text-sm">
                    {t(
                      sample.row.trigger.trim().toLowerCase() ===
                        sample.question.trim().toLowerCase()
                        ? "quickResponseWorkspace.exactMatch"
                        : "quickResponseWorkspace.keywordMatch"
                    )}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                    {sample.row.response}
                  </p>
                </>
              ) : (
                <p className="text-sm">{t("quickResponseWorkspace.noMatch")}</p>
              )}
            </section>
          )}
        </div>
      </details>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!value) close();
        }}
      >
        <DialogContent
          closeLabel={t("common.close")}
          showCloseButton={!busy}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
          onInteractOutside={event => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                editor?.kind === "delete"
                  ? "quickResponseWorkspace.deleteTitle"
                  : editor?.kind === "edit"
                    ? "quickResponsesPage.text29"
                    : "quickResponsesPage.text7"
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                editor?.kind === "delete"
                  ? "quickResponseWorkspace.deleteHelp"
                  : "quickResponseWorkspace.editorHelp"
              )}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              noValidate
              className="min-w-0 space-y-4"
              onSubmit={event => {
                event.preventDefault();
                void save();
              }}
            >
              {editor.kind === "delete" ? (
                <section className="space-y-3 rounded-xl border p-4">
                  <h2 className="font-semibold [overflow-wrap:anywhere]">
                    {editor.draft.trigger}
                  </h2>
                  <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                    {editor.draft.response}
                  </p>
                  <p className="text-sm [overflow-wrap:anywhere]">
                    {labels.keywords}:{" "}
                    {editor.draft.keywords || t("virtualTeamReview.empty")}
                  </p>
                  <p className="text-sm">
                    {labels.priority}: {editor.draft.priority} ·{" "}
                    {display("isActive", editor.draft.isActive)}
                  </p>
                </section>
              ) : (
                <fieldset
                  disabled={busy || !canManage}
                  className="min-w-0 space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="quick-trigger">{labels.trigger}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("quickResponseWorkspace.triggerHelp")}
                    </p>
                    <Input
                      id="quick-trigger"
                      className="min-h-11 text-base"
                      maxLength={255}
                      value={editor.draft.trigger}
                      onChange={e => change("trigger", e.target.value)}
                      aria-invalid={!!fields.trigger}
                      aria-describedby={
                        fields.trigger ? "quick-trigger-error" : undefined
                      }
                    />
                    {fields.trigger && (
                      <p
                        id="quick-trigger-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {fields.trigger}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-response">{labels.response}</Label>
                    <Textarea
                      id="quick-response"
                      rows={5}
                      maxLength={2000}
                      value={editor.draft.response}
                      onChange={e => change("response", e.target.value)}
                      aria-invalid={!!fields.response}
                      aria-describedby={
                        fields.response ? "quick-response-error" : undefined
                      }
                    />
                    {fields.response && (
                      <p
                        id="quick-response-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {fields.response}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-keywords">{labels.keywords}</Label>
                    <Input
                      id="quick-keywords"
                      className="min-h-11 text-base"
                      maxLength={2000}
                      value={editor.draft.keywords}
                      onChange={e => change("keywords", e.target.value)}
                      aria-invalid={!!fields.keywords}
                      aria-describedby={
                        fields.keywords ? "quick-keywords-error" : undefined
                      }
                    />
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("quickResponseWorkspace.keywordsHelp")}
                    </p>
                    {fields.keywords && (
                      <p
                        id="quick-keywords-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {fields.keywords}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-priority">{labels.priority}</Label>
                    <Input
                      id="quick-priority"
                      className="min-h-11 text-base"
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      value={
                        Number.isFinite(editor.draft.priority)
                          ? editor.draft.priority
                          : ""
                      }
                      onChange={e =>
                        change(
                          "priority",
                          e.target.value === "" ? NaN : Number(e.target.value)
                        )
                      }
                      aria-invalid={!!fields.priority}
                      aria-describedby={
                        fields.priority ? "quick-priority-error" : undefined
                      }
                    />
                    {fields.priority && (
                      <p
                        id="quick-priority-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {fields.priority}
                      </p>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
                    <div>
                      <Label htmlFor="quick-active">
                        {t("quickResponseWorkspace.available")}
                      </Label>
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">
                        {t("quickResponseWorkspace.availableHelp")}
                      </p>
                    </div>
                    <Switch
                      id="quick-active"
                      checked={editor.draft.isActive}
                      onCheckedChange={checked => change("isActive", checked)}
                    />
                  </div>
                </fieldset>
              )}
              {editor.conflict && (
                <section className="min-w-0 space-y-3">
                  <p role="alert" className="text-sm">
                    {t("quickResponseWorkspace.changed")}
                  </p>
                  {!editor.latest ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void refreshReview()}
                    >
                      {t("virtualTeamReview.load")}
                    </Button>
                  ) : editor.kind === "create" ? (
                    <>
                      <p className="text-sm">
                        {t("quickResponseWorkspace.collectionReview", {
                          count: editor.latest.total,
                        })}
                      </p>
                      <details>
                        <summary className="min-h-11 cursor-pointer py-3 text-sm">
                          {t("quickResponsesPage.text18")}
                        </summary>
                        <ul className="space-y-3">
                          {editor.latest.rows.map(row => (
                            <li
                              key={row.id}
                              className="text-sm [overflow-wrap:anywhere]"
                            >
                              <b>{row.trigger}</b>
                              <p className="whitespace-pre-wrap">
                                {row.response}
                              </p>
                              <p>
                                {labels.keywords}:{" "}
                                {quickResponseKeywords(row.keywords).join(
                                  "، "
                                ) || t("virtualTeamReview.empty")}
                              </p>
                              <p>
                                {t("quickResponseWorkspace.rowStats", {
                                  priority: row.priority,
                                  count: row.useCount,
                                })}{" "}
                                ·{" "}
                                {t(
                                  row.isActive
                                    ? "quickResponsesPage.text27"
                                    : "quickResponsesPage.text28"
                                )}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                      {recovered ? (
                        <>
                          <p className="text-sm">
                            {t("quickResponseWorkspace.alreadySaved")}
                          </p>
                          <Button
                            type="button"
                            className="min-h-11"
                            disabled={!canManage || busy}
                            onClick={() => {
                              const draft = quickResponseDraft(recovered);
                              setEditor({
                                kind: "edit",
                                row: recovered,
                                draft,
                                base: draft,
                                revision: recovered.revision,
                                conflict: false,
                                latest: null,
                              });
                            }}
                          >
                            {t("quickResponseWorkspace.openSaved")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          className="min-h-11 whitespace-normal"
                          disabled={!canManage || busy}
                          onClick={() => acceptReview(editor.draft)}
                        >
                          {t("virtualTeamReview.applyReview")}
                        </Button>
                      )}
                    </>
                  ) : !latestRow ? (
                    <p className="text-sm">
                      {t("quickResponseWorkspace.deletedElsewhere")}
                    </p>
                  ) : (
                    <AssistantOptionReview
                      key={latestRow.revision}
                      base={editor.base}
                      draft={editor.draft}
                      latest={quickResponseDraft(latestRow)}
                      labels={labels}
                      display={display}
                      disabled={!canManage || busy}
                      onApply={acceptReview}
                    />
                  )}
                </section>
              )}
              {failure && (
                <p role="alert" className="text-sm text-destructive">
                  {failure}
                </p>
              )}
              {editor.kind === "delete" && !editor.conflict && (
                <label className="flex min-h-11 items-start gap-3 rounded-xl border p-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={busy || !canManage}
                    checked={reviewed}
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  {t("quickResponseWorkspace.reviewDelete")}
                </label>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t bg-background pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={close}
                >
                  {t(
                    editor.kind === "delete"
                      ? "common.cancel"
                      : "quickResponseWorkspace.closeKeep"
                  )}
                </Button>
                <Button
                  type="submit"
                  variant={editor.kind === "delete" ? "destructive" : "default"}
                  className="min-h-11"
                  disabled={
                    !canManage ||
                    busy ||
                    editor.conflict ||
                    (editor.kind === "delete" && !reviewed)
                  }
                >
                  {t(
                    busy
                      ? "common.loading"
                      : editor.kind === "delete"
                        ? "quickResponseWorkspace.confirmDelete"
                        : editor.kind === "create"
                          ? "quickResponsesPage.text44"
                          : "quickResponsesPage.text48"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
