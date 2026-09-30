import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  blankTemplateForm,
  readTemplateCache,
  saveTemplateCache,
  clearTemplateCache,
  type TemplateCache,
  type TemplateDraft,
  type TemplateForm,
} from "@/lib/quotation-template-cache";
import {
  templateFields,
  templateReceipt,
  type TemplateRecord,
  type TemplateWriteInput,
  type TemplateWorkspace,
} from "@shared/quotation-templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TemplateList, TemplatePreview } from "./QuotationTemplateReport";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/quotation-workspace.css";
import "@/styles/quotation-send.css";
import "@/styles/quotation-templates.css";
const formOf = (row: TemplateRecord): TemplateForm => ({
  name: row.name,
  headerImageUrl: row.headerImageUrl || "",
  footerText: row.footerText || "",
  termsText: row.termsText || "",
  isDefault: row.isDefault,
});
export function QuotationTemplateWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    [actorId, merchantId] = scope.split(":").map(Number);
  const epoch = useRef(knowledgeCacheEpoch()),
    mounted = useRef(true),
    lock = useRef(false),
    cacheRef = useRef<TemplateCache>({}),
    formNode = useRef<HTMLFormElement>(null);
  const [selection, setSelection] = useState({ page: 1, search: "" }),
    [search, setSearch] = useState(""),
    [detailId, setDetailId] = useState<number | null>(null);
  const query = trpc.sariBrain.quotationTemplates.workspace.useQuery(
    selection,
    { staleTime: 0, refetchOnMount: "always" }
  );
  const detailQuery = trpc.sariBrain.quotationTemplates.detail.useQuery(
    { id: detailId ?? 1 },
    { enabled: detailId !== null, staleTime: 0, refetchOnMount: "always" }
  );
  const mutation = trpc.sariBrain.quotationTemplates.write.useMutation();
  const data =
    !query.error &&
    !query.isFetching &&
    query.data?.merchantId === merchantId &&
    query.data.selection.page === selection.page &&
    query.data.selection.search === selection.search
      ? query.data
      : undefined;
  const row =
    !detailQuery.error &&
    !detailQuery.isFetching &&
    detailQuery.data?.merchantId === merchantId &&
    detailQuery.data.id === detailId
      ? detailQuery.data
      : undefined;
  const [cache, setCache] = useState<TemplateCache>({}),
    [view, setView] = useState<"list" | "edit" | "detail">("list"),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<TemplateRecord | null>(null),
    [reviewId, setReviewId] = useState<number | null>(null),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState<TemplateRecord | null>(null),
    [consent, setConsent] = useState(false);
  const canManage = !!data?.canManage,
    alive = () => mounted.current && epoch.current === knowledgeCacheEpoch(),
    draft = cache.draft,
    attempt = cache.attempt;
  const persist = (value: TemplateCache) => {
    saveTemplateCache(scope, value, epoch.current);
    cacheRef.current = value;
    setCache(value);
  };
  useEffect(() => {
    mounted.current = true;
    try {
      const value = readTemplateCache(scope);
      cacheRef.current = value;
      setCache(value);
    } catch {
      setStorageError(true);
    }
    return () => {
      mounted.current = false;
    };
  }, [scope]);
  useEffect(() => {
    if (!draft && !attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, attempt]);
  useEffect(() => {
    formNode.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);
  useEffect(() => {
    if (view === "edit")
      formNode.current?.querySelector<HTMLInputElement>("#tt-name")?.focus();
  }, [view]);
  function storeDraft(next: TemplateDraft) {
    if (attempt || busy || storageError) return;
    try {
      persist({ draft: next });
      setErrors([]);
      setNotice("");
    } catch {
      setStorageError(true);
    }
  }
  function retryStorage() {
    try {
      const saved = readTemplateCache(scope);
      persist(
        cacheRef.current.draft || cacheRef.current.attempt
          ? cacheRef.current
          : saved
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function newDraft() {
    if (
      !canManage ||
      cacheRef.current.draft ||
      cacheRef.current.attempt ||
      busy ||
      storageError
    )
      return;
    try {
      persist({ draft: { mode: "create", form: blankTemplateForm() } });
      setView("edit");
      setNotice("");
      setConflict(false);
    } catch {
      setStorageError(true);
    }
  }
  function edit() {
    if (
      !row?.editable ||
      !canManage ||
      draft ||
      attempt ||
      busy ||
      storageError
    )
      return;
    try {
      persist({
        draft: {
          mode: "update",
          id: row.id,
          digest: row.digest,
          form: formOf(row),
        },
      });
      setView("edit");
      setConflict(false);
      setNotice("");
    } catch {
      setStorageError(true);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await query.refetch();
      if (result.error || result.data?.merchantId !== merchantId) throw Error();
      if (alive()) setNotice("");
    } catch {
      if (alive()) setNotice("failed");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function completed(raw: unknown, a: TemplateWriteInput) {
    if (!alive()) return;
    const receipt = templateReceipt.parse(raw);
    if (
      receipt.merchantId !== merchantId ||
      receipt.actorId !== actorId ||
      receipt.requestId !== a.requestId ||
      receipt.action !== a.action ||
      (a.action !== "create" && receipt.recordId !== a.id) ||
      (a.action === "delete") !== (receipt.digest === null)
    )
      throw Error("Receipt mismatch");
    clearTemplateCache(scope, epoch.current);
    cacheRef.current = {};
    setCache({});
    setConflict(false);
    setLatest(null);
    setDeleting(null);
    setConsent(false);
    setNotice("");
    setView("list");
    setDetailId(null);
    toast.success(t("quotationTemplates.saved"));
    void Promise.all([
      utils.sariBrain.quotationTemplates.workspace.invalidate(),
      utils.sariBrain.quotationTemplates.detail.invalidate(),
      utils.sariBrain.getQuotationTemplates.invalidate(),
      utils.sariBrain.quotations.sendWorkspace.invalidate(),
    ]).catch(() => {
      if (alive()) setNotice("failed");
    });
  }
  async function run(a: TemplateWriteInput) {
    if (lock.current || storageError || !alive() || !canManage) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    let retained = false;
    try {
      persist({ ...cacheRef.current, attempt: a });
      retained = true;
      await completed(await mutation.mutateAsync(a), a);
    } catch (error) {
      if (!alive()) return;
      if (!retained) {
        setStorageError(true);
        return;
      }
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (
        [
          "CONFLICT",
          "BAD_REQUEST",
          "PRECONDITION_FAILED",
          "NOT_FOUND",
        ].includes(code || "")
      ) {
        try {
          persist({ draft: cacheRef.current.draft });
        } catch {
          setStorageError(true);
        }
        setConflict(true);
        setReviewId(a.action === "create" ? null : a.id);
        setLatest(null);
        setConsent(false);
        setNotice(
          code === "PRECONDITION_FAILED"
            ? "limitReached"
            : code === "NOT_FOUND"
              ? "missing"
              : "conflict"
        );
      } else setNotice("uncertain");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function recover() {
    const a = cacheRef.current.attempt;
    if (!a || lock.current || !canManage || !alive()) return;
    lock.current = true;
    setBusy(true);
    try {
      const receipt = await utils.sariBrain.quotationTemplates.receipt.fetch({
        requestId: a.requestId,
      });
      if (!alive()) return;
      if (receipt) await completed(receipt, a);
      else setNotice("notRecorded");
    } catch {
      if (alive()) setNotice("failed");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  function submit() {
    const d = cacheRef.current.draft;
    if (!d || attempt || busy || conflict || storageError || !canManage) return;
    const parsed = templateFields.safeParse({
      ...d.form,
      headerImageUrl: d.form.headerImageUrl.trim() || null,
      footerText: d.form.footerText || null,
      termsText: d.form.termsText || null,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues.map(issue => String(issue.path[0])));
      setNotice("checkFields");
      return;
    }
    const requestId = crypto.randomUUID();
    void run(
      d.mode === "create"
        ? { action: "create", requestId, fields: parsed.data }
        : {
            action: "update",
            requestId,
            id: d.id,
            expectedDigest: d.digest,
            fields: parsed.data,
          }
    );
  }
  async function reviewLatest() {
    if (lock.current || attempt || storageError) return;
    lock.current = true;
    setBusy(true);
    try {
      const id =
        draft?.mode === "update" ? draft.id : (reviewId ?? deleting?.id);
      if (id) {
        const current = await utils.sariBrain.quotationTemplates.detail.fetch({
          id,
        });
        if (!alive()) return;
        if (!current || current.merchantId !== merchantId || current.id !== id)
          throw Error();
        setLatest(current);
        setNotice("reviewLatest");
      } else {
        const current = await query.refetch();
        if (current.error || current.data?.merchantId !== merchantId)
          throw Error();
        if (alive()) {
          setConflict(false);
          setNotice("reviewAgain");
        }
      }
    } catch {
      if (alive()) setNotice("missing");
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  function adoptLatest(keepEdits: boolean) {
    if (!latest || !latest.editable || attempt || busy || storageError) return;
    try {
      if (draft?.mode === "update") {
        persist({
          draft: {
            ...draft,
            digest: latest.digest,
            form: keepEdits ? draft.form : formOf(latest),
          },
        });
      } else if (reviewId) {
        setDeleting(latest);
        setConsent(false);
      }
      setConflict(false);
      setLatest(null);
      setNotice("reviewAgain");
    } catch {
      setStorageError(true);
    }
  }
  async function copy() {
    if (!row || row.truncated) return;
    try {
      await navigator.clipboard.writeText(
        [row.name, row.headerImageUrl, row.termsText, row.footerText]
          .filter(Boolean)
          .join("\n\n")
      );
      if (alive()) toast.success(t("quotationTemplates.copied"));
    } catch {
      if (alive()) setNotice("failed");
    }
  }
  const noticeCopy: Record<string, string> = {
    failed: t("quotationTemplates.failed"),
    uncertain: t("quotationTemplates.uncertain"),
    notRecorded: t("quotationTemplates.notRecorded"),
    conflict: t("quotationTemplates.conflict"),
    limitReached: t("quotationTemplates.limitReached"),
    missing: t("quotationTemplates.missing"),
    reviewLatest: t("quotationTemplates.reviewLatest"),
    reviewAgain: t("quotationTemplates.reviewAgain"),
    checkFields: t("quotationTemplates.checkFields"),
  };
  const actions = (
    <>
      {notice && (
        <p className="qt-note" role="status">
          {noticeCopy[notice]}
        </p>
      )}
      {storageError && (
        <div role="alert" className="qt-note">
          <p>{t("quotationTemplates.storageError")}</p>
          <button type="button" onClick={retryStorage}>
            {t("quotationTemplates.retryStorage")}
          </button>
        </div>
      )}
      {attempt && (
        <section className="qt-note">
          <h3>{t("quotationTemplates.pending")}</h3>
          <p>{t("quotationTemplates.uncertain")}</p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy || !canManage}
              onClick={() => void recover()}
            >
              {t("quotationTemplates.checkReceipt")}
            </button>
            <button
              type="button"
              disabled={busy || !canManage || storageError}
              onClick={() => void run(attempt)}
            >
              {t("quotationTemplates.retrySame")}
            </button>
          </div>
        </section>
      )}
      {conflict && !attempt && (
        <section className="qt-note">
          <p>{t("quotationTemplates.conflictHint")}</p>
          <button
            type="button"
            disabled={busy || storageError}
            onClick={() => void reviewLatest()}
          >
            {t("quotationTemplates.loadLatest")}
          </button>
        </section>
      )}
      {latest && (
        <section className="qt-panel">
          <h2>{t("quotationTemplates.latestTitle")}</h2>
          <TemplatePreview value={latest} truncated={latest.truncated} />
          <div className="qt-tools">
            <button
              type="button"
              disabled={!latest.editable || busy || storageError}
              onClick={() => adoptLatest(false)}
            >
              {t("quotationTemplates.useLatest")}
            </button>
            {draft?.mode === "update" && (
              <button
                type="button"
                disabled={!latest.editable || busy || storageError}
                onClick={() => adoptLatest(true)}
              >
                {t("quotationTemplates.keepEdits")}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
  const field = (
    key: "name" | "headerImageUrl" | "termsText" | "footerText",
    multiline = false
  ) => {
    if (!draft) return null;
    const invalid = errors.includes(key),
      label = {
        name: t("quotationTemplates.name"),
        headerImageUrl: t("quotationTemplates.image"),
        termsText: t("quotationTemplates.terms"),
        footerText: t("quotationTemplates.footer"),
      }[key],
      props = {
        id: `tt-${key}`,
        value: draft.form[key],
        maxLength: key === "name" ? 255 : key === "headerImageUrl" ? 500 : 5000,
        disabled: busy || !!attempt || storageError || !canManage,
        "aria-invalid": invalid,
        "aria-describedby": invalid ? `tt-${key}-error` : undefined,
        onChange: (
          e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        ) =>
          storeDraft({
            ...draft,
            form: { ...draft.form, [key]: e.target.value },
          }),
      };
    return (
      <label className="tt-field" htmlFor={props.id}>
        {label}
        {key === "name" && " *"}
        {multiline ? (
          <textarea {...props} rows={6} />
        ) : (
          <input
            {...props}
            type={key === "headerImageUrl" ? "url" : "text"}
            dir={key === "headerImageUrl" ? "ltr" : "auto"}
          />
        )}
        <small>
          {t("quotationTemplates.characters", {
            used: draft.form[key].length,
            limit: props.maxLength,
          })}
        </small>
        {invalid && (
          <span id={`tt-${key}-error`} className="tt-error">
            {t(
              key === "name"
                ? "quotationTemplates.nameError"
                : key === "headerImageUrl"
                  ? "quotationTemplates.imageError"
                  : "quotationTemplates.textError"
            )}
          </span>
        )}
      </label>
    );
  };
  return (
    <div
      className="qt-workspace tt-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
      aria-busy={busy}
    >
      <header className="qt-header">
        <div>
          <a href={href("/merchant/sales-hub")}>
            {t("quotationTemplates.backToQuotes")}
          </a>
          <h1>{t("quotationTemplates.title")}</h1>
          <p>{t("quotationTemplates.subtitle")}</p>
        </div>
        <div className="qt-tools">
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            {t("quotationTemplates.refresh")}
          </button>
          {view !== "list" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setView("list");
                setDetailId(null);
              }}
            >
              {t("quotationTemplates.back")}
            </button>
          ) : (
            <button
              type="button"
              className="qt-primary"
              disabled={
                !canManage ||
                busy ||
                !!draft ||
                !!attempt ||
                storageError ||
                (data?.total ?? 0) >= 20
              }
              onClick={newDraft}
            >
              {t("quotationTemplates.create")}
            </button>
          )}
        </div>
      </header>
      {actions}
      {draft && view !== "edit" && (
        <div className="qt-note">
          <p>{t("quotationTemplates.draftHint")}</p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("edit")}
            >
              {t("quotationTemplates.resume")}
            </button>
            <button
              type="button"
              disabled={busy || !!attempt || storageError}
              onClick={() => setDiscard(true)}
            >
              {t("quotationTemplates.discard")}
            </button>
          </div>
        </div>
      )}
      {discard && (
        <section className="qt-note">
          <p>{t("quotationTemplates.discardConfirm")}</p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy || !!attempt || storageError}
              onClick={() => {
                try {
                  clearTemplateCache(scope, epoch.current);
                  cacheRef.current = {};
                  setCache({});
                  setDiscard(false);
                  setView("list");
                  setConflict(false);
                  setLatest(null);
                } catch {
                  setStorageError(true);
                }
              }}
            >
              {t("quotationTemplates.confirmDiscard")}
            </button>
            <button type="button" onClick={() => setDiscard(false)}>
              {t("quotationTemplates.cancel")}
            </button>
          </div>
        </section>
      )}
      {!data ? (
        <WorkspaceState
          kind={query.error ? workspaceFailureKind(query.error) : "loading"}
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          {!canManage && (
            <p className="qt-note">{t("quotationTemplates.readOnly")}</p>
          )}
          {view === "list" && (
            <section className="qt-panel">
              <form
                className="qt-filters"
                onSubmit={event => {
                  event.preventDefault();
                  setSelection({ page: 1, search: search.trim() });
                }}
              >
                <label>
                  {t("quotationTemplates.search")}
                  <input
                    type="search"
                    value={search}
                    maxLength={100}
                    onChange={event => setSearch(event.target.value)}
                  />
                </label>
                <button type="submit">{t("quotationTemplates.find")}</button>
                {selection.search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSelection({ page: 1, search: "" });
                    }}
                  >
                    {t("quotationTemplates.clearSearch")}
                  </button>
                )}
              </form>
              <TemplateList
                data={data as TemplateWorkspace}
                onOpen={value => {
                  setDetailId(value.id);
                  setView("detail");
                  setNotice("");
                }}
                onPage={page => setSelection({ ...selection, page })}
              />
            </section>
          )}
          {view === "detail" &&
            (row ? (
              <section className="qt-panel">
                <TemplatePreview value={row} truncated={row.truncated} />
                <div className="qt-tools tt-preview-actions">
                  <button
                    type="button"
                    disabled={busy || row.truncated}
                    onClick={() => void copy()}
                  >
                    {t("quotationTemplates.copy")}
                  </button>
                  <button
                    type="button"
                    className="qt-primary"
                    disabled={
                      !canManage ||
                      busy ||
                      !row.editable ||
                      !!draft ||
                      !!attempt ||
                      storageError
                    }
                    onClick={edit}
                  >
                    {t("quotationTemplates.edit")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !canManage ||
                      busy ||
                      row.truncated ||
                      !!draft ||
                      !!attempt ||
                      storageError
                    }
                    onClick={() => {
                      setDeleting(structuredClone(row));
                      setConsent(false);
                      setConflict(false);
                      setLatest(null);
                    }}
                  >
                    {t("quotationTemplates.delete")}
                  </button>
                </div>
              </section>
            ) : (
              <WorkspaceState
                kind={
                  detailQuery.error
                    ? workspaceFailureKind(detailQuery.error)
                    : detailQuery.isFetching
                      ? "loading"
                      : "missing"
                }
                onRetry={() => void detailQuery.refetch()}
              />
            ))}
          {view === "edit" && draft && (
            <div className="tt-editor-layout">
              <form
                noValidate
                className="qt-panel tt-form"
                ref={formNode}
                onSubmit={event => {
                  event.preventDefault();
                  submit();
                }}
              >
                <h2>
                  {t(
                    draft.mode === "create"
                      ? "quotationTemplates.newTitle"
                      : "quotationTemplates.editTitle"
                  )}
                </h2>
                <p>{t("quotationTemplates.draftHint")}</p>
                {field("name")}
                {field("termsText", true)}
                {field("footerText", true)}
                <details
                  open={errors.includes("headerImageUrl") ? true : undefined}
                >
                  <summary>{t("quotationTemplates.moreOptions")}</summary>
                  {field("headerImageUrl")}
                  <p>{t("quotationTemplates.imageHint")}</p>
                  <label className="tt-check">
                    <input
                      type="checkbox"
                      checked={draft.form.isDefault}
                      disabled={busy || !!attempt || storageError || !canManage}
                      onChange={event =>
                        storeDraft({
                          ...draft,
                          form: {
                            ...draft.form,
                            isDefault: event.target.checked,
                          },
                        })
                      }
                    />
                    {t("quotationTemplates.preferred")}
                  </label>
                  <p>{t("quotationTemplates.defaultHint")}</p>
                </details>
                <div className="qt-tools">
                  <button
                    type="submit"
                    className="qt-primary"
                    disabled={
                      busy ||
                      !!attempt ||
                      conflict ||
                      storageError ||
                      !canManage
                    }
                  >
                    {t("quotationTemplates.save")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !!attempt || storageError}
                    onClick={() => setDiscard(true)}
                  >
                    {t("quotationTemplates.discard")}
                  </button>
                </div>
              </form>
              <div className="qt-panel">
                <TemplatePreview value={draft.form} />
              </div>
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={open => {
          if (!open && !busy) {
            setDeleting(null);
            setConsent(false);
            setLatest(null);
          }
        }}
      >
        <DialogContent
          className="qsend-dialog tt-delete"
          closeLabel={t("quotationTemplates.close")}
        >
          <DialogHeader>
            <DialogTitle>{t("quotationTemplates.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("quotationTemplates.deleteHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="qsend-body">
            {deleting && <TemplatePreview value={deleting} />}
            <label className="tt-check">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || !!attempt || conflict}
                onChange={event => setConsent(event.target.checked)}
              />
              {t("quotationTemplates.deleteConsent")}
            </label>
            {notice && <p role="status">{noticeCopy[notice]}</p>}
            {attempt && (
              <button
                type="button"
                disabled={busy || !canManage}
                onClick={() => void recover()}
              >
                {t("quotationTemplates.checkReceipt")}
              </button>
            )}
            {conflict && <p>{t("quotationTemplates.closeToReview")}</p>}
          </div>
          <div className="qsend-footer">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setConsent(false);
              }}
            >
              {t("quotationTemplates.cancel")}
            </button>
            <button
              type="button"
              disabled={
                !consent ||
                busy ||
                !!attempt ||
                conflict ||
                storageError ||
                !canManage
              }
              onClick={() => {
                if (deleting)
                  void run({
                    action: "delete",
                    requestId: crypto.randomUUID(),
                    id: deleting.id,
                    expectedDigest: deleting.digest,
                  });
              }}
            >
              {t("quotationTemplates.confirmDelete")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
