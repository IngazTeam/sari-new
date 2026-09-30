import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  readProductWorkspaceCache,
  type ProductWorkspaceDraft,
} from "@/lib/product-workspace-cache";
import {
  productCatalogInput,
  productCatalogSchema,
  productInventoryState,
  type ProductCatalogSelection,
} from "@shared/product-catalog";
import { formatProductPrice } from "@shared/product-money";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  productChoices,
  ProductThumbnail,
  ProductHeading,
} from "./ProductWorkspaceView";
import { ProductEditorWorkspace } from "./ProductEditorWorkspace";
import { ProductDeleteWorkspace } from "./ProductDeleteWorkspace";
import { ProductCategoriesWorkspace } from "./ProductCategoriesWorkspace";
import { ProductDetailsWorkspace } from "./ProductDetailsWorkspace";
import "@/styles/product-workspace.css";
type View =
  | { kind: "list" }
  | { kind: "categories" }
  | { kind: "details"; productId: number }
  | { kind: "editor"; target: number | "new" }
  | { kind: "delete"; ids: number[] };
export function ProductCatalogWorkspace({
  scope,
  href = (path: string) => path,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    choices = productChoices(t),
    merchantId = Number(scope.split(":")[1]);
  const [selection, setSelection] = useState(
      productCatalogInput.parse({ pageSize: 20 })
    ),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<number[]>([]),
    [view, setView] = useState<View>({ kind: "list" }),
    [cached, setCached] = useState<ProductWorkspaceDraft | null>(null),
    [storageError, setStorageError] = useState(false),
    [notice, setNotice] = useState("");
  const searchInitialized = useRef(false);
  const query = trpc.products.list.useQuery(selection, {
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }),
    parsed = productCatalogSchema.safeParse(query.data);
  const data =
      parsed.success &&
      parsed.data.merchantId === merchantId &&
      JSON.stringify(parsed.data.selection) === JSON.stringify(selection) &&
      parsed.data.items.every(row => row.merchantId === merchantId)
        ? parsed.data
        : null,
    ready =
      !!data &&
      !query.error &&
      !query.isLoading &&
      !query.isFetching &&
      query.fetchStatus !== "paused",
    canManage = ready && data!.canManage,
    unlocked = ready && data!.integrationSource === "none";
  function loadCache() {
    try {
      setCached(readProductWorkspaceCache(scope));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  useEffect(loadCache, [scope]);
  useEffect(() => {
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setSelection(value => ({ ...value, search: search.trim(), page: 1 }));
      setSelected([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSelected([]);
  }, [query.dataUpdatedAt]);
  function choose(patch: Partial<ProductCatalogSelection>) {
    setSelection(value => ({ ...value, ...patch, page: patch.page ?? 1 }));
    setSelected([]);
  }
  function back() {
    setView({ kind: "list" });
    loadCache();
    void query.refetch();
  }
  function completed() {
    setSelected([]);
    setNotice(t("productWorkspaceUx.confirmed"));
    back();
  }
  function open(next: View) {
    try {
      const saved = readProductWorkspaceCache(scope);
      setCached(saved);
      if (
        next.kind !== "categories" &&
        next.kind !== "details" &&
        saved &&
        (next.kind !== "editor" ||
          saved.kind !== "editor" ||
          saved.target !== next.target)
      ) {
        setNotice(t("productWorkspaceUx.finishDraft"));
        return;
      }
      setNotice("");
      setView(next);
    } catch {
      setStorageError(true);
    }
  }
  function resume() {
    if (cached)
      setView(
        cached.kind === "editor"
          ? { kind: "editor", target: cached.target }
          : { kind: "delete", ids: cached.attempt.ids }
      );
  }
  if (view.kind === "editor")
    return (
      <ProductEditorWorkspace
        key={scope + ":" + view.target}
        scope={scope}
        target={view.target}
        currency={data?.currency ?? "SAR"}
        canManage={canManage && unlocked}
        back={back}
        completed={completed}
      />
    );
  if (view.kind === "delete")
    return (
      <ProductDeleteWorkspace
        key={scope + ":" + view.ids.join(",")}
        scope={scope}
        ids={view.ids}
        canManage={canManage}
        back={back}
        completed={completed}
      />
    );
  if (view.kind === "categories")
    return <ProductCategoriesWorkspace key={scope} scope={scope} back={back} />;
  if (view.kind === "details") {
    const detailScope = `${scope.split(":").slice(0, 2).join(":")}:product-details:${view.productId}`;
    return (
      <ProductDetailsWorkspace
        key={detailScope}
        scope={detailScope}
        productId={view.productId}
        back={back}
      />
    );
  }
  return (
    <section
      className="pw-workspace"
      dir={i18n.language?.startsWith("en") ? "ltr" : "rtl"}
    >
      <header className="pw-header">
        <div>
          <p className="pw-eyebrow">{t("productWorkspaceUx.eyebrow")}</p>
          <ProductHeading>{t("productWorkspaceUx.title")}</ProductHeading>
          <p>{t("productWorkspaceUx.subtitle")}</p>
        </div>
        <div className="pw-actions">
          <button
            type="button"
            disabled={!ready || storageError}
            onClick={() => open({ kind: "categories" })}
          >
            {t("categoryUx.title")}
          </button>
          <button
            type="button"
            className="pw-primary"
            disabled={!canManage || !unlocked || storageError}
            onClick={() => open({ kind: "editor", target: "new" })}
          >
            {t("productWorkspaceUx.add")}
          </button>
          {canManage && unlocked && (
            <Link
              className="pw-button"
              href={href("/merchant/products/upload")}
            >
              {t("productWorkspaceUx.import")}
            </Link>
          )}
        </div>
      </header>
      {notice && (
        <p className="pw-notice" role="status">
          {notice}
        </p>
      )}
      {cached && (
        <section className="pw-notice">
          <p>
            {cached.attempt
              ? t("productWorkspaceUx.pendingHint")
              : t("productWorkspaceUx.savedDraft")}
          </p>
          <button type="button" onClick={resume}>
            {cached.attempt
              ? t("productWorkspaceUx.resumeAttempt")
              : t("productWorkspaceUx.resumeDraft")}
          </button>
        </section>
      )}
      {storageError && (
        <section className="pw-notice" role="alert">
          <p>{t("productWorkspaceUx.storageError")}</p>
          <button type="button" onClick={loadCache}>
            {t("productWorkspaceUx.retry")}
          </button>
        </section>
      )}
      <section
        className="pw-filters"
        aria-label={t("productWorkspaceUx.filters")}
      >
        <label className="pw-search">
          {t("productWorkspaceUx.search")}
          <input
            type="search"
            maxLength={200}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t("productWorkspaceUx.searchHint")}
          />
        </label>
        <details className="pw-filter-details">
          <summary>
            {t("productWorkspaceUx.filterOptions", {
              count: [
                selection.status,
                selection.inventory,
                selection.price,
              ].filter(value => value !== "all").length,
            })}
          </summary>
          <div className="pw-filter-options">
            <label>
              {t("productWorkspaceUx.status")}
              <select
                value={selection.status}
                onChange={event =>
                  choose({
                    status: event.target
                      .value as ProductCatalogSelection["status"],
                  })
                }
              >
                <option value="all">
                  {t("productWorkspaceUx.allStatuses")}
                </option>
                {Object.entries(choices.status).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("productWorkspaceUx.inventory")}
              <select
                value={selection.inventory}
                onChange={event =>
                  choose({
                    inventory: event.target
                      .value as ProductCatalogSelection["inventory"],
                  })
                }
              >
                <option value="all">
                  {t("productWorkspaceUx.allInventory")}
                </option>
                {Object.entries(choices.inventory)
                  .filter(([value]) => value !== "available")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("productWorkspaceUx.price")}
              <select
                value={selection.price}
                onChange={event =>
                  choose({
                    price: event.target
                      .value as ProductCatalogSelection["price"],
                  })
                }
              >
                <option value="all">{t("productWorkspaceUx.allPrices")}</option>
                <option value="verified">
                  {t("productWorkspaceUx.verified")}
                </option>
                <option value="review">
                  {t("productWorkspaceUx.priceReview")}
                </option>
              </select>
            </label>
          </div>
        </details>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => {
            setSelected([]);
            void query.refetch();
          }}
        >
          {t("productWorkspaceUx.refresh")}
        </button>
      </section>
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
          {!data!.canManage && (
            <p className="pw-notice">{t("productWorkspaceUx.viewer")}</p>
          )}
          {!unlocked && (
            <p className="pw-notice">{t("productWorkspaceUx.locked")}</p>
          )}
          <dl className="pw-summary">
            <div>
              <dt>{t("productWorkspaceUx.total")}</dt>
              <dd>{data!.summary.all}</dd>
            </div>
            <div>
              <dt>{t("productWorkspaceUx.out")}</dt>
              <dd>{data!.summary.out}</dd>
            </div>
            <div>
              <dt>{t("productWorkspaceUx.low")}</dt>
              <dd>{data!.summary.low}</dd>
            </div>
            <div>
              <dt>{t("productWorkspaceUx.priceReview")}</dt>
              <dd>{data!.summary.priceReview}</dd>
            </div>
          </dl>
          <p className="pw-muted">
            {t("productWorkspaceUx.summaryHint", {
              unknown: data!.summary.unknown,
              untracked: data!.summary.untracked,
            })}
          </p>
          {!!data!.items.length && (
            <div className="pw-actions">
              <label className="pw-check">
                <input
                  type="checkbox"
                  disabled={!canManage || !unlocked || storageError}
                  checked={data!.items.every(row => selected.includes(row.id))}
                  onChange={event =>
                    setSelected(
                      event.target.checked ? data!.items.map(row => row.id) : []
                    )
                  }
                />
                {t("productWorkspaceUx.selectPage")}
              </label>
              <p>
                {t("productWorkspaceUx.selectedCount", {
                  count: selected.length,
                })}
              </p>
              <button
                type="button"
                disabled={
                  !selected.length || !canManage || !unlocked || storageError
                }
                onClick={() => open({ kind: "delete", ids: selected })}
              >
                {t("productWorkspaceUx.reviewSelection")}
              </button>
            </div>
          )}
          {!data!.items.length ? (
            <section className="pw-panel">
              <h2>
                {data!.summary.all === 0
                  ? t("productWorkspaceUx.empty")
                  : t("productWorkspaceUx.noMatches")}
              </h2>
              <p>
                {data!.summary.all === 0
                  ? t("productWorkspaceUx.emptyHint")
                  : t("productWorkspaceUx.noMatchesHint")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelection(productCatalogInput.parse({ pageSize: 20 }));
                }}
              >
                {t("productWorkspaceUx.resetFilters")}
              </button>
            </section>
          ) : (
            <ul className="pw-catalog-list">
              {data!.items.map(row => {
                const stock = productInventoryState(row);
                return (
                  <li className="pw-product" key={row.id}>
                    <div className="pw-product-name">
                      <ProductThumbnail key={row.imageUrl} url={row.imageUrl} />
                      <label className="pw-check">
                        <input
                          type="checkbox"
                          aria-label={t("productWorkspaceUx.selectProduct", {
                            name: row.name,
                          })}
                          checked={selected.includes(row.id)}
                          disabled={!canManage || !unlocked || storageError}
                          onChange={event =>
                            setSelected(values =>
                              event.target.checked
                                ? [...values, row.id]
                                : values.filter(id => id !== row.id)
                            )
                          }
                        />
                      </label>
                      <div>
                        <h2>{row.name}</h2>
                        <p>{row.sku || row.category || "—"}</p>
                        {row.description && (
                          <p className="pw-excerpt">{row.description}</p>
                        )}
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>{t("productWorkspaceUx.price")}</dt>
                        <dd>
                          {formatProductPrice(
                            row,
                            i18n.language?.startsWith("en") ? "en-US" : "ar-SA",
                            t("productWorkspaceUx.priceReview")
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("productWorkspaceUx.inventory")}</dt>
                        <dd>
                          {choices.inventory[stock]}
                          {!["untracked", "unknown"].includes(stock) && (
                            <span> · {row.stock}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("productWorkspaceUx.status")}</dt>
                        <dd>
                          {choices.status[row.status]}
                          {row.status === "active" && row.isActive !== 1 && (
                            <span>
                              {" "}
                              · {t("productWorkspaceUx.inactiveWarning")}
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="pw-actions">
                      <button
                        type="button"
                        disabled={!ready || storageError}
                        onClick={() =>
                          open({ kind: "details", productId: row.id })
                        }
                      >
                        {t("detailUx.title")}
                      </button>
                      <button
                        type="button"
                        onClick={() => open({ kind: "editor", target: row.id })}
                      >
                        {canManage && unlocked
                          ? t("productWorkspaceUx.edit")
                          : t("productWorkspaceUx.view")}
                      </button>
                      <button
                        type="button"
                        disabled={!canManage || !unlocked || storageError}
                        onClick={() => open({ kind: "delete", ids: [row.id] })}
                      >
                        {t("productWorkspaceUx.deleteReview")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <nav
            className="pw-pagination"
            aria-label={t("productWorkspaceUx.pages")}
          >
            <p role="status">
              {t("productWorkspaceUx.page", {
                page: data!.page,
                pages: Math.max(1, data!.totalPages),
                total: data!.total,
              })}
            </p>
            <div className="pw-actions">
              <button
                type="button"
                disabled={selection.page <= 1}
                onClick={() => choose({ page: selection.page - 1 })}
              >
                {t("productWorkspaceUx.previous")}
              </button>
              <button
                type="button"
                disabled={selection.page >= data!.totalPages}
                onClick={() => choose({ page: selection.page + 1 })}
              >
                {t("productWorkspaceUx.next")}
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
