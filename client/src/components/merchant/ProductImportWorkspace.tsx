import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  productCatalogInput,
  productCatalogSchema,
} from "@shared/product-catalog";
import {
  productImportFields,
  productImportReadInput,
  type ProductImportIssue,
} from "@shared/product-import";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readImportAttempt,
  saveImportAttempt,
  clearImportAttempt,
  checkedImportReview,
  checkedImportReceipt,
  readImportFile,
  fingerprintImportFile,
  importFileError,
  productImportTemplate,
  downloadImportText,
  type ImportAttempt,
  type ImportOptions,
} from "@/lib/product-import-workspace";
import {
  ProductHeading,
  ProductPending,
  productLabels,
  productChoices,
  productDefinitiveError,
} from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
import "@/styles/product-import.css";

const defaults: ImportOptions = {
  currency: "SAR",
  productType: "physical",
  status: "draft",
  delimiter: ",",
  sheet: 0,
};
export function ProductImportWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    labels = productLabels(t),
    choices = productChoices(t),
    utils = trpc.useUtils(),
    [actorId, merchantId] = scope.split(":").map(Number);
  const [cached, setCached] = useState<ImportAttempt | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [options, setOptions] = useState<ImportOptions>(defaults),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState<"all" | "errors">("all"),
    [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [fileError, setFileError] = useState(""),
    [cancelReview, setCancelReview] = useState<false | "local" | "server">(
      false
    );
  const [fileEditorOpen, setFileEditorOpen] = useState(true);
  const reviewHeading = useRef<HTMLHeadingElement>(null),
    cancelHeading = useRef<HTMLHeadingElement>(null),
    focusedReview = useRef("");
  const alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    lock = useRef(false),
    cacheRef = useRef(cached),
    fileInput = useRef<HTMLInputElement>(null);
  const selection = productImportReadInput.parse({
    reviewId: cached?.reviewId ?? "00000000-0000-4000-8000-000000000000",
    page,
    filter,
  });
  const query = trpc.products.importReview.read.useQuery(selection, {
      enabled: loaded && !!cached && !cached.receipt,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }),
    catalogSelection = productCatalogInput.parse({ pageSize: 1 }),
    catalog = trpc.products.list.useQuery(catalogSelection, {
      retry: false,
      staleTime: 0,
    }),
    prepareMutation = trpc.products.importReview.prepare.useMutation(),
    commitMutation = trpc.products.importReview.commit.useMutation(),
    discardMutation = trpc.products.importReview.discard.useMutation();
  let data: ReturnType<typeof checkedImportReview> | null = null;
  try {
    data = checkedImportReview(query.data, scope, selection);
  } catch {
    /* Fail closed on a stale or foreign response. */
  }
  const catalogParsed = productCatalogSchema.safeParse(catalog.data),
    catalogReady =
      catalogParsed.success &&
      catalogParsed.data.merchantId === merchantId &&
      JSON.stringify(catalogParsed.data.selection) ===
        JSON.stringify(catalogSelection) &&
      !catalog.error &&
      !catalog.isFetching &&
      catalog.fetchStatus !== "paused";
  const ready =
      !!data &&
      !query.error &&
      !query.isFetching &&
      !query.isLoading &&
      query.fetchStatus !== "paused",
    canManage = ready
      ? data!.canManage
      : catalogReady && catalogParsed.success && catalogParsed.data.canManage,
    source = ready
      ? data!.integrationSource
      : catalogReady && catalogParsed.success
        ? catalogParsed.data.integrationSource
        : null;
  const reviewReceipt = ready ? data?.receipt : null;
  const missingReview =
    loaded &&
    !!cached?.digest &&
    !cached.attempt &&
    !cached.receipt &&
    !!query.error &&
    workspaceFailureKind(query.error) === "missing" &&
    !query.isFetching &&
    !query.isLoading &&
    query.fetchStatus !== "paused";
  const receipt =
      cached?.receipt ??
      (cached?.attempt && reviewReceipt?.requestId !== cached.attempt.requestId
        ? null
        : reviewReceipt),
    pending = !!cached?.attempt && !receipt,
    canPrepare =
      loaded &&
      !storageError &&
      !pending &&
      !receipt &&
      canManage &&
      source === "none" &&
      !busy;
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  function remember(value: ImportAttempt) {
    try {
      saveImportAttempt(scope, value, epoch.current);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    cacheRef.current = value;
    setCached(value);
  }
  function load() {
    try {
      const value = readImportAttempt(scope);
      cacheRef.current = value;
      setCached(value);
      setFileEditorOpen(!value?.digest);
      setOptions(value?.options ?? defaults);
      setLoaded(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [scope]);
  useEffect(() => {
    setReviewed(false);
  }, [query.dataUpdatedAt, page, filter, dirty, data?.preview.digest]);
  useEffect(() => {
    if (cancelReview) cancelHeading.current?.focus();
  }, [cancelReview]);
  useEffect(() => {
    if (
      ready &&
      cached?.digest &&
      !pending &&
      !dirty &&
      focusedReview.current !== cached.reviewId
    ) {
      focusedReview.current = cached.reviewId;
      reviewHeading.current?.focus();
    }
  }, [ready, cached?.digest, cached?.reviewId, pending, dirty]);
  useEffect(() => {
    if (!cached?.attempt || receipt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [cached?.attempt, receipt]);
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
  function failure(error: unknown) {
    const reason = (error as Error)?.message?.split("product_import:")[1];
    const messages: Record<string, string> = {
      file_type: t("productImportUx.fileTypeError"),
      file_size: t("productImportUx.fileSizeError"),
      empty_file: t("productImportUx.emptyFile"),
      encoding: t("productImportUx.encoding"),
      csv_syntax: t("productImportUx.csvSyntax"),
      row_limit: t("productImportUx.rowLimit"),
      column_limit: t("productImportUx.columnLimit"),
      cell_limit: t("productImportUx.cellLimit"),
      sheet_missing: t("productImportUx.sheetMissing"),
      sheet_limit: t("productImportUx.sheetLimit"),
      xlsx_invalid: t("productImportUx.xlsxInvalid"),
      review_limit: t("productImportUx.reviewLimit"),
      preview_size: t("productImportUx.previewSize"),
      expired: t("productImportUx.expired"),
      source_locked: t("productWorkspaceUx.locked"),
    };
    return messages[reason] ?? t("productImportUx.requestFailed");
  }
  function changeOptions(patch: Partial<ImportOptions>) {
    setOptions(value => ({ ...value, ...patch }));
    setDirty(true);
    setReviewed(false);
  }
  async function prepare() {
    if (!current() || lock.current || !canPrepare || !file) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setFileError("");
    try {
      const input = await readImportFile(file, options),
        fingerprint = await fingerprintImportFile(input);
      if (!current()) return;
      let prior = cacheRef.current;
      if (prior && !prior.digest && prior.fingerprint !== fingerprint) {
        setNotice(t("productImportUx.sameFile"));
        return;
      }
      if (prior?.digest) {
        if (!ready || data?.reviewId !== prior.reviewId) {
          setNotice(t("productImportUx.refreshFirst"));
          return;
        }
        await discardMutation.mutateAsync({
          reviewId: prior.reviewId,
          expectedDigest: prior.digest,
        });
        if (!current()) return;
        prior = null;
      }
      const next: ImportAttempt = {
        reviewId: prior?.reviewId ?? crypto.randomUUID(),
        fingerprint,
        options,
        digest: null,
        attempt: null,
        receipt: null,
      };
      try {
        remember(next);
      } catch {
        setStorageError(true);
        return;
      }
      setPage(1);
      setFilter("all");
      setReviewed(false);
      const raw = await prepareMutation.mutateAsync({
        reviewId: next.reviewId,
        file: input,
      });
      if (!current()) return;
      const review = checkedImportReview(
        raw,
        scope,
        productImportReadInput.parse({ reviewId: next.reviewId })
      );
      try {
        remember({ ...next, digest: review.preview.digest });
      } catch {
        setStorageError(true);
        return;
      }
      setDirty(false);
      setFileEditorOpen(false);
      setOptions(value => ({
        ...value,
        mapping: review.preview.headers.map(header => ({
          column: header.column,
          field: header.field,
        })),
      }));
      await utils.products.importReview.read.invalidate({
        reviewId: next.reviewId,
      });
    } catch (error) {
      if (current()) {
        setNotice(failure(error));
        // A known rejection cannot have saved a review. An uncertain reply keeps its identity for recovery.
        if (
          productDefinitiveError(error) &&
          !cacheRef.current?.digest &&
          !cacheRef.current?.attempt
        ) {
          try {
            clearImportAttempt(scope, epoch.current);
            cacheRef.current = null;
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
    const saved = cacheRef.current;
    if (!saved || lock.current || !current()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const raw = await utils.products.importReview.read.fetch(
        productImportReadInput.parse({ reviewId: saved.reviewId })
      );
      if (!current()) return;
      const review = checkedImportReview(
        raw,
        scope,
        productImportReadInput.parse({ reviewId: saved.reviewId })
      );
      remember({ ...saved, digest: review.preview.digest });
      setPage(1);
      setFilter("all");
      setDirty(false);
      await query.refetch();
    } catch (error) {
      if (current()) setNotice(failure(error));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function accept(raw: unknown, saved: ImportAttempt) {
    if (!saved.attempt) throw Error("Missing import request");
    const confirmed = checkedImportReceipt(raw, scope, saved.attempt);
    try {
      remember({ ...saved, receipt: confirmed });
      setNotice("");
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    void utils.products.list.invalidate();
  }
  async function commit(retry = false) {
    if (!current() || lock.current || !loaded || storageError || !canManage)
      return;
    const saved = cacheRef.current;
    if (!saved || saved.receipt) return;
    if (
      !retry &&
      (!ready ||
        !data?.canCommit ||
        !reviewed ||
        dirty ||
        !saved.digest ||
        saved.digest !== data.preview.digest)
    )
      return;
    if (retry && !saved.attempt) return;
    const next: ImportAttempt = {
      ...saved,
      attempt: saved.attempt ?? {
        reviewId: saved.reviewId,
        requestId: crypto.randomUUID(),
        expectedDigest: saved.digest!,
        reviewed: true,
      },
    };
    try {
      remember(next);
    } catch {
      setStorageError(true);
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
          setNotice(t("productImportUx.commitRejected"));
          void query.refetch();
        } else setNotice(t("productImportUx.uncertain"));
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recoverReceipt() {
    const saved = cacheRef.current;
    if (!saved?.attempt || lock.current || !current()) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const raw = await utils.products.importReview.receipt.fetch({
        requestId: saved.attempt.requestId,
      });
      if (!current()) return;
      if (raw) accept(raw, saved);
      else setNotice(t("productImportUx.notCommitted"));
    } catch {
      if (current()) setNotice(t("productImportUx.receiptUnavailable"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function resetReview() {
    clearImportAttempt(scope, epoch.current);
    cacheRef.current = null;
    setCached(null);
    setCancelReview(false);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setOptions(defaults);
    setFileEditorOpen(true);
    setDirty(false);
    setReviewed(false);
    setPage(1);
    setFilter("all");
    setFileError("");
    setNotice("");
    focusedReview.current = "";
  }
  function clearMissing() {
    const saved = cacheRef.current;
    if (
      !current() ||
      lock.current ||
      !missingReview ||
      !saved ||
      saved.attempt ||
      saved.receipt ||
      saved.reviewId !== cached?.reviewId
    )
      return;
    try {
      resetReview();
    } catch {
      setStorageError(true);
    }
  }
  async function clear() {
    if (!current() || lock.current || pending) return;
    const saved = cacheRef.current;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (saved?.digest)
        await discardMutation.mutateAsync({
          reviewId: saved.reviewId,
          expectedDigest: saved.digest,
        });
      if (!current()) return;
      resetReview();
    } catch (error) {
      if (current()) setNotice(failure(error));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <section
      className="pw-workspace pi-workspace"
      dir={i18n.language.startsWith("en") ? "ltr" : "rtl"}
      aria-busy={busy}
    >
      <header className="pw-header">
        <div>
          <p className="pw-eyebrow">{t("productImportUx.eyebrow")}</p>
          <ProductHeading>{t("productImportUx.title")}</ProductHeading>
          <p>{t("productImportUx.subtitle")}</p>
        </div>
        <a className="pw-button" href={href("/merchant/products")}>
          {t("productWorkspaceUx.back")}
        </a>
      </header>
      <ol className="pi-steps" aria-label={t("productImportUx.steps")}>
        <li aria-current={!cached ? "step" : undefined}>
          {t("productImportUx.stepFile")}
        </li>
        <li aria-current={cached && !receipt ? "step" : undefined}>
          {t("productImportUx.stepReview")}
        </li>
        <li aria-current={receipt ? "step" : undefined}>
          {t("productImportUx.stepDone")}
        </li>
      </ol>
      {storageError && (
        <WorkspaceState
          inline
          kind="error"
          title={t("productWorkspaceUx.storageError")}
          onRetry={load}
        />
      )}
      {!loaded && !storageError && <WorkspaceState inline kind="loading" />}
      {notice && (
        <p role="status" className="pw-notice">
          {notice}
        </p>
      )}
      {receipt ? (
        <section className="pw-panel" role="status">
          <h2>{t("productImportUx.confirmed", { count: receipt.count })}</h2>
          <p>{t("productImportUx.receiptHint")}</p>
          <p className="pw-muted">
            {t("productImportUx.receiptId")} <bdi>{receipt.requestId}</bdi>
          </p>
          <div className="pw-actions">
            <a className="pw-button" href={href("/merchant/products")}>
              {t("uploadProductsPage.viewProducts")}
            </a>
            <button
              type="button"
              disabled={busy || storageError}
              onClick={clear}
            >
              {t("productImportUx.startAnother")}
            </button>
          </div>
        </section>
      ) : (
        <>
          {pending && (
            <ProductPending
              busy={busy || storageError}
              canRetry={!!canManage}
              recover={recoverReceipt}
              retry={() => commit(true)}
            />
          )}
          {loaded && !pending && (
            <>
              {!canManage && catalogReady && (
                <p className="pw-notice">{t("productWorkspaceUx.viewer")}</p>
              )}
              {(ready || catalogReady) && source !== "none" && (
                <p className="pw-notice">{t("productWorkspaceUx.locked")}</p>
              )}
              {!cached && !catalogReady && (
                <WorkspaceState
                  inline
                  kind={
                    catalog.error
                      ? workspaceFailureKind(catalog.error)
                      : catalog.fetchStatus === "paused"
                        ? "offline"
                        : catalog.isFetching || catalog.isLoading
                          ? "loading"
                          : "error"
                  }
                  onRetry={() => catalog.refetch()}
                />
              )}
              <details
                className="pw-panel pi-file-panel"
                open={fileEditorOpen}
                onToggle={event => setFileEditorOpen(event.currentTarget.open)}
              >
                <summary>{t("productImportUx.chooseFile")}</summary>
                <p>{t("productImportUx.limits")}</p>
                <label>
                  {t("productImportUx.file")}
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.xlsx"
                    disabled={!canPrepare}
                    aria-invalid={!!fileError}
                    aria-describedby={fileError ? "pi-file-error" : undefined}
                    onChange={event => {
                      const chosen = event.target.files?.[0] ?? null;
                      setFile(null);
                      setFileError("");
                      setNotice("");
                      setDirty(true);
                      setReviewed(false);
                      setOptions(value => ({
                        ...value,
                        mapping: undefined,
                        sheet: 0,
                      }));
                      if (!chosen) return;
                      const invalid = importFileError(chosen);
                      if (invalid) {
                        setFileError(
                          failure(Error(`product_import:${invalid}`))
                        );
                        event.target.value = "";
                        return;
                      }
                      setFile(chosen);
                    }}
                  />
                </label>
                {fileError && (
                  <p id="pi-file-error" className="pw-error" role="alert">
                    {fileError}
                  </p>
                )}
                <div className="pw-fields">
                  <label>
                    {labels.currency}
                    <select
                      value={options.currency}
                      disabled={!canPrepare}
                      onChange={event =>
                        changeOptions({
                          currency: event.target.value as "SAR" | "USD",
                        })
                      }
                    >
                      <option value="SAR">SAR</option>
                      <option value="USD">USD</option>
                    </select>
                  </label>
                  <label>
                    {labels.productType}
                    <select
                      value={options.productType}
                      disabled={!canPrepare}
                      onChange={event =>
                        changeOptions({
                          productType: event.target
                            .value as ImportOptions["productType"],
                        })
                      }
                    >
                      {Object.entries(choices.productType).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>
                <details className="pw-panel">
                  <summary>{t("productImportUx.advanced")}</summary>
                  <p>{t("productImportUx.defaultsHint")}</p>
                  <div className="pw-fields">
                    <label>
                      {labels.status}
                      <select
                        value={options.status}
                        disabled={!canPrepare}
                        onChange={event =>
                          changeOptions({
                            status: event.target
                              .value as ImportOptions["status"],
                          })
                        }
                      >
                        {Object.entries(choices.status).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {file?.name.toLowerCase().endsWith(".csv") ? (
                      <label>
                        {t("productImportUx.delimiter")}
                        <select
                          value={options.delimiter}
                          disabled={!canPrepare}
                          onChange={event =>
                            changeOptions({
                              delimiter: event.target
                                .value as ImportOptions["delimiter"],
                              mapping: undefined,
                            })
                          }
                        >
                          <option value=",">
                            {t("productImportUx.comma")}
                          </option>
                          <option value=";">
                            {t("productImportUx.semicolon")}
                          </option>
                          <option value={"\t"}>Tab</option>
                        </select>
                      </label>
                    ) : (
                      <label>
                        {t("productImportUx.sheetNumber")}
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={options.sheet + 1}
                          disabled={!canPrepare}
                          onChange={event =>
                            changeOptions({
                              sheet: Math.min(
                                19,
                                Math.max(0, Number(event.target.value) - 1)
                              ),
                              mapping: undefined,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                </details>
                <div className="pw-actions">
                  <button
                    type="button"
                    className="pw-primary"
                    disabled={!canPrepare || !file}
                    onClick={prepare}
                  >
                    {busy
                      ? t("productImportUx.preparing")
                      : cached?.digest
                        ? t("productImportUx.refreshPreview")
                        : t("productImportUx.preview")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      downloadImportText(
                        productImportTemplate(
                          options.productType === "service"
                            ? "service"
                            : "physical",
                          i18n.language
                        ),
                        "sary-products-template.csv"
                      )
                    }
                  >
                    {t("productImportUx.template")}
                  </button>
                </div>
                <p className="pw-muted">{t("productImportUx.noChangesYet")}</p>
              </details>
              {cached && !cached.digest && (
                <section className="pw-notice">
                  <h2>{t("productImportUx.preparePending")}</h2>
                  <p>{t("productImportUx.prepareRecovery")}</p>
                  <button
                    type="button"
                    disabled={busy || storageError}
                    onClick={recoverReview}
                  >
                    {t("productImportUx.restorePreview")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || storageError}
                    onClick={() => setCancelReview("server")}
                  >
                    {t("productImportUx.discard")}
                  </button>
                </section>
              )}
            </>
          )}
          {cached?.digest && !ready && !pending && (
            <WorkspaceState
              inline
              title={
                missingReview
                  ? t("productImportUx.missingReviewTitle")
                  : undefined
              }
              description={
                missingReview
                  ? t("productImportUx.missingReviewHint")
                  : undefined
              }
              action={
                missingReview ? (
                  <div className="pw-actions">
                    <button
                      type="button"
                      disabled={busy || storageError}
                      onClick={() => query.refetch()}
                    >
                      {t("productWorkspaceUx.refresh")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || storageError}
                      onClick={() => setCancelReview("local")}
                    >
                      {t("productImportUx.startAnother")}
                    </button>
                  </div>
                ) : undefined
              }
              kind={
                query.error
                  ? workspaceFailureKind(query.error)
                  : query.fetchStatus === "paused"
                    ? "offline"
                    : query.isFetching || query.isLoading
                      ? "loading"
                      : "error"
              }
              onRetry={() => query.refetch()}
            />
          )}
          {ready && data && cached?.digest && !pending && (
            <>
              <section className="pw-panel">
                <header className="pw-header">
                  <div>
                    <h2 ref={reviewHeading} tabIndex={-1}>
                      {t("productImportUx.reviewTitle")}
                    </h2>
                    <p>{data.preview.fileName}</p>
                    <p className="pw-muted">
                      {t("productImportUx.expiresAt", {
                        time: new Date(data.expiresAt).toLocaleString(
                          i18n.language
                        ),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => query.refetch()}
                  >
                    {t("productWorkspaceUx.refresh")}
                  </button>
                </header>
                {data.expired && (
                  <div className="pw-error" role="alert">
                    <p>{t("productImportUx.expired")}</p>
                    <button
                      type="button"
                      disabled={busy || storageError}
                      onClick={() => setCancelReview("server")}
                    >
                      {t("productImportUx.startAnother")}
                    </button>
                  </div>
                )}
                {dirty && (
                  <p className="pw-notice">
                    {t("productImportUx.changedOptions")}
                  </p>
                )}
                <dl className="pw-summary">
                  <div>
                    <dt>{t("productImportUx.total")}</dt>
                    <dd>{data.preview.total}</dd>
                  </div>
                  <div>
                    <dt>{t("productImportUx.valid")}</dt>
                    <dd>{data.preview.valid}</dd>
                  </div>
                  <div>
                    <dt>{t("productImportUx.invalid")}</dt>
                    <dd>{data.preview.invalid}</dd>
                  </div>
                </dl>
                {data.preview.issues.length > 0 && (
                  <ul className="pi-errors" role="alert">
                    {data.preview.issues.map((issue, index) => (
                      <li key={index}>{issueText(issue)}</li>
                    ))}
                  </ul>
                )}
                <details className="pw-panel">
                  <summary>{t("productImportUx.mapping")}</summary>
                  <p>{t("productImportUx.mappingHint")}</p>
                  <div className="pw-fields">
                    {data.preview.headers.map(header => (
                      <label key={header.column}>
                        {header.label ||
                          t("productImportUx.columnNumber", {
                            number: header.column + 1,
                          })}
                        <select
                          aria-label={t("productImportUx.mapColumn", {
                            number: header.column + 1,
                            name: header.label,
                          })}
                          value={
                            options.mapping
                              ? (options.mapping.find(
                                  item => item.column === header.column
                                )?.field ?? "")
                              : (header.field ?? "")
                          }
                          disabled={!canPrepare || !file}
                          onChange={event => {
                            const mapping =
                              options.mapping ??
                              data!.preview.headers.map(item => ({
                                column: item.column,
                                field: item.field,
                              }));
                            changeOptions({
                              mapping: mapping.map(item =>
                                item.column === header.column
                                  ? {
                                      column: item.column,
                                      field: event.target.value
                                        ? (event.target
                                            .value as (typeof productImportFields)[number])
                                        : null,
                                    }
                                  : item
                              ),
                            });
                          }}
                        >
                          <option value="">
                            {t("productImportUx.ignore")}
                          </option>
                          {productImportFields.map(field => (
                            <option key={field} value={field}>
                              {labels[field]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {data.preview.sheets.length > 0 && (
                    <ul>
                      {data.preview.sheets.map(sheet => (
                        <li key={sheet.index}>
                          {sheet.index + 1}. {sheet.name}{" "}
                          {sheet.hidden ? t("productImportUx.hiddenSheet") : ""}{" "}
                          {sheet.index === data!.preview.sheet
                            ? t("productImportUx.selectedSheet")
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!file && <p>{t("productImportUx.reselectFile")}</p>}
                </details>
              </section>
              <div className="pw-header">
                <label>
                  {t("productImportUx.showRows")}
                  <select
                    value={filter}
                    onChange={event => {
                      setFilter(event.target.value as "all" | "errors");
                      setPage(1);
                    }}
                  >
                    <option value="all">{t("productImportUx.allRows")}</option>
                    <option value="errors">
                      {t("productImportUx.errorRows")}
                    </option>
                  </select>
                </label>
                <p className="pw-muted">{t("productImportUx.rowsHint")}</p>
              </div>
              <ol className="pi-rows">
                {data.preview.rows.map(row => (
                  <li className="pw-panel" key={row.number}>
                    <h2>
                      {t("productImportUx.rowNumber", { number: row.number })} ·{" "}
                      {row.fields?.name ??
                        row.values[
                          data!.preview.headers.find(
                            header => header.field === "name"
                          )?.column ?? 0
                        ]}
                    </h2>
                    {row.issues.length > 0 && (
                      <ul className="pi-errors">
                        {row.issues.map((issue, index) => (
                          <li key={index}>{issueText(issue)}</li>
                        ))}
                      </ul>
                    )}
                    <dl className="pi-row-summary">
                      <div>
                        <dt>{labels.price}</dt>
                        <dd>
                          {row.fields
                            ? `${row.fields.price} ${row.fields.currency}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>{labels.status}</dt>
                        <dd>
                          {row.fields ? choices.status[row.fields.status] : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>{labels.stock}</dt>
                        <dd>
                          {row.fields?.stock ?? t("productWorkspaceUx.unknown")}
                        </dd>
                      </div>
                    </dl>
                    <details>
                      <summary>{t("productImportUx.rowDetails")}</summary>
                      <dl className="pi-row-details">
                        {data.preview.headers.map(header => (
                          <div key={header.column}>
                            <dt>
                              {header.field
                                ? labels[header.field]
                                : `${header.label} · ${t("productImportUx.ignore")}`}
                            </dt>
                            <dd>{row.values[header.column] || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                      {row.fields && (
                        <>
                          <h3>{t("productImportUx.effectiveValues")}</h3>
                          <dl className="pi-row-details">
                            {productImportFields.map(field => (
                              <div key={field}>
                                <dt>{labels[field]}</dt>
                                <dd>
                                  {field === "status"
                                    ? choices.status[row.fields!.status]
                                    : field === "productType"
                                      ? choices.productType[
                                          row.fields!.productType
                                        ]
                                      : (row.fields![field] ?? "—")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}
                    </details>
                  </li>
                ))}
              </ol>
              {!data.preview.rows.length && (
                <p className="pw-notice">{t("productImportUx.noRows")}</p>
              )}
              <nav
                className="pw-pagination"
                aria-label={t("productImportUx.pagination")}
              >
                <button
                  type="button"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage(value => value - 1)}
                >
                  {t("productWorkspaceUx.previous")}
                </button>
                <span>
                  {t("productImportUx.pageOf", {
                    page,
                    pages: Math.max(1, data.preview.totalPages),
                  })}
                </span>
                <button
                  type="button"
                  disabled={page >= data.preview.totalPages || busy}
                  onClick={() => setPage(value => value + 1)}
                >
                  {t("productWorkspaceUx.next")}
                </button>
              </nav>
              <section className="pw-panel pi-approval">
                <h2>{t("productImportUx.approval")}</h2>
                <p>{t("productImportUx.approvalHint")}</p>
                {data.preview.invalid > 0 && (
                  <p className="pw-error">{t("productImportUx.fixAll")}</p>
                )}
                <label className="pw-check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={!data.canCommit || dirty || busy || storageError}
                    onChange={event => setReviewed(event.target.checked)}
                  />
                  {t("productImportUx.consent", { count: data.preview.total })}
                </label>
                <div className="pw-actions">
                  <button
                    type="button"
                    className="pw-primary"
                    disabled={
                      !data.canCommit ||
                      dirty ||
                      !reviewed ||
                      busy ||
                      storageError
                    }
                    onClick={() => commit()}
                  >
                    {t("productImportUx.commit", { count: data.preview.total })}
                  </button>
                  <button
                    type="button"
                    disabled={busy || storageError}
                    onClick={() => setCancelReview("server")}
                  >
                    {t("productImportUx.discard")}
                  </button>
                </div>
              </section>
            </>
          )}
          {cancelReview && !pending && (
            <section className="pw-notice">
              <h2 ref={cancelHeading} tabIndex={-1}>
                {cancelReview === "local"
                  ? t("productImportUx.forgetReviewTitle")
                  : t("productImportUx.discardTitle")}
              </h2>
              <p>
                {cancelReview === "local"
                  ? t("productImportUx.forgetReviewHint")
                  : t("productImportUx.discardHint")}
              </p>
              <div className="pw-actions">
                <button
                  type="button"
                  disabled={
                    busy ||
                    storageError ||
                    (cancelReview === "local" && !missingReview)
                  }
                  onClick={cancelReview === "local" ? clearMissing : clear}
                >
                  {cancelReview === "local"
                    ? t("productImportUx.confirmForget")
                    : t("productImportUx.confirmDiscard")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelReview(false)}
                >
                  {t("productWorkspaceUx.keepDraft")}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
