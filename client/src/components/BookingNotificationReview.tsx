import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type { BookingNoticeReview } from "../../../shared/booking-reschedule";

export function BookingNotificationReview({
  bookingId,
  notice,
  fetching,
  refresh,
  states,
  deliveries,
}: {
  bookingId: number;
  notice: BookingNoticeReview;
  fetching: boolean;
  refresh: () => Promise<void>;
  states: Record<string, string>;
  deliveries: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const mutation = trpc.bookings.reviewBookingNotification.useMutation({
    retry: false,
  });
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState(false),
    [done, setDone] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    setReason("");
    setReviewed(false);
  }, [bookingId, notice.id, notice.evidence, fetching]);
  useEffect(() => {
    setSubmitted(false);
    setError(false);
    setDone(false);
  }, [bookingId, notice.id]);
  const issues: Record<string, string> = {
    source_channel_missing: t("merchantUx.bookingNotification.sourceMissing"),
    context_changed: t("merchantUx.bookingNotification.contextChanged"),
    receipt_unverified: t("merchantUx.bookingNotification.receiptUnverified"),
    provider_unconfirmed: t(
      "merchantUx.bookingNotification.providerUnconfirmed"
    ),
    conversation_unavailable: t(
      "merchantUx.bookingNotification.conversationUnavailable"
    ),
    projection_conflict: t("merchantUx.bookingNotification.projectionConflict"),
    projection_missing: t("merchantUx.bookingNotification.projectionMissing"),
  };
  const format = (at: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  const disabled =
    busy ||
    fetching ||
    submitted ||
    !notice.canReview ||
    !reviewed ||
    reason.trim().length < 10 ||
    reason.trim().length > 500;
  async function perform() {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitted(true);
    setError(false);
    setDone(false);
    try {
      await mutation.mutateAsync({
        bookingId,
        notificationId: notice.id,
        requestId: crypto.randomUUID(),
        evidence: notice.evidence,
        reviewed: true,
        reason: reason.trim(),
      });
      await refresh();
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setReason("");
      setReviewed(false);
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div data-notice-review className="min-w-0 space-y-3">
      {notice.issue && (
        <p data-notice-issue className="text-sm leading-relaxed">
          {issues[notice.issue] ||
            t("merchantUx.bookingNotification.otherIssue")}
        </p>
      )}
      {notice.dispatchAt && (
        <p>
          {t("merchantUx.bookingNotification.attemptAt")}{" "}
          <time dateTime={notice.dispatchAt}>{format(notice.dispatchAt)}</time>
        </p>
      )}
      {notice.receipt && (
        <p className="[overflow-wrap:anywhere]">
          {t("merchantUx.bookingNotification.receipt")}{" "}
          <bdi data-notice-receipt>{notice.receipt}</bdi>
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {t("merchantUx.bookingNotification.scope")}
      </p>
      {notice.canReview && (
        <div className="space-y-2">
          <label className="block" htmlFor={`notice-reason-${notice.id}`}>
            {t("merchantUx.bookingNotification.reason")}
          </label>
          <textarea
            id={`notice-reason-${notice.id}`}
            data-notice-reason
            className="min-h-24 w-full rounded border p-2"
            maxLength={500}
            value={reason}
            disabled={busy || submitted || fetching}
            onChange={e => {
              setReason(e.target.value);
              setReviewed(false);
            }}
          />
          <label className="flex min-h-11 cursor-pointer items-start gap-2">
            <input
              data-notice-attest
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={reviewed}
              disabled={busy || submitted || fetching}
              onChange={e => setReviewed(e.target.checked)}
            />
            <span className="leading-relaxed">
              {t("merchantUx.bookingNotification.attest")}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              data-notice-submit
              type="button"
              className="h-auto min-h-11 max-w-full whitespace-normal"
              disabled={disabled}
              onClick={perform}
            >
              {t("merchantUx.bookingNotification.verify")}
            </Button>
            <Button
              data-notice-refresh
              type="button"
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal"
              disabled={busy || fetching}
              onClick={async () => {
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setReviewed(false);
                setReason("");
                setError(false);
                setDone(false);
                try {
                  await refresh();
                  setSubmitted(false);
                } catch {
                  setError(true);
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              {t("merchantUx.bookingNotification.refresh")}
            </Button>
          </div>
        </div>
      )}
      {busy && (
        <p role="status">{t("merchantUx.bookingNotification.working")}</p>
      )}
      {error && (
        <p role="alert">{t("merchantUx.bookingNotification.failed")}</p>
      )}
      {done && (
        <p data-notice-done role="status">
          {t("merchantUx.bookingNotification.done")}
        </p>
      )}
      {!!notice.history.length && (
        <details data-notice-history>
          <summary className="flex min-h-11 cursor-pointer items-center">
            {t("merchantUx.bookingNotification.history")}
          </summary>
          <ul className="space-y-2">
            {notice.history.map((row, index) => (
              <li
                key={index}
                className="rounded border p-2 [overflow-wrap:anywhere]"
              >
                <p>
                  {t("merchantUx.bookingNotification.actor", {
                    id: row.actorUserId,
                  })}
                </p>
                <p>
                  {states[row.state] || states.unknown} ·{" "}
                  {deliveries[row.delivery] ||
                    t("merchantUx.bookingReschedule.noticeUnverified")}
                </p>
                <p>
                  {row.projected
                    ? t("merchantUx.bookingNotification.projected")
                    : t("merchantUx.bookingNotification.notProjected")}
                </p>
                <p dir="auto">{row.reason}</p>
                <time dateTime={row.at}>{format(row.at)}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
