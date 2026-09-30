import { ProductWorkspaceLink } from "./ProductWorkspaceView";
import { useTranslation } from "react-i18next";

/** Internal destinations are allowlisted; a stored source is never used as a URL. */
export function ProductSourceNotice({
  source,
  href = path => path,
}: {
  source: string | null;
  href?: (path: string) => string;
}) {
  const { t } = useTranslation();
  const sources: Record<
    string,
    { name: string; settings: string; catalog?: string }
  > = {
    salla: { name: t("productSourceUx.salla"), settings: "/merchant/salla" },
    zid: {
      name: t("productSourceUx.zid"),
      settings: "/merchant/zid/settings",
      catalog: "/merchant/zid/products",
    },
    woocommerce: {
      name: "WooCommerce",
      settings: "/merchant/woocommerce/settings",
      catalog: "/merchant/woocommerce/products",
    },
    byaan: {
      name: t("productSourceUx.byaan"),
      settings: "/merchant/integrations/byaan",
      catalog: "/merchant/byaan-dashboard",
    },
    api: { name: "API", settings: "/merchant/platform-integrations" },
  };
  const selected =
    source && Object.hasOwn(sources, source) ? sources[source] : null;
  return (
    <section className="pw-notice" aria-label={t("productSourceUx.title")}>
      <p>
        {selected
          ? t("productSourceUx.connected", { source: selected.name })
          : t("productSourceUx.unknown")}
      </p>
      <div className="pw-actions">
        {selected?.catalog && (
          <ProductWorkspaceLink className="pw-button" href={href(selected.catalog)}>
            {t("productSourceUx.catalog")}
          </ProductWorkspaceLink>
        )}
        <ProductWorkspaceLink
          className="pw-button"
          href={href(selected?.settings ?? "/merchant/integrations-dashboard")}
        >
          {t("productSourceUx.settings")}
        </ProductWorkspaceLink>
      </div>
    </section>
  );
}
