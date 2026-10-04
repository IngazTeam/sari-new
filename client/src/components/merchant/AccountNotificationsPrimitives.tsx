import { useEffect, useRef, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  notificationLabels,
  notificationFilters,
  notificationHref,
} from "@/lib/account-notifications-view";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { paymentHistoryDate } from "@/lib/payment-history-view";
import "@/styles/settings-workspace.css";
import "@/styles/account-notifications-workspace.css";
export const notificationQueryOptions = {
  retry: false,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: false,
};
export function useNotificationCopy() {
  const { t, i18n } = useTranslation();
  return { c: notificationLabels(t), locale: i18n.language };
}
export function useNotificationLive() {
  const live = useRef(true),
    epoch = useRef(knowledgeCacheEpoch());
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return () => live.current && epoch.current === knowledgeCacheEpoch();
}
export function NotificationFrame({
  children,
  detail = false,
}: {
  children: ReactNode;
  detail?: boolean;
}) {
  const { c, locale } = useNotificationCopy(),
    f = notificationFilters(useSearch());
  return (
    <section
      className="sw-workspace an-workspace"
      dir={locale.startsWith("en") ? "ltr" : "rtl"}
    >
      {detail && (
        <Link
          className="an-link"
          href={notificationHref(f.success ? f.data : {})}
        >
          {c.back}
        </Link>
      )}
      <header className="sw-heading">
        <span aria-hidden="true">
          <Bell />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{detail ? c.detailTitle : c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
export const notificationDate = paymentHistoryDate;
export function NotificationState({
  state,
}: {
  state: "unread" | "read" | "unknown";
}) {
  const { c } = useNotificationCopy();
  return <span className={"an-state an-state-" + state}>{c[state]}</span>;
}
