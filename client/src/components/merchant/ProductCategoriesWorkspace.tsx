import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  categorySnapshot,
  categoryReceipt,
  categoryPath,
  planCategoryChange,
  CategoryPlanFailure,
  type CategoryRow,
  type CategoryWrite,
} from "@shared/product-categories";
import {
  categoryToForm,
  categoryFormRequest,
  readCategoryDraft,
  saveCategoryDraft,
  clearCategoryDraft,
  type CategoryDraft,
  type CategoryForm,
} from "@/lib/product-category-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { ProductHeading } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
const previewId = "11111111-1111-4111-8111-111111111111";
export function ProductCategoriesWorkspace({
  scope,
  back,
}: {
  scope: string;
  back: () => void;
}) {
  const { t, i18n } = useTranslation(),
    query = trpc.products.categories.read.useQuery(undefined, {
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }),
    write = trpc.products.categories.write.useMutation({ retry: false }),
    utils = trpc.useUtils();
  const [draft, setDraft] = useState<CategoryDraft | null>(null),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [discard, setDiscard] = useState(false);
  const epoch = useRef(knowledgeCacheEpoch()),
    alive = useRef(true),
    lock = useRef(false),
    currentScope = useRef(scope),
    heading = useRef<HTMLHeadingElement>(null);
  currentScope.current = scope;
  const parsed = categorySnapshot.safeParse(query.data),
    data =
      parsed.success &&
      `${parsed.data.actorId}:${parsed.data.merchantId}:products` === scope
        ? parsed.data
        : null;
  const ready =
    !!data &&
    !query.error &&
    !query.isLoading &&
    !query.isFetching &&
    query.fetchStatus !== "paused" &&
    epoch.current === knowledgeCacheEpoch();
  const permitted = ready && data!.canManage && !data!.locked,
    conflict = !!draft && draft.digest !== data?.digest;
  const access = useRef({ ready, digest: data?.digest });
  access.current = { ready, digest: data?.digest };
  const fresh = () =>
    alive.current &&
    scope === currentScope.current &&
    epoch.current === knowledgeCacheEpoch() &&
    access.current.ready;
  useEffect(() => {
    alive.current = true;
    try {
      setDraft(readCategoryDraft(scope));
    } catch {
      setStorageError(true);
    }
    return () => {
      alive.current = false;
    };
  }, [scope]);
  useEffect(() => {
    setReview(false);
  }, [data?.digest]);
  useEffect(() => {
    if (draft) heading.current?.focus();
  }, [draft?.kind, draft?.id]);
  useEffect(() => {
    if (!draft && !busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [!!draft, busy]);
  function persist(next: CategoryDraft) {
    try {
      saveCategoryDraft(scope, next, epoch.current);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }
  function edit(next: CategoryDraft) {
    if (busy || draft?.attempt) return;
    setDraft(next);
    setReview(false);
    setDiscard(false);
    persist(next);
  }
  function start(kind: CategoryDraft["kind"], row?: CategoryRow) {
    if (!permitted || draft || storageError) return;
    edit({
      kind,
      id: row?.id ?? null,
      digest: data!.digest,
      form: categoryToForm(row),
    });
    setNotice("");
  }
  function change(key: keyof CategoryForm, value: string | boolean) {
    if (draft) edit({ ...draft, form: { ...draft.form, [key]: value } });
  }
  const candidate = draft ? categoryFormRequest(draft, previewId) : null;
  let plan: ReturnType<typeof planCategoryChange> | null = null,
    problem: string | null = null;
  if (candidate?.success && data && !conflict)
    try {
      plan = planCategoryChange(data.merchantId, data.rows, candidate.data);
    } catch (error) {
      problem = error instanceof CategoryPlanFailure ? error.reason : "scope";
    }
  const issueText: Record<string, string> = {
    scope: t("categoryUx.scope"),
    limit: t("categoryUx.limit"),
    missing: t("categoryUx.missing"),
    in_use: t("categoryUx.inUse"),
    duplicate: t("categoryUx.duplicate"),
    no_change: t("categoryUx.noChange"),
    parent_missing: t("categoryUx.parentMissing"),
    cycle: t("categoryUx.cycle"),
    depth: t("categoryUx.depth"),
    inactive_parent: t("categoryUx.inactiveParent"),
  };
  const fields = {
    name: t("categoryUx.name"),
    nameEn: t("categoryUx.nameEn"),
    parentId: t("categoryUx.parent"),
    sortOrder: t("categoryUx.sortOrder"),
    isActive: t("categoryUx.active"),
  };
  function completed(raw: unknown, attempt: CategoryWrite) {
    const r = categoryReceipt.parse(raw);
    if (
      `${r.actorId}:${r.merchantId}:products` !== scope ||
      r.requestId !== attempt.requestId ||
      r.kind !== attempt.kind ||
      (attempt.kind !== "create" && r.categoryId !== attempt.id)
    )
      throw Error("Category receipt mismatch");
    if (!fresh()) return;
    try { clearCategoryDraft(scope, epoch.current); }
    catch (error) { setStorageError(true); throw error; }
    setDraft(null);
    setReview(false);
    setNotice(t("categoryUx.saved", { id: r.categoryId }));
    setStorageError(false);
    void query.refetch();
  }
  async function send(attempt?: CategoryWrite) {
    if (
      !permitted ||
      busy ||
      lock.current ||
      storageError ||
      !draft ||
      (!attempt && (!review || !plan || conflict))
    )
      return;
    const request = attempt ?? categoryFormRequest(draft, crypto.randomUUID());
    const value =
      "success" in request ? (request.success ? request.data : null) : request;
    if (!value) return;
    const saved = { ...draft, attempt: value };
    if (!persist(saved)) return;
    setDraft(saved);
    setReview(false);
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      completed(await write.mutateAsync(value), value);
    } catch (error) {
      if (fresh()) {
        const code = (error as any)?.data?.code;
        if (
          [
            "BAD_REQUEST",
            "CONFLICT",
            "FORBIDDEN",
            "PRECONDITION_FAILED",
            "NOT_FOUND",
          ].includes(code)
        ) {
          const { attempt: _, ...editable } = saved;
          persist(editable);
          setDraft(editable);
          setNotice(t("categoryUx.rejected"));
          void query.refetch();
        } else setNotice(t("categoryUx.uncertain"));
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function recover() {
    if (!draft?.attempt || !ready || busy || lock.current) return;
    const attempt = draft.attempt;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await utils.products.categories.receipt.fetch({
        requestId: attempt.requestId,
      });
      if (result) completed(result, attempt);
      else if (fresh()) setNotice(t("categoryUx.noReceipt"));
    } catch {
      if (fresh()) setNotice(t("categoryUx.recoveryFailed"));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const matches =
    data?.rows
      .filter(
        row =>
          (filter === "all" ||
            (filter === "active" ? row.isActive === 1 : row.isActive === 0)) &&
          [row.name, row.nameEn ?? ""].some(name =>
            name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
          )
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) ?? [];
  const maxPage = Math.max(1, Math.ceil(matches.length / 20)),
    shownPage = Math.min(page, maxPage),
    rows = matches.slice((shownPage - 1) * 20, shownPage * 20);
  const invalid = (field: string) =>
    candidate &&
    !candidate.success &&
    candidate.error.issues.some(issue => issue.path.includes(field));
  return (
    <section
      className="pw-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
      aria-busy={busy}
    >
      <header className="pw-header">
        <div>
          <ProductHeading>{t("categoryUx.title")}</ProductHeading>
          <p>{t("categoryUx.subtitle")}</p>
        </div>
        <div className="pw-actions">
          <button disabled={busy} onClick={back}>
            {t("categoryUx.back")}
          </button>
          <button
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("categoryUx.refresh")}
          </button>
        </div>
      </header>
      {storageError && (
        <p role="alert" className="pw-notice">
          {t("categoryUx.storageError")}{" "}
          <button
            disabled={busy}
            onClick={() => {
              try {
                const saved = readCategoryDraft(scope);
                if (draft) {
                  persist(draft);
                } else {
                  setDraft(saved);
                  setStorageError(false);
                }
              } catch {
                setStorageError(true);
              }
            }}
          >
            {t("categoryUx.retryStorage")}
          </button>
        </p>
      )}
      {!ready ? (
        <WorkspaceState
          inline
          kind={
            query.error
              ? workspaceFailureKind(query.error)
              : query.fetchStatus === "paused"
                ? "offline"
                : query.isLoading || query.isFetching
                  ? "loading"
                  : "error"
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {!permitted && (
            <p className="pw-notice">
              {data!.locked ? t("categoryUx.locked") : t("categoryUx.viewer")}
            </p>
          )}
          {notice && (
            <p role="status" className="pw-notice">
              {notice}
            </p>
          )}
          {draft ? (
            <section
              className="pw-panel"
              aria-labelledby="category-editor-title"
            >
              <h2 id="category-editor-title" ref={heading} tabIndex={-1}>
                {draft.kind === "create"
                  ? t("categoryUx.add")
                  : draft.kind === "delete"
                    ? t("categoryUx.delete")
                    : t("categoryUx.edit")}
              </h2>
              {draft.attempt ? (
                <>
                  <p>{t("categoryUx.pending")}</p>
                  <p>
                    <bdi>{draft.attempt.requestId}</bdi>
                  </p>
                  <div className="pw-actions">
                    <button disabled={busy} onClick={() => void recover()}>
                      {t("categoryUx.recover")}
                    </button>
                    <button
                      disabled={busy || !permitted || storageError}
                      onClick={() => void send(draft.attempt)}
                    >
                      {t("categoryUx.retrySame")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {conflict && (
                    <div role="alert">
                      <p>{t("categoryUx.conflict")}</p>
                      <button
                        disabled={busy || !permitted}
                        onClick={() => {
                          const current = data!.rows.find(
                            row => row.id === draft.id
                          );
                          if (draft.kind !== "create" && !current) {
                            setNotice(t("categoryUx.missing"));
                            return;
                          }
                          edit({
                            ...draft,
                            digest: data!.digest,
                            form:
                              draft.kind === "create"
                                ? draft.form
                                : categoryToForm(current),
                          });
                        }}
                      >
                        {t("categoryUx.reload")}
                      </button>
                    </div>
                  )}
                  {draft.kind !== "delete" ? (
                    <div className="pw-fields">
                      {(["name", "nameEn", "sortOrder"] as const).map(key => (
                        <label key={key}>
                          {key === "sortOrder" ? fields.sortOrder : fields[key]}
                          <input
                            value={draft.form[key]}
                            maxLength={key === "sortOrder" ? 6 : 100}
                            inputMode={
                              key === "sortOrder" ? "numeric" : undefined
                            }
                            disabled={!permitted || busy}
                            aria-invalid={Boolean(invalid(key))}
                            aria-describedby={
                              invalid(key) ? `category-${key}-error` : undefined
                            }
                            onChange={e => change(key, e.target.value)}
                          />
                          {invalid(key) && (
                            <span id={`category-${key}-error`} role="alert">
                              {t("categoryUx.invalidField")}
                            </span>
                          )}
                        </label>
                      ))}
                      <label>
                        {fields.parentId}
                        <select
                          disabled={!permitted || busy}
                          value={draft.form.parentId}
                          onChange={e => change("parentId", e.target.value)}
                        >
                          <option value="">{t("categoryUx.root")}</option>
                          {draft.form.parentId &&
                            !data!.rows.some(
                              row => String(row.id) === draft.form.parentId
                            ) && (
                              <option value={draft.form.parentId}>
                                {t("categoryUx.parentMissing")}
                              </option>
                            )}
                          {data!.rows
                            .filter(row => row.id !== draft.id)
                            .map(row => (
                              <option key={row.id} value={row.id}>
                                {categoryPath(data!.rows, row.id)
                                  .path.map(p => p.name)
                                  .join(" / ")}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="pw-check">
                        <input
                          type="checkbox"
                          checked={draft.form.active}
                          disabled={!permitted || busy}
                          onChange={e => change("active", e.target.checked)}
                        />
                        {fields.isActive}
                      </label>
                    </div>
                  ) : (
                    <p>
                      {t("categoryUx.deleteReview", { name: draft.form.name })}
                    </p>
                  )}
                  {problem && <p role="alert">{issueText[problem]}</p>}
                  {plan && (
                    <div className="pw-notice">
                      <p>
                        {draft.kind === "delete"
                          ? t("categoryUx.deleteUnused")
                          : t("categoryUx.changeSummary", {
                              fields: plan.changes
                                .map(key => fields[key])
                                .join("، "),
                            })}
                      </p>
                      {plan.linkedProducts > 0 && (
                        <p>
                          {t("categoryUx.linkedHint", {
                            count: plan.linkedProducts,
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="pw-check">
                    <input
                      type="checkbox"
                      checked={review}
                      disabled={
                        !permitted || busy || !plan || conflict || storageError
                      }
                      onChange={e => setReview(e.target.checked)}
                    />
                    {t("categoryUx.reviewed")}
                  </label>
                  <div className="pw-actions">
                    <button
                      className={
                        draft.kind === "delete" ? "pw-danger" : "pw-primary"
                      }
                      disabled={
                        !permitted ||
                        busy ||
                        !review ||
                        !plan ||
                        conflict ||
                        storageError
                      }
                      onClick={() => void send()}
                    >
                      {draft.kind === "delete"
                        ? t("categoryUx.confirmDelete")
                        : t("categoryUx.save")}
                    </button>
                    <button disabled={busy} onClick={() => setDiscard(true)}>
                      {t("categoryUx.discard")}
                    </button>
                  </div>
                  {discard && (
                    <div role="alert">
                      <p>{t("categoryUx.discardHint")}</p>
                      <button
                        onClick={() => {
                          try {
                            clearCategoryDraft(scope, epoch.current);
                            setDraft(null);
                            setDiscard(false);
                            setStorageError(false);
                          } catch {
                            setStorageError(true);
                          }
                        }}
                      >
                        {t("categoryUx.confirmDiscard")}
                      </button>
                      <button onClick={() => setDiscard(false)}>
                        {t("categoryUx.cancel")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <button
              className="pw-primary"
              disabled={!permitted || storageError}
              onClick={() => start("create")}
            >
              {t("categoryUx.add")}
            </button>
          )}
          <section className="pw-panel" aria-label={t("categoryUx.list")}>
            <div className="pw-fields">
              <label>
                {t("categoryUx.search")}
                <input
                  value={search}
                  maxLength={100}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                {t("categoryUx.status")}
                <select
                  value={filter}
                  onChange={e => {
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">{t("categoryUx.all")}</option>
                  <option value="active">{t("categoryUx.active")}</option>
                  <option value="inactive">{t("categoryUx.inactive")}</option>
                </select>
              </label>
            </div>
            <p>
              {t("categoryUx.count", {
                count: matches.length,
                total: data!.rows.length,
              })}
            </p>
            {!rows.length ? (
              <p>{t("categoryUx.empty")}</p>
            ) : (
              <ul className="pw-rows">
                {rows.map(row => {
                  const path = categoryPath(data!.rows, row.id);
                  return (
                    <li key={row.id} className="pw-panel">
                      <h3>{row.name || t("categoryUx.invalidName")}</h3>
                      {row.nameEn && <p lang="en">{row.nameEn}</p>}
                      <p>
                        {path.issue
                          ? issueText[path.issue]
                          : path.path.map(p => p.name).join(" / ")}
                      </p>
                      <p>
                        {row.isActive === 1
                          ? fields.isActive
                          : t("categoryUx.inactive")}{" "}
                        ·{" "}
                        {t("categoryUx.products", { count: row.productCount })}
                      </p>
                      <div className="pw-actions">
                        <button
                          disabled={!permitted || !!draft || storageError}
                          onClick={() => start("update", row)}
                        >
                          {t("categoryUx.edit")}
                        </button>
                        <button
                          disabled={
                            !permitted ||
                            !!draft ||
                            storageError ||
                            row.productCount > 0 ||
                            data!.rows.some(child => child.parentId === row.id)
                          }
                          onClick={() => start("delete", row)}
                        >
                          {t("categoryUx.delete")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="pw-actions">
              <button
                disabled={shownPage === 1}
                onClick={() => setPage(shownPage - 1)}
              >
                {t("categoryUx.previous")}
              </button>
              <span>
                {t("categoryUx.page", { page: shownPage, total: maxPage })}
              </span>
              <button
                disabled={shownPage === maxPage}
                onClick={() => setPage(shownPage + 1)}
              >
                {t("categoryUx.next")}
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
