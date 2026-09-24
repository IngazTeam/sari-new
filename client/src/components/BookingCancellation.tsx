import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { BookingNotification } from "./BookingNotification";

export function BookingCancellation({
  bookingId,
  onChanged,
}: {
  bookingId: number;
  onChanged: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.bookings.getCancellationReview.useQuery(
    { bookingId },
    { refetchOnWindowFocus: false }
  );
  const mutation = trpc.bookings.cancelCalendar.useMutation({ retry: false });
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
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
    none: t("merchantUx.bookingCancellation.none"),
    cancelling: t("merchantUx.bookingCancellation.cancelling"),
    cancel_unknown: t("merchantUx.bookingCancellation.unknown"),
    cancelled: t("merchantUx.bookingCancellation.cancelled"),
  };
  const blockers: Record<string, string> = {
    binding: t("merchantUx.bookingCancellation.binding"),
    financial: t("merchantUx.bookingCancellation.financial"),
    changed: t("merchantUx.bookingCancellation.changed"),
    request: t("merchantUx.bookingCancellation.requestMissing"),
    booking: t("merchantUx.bookingCancellation.booking"),
    inFlight: t("merchantUx.bookingCancellation.inFlight"),
  };
  const disabled =
    busy ||
    submitted ||
    query.isFetching ||
    query.isError ||
    !reviewed ||
    reason.trim().length < 10 ||
    reason.trim().length > 500;
  const format = (at: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  async function perform(action: "cancel" | "verify") {
    if (
      inFlight.current ||
      disabled ||
      !query.data ||
      !(action === "cancel" ? query.data.canCancel : query.data.canVerify)
    )
      return;
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
      data-booking-cancellation
      className="min-w-0 space-y-3 rounded-lg border p-3"
    >
      <h3 className="font-semibold">
        {t("merchantUx.bookingCancellation.title", { id: bookingId })}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("merchantUx.bookingCancellation.description")}
      </p>
      {query.isLoading ? (
        <p role="status">{t("merchantUx.bookingCancellation.loading")}</p>
      ) : query.isError ? (
        <p role="alert">{t("merchantUx.bookingCancellation.failed")}</p>
      ) : (
        query.data && (
          <>
            <p className="[overflow-wrap:anywhere]">
              {query.data.appointment.serviceName} ·{" "}
              <bdi>
                {query.data.appointment.date} ·{" "}
                {query.data.appointment.startTime}–
                {query.data.appointment.endTime}
              </bdi>{" "}
              · {t("merchantUx.bookingCancellation.timezone")}
            </p>
            {query.data.notification && (
              <BookingNotification
                bookingId={bookingId}
                notice={query.data.notification}
                fetching={query.isFetching}
                refresh={async () => {
                  const fresh = await query.refetch();
                  if (fresh.isError) throw Error("refresh");
                  await onChanged();
                }}
              />
            )}
            <p role="status" data-cancellation-state>
              {states[query.data.state] ||
                t("merchantUx.bookingCancellation.unknown")}
            </p>
            {query.data.blocker && query.data.state !== "cancelled" && (
              <p data-cancellation-blocker>
                {blockers[query.data.blocker] ||
                  t("merchantUx.bookingCancellation.failed")}
              </p>
            )}
            {(query.data.originalRequest || query.data.request) && (
              <div
                className="space-y-2 rounded-md border p-3"
                data-cancellation-source
              >
                <p className="font-medium">
                  {t("merchantUx.bookingCancellation.source")}
                </p>
                <p
                  dir="auto"
                  className="whitespace-pre-wrap [overflow-wrap:anywhere]"
                >
                  {(query.data.originalRequest || query.data.request)!.text}
                </p>
                <p>
                  {t("merchantUx.bookingCancellation.messageId", {
                    id: (query.data.originalRequest || query.data.request)!.id,
                  })}
                </p>
                <time
                  dateTime={
                    (query.data.originalRequest || query.data.request)!.at
                  }
                >
                  {format(
                    (query.data.originalRequest || query.data.request)!.at
                  )}
                </time>
              </div>
            )}
            {(query.data.canCancel || query.data.canVerify) && (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span>{t("merchantUx.bookingCancellation.reason")}</span>
                  <textarea
                    data-cancellation-reason
                    className="min-h-24 w-full rounded-md border bg-background p-2"
                    maxLength={500}
                    value={reason}
                    disabled={busy || submitted || query.isFetching}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2">
                  <input
                    data-cancellation-attest
                    className="mt-1 size-5 shrink-0"
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy || submitted || query.isFetching}
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  <span className="leading-relaxed">
                    {t("merchantUx.bookingCancellation.attest")}
                  </span>
                </label>
                {query.data.canCancel && (
                  <Button
                    data-cancellation-cancel
                    type="button"
                    variant="destructive"
                    className="h-auto min-h-11 max-w-full whitespace-normal"
                    disabled={disabled}
                    onClick={() => perform("cancel")}
                  >
                    {t("merchantUx.bookingCancellation.cancel")}
                  </Button>
                )}
                {query.data.canVerify && (
                  <Button
                    data-cancellation-verify
                    type="button"
                    className="h-auto min-h-11 max-w-full whitespace-normal"
                    disabled={disabled}
                    onClick={() => perform("verify")}
                  >
                    {t("merchantUx.bookingCancellation.verify")}
                  </Button>
                )}
              </div>
            )}
            {query.data.history.length > 0 && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center">
                  {t("merchantUx.bookingCancellation.history")}
                </summary>
                <ul className="space-y-2">
                  {query.data.history.map((row, index) => (
                    <li
                      key={index}
                      className="space-y-1 rounded border p-2 [overflow-wrap:anywhere]"
                    >
                      <p>
                        {row.action === "cancel"
                          ? t("merchantUx.bookingCancellation.cancel")
                          : t("merchantUx.bookingCancellation.verify")}{" "}
                        ·{" "}
                        {states[row.outcome] ||
                          t("merchantUx.bookingCancellation.unknown")}
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
      {error && (
        <p role="alert">{t("merchantUx.bookingCancellation.failed")}</p>
      )}
      {busy && (
        <p role="status">{t("merchantUx.bookingCancellation.working")}</p>
      )}
      <Button
        data-cancellation-refresh
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
        {t("merchantUx.bookingCancellation.refresh")}
      </Button>
    </section>
  );
}
