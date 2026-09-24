import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export function AppointmentSyncReview({
  appointmentId,
  onChanged,
}: {
  appointmentId: number;
  onChanged: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.calendar.getSyncReview.useQuery(
    { appointmentId },
    { refetchOnWindowFocus: false, retry: false }
  );
  const mutation = trpc.calendar.reconcileSync.useMutation({ retry: false });
  const [eventId, setEventId] = useState(""),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [binding, setBinding] = useState(false);
  const [action, setAction] = useState<"restore_sync" | "confirm_cancellation">(
    "restore_sync"
  );
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [failed, setFailed] = useState(false),
    [outcome, setOutcome] = useState<string | null>(null);
  const flight = useRef(false);
  const data = query.data;
  const clear = () => {
    setReason("");
    setReviewed(false);
    setBinding(false);
    setSubmitted(false);
  };
  useEffect(() => {
    setOutcome(null);
    setFailed(false);
  }, [appointmentId]);
  useEffect(() => {
    clear();
    setEventId(data?.eventId || "");
    setAction(data?.canRestore ? "restore_sync" : "confirm_cancellation");
  }, [appointmentId, data?.evidence]);
  const refresh = async () => {
    if (flight.current) return;
    clear();
    setOutcome(null);
    setFailed(false);
    setBusy(true);
    try {
      const fresh = await query.refetch();
      if (fresh.isError) throw Error();
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (
      !data ||
      flight.current ||
      busy ||
      submitted ||
      query.isFetching ||
      query.isError ||
      !reviewed ||
      reason.trim().length < 10 ||
      !/^[a-zA-Z0-9_-]{5,255}$/.test(eventId) ||
      (data.needsManualBinding && (!binding || !data.canBind)) ||
      !(action === "restore_sync" ? data.canRestore : data.canCancel)
    )
      return;
    flight.current = true;
    setBusy(true);
    setSubmitted(true);
    setFailed(false);
    setOutcome(null);
    try {
      const result = await mutation.mutateAsync({
        appointmentId,
        requestId: crypto.randomUUID(),
        evidence: data.evidence,
        eventId,
        action,
        reviewed: true,
        bindingReviewed: data.needsManualBinding && binding,
        reason: reason.trim(),
      });
      const fresh = await query.refetch();
      if (fresh.isError) throw Error();
      await onChanged();
      setOutcome(result.outcome);
      setSubmitted(true);
      setReviewed(false);
      setBinding(false);
    } catch {
      setFailed(true);
      setReviewed(false);
      setBinding(false);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const labels: Record<string, string> = {
    verified_active: t("merchantUx.calendarReview.activeResult"),
    verified_cancelled: t("merchantUx.calendarReview.cancelledResult"),
    unverified: t("merchantUx.calendarReview.unverifiedResult"),
    ineligible: t("merchantUx.calendarReview.ineligible"),
    in_flight: t("merchantUx.calendarReview.inFlight"),
    target_unavailable: t("merchantUx.calendarReview.targetUnavailable"),
    provider_unavailable: t("merchantUx.calendarReview.providerUnavailable"),
    identity_mismatch: t("merchantUx.calendarReview.identityMismatch"),
    time_mismatch: t("merchantUx.calendarReview.timeMismatch"),
    event_not_active: t("merchantUx.calendarReview.notActive"),
    cancellation_unconfirmed: t("merchantUx.calendarReview.cancelUnconfirmed"),
  };
  const allowed =
    !!data &&
    (data.canRestore || data.canCancel) &&
    (!data.needsManualBinding || data.canBind);
  const locked = busy || query.isFetching || submitted || query.isError;
  return (
    <section
      data-appointment-review
      className="min-w-0 space-y-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">
          {t("merchantUx.calendarReview.title")}
        </h3>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          data-calendar-review-refresh
          disabled={busy || query.isFetching}
          onClick={refresh}
        >
          {t("merchantUx.calendarReview.refresh")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("merchantUx.calendarReview.scope")}
      </p>
      {query.isLoading && (
        <p role="status">{t("merchantUx.calendarReview.loading")}</p>
      )}
      {(query.isError || failed) && (
        <p role="alert" className="text-sm text-destructive">
          {t("merchantUx.calendarReview.failed")}
        </p>
      )}
      {outcome && (
        <p role="status" data-calendar-review-outcome className="text-sm">
          {labels[outcome]}
        </p>
      )}
      {data?.blocked && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {labels[data.blocked]}
        </p>
      )}
      {data?.needsManualBinding && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          {t("merchantUx.calendarReview.legacyScope")}
          {!data.canBind && (
            <> {t("merchantUx.calendarReview.bindPermission")}</>
          )}
        </p>
      )}
      {allowed && (
        <div data-calendar-review-form className="space-y-4">
          <label className="block text-sm">
            {t("merchantUx.calendarReview.action")}
            <select
              className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
              disabled={locked}
              value={action}
              onChange={e => {
                setAction(e.target.value as typeof action);
                setReviewed(false);
              }}
            >
              {data.canRestore && (
                <option value="restore_sync">
                  {t("merchantUx.calendarReview.restore")}
                </option>
              )}
              {data.canCancel && (
                <option value="confirm_cancellation">
                  {t("merchantUx.calendarReview.confirmCancel")}
                </option>
              )}
            </select>
          </label>
          <label className="block text-sm">
            {t("merchantUx.calendarReview.eventId")}
            <input
              data-calendar-review-event
              dir="ltr"
              className="mt-1 min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
              value={eventId}
              maxLength={255}
              disabled={locked || !!data.eventId}
              onChange={e => {
                setEventId(e.target.value.trim());
                setReviewed(false);
                setBinding(false);
              }}
            />
          </label>
          <label className="block text-sm">
            {t("merchantUx.calendarReview.reason")}
            <textarea
              data-calendar-review-reason
              className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              value={reason}
              maxLength={500}
              disabled={locked}
              onChange={e => {
                setReason(e.target.value);
                setReviewed(false);
                setBinding(false);
              }}
            />
          </label>
          {data.needsManualBinding && (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                data-calendar-review-binding
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={binding}
                disabled={locked}
                onChange={e => setBinding(e.target.checked)}
              />
              {t("merchantUx.calendarReview.bindAttest")}
            </label>
          )}
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              data-calendar-review-attest
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={reviewed}
              disabled={locked}
              onChange={e => setReviewed(e.target.checked)}
            />
            {t("merchantUx.calendarReview.attest")}
          </label>
          <Button
            type="button"
            data-calendar-review-submit
            className="min-h-11 w-full bg-emerald-800 text-white hover:bg-emerald-900 sm:w-auto"
            disabled={
              locked ||
              !reviewed ||
              reason.trim().length < 10 ||
              !/^[a-zA-Z0-9_-]{5,255}$/.test(eventId) ||
              (data.needsManualBinding && !binding)
            }
            onClick={submit}
          >
            {busy
              ? t("merchantUx.calendarReview.saving")
              : t("merchantUx.calendarReview.submit")}
          </Button>
        </div>
      )}
      {data && (
        <div data-calendar-review-history className="space-y-3 border-t pt-4">
          <h4 className="font-medium">
            {t("merchantUx.calendarReview.history")}
          </h4>
          {!data.history.length && (
            <p className="text-sm text-muted-foreground">
              {t("merchantUx.calendarReview.noHistory")}
            </p>
          )}
          {data.history.map(row => (
            <article
              key={row.revision}
              className="space-y-1 break-words rounded-lg bg-muted p-3 text-sm"
            >
              <p>
                {labels[row.outcome] ||
                  t("merchantUx.calendarReview.unverifiedResult")}
              </p>
              {row.failureCode && (
                <p>
                  {labels[row.failureCode] ||
                    t("merchantUx.calendarReview.unverifiedResult")}
                </p>
              )}
              <p>
                {t("merchantUx.calendarReview.actor", { id: row.actorUserId })}{" "}
                ·{" "}
                {new Date(row.at).toLocaleString(
                  i18n.language === "ar" ? "ar-SA" : "en-GB",
                  { timeZone: "Asia/Riyadh" }
                )}
              </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {row.reason}
              </p>
              {row.manualBinding && (
                <p>{t("merchantUx.calendarReview.manualBinding")}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
