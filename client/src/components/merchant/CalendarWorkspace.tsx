import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarDays, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  calendarWorkspaceInput,
  calendarWorkspaceSchema,
  calendarDetailsSchema,
  calendarStatuses,
  calendarSyncStates,
  type CalendarDetails,
} from "@shared/calendar-workspace";
import {
  calendarNavigation,
  calendarShift,
  calendarDays,
  riyadhDay,
  type CalendarView,
} from "@/lib/calendar-workspace";
import { bookingHref } from "@/lib/booking-workspace";
import { calendarWorkspaceLabels } from "@/lib/calendar-workspace-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppointmentSyncReview } from "@/components/AppointmentSyncReview";
import { AppointmentReminderReview } from "@/components/AppointmentReminderReview";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/service-catalog-workspace.css";
import "@/styles/booking-workspace.css";
import "@/styles/calendar-workspace.css";
import { AppointmentCreateWorkspace } from "./AppointmentCreateWorkspace";

export function CalendarWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    text = calendarWorkspaceLabels(t),
    [path, navigate] = useLocation(),
    search = useSearch(),
    nav = calendarNavigation(search),
    selection = nav.selection;
  const [filters, setFilters] = useState({
      q: selection?.search ?? "",
      status: selection?.status ?? "all",
      sync: selection?.sync ?? "all",
      from: selection?.startDate ?? "",
      to: selection?.endDate ?? "",
    }),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const v = calendarNavigation(search).selection;
    if (v)
      setFilters({
        q: v.search,
        status: v.status,
        sync: v.sync,
        from: v.startDate,
        to: v.endDate,
      });
    setInvalid(false);
  }, [search]);
  const query = trpc.calendar.workspace.useQuery(
    selection ?? { startDate: riyadhDay(), endDate: riyadhDay() },
    {
      enabled: !!selection && nav.appointment === null,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const parsed = calendarWorkspaceSchema.safeParse(query.data),
    data =
      !query.error &&
      parsed.success &&
      parsed.data.actorId === actorId &&
      parsed.data.merchantId === merchantId &&
      JSON.stringify(parsed.data.selection) === JSON.stringify(selection)
        ? parsed.data
        : null;
  const change = (patch: Record<string, string | number | null>) =>
    navigate(bookingHref(path, search, patch));
  const reset = () =>
    change({
      q: null,
      status: null,
      sync: null,
      service: null,
      staff: null,
      page: null,
      appointment: null,
      create: null,
      request: null,
      view: null,
      date: null,
      from: null,
      to: null,
    });
  if (!selection || nav.appointment === "invalid")
    return <WorkspaceState kind="error" onRetry={reset} />;
  if (nav.appointment !== null)
    return (
      <CalendarDetail
        key={`${actorId}:${merchantId}:${nav.appointment}`}
        actorId={actorId}
        merchantId={merchantId}
        id={nav.appointment}
        back={() => change({ appointment: null })}
      />
    );
  if (nav.create)
    return (
      <AppointmentCreateWorkspace
        key={`${actorId}:${merchantId}:new`}
        actorId={actorId}
        merchantId={merchantId}
        canManage={!!data?.canManage}
        current={!!data && !query.isFetching}
        requestId={nav.requestId}
        retainRequest={id => change({ request: id })}
        refresh={() => {
          void query.refetch();
        }}
        leave={() => change({ create: null, request: null })}
        openAppointment={id =>
          change({ create: null, request: null, appointment: id })
        }
      />
    );
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  if (!data)
    return (
      <WorkspaceState
        kind={query.isFetching ? "loading" : "error"}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  const number = (v: number) => new Intl.NumberFormat(i18n.language).format(v),
    dayLabel = (v: string) =>
      new Intl.DateTimeFormat(i18n.language, {
        calendar: "gregory",
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(v + "T00:00:00Z"));
  const period = (view: CalendarView, anchor = nav.anchor) =>
    change({
      view,
      date: anchor,
      from: null,
      to: null,
      page: null,
      appointment: null,
    });
  const counts = new Map(data.days.map(day => [day.date, day.total])),
    needs =
      data.summary.sync.legacy +
      data.summary.sync.unknown +
      data.summary.sync.create_unknown +
      data.summary.sync.cancel_unknown;
  return (
    <div
      className="service-catalog calendar-workspace"
      data-calendar-page
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sc-header">
        <div>
          <p className="sc-eyebrow">{text("eyebrow")}</p>
          <h1>{text("title")}</h1>
          <p>{text("description")}</p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          <RefreshCw aria-hidden="true" />
          {text("refresh")}
        </Button>
      </header>
      <nav className="sc-nav">
        {data.canManage && (
          <Button
            onClick={() =>
              change({ create: "1", request: null, appointment: null })
            }
          >
            {t("merchantUx.appointmentCreate.title")}
          </Button>
        )}
        <Link href="/merchant/bookings">{text("bookings")}</Link>
        <Link href="/merchant/services">{text("services")}</Link>
        <Link href="/merchant/staff">{text("providers")}</Link>
        {data.canManageIntegration && (
          <Link href="/merchant/calendar/settings">{text("settings")}</Link>
        )}
      </nav>
      {!data.canManage && <p className="sc-feedback">{text("readOnly")}</p>}
      <section>
        <dl className="sc-summary">
          <div>
            <dt>{text("total")}</dt>
            <dd>{number(data.summary.total)}</dd>
          </div>
          <div>
            <dt>{text("confirmed")}</dt>
            <dd>{number(data.summary.counts.confirmed)}</dd>
          </div>
          <div>
            <dt>{text("reviewCount")}</dt>
            <dd>{number(needs)}</dd>
          </div>
        </dl>
        <p className="sc-muted bw-summary-hint">{text("summaryHint")}</p>
      </section>
      <section className="bw-panel">
        <div className="cw-period">
          <h2>
            <bdi>
              {selection.startDate} — {selection.endDate}
            </bdi>
          </h2>
          <div className="cw-actions">
            {nav.view !== "range" && (
              <Button
                variant="outline"
                onClick={() =>
                  period(nav.view!, calendarShift(nav.anchor, nav.view!, -1))
                }
              >
                {text("previousPeriod")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() =>
                period(nav.view === "range" ? "month" : nav.view!, riyadhDay())
              }
            >
              {text("today")}
            </Button>
            {nav.view !== "range" && (
              <Button
                variant="outline"
                onClick={() =>
                  period(nav.view!, calendarShift(nav.anchor, nav.view!, 1))
                }
              >
                {text("nextPeriod")}
              </Button>
            )}
          </div>
        </div>
        <div className="cw-views" aria-label={text("overview")}>
          {(["month", "week", "day"] as const).map(view => (
            <Button
              key={view}
              variant="outline"
              aria-pressed={nav.view === view}
              onClick={() => period(view)}
            >
              {text(view)}
            </Button>
          ))}
        </div>
        <p className="sc-muted">{text("timeHint")}</p>
        <details>
          <summary className="cw-attestation">{text("overview")}</summary>
          <p className="sc-muted">{text("dayHint")}</p>
          <div className="cw-days">
            {calendarDays(selection.startDate, selection.endDate).map(day => (
              <button
                key={day}
                type="button"
                data-active={!!counts.get(day)}
                onClick={() => period("day", day)}
                aria-label={
                  dayLabel(day) +
                  " · " +
                  text("dayCount", { count: counts.get(day) ?? 0 })
                }
              >
                <time dateTime={day}>{dayLabel(day)}</time>
                <strong>{number(counts.get(day) ?? 0)}</strong>
                <small>{text("view")}</small>
              </button>
            ))}
          </div>
        </details>
      </section>
      <section className="sc-list">
        <form
          className="cw-filters"
          onSubmit={event => {
            event.preventDefault();
            const value = calendarWorkspaceInput.safeParse({
              search: filters.q,
              status: filters.status,
              sync: filters.sync,
              startDate: filters.from,
              endDate: filters.to,
            });
            if (!value.success) {
              setInvalid(true);
              return;
            }
            const custom =
              filters.from !== selection.startDate ||
              filters.to !== selection.endDate;
            change({
              q: filters.q,
              status: filters.status,
              sync: filters.sync,
              page: null,
              ...(custom
                ? {
                    view: "range",
                    from: filters.from,
                    to: filters.to,
                    date: filters.from,
                  }
                : {}),
            });
          }}
        >
          <label className="cw-search">
            <span>{text("search")}</span>
            <input
              maxLength={200}
              value={filters.q}
              placeholder={text("searchHint")}
              onChange={e => setFilters(v => ({ ...v, q: e.target.value }))}
            />
          </label>
          <label>
            <span>{text("status")}</span>
            <select
              value={filters.status}
              onChange={e =>
                setFilters(v => ({
                  ...v,
                  status: e.target.value as typeof v.status,
                }))
              }
            >
              {(["all", ...calendarStatuses] as const).map(v => (
                <option key={v} value={v}>
                  {text(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text("sync")}</span>
            <select
              value={filters.sync}
              onChange={e =>
                setFilters(v => ({
                  ...v,
                  sync: e.target.value as typeof v.sync,
                }))
              }
            >
              {(["all", ...calendarSyncStates] as const).map(v => (
                <option key={v} value={v}>
                  {text(v)}
                </option>
              ))}
            </select>
          </label>
          {(["from", "to"] as const).map(key => (
            <label key={key}>
              <span>{text(key)}</span>
              <input
                type="date"
                value={filters[key]}
                aria-invalid={invalid}
                onInput={e => {
                  const value = e.currentTarget.value;
                  setFilters(v => ({ ...v, [key]: value }));
                  setInvalid(false);
                }}
                onChange={e => {
                  setFilters(v => ({ ...v, [key]: e.target.value }));
                  setInvalid(false);
                }}
              />
            </label>
          ))}
          <Button type="submit">{text("apply")}</Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {text("clear")}
          </Button>
        </form>
        {invalid && (
          <p className="sc-feedback" role="alert">
            {text("filterError")}
          </p>
        )}
        {(selection.serviceId || selection.staffId) && (
          <p className="sc-feedback">
            {selection.serviceId && (
              <span>
                {text("service")} #{selection.serviceId}{" "}
              </span>
            )}
            {selection.staffId && (
              <span>
                {text("staff")} #{selection.staffId}
              </span>
            )}
          </p>
        )}
        <p className="sc-results" role="status">
          {query.isFetching
            ? text("loadingUpdate")
            : text("results", { count: data.summary.total })}
        </p>
        {!data.rows.length ? (
          <div className="sc-empty">
            <CalendarDays aria-hidden="true" />
            <h2>{text(selection.page > 1 ? "outOfRange" : "empty")}</h2>
            <p>{text("emptyHint")}</p>
            {selection.page > 1 && (
              <Button onClick={() => change({ page: null })}>
                {text("first")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="sc-records">
            {data.rows.map(row => (
              <li
                key={row.id}
                className="sc-record"
                data-appointment-id={row.id}
              >
                <div className="sc-record-title">
                  <div>
                    <p className="sc-muted">
                      {text("appointmentNumber", { id: row.id })}
                    </p>
                    <h2>
                      {row.customerName || row.customerPhone || text("notSet")}
                    </h2>
                  </div>
                  <Badge>{text(row.status)}</Badge>
                </div>
                <p>{row.service.name ?? text("unavailable")}</p>
                <dl className="sc-facts bw-facts">
                  <div>
                    <dt>{text("date")}</dt>
                    <dd className="cw-time">
                      <bdi>
                        {row.date}
                        <br />
                        {row.startTime ?? "—"} — {row.endTime ?? "—"}
                      </bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>{text("staff")}</dt>
                    <dd>
                      {row.staff
                        ? (row.staff.name ?? text("unavailable"))
                        : text("notSet")}
                    </dd>
                  </div>
                  <div>
                    <dt>{text("customerPhone")}</dt>
                    <dd>
                      <bdi>{row.customerPhone ?? text("notSet")}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>{text("sync")}</dt>
                    <dd>{text(row.sync)}</dd>
                  </div>
                </dl>
                {row.issues.length > 0 && (
                  <p className="sc-repair">{text("issues")}</p>
                )}
                <div className="sc-record-actions">
                  <Button
                    variant="outline"
                    data-calendar-open={row.id}
                    onClick={() => change({ appointment: row.id })}
                  >
                    {text("view")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.pagination.pages > 0 && (
          <nav className="sc-pagination" aria-label={text("title")}>
            <Button
              variant="outline"
              disabled={selection.page <= 1 || query.isFetching}
              onClick={() => change({ page: selection.page - 1 })}
            >
              {text("previous")}
            </Button>
            <span>
              {text("page", {
                page: number(selection.page),
                pages: number(data.pagination.pages),
              })}
            </span>
            <Button
              variant="outline"
              disabled={
                selection.page >= data.pagination.pages || query.isFetching
              }
              onClick={() => change({ page: selection.page + 1 })}
            >
              {text("next")}
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
function CalendarDetail({
  actorId,
  merchantId,
  id,
  back,
}: {
  actorId: number;
  merchantId: number;
  id: number;
  back: () => void;
}) {
  const { t, i18n } = useTranslation(),
    text = calendarWorkspaceLabels(t),
    utils = trpc.useUtils(),
    [open, setOpen] = useState(false),
    heading = useRef<HTMLHeadingElement>(null);
  const query = trpc.calendar.details.useQuery(
      { appointmentId: id },
      {
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
      }
    ),
    parsed = calendarDetailsSchema.safeParse(query.data);
  const data =
    !query.error &&
    parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId &&
    parsed.data.selection.appointmentId === id
      ? parsed.data
      : null;
  useEffect(() => {
    if (data) heading.current?.focus({ preventScroll: true });
  }, [!!data, id]);
  const refresh = async () => {
    await utils.calendar.workspace.invalidate();
    await utils.calendar.getSyncReview.invalidate({ appointmentId: id });
    await utils.calendar.getReminderReview.invalidate({ appointmentId: id });
    const result = await query.refetch(),
      value = calendarDetailsSchema.safeParse(result.data);
    if (
      result.error ||
      !value.success ||
      value.data.actorId !== actorId ||
      value.data.merchantId !== merchantId ||
      value.data.selection.appointmentId !== id
    )
      throw Error("Appointment unavailable");
    return value.data;
  };
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  if (!data)
    return (
      <WorkspaceState
        kind={query.isFetching ? "loading" : "error"}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  const a = data.appointment,
    fact = (key: Parameters<typeof text>[0], value: ReactNode) => (
      <div key={key}>
        <dt>{text(key)}</dt>
        <dd>{value ?? text("notSet")}</dd>
      </div>
    ),
    date = (v: string | null) =>
      v
        ? new Intl.DateTimeFormat(i18n.language, {
            calendar: "gregory",
            timeZone: "Asia/Riyadh",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(v))
        : text("notSet");
  return (
    <div
      className="service-catalog calendar-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
      data-calendar-details
    >
      <header className="sc-header">
        <div>
          <Button variant="ghost" onClick={back}>
            {text("back")}
          </Button>
          <p className="sc-eyebrow">{text("details")}</p>
          <h1 ref={heading} tabIndex={-1}>
            {text("appointmentNumber", { id })}
          </h1>
          <div className="cw-actions">
            <Badge>{text(a.status)}</Badge>
            <Badge variant="secondary">{text(a.sync)}</Badge>
          </div>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          <RefreshCw aria-hidden="true" />
          {text("refresh")}
        </Button>
      </header>
      {!data.canManage && <p className="sc-feedback">{text("readOnly")}</p>}
      {a.issues.length > 0 && (
        <p className="sc-feedback" role="status">
          {text("issues")}
        </p>
      )}
      <section className="bw-panel">
        <h2>{text("customerSection")}</h2>
        <dl className="bw-detail-facts">
          {fact("customerName", a.customerName)}
          {fact("customerPhone", <bdi>{a.customerPhone}</bdi>)}
          {fact("service", a.service.name ?? text("unavailable"))}
          {fact(
            "staff",
            a.staff ? (a.staff.name ?? text("unavailable")) : null
          )}
          {fact("date", a.date)}
          {fact("startTime", a.startTime)}
          {fact("endTime", a.endTime)}
        </dl>
        <p className="sc-muted">{text("timeHint")}</p>
      </section>
      <section className="bw-panel">
        <h2>{text("notes")}</h2>
        <p className="bw-notes">{a.notes || text("notSet")}</p>
        {a.cancellationReason && (
          <dl className="bw-detail-facts">
            {fact("cancellationReason", a.cancellationReason)}
          </dl>
        )}
      </section>
      {data.canManage && (
        <details
          className="bw-panel"
          open={open}
          onToggle={e => setOpen(e.currentTarget.open)}
        >
          <summary>{text("manage")}</summary>
          <p className="sc-muted">{text("manageHint")}</p>
          {open && (
            <>
              <CalendarCancellation
                key={id}
                data={data}
                fetching={query.isFetching}
                refresh={refresh}
              />
              <AppointmentSyncReview appointmentId={id} onChanged={refresh} />
              <AppointmentReminderReview appointmentId={id} />
            </>
          )}
        </details>
      )}
      <details className="bw-panel">
        <summary>{text("advanced")}</summary>
        <p className="sc-muted">{text("storedHint")}</p>
        <dl className="bw-detail-facts">
          {fact("googleEventId", a.googleEventId)}
          {fact("integrationId", a.integrationId)}
          {fact("calendarTargetId", a.calendarTargetId)}
          {fact("eventReference", a.eventReference)}
          {fact("reviewRevision", a.reviewRevision)}
          {(["reminder24hSent", "reminder1hSent"] as const).map(key =>
            fact(
              key,
              a[key] === null ? text("unknown") : text(a[key] ? "yes" : "no")
            )
          )}
          {fact("createdAt", date(a.createdAt))}
          {fact("updatedAt", date(a.updatedAt))}
        </dl>
      </details>
    </div>
  );
}
function CalendarCancellation({
  data,
  fetching,
  refresh,
}: {
  data: CalendarDetails;
  fetching: boolean;
  refresh: () => Promise<CalendarDetails>;
}) {
  const { t } = useTranslation(),
    text = calendarWorkspaceLabels(t),
    mutation = trpc.calendar.cancelAppointment.useMutation({ retry: false }),
    [attested, setAttested] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState<"uncertain" | "success" | null>(null),
    flight = useRef(false),
    active = useRef(true),
    a = data.appointment;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setAttested(false);
  }, [a.updatedAt, a.status, a.sync, fetching]);
  const submit = async () => {
    if (
      flight.current ||
      busy ||
      fetching ||
      !attested ||
      outcome === "uncertain"
    )
      return;
    flight.current = true;
    setBusy(true);
    setAttested(false);
    try {
      await mutation.mutateAsync({
        appointmentId: a.id,
        reason: reason.trim() || undefined,
      });
      if (!active.current) return;
      const result = await refresh();
      if (active.current)
        setOutcome(
          result.appointment.status === "cancelled" ? "success" : "uncertain"
        );
    } catch {
      if (active.current) setOutcome("uncertain");
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  };
  const recover = async () => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    try {
      const result = await refresh();
      if (active.current)
        setOutcome(
          result.appointment.status === "cancelled" ? "success" : null
        );
    } catch {
      if (active.current) setOutcome("uncertain");
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <div className="cw-detail-actions">
      {outcome && (
        <p role="status" className="sc-feedback">
          {text(outcome === "success" ? "cancelledSuccess" : "uncertain")}
        </p>
      )}
      {outcome === "uncertain" && (
        <Button disabled={busy} variant="outline" onClick={recover}>
          {text("refresh")}
        </Button>
      )}
      {["pending", "confirmed"].includes(a.status) &&
        ["none", "synced"].includes(a.sync) && (
          <>
            <label className="bw-field">
              <span>{text("cancelReason")}</span>
              <textarea
                className="cw-cancel-reason"
                maxLength={2000}
                value={reason}
                disabled={busy || fetching || outcome === "uncertain"}
                onChange={e => setReason(e.target.value)}
              />
            </label>
            <label className="cw-attestation">
              <input
                type="checkbox"
                data-calendar-cancel-attest
                checked={attested}
                disabled={busy || fetching || outcome === "uncertain"}
                onChange={e => setAttested(e.target.checked)}
              />
              <span>{text("cancelAttest")}</span>
            </label>
            <div className="cw-actions">
              <Button
                variant="destructive"
                data-calendar-cancel
                disabled={
                  !attested || busy || fetching || outcome === "uncertain"
                }
                onClick={submit}
              >
                {text(busy ? "cancellingAction" : "cancel")}
              </Button>
            </div>
          </>
        )}
    </div>
  );
}
