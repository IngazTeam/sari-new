import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { productFileAdviceReceipt } from "@shared/product-file-advice";
import { type ProductImportField } from "@shared/product-import";
import {
  readImportFile,
  type ImportOptions,
} from "@/lib/product-import-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readAdviceReference,
  saveAdviceReference,
  clearAdviceReference,
  checkedAdviceReceipt,
  fingerprintAdviceInput,
  type FileAdviceReference,
} from "@/lib/product-file-advice-workspace";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { productLabels } from "./ProductWorkspaceView";
export type ProductFileAdviceProps = {
  scope: string;
  file: File | null;
  options: ImportOptions;
  disabled: boolean;
  onApply: (
    mapping: { column: number; field: ProductImportField | null }[]
  ) => void;
  onRestoreOptions: (options: ImportOptions) => void;
};
type Receipt = ReturnType<typeof productFileAdviceReceipt.parse>;
export function ProductFileAdviceWorkspace({
  scope,
  file,
  options,
  disabled,
  onApply,
  onRestoreOptions,
}: ProductFileAdviceProps) {
  const { t, i18n } = useTranslation(),
    labels = productLabels(t),
    utils = trpc.useUtils();
  const [saved, setSaved] = useState<FileAdviceReference | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [intent, setIntent] = useState<"auto" | "products" | "services">("auto"),
    [consent, setConsent] = useState(false),
    [confirm, setConfirm] = useState(false),
    [mappingConsent, setMappingConsent] = useState(false);
  const alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    lock = useRef(false),
    referenceRef = useRef<FileAdviceReference | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    currentFile = useRef(file),
    currentOptions = useRef(options);
  currentFile.current = file;
  currentOptions.current = options;
  const mutation = trpc.products.fileAdvice.start.useMutation(),
    query = trpc.products.fileAdvice.read.useQuery(
      { requestId: saved?.requestId ?? "00000000-0000-4000-8000-000000000000" },
      {
        enabled: loaded && !!saved,
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      }
    );
  let receipt: Receipt | null = null;
  if (
    saved &&
    !query.error &&
    !query.isFetching &&
    !query.isLoading &&
    query.fetchStatus !== "paused"
  )
    try {
      receipt = checkedAdviceReceipt(query.data, scope, saved.requestId);
    } catch {
      /* Hide stale/foreign responses. */
    }
  const missing =
    !!saved &&
    !busy &&
    !query.isFetching &&
    !query.isLoading &&
    query.fetchStatus !== "paused" &&
    workspaceFailureKind(query.error) === "missing";
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  function load() {
    try {
      const value = readAdviceReference(scope);
      referenceRef.current = value;
      setSaved(value);
      setIntent(value?.intent ?? "auto");
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
    setConsent(false);
    setMappingConsent(false);
  }, [file, options, intent]);
  useEffect(() => {
    setMappingConsent(false);
  }, [query.dataUpdatedAt, receipt?.sampleDigest]);
  useEffect(() => {
    if (confirm) heading.current?.focus();
  }, [confirm]);
  function remember(value: FileAdviceReference) {
    try {
      saveAdviceReference(scope, value, epoch.current);
      referenceRef.current = value;
      setSaved(value);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
  }
  async function start() {
    if (
      !current() ||
      lock.current ||
      disabled ||
      !loaded ||
      storageError ||
      !file ||
      !consent ||
      referenceRef.current
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const selectedFile = file,
        selectedOptions = options,
        language = i18n.language.startsWith("en") ? "en" : "ar",
        input = {
          file: await readImportFile(selectedFile, selectedOptions),
          intent,
          language,
        },
        fingerprint = await fingerprintAdviceInput(input);
      if (
        !current() ||
        currentFile.current !== selectedFile ||
        currentOptions.current !== selectedOptions
      )
        return;
      const ref: FileAdviceReference = {
        requestId: crypto.randomUUID(),
        fingerprint,
        fileName: selectedFile.name,
        intent,
        language,
        options: selectedOptions,
      };
      remember(ref);
      setConsent(false);
      await mutation.mutateAsync({
        ...input,
        language,
        requestId: ref.requestId,
        reviewed: true,
      });
      if (current())
        await utils.products.fileAdvice.read.invalidate({
          requestId: ref.requestId,
        });
    } catch {
      if (current()) setNotice(t("productAdviceUx.unknownResult"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function apply() {
    if (
      !current() ||
      lock.current ||
      disabled ||
      storageError ||
      !file ||
      !saved ||
      !receipt?.result ||
      !mappingConsent
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    const chosen = file,
      selectedOptions = options,
      ref = saved,
      result = receipt.result;
    try {
      const fingerprint = await fingerprintAdviceInput({
        file: await readImportFile(chosen, selectedOptions),
        intent: ref.intent,
        language: ref.language,
      });
      if (
        !current() ||
        currentFile.current !== chosen ||
        currentOptions.current !== selectedOptions ||
        referenceRef.current?.requestId !== ref.requestId
      )
        return;
      if (fingerprint !== ref.fingerprint) {
        setNotice(t("productAdviceUx.sameFile"));
        return;
      }
      onApply(result.proposal.mapping);
      setMappingConsent(false);
      setNotice(t("productAdviceUx.mappingApplied"));
    } catch {
      if (current()) setNotice(t("productAdviceUx.fileError"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function reset() {
    if (
      !current() ||
      lock.current ||
      !confirm ||
      !(missing || (receipt && receipt.state !== "processing"))
    )
      return;
    try {
      clearAdviceReference(scope, epoch.current);
      referenceRef.current = null;
      setSaved(null);
      setConsent(false);
      setMappingConsent(false);
      setConfirm(false);
      setNotice("");
    } catch {
      setStorageError(true);
    }
  }
  const suggestion = (
    item: NonNullable<Receipt["result"]>["proposal"]["sellingTips"][number],
    key: string | number
  ) => (
    <li className="pw-panel" key={key}>
      <p>{item.text}</p>
      <details>
        <summary>{t("productAdviceUx.evidence")}</summary>
        <ul>
          {item.evidence.map((e, i) => (
            <li key={i}>
              <p>
                {e.row === 0
                  ? t("productAdviceUx.headerCitation", {
                      column: e.column + 1,
                    })
                  : t("productAdviceUx.rowCitation", {
                      row: e.row,
                      column: e.column + 1,
                    })}
              </p>
              <blockquote>{e.quote}</blockquote>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
  return (
    <details
      className="pw-panel pa-workspace"
      open={!!saved || undefined}
      aria-busy={busy}
    >
      <summary>{t("productAdviceUx.title")}</summary>
      <p>{t("productAdviceUx.hint")}</p>
      {storageError && (
        <WorkspaceState
          inline
          kind="error"
          title={t("productAdviceUx.storageError")}
          onRetry={load}
        />
      )}
      {notice && (
        <p role="status" className="pw-notice">
          {notice}
        </p>
      )}
      {!loaded && !storageError && <WorkspaceState inline kind="loading" />}
      {loaded && !saved && (
        <>
          <label>
            {t("productAdviceUx.intent")}
            <select
              value={intent}
              disabled={busy || disabled}
              onChange={e => setIntent(e.target.value as typeof intent)}
            >
              <option value="auto">{t("productAdviceUx.auto")}</option>
              <option value="products">{t("productAdviceUx.products")}</option>
              <option value="services">{t("productAdviceUx.services")}</option>
            </select>
          </label>
          <p>{file ? file.name : t("productAdviceUx.chooseFile")}</p>
          <p>{t("productAdviceUx.scopeHint")}</p>
          <label className="pw-check">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || disabled || !file}
              onChange={e => setConsent(e.target.checked)}
            />
            {t("productAdviceUx.consent")}
          </label>
          <button
            type="button"
            className="pw-primary"
            disabled={busy || disabled || storageError || !consent || !file}
            onClick={start}
          >
            {busy ? t("productAdviceUx.starting") : t("productAdviceUx.start")}
          </button>
        </>
      )}
      {saved && (
        <>
          <p>
            <strong>{saved.fileName}</strong>
          </p>
          <p className="pw-muted">
            {t("productAdviceUx.reference")} <bdi>{saved.requestId}</bdi>
          </p>
          {busy && <p role="status">{t("productAdviceUx.starting")}</p>}
          {!receipt && !busy && (
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
              onRetry={() => query.refetch()}
            />
          )}
          {receipt && (
            <>
              <p className="pw-notice" role="status">
                {receipt.state === "processing"
                  ? t("productAdviceUx.processing")
                  : receipt.state === "uncertain"
                    ? t("productAdviceUx.uncertain")
                    : receipt.state === "failed"
                      ? t("productAdviceUx.failed")
                      : t("productAdviceUx.completed")}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => query.refetch()}
              >
                {t("productAdviceUx.check")}
              </button>
              {receipt.result && (
                <>
                  <p>
                    {t("productAdviceUx.sample", {
                      sampled: receipt.result.sampledRows,
                      total: receipt.result.totalRows,
                      omitted: receipt.result.omittedRows,
                      truncated: receipt.result.truncatedCells,
                    })}
                  </p>
                  <p className="pw-notice">{t("productAdviceUx.adviceOnly")}</p>
                  <p>
                    {t("productAdviceUx.businessType")}:{" "}
                    {receipt.result.proposal.businessType === "products"
                      ? t("productAdviceUx.products")
                      : receipt.result.proposal.businessType === "services"
                        ? t("productAdviceUx.services")
                        : t("productAdviceUx.unknown")}
                  </p>
                  <h3>{t("productAdviceUx.mapping")}</h3>
                  <dl className="pi-row-details">
                    {receipt.result.proposal.mapping.map(m => (
                      <div key={m.column}>
                        <dt>
                          {t("productAdviceUx.column", {
                            column: m.column + 1,
                          })}
                        </dt>
                        <dd>
                          {m.field
                            ? labels[m.field]
                            : t("productImportUx.ignore")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>{t("productAdviceUx.sameFile")}</p>
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => onRestoreOptions(saved.options)}
                  >
                    {t("productAdviceUx.restoreOptions")}
                  </button>
                  <label className="pw-check">
                    <input
                      type="checkbox"
                      checked={mappingConsent}
                      disabled={busy || disabled || !file}
                      onChange={e => setMappingConsent(e.target.checked)}
                    />
                    {t("productAdviceUx.mappingConsent")}
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      disabled ||
                      storageError ||
                      !file ||
                      !mappingConsent
                    }
                    onClick={apply}
                  >
                    {t("productAdviceUx.applyMapping")}
                  </button>
                  <h3>{t("productAdviceUx.summary")}</h3>
                  {receipt.result.proposal.summary ? (
                    <ul>
                      {suggestion(receipt.result.proposal.summary, "summary")}
                    </ul>
                  ) : (
                    <p>{t("productAdviceUx.noAdvice")}</p>
                  )}
                  <h3>{t("productAdviceUx.sellingTips")}</h3>
                  <ul>{receipt.result.proposal.sellingTips.map(suggestion)}</ul>
                  {!receipt.result.proposal.sellingTips.length && (
                    <p>{t("productAdviceUx.noAdvice")}</p>
                  )}
                  <h3>{t("productAdviceUx.crossSell")}</h3>
                  <ul>
                    {receipt.result.proposal.crossSellSuggestions.map(
                      suggestion
                    )}
                  </ul>
                  {!receipt.result.proposal.crossSellSuggestions.length && (
                    <p>{t("productAdviceUx.noAdvice")}</p>
                  )}
                </>
              )}
            </>
          )}
          {(missing || (receipt && receipt.state !== "processing")) && (
            <button
              type="button"
              disabled={busy || storageError}
              onClick={() => setConfirm(true)}
            >
              {t("productAdviceUx.newAnalysis")}
            </button>
          )}
          {confirm && (
            <section className="pw-notice">
              <h3 ref={heading} tabIndex={-1}>
                {t("productAdviceUx.restartTitle")}
              </h3>
              <p>{t("productAdviceUx.restartHint")}</p>
              <p>
                <bdi>{saved.requestId}</bdi>
              </p>
              <button
                type="button"
                disabled={
                  busy ||
                  storageError ||
                  !(missing || (receipt && receipt.state !== "processing"))
                }
                onClick={reset}
              >
                {t("productAdviceUx.confirmRestart")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t("productWorkspaceUx.keepDraft")}
              </button>
            </section>
          )}
        </>
      )}
    </details>
  );
}
