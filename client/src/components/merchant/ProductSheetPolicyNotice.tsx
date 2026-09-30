import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

export default function ProductSheetPolicyNotice() {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <aside
      aria-labelledby={titleId}
      className="mb-6 space-y-3 rounded-2xl border bg-muted/40 p-5"
    >
      <h2 id={titleId} className="font-semibold">
        {t("productSheetUx.reviewRequiredTitle")}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("productSheetUx.reviewRequiredHint")}
      </p>
      <Link
        href="/merchant/products/upload"
        className="inline-flex min-h-11 items-center rounded-lg border bg-background px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t("productSheetUx.openReview")}
      </Link>
    </aside>
  );
}
