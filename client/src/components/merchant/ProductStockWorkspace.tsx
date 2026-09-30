import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  productStockSnapshot,
  type ProductStockSelection,
} from "@shared/product-stock";
import { ProductHeading } from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/product-workspace.css";
export function ProductStockWorkspace({
  scope,
  selection,
  onSelection,
  open,
  back,
}: {
  scope: string;
  selection: ProductStockSelection;
  onSelection: (input: ProductStockSelection) => void;
  open: (productId: number, details: boolean) => void;
  back: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState(selection.search);
  const query = trpc.products.getLowStock.useQuery(selection, {
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const parsed = productStockSnapshot.safeParse(query.data),
    data =
      parsed.success &&
      parsed.data.merchantId === Number(scope.split(":")[1]) &&
      JSON.stringify(parsed.data.selection) === JSON.stringify(selection)
        ? parsed.data
        : null;
  const ready =
    !!data &&
    !query.error &&
    !query.isLoading &&
    !query.isFetching &&
    query.fetchStatus !== "paused";
  useEffect(() => {
    if (search.trim() === selection.search) return;
    const timer = setTimeout(
      () => onSelection({ ...selection, search: search.trim(), page: 1 }),
      300
    );
    return () => clearTimeout(timer);
  }, [search, selection, onSelection]);
  const choose = (patch: Partial<ProductStockSelection>) =>
    onSelection({ ...selection, ...patch, page: patch.page ?? 1 });
  const states = {
    out: t("productWorkspaceUx.out"),
    low: t("productWorkspaceUx.low"),
    unknown: t("productWorkspaceUx.unknown"),
  };
  const issues = {
    stock_unknown: t("stockUx.unknownHint"),
    no_available_variants: t("stockUx.noVariants"),
    invalid_variant_setup: t("stockUx.invalidSetup"),
  };
  return (
    <section
      className="pw-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="pw-header">
        <div>
          <ProductHeading>{t("stockUx.title")}</ProductHeading>
          <p>{t("stockUx.subtitle")}</p>
        </div>
        <div className="pw-actions">
          <button onClick={back}>{t("productWorkspaceUx.back")}</button>
          <button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("productWorkspaceUx.refresh")}
          </button>
        </div>
      </header>
      <p className="pw-notice">{t("stockUx.scope")}</p>
      <section
        className="pw-filters"
        aria-label={t("productWorkspaceUx.filters")}
      >
        <label className="pw-search">
          {t("stockUx.search")}
          <input
            type="search"
            maxLength={200}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <label>
          {t("stockUx.kind")}
          <select
            value={selection.kind}
            onChange={e =>
              choose({ kind: e.target.value as ProductStockSelection["kind"] })
            }
          >
            <option value="all">{t("stockUx.allKinds")}</option>
            <option value="product">{t("stockUx.products")}</option>
            <option value="variant">{t("stockUx.variants")}</option>
          </select>
        </label>
        <label>
          {t("stockUx.state")}
          <select
            value={selection.state}
            onChange={e =>
              choose({
                state: e.target.value as ProductStockSelection["state"],
              })
            }
          >
            <option value="all">{t("stockUx.allStates")}</option>
            {Object.entries(states).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
          <dl className="pw-summary">
            <div>
              <dt>{t("stockUx.total")}</dt>
              <dd>{data!.summary.total}</dd>
            </div>
            {Object.entries(states).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{data!.summary[key as keyof typeof states]}</dd>
              </div>
            ))}
          </dl>
          <p className="pw-muted">{t("stockUx.summaryHint")}</p>
          <p className="pw-muted">
            {t("stockUx.readAt", {
              time: new Intl.DateTimeFormat(
                i18n.language.startsWith("ar") ? "ar-SA" : "en-US",
                { dateStyle: "short", timeStyle: "short" }
              ).format(new Date(data!.readAt)),
            })}
          </p>
          {!data!.items.length ? (
            <section className="pw-panel">
              <h2>
                {data!.summary.total === 0
                  ? t("stockUx.empty")
                  : t("productWorkspaceUx.noMatches")}
              </h2>
              <p>
                {data!.summary.total === 0
                  ? t("stockUx.emptyHint")
                  : t("productWorkspaceUx.noMatchesHint")}
              </p>
              {data!.summary.total > 0 && (
                <button
                  onClick={() => {
                    setSearch("");
                    onSelection({
                      ...selection,
                      page: 1,
                      kind: "all",
                      state: "all",
                      search: "",
                    });
                  }}
                >
                  {t("productWorkspaceUx.resetFilters")}
                </button>
              )}
            </section>
          ) : (
            <ul className="pw-catalog-list">
              {data!.items.map(row => (
                <li
                  className="pw-panel"
                  key={`${row.productId}:${row.variantId ?? 0}`}
                >
                  <div>
                    <p className="pw-eyebrow">
                      {row.kind === "variant"
                        ? t("detailUx.variant")
                        : t("stockUx.product")}
                    </p>
                    <h2>{row.name}</h2>
                    {row.kind === "variant" && <p>{row.productName}</p>}
                    <p>{row.sku ?? t("stockUx.noSku")}</p>
                  </div>
                  <dl className="pw-summary">
                    <div>
                      <dt>{t("stockUx.state")}</dt>
                      <dd>{states[row.state]}</dd>
                    </div>
                    <div>
                      <dt>{t("productWorkspaceUx.stock")}</dt>
                      <dd>
                        {row.stock === null || row.stock < 0 ? "—" : row.stock}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("productWorkspaceUx.lowStockAlert")}</dt>
                      <dd>
                        {row.threshold === null || row.threshold < 0
                          ? t("stockUx.unset")
                          : row.threshold}
                      </dd>
                    </div>
                  </dl>
                  {row.issue && (
                    <p className="pw-notice">{issues[row.issue]}</p>
                  )}
                  <div className="pw-actions">
                    <button
                      onClick={() =>
                        open(
                          row.productId,
                          row.kind === "variant" ||
                            row.issue === "no_available_variants" ||
                            row.issue === "invalid_variant_setup"
                        )
                      }
                    >
                      {row.kind === "variant" ||
                      row.issue === "no_available_variants" ||
                      row.issue === "invalid_variant_setup"
                        ? t("stockUx.openVariants")
                        : t("stockUx.openProduct")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <nav
            className="pw-pagination"
            aria-label={t("productWorkspaceUx.pages")}
          >
            <p role="status">
              {t("productWorkspaceUx.page", {
                page: selection.page,
                pages: Math.max(1, data!.totalPages),
                total: data!.total,
              })}
            </p>
            <div className="pw-actions">
              <button
                disabled={selection.page <= 1}
                onClick={() => choose({ page: selection.page - 1 })}
              >
                {t("categoryUx.previous")}
              </button>
              <button
                disabled={selection.page >= data!.totalPages}
                onClick={() => choose({ page: selection.page + 1 })}
              >
                {t("categoryUx.next")}
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
