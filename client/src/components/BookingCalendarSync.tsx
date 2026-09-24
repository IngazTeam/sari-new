import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export function BookingCalendarSync({
  bookingId,
  onChanged,
}: {
  bookingId: number;
  onChanged: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.bookings.getCalendarReview.useQuery(
    { bookingId },
    { refetchOnWindowFocus: false }
  );
  const mutation = trpc.bookings.synchronizeCalendar.useMutation({
    retry: false,
  });
  const [reviewed, setReviewed] = useState(false),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    setReviewed(false);
    setReason("");
  }, [bookingId, query.data?.evidence, query.isFetching, query.isError]);
  useEffect(() => {
    setSubmitted(false);
    setError(false);
  }, [bookingId]);
  const states: Record<string, string> = {
    none: t("merchantUx.bookingCalendar.none"),
    creating: t("merchantUx.bookingCalendar.creating"),
    create_unknown: t("merchantUx.bookingCalendar.unknown"),
    synced: t("merchantUx.bookingCalendar.synced"),
    legacy: t("merchantUx.bookingCalendar.legacy"),
    cancelling: t("merchantUx.bookingCancellation.cancelling"),
    cancel_unknown: t("merchantUx.bookingCancellation.unknown"),
    cancelled: t("merchantUx.bookingCancellation.cancelled"),
    reschedule_pending: t("merchantUx.bookingReschedule.pending"),
    moving: t("merchantUx.bookingReschedule.moving"),
    move_unknown: t("merchantUx.bookingReschedule.unknown"),
    applied: t("merchantUx.bookingReschedule.applied"),
    abandoned: t("merchantUx.bookingReschedule.abandoned"),
  };
  const blocked: Record<string, string> = {
    account: t("merchantUx.bookingCalendar.account"),
    binding: t("merchantUx.bookingCalendar.binding"),
    in_flight: t("merchantUx.bookingCalendar.inFlight"),
    legacy: t("merchantUx.bookingCalendar.legacy"),
    consent: t("merchantUx.bookingCalendar.consent"),
  };
  const disabled =
    busy ||
    submitted ||
    query.isFetching ||
    query.isError ||
    !reviewed ||
    reason.trim().length < 10 ||
    reason.trim().length > 500;
  async function perform(action: "create" | "verify") {
    if (
      inFlight.current ||
      disabled ||
      !query.data ||
      !(action === "create" ? query.data.canCreate : query.data.canVerify)
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
      setReviewed(false);
      setReason("");
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
  return (
    <section
      data-booking-calendar
      className="min-w-0 space-y-3 rounded-lg border p-3"
    >
      <h3 className="font-semibold">{t("merchantUx.bookingCalendar.title")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("merchantUx.bookingCalendar.description")}
      </p>
      {query.isLoading ? (
        <p role="status">{t("merchantUx.bookingCalendar.loading")}</p>
      ) : query.isError ? (
        <p role="alert">{t("merchantUx.bookingCalendar.failed")}</p>
      ) : (
        query.data && (
          <>
            <p data-booking-calendar-state role="status">
              {states[query.data.state] ||
                t("merchantUx.bookingCalendar.unknown")}
            </p>
            {query.data.blocked && (
              <p>
                {blocked[query.data.blocked] ||
                  t("merchantUx.bookingCalendar.failed")}
              </p>
            )}
            {query.data.calendarId && (
              <p className="[overflow-wrap:anywhere]">
                {t("merchantUx.bookingCalendar.target")}:{" "}
                <bdi>{query.data.calendarId}</bdi>
              </p>
            )}
            {query.data.eventId && (
              <p className="[overflow-wrap:anywhere]">
                {t("merchantUx.bookingCalendar.event")}:{" "}
                <bdi>{query.data.eventId}</bdi>
              </p>
            )}
            {query.data.checkedAt && (
              <p>
                {t("merchantUx.bookingCalendar.checked")}:{" "}
                <time dateTime={query.data.checkedAt}>
                  {new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(query.data.checkedAt))}
                </time>
              </p>
            )}
            {(query.data.canCreate || query.data.canVerify) && (
              <div className="space-y-3" data-booking-calendar-form>
                <label className="block space-y-1">
                  <span>{t("merchantUx.bookingCalendar.reason")}</span>
                  <textarea
                    data-calendar-reason
                    className="min-h-24 w-full rounded-md border bg-background p-2"
                    maxLength={500}
                    value={reason}
                    disabled={busy || submitted || query.isFetching}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2">
                  <input
                    data-calendar-attest
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={reviewed}
                    disabled={busy || submitted || query.isFetching}
                    onChange={e => setReviewed(e.target.checked)}
                  />
                  <span>{t("merchantUx.bookingCalendar.attest")}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {query.data.canCreate && (
                    <Button
                      type="button"
                      data-calendar-create
                      className="min-h-11 h-auto whitespace-normal"
                      disabled={disabled}
                      onClick={() => perform("create")}
                    >
                      {t("merchantUx.bookingCalendar.create")}
                    </Button>
                  )}
                  {query.data.canVerify && (
                    <Button
                      type="button"
                      data-calendar-verify
                      className="min-h-11 h-auto whitespace-normal"
                      disabled={disabled}
                      onClick={() => perform("verify")}
                    >
                      {t("merchantUx.bookingCalendar.verify")}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {query.data.history.length > 0 && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center">
                  {t("merchantUx.bookingCalendar.history")}
                </summary>
                <ul className="space-y-2">
                  {query.data.history.map((row, index) => (
                    <li
                      key={index}
                      className="rounded border p-2 [overflow-wrap:anywhere]"
                    >
                      <p>
                        {row.action === "move"
                          ? t("merchantUx.bookingReschedule.move")
                          : row.action === "verify_move"
                            ? t("merchantUx.bookingReschedule.verify")
                            : row.action === "abandon_move"
                              ? t("merchantUx.bookingReschedule.abandon")
                              : row.action === "cancel"
                                ? t("merchantUx.bookingCancellation.cancel")
                                : row.action === "verify_cancel"
                                  ? t("merchantUx.bookingCancellation.verify")
                                  : row.action === "create"
                                    ? t("merchantUx.bookingCalendar.create")
                                    : t(
                                        "merchantUx.bookingCalendar.verify"
                                      )}{" "}
                        ·{" "}
                        {states[row.outcome] ||
                          t("merchantUx.bookingCalendar.unknown")}
                      </p>
                      <p dir="auto">{row.reason}</p>
                      <time dateTime={row.at}>
                        {new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(row.at))}
                      </time>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      )}
      {error && <p role="alert">{t("merchantUx.bookingCalendar.failed")}</p>}
      {busy && <p role="status">{t("merchantUx.bookingCalendar.working")}</p>}
      <Button
        type="button"
        variant="outline"
        data-calendar-refresh
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
        {t("merchantUx.bookingCalendar.refresh")}
      </Button>
    </section>
  );
}
