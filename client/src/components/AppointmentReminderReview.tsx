import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export function AppointmentReminderReview({
  appointmentId,
}: {
  appointmentId: number;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.calendar.getReminderReview.useQuery(
    { appointmentId },
    { retry: false, refetchOnWindowFocus: false }
  );
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const flight = useRef(false);
  useEffect(() => {
    setFailed(false);
  }, [appointmentId]);
  const refresh = async () => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if ((await query.refetch()).isError) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const date = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(
          i18n.language.startsWith("ar") ? "ar-SA" : "en-GB",
          {
            timeZone: "Asia/Riyadh",
            calendar: "gregory",
            dateStyle: "medium",
            timeStyle: "short",
          }
        ).format(new Date(value))
      : t("merchantUx.appointmentReminders.unverified");
  const states: Record<string, string> = {
    pending: t("merchantUx.appointmentReminders.pending"),
    dispatching: t("merchantUx.appointmentReminders.dispatching"),
    unknown: t("merchantUx.appointmentReminders.unknown"),
    accepted: t("merchantUx.appointmentReminders.accepted"),
    failed: t("merchantUx.appointmentReminders.rejected"),
    suppressed: t("merchantUx.appointmentReminders.suppressed"),
  };
  const deliveries: Record<string, string> = {
    none: t("merchantUx.appointmentReminders.noReceipt"),
    queued: t("merchantUx.appointmentReminders.unknown"),
    sent: t("merchantUx.appointmentReminders.accepted"),
    delivered: t("merchantUx.appointmentReminders.delivered"),
    read: t("merchantUx.appointmentReminders.read"),
    failed: t("merchantUx.appointmentReminders.deliveryFailed"),
  };
  return (
    <section
      data-appointment-reminders
      className="min-w-0 space-y-3 rounded-xl border bg-background p-4 text-foreground"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold">
          {t("merchantUx.appointmentReminders.title")}
        </h3>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 max-w-full whitespace-normal"
          disabled={busy || query.isFetching}
          onClick={refresh}
        >
          {t("merchantUx.appointmentReminders.refresh")}
        </Button>
      </div>
      <p className="text-sm leading-relaxed">
        {t("merchantUx.appointmentReminders.scope")}
      </p>
      <p className="text-sm leading-relaxed">
        {t("merchantUx.appointmentReminders.conditions")}
      </p>
      {query.isLoading ? (
        <p role="status">{t("merchantUx.appointmentReminders.loading")}</p>
      ) : query.isError || failed ? (
        <p role="alert">{t("merchantUx.appointmentReminders.loadFailed")}</p>
      ) : (
        query.data && (
          <div className="space-y-3" aria-busy={query.isFetching || busy}>
            {!query.data.reminders.length && (
              <p data-reminder-empty>
                {t("merchantUx.appointmentReminders.empty")}
              </p>
            )}
            {query.data.reminders.map(reminder => (
              <article
                key={reminder.id}
                data-reminder-row
                className="min-w-0 space-y-2 rounded-lg border p-3 [overflow-wrap:anywhere]"
              >
                <p className="font-semibold">
                  {t("merchantUx.appointmentReminders.reference", {
                    id: appointmentId,
                    hours: reminder.hours,
                  })}
                </p>
                <p data-reminder-state={reminder.state}>
                  {states[reminder.state] || states.unknown}
                </p>
                <p>
                  {t("merchantUx.appointmentReminders.delivery", {
                    status:
                      deliveries[reminder.delivery] ||
                      t("merchantUx.appointmentReminders.unverified"),
                  })}
                </p>
                <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt>{t("merchantUx.appointmentReminders.due")}</dt>
                  <dd>{date(reminder.dueAt)}</dd>
                  <dt>{t("merchantUx.appointmentReminders.expires")}</dt>
                  <dd>{date(reminder.expiresAt)}</dd>
                </dl>
                {reminder.cancelled && (
                  <p>{t("merchantUx.appointmentReminders.cancelled")}</p>
                )}
                {reminder.attention && (
                  <p role="status">
                    {t("merchantUx.appointmentReminders.attention")}
                  </p>
                )}
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                    {t("merchantUx.appointmentReminders.source")}
                  </summary>
                  <p dir="auto" className="whitespace-pre-wrap text-sm">
                    {reminder.sourceText ||
                      t("merchantUx.appointmentReminders.unverified")}
                  </p>
                </details>
              </article>
            ))}
          </div>
        )
      )}
    </section>
  );
}
