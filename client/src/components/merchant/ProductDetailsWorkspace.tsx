import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  optionToForm,
  variantToForm,
  detailFormRequest,
  readDetailDraft,
  saveDetailDraft,
  clearDetailDraft,
  type DetailDraft,
  type DetailForm,
} from "@/lib/product-details-workspace";
import {
  productDetailsSnapshot,
  productDetailReceipt,
  planProductDetailChange,
  ProductDetailPlanFailure,
  readOptionValues,
  readVariantSelections,
  variantSelections,
  type ProductDetailWrite,
  type ProductOptionRow,
  type ProductVariantRow,
} from "@shared/product-details";
import { ProductHeading, productDefinitiveError } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
type Field = Exclude<
  | keyof Extract<DetailForm, { type: "option" }>
  | keyof Extract<DetailForm, { type: "variant" }>,
  "type"
>;
const previewId = "11111111-1111-4111-8111-111111111111";
export function ProductDetailsWorkspace({
  scope,
  productId,
  back,
}: {
  scope: string;
  productId: number;
  back: () => void;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils();
  const query = trpc.products.details.read.useQuery(
    { productId },
    { retry: false, refetchOnMount: "always", refetchOnWindowFocus: true }
  );
  const mutation = trpc.products.details.write.useMutation({ retry: false });
  const [draft, setDraft] = useState<DetailDraft | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [notice, setNotice] = useState(""),
    [discard, setDiscard] = useState(false),
    [kind, setKind] = useState<"option" | "variant">("variant"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const epoch = useRef(knowledgeCacheEpoch()),
    alive = useRef(true),
    lock = useRef(false),
    identity = useRef(scope),
    heading = useRef<HTMLHeadingElement>(null);
  identity.current = scope;
  const parsed = productDetailsSnapshot.safeParse(query.data);
  const data =
    parsed.success &&
    `${parsed.data.actorId}:${parsed.data.merchantId}:product-details:${parsed.data.productId}` ===
      scope &&
    parsed.data.productId === productId
      ? parsed.data
      : null;
  const ready =
    !!data &&
    !query.error &&
    !query.isLoading &&
    !query.isFetching &&
    query.fetchStatus !== "paused" &&
    epoch.current === knowledgeCacheEpoch();
  const permission = ready && data!.canManage && !data!.locked,
    conflict = !!draft && draft.digest !== data?.digest;
  const access = useRef(ready);
  access.current = ready;
  const current = () =>
    alive.current &&
    identity.current === scope &&
    epoch.current === knowledgeCacheEpoch() &&
    access.current;
  function load() {
    try {
      const saved = readDetailDraft(scope);
      setDraft(saved);
      if (saved) setKind(saved.form.type);
      setStorageError(false);
      setLoaded(true);
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
    setReview(false);
  }, [data?.digest]);
  useEffect(() => {
    if (draft) heading.current?.focus();
  }, [draft?.form.type, draft?.id, draft?.mode]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [!!draft]);
  function persist(next: DetailDraft) {
    try {
      saveDetailDraft(scope, next, epoch.current);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }
  function edit(next: DetailDraft) {
    if (busy || draft?.attempt) return;
    setDraft(next);
    setReview(false);
    setDiscard(false);
    persist(next);
  }
  function change(field: Field, value: string | boolean) {
    if (draft && permission)
      edit({ ...draft, form: { ...draft.form, [field]: value } as DetailForm });
  }
  function start(
    type: "option" | "variant",
    mode: DetailDraft["mode"],
    row?: ProductOptionRow | ProductVariantRow
  ) {
    if (!permission || !loaded || storageError || draft) return;
    const form =
      type === "option"
        ? optionToForm(row as ProductOptionRow | undefined)
        : variantToForm(row as ProductVariantRow | undefined, data!.options);
    edit({
      productId,
      mode,
      id: row?.id ?? null,
      digest: data!.digest,
      form,
      baseline: { ...form },
    });
    setKind(type);
    setNotice("");
  }
  const candidate = draft ? detailFormRequest(draft, previewId) : null;
  const unchanged =
    draft?.mode === "update" &&
    JSON.stringify(draft.form) === JSON.stringify(draft.baseline);
  let plan: ReturnType<typeof planProductDetailChange> | null = null,
    problem: ProductDetailPlanFailure["reason"] | null = null;
  if (candidate?.success && data && !conflict)
    try {
      plan = planProductDetailChange(data, candidate.data);
    } catch (error) {
      problem =
        error instanceof ProductDetailPlanFailure ? error.reason : "scope";
    }
  if (unchanged) problem = "no_change";
  const issues = {
    scope: t("detailUx.scope"),
    locked: t("productWorkspaceUx.locked"),
    conflict: t("detailUx.conflict"),
    missing: t("detailUx.missing"),
    limit: t("detailUx.limit"),
    duplicate: t("detailUx.duplicate"),
    in_use: t("detailUx.inUse"),
    unreadable: t("detailUx.unreadable"),
    selection: t("detailUx.selectionError"),
    price_review: t("detailUx.priceReview"),
    no_change: t("categoryUx.noChange"),
  };
  const labels: Record<Field, string> = {
    name:
      draft?.form.type === "option"
        ? t("detailUx.optionName")
        : t("detailUx.variantName"),
    nameEn: t("categoryUx.nameEn"),
    values: t("detailUx.values"),
    sortOrder: t("categoryUx.sortOrder"),
    sku: t("productWorkspaceUx.sku"),
    priceMode: t("detailUx.priceMode"),
    price: t("productWorkspaceUx.price"),
    compareAtPrice: t("productWorkspaceUx.compareAtPrice"),
    costPrice: t("productWorkspaceUx.costPrice"),
    stock: t("productWorkspaceUx.stock"),
    barcode: t("productWorkspaceUx.barcode"),
    weight: t("productWorkspaceUx.weight"),
    imageUrl: t("productWorkspaceUx.imageUrl"),
    selections: t("detailUx.selections"),
    isActive: t("categoryUx.active"),
  };
  const invalid = (field: string) =>
    !!candidate &&
    !candidate.success &&
    candidate.error.issues.some(issue => issue.path.includes(field));
  function accept(raw: unknown, input: ProductDetailWrite) {
    const result = productDetailReceipt.parse(raw);
    if (
      `${result.actorId}:${result.merchantId}:product-details:${result.productId}` !==
        scope ||
      result.requestId !== input.requestId ||
      result.kind !== input.kind ||
      ("id" in input && result.detailId !== input.id)
    )
      throw Error("Detail receipt mismatch");
    if (!current()) return;
    try {
      clearDetailDraft(scope, epoch.current);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    setDraft(null);
    setReview(false);
    setNotice(t("detailUx.saved", { id: result.detailId }));
    void query.refetch();
  }
  async function send(input?: ProductDetailWrite) {
    if (
      !permission ||
      !loaded ||
      busy ||
      lock.current ||
      storageError ||
      !draft ||
      (!input && (!review || !plan || conflict))
    )
      return;
    const created = input ?? detailFormRequest(draft, crypto.randomUUID()),
      request =
        "success" in created
          ? created.success
            ? created.data
            : null
          : created;
    if (!request) return;
    const saved = { ...draft, attempt: request };
    if (!persist(saved)) return;
    setDraft(saved);
    setReview(false);
    setNotice("");
    lock.current = true;
    setBusy(true);
    try {
      accept(await mutation.mutateAsync(request), request);
    } catch (error) {
      if (current()) {
        if (productDefinitiveError(error)) {
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
    const input = draft.attempt;
    lock.current = true;
    setBusy(true);
    try {
      const result = await utils.products.details.receipt.fetch({
        requestId: input.requestId,
      });
      if (result) accept(result, input);
      else if (current()) setNotice(t("categoryUx.noReceipt"));
    } catch {
      if (current()) setNotice(t("categoryUx.recoveryFailed"));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function reloadDraft() {
    if (!draft || !data || !ready || draft.attempt) return;
    if (draft.mode === "create") {
      edit({ ...draft, digest: data.digest });
      return;
    }
    const row =
      draft.form.type === "option"
        ? data.options.find(row => row.id === draft.id)
        : data.variants.find(row => row.id === draft.id);
    if (!row) {
      setNotice(t("detailUx.missing"));
      return;
    }
    const form =
      draft.form.type === "option"
        ? optionToForm(row as ProductOptionRow)
        : variantToForm(row as ProductVariantRow, data.options);
    edit({ ...draft, digest: data.digest, form, baseline: { ...form } });
  }
  const disabled =
    !permission || !loaded || busy || !!draft?.attempt || storageError;
  function field(
    key: Field,
    multiline = false,
    options?: Record<string, string>,
    blocked = false
  ) {
    if (!draft || !(key in draft.form)) return null;
    const props = {
      id: "detail-" + key,
      value: String((draft.form as any)[key]),
      disabled: disabled || blocked,
      "aria-invalid": invalid(key),
      "aria-describedby": invalid(key) ? "detail-error-" + key : undefined,
      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => change(key, event.target.value),
    };
    return (
      <label className={multiline ? "pw-wide" : undefined} htmlFor={props.id}>
        {labels[key]}
        {options ? (
          <select {...props}>
            {Object.entries(options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : multiline ? (
          <textarea {...props} rows={4} />
        ) : (
          <input
            {...props}
            autoComplete="off"
            inputMode={
              [
                "price",
                "costPrice",
                "compareAtPrice",
                "stock",
                "sortOrder",
              ].includes(key)
                ? "decimal"
                : undefined
            }
          />
        )}
        {invalid(key) && (
          <span role="alert" className="pw-error" id={"detail-error-" + key}>
            {t("categoryUx.invalidField")}
          </span>
        )}
      </label>
    );
  }
  const matching =
    (kind === "option" ? data?.options : data?.variants)
      ?.filter(row =>
        [row.name, "sku" in row ? row.sku : row.nameEn].some(value =>
          value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
        )
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) ?? [];
  const maxPage = Math.max(1, Math.ceil(matching.length / 20)),
    shownPage = Math.min(page, maxPage),
    rows = matching.slice((shownPage - 1) * 20, shownPage * 20);
  const money = (value: number | null, unit: string) =>
    value === null
      ? "—"
      : unit !== "minor" || value < 0
        ? t("productWorkspaceUx.priceReview")
        : new Intl.NumberFormat(
            i18n.language.startsWith("ar") ? "ar-SA" : "en-US",
            { style: "currency", currency: data?.currency ?? "SAR" }
          ).format(value / 100);
  const form = draft?.form;
  let selected: Array<{ optionId: number; value: string }> | null = null;
  if (form?.type === "variant")
    try {
      const parsed = variantSelections.safeParse(JSON.parse(form.selections));
      if (
        parsed.success &&
        data &&
        readVariantSelections(form.selections, data.options) !== null
      )
        selected = parsed.data;
    } catch {
      /* Preserve unreadable draft. */
    }
  function reviewValue(
    row: ProductOptionRow | ProductVariantRow | null,
    key: string
  ): string {
    if (!row) return "—";
    const value = (row as unknown as Record<string, unknown>)[key];
    if (
      ["price", "costPrice", "compareAtPrice"].includes(key) &&
      "priceUnit" in row
    )
      return key === "price" && value === null
        ? t("detailUx.inherit")
        : money(value as number | null, row.priceUnit);
    if (key === "priceUnit")
      return value === "minor"
        ? t("detailUx.verifiedMoney")
        : t("productWorkspaceUx.priceReview");
    if (key === "isActive")
      return value === 1 ? t("detailUx.active") : t("detailUx.inactive");
    if (key === "values")
      return (
        readOptionValues(String(value))?.join(" · ") ?? t("detailUx.unreadable")
      );
    if (key === "options") {
      const selections = readVariantSelections(
        value as string | null,
        data!.options
      );
      return selections === null
        ? t("detailUx.unreadable")
        : selections
            .map(
              s =>
                `${data!.options.find(o => o.id === s.optionId)?.name}: ${s.value}`
            )
            .join(" · ") || t("detailUx.noSelection");
    }
    return value == null ? "—" : String(value);
  }
  return (
    <section
      className="pw-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
      aria-busy={busy}
    >
      <header className="pw-header">
        <div>
          <ProductHeading>{t("detailUx.title")}</ProductHeading>
          <p>{ready ? data!.productName : t("detailUx.subtitle")}</p>
        </div>
        <div className="pw-actions">
          <button disabled={busy} onClick={back}>
            {t("productWorkspaceUx.back")}
          </button>
          <button
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("productWorkspaceUx.refresh")}
          </button>
        </div>
      </header>
      {notice && (
        <p className="pw-notice" role="status">
          {notice}
        </p>
      )}
      {storageError && (
        <div className="pw-notice" role="alert">
          <p>{t("productWorkspaceUx.storageError")}</p>
          <button onClick={() => (draft ? persist(draft) : load())}>
            {t("productWorkspaceUx.retry")}
          </button>
        </div>
      )}
      {!ready ? (
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
      ) : (
        <>
          {!permission && (
            <p className="pw-notice">
              {data!.locked
                ? t("productWorkspaceUx.locked")
                : t("productWorkspaceUx.viewer")}
            </p>
          )}
          <p>{t("detailUx.subtitle")}</p>
          {draft && (
            <section
              className="pw-panel"
              aria-label={t("detailUx.reviewTitle")}
            >
              <h2 tabIndex={-1} ref={heading}>
                {draft.mode === "delete"
                  ? t("detailUx.deleteTitle")
                  : draft.mode === "create"
                    ? t("detailUx.createTitle")
                    : t("detailUx.editTitle")}{" "}
                ·{" "}
                {draft.form.type === "option"
                  ? t("detailUx.option")
                  : t("detailUx.variant")}
              </h2>
              {draft.attempt ? (
                <>
                  <p>{t("categoryUx.pending")}</p>
                  <p>{draft.attempt.requestId}</p>
                  <div className="pw-actions">
                    <button disabled={busy} onClick={() => void recover()}>
                      {t("categoryUx.recover")}
                    </button>
                    <button
                      disabled={busy || !permission || storageError}
                      onClick={() => void send(draft.attempt)}
                    >
                      {t("categoryUx.retrySame")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {conflict && (
                    <div className="pw-notice" role="alert">
                      <p>{t("detailUx.conflict")}</p>
                      <button
                        disabled={!permission || busy}
                        onClick={reloadDraft}
                      >
                        {draft.mode === "create"
                          ? t("detailUx.refreshDraft")
                          : t("detailUx.reload")}
                      </button>
                    </div>
                  )}
                  {draft.mode === "delete" ? (
                    <p>{t("detailUx.deleteHint", { name: draft.form.name })}</p>
                  ) : (
                    <>
                      <div className="pw-fields">
                        {field("name")}
                        {draft.form.type === "option" ? (
                          <>
                            {field("nameEn")}
                            {field("values", true)}
                            {field("sortOrder")}
                          </>
                        ) : (
                          <>
                            {field("priceMode", false, {
                              ...(form?.type === "variant" &&
                              form.priceMode === "unverified"
                                ? {
                                    unverified: t(
                                      "productWorkspaceUx.priceReview"
                                    ),
                                  }
                                : {}),
                              inherit: t("detailUx.inherit"),
                              custom: t("detailUx.custom"),
                            })}
                            {form?.type === "variant" &&
                              form.priceMode === "custom" &&
                              field("price")}
                            {field("stock")}
                            {field("sku")}
                            <label className="pw-check">
                              <input
                                type="checkbox"
                                checked={
                                  form?.type === "variant" && form.isActive
                                }
                                disabled={disabled}
                                onChange={e =>
                                  change("isActive", e.target.checked)
                                }
                              />
                              {t("detailUx.active")}
                            </label>
                          </>
                        )}
                      </div>
                      {form?.type === "option" ? (
                        <>
                          <p>{t("detailUx.valuesHint")}</p>
                          {draft.id &&
                            readOptionValues(
                              data!.options.find(row => row.id === draft.id)
                                ?.values ?? ""
                            ) === null && (
                              <p className="pw-notice">
                                {t("detailUx.unreadableOption")}
                              </p>
                            )}
                        </>
                      ) : (
                        <>
                          <p>{t("detailUx.moneyHint")}</p>
                          {form?.type === "variant" &&
                            form.priceMode === "unverified" && (
                              <p className="pw-notice">
                                {t("detailUx.priceReview")}
                              </p>
                            )}
                          <details
                            className="pw-panel"
                            open={
                              [
                                "compareAtPrice",
                                "costPrice",
                                "barcode",
                                "weight",
                                "imageUrl",
                                "sortOrder",
                              ].some(invalid) || undefined
                            }
                          >
                            <summary>{t("detailUx.more")}</summary>
                            <div className="pw-fields">
                              {field(
                                "compareAtPrice",
                                false,
                                undefined,
                                form?.type === "variant" &&
                                  form.priceMode === "unverified"
                              )}
                              {field(
                                "costPrice",
                                false,
                                undefined,
                                form?.type === "variant" &&
                                  form.priceMode === "unverified"
                              )}
                              {field("barcode")}
                              {field("weight")}
                              {field("imageUrl")}
                              {field("sortOrder")}
                            </div>
                          </details>
                          <section className="pw-panel">
                            <h3>{t("detailUx.selections")}</h3>
                            {selected === null ? (
                              <>
                                <p>{t("detailUx.unreadable")}</p>
                                <button
                                  disabled={disabled}
                                  onClick={() => change("selections", "[]")}
                                >
                                  {t("detailUx.resetSelections")}
                                </button>
                              </>
                            ) : (
                              <div className="pw-fields">
                                {data!.options.map(option => {
                                  const values = readOptionValues(
                                      option.values
                                    ),
                                    value =
                                      selected!.find(
                                        item => item.optionId === option.id
                                      )?.value ?? "";
                                  return (
                                    <label key={option.id}>
                                      {option.name}
                                      <select
                                        value={value}
                                        disabled={disabled || !values}
                                        aria-invalid={invalid("selections")}
                                        onChange={e =>
                                          change(
                                            "selections",
                                            JSON.stringify(
                                              [
                                                ...selected!.filter(
                                                  item =>
                                                    item.optionId !== option.id
                                                ),
                                                ...(e.target.value
                                                  ? [
                                                      {
                                                        optionId: option.id,
                                                        value: e.target.value,
                                                      },
                                                    ]
                                                  : []),
                                              ].sort(
                                                (a, b) =>
                                                  a.optionId - b.optionId
                                              )
                                            )
                                          )
                                        }
                                      >
                                        <option value="">
                                          {t("detailUx.noSelection")}
                                        </option>
                                        {value && !values?.includes(value) && (
                                          <option value={value}>{value}</option>
                                        )}
                                        {values?.map(v => (
                                          <option key={v} value={v}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                      {!values && (
                                        <span>{t("detailUx.unreadable")}</span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            {!data!.options.length && (
                              <p>{t("detailUx.noOptions")}</p>
                            )}
                          </section>
                        </>
                      )}
                    </>
                  )}
                  {problem && (
                    <p className="pw-notice" role="alert">
                      {issues[problem]}
                    </p>
                  )}
                  {candidate && !candidate.success && !unchanged && (
                    <p className="pw-error" role="alert">
                      {t("productWorkspaceUx.reviewFields")}
                    </p>
                  )}
                  {plan && (
                    <div className="pw-notice">
                      {plan.changes.length > 0 && (
                        <>
                          <p>
                            {t("detailUx.changes", {
                              count: plan.changes.length,
                            })}
                          </p>
                          <dl className="pw-detail-review">
                            {plan.changes.map(key => (
                              <div key={key}>
                                <dt>
                                  {labels[key as Field] ??
                                    (key === "options"
                                      ? labels.selections
                                      : key === "priceUnit"
                                        ? labels.priceMode
                                        : key)}
                                </dt>
                                <dd>
                                  <span>
                                    {t("detailUx.before")}:{" "}
                                    {reviewValue(plan.before, key)}
                                  </span>
                                  <span>
                                    {t("detailUx.after")}:{" "}
                                    {reviewValue(plan.after, key)}
                                  </span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}
                      <p>
                        {plan.hasVariants === 1
                          ? t("detailUx.requiresVariant")
                          : t("detailUx.parentPrice")}
                      </p>
                    </div>
                  )}
                  <label className="pw-check">
                    <input
                      type="checkbox"
                      checked={review}
                      disabled={disabled || !plan || conflict}
                      onChange={e => setReview(e.target.checked)}
                    />
                    {t("categoryUx.reviewed")}
                  </label>
                  <div className="pw-actions">
                    <button
                      className={
                        draft.mode === "delete" ? "pw-danger" : "pw-primary"
                      }
                      disabled={disabled || !plan || !review || conflict}
                      onClick={() => void send()}
                    >
                      {draft.mode === "delete"
                        ? t("productWorkspaceUx.confirmDelete")
                        : t("detailUx.save")}
                    </button>
                    <button disabled={busy} onClick={() => setDiscard(true)}>
                      {t("categoryUx.discard")}
                    </button>
                  </div>
                  {discard && (
                    <div role="alert">
                      <p>{t("productWorkspaceUx.discardConfirm")}</p>
                      <button
                        onClick={() => {
                          try {
                            clearDetailDraft(scope, epoch.current);
                            setDraft(null);
                            setDiscard(false);
                            setReview(false);
                            setStorageError(false);
                          } catch {
                            setStorageError(true);
                          }
                        }}
                      >
                        {t("categoryUx.confirmDiscard")}
                      </button>
                      <button onClick={() => setDiscard(false)}>
                        {t("productWorkspaceUx.keepDraft")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <section className="pw-panel" aria-label={t("detailUx.list")}>
            <div className="pw-actions">
              <button
                aria-pressed={kind === "variant"}
                onClick={() => {
                  setKind("variant");
                  setPage(1);
                }}
              >
                {t("detailUx.variants")} · {data!.variants.length}
              </button>
              <button
                aria-pressed={kind === "option"}
                onClick={() => {
                  setKind("option");
                  setPage(1);
                }}
              >
                {t("detailUx.options")} · {data!.options.length}
              </button>
              <button
                disabled={disabled || !!draft}
                onClick={() => start(kind, "create")}
              >
                {kind === "option"
                  ? t("detailUx.addOption")
                  : t("detailUx.addVariant")}
              </button>
            </div>
            <label>
              {t("detailUx.search")}
              <input
                value={search}
                maxLength={100}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {!rows.length && <p>{t("detailUx.empty")}</p>}
            <ul className="pw-catalog-list">
              {rows.map(row => (
                <li className="pw-panel" key={row.id}>
                  <h3>{row.name}</h3>
                  {"values" in row ? (
                    <>
                      <p>{row.nameEn}</p>
                      <p>
                        {readOptionValues(row.values)?.join(" · ") ??
                          t("detailUx.unreadable")}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        {row.sku ?? "—"} ·{" "}
                        {row.isActive === 1
                          ? t("detailUx.active")
                          : t("detailUx.inactive")}
                      </p>
                      <dl className="pw-summary">
                        <div>
                          <dt>{labels.price}</dt>
                          <dd>
                            {row.price === null
                              ? t("detailUx.inherit")
                              : money(row.price, row.priceUnit)}
                          </dd>
                        </div>
                        <div>
                          <dt>{labels.stock}</dt>
                          <dd>
                            {row.stock === null
                              ? t("productWorkspaceUx.unknown")
                              : row.stock}
                          </dd>
                        </div>
                        <div>
                          <dt>{labels.costPrice}</dt>
                          <dd>{money(row.costPrice, row.priceUnit)}</dd>
                        </div>
                      </dl>
                      <p>
                        {readVariantSelections(row.options, data!.options)
                          ?.map(
                            s =>
                              `${data!.options.find(o => o.id === s.optionId)?.name}: ${s.value}`
                          )
                          .join(" · ") ?? t("detailUx.unreadable")}
                      </p>
                    </>
                  )}
                  <div className="pw-actions">
                    <button
                      disabled={disabled || !!draft}
                      onClick={() => start(kind, "update", row)}
                    >
                      {t("detailUx.edit")}
                    </button>
                    <button
                      disabled={disabled || !!draft}
                      onClick={() => start(kind, "delete", row)}
                    >
                      {t("detailUx.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pw-pagination">
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
