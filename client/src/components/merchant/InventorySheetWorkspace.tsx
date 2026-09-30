import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { sheetInventoryOptions } from "@shared/product-sheet-inventory";
import {
  inventorySheetPrepareInput,
  inventorySheetReadInput,
} from "@shared/product-sheet-inventory-review";
import {
  readSheetAttempt,
  saveSheetAttempt,
  clearSheetAttempt,
  checkedSheetConnection,
  checkedSheetList,
  checkedSheetReview,
  checkedSheetReceipt,
  type SheetAttempt,
} from "@/lib/inventory-sheet-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  ProductPending,
  ProductHeading,
  productDefinitiveError,
} from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
import "@/styles/product-import.css";
import "@/styles/product-sheet.css";
type Options = { mapping?: { productId: number | null; stock: number | null } };
const defaults: Options = {};
export function InventorySheetWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils();
  const [cached, setCached] = useState<SheetAttempt | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [loadSheets, setLoadSheets] = useState(false),
    [sheetId, setSheetId] = useState(""),
    [options, setOptions] = useState<Options>(defaults),
    [dirty, setDirty] = useState(false),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<"all" | "update" | "unchanged" | "blocked">(
      "all"
    ),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [receiptPage, setReceiptPage] = useState(1);
  const epoch = useRef(knowledgeCacheEpoch()),
    alive = useRef(true),
    lock = useRef(false),
    cache = useRef<SheetAttempt | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    confirmHeading = useRef<HTMLHeadingElement>(null),
    focused = useRef("");
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  function remember(value: SheetAttempt) {
    try {
      saveSheetAttempt(scope, value, epoch.current);
      cache.current = value;
      setCached(value);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
  }
  function restore() {
    try {
      const value = readSheetAttempt(scope);
      cache.current = value;
      setCached(value);
      setOptions(value?.input.selection.options ?? defaults);
      setSheetId(value ? String(value.input.selection.sheet.id) : "");
      setLoaded(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  useEffect(() => {
    alive.current = true;
    restore();
    return () => {
      alive.current = false;
    };
  }, [scope]);
  const connectionQuery = trpc.products.sheetInventory.connection.useQuery(
    undefined,
    { retry: false, staleTime: 0, refetchOnMount: "always" }
  );
  let connection: ReturnType<typeof checkedSheetConnection> | null = null;
  try {
    connection = checkedSheetConnection(connectionQuery.data, scope);
  } catch {
    /* Never substitute an empty connection for an invalid response. */
  }
  const fresh = (q: {
    error: unknown;
    isFetching: boolean;
    isLoading: boolean;
    fetchStatus: string;
  }) => !q.error && !q.isFetching && !q.isLoading && q.fetchStatus !== "paused";
  const connectionReady = !!connection && fresh(connectionQuery),
    expected = connection?.source?.digest ?? "0".repeat(64);
  const sheetsQuery = trpc.products.sheetInventory.list.useQuery(
    { expectedSourceDigest: expected },
    {
      enabled:
        loaded &&
        loadSheets &&
        connectionReady &&
        !!connection?.source &&
        !cached,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }
  );
  let sheets: ReturnType<typeof checkedSheetList> | null = null;
  try {
    sheets = checkedSheetList(sheetsQuery.data, scope, expected);
  } catch {
    /* Source-specific list only. */
  }
  const sheetsReady = !!sheets && fresh(sheetsQuery),
    selectedSheet = sheetsReady
      ? sheets!.sheets.find(s => String(s.id) === sheetId)
      : null;
  const selection = inventorySheetReadInput.parse({
    reviewId: cached?.input.reviewId ?? "00000000-0000-4000-8000-000000000000",
    page,
    filter,
  });
  const reviewQuery = trpc.products.sheetInventory.read.useQuery(selection, {
    enabled: loaded && !!cached && !cached.receipt,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  let data: ReturnType<typeof checkedSheetReview> | null = null;
  try {
    if (cached)
      data = checkedSheetReview(reviewQuery.data, scope, selection, cached);
  } catch {
    /* A foreign/stale review cannot enable approval. */
  }
  const ready = !!data && fresh(reviewQuery) && connectionReady,
    receipt = cached?.receipt ?? (ready ? data?.receipt : null),
    pending = !!cached?.attempt && !receipt;
  const prepareMutation = trpc.products.sheetInventory.prepare.useMutation(),
    commitMutation = trpc.products.sheetInventory.commit.useMutation(),
    discardMutation = trpc.products.sheetInventory.discard.useMutation();
  const actions = {
    update: t("productSheetUx.update"),
    unchanged: t("productSheetUx.unchanged"),
    blocked: t("productSheetUx.blocked"),
  };
  const issues = {
    missing_mapping: t("inventorySheetUx.missingMapping"),
    ambiguous_mapping: t("inventorySheetUx.ambiguousMapping"),
    missing_id: t("inventorySheetUx.missingId"),
    invalid_id: t("inventorySheetUx.invalidId"),
    missing_stock: t("inventorySheetUx.missingStock"),
    invalid_stock: t("inventorySheetUx.invalidStock"),
    formula: t("productImportUx.formula"),
    unsupported_cell: t("productImportUx.unsupportedCell"),
    duplicate_product: t("inventorySheetUx.duplicateProduct"),
    product_missing: t("inventorySheetUx.productMissing"),
    source_locked: t("productSheetUx.sourceLocked"),
    current_stock_invalid: t("inventorySheetUx.currentInvalid"),
  };
  useEffect(() => {
    setReviewed(false);
  }, [reviewQuery.dataUpdatedAt, page, filter, dirty, data?.digest]);
  useEffect(() => {
    if (confirm) confirmHeading.current?.focus();
  }, [confirm]);
  useEffect(() => {
    if (!ready || !data || !cached || !current()) return;
    if (!cached.digest || (cached.attempt && data.receipt && !cached.receipt)) {
      try {
        const next = { ...cached, digest: data.digest };
        if (data.receipt && next.attempt)
          next.receipt = checkedSheetReceipt(data.receipt, scope, next);
        remember(next);
        setNotice("");
      } catch {
        setStorageError(true);
      }
    }
  }, [
    ready,
    data?.digest,
    data?.receipt?.requestId,
    cached?.digest,
    cached?.receipt,
  ]);
  useEffect(() => {
    if (ready && !pending && focused.current !== data!.digest) {
      focused.current = data!.digest;
      heading.current?.focus();
    }
  }, [ready, pending, data?.digest]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  function reset() {
    clearSheetAttempt(scope, epoch.current);
    cache.current = null;
    setCached(null);
    setConfirm(false);
    setDirty(false);
    setPage(1);
    setReceiptPage(1);
    setFilter("all");
    setReviewed(false);
    setNotice("");
    setLoadSheets(false);
  }
  function failure(error: unknown) {
    const reason = String((error as Error)?.message ?? "").split(
      "inventory_sheet:"
    )[1];
    const messages: Record<string, string> = {
      expired: t("productSheetUx.expired"),
      review_limit: t("productSheetUx.reviewLimit"),
      review_size: t("productSheetUx.reviewSize"),
      empty_file: t("inventorySheetUx.emptySheet"),
    };
    return messages[reason] ?? t("productSheetUx.failed");
  }
  function changeOptions(patch: Partial<Options>) {
    setOptions(v => ({ ...v, ...patch }));
    setDirty(true);
    setReviewed(false);
  }
  async function prepare(rebuild = false) {
    if (
      !current() ||
      lock.current ||
      !loaded ||
      storageError ||
      pending ||
      receipt ||
      !connectionReady ||
      !sheetInventoryOptions.safeParse(options).success ||
      !connection?.source ||
      connection.integrationSource !== "none"
    )
      return;
    const old = cache.current;
    if (
      rebuild
        ? !old?.digest || !ready || !data?.sourceCurrent
        : !!old || !selectedSheet
    )
      return;
    const sheet = rebuild ? old!.input.selection.sheet : selectedSheet!;
    lock.current = true;
    setBusy(true);
    setNotice("");
    let created = false;
    try {
      if (old) {
        await discardMutation.mutateAsync({
          reviewId: old.input.reviewId,
          expectedDigest: old.digest!,
        });
        if (!current()) return;
      }
      const input = inventorySheetPrepareInput.parse({
        reviewId: crypto.randomUUID(),
        selection: {
          expectedSourceDigest: connection.source.digest,
          sheet,
          options,
        },
      });
      const next: SheetAttempt = {
        input,
        digest: null,
        attempt: null,
        receipt: null,
      };
      remember(next);
      created = true;
      setPage(1);
      setFilter("all");
      setReviewed(false);
      const raw = await prepareMutation.mutateAsync(input);
      if (!current()) return;
      const r = checkedSheetReview(
        raw,
        scope,
        inventorySheetReadInput.parse({ reviewId: input.reviewId }),
        next
      );
      remember({ ...next, digest: r.digest });
      setDirty(false);
      setOptions(r.options.options);
      await utils.products.sheetInventory.read.invalidate({
        reviewId: input.reviewId,
      });
    } catch (error) {
      if (current()) {
        setNotice(failure(error));
        if (
          created &&
          productDefinitiveError(error) &&
          !cache.current?.digest
        ) {
          try {
            clearSheetAttempt(scope, epoch.current);
            cache.current = null;
            setCached(null);
          } catch {
            setStorageError(true);
          }
        }
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recoverReview() {
    const saved = cache.current;
    if (!saved || lock.current || !current()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const sel = inventorySheetReadInput.parse({
        reviewId: saved.input.reviewId,
      });
      const raw = await utils.products.sheetInventory.read.fetch(sel, {
        staleTime: 0,
      });
      if (!current()) return;
      const r = checkedSheetReview(raw, scope, sel, saved);
      remember({ ...saved, digest: r.digest });
      setPage(1);
      setFilter("all");
      setOptions(r.options.options);
      setDirty(false);
      await reviewQuery.refetch();
    } catch (error) {
      if (current()) setNotice(failure(error));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function accept(raw: unknown, saved: SheetAttempt) {
    const confirmed = checkedSheetReceipt(raw, scope, saved);
    remember({ ...saved, receipt: confirmed });
    setNotice("");
    void utils.products.list.invalidate();
  }
  async function commit(retry = false) {
    const saved = cache.current;
    if (
      !current() ||
      lock.current ||
      storageError ||
      !saved ||
      saved.receipt ||
      !connectionReady
    )
      return;
    if (
      retry
        ? !saved.attempt
        : !ready ||
          !data?.canCommit ||
          !reviewed ||
          dirty ||
          !saved.digest ||
          saved.digest !== data.digest
    )
      return;
    const next: SheetAttempt = {
      ...saved,
      attempt: saved.attempt ?? {
        reviewId: saved.input.reviewId,
        requestId: crypto.randomUUID(),
        expectedDigest: saved.digest!,
        reviewed: true,
      },
    };
    try {
      remember(next);
    } catch {
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const raw = await commitMutation.mutateAsync(next.attempt!);
      if (current()) accept(raw, next);
    } catch (error) {
      if (current()) {
        if (productDefinitiveError(error)) {
          try {
            remember({ ...next, attempt: null });
          } catch {
            setStorageError(true);
          }
          setReviewed(false);
          setNotice(t("productSheetUx.rejected"));
          void reviewQuery.refetch();
        } else setNotice(t("inventorySheetUx.uncertain"));
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recoverReceipt() {
    const saved = cache.current;
    if (!saved?.attempt || lock.current || !current()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const raw = await utils.products.sheetInventory.receipt.fetch(
        { requestId: saved.attempt.requestId },
        { staleTime: 0 }
      );
      if (!current()) return;
      if (raw) accept(raw, saved);
      else setNotice(t("productSheetUx.notCommitted"));
    } catch {
      if (current()) setNotice(t("productSheetUx.receiptFailed"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  const missing =
    !!reviewQuery.error &&
    workspaceFailureKind(reviewQuery.error) === "missing" &&
    !reviewQuery.isFetching &&
    reviewQuery.fetchStatus !== "paused";
  const canDiscard =
    !busy &&
    !pending &&
    !storageError &&
    !!cached &&
    ((connectionReady && !!receipt) || ready || missing);
  async function discard() {
    const saved = cache.current;
    if (!current() || lock.current || !canDiscard || !saved) return;
    lock.current = true;
    setBusy(true);
    try {
      if (saved.digest && !missing)
        await discardMutation.mutateAsync({
          reviewId: saved.input.reviewId,
          expectedDigest: saved.digest,
        });
      if (current()) reset();
    } catch (error) {
      if (current()) setNotice(failure(error));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  const mappingValid = sheetInventoryOptions.safeParse(options).success;
  const stockText = (n: number | null) =>
    n === null ? t("inventorySheetUx.unknownStock") : String(n);
  const state = (q: typeof connectionQuery, retry: () => void) => (
    <WorkspaceState
      inline
      kind={
        q.fetchStatus === "paused"
          ? "offline"
          : q.error
            ? workspaceFailureKind(q.error)
            : q.isFetching || q.isLoading
              ? "loading"
              : "error"
      }
      onRetry={retry}
    />
  );
  return (
    <section
      className="pw-workspace pi-workspace ps-workspace is-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
      aria-busy={busy}
    >
      <header>
        <ProductHeading>{t("inventorySheetUx.title")}</ProductHeading>
        <p>{t("inventorySheetUx.intro")}</p>
        <a className="pw-button" href={href("/merchant/data-sync")}>
          {t("inventorySheetUx.exportLink")}
        </a>
      </header>
      {notice && (
        <p role="alert" className="pw-notice">
          {notice}
        </p>
      )}
      {storageError ? (
        <WorkspaceState
          inline
          kind="error"
          title={t("productSheetUx.storageTitle")}
          description={t("productSheetUx.storageHint")}
          onRetry={restore}
        />
      ) : !loaded ? (
        <WorkspaceState inline kind="loading" />
      ) : (
        <>
          {!connectionReady &&
            state(connectionQuery, () => void connectionQuery.refetch())}
          {pending && (
            <ProductPending
              busy={busy}
              canRetry={connectionReady}
              recover={() => void recoverReceipt()}
              retry={() => void commit(true)}
            />
          )}
          {connectionReady && receipt ? (
            <section className="pw-panel" role="status">
              <h2>{t("productSheetUx.completed")}</h2>
              <p>{t("inventorySheetUx.completedHint")}</p>
              <dl className="pw-summary">
                {(["update", "unchanged"] as const).map(k => (
                  <div key={k}>
                    <dt>{actions[k]}</dt>
                    <dd>{receipt.counts[k]}</dd>
                  </div>
                ))}
              </dl>
              <p>
                {t("productSheetUx.receiptId")} <code>{receipt.requestId}</code>
              </p>
              <p>{new Date(receipt.createdAt).toLocaleString(i18n.language)}</p>
              <details>
                <summary>{t("productSheetUx.receiptRows")}</summary>
                <ul>
                  {receipt.rows
                    .slice((receiptPage - 1) * 20, receiptPage * 20)
                    .map(r => (
                      <li key={r.number}>
                        {t("productSheetUx.row", { number: r.number })} ·{" "}
                        {actions[r.action]} · #{r.productId} ·{" "}
                        {t("productSheetUx.before")}: {stockText(r.before)} ·{" "}
                        {t("productSheetUx.after")}: {stockText(r.after)}
                      </li>
                    ))}
                </ul>
                <nav
                  className="pw-actions"
                  aria-label={t("productSheetUx.pagination")}
                >
                  <button
                    disabled={receiptPage <= 1}
                    onClick={() => setReceiptPage(p => p - 1)}
                  >
                    {t("productWorkspaceUx.previous")}
                  </button>
                  <span>
                    {t("productSheetUx.page", {
                      page: receiptPage,
                      pages: Math.ceil(receipt.rows.length / 20),
                      total: receipt.rows.length,
                    })}
                  </span>
                  <button
                    disabled={
                      receiptPage >= Math.ceil(receipt.rows.length / 20)
                    }
                    onClick={() => setReceiptPage(p => p + 1)}
                  >
                    {t("productWorkspaceUx.next")}
                  </button>
                </nav>
              </details>
              <a className="pw-button" href={href("/merchant/products")}>
                {t("productSheetUx.viewProducts")}
              </a>
              <button disabled={!canDiscard} onClick={() => setConfirm(true)}>
                {t("productSheetUx.newReview")}
              </button>
            </section>
          ) : null}
          {loaded && cached && !receipt && !pending && !ready && (
            <>
              {state(reviewQuery as any, () => void recoverReview())}
              <p>
                {t("productSheetUx.savedReference")}{" "}
                <code>{cached.input.reviewId}</code>
              </p>
              <button disabled={busy} onClick={() => void recoverReview()}>
                {t("productSheetUx.recoverReview")}
              </button>
              {missing && (
                <button disabled={!canDiscard} onClick={() => setConfirm(true)}>
                  {t("productSheetUx.newReview")}
                </button>
              )}
            </>
          )}
          {connectionReady &&
          !cached &&
          connection?.integrationSource !== "none" ? (
            <p className="pw-notice" role="status">
              {t("productSheetUx.integrationLocked")}
            </p>
          ) : null}
          {connectionReady &&
          !cached &&
          connection?.integrationSource === "none" &&
          !connection.source ? (
            <section className="pw-panel">
              <h2>{t("productSheetUx.notLinked")}</h2>
              <p>
                {connection.reason === "oauth_disabled"
                  ? t("productSheetUx.oauthDisabled")
                  : connection.reason === "credentials_missing"
                    ? t("productSheetUx.credentialsMissing")
                    : t("productSheetUx.linkHint")}
              </p>
              <a className="pw-button" href={href("/merchant/sheets/settings")}>
                {t("productSheetUx.connectionSettings")}
              </a>
            </section>
          ) : null}
          {connectionReady &&
            !cached &&
            connection?.source &&
            connection.integrationSource === "none" && (
              <section className="pw-panel">
                <h2>{t("productSheetUx.selectSheet")}</h2>
                <p className="ps-source">{connection.source.spreadsheetId}</p>
                <button
                  disabled={busy || sheetsQuery.isFetching}
                  onClick={() => {
                    if (loadSheets) void sheetsQuery.refetch();
                    else setLoadSheets(true);
                  }}
                >
                  {t("productSheetUx.loadSheets")}
                </button>
                {loadSheets &&
                  !sheetsReady &&
                  state(sheetsQuery as any, () => void sheetsQuery.refetch())}
                {sheetsReady &&
                  (sheets!.sheets.length === 0 ? (
                    <p role="status">{t("productSheetUx.noSheets")}</p>
                  ) : (
                    <>
                      <label>
                        {t("productSheetUx.sheet")}
                        <select
                          value={sheetId}
                          onChange={e => {
                            setSheetId(e.target.value);
                            setOptions(v => ({ ...v, mapping: undefined }));
                          }}
                          disabled={busy}
                        >
                          <option value="">
                            {t("productSheetUx.chooseSheet")}
                          </option>
                          {sheets!.sheets.map(s => (
                            <option key={s.id} value={String(s.id)}>
                              {s.title}
                              {s.hidden
                                ? ` · ${t("productSheetUx.hidden")}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>{t("inventorySheetUx.idHint")}</p>
                      <button
                        className="pw-primary"
                        disabled={busy || !selectedSheet}
                        onClick={() => void prepare()}
                      >
                        {busy
                          ? t("productSheetUx.reading")
                          : t("productSheetUx.prepare")}
                      </button>
                    </>
                  ))}
              </section>
            )}
          {ready && data && !receipt && !pending && (
            <>
              <section className="pw-panel">
                <h2 ref={heading} tabIndex={-1}>
                  {t("productSheetUx.reviewTitle")}
                </h2>
                <p>
                  {data.preview.snapshot.sheet.title} ·{" "}
                  <bdi>{data.preview.snapshot.range}</bdi>
                </p>
                <p>
                  {t("productSheetUx.readAt")}{" "}
                  {new Date(data.preview.snapshot.readAt).toLocaleString(
                    i18n.language
                  )}
                </p>
                <p>{t("productSheetUx.frozenHint")}</p>
                {data.preview.snapshot.limitedRange && (
                  <p className="pw-notice" role="status">
                    {t("productSheetUx.rangeLimited", {
                      rows: data.preview.snapshot.coveredRows,
                      columns: data.preview.snapshot.coveredColumns,
                    })}
                  </p>
                )}
                <dl className="pw-summary ps-summary">
                  {Object.entries(actions).map(([k, label]) => (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd>{data.counts[k as keyof typeof actions]}</dd>
                    </div>
                  ))}
                </dl>
                {(data.expired ||
                  !data.sourceCurrent ||
                  data.integrationSource !== "none") && (
                  <p role="alert">
                    {data.expired
                      ? t("productSheetUx.expired")
                      : !data.sourceCurrent
                        ? t("productSheetUx.sourceChanged")
                        : t("productSheetUx.integrationLocked")}
                  </p>
                )}
                <details>
                  <summary>{t("inventorySheetUx.mapping")}</summary>
                  <p>{t("inventorySheetUx.mappingHint")}</p>
                  {data.preview.issues.length > 0 && (
                    <ul className="pi-errors">
                      {data.preview.issues.map(issue => (
                        <li key={issue}>{issues[issue]}</li>
                      ))}
                    </ul>
                  )}
                  <div className="pw-form-grid is-mapping">
                    {(["productId", "stock"] as const).map(field => (
                      <label key={field}>
                        {field === "productId"
                          ? t("inventorySheetUx.idColumn")
                          : t("inventorySheetUx.stockColumn")}
                        <select
                          disabled={busy}
                          value={
                            options.mapping
                              ? (options.mapping[field] ?? "")
                              : (data.preview.mapping[field] ?? "")
                          }
                          onChange={e =>
                            changeOptions({
                              mapping: {
                                ...(options.mapping ?? data!.preview.mapping),
                                [field]:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              },
                            })
                          }
                        >
                          <option value="">
                            {t("inventorySheetUx.chooseColumn")}
                          </option>
                          {data.preview.headers.map((h, column) => (
                            <option key={column} value={column}>
                              {t("productSheetUx.column", {
                                number: column + 1,
                              })}{" "}
                              · {h.text || t("productSheetUx.emptyValue")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {!mappingValid && (
                    <p role="alert">{t("inventorySheetUx.mappingInvalid")}</p>
                  )}
                </details>
                {dirty && <p role="status">{t("productSheetUx.dirty")}</p>}
                <div className="pw-actions">
                  <button
                    disabled={
                      busy ||
                      !connectionReady ||
                      !mappingValid ||
                      !data.sourceCurrent ||
                      data.integrationSource !== "none"
                    }
                    onClick={() => void prepare(true)}
                  >
                    {t("productSheetUx.rebuild")}
                  </button>
                  <button
                    disabled={!canDiscard}
                    onClick={() => setConfirm(true)}
                  >
                    {t("productSheetUx.newReview")}
                  </button>
                </div>
              </section>
              <section className="pw-panel">
                <label>
                  {t("productSheetUx.filter")}
                  <select
                    disabled={busy}
                    value={filter}
                    onChange={e => {
                      setFilter(e.target.value as typeof filter);
                      setPage(1);
                    }}
                  >
                    <option value="all">{t("productSheetUx.all")}</option>
                    {Object.entries(actions).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <ol className="pi-rows">
                  {data.rows.map(({ source, change }) => (
                    <li key={source.number}>
                      <details
                        className="ps-row"
                        open={change.action === "blocked" ? true : undefined}
                      >
                        <summary>
                          <span>
                            {t("productSheetUx.row", { number: source.number })}{" "}
                            · {change.name ?? t("productSheetUx.invalidName")}
                          </span>
                          <strong className={`ps-action ps-${change.action}`}>
                            {actions[change.action]}
                          </strong>
                        </summary>
                        {change.productId && (
                          <p>
                            {t("productSheetUx.productId")} #{change.productId}
                          </p>
                        )}
                        {change.issues.length > 0 && (
                          <ul className="pi-errors">
                            {change.issues.map(issue => (
                              <li key={issue}>{issues[issue]}</li>
                            ))}
                          </ul>
                        )}
                        {change.action !== "blocked" && (
                          <dl className="ps-changes">
                            <div>
                              <dt>{t("productWorkspaceUx.stock")}</dt>
                              <dd>
                                <span>
                                  <small>{t("productSheetUx.before")}</small>
                                  {stockText(change.before)}
                                </span>
                                <span>
                                  <small>{t("productSheetUx.after")}</small>
                                  {stockText(change.after)}
                                </span>
                              </dd>
                            </div>
                          </dl>
                        )}
                        <details>
                          <summary>
                            {t("productSheetUx.originalValues")}
                          </summary>
                          <dl className="ps-raw">
                            {data!.preview.headers.map((h, column) => (
                              <div key={column}>
                                <dt>
                                  {h.text ||
                                    t("productSheetUx.column", {
                                      number: column + 1,
                                    })}
                                </dt>
                                <dd>
                                  {source.cells[column]?.text ||
                                    t("productSheetUx.emptyValue")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </details>
                    </li>
                  ))}
                </ol>
                {data.filteredTotal === 0 && (
                  <p>{t("productSheetUx.noRows")}</p>
                )}
                <nav
                  className="pw-actions"
                  aria-label={t("productSheetUx.pagination")}
                >
                  <button
                    disabled={busy || page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    {t("productWorkspaceUx.previous")}
                  </button>
                  <span>
                    {t("productSheetUx.page", {
                      page,
                      pages: data.totalPages || 1,
                      total: data.filteredTotal,
                    })}
                  </span>
                  <button
                    disabled={busy || page >= data.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    {t("productWorkspaceUx.next")}
                  </button>
                </nav>
              </section>
              <section className="pw-panel pi-approval">
                <h2>{t("productSheetUx.approveTitle")}</h2>
                <p>{t("inventorySheetUx.approveHint")}</p>
                {data.counts.blocked > 0 && (
                  <p role="alert">{t("productSheetUx.fixRows")}</p>
                )}
                <label className="pw-checkbox">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={
                      busy || dirty || !data.canCommit || !cached?.digest
                    }
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  {t("inventorySheetUx.consent")}
                </label>
                <button
                  className="pw-primary"
                  disabled={
                    busy ||
                    dirty ||
                    !reviewed ||
                    !data.canCommit ||
                    !cached?.digest ||
                    !connectionReady
                  }
                  onClick={() => void commit()}
                >
                  {t("inventorySheetUx.commit", {
                    count: data.counts.update,
                  })}
                </button>
              </section>
            </>
          )}
          {confirm && (
            <section
              className="pw-panel"
              role="alertdialog"
              aria-label={t("productSheetUx.newReview")}
            >
              <h2 ref={confirmHeading} tabIndex={-1}>
                {t("productSheetUx.discardTitle")}
              </h2>
              <p>{t("inventorySheetUx.discardHint")}</p>
              <button disabled={!canDiscard} onClick={() => void discard()}>
                {t("productSheetUx.discardConfirm")}
              </button>
              <button disabled={busy} onClick={() => setConfirm(false)}>
                {t("productSheetUx.keepReview")}
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
