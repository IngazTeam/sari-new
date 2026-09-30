import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { CustomerRow } from "@shared/customer-workspace";
export function customerActivity(t: TFunction) {
  return {
    active: t("customerWorkspaceUx.active"),
    recent: t("customerWorkspaceUx.recent"),
    inactive: t("customerWorkspaceUx.inactive"),
    unknown: t("customerWorkspaceUx.unknown"),
  };
}
export function customerSourceNames(t: TFunction) {
  return {
    conversation: t("customerWorkspaceUx.conversationSource"),
    order: t("customerWorkspaceUx.orderSource"),
    profile: t("customerWorkspaceUx.profileSource"),
    zid: t("customerWorkspaceUx.zidSource"),
    loyalty: t("customerWorkspaceUx.loyaltySource"),
  };
}
export function customerDate(value: string | null, language: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(language, {
    timeZone: "UTC",
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function customerMoney(
  value: number,
  currency: "SAR" | "USD",
  language: string
) {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
  }).format(value / 100);
}
export function CustomerSources({ row }: { row: CustomerRow }) {
  const { t } = useTranslation(),
    names = customerSourceNames(t);
  return (
    <ul className="cw-tags" aria-label={t("customerWorkspaceUx.sources")}>
      {row.sources.map(source => (
        <li key={source}>{names[source]}</li>
      ))}
    </ul>
  );
}
export function CustomerPagination({
  value,
  disabled,
  onPage,
}: {
  value: { page: number; pages: number; total: number };
  disabled?: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      className="cw-pagination"
      aria-label={t("customerWorkspaceUx.page", {
        page: value.page,
        pages: Math.max(1, value.pages),
        total: value.total,
      })}
    >
      <p role="status">
        {t("customerWorkspaceUx.page", {
          page: value.page,
          total: value.total,
          pages: Math.max(1, value.pages),
        })}
      </p>
      <button
        type="button"
        disabled={disabled || value.page <= 1}
        onClick={() => onPage(value.page - 1)}
      >
        {t("customerWorkspaceUx.previous")}
      </button>
      <button
        type="button"
        disabled={disabled || value.page >= value.pages}
        onClick={() => onPage(value.page + 1)}
      >
        {t("customerWorkspaceUx.next")}
      </button>
    </nav>
  );
}
