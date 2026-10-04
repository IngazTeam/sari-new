import { useEffect, useRef, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Link2, ArrowLeft } from "lucide-react";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { paymentLinksLabels } from "@/lib/payment-links-labels";
import {
  readPaymentLinksSearch,
  paymentLinksHref,
} from "@/lib/payment-links-view";
import { type PaymentLinkRecord } from "@shared/payment-links-workspace";
import { formatStoredPaymentMoney } from "@shared/payment-money";
import "@/styles/settings-workspace.css";
import "@/styles/payment-history-workspace.css";
import "@/styles/payment-links-workspace.css";
export type LinkScope = { actorId: number; merchantId: number };
export type LinkCopy = ReturnType<typeof paymentLinksLabels>;
export function useLinkCopy() {
  const { t, i18n } = useTranslation();
  return { c: paymentLinksLabels(t), locale: i18n.language };
}
export function useLinkLive() {
  const alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return () => alive.current && epoch.current === knowledgeCacheEpoch();
}
export function linkScoped<T extends LinkScope>(value: T, scope: LinkScope) {
  return (
    value.actorId === scope.actorId && value.merchantId === scope.merchantId
  );
}
export function PaymentLinksFrame({
  title,
  children,
  back = false,
}: {
  title: keyof LinkCopy;
  children: ReactNode;
  back?: boolean;
}) {
  const { c, locale } = useLinkCopy(),
    filter = readPaymentLinksSearch(useSearch());
  return (
    <section
      className="sw-workspace ph-workspace pl-workspace"
      dir={locale.startsWith("en") ? "ltr" : "rtl"}
    >
      {back && (
        <Link
          className="ph-back"
          href={paymentLinksHref(filter.success ? filter.data : {})}
        >
          <ArrowLeft aria-hidden="true" />
          {c.back}
        </Link>
      )}
      <header className="sw-heading">
        <span aria-hidden="true">
          <Link2 />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{c[title]}</h1>
          <p>{title === "createTitle" ? c.createHint : c.intro}</p>
        </div>
      </header>
      <nav className="ph-nav" aria-label={c.eyebrow}>
        <Link href="/merchant/payments">{c.history}</Link>
        <Link href="/merchant/payment-settings">{c.settings}</Link>
      </nav>
      {children}
    </section>
  );
}
export function LinkState({
  value,
  c,
}: {
  value: PaymentLinkRecord["availability"];
  c: LinkCopy;
}) {
  return <span className={`ph-status pl-status-${value}`}>{c[value]}</span>;
}
export const linkNumber = (v: number | null, locale: string, c: LinkCopy) =>
  v === null ? c.unknown : new Intl.NumberFormat(locale).format(v);
export const linkMoney = (
  v: number | null,
  currency: string | null,
  locale: string,
  c: LinkCopy
) => formatStoredPaymentMoney(v, currency, locale) ?? c.unknown;
export function LinkPairs({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="ph-definition">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
