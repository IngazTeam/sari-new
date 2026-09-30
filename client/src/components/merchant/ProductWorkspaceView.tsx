import type { TFunction } from "i18next";
import type { ProductField } from "@/lib/product-workspace-model";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ProductHeading({ children }: { children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <h1 ref={heading} tabIndex={-1}>
      {children}
    </h1>
  );
}
export function ProductThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  let safe = false;
  try {
    const parsed = new URL(url || "");
    safe =
      ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password;
  } catch {
    /* No valid image. */
  }
  if (!safe || failed) return null;
  return (
    <img
      className="pw-thumbnail"
      src={url!}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
export function productLabels(t: TFunction): Record<ProductField, string> {
  return {
    name: t("productWorkspaceUx.name"),
    description: t("productWorkspaceUx.description"),
    price: t("productWorkspaceUx.price"),
    currency: t("productWorkspaceUx.currency"),
    imageUrl: t("productWorkspaceUx.imageUrl"),
    stock: t("productWorkspaceUx.stock"),
    sku: t("productWorkspaceUx.sku"),
    barcode: t("productWorkspaceUx.barcode"),
    compareAtPrice: t("productWorkspaceUx.compareAtPrice"),
    costPrice: t("productWorkspaceUx.costPrice"),
    weight: t("productWorkspaceUx.weight"),
    category: t("productWorkspaceUx.category"),
    categoryId: t("productWorkspaceUx.categoryId"),
    tags: t("productWorkspaceUx.tags"),
    productType: t("productWorkspaceUx.productType"),
    status: t("productWorkspaceUx.status"),
    lowStockAlert: t("productWorkspaceUx.lowStockAlert"),
    trackInventory: t("productWorkspaceUx.trackInventory"),
  };
}
export function productFieldError(t: TFunction, field: ProductField) {
  if (field === "name") return t("productWorkspaceUx.nameError");
  if (["price", "compareAtPrice", "costPrice"].includes(field))
    return t("productWorkspaceUx.priceError");
  if (field === "stock") return t("productWorkspaceUx.stockError");
  if (field === "lowStockAlert") return t("productWorkspaceUx.thresholdError");
  if (field === "imageUrl") return t("productWorkspaceUx.imageError");
  if (field === "description") return t("productWorkspaceUx.descriptionError");
  if (field === "tags") return t("productWorkspaceUx.tagsError");
  return t("productWorkspaceUx.invalidField");
}
export function productChoices(t: TFunction) {
  return {
    status: {
      active: t("productWorkspaceUx.active"),
      draft: t("productWorkspaceUx.draft"),
      archived: t("productWorkspaceUx.archived"),
    },
    productType: {
      physical: t("productWorkspaceUx.physical"),
      digital: t("productWorkspaceUx.digital"),
      service: t("productWorkspaceUx.service"),
    },
    inventory: {
      out: t("productWorkspaceUx.out"),
      low: t("productWorkspaceUx.low"),
      untracked: t("productWorkspaceUx.untracked"),
      unknown: t("productWorkspaceUx.unknown"),
      available: t("productWorkspaceUx.available"),
    },
  };
}
export function ProductPending({
  busy,
  canRetry,
  recover,
  retry,
}: {
  busy: boolean;
  canRetry: boolean;
  recover: () => void;
  retry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="pw-notice" role="status">
      <h2>{t("productWorkspaceUx.pendingTitle")}</h2>
      <p>{t("productWorkspaceUx.pendingHint")}</p>
      <div className="pw-actions">
        <button type="button" disabled={busy} onClick={recover}>
          {t("productWorkspaceUx.recover")}
        </button>
        <button type="button" disabled={busy || !canRetry} onClick={retry}>
          {t("productWorkspaceUx.retrySame")}
        </button>
      </div>
    </section>
  );
}
export const productDefinitiveError = (error: unknown) =>
  [
    "BAD_REQUEST",
    "CONFLICT",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "PRECONDITION_FAILED",
  ].includes((error as any)?.data?.code);
