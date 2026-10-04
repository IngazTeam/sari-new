import { trialNoticeLabels } from "@/lib/dashboard-labels";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useSubscriptionNotice } from "@/lib/subscription-notice";
import "@/styles/subscription-notice.css";
import { Button } from "@/components/ui/button";
export function TrialBanner() {
  const { t, i18n } = useTranslation(),
    label = trialNoticeLabels(t);
  const { data, notice, loading, error, refresh } = useSubscriptionNotice();
  if (loading)
    return (
      <p role="status" className="sn-badge">
        {label("loading")}
      </p>
    );
  if (error || !data || !notice)
    return (
      <section className="sn-banner space-y-3" role="alert">
        <p>{label("failed")}</p>
        <Button variant="outline" onClick={refresh}>
          {label("retry")}
        </Button>
        <Link className="mw-link" href="/merchant/my-subscription">
          {label("manage")}
        </Link>
      </section>
    );
  if (notice.state === "active") return null;
  const trial = notice.isTrial,
    end = notice.end ? Date.parse(notice.end) : null;
  const remaining = notice.remainingMs,
    expired = notice.state === "expired";
  const locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-GB";
  const unit = (value: number, kind: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: kind,
      unitDisplay: "long",
    }).format(value);
  let duration: string | null = null;
  if (trial && remaining !== null && remaining > 0) {
    const minutes = Math.floor(remaining / 60000),
      days = Math.floor(minutes / 1440),
      hours = Math.floor((minutes % 1440) / 60);
    duration = days
      ? unit(days, "day") + " · " + unit(hours, "hour")
      : hours
        ? unit(hours, "hour") + " · " + unit(minutes % 60, "minute")
        : minutes
          ? unit(minutes, "minute")
          : label("underMinute");
  }
  const title =
    notice.state === "none"
      ? label("noSubscription")
      : expired
        ? label(trial ? "trialEnded" : "subscriptionEnded")
        : trial && notice.state === "trial"
          ? label("trial")
          : label("review");
  return (
    <section
      className="sn-banner space-y-3"
      aria-label={label("title")}
      dir={i18n.dir()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link className="mw-link" href="/merchant/my-subscription">
          {label("manage")}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {label(notice.state === "trial" ? "trialHelp" : "reviewHelp")}
      </p>
      {trial &&
        !expired &&
        (notice.state !== "trial" || end === null ? (
          <p>{label("unknownEnd")}</p>
        ) : (
          <>
            <p className="text-sm">
              {label("ends")}{" "}
              <time dateTime={new Date(end).toISOString()}>
                {new Date(end).toLocaleString(locale, {
                  calendar: "gregory",
                  timeZone: "UTC",
                  dateStyle: "medium",
                  timeStyle: "long",
                })}
              </time>
            </p>
            <p className="text-sm">
              {label("remaining")} <strong>{duration}</strong>
            </p>
          </>
        ))}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/merchant/subscription/plans">{label("plans")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/merchant/subscription/compare">{label("compare")}</Link>
        </Button>
      </div>
    </section>
  );
}
