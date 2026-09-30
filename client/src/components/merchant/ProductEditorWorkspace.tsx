import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readProductWorkspaceCache,
  saveProductWorkspaceCache,
  clearProductWorkspaceCache,
  type ProductWorkspaceDraft,
} from "@/lib/product-workspace-cache";
import {
  productToForm,
  newProductForm,
  productFormChanged,
  productFormRequest,
  productPricePreview,
  type ProductField,
} from "@/lib/product-workspace-model";
import { productEditorReadSchema } from "@shared/product-catalog";
import {
  productEditorReceipt,
  type ProductEditorWrite,
} from "@shared/product-editor";
import {
  productChoices,
  productLabels,
  productFieldError,
  ProductHeading,
  ProductPending,
  productDefinitiveError,
} from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
type Draft = Extract<ProductWorkspaceDraft, { kind: "editor" }>;
export function ProductEditorWorkspace({
  scope,
  target,
  currency,
  canManage,
  back,
  completed,
}: {
  scope: string;
  target: number | "new";
  currency: "SAR" | "USD";
  canManage: boolean;
  back: () => void;
  completed: () => void;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    labels = productLabels(t),
    choices = productChoices(t),
    [actorId, merchantId] = scope.split(":").map(Number);
  const [draft, setDraft] = useState<Draft | null>(null),
    [storageError, setStorageError] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Partial<Record<ProductField, string>>>({}),
    [advanced, setAdvanced] = useState(false),
    [discard, setDiscard] = useState(false),
    [mergeReview, setMergeReview] = useState(false),
    [inventoryOpen, setInventoryOpen] = useState(false);
  const alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    lock = useRef(false),
    draftRef = useRef(draft),
    formElement = useRef<HTMLFormElement>(null);
  const query = trpc.products.editor.read.useQuery(
      { id: typeof target === "number" ? target : 1 },
      {
        enabled: target !== "new",
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      }
    ),
    mutation = trpc.products.editor.write.useMutation(),
    parsed = productEditorReadSchema.safeParse(query.data);
  const data =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    parsed.data.selection.id === target &&
    parsed.data.product.id === target &&
    parsed.data.product.merchantId === merchantId
      ? parsed.data
      : null;
  const ready =
    target === "new" ||
    (!!data &&
      !query.error &&
      !query.isLoading &&
      !query.isFetching &&
      query.fetchStatus !== "paused");
  const permitted =
    canManage && (target === "new" || (data?.canManage && !data.locked));
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  const setValue = (value: Draft) => {
    draftRef.current = value;
    setDraft(value);
  };
  function persist(value: Draft) {
    saveProductWorkspaceCache(scope, value, epoch.current);
    setValue(value);
    setStorageError(false);
  }
  function load() {
    try {
      const cached = readProductWorkspaceCache(scope);
      if (cached && (cached.kind !== "editor" || cached.target !== target))
        throw Error("Another product draft exists");
      if (cached) {
        setValue(cached as Draft);
        setNotice(t("productWorkspaceUx.restored"));
      }
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
  }, [scope, target]);
  useEffect(() => {
    if (!loaded || draftRef.current || !ready) return;
    const form =
      target === "new"
        ? newProductForm(currency)
        : productToForm(data!.product);
    setValue({
      kind: "editor",
      target,
      form,
      baseline: { ...form },
      digest: target === "new" ? null : data!.digest,
    });
  }, [loaded, ready, data?.digest, target]);
  const pending = draft?.attempt,
    conflict =
      !!draft && target !== "new" && ready && draft.digest !== data!.digest,
    dirty =
      !!draft && productFormChanged(draft.form, draft.baseline).length > 0;
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function edit(key: ProductField, value: string) {
    const previous = draftRef.current;
    if (!previous || pending || busy || !permitted || !ready) return;
    const next = { ...previous, form: { ...previous.form, [key]: value } };
    try {
      persist(next);
    } catch {
      setValue(next);
      setStorageError(true);
    }
    setErrors(old => ({ ...old, [key]: undefined }));
  }
  function accept(raw: unknown, input: ProductEditorWrite) {
    const result = productEditorReceipt.parse(raw);
    if (
      result.merchantId !== merchantId ||
      result.actorId !== actorId ||
      result.requestId !== input.requestId ||
      result.kind !== input.kind ||
      (input.kind === "update" && result.productId !== input.id)
    )
      throw Error("Product receipt mismatch");
    try {
      clearProductWorkspaceCache(scope, epoch.current);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    completed();
  }
  async function send(input: ProductEditorWrite) {
    if (
      !current() ||
      lock.current ||
      !draftRef.current ||
      storageError ||
      !canManage
    )
      return;
    if (!draftRef.current.attempt && (!ready || !permitted || conflict)) return;
    if (
      draftRef.current.attempt &&
      JSON.stringify(input) !== JSON.stringify(draftRef.current.attempt)
    )
      return;
    try {
      persist({ ...draftRef.current, attempt: input });
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
        if (productDefinitiveError(error)) {
          try {
            const { attempt, ...value } = draftRef.current!;
            persist(value);
          } catch {
            setStorageError(true);
          }
          setNotice(t("productWorkspaceUx.saveRejected"));
          if (target !== "new") void query.refetch();
        } else setNotice("");
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recover() {
    const input = draftRef.current?.attempt;
    if (!input || !current() || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await utils.products.editor.receipt.fetch(
        { requestId: input.requestId },
        { staleTime: 0 }
      );
      if (current()) {
        if (result) accept(result, input);
        else setNotice(t("productWorkspaceUx.noReceipt"));
      }
    } catch {
      if (current()) setNotice(t("productWorkspaceUx.recoveryFailed"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const result = productFormRequest(
      target,
      draft.form,
      draft.baseline,
      draft.digest,
      crypto.randomUUID()
    );
    if (!result.success) {
      const fieldErrors: Partial<Record<ProductField, string>> = {};
      for (const issue of result.error.issues)
        if (issue.path[0] === "fields" && issue.path[1])
          fieldErrors[issue.path[1] as ProductField] = productFieldError(
            t,
            issue.path[1] as ProductField
          );
      setErrors(fieldErrors);
      setNotice(t("productWorkspaceUx.reviewFields"));
      if (
        Object.keys(fieldErrors).some(key =>
          [
            "category",
            "productType",
            "imageUrl",
            "tags",
            "sku",
            "barcode",
            "compareAtPrice",
            "costPrice",
            "weight",
          ].includes(key)
        )
      )
        setAdvanced(true);
      if (
        Object.keys(fieldErrors).some(key =>
          ["trackInventory", "stock", "lowStockAlert"].includes(key)
        )
      )
        setInventoryOpen(true);
      requestAnimationFrame(() =>
        formElement.current
          ?.querySelector<HTMLElement>("[aria-invalid=true]")
          ?.focus()
      );
      return;
    }
    void send(result.data);
  }
  function discardDraft() {
    if (pending || busy) return;
    try {
      clearProductWorkspaceCache(scope, epoch.current);
      back();
    } catch {
      setStorageError(true);
    }
  }
  function merge() {
    if (!draft || !data || !conflict || !mergeReview) return;
    const fresh = productToForm(data.product),
      next = { ...fresh };
    if (fresh.currency !== draft.baseline.currency) return;
    for (const key of productFormChanged(draft.form, draft.baseline))
      next[key] = draft.form[key];
    try {
      persist({ ...draft, baseline: fresh, form: next, digest: data.digest });
      setMergeReview(false);
    } catch {
      setStorageError(true);
    }
  }
  const disabled =
    !ready || !permitted || !!pending || busy || !loaded || storageError;
  function field(
    key: ProductField,
    config: {
      multiline?: boolean;
      numeric?: boolean;
      options?: Record<string, string>;
      disabled?: boolean;
    } = {}
  ) {
    if (!draft) return null;
    const props = {
      id: "product-" + key,
      value: draft.form[key],
      disabled: disabled || config.disabled,
      "aria-invalid": !!errors[key],
      "aria-required": key === "name" || (key === "price" && target === "new"),
      "aria-describedby": errors[key] ? "product-error-" + key : undefined,
      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => edit(key, event.target.value),
    };
    return (
      <label
        className={config.multiline ? "pw-wide" : undefined}
        htmlFor={props.id}
      >
        {labels[key]}
        {config.options ? (
          <select {...props}>
            {!Object.hasOwn(config.options, draft.form[key]) && (
              <option value={draft.form[key]}>
                {t("productWorkspaceUx.unknown")}
              </option>
            )}
            {Object.entries(config.options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : config.multiline ? (
          <textarea {...props} rows={4} />
        ) : (
          <input
            {...props}
            type="text"
            inputMode={config.numeric ? "decimal" : undefined}
            autoComplete="off"
          />
        )}
        {errors[key] && (
          <span className="pw-error" id={"product-error-" + key}>
            {errors[key]}
          </span>
        )}
      </label>
    );
  }
  const preview = draft
    ? productPricePreview(draft.form)
    : { margin: null, discount: null };
  return (
    <section
      className="pw-workspace"
      dir={i18n.language?.startsWith("en") ? "ltr" : "rtl"}
    >
      <header className="pw-header">
        <div>
          <ProductHeading>
            {target === "new"
              ? t("productWorkspaceUx.add")
              : t("productWorkspaceUx.edit")}
          </ProductHeading>
          <p>{t("productWorkspaceUx.editorHint")}</p>
        </div>
        <button type="button" onClick={back} disabled={busy}>
          {t("productWorkspaceUx.back")}
        </button>
      </header>
      {notice && (
        <p className="pw-notice" role="status">
          {notice}
        </p>
      )}
      {storageError && (
        <div className="pw-notice" role="alert">
          <p>{t("productWorkspaceUx.storageError")}</p>
          <button
            type="button"
            onClick={() => {
              if (draftRef.current) {
                try {
                  persist(draftRef.current);
                } catch {
                  setStorageError(true);
                }
              } else load();
            }}
          >
            {t("productWorkspaceUx.retry")}
          </button>
        </div>
      )}
      {pending && (
        <ProductPending
          busy={busy}
          canRetry={canManage && !storageError}
          recover={() => void recover()}
          retry={() => void send(pending)}
        />
      )}
      {target !== "new" && !ready && (
        <WorkspaceState
          inline
          kind={
            query.fetchStatus === "paused"
              ? "offline"
              : query.error
                ? workspaceFailureKind(query.error)
                : query.isLoading || query.isFetching
                  ? "loading"
                  : "error"
          }
          onRetry={() => void query.refetch()}
        />
      )}
      {ready && !permitted && (
        <p className="pw-notice">
          {data?.locked
            ? t("productWorkspaceUx.locked")
            : t("productWorkspaceUx.viewer")}
        </p>
      )}
      {conflict && draft && (
        <section className="pw-panel">
          <h2>{t("productWorkspaceUx.conflict")}</h2>
          <p>{t("productWorkspaceUx.conflictHint")}</p>
          <div className="pw-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("productWorkspaceUx.field")}</th>
                  <th>{t("productWorkspaceUx.currentValue")}</th>
                  <th>{t("productWorkspaceUx.myValue")}</th>
                </tr>
              </thead>
              <tbody>
                {productFormChanged(
                  draft.form,
                  productToForm(data!.product)
                ).map(key => (
                  <tr key={key}>
                    <th>{labels[key]}</th>
                    <td>{productToForm(data!.product)[key] || "—"}</td>
                    <td>{draft.form[key] || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft.baseline.currency !== data!.product.currency ? (
            <p>{t("productWorkspaceUx.currencyConflict")}</p>
          ) : (
            <>
              <label className="pw-check">
                <input
                  type="checkbox"
                  checked={mergeReview}
                  onChange={event => setMergeReview(event.target.checked)}
                />
                {t("productWorkspaceUx.reviewMerge")}
              </label>
              <button
                type="button"
                disabled={!mergeReview || disabled}
                onClick={merge}
              >
                {t("productWorkspaceUx.merge")}
              </button>
            </>
          )}
        </section>
      )}
      {draft && (
        <form ref={formElement} onSubmit={submit} noValidate>
          <section className="pw-panel">
            <h2>{t("productWorkspaceUx.basics")}</h2>
            <div className="pw-fields">
              {field("name")}
              {field("price", { numeric: true })}
              {field("currency", {
                options: {
                  SAR: t("productWorkspaceUx.sar"),
                  USD: t("productWorkspaceUx.usd"),
                },
                disabled: target !== "new",
              })}
              {field("status", { options: choices.status })}
              {field("description", { multiline: true })}
            </div>
            {target !== "new" &&
              data &&
              (data.product.priceUnit !== "minor" ||
                data.product.price < 0) && (
                <p className="pw-notice">
                  {t("productWorkspaceUx.unverifiedHint")}
                </p>
              )}
            {data?.product.hasVariants === 1 && (
              <p className="pw-notice">
                {t("productWorkspaceUx.variantsPreserved")}
              </p>
            )}
          </section>
          <details
            className="pw-panel"
            open={advanced}
            onToggle={event => setAdvanced(event.currentTarget.open)}
          >
            <summary>{t("productWorkspaceUx.moreDetails")}</summary>
            <div className="pw-fields">
              {field("category")}
              {field("productType", { options: choices.productType })}
              {field("imageUrl")}
              {field("tags")}
              {field("sku")}
              {field("barcode")}
              {field("compareAtPrice", { numeric: true })}
              {field("costPrice", { numeric: true })}
              {field("weight")}
            </div>
            <dl className="pw-preview">
              <div>
                <dt>{t("productWorkspaceUx.margin")}</dt>
                <dd>
                  {preview.margin === null
                    ? "—"
                    : preview.margin.toFixed(1) + "%"}
                </dd>
              </div>
              <div>
                <dt>{t("productWorkspaceUx.discount")}</dt>
                <dd>
                  {preview.discount === null
                    ? "—"
                    : preview.discount.toFixed(1) + "%"}
                </dd>
              </div>
            </dl>
            <p>{t("productWorkspaceUx.previewHint")}</p>
          </details>
          <details
            className="pw-panel"
            open={inventoryOpen}
            onToggle={event => setInventoryOpen(event.currentTarget.open)}
          >
            <summary>{t("productWorkspaceUx.inventory")}</summary>
            <div className="pw-fields">
              {field("trackInventory", {
                options: {
                  "1": t("productWorkspaceUx.tracked"),
                  "0": t("productWorkspaceUx.untracked"),
                },
              })}
              {field("stock", { numeric: true })}
              {field("lowStockAlert", { numeric: true })}
            </div>
            <p>{t("productWorkspaceUx.inventoryHint")}</p>
          </details>
          <footer className="pw-actions pw-form-footer">
            <button
              className="pw-primary"
              type="submit"
              disabled={disabled || conflict || (target !== "new" && !dirty)}
            >
              {busy
                ? t("productWorkspaceUx.saving")
                : t("productWorkspaceUx.save")}
            </button>
            <button
              type="button"
              disabled={!!pending || busy}
              onClick={() => setDiscard(true)}
            >
              {t("productWorkspaceUx.discard")}
            </button>
            <p>{t("productWorkspaceUx.draftHint")}</p>
          </footer>
        </form>
      )}
      {discard && !pending && (
        <section className="pw-notice" role="alert">
          <p>{t("productWorkspaceUx.discardConfirm")}</p>
          <div className="pw-actions">
            <button type="button" onClick={discardDraft}>
              {t("productWorkspaceUx.confirmDiscard")}
            </button>
            <button type="button" onClick={() => setDiscard(false)}>
              {t("productWorkspaceUx.keepDraft")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
