import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { z } from "zod";
import {
  productImportFields,
  type ProductImportField,
  type ProductImportIssue,
} from "@shared/product-import";
import {
  productSheetMatchMode,
  productSheetOptions,
} from "@shared/product-sheet-import";
import {
  productSheetPrepareInput,
  productSheetReadInput,
} from "@shared/product-sheet-review";
import {
  readSheetAttempt,
  saveSheetAttempt,
  clearSheetAttempt,
  checkedSheetConnection,
  checkedSheetList,
  checkedSheetReview,
  checkedSheetReceipt,
  type SheetAttempt,
} from "@/lib/product-sheet-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  ProductPending,
  productLabels,
  productChoices,
  productDefinitiveError,
} from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
import "@/styles/product-import.css";
import "@/styles/product-sheet.css";
type Options = z.infer<typeof productSheetOptions>;
const defaults: Options = {
  sheetId: 0,
  currency: "SAR",
  productType: "physical",
  status: "draft",
};
export function ProductSheetWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    labels = productLabels(t),
    choices = productChoices(t);
  const [cached, setCached] = useState<SheetAttempt | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [loadSheets, setLoadSheets] = useState(false),
    [sheetId, setSheetId] = useState(""),
    [mode, setMode] =
      useState<z.infer<typeof productSheetMatchMode>>("create_only"),
    [options, setOptions] = useState<Options>(defaults),
    [dirty, setDirty] = useState(false),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<
      "all" | "create" | "update" | "unchanged" | "blocked"
    >("all"),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false);
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
      setMode(value?.input.mode ?? "create_only");
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
  const connectionQuery = trpc.products.sheetImport.connection.useQuery(
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
  const sheetsQuery = trpc.products.sheetImport.list.useQuery(
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
  const selection = productSheetReadInput.parse({
    reviewId: cached?.input.reviewId ?? "00000000-0000-4000-8000-000000000000",
    page,
    filter,
  });
  const reviewQuery = trpc.products.sheetImport.read.useQuery(selection, {
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
  const prepareMutation = trpc.products.sheetImport.prepare.useMutation(),
    commitMutation = trpc.products.sheetImport.commit.useMutation(),
    discardMutation = trpc.products.sheetImport.discard.useMutation();
  const actions = {
    create: t("productSheetUx.create"),
    update: t("productSheetUx.update"),
    unchanged: t("productSheetUx.unchanged"),
    blocked: t("productSheetUx.blocked"),
  };
  const issues = {
    invalid_row: t("productSheetUx.invalidRow"),
    missing_key: t("productSheetUx.missingKey"),
    ambiguous_match: t("productSheetUx.ambiguousMatch"),
    duplicate_match: t("productSheetUx.duplicateMatch"),
    existing_sku: t("productSheetUx.existingSku"),
    source_locked: t("productSheetUx.sourceLocked"),
    current_fields_invalid: t("productSheetUx.currentInvalid"),
    currency_mismatch: t("productSheetUx.currencyMismatch"),
    category_linked: t("productSheetUx.categoryLinked"),
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
    setFilter("all");
    setReviewed(false);
    setNotice("");
    setLoadSheets(false);
  }
  function failure(error: unknown) {
    const reason = String((error as Error)?.message ?? "").split(
      "product_sheet:"
    )[1];
    const messages: Record<string, string> = {
      expired: t("productSheetUx.expired"),
      review_limit: t("productSheetUx.reviewLimit"),
      review_size: t("productSheetUx.reviewSize"),
      catalog_limit: t("productSheetUx.catalogLimit"),
      empty_file: t("productSheetUx.emptySheet"),
    };
    return messages[reason] ?? t("productSheetUx.failed");
  }
  function issueText(issue: ProductImportIssue) {
    const messages = {
      missing_name: t("productImportUx.missingName"),
      missing_price: t("productImportUx.missingPrice"),
      invalid_value: t("productImportUx.invalidValue"),
      formula: t("productImportUx.formula"),
      unsupported_cell: t("productImportUx.unsupportedCell"),
      duplicate_mapping: t("productImportUx.duplicateMapping"),
      missing_mapping: t("productImportUx.missingMapping"),
      unknown_column: t("productImportUx.unknownColumn"),
      duplicate_sku: t("productImportUx.duplicateSku"),
      existing_sku: t("productImportUx.existingSku"),
    };
    return `${issue.field ? labels[issue.field] + ": " : ""}${messages[issue.code]}`;
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
      const input = productSheetPrepareInput.parse({
        reviewId: crypto.randomUUID(),
        selection: {
          expectedSourceDigest: connection.source.digest,
          sheet,
          options: { ...options, sheetId: sheet.id },
        },
        mode,
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
        productSheetReadInput.parse({ reviewId: input.reviewId }),
        next
      );
      remember({ ...next, digest: r.digest });
      setDirty(false);
      setOptions(r.options.options);
      await utils.products.sheetImport.read.invalidate({
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
      const sel = productSheetReadInput.parse({
        reviewId: saved.input.reviewId,
      });
      const raw = await utils.products.sheetImport.read.fetch(sel, {
        staleTime: 0,
      });
      if (!current()) return;
      const r = checkedSheetReview(raw, scope, sel, saved);
      remember({ ...saved, digest: r.digest });
      setPage(1);
      setFilter("all");
      setMode(r.mode);
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
        } else setNotice(t("productSheetUx.uncertain"));
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
      const raw = await utils.products.sheetImport.receipt.fetch(
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
  function value(field: ProductImportField, raw: unknown, currency?: string) {
    if (raw === null || raw === "") return t("productSheetUx.emptyValue");
    if (["price", "costPrice", "compareAtPrice"].includes(field) && currency)
      return `${String(raw)} ${currency}`;
    if (field === "status")
      return choices.status[raw as keyof typeof choices.status];
    if (field === "productType")
      return choices.productType[raw as keyof typeof choices.productType];
    if (field === "trackInventory")
      return raw === 1 ? t("productSheetUx.yes") : t("productSheetUx.no");
    return String(raw);
  }
  const optionEditor = (
    <div className="pw-form-grid">
      <label>
        {t("productWorkspaceUx.currency")}
        <select
          disabled={busy || pending || !!receipt}
          value={options.currency}
          onChange={e =>
            changeOptions({ currency: e.target.value as Options["currency"] })
          }
        >
          <option value="SAR">SAR</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label>
        {t("productWorkspaceUx.productType")}
        <select
          disabled={busy || pending || !!receipt}
          value={options.productType}
          onChange={e =>
            changeOptions({
              productType: e.target.value as Options["productType"],
            })
          }
        >
          {Object.entries(choices.productType).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("productWorkspaceUx.status")}
        <select
          disabled={busy || pending || !!receipt}
          value={options.status}
          onChange={e =>
            changeOptions({ status: e.target.value as Options["status"] })
          }
        >
          {Object.entries(choices.status).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
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
      className="pw-workspace pi-workspace ps-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
      aria-busy={busy}
    >
      <header>
        <h2>{t("productSheetUx.title")}</h2>
        <p>{t("productSheetUx.intro")}</p>
        <p className="pw-notice">{t("productSheetUx.reviewRequiredHint")}</p>
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
              <h3>{t("productSheetUx.completed")}</h3>
              <p>{t("productSheetUx.completedHint")}</p>
              <dl className="pw-summary">
                {(["create", "update", "unchanged"] as const).map(k => (
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
                  {receipt.rows.map(r => (
                    <li key={r.number}>
                      {t("productSheetUx.row", { number: r.number })} ·{" "}
                      {actions[r.action]} · #{r.productId}
                    </li>
                  ))}
                </ul>
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
              <h3>{t("productSheetUx.notLinked")}</h3>
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
                <h3>{t("productSheetUx.selectSheet")}</h3>
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
                      <label>
                        {t("productSheetUx.matchMode")}
                        <select
                          disabled={busy}
                          value={mode}
                          onChange={e => setMode(e.target.value as typeof mode)}
                        >
                          <option value="create_only">
                            {t("productSheetUx.createOnly")}
                          </option>
                          <option value="sku">
                            {t("productSheetUx.matchSku")}
                          </option>
                          <option value="name">
                            {t("productSheetUx.matchName")}
                          </option>
                        </select>
                      </label>
                      <p>
                        {mode === "name"
                          ? t("productSheetUx.nameWarning")
                          : t("productSheetUx.matchHint")}
                      </p>
                      <details>
                        <summary>{t("productSheetUx.defaults")}</summary>
                        {optionEditor}
                        <p>{t("productSheetUx.defaultsHint")}</p>
                      </details>
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
                <h3 ref={heading} tabIndex={-1}>
                  {t("productSheetUx.reviewTitle")}
                </h3>
                <p>
                  {data.snapshot.sheet.title} · <bdi>{data.snapshot.range}</bdi>
                </p>
                <p>
                  {t("productSheetUx.readAt")}{" "}
                  {new Date(data.snapshot.readAt).toLocaleString(i18n.language)}
                </p>
                <p>{t("productSheetUx.frozenHint")}</p>
                {data.snapshot.limitedRange && (
                  <p className="pw-notice" role="status">
                    {t("productSheetUx.rangeLimited", {
                      rows: data.snapshot.coveredRows,
                      columns: data.snapshot.coveredColumns,
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
                  <summary>{t("productSheetUx.mapping")}</summary>
                  <p>{t("productSheetUx.mappingHint")}</p>
                  {data.preview.issues.length > 0 && (
                    <ul className="pi-errors">
                      {data.preview.issues.map((issue, i) => (
                        <li key={i}>{issueText(issue)}</li>
                      ))}
                    </ul>
                  )}
                  <div className="pw-form-grid">
                    {data.preview.headers.map(h => (
                      <label key={h.column}>
                        {h.label ||
                          t("productSheetUx.column", { number: h.column + 1 })}
                        <select
                          disabled={busy}
                          value={
                            options.mapping?.find(m => m.column === h.column)
                              ?.field ??
                            (options.mapping?.some(m => m.column === h.column)
                              ? ""
                              : (h.field ?? ""))
                          }
                          onChange={e =>
                            changeOptions({
                              mapping: data!.preview.headers.map(v => ({
                                column: v.column,
                                field:
                                  v.column === h.column
                                    ? ((e.target.value ||
                                        null) as ProductImportField | null)
                                    : (options.mapping?.find(
                                        m => m.column === v.column
                                      )?.field ??
                                      (options.mapping?.some(
                                        m => m.column === v.column
                                      )
                                        ? null
                                        : v.field)),
                              })),
                            })
                          }
                        >
                          <option value="">{t("productSheetUx.ignore")}</option>
                          {productImportFields.map(f => (
                            <option key={f} value={f}>
                              {labels[f]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {optionEditor}
                  <p>{t("productSheetUx.defaultsHint")}</p>
                </details>
                {dirty && <p role="status">{t("productSheetUx.dirty")}</p>}
                <div className="pw-actions">
                  <button
                    disabled={
                      busy ||
                      !connectionReady ||
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
                            ·{" "}
                            {change.after?.name ??
                              change.before?.name ??
                              source.fields?.name ??
                              t("productSheetUx.invalidName")}
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
                        {change.warnings.length > 0 && (
                          <p className="pw-notice">
                            {t("productSheetUx.existingName")}
                          </p>
                        )}
                        {source.issues.length > 0 && (
                          <ul className="pi-errors">
                            {source.issues.map((issue, i) => (
                              <li key={i}>{issueText(issue)}</li>
                            ))}
                          </ul>
                        )}
                        {change.after && (
                          <dl className="ps-changes">
                            {(change.action === "unchanged"
                              ? ([
                                  "name",
                                  "price",
                                  "currency",
                                ] as ProductImportField[])
                              : change.changes
                            ).map(field => (
                              <div key={field}>
                                <dt>{labels[field]}</dt>
                                <dd>
                                  {change.before && (
                                    <span>
                                      <small>
                                        {t("productSheetUx.before")}
                                      </small>
                                      {value(
                                        field,
                                        change.before[field],
                                        change.before.currency
                                      )}
                                    </span>
                                  )}
                                  <span>
                                    <small>{t("productSheetUx.after")}</small>
                                    {value(
                                      field,
                                      change.after![field],
                                      change.after!.currency
                                    )}
                                  </span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        <details>
                          <summary>
                            {t("productSheetUx.originalValues")}
                          </summary>
                          <dl className="ps-raw">
                            {data!.preview.headers.map(h => (
                              <div key={h.column}>
                                <dt>
                                  {h.label ||
                                    t("productSheetUx.column", {
                                      number: h.column + 1,
                                    })}
                                </dt>
                                <dd>
                                  {source.values[h.column] ||
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
                <h3>{t("productSheetUx.approveTitle")}</h3>
                <p>{t("productSheetUx.approveHint")}</p>
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
                  {t("productSheetUx.consent")}
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
                  {t("productSheetUx.commit", {
                    count: data.counts.create + data.counts.update,
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
              <h3 ref={confirmHeading} tabIndex={-1}>
                {t("productSheetUx.discardTitle")}
              </h3>
              <p>{t("productSheetUx.discardHint")}</p>
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
