import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  blankQuotationForm,
  readQuotationEditorCache,
  saveQuotationEditorCache,
  clearQuotationEditorCache,
  quotationFormInput,
  type QuotationForm,
  type QuotationActionAttempt,
} from "@/lib/quotation-editor-cache";
import {
  quotationTargetInput,
  type QuotationReceipt,
} from "@shared/quotation-mutations";
import {
  quotationSelectionKey,
  type QuotationSelection,
  type QuotationDetail,
} from "@shared/quotation-workspace";
import { quotationPlainText, quotationDisplay } from "@/lib/quotation-display";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QuotationReport, QuotationDetailView } from "./QuotationReport";
import { QuotationEditor } from "./QuotationEditor";
import { QuotationDeliveryDialog } from "./QuotationDeliveryDialog";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/quotation-send.css";
type Modal =
  | { kind: "create" }
  | { kind: "target"; period: string; revision: number | null }
  | { kind: "status"; row: QuotationDetail; status: "accepted" | "rejected" };
export function QuotationWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA",
    f = quotationDisplay(t, language),
    utils = trpc.useUtils();
  const merchantId = Number(scope.split(":")[1]),
    epoch = useRef(knowledgeCacheEpoch()),
    mounted = useRef(true),
    lock = useRef(false);
  const [selection, setSelection] = useState<QuotationSelection>({
    search: "",
    status: "all",
    page: 1,
    pageSize: 20,
  });
  const query = trpc.sariBrain.quotations.workspace.useQuery(selection, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [detailId, setDetailId] = useState<number | null>(null),
    [sendId, setSendId] = useState<number | null>(null);
  const detailQuery = trpc.sariBrain.quotations.detail.useQuery(
    { id: detailId ?? 1 },
    { enabled: detailId !== null, staleTime: 0, refetchOnMount: "always" }
  );
  const data =
    !query.error &&
    query.data?.merchantId === merchantId &&
    quotationSelectionKey(query.data.selection) ===
      quotationSelectionKey(selection)
      ? query.data
      : undefined;
  const detail =
    !detailQuery.error &&
    detailQuery.data?.merchantId === merchantId &&
    detailQuery.data.id === detailId
      ? detailQuery.data
      : undefined;
  const create = trpc.sariBrain.quotations.create.useMutation(),
    change = trpc.sariBrain.quotations.change.useMutation(),
    target = trpc.sariBrain.quotations.target.useMutation();
  const [modal, setModal] = useState<Modal | null>(null),
    [form, setForm] = useState<QuotationForm>(blankQuotationForm),
    [amount, setAmount] = useState("");
  const [attempt, setAttempt] = useState<QuotationActionAttempt | null>(null),
    attemptRef = useRef<QuotationActionAttempt | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [fields, setFields] = useState<Record<string, boolean>>({}),
    [conflict, setConflict] = useState(false),
    [storageError, setStorageError] = useState(false),
    [draftAvailable, setDraftAvailable] = useState(false),
    [discard, setDiscard] = useState(false);
  const usable = data && !query.isFetching ? data : undefined,
    canManage = !!usable?.canManage,
    canTarget = !!usable?.canSetTarget;
  const alive = () =>
    mounted.current && knowledgeCacheEpoch() === epoch.current;
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = readQuotationEditorCache(scope);
      if (saved.form) {
        setForm(saved.form);
        setDraftAvailable(true);
      }
      if (saved.attempt) {
        attemptRef.current = saved.attempt;
        setAttempt(saved.attempt);
      }
    } catch {
      setStorageError(true);
    }
    return () => {
      mounted.current = false;
    };
  }, [scope]);
  useEffect(() => {
    if (!draftAvailable && !attempt) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftAvailable, attempt]);
  const persist = (
    next: QuotationActionAttempt | null,
    nextForm = form,
    hasDraft = draftAvailable
  ) => {
    saveQuotationEditorCache(
      scope,
      {
        ...(hasDraft ? { form: nextForm } : {}),
        ...(next ? { attempt: next } : {}),
      },
      epoch.current
    );
    attemptRef.current = next;
    setAttempt(next);
  };
  const updateForm = (value: QuotationForm) => {
    if (storageError) return;
    setForm(value);
    setDraftAvailable(true);
    setFields({});
    setNotice("");
    try {
      persist(attemptRef.current, value, true);
    } catch {
      setStorageError(true);
    }
  };
  function retryStorage() {
    try {
      // Validate the saved entry before replacing it; never overwrite an unreadable attempt.
      const saved = readQuotationEditorCache(scope);
      const retained = attemptRef.current ?? saved.attempt ?? null;
      const nextForm = draftAvailable ? form : (saved.form ?? form);
      persist(retained, nextForm, draftAvailable || !!saved.form);
      setForm(nextForm);
      setDraftAvailable(draftAvailable || !!saved.form);
      setStorageError(false);
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
      if (!alive()) return;
      if (result.error || result.data?.merchantId !== merchantId) throw Error();
      toast.success(t("quotationWorkspace.refreshed"));
    } catch {
      if (alive()) toast.error(t("quotationWorkspace.failed"));
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  const openCreate = () => {
    if (!canManage || busy || attempt) return;
    setFields({});
    setNotice("");
    setConflict(false);
    setDiscard(false);
    setModal({ kind: "create" });
  };
  const openTarget = () => {
    if (!canTarget || busy || attempt || !data) return;
    setFields({});
    setNotice("");
    setConflict(false);
    setAmount(
      data.target?.amountMinor === null || !data.target
        ? ""
        : String(data.target.amountMinor / 100)
    );
    setModal({
      kind: "target",
      period: data.currentMonth.from.slice(0, 7),
      revision: data.target?.revision ?? null,
    });
  };
  const openStatus = (status: "accepted" | "rejected") => {
    if (
      !canManage ||
      !detail ||
      detailQuery.isFetching ||
      attempt ||
      busy ||
      detail.managed
    )
      return;
    setNotice("");
    setConflict(false);
    setModal({ kind: "status", row: structuredClone(detail), status });
    setDetailId(null);
  };
  async function completed(
    receipt: QuotationReceipt,
    a: QuotationActionAttempt
  ) {
    if (!alive()) return;
    if (
      receipt.merchantId !== merchantId ||
      receipt.requestId !== a.input.requestId ||
      receipt.kind !== a.kind ||
      (a.kind === "status" && receipt.recordId !== a.input.id)
    )
      throw Error("Receipt mismatch");
    // Clear only this retained attempt. A failed cleanup keeps the receipt recoverable.
    if (a.kind === "create") {
      clearQuotationEditorCache(scope, epoch.current);
      setDraftAvailable(false);
      setForm(blankQuotationForm());
      attemptRef.current = null;
      setAttempt(null);
    } else persist(null);
    setModal(null);
    setNotice("");
    setConflict(false);
    toast.success(t("quotationWorkspace.saved"));
    if (a.kind !== "target") setDetailId(receipt.recordId);
    void Promise.all([
      utils.sariBrain.quotations.workspace.invalidate(),
      utils.sariBrain.quotations.detail.invalidate(),
    ]).catch(() => {
      if (alive()) toast.error(t("quotationWorkspace.failed"));
    });
  }
  async function run(a: QuotationActionAttempt) {
    if (
      lock.current ||
      storageError ||
      !alive() ||
      (a.kind === "target" ? !canTarget : !canManage)
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    let retained = false;
    try {
      persist(a);
      retained = true;
      const receipt =
        a.kind === "create"
          ? await create.mutateAsync(a.input)
          : a.kind === "status"
            ? await change.mutateAsync(a.input)
            : await target.mutateAsync(a.input);
      await completed(receipt, a);
    } catch (error) {
      if (!alive()) return;
      if (!retained) {
        setStorageError(true);
        setNotice(t("quotationWorkspace.storageError"));
        return;
      }
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" || code === "BAD_REQUEST") {
        try {
          persist(null);
        } catch {
          setStorageError(true);
        }
        setConflict(true);
        setNotice(t("quotationWorkspace.conflict"));
      } else setNotice(t("quotationWorkspace.uncertain"));
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  async function recover() {
    const a = attemptRef.current;
    if (!a || lock.current || !alive()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const receipt = await utils.sariBrain.quotations.receipt.fetch({
        requestId: a.input.requestId,
      });
      if (!alive()) return;
      if (receipt) await completed(receipt, a);
      else setNotice(t("quotationWorkspace.notRecorded"));
    } catch {
      if (alive()) setNotice(t("quotationWorkspace.failed"));
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  function submit() {
    if (!modal || attemptRef.current || busy || conflict || storageError)
      return;
    const requestId = crypto.randomUUID();
    if (modal.kind === "create") {
      const parsed = quotationFormInput(form, requestId);
      if (!parsed.success) {
        setFields(
          Object.fromEntries(
            parsed.error.issues.map(i => [i.path.join("."), true])
          )
        );
        setNotice(t("quotationWorkspace.checkFields"));
        return;
      }
      void run({ kind: "create", input: parsed.data });
    } else if (modal.kind === "target") {
      const parsed = quotationTargetInput.safeParse({
        requestId,
        period: modal.period,
        expectedRevision: modal.revision,
        amount: amount.trim() ? Number(amount) : NaN,
      });
      if (!parsed.success) {
        setFields({ amount: true });
        return;
      }
      void run({ kind: "target", input: parsed.data });
    } else {
      void run({
        kind: "status",
        input: {
          requestId,
          id: modal.row.id,
          expectedRevision: modal.row.revision,
          expectedStatus: modal.row.status,
          status: modal.status,
        },
      });
    }
  }
  async function reviewAgain() {
    if (!modal || lock.current || attemptRef.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (modal.kind === "target") {
        const r = await query.refetch();
        if (r.error || r.data?.merchantId !== merchantId) throw Error();
        if (alive())
          setModal({
            kind: "target",
            period: r.data.currentMonth.from.slice(0, 7),
            revision: r.data.target?.revision ?? null,
          });
      } else if (modal.kind === "status") {
        const r = await utils.sariBrain.quotations.detail.fetch({
          id: modal.row.id,
        });
        if (r.merchantId !== merchantId || r.managed) throw Error();
        if (alive()) setModal({ ...modal, row: r });
      }
      if (alive()) {
        setConflict(false);
        setNotice(t("quotationWorkspace.reviewUpdated"));
      }
    } catch {
      if (alive()) setNotice(t("quotationWorkspace.failed"));
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  }
  const resume = () => {
    const a = attemptRef.current;
    if (!a) return;
    setNotice(t("quotationWorkspace.uncertain"));
    if (a.kind === "create") setModal({ kind: "create" });
    else if (a.kind === "target") {
      setAmount(String(a.input.amount));
      setModal({
        kind: "target",
        period: a.input.period,
        revision: a.input.expectedRevision,
      });
    } else {
      setModal(null);
      setDetailId(a.input.id);
    }
  };
  async function copy() {
    if (!detail || detailQuery.isFetching) return;
    try {
      await navigator.clipboard.writeText(
        quotationPlainText(detail, t, language)
      );
      if (alive()) toast.success(t("quotationWorkspace.copied"));
    } catch {
      if (alive()) toast.error(t("quotationWorkspace.copyFailed"));
    }
  }
  const actionState = (
    <>
      {notice && (
        <p role="status" className="qt-note">
          {notice}
        </p>
      )}
      {attempt && (
        <div className="qt-note">
          <p>{t("quotationWorkspace.pending")}</p>
          <div className="qt-tools">
            <button
              type="button"
              disabled={busy}
              onClick={() => void recover()}
            >
              {t("quotationWorkspace.checkReceipt")}
            </button>
            <button
              type="button"
              disabled={
                busy ||
                storageError ||
                (attempt.kind === "target" ? !canTarget : !canManage)
              }
              onClick={() => void run(attempt)}
            >
              {t("quotationWorkspace.retryAttempt")}
            </button>
            {!modal && (
              <button type="button" disabled={busy} onClick={resume}>
                {t("quotationWorkspace.openAttempt")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="qt-workspace" dir={language === "ar-SA" ? "rtl" : "ltr"}>
      <header className="qt-header">
        <div>
          <h1>{t("quotationWorkspace.title")}</h1>
          <p>{t("quotationWorkspace.subtitle")}</p>
        </div>
        <div className="qt-tools">
          <button
            type="button"
            disabled={busy || query.isFetching}
            onClick={() => void refresh()}
          >
            {t("quotationWorkspace.refresh")}
          </button>
          <a href={href("/merchant/quotation-templates")}>
            {t("quotationWorkspace.templates")}
          </a>
          <button
            className="qt-primary"
            type="button"
            disabled={!canManage || busy || !!attempt}
            onClick={openCreate}
          >
            {draftAvailable
              ? t("quotationWorkspace.resumeDraft")
              : t("quotationWorkspace.create")}
          </button>
        </div>
      </header>
      {storageError && (
        <div role="alert" className="qt-note">
          {t("quotationWorkspace.storageError")}
          <button type="button" onClick={retryStorage}>
            {t("quotationWorkspace.retryStorage")}
          </button>
        </div>
      )}
      {data && !data.canManage && (
        <p className="qt-note">{t("quotationWorkspace.readOnly")}</p>
      )}
      {!modal && actionState}
      {query.error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void refresh()}
        />
      ) : !data || query.isFetching ? (
        <WorkspaceState inline kind="loading" />
      ) : (
        <QuotationReport
          href={href}
          key={quotationSelectionKey(selection)}
          data={data}
          t={t}
          language={language}
          canSetTarget={canTarget && !busy && !attempt}
          onTarget={openTarget}
          onSelect={setSelection}
          onOpen={setDetailId}
        />
      )}
      {detailId !== null && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open && !busy) setDetailId(null);
          }}
        >
          <DialogContent
            className="qsend-dialog qt-editor"
            closeLabel={t("quotationWorkspace.close")}
            dir={language === "ar-SA" ? "rtl" : "ltr"}
          >
            <DialogHeader>
              <DialogTitle>{t("quotationWorkspace.detail")}</DialogTitle>
              <DialogDescription>
                {t("quotationWorkspace.detailNote")}
              </DialogDescription>
            </DialogHeader>
            <div className="qsend-body">
              {detailQuery.error ? (
                <WorkspaceState
                  inline
                  kind={workspaceFailureKind(detailQuery.error)}
                  onRetry={() => void detailQuery.refetch()}
                />
              ) : !detail || detailQuery.isFetching ? (
                <WorkspaceState inline kind="loading" />
              ) : (
                <QuotationDetailView
                  data={detail}
                  t={t}
                  language={language}
                  href={href}
                />
              )}
            </div>
            <div className="qt-detail-actions">
              <button
                type="button"
                disabled={
                  !detail ||
                  detailQuery.isFetching ||
                  detail.rawItems !== null ||
                  detail.itemsTruncated
                }
                onClick={() => void copy()}
              >
                {t("quotationWorkspace.copy")}
              </button>
              <button
                type="button"
                disabled={
                  !canManage || !detail || detailQuery.isFetching || busy
                }
                onClick={() => {
                  setSendId(detailId);
                  setDetailId(null);
                }}
              >
                {t("quotationSend.open")}
              </button>
              {detail &&
                !detail.managed &&
                ["draft", "sent", "viewed"].includes(detail.status) && (
                  <>
                    <button
                      type="button"
                      disabled={
                        !canManage ||
                        busy ||
                        !!attempt ||
                        detailQuery.isFetching ||
                        detail.validityElapsed
                      }
                      onClick={() => openStatus("accepted")}
                    >
                      {t("quotationWorkspace.markAccepted")}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canManage ||
                        busy ||
                        !!attempt ||
                        detailQuery.isFetching
                      }
                      onClick={() => openStatus("rejected")}
                    >
                      {t("quotationWorkspace.markRejected")}
                    </button>
                  </>
                )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {modal && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open && !busy) {
              setModal(null);
              setDiscard(false);
            }
          }}
        >
          <DialogContent
            className="qsend-dialog qt-editor"
            closeLabel={t("quotationWorkspace.close")}
            dir={language === "ar-SA" ? "rtl" : "ltr"}
          >
            <DialogHeader>
              <DialogTitle>
                {modal.kind === "create"
                  ? t("quotationWorkspace.create")
                  : modal.kind === "target"
                    ? t("quotationWorkspace.editTarget")
                    : t("quotationWorkspace.changeStatus")}
              </DialogTitle>
              <DialogDescription>
                {modal.kind === "create"
                  ? t("quotationWorkspace.draftSavedLocal")
                  : t("quotationWorkspace.reviewNote")}
              </DialogDescription>
            </DialogHeader>
            <div className="qsend-body">
              {modal.kind === "create" ? (
                <QuotationEditor
                  form={form}
                  onChange={updateForm}
                  errors={fields}
                  disabled={busy || !!attempt || !canManage || storageError}
                  t={t}
                  language={language}
                />
              ) : modal.kind === "target" ? (
                <div className="qt-editor-fields">
                  <p>
                    {t("quotationWorkspace.period")}: <bdi>{modal.period}</bdi>{" "}
                    · SAR
                  </p>
                  <p className="qt-note">
                    {t("quotationWorkspace.targetBasis")}
                  </p>
                  <label htmlFor="qt-target-amount">
                    {t("quotationWorkspace.targetAmount")}
                    <input
                      id="qt-target-amount"
                      dir="ltr"
                      inputMode="decimal"
                      value={amount}
                      maxLength={15}
                      disabled={busy || !!attempt || !canTarget}
                      aria-invalid={!!fields.amount}
                      onChange={e => {
                        setAmount(e.target.value);
                        setFields({});
                      }}
                    />
                    {fields.amount && (
                      <span role="alert" className="qt-field-error">
                        {t("quotationWorkspace.invalidAmount")}
                      </span>
                    )}
                  </label>
                </div>
              ) : (
                <>
                  <QuotationDetailView
                    href={href}
                    data={modal.row}
                    t={t}
                    language={language}
                  />
                  <p className="qt-note">
                    {t("quotationWorkspace.changeTo")}:{" "}
                    <strong>{f.statuses[modal.status]}</strong>
                  </p>
                </>
              )}
              {actionState}
              {conflict && (
                <button
                  type="button"
                  disabled={busy || !!attempt}
                  onClick={() => void reviewAgain()}
                >
                  {t("quotationWorkspace.reviewLatest")}
                </button>
              )}
            </div>
            <footer className="qt-editor-footer">
              {modal.kind === "create" &&
                !attempt &&
                (discard ? (
                  <div className="qt-note">
                    <p>{t("quotationWorkspace.discardConfirm")}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        try {
                          clearQuotationEditorCache(scope, epoch.current);
                          setForm(blankQuotationForm());
                          setDraftAvailable(false);
                          setDiscard(false);
                          setModal(null);
                        } catch {
                          setStorageError(true);
                        }
                      }}
                    >
                      {t("quotationWorkspace.confirmDiscard")}
                    </button>
                    <button type="button" onClick={() => setDiscard(false)}>
                      {t("quotationWorkspace.keepDraft")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDiscard(true)}
                  >
                    {t("quotationWorkspace.discard")}
                  </button>
                ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                {modal.kind === "create"
                  ? t("quotationWorkspace.closeKeep")
                  : t("quotationWorkspace.cancel")}
              </button>
              <button
                type="button"
                className="qt-primary"
                disabled={
                  busy ||
                  !!attempt ||
                  conflict ||
                  storageError ||
                  (modal.kind === "target" ? !canTarget : !canManage)
                }
                onClick={submit}
              >
                {busy
                  ? t("quotationWorkspace.saving")
                  : modal.kind === "create"
                    ? t("quotationWorkspace.saveDraft")
                    : t("quotationWorkspace.confirmSave")}
              </button>
            </footer>
          </DialogContent>
        </Dialog>
      )}
      {sendId !== null && (
        <QuotationDeliveryDialog
          key={sendId}
          quotationId={sendId}
          scope={scope}
          onClose={() => setSendId(null)}
          onSaved={() => {
            void utils.sariBrain.quotations.workspace.invalidate();
            void utils.sariBrain.quotations.detail.invalidate();
          }}
        />
      )}
    </div>
  );
}
