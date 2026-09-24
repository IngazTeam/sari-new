import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatesSetArg } from "@fullcalendar/core";
import { useTranslation } from "react-i18next";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import arLocale from "@fullcalendar/core/locales/ar";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AppointmentSyncReview } from "@/components/AppointmentSyncReview";

const todayInRiyadh = () =>
  new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export default function CalendarPage() {
  const { t, i18n } = useTranslation(),
    arabic = i18n.language.startsWith("ar");
  const [range, setRange] = useState(() => {
    const day = todayInRiyadh();
    return {
      startDate: day.slice(0, 7) + "-01",
      endDate: new Date(
        Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)
      )
        .toISOString()
        .slice(0, 10),
    };
  });
  const [selected, setSelected] = useState<number | null>(null),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(false),
    [shown, setShown] = useState(20);
  const visibleRange = useRef(range);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 639px)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const changeRange = useCallback((info: DatesSetArg) => {
    const next = {
      startDate: info.startStr.slice(0, 10),
      endDate: new Date(info.end.getTime() - 86400000)
        .toISOString()
        .slice(0, 10),
    };
    if (
      visibleRange.current.startDate === next.startDate &&
      visibleRange.current.endDate === next.endDate
    )
      return;
    visibleRange.current = next;
    setRange(next);
    setSelected(null);
    setAttested(false);
    setShown(20);
  }, []);
  const query = trpc.calendar.listAppointments.useQuery(range, {
    refetchOnWindowFocus: false,
    retry: false,
  });
  const status = trpc.calendar.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });
  const cancel = trpc.calendar.cancelAppointment.useMutation({ retry: false });
  const appointments = query.data?.appointments || [],
    current = appointments.find(row => row.id === selected);
  const cancelInFlight = useRef(false),
    details = useRef<HTMLElement>(null);
  useEffect(
    () => setAttested(false),
    [
      current?.id,
      current?.status,
      current?.calendarSyncState,
      current?.appointmentDate,
      current?.startTime,
    ]
  );
  useEffect(() => {
    if (selected !== null) {
      details.current?.focus({ preventScroll: true });
      details.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }, [selected]);
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isError) throw Error("Refresh failed");
    setAttested(false);
  };
  const remove = async () => {
    if (
      !current ||
      !attested ||
      busy ||
      cancel.isPending ||
      cancelInFlight.current
    )
      return;
    cancelInFlight.current = true;
    setBusy(true);
    setFailure(false);
    setAttested(false);
    try {
      await cancel.mutateAsync({ appointmentId: current.id });
      await refresh();
    } catch {
      setFailure(true);
    } finally {
      cancelInFlight.current = false;
      setBusy(false);
    }
  };
  const statuses: Record<string, string> = {
    pending: t("merchantUx.calendarPage.pending"),
    confirmed: t("merchantUx.calendarPage.confirmed"),
    cancelled: t("merchantUx.calendarPage.cancelled"),
    completed: t("merchantUx.calendarPage.completed"),
    no_show: t("merchantUx.calendarPage.noShow"),
  };
  const sync: Record<string, string> = {
    none: t("merchantUx.calendarPage.local"),
    synced: t("merchantUx.calendarPage.synced"),
    cancelled: t("merchantUx.calendarPage.cancelled"),
    creating: t("merchantUx.calendarPage.syncPending"),
    cancelling: t("merchantUx.calendarPage.syncPending"),
    create_unknown: t("merchantUx.calendarPage.needsReview"),
    cancel_unknown: t("merchantUx.calendarPage.needsReview"),
    legacy: t("merchantUx.calendarPage.needsReview"),
  };
  // Calendar positions are Riyadh wall times; no conversion through the visitor's timezone.
  const events = useMemo(
    () =>
      appointments.map(row => ({
        id: String(row.id),
        title: `${row.customerName || row.customerPhone} · ${row.serviceName || ""}`,
        start: `${row.appointmentDate}T${row.startTime}:00`,
        end: `${row.appointmentDate}T${row.endTime}:00`,
        backgroundColor:
          row.status === "cancelled"
            ? "#64748b"
            : row.calendarSyncState.includes("unknown") ||
                row.calendarSyncState === "legacy"
              ? "#a16207"
              : "#166534",
        borderColor: "transparent",
      })),
    [query.data]
  );
  const open = (id: number) => {
    setSelected(id);
    setAttested(false);
    setFailure(false);
  };
  return (
    <main
      data-calendar-page
      dir={arabic ? "rtl" : "ltr"}
      className="mx-auto w-full min-w-0 max-w-7xl space-y-5 p-3 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t("merchantUx.calendarPage.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("merchantUx.calendarPage.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={query.isFetching || busy}
          onClick={() => {
            setFailure(false);
            void refresh().catch(() => setFailure(true));
          }}
        >
          {t("merchantUx.calendarPage.refresh")}
        </Button>
      </header>
      {status.isError && (
        <p role="alert">{t("merchantUx.calendarPage.connectionError")}</p>
      )}
      {status.data && !status.data.connected && (
        <aside className="rounded-xl border bg-muted p-4 text-sm">
          <p>{t("merchantUx.calendarPage.disconnected")}</p>
          {query.data?.canManageIntegration && (
            <a
              className="mt-2 inline-flex min-h-11 items-center underline"
              href="/merchant/calendar/settings"
            >
              {t("merchantUx.calendarPage.settings")}
            </a>
          )}
        </aside>
      )}
      {(query.isError || failure) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          {t("merchantUx.calendarPage.failed")}
        </p>
      )}
      {query.isLoading && (
        <p role="status">{t("merchantUx.calendarPage.loading")}</p>
      )}
      {query.data?.truncated && (
        <p role="alert">{t("merchantUx.calendarPage.truncated")}</p>
      )}
      {query.data && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              [t("merchantUx.calendarPage.total"), query.data.stats.total],
              [statuses.confirmed, query.data.stats.confirmed],
              [statuses.pending, query.data.stats.pending],
              [statuses.cancelled, query.data.stats.cancelled],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold">
                {value.toLocaleString(arabic ? "ar-SA" : "en-GB")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <section
        aria-label={t("merchantUx.calendarPage.calendar")}
        className="min-w-0 rounded-xl border bg-background p-2 sm:p-4 [&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-2 [&_.fc-toolbar-title]:!text-lg [&_.fc-button]:min-h-11 [&_.fc-button]:!text-xs [&_.fc-event-title]:truncate [&_.fc-col-header-cell-cushion]:!px-0 [&_.fc-col-header-cell-cushion]:!text-xs"
      >
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate={todayInRiyadh()}
          timeZone="UTC"
          locales={[arLocale]}
          locale={arabic ? "ar" : "en"}
          direction={arabic ? "rtl" : "ltr"}
          height="auto"
          dayMaxEvents={3}
          dayHeaderFormat={{ weekday: compact ? "narrow" : "short" }}
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          eventClick={info => open(Number(info.event.id))}
          datesSet={changeRange}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t("merchantUx.calendarPage.list")}
        </h2>
        {!query.isLoading && !query.isError && !appointments.length && (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            {t("merchantUx.calendarPage.empty")}
          </p>
        )}
        {appointments.slice(0, shown).map(row => (
          <article
            key={row.id}
            className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1 space-y-2 break-words">
              <h3 className="font-medium">
                {row.customerName || row.customerPhone}
              </h3>
              <p className="text-sm">
                {row.serviceName || t("merchantUx.calendarPage.unknownService")}{" "}
                · {row.staffName || t("merchantUx.calendarPage.unassigned")}
              </p>
              <p className="text-sm">
                <time dateTime={row.appointmentDate}>
                  {row.appointmentDate}
                </time>{" "}
                ·{" "}
                <bdi>
                  {row.startTime} – {row.endTime}
                </bdi>
              </p>
              <p className="text-sm text-muted-foreground">
                {statuses[row.status]} ·{" "}
                {sync[row.calendarSyncState] ||
                  t("merchantUx.calendarPage.needsReview")}
              </p>
            </div>
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              variant="outline"
              data-calendar-open={row.id}
              onClick={() => open(row.id)}
            >
              {t("merchantUx.calendarPage.details")}
            </Button>
          </article>
        ))}
        {shown < appointments.length && (
          <Button
            type="button"
            className="min-h-11"
            variant="outline"
            onClick={() => setShown(shown + 20)}
          >
            {t("merchantUx.calendarPage.more")}
          </Button>
        )}
      </section>
      {current && (
        <section
          ref={details}
          tabIndex={-1}
          data-calendar-details
          className="space-y-4 rounded-xl border p-4"
          aria-label={t("merchantUx.calendarPage.details")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">
              {current.customerName || current.customerPhone}
            </h2>
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              {t("merchantUx.calendarPage.close")}
            </Button>
          </div>
          <p>
            <bdi>{current.customerPhone}</bdi> · {current.appointmentDate} ·{" "}
            <bdi>
              {current.startTime} – {current.endTime}
            </bdi>
          </p>
          <p>
            {statuses[current.status]} · {sync[current.calendarSyncState]}
          </p>
          {query.data?.canManage &&
            ["pending", "confirmed"].includes(current.status) &&
            ["none", "synced"].includes(current.calendarSyncState) && (
              <div className="space-y-3 border-t pt-3">
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    data-calendar-cancel-attest
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={attested}
                    disabled={busy || query.isFetching}
                    onChange={e => setAttested(e.target.checked)}
                  />
                  {t("merchantUx.calendarPage.cancelAttest")}
                </label>
                <Button
                  type="button"
                  data-calendar-cancel
                  variant="destructive"
                  className="min-h-11 bg-red-700 text-white hover:bg-red-800"
                  disabled={!attested || busy || query.isFetching}
                  onClick={remove}
                >
                  {busy
                    ? t("merchantUx.calendarPage.cancelling")
                    : t("merchantUx.calendarPage.cancel")}
                </Button>
              </div>
            )}
          {query.data?.canManage && (
            <AppointmentSyncReview
              key={current.id}
              appointmentId={current.id}
              onChanged={refresh}
            />
          )}
        </section>
      )}
    </main>
  );
}
