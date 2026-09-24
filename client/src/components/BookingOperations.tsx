import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { BookingConsentPanel } from "@/components/BookingConsentPanel";
import { BookingCalendarSync } from "@/components/BookingCalendarSync";
import { BookingCancellation } from "@/components/BookingCancellation";
import {
  bookingStatusSchema,
  bookingTransitions,
  type BookingStatus,
} from "../../../shared/booking-operations";

export function BookingOperations({
  booking,
  onChanged,
}: {
  booking: { id: number; status: BookingStatus; paymentStatus: string };
  onChanged: (deleted: boolean) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState(booking.status),
    [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const [consentReviewed, setConsentReviewed] = useState(false);
  const calendar = trpc.bookings.getCalendarReview.useQuery(
    { bookingId: booking.id },
    { refetchOnWindowFocus: false }
  );
  const calendarReady =
    !!calendar.data &&
    !calendar.isLoading &&
    !calendar.isFetching &&
    !calendar.isError;
  const calendarManaged =
    !!calendar.data && !["none", "legacy"].includes(calendar.data.state);
  const consent = trpc.bookings.getConsentReview.useQuery(
    { bookingId: booking.id },
    { refetchOnWindowFocus: false }
  );
  useEffect(() => {
    setConsentReviewed(false);
  }, [
    booking.id,
    booking.status,
    consent.data?.evidence,
    consent.isError,
    consent.isFetching,
  ]);
  const confirming = booking.status === "pending" && status === "confirmed";
  const canConfirm =
    !consent.isLoading &&
    !consent.isError &&
    !consent.isFetching &&
    !!consent.data &&
    (consent.data.state === "none" ||
      (consent.data.state === "ready" && consentReviewed));
  useEffect(() => {
    setStatus(booking.status);
    setAttested(false);
    setSubmitted(false);
  }, [booking.id, booking.status]);
  const history = trpc.bookings.getOperationHistory.useQuery(
    { bookingId: booking.id },
    { refetchOnWindowFocus: false }
  );
  const update = trpc.bookings.update.useMutation({ retry: false }),
    remove = trpc.bookings.delete.useMutation({ retry: false });
  const labels = {
    pending: t("merchantUx.bookingOperations.pending"),
    confirmed: t("merchantUx.bookingOperations.confirmed"),
    in_progress: t("merchantUx.bookingOperations.inProgress"),
    completed: t("merchantUx.bookingOperations.completed"),
    cancelled: t("merchantUx.bookingOperations.cancelled"),
    no_show: t("merchantUx.bookingOperations.noShow"),
  };
  const refresh = async (deleted = false) => {
    const result = await history.refetch();
    if (result.isError) throw Error("Booking history refresh failed");
    if (!deleted && result.data?.[0]?.operation !== "delete") {
      const fresh = await consent.refetch();
      if (fresh.isError) throw Error("Booking consent refresh failed");
      const calendarFresh = await calendar.refetch();
      if (calendarFresh.isError) throw Error("Booking calendar refresh failed");
    }
    await onChanged(deleted || result.data?.[0]?.operation === "delete");
  };
  const perform = async (operation: "update" | "delete") => {
    if (inFlight.current || busy || submitted || history.isFetching) return;
    if (!calendarReady || (operation === "delete" && calendarManaged)) return;
    if (operation === "update" && confirming && !canConfirm) return;
    if (
      (operation === "update" &&
        (!allowed.includes(status) || booking.paymentStatus === "refunded")) ||
      (operation === "delete" && !attested)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setSubmitted(true);
    setSaved(false);
    setError(false);
    let deleted = false;
    const input = {
      bookingId: booking.id,
      expectedStatus: booking.status,
      operationId: crypto.randomUUID(),
    };
    try {
      const result =
        operation === "update"
          ? await update.mutateAsync({
              ...input,
              status,
              ...(confirming && consent.data?.state === "ready"
                ? {
                    consentReview: {
                      agreementId: consent.data.agreementId!,
                      evidence: consent.data.evidence!,
                      reviewed: true as const,
                    },
                  }
                : {}),
            })
          : await remove.mutateAsync(input);
      deleted = result.deleted;
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setAttested(false);
      setConsentReviewed(false);
      try {
        await refresh(deleted);
      } catch {
        setError(true);
      }
      inFlight.current = false;
      setBusy(false);
    }
  };
  if (history.isLoading)
    return <p role="status">{t("merchantUx.bookingOperations.loading")}</p>;
  if (history.isError)
    return (
      <div role="alert">
        <p>{t("merchantUx.bookingOperations.failed")}</p>
        <Button
          type="button"
          className="min-h-11"
          onClick={() => history.refetch()}
        >
          {t("merchantUx.bookingOperations.refresh")}
        </Button>
      </div>
    );
  const allowed =
    booking.paymentStatus === "refunded"
      ? []
      : bookingTransitions[booking.status].filter(
          next =>
            !calendarManaged ||
            (calendar.data?.state === "synced" &&
              next !== "cancelled" &&
              (!["completed", "no_show"].includes(next) ||
                calendar.data.canRelease))
        );
  const disabled = busy || submitted || history.isFetching || !calendarReady;
  const mayDelete =
    ["pending", "cancelled"].includes(booking.status) &&
    booking.paymentStatus === "unpaid" &&
    !calendarManaged;
  return (
    <section
      data-booking-operations
      className="min-w-0 space-y-3 rounded-xl border p-4 text-sm"
      aria-labelledby={`booking-operations-${booking.id}`}
    >
      <h3 id={`booking-operations-${booking.id}`} className="font-semibold">
        {t("merchantUx.bookingOperations.title")}
      </h3>
      <p className="leading-relaxed text-muted-foreground">
        {t("merchantUx.bookingOperations.scope")}
      </p>
      <label
        className="block space-y-2"
        htmlFor={`booking-status-${booking.id}`}
      >
        <span>{t("merchantUx.bookingOperations.status")}</span>
        <select
          id={`booking-status-${booking.id}`}
          className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
          value={status}
          disabled={disabled || !allowed.length}
          onChange={event => {
            setStatus(bookingStatusSchema.parse(event.target.value));
            setConsentReviewed(false);
            setAttested(false);
            setError(false);
            setSaved(false);
          }}
        >
          {[booking.status, ...allowed].map(value => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </label>
      <BookingConsentPanel
        data={consent.data}
        loading={consent.isLoading}
        failed={consent.isError}
        fetching={consent.isFetching}
        reviewed={consentReviewed}
        disabled={disabled}
        confirming={confirming}
        onReviewed={setConsentReviewed}
        onRefresh={async () => {
          if (inFlight.current) return;
          setConsentReviewed(false);
          await consent.refetch();
        }}
      />
      <Button
        type="button"
        data-booking-operation-save
        className="min-h-11 max-w-full whitespace-normal"
        disabled={
          disabled || !allowed.includes(status) || (confirming && !canConfirm)
        }
        onClick={() => perform("update")}
      >
        {t(
          busy
            ? "merchantUx.bookingOperations.saving"
            : "merchantUx.bookingOperations.save"
        )}
      </Button>
      {!allowed.length && <p>{t("merchantUx.bookingOperations.terminal")}</p>}
      <p className="leading-relaxed">
        {t("merchantUx.bookingOperations.deleteScope")}
      </p>
      {mayDelete && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0"
            checked={attested}
            disabled={disabled}
            onChange={event => setAttested(event.target.checked)}
          />
          <span className="leading-relaxed">
            {t("merchantUx.bookingOperations.deleteAttest")}
          </span>
        </label>
      )}
      <Button
        type="button"
        variant="destructive"
        data-booking-operation-delete
        className="min-h-11 max-w-full whitespace-normal"
        disabled={disabled || !mayDelete || !attested}
        onClick={() => perform("delete")}
      >
        {t("merchantUx.bookingOperations.remove")}
      </Button>
      {error && <p role="alert">{t("merchantUx.bookingOperations.failed")}</p>}
      {saved && !error && (
        <p role="status">{t("merchantUx.bookingOperations.saved")}</p>
      )}
      <h4 className="font-semibold">
        {t("merchantUx.bookingOperations.history")}
      </h4>
      {!history.data?.length && (
        <p>{t("merchantUx.bookingOperations.empty")}</p>
      )}
      {history.data?.map((row, index) => (
        <div
          data-booking-operation-audit
          key={`${row.at}-${index}`}
          className="space-y-1 rounded-lg border p-3"
        >
          <p>
            {t(
              row.operation === "delete"
                ? "merchantUx.bookingOperations.deleted"
                : "merchantUx.bookingOperations.updated"
            )}
          </p>
          <p>
            {t("merchantUx.bookingOperations.actor", { id: row.actorUserId })}
          </p>
          {row.consentReview && (
            <p data-booking-consent-audit>
              {t("merchantUx.bookingConsent.audit", {
                id: row.consentReview.agreementId,
              })}
            </p>
          )}
          <p>
            {t("merchantUx.bookingOperations.before")}{" "}
            {labels[row.beforeStatus]}
          </p>
          {row.afterStatus && (
            <p>
              {t("merchantUx.bookingOperations.after")}{" "}
              {labels[row.afterStatus]}
            </p>
          )}
          <time dateTime={row.at}>
            {new Intl.DateTimeFormat(i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(row.at))}
          </time>
        </div>
      ))}
      <Button
        type="button"
        data-booking-operation-refresh
        className="min-h-11"
        disabled={busy || history.isFetching}
        onClick={async () => {
          if (inFlight.current) return;
          setError(false);
          try {
            await refresh();
            setSubmitted(false);
            setAttested(false);
            setStatus(booking.status);
          } catch {
            setError(true);
            setSubmitted(true);
          }
        }}
      >
        {t("merchantUx.bookingOperations.refresh")}
      </Button>
      <BookingCalendarSync bookingId={booking.id} onChanged={() => refresh()} />
      <BookingCancellation bookingId={booking.id} onChanged={() => refresh()} />
    </section>
  );
}
