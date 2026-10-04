import { CalendarDays, CircleHelp } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useSubscriptionNotice } from "@/lib/subscription-notice";
import { billingLabels } from "@/lib/subscription-billing-labels";
import { trialNoticeLabels } from "@/lib/dashboard-labels";
import "@/styles/subscription-notice.css";
export function SubscriptionBadge() {
  const { t, i18n } = useTranslation(),
    c = billingLabels(t),
    label = trialNoticeLabels(t);
  const { notice, loading, error } = useSubscriptionNotice();
  if (loading)
    return (
      <p className="sn-badge" role="status">
        {label("loading")}
      </p>
    );
  const live = notice?.state === "active" || notice?.state === "trial";
  const days = notice?.daysRemaining;
  const value =
    error || !notice
      ? label("failed")
      : live && days !== null && days !== undefined
        ? `${c[notice.state]} · ${new Intl.NumberFormat(i18n.language.startsWith("ar") ? "ar-SA" : "en-US", { style: "unit", unit: "day", unitDisplay: "long" }).format(days)}`
        : c[notice.state];
  return (
    <Link
      href="/merchant/my-subscription"
      className={`sn-badge${live ? "" : " sn-review"}`}
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      {live ? (
        <CalendarDays size={16} aria-hidden="true" />
      ) : (
        <CircleHelp size={16} aria-hidden="true" />
      )}
      <span>{value}</span>
    </Link>
  );
}
