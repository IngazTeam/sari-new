import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readCustomerCache,
  saveCustomerCache,
  clearCustomerCache,
  type CustomerCache,
} from "@/lib/customer-workspace-cache";
import {
  customerAnnotationsSchema,
  customerAnnotationWrite,
  customerAnnotationReceipt,
  customerTags,
  type CustomerAnnotationWrite,
} from "@shared/customer-annotations";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { CustomerPagination, customerDate } from "./CustomerWorkspaceView";

export function CustomerAnnotations({
  scope,
  customerKey,
}: {
  scope: string;
  customerKey: string;
}) {
  const { t, i18n } = useTranslation(),
    locale = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA",
    utils = trpc.useUtils(),
    [actorId, merchantId] = scope.split(":").map(Number);
  const [page, setPage] = useState(1),
    [cache, setCache] = useState<CustomerCache>({ draft: { note: "" } }),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [discard, setDiscard] = useState(false);
  const cacheRef = useRef(cache),
    alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    lock = useRef(false);
  const query = trpc.customers.annotations.read.useQuery(
      { key: customerKey, page },
      { staleTime: 0, refetchOnMount: "always", retry: false }
    ),
    mutation = trpc.customers.annotations.write.useMutation(),
    parsed = customerAnnotationsSchema.safeParse(query.data);
  const data =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    parsed.data.key === customerKey &&
    parsed.data.selection.key === customerKey &&
    parsed.data.selection.page === page
      ? parsed.data
      : null;
  const ready =
    !!data &&
    !query.error &&
    !query.isFetching &&
    !query.isLoading &&
    query.fetchStatus !== "paused";
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  const persist = (value: CustomerCache) => {
    saveCustomerCache(scope, customerKey, value, epoch.current);
    cacheRef.current = value;
    setCache(value);
    setStorageError(false);
  };
  const load = () => {
    try {
      const value = readCustomerCache(scope, customerKey);
      cacheRef.current = value;
      setCache(value);
      setLoaded(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [scope, customerKey]);
  const pending = cache.attempt,
    editable =
      ready && data!.canManage && loaded && !busy && !pending && !storageError;
  const tags =
    cache.draft.tags ??
    (ready
      ? { values: data!.tags, baseline: data!.tags, revision: data!.revision }
      : undefined);
  const tagChanged =
      !!tags && JSON.stringify(tags.values) !== JSON.stringify(tags.baseline),
    conflict =
      !!cache.draft.tags &&
      ready &&
      cache.draft.tags.revision !== data!.revision;
  useEffect(() => {
    if (!cache.draft.note && !tagChanged && !cache.draft.newTag && !pending)
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [cache, tagChanged, pending]);
  const edit = (draft: CustomerCache["draft"]) => {
    if (!loaded || pending || busy) return;
    const value = { ...cacheRef.current, draft };
    try {
      persist(value);
    } catch {
      cacheRef.current = value;
      setCache(value);
      setStorageError(true);
    }
  };
  const accept = (raw: unknown, input: CustomerAnnotationWrite) => {
    const result = customerAnnotationReceipt.parse(raw);
    if (
      result.merchantId !== merchantId ||
      result.actorId !== actorId ||
      result.key !== customerKey ||
      result.requestId !== input.requestId ||
      result.kind !== input.kind ||
      (input.kind === "note" && result.noteId === null) ||
      (input.kind === "tags" &&
        (result.revision === null ||
          JSON.stringify(result.tags) !== JSON.stringify(input.tags)))
    )
      throw Error("Customer receipt mismatch");
    const draft = { ...cacheRef.current.draft };
    if (input.kind === "note") draft.note = "";
    else {
      delete draft.tags;
      draft.newTag = "";
    }
    try {
      persist({ draft });
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    setNotice(t("customerWorkspaceUx.saved", { request: result.requestId }));
    setPage(1);
    void query.refetch();
  };
  async function send(input: CustomerAnnotationWrite) {
    if (
      lock.current ||
      !current() ||
      !ready ||
      !data?.canManage ||
      !loaded ||
      storageError
    )
      return;
    if (
      cacheRef.current.attempt &&
      cacheRef.current.attempt.requestId !== input.requestId
    )
      return;
    try {
      persist({ ...cacheRef.current, attempt: input });
    } catch {
      setStorageError(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await mutation.mutateAsync(input);
      if (current()) accept(result, input);
    } catch (error) {
      if (current()) {
        const code = (error as any)?.data?.code;
        if (
          [
            "BAD_REQUEST",
            "FORBIDDEN",
            "NOT_FOUND",
            "CONFLICT",
            "PRECONDITION_FAILED",
          ].includes(code)
        ) {
          try {
            persist({ draft: cacheRef.current.draft });
          } catch {
            setStorageError(true);
          }
          setNotice(
            t(
              code === "CONFLICT"
                ? "customerWorkspaceUx.conflict"
                : "customerWorkspaceUx.saveFailed"
            )
          );
          void query.refetch();
        } else setNotice("");
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recover() {
    const input = cacheRef.current.attempt;
    if (!input || lock.current || !current() || !ready || !data?.canManage)
      return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await utils.customers.annotations.receipt.fetch(
        { requestId: input.requestId },
        { staleTime: 0 }
      );
      if (current()) {
        if (result) accept(result, input);
        else setNotice(t("customerWorkspaceUx.notFoundReceipt"));
      }
    } catch {
      if (current()) setNotice("");
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function saveNote() {
    const checked = customerAnnotationWrite.safeParse({
      kind: "note",
      key: customerKey,
      content: cache.draft.note,
      requestId: crypto.randomUUID(),
    });
    if (!checked.success) {
      setNotice(t("customerWorkspaceUx.noteRequired"));
      return;
    }
    void send(checked.data);
  }
  function addTag() {
    if (!tags) return;
    const next = customerTags.safeParse([
      ...tags.values,
      (cache.draft.newTag || "").trim(),
    ]);
    if (!next.success) {
      setNotice(t("customerWorkspaceUx.tagInvalid"));
      return;
    }
    edit({ ...cache.draft, newTag: "", tags: { ...tags, values: next.data } });
    setNotice("");
  }
  function saveTags() {
    if (!tags || !tagChanged || cache.draft.newTag) return;
    void send({
      kind: "tags",
      key: customerKey,
      requestId: crypto.randomUUID(),
      tags: tags.values,
      expectedRevision: tags.revision,
    });
  }
  return (
    <div className="cw-form">
      {notice && (
        <p className="cw-notice" role="status">
          {notice}
        </p>
      )}
      {storageError && (
        <div className="cw-panel" role="alert">
          <p>{t("customerWorkspaceUx.storageError")}</p>
          <button
            type="button"
            onClick={() => {
              if (!loaded) load();
              else
                try {
                  persist(cacheRef.current);
                } catch {
                  setStorageError(true);
                }
            }}
          >
            {t("customerWorkspaceUx.retryStorage")}
          </button>
        </div>
      )}
      {pending && (
        <div className="cw-panel" role="status">
          <p>{t("customerWorkspaceUx.pending")}</p>
          <code>{pending.requestId}</code>
          <div className="cw-actions">
            <button
              type="button"
              disabled={busy || !ready || !data?.canManage || storageError}
              onClick={() => void recover()}
            >
              {t("customerWorkspaceUx.recover")}
            </button>
            <button
              type="button"
              disabled={busy || !ready || !data?.canManage || storageError}
              onClick={() => void send(pending)}
            >
              {t("customerWorkspaceUx.retrySame")}
            </button>
          </div>
        </div>
      )}
      {!ready && (
        <WorkspaceState
          inline
          kind={
            query.error
              ? workspaceFailureKind(query.error)
              : query.fetchStatus === "paused"
                ? "offline"
                : query.isFetching || query.isLoading
                  ? "loading"
                  : "error"
          }
          onRetry={
            query.isFetching ||
            query.isLoading ||
            (query.error &&
              !["error", "offline"].includes(workspaceFailureKind(query.error)))
              ? undefined
              : () => void query.refetch()
          }
        />
      )}
      {ready && !data!.canManage && <p>{t("customerWorkspaceUx.readOnly")}</p>}
      <div className="cw-grid">
        <section className="cw-panel">
          <h2>{t("customerWorkspaceUx.notesTitle")}</h2>
          <p>{t("customerWorkspaceUx.notesHelp")}</p>
          <form
            className="cw-form"
            onSubmit={event => {
              event.preventDefault();
              if (editable) saveNote();
            }}
          >
            <label htmlFor="cw-note">
              {t("customerWorkspaceUx.noteLabel")}
            </label>
            <textarea
              id="cw-note"
              maxLength={2000}
              value={cache.draft.note}
              disabled={!editable}
              onChange={event =>
                edit({ ...cache.draft, note: event.target.value })
              }
            />
            <small>{cache.draft.note.length} / 2000</small>
            <button type="submit" className="cw-primary" disabled={!editable}>
              {t(
                busy
                  ? "customerWorkspaceUx.saving"
                  : "customerWorkspaceUx.saveNote"
              )}
            </button>
          </form>
        </section>
        <section className="cw-panel">
          <h2>{t("customerWorkspaceUx.tagsTitle")}</h2>
          <p>{t("customerWorkspaceUx.tagsHelp")}</p>
          {tags && (
            <>
              {!tags.values.length && <p>{t("customerWorkspaceUx.noTags")}</p>}
              <ul className="cw-tags">
                {tags.values.map(tag => (
                  <li key={tag}>
                    <span>{tag}</span>
                    {data?.canManage && (
                      <button
                        type="button"
                        disabled={!editable}
                        aria-label={t("customerWorkspaceUx.removeTag", { tag })}
                        onClick={() =>
                          edit({
                            ...cache.draft,
                            tags: {
                              ...tags,
                              values: tags.values.filter(
                                value => value !== tag
                              ),
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="cw-actions"
                onSubmit={event => {
                  event.preventDefault();
                  if (editable) addTag();
                }}
              >
                <label>
                  {t("customerWorkspaceUx.tagLabel")}
                  <input
                    maxLength={40}
                    value={cache.draft.newTag || ""}
                    disabled={!editable}
                    onChange={event =>
                      edit({ ...cache.draft, newTag: event.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={!editable}>
                  {t("customerWorkspaceUx.addTag")}
                </button>
              </form>
              <button
                type="button"
                className="cw-primary"
                disabled={
                  !editable || !tagChanged || !!cache.draft.newTag || conflict
                }
                onClick={saveTags}
              >
                {t("customerWorkspaceUx.saveTags")}
              </button>
            </>
          )}
          {conflict && (
            <div role="alert">
              <p>{t("customerWorkspaceUx.conflict")}</p>
              <strong>{t("customerWorkspaceUx.currentTags")}</strong>
              <p>{data!.tags.join("، ") || t("customerWorkspaceUx.noTags")}</p>
              <button
                type="button"
                disabled={!editable}
                onClick={() => edit({ ...cache.draft, tags: undefined })}
              >
                {t("customerWorkspaceUx.useCurrent")}
              </button>
            </div>
          )}
        </section>
      </div>
      <p className="cw-muted">{t("customerWorkspaceUx.draftHint")}</p>
      {(cache.draft.note || tagChanged || cache.draft.newTag) && !pending && (
        <div className="cw-actions">
          {!discard ? (
            <button
              type="button"
              disabled={busy || !loaded}
              onClick={() => setDiscard(true)}
            >
              {t("customerWorkspaceUx.discardDraft")}
            </button>
          ) : (
            <>
              <p>{t("customerWorkspaceUx.discardConfirm")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  try {
                    clearCustomerCache(scope, customerKey, epoch.current);
                    cacheRef.current = { draft: { note: "" } };
                    setCache(cacheRef.current);
                    setStorageError(false);
                    setDiscard(false);
                  } catch {
                    setStorageError(true);
                  }
                }}
              >
                {t("customerWorkspaceUx.confirmDiscard")}
              </button>
              <button type="button" onClick={() => setDiscard(false)}>
                {t("customerWorkspaceUx.cancel")}
              </button>
            </>
          )}
        </div>
      )}
      {ready && (
        <section className="cw-panel">
          <h2>{t("customerWorkspaceUx.notesTitle")}</h2>
          {!data!.notes.length ? (
            <p>{t("customerWorkspaceUx.noNotes")}</p>
          ) : (
            <ol className="cw-notes">
              {data!.notes.map(note => (
                <li key={note.id}>
                  <p className="cw-note-content">{note.content}</p>
                  <p className="cw-muted">
                    {t("customerWorkspaceUx.author", { id: note.actorId })} ·{" "}
                    {customerDate(note.createdAt, locale)} · UTC
                  </p>
                </li>
              ))}
            </ol>
          )}
          <CustomerPagination
            value={data!.pagination}
            disabled={busy}
            onPage={setPage}
          />
        </section>
      )}
    </div>
  );
}
