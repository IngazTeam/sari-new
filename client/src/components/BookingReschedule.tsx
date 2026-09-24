import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
export function BookingReschedule({
  bookingId,
  onChanged,
}: {
  bookingId: number;
  onChanged: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.bookings.getRescheduleReview.useQuery(
    { bookingId },
    { refetchOnWindowFocus: false }
  );
  const mutation = trpc.bookings.rescheduleCalendar.useMutation({
    retry: false,
  });
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    setReason("");
    setReviewed(false);
  }, [bookingId, query.data?.evidence, query.isError, query.isFetching]);
  useEffect(() => {
    setSubmitted(false);
    setError(false);
  }, [bookingId]);
  const states: Record<string, string> = {
    pending: t("merchantUx.bookingReschedule.pending"),
    moving: t("merchantUx.bookingReschedule.moving"),
    move_unknown: t("merchantUx.bookingReschedule.unknown"),
    applied: t("merchantUx.bookingReschedule.applied"),
    abandoned: t("merchantUx.bookingReschedule.abandoned"),
  };
  const blockers: Record<string, string> = {
    binding: t("merchantUx.bookingReschedule.binding"),
    changed: t("merchantUx.bookingReschedule.changed"),
    financial: t("merchantUx.bookingReschedule.financial"),
    booking: t("merchantUx.bookingReschedule.booking"),
    consent: t("merchantUx.bookingReschedule.consent"),
    availability: t("merchantUx.bookingReschedule.availability"),
    inFlight: t("merchantUx.bookingReschedule.inFlight"),
  };
  const labels = {
    move: t("merchantUx.bookingReschedule.move"),
    verify: t("merchantUx.bookingReschedule.verify"),
    abandon: t("merchantUx.bookingReschedule.abandon"),
  };
  const notificationStates: Record<string, string> = {
    pending: t("merchantUx.bookingReschedule.noticePending"),
    dispatching: t("merchantUx.bookingReschedule.noticeDispatching"),
    accepted: t("merchantUx.bookingReschedule.noticeAccepted"),
    unknown: t("merchantUx.bookingReschedule.noticeUnknown"),
    failed: t("merchantUx.bookingReschedule.noticeFailed"),
    suppressed: t("merchantUx.bookingReschedule.noticeSuppressed"),
    manual_review: t("merchantUx.bookingReschedule.noticeManual"),
  };
  const deliveryStates: Record<string, string> = {
    sent: t("merchantUx.bookingReschedule.noticeSent"),
    delivered: t("merchantUx.bookingReschedule.noticeDelivered"),
    read: t("merchantUx.bookingReschedule.noticeRead"),
    failed: t("merchantUx.bookingReschedule.noticeDeliveryFailed"),
  };
  const disabled =
    busy ||
    submitted ||
    query.isFetching ||
    query.isError ||
    !reviewed ||
    reason.trim().length < 10 ||
    reason.trim().length > 500;
  const can = (action: keyof typeof labels) =>
    action === "move"
      ? query.data?.canMove
      : action === "verify"
        ? query.data?.canVerify
        : query.data?.canAbandon;
  const format = (at: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  async function perform(action: keyof typeof labels) {
    if (inFlight.current || disabled || !query.data || !can(action)) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitted(true);
    setError(false);
    try {
      await mutation.mutateAsync({
        bookingId,
        requestId: crypto.randomUUID(),
        evidence: query.data.evidence,
        action,
        reviewed: true,
        reason: reason.trim(),
      });
    } catch {
      setError(true);
    } finally {
      setReason("");
      setReviewed(false);
      try {
        const fresh = await query.refetch();
        if (fresh.isError) throw Error("refresh");
        await onChanged();
      } catch {
        setError(true);
      }
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!query.isLoading && !query.isError && !query.data) return null;
  return (
    <section
      data-booking-reschedule
      className="min-w-0 space-y-3 rounded-lg border p-3"
    >
      <h3 className="font-semibold">
        {t("merchantUx.bookingReschedule.title", { id: bookingId })}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("merchantUx.bookingReschedule.description")}
      </p>
      {query.isLoading ? (
        <p role="status">{t("merchantUx.bookingReschedule.loading")}</p>
      ) : query.isError ? (
        <p role="alert">{t("merchantUx.bookingReschedule.failed")}</p>
      ) : (
        query.data && (
          <>
            <p role="status" data-reschedule-state>
              {states[query.data.state] ||
                t("merchantUx.bookingReschedule.unknown")}
            </p>
            {query.data.notification && (
              <div
                data-booking-notification
                className="min-w-0 space-y-2 rounded border p-3"
              >
                <h4 className="font-medium">
                  {t("merchantUx.bookingReschedule.noticeTitle")}
                </h4>
                <p role="status">
                  {notificationStates[query.data.notification.state] ||
                    notificationStates.unknown}
                </p>
                <p>
                  {deliveryStates[query.data.notification.delivery] ||
                    t("merchantUx.bookingReschedule.noticeUnverified")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("merchantUx.bookingReschedule.noticeScope")}
                </p>
                {query.data.notification.acceptedAt && (
                  <time dateTime={query.data.notification.acceptedAt}>
                    {format(query.data.notification.acceptedAt)}
                  </time>
                )}
                {query.data.notification.state === "accepted" &&
                  !query.data.notification.projected && (
                    <p>{t("merchantUx.bookingReschedule.noticeProjection")}</p>
                  )}
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center">
                    {t("merchantUx.bookingReschedule.noticeText")}
                  </summary>
                  <p
                    dir="auto"
                    className="whitespace-pre-wrap [overflow-wrap:anywhere]"
                  >
                    {query.data.notification.text}
                  </p>
                </details>
              </div>
            )}
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {[
                ["before", t("merchantUx.bookingReschedule.before")],
                ["after", t("merchantUx.bookingReschedule.after")],
              ].map(([key, label]) => {
                const value =
                  key === "before" ? query.data!.before : query.data!.after;
                return (
                  <div key={key} className="min-w-0 rounded border p-2">
                    <p className="font-medium">{label}</p>
                    <p className="[overflow-wrap:anywhere]">
                      <bdi>
                        {value.date} · {value.startTime}–{value.endTime}
                      </bdi>
                    </p>
                    <p>{t("merchantUx.bookingReschedule.timezone")}</p>
                  </div>
                );
              })}
            </div>
            {query.data.blocker &&
              !["applied", "abandoned"].includes(query.data.state) && (
                <p>
                  {blockers[query.data.blocker] ||
                    t("merchantUx.bookingReschedule.failed")}
                </p>
              )}
            <details open>
              <summary className="flex min-h-11 cursor-pointer items-center">
                {t("merchantUx.bookingReschedule.agreement")}
              </summary>
              <p
                data-reschedule-offer
                dir="auto"
                className="whitespace-pre-wrap [overflow-wrap:anywhere]"
              >
                {query.data.offerText}
              </p>
              {query.data.consent && (
                <div className="mt-2 rounded border p-2">
                  <p>
                    {t("merchantUx.bookingReschedule.messageId", {
                      id: query.data.consent.id,
                    })}
                  </p>
                  <p
                    dir="auto"
                    className="whitespace-pre-wrap [overflow-wrap:anywhere]"
                  >
                    {query.data.consent.text}
                  </p>
                  <time dateTime={query.data.consent.at}>
                    {format(query.data.consent.at)}
                  </time>
                </div>
              )}
            </details>
            {(query.data.canMove ||
              query.data.canVerify ||
              query.data.canAbandon) && (
              <div className="space-y-3">
                <label
                  className="block"
                  htmlFor={`booking-move-reason-${bookingId}`}
                >
                  {t("merchantUx.bookingReschedule.reason")}
                </label>
                <textarea
                  id={`booking-move-reason-${bookingId}`}
                  data-reschedule-reason
                  className="min-h-24 w-full rounded border p-2"
                  maxLength={500}
                  value={reason}
                  disabled={busy || submitted || query.isFetching}
                  onChange={e => setReason(e.target.value)}
                />
                <label className="flex min-h-11 cursor-pointer items-start gap-2">
                  <input
                    data-reschedule-attest
                    className="mt-1 size-5 shrink-0"
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy || submitted || query.isFetching}
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  <span className="leading-relaxed">
                    {t("merchantUx.bookingReschedule.attest")}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["move", "verify", "abandon"] as const)
                    .filter(can)
                    .map(action => (
                      <Button
                        key={action}
                        data-reschedule-action={action}
                        type="button"
                        variant={action === "abandon" ? "outline" : "default"}
                        className="h-auto min-h-11 max-w-full whitespace-normal"
                        disabled={disabled}
                        onClick={() => perform(action)}
                      >
                        {labels[action]}
                      </Button>
                    ))}
                </div>
              </div>
            )}
            {!!query.data.history.length && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center">
                  {t("merchantUx.bookingReschedule.history")}
                </summary>
                <ul className="space-y-2">
                  {query.data.history.map((row, index) => (
                    <li
                      key={index}
                      className="rounded border p-2 [overflow-wrap:anywhere]"
                    >
                      <p>
                        {row.action === "move"
                          ? labels.move
                          : row.action === "verify_move"
                            ? labels.verify
                            : labels.abandon}{" "}
                        ·{" "}
                        {states[row.outcome] ||
                          t("merchantUx.bookingReschedule.unknown")}
                      </p>
                      <p dir="auto">{row.reason}</p>
                      <time dateTime={row.at}>{format(row.at)}</time>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      )}
      {error && <p role="alert">{t("merchantUx.bookingReschedule.failed")}</p>}
      {busy && <p role="status">{t("merchantUx.bookingReschedule.working")}</p>}
      <Button
        data-reschedule-refresh
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={busy || query.isFetching}
        onClick={async () => {
          if (inFlight.current) return;
          setError(false);
          setReviewed(false);
          setReason("");
          try {
            const fresh = await query.refetch();
            if (fresh.isError) throw Error("refresh");
            setSubmitted(false);
          } catch {
            setError(true);
          }
        }}
      >
        {t("merchantUx.bookingReschedule.refresh")}
      </Button>
    </section>
  );
}
