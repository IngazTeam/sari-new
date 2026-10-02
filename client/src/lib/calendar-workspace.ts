import {
  calendarWorkspaceInput,
  calendarDetailsInput,
} from "@shared/calendar-workspace";
import { serviceBookingDate } from "@shared/service-details-workspace";
import { appointmentRequestLookupSchema } from "@shared/appointment-request";
export type CalendarView = "month" | "week" | "day" | "range";
export const riyadhDay = (now = new Date()) =>
  new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
const stamp = (value: string) => new Date(value + "T00:00:00Z");
const day = (value: Date) => value.toISOString().slice(0, 10);
export function calendarPeriod(
  anchor: string,
  view: Exclude<CalendarView, "range">
) {
  const start = stamp(serviceBookingDate.parse(anchor)),
    end = stamp(anchor);
  if (view === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  if (view === "week") {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    end.setTime(start.getTime() + 6 * 86400000);
  }
  return { startDate: day(start), endDate: day(end) };
}
export function calendarNavigation(search: string, now = new Date()) {
  const p = new URLSearchParams(search),
    rawView = p.get("view") ?? "month",
    view = (
      ["month", "week", "day", "range"].includes(rawView) ? rawView : null
    ) as CalendarView | null,
    anchor = p.get("date") ?? riyadhDay(now);
  const positive = (v: string | null) =>
    v === null ? undefined : /^[1-9]\d*$/.test(v) ? Number(v) : NaN;
  const date = serviceBookingDate.safeParse(anchor),
    range =
      view && date.success
        ? view === "range"
          ? { startDate: p.get("from"), endDate: p.get("to") }
          : calendarPeriod(anchor, view)
        : {};
  const parsed = calendarWorkspaceInput.safeParse({
    ...range,
    search: p.get("q") ?? "",
    status: p.get("status") ?? "all",
    sync: p.get("sync") ?? "all",
    serviceId: positive(p.get("service")),
    staffId: positive(p.get("staff")),
    page: positive(p.get("page")),
  });
  const selected = p.get("appointment"),
    identity = calendarDetailsInput.safeParse({
      appointmentId: positive(selected),
    });
  const create = p.get("create"),
    request = p.get("request");
  const parsedRequest =
    request === null
      ? null
      : appointmentRequestLookupSchema.safeParse({ requestId: request });
  const duplicates = [
    "view",
    "date",
    "from",
    "to",
    "q",
    "status",
    "sync",
    "service",
    "staff",
    "page",
    "appointment",
    "create",
    "request",
  ].some(key => p.getAll(key).length > 1);
  return {
    selection:
      !duplicates &&
      (create === null || create === "1") &&
      (create !== null || request === null) &&
      (!parsedRequest || parsedRequest.success) &&
      !(create && selected) &&
      view &&
      date.success &&
      parsed.success
        ? parsed.data
        : null,
    view,
    anchor,
    create: create === "1",
    requestId: parsedRequest?.success ? parsedRequest.data.requestId : null,
    appointment:
      selected === null
        ? null
        : identity.success
          ? identity.data.appointmentId
          : ("invalid" as const),
  };
}
export function calendarShift(
  anchor: string,
  view: CalendarView,
  step: number
) {
  const value = stamp(anchor);
  if (view === "month") {
    value.setUTCDate(1);
    value.setUTCMonth(value.getUTCMonth() + step);
  } else
    value.setUTCDate(value.getUTCDate() + step * (view === "week" ? 7 : 1));
  return day(value);
}
export function calendarDays(start: string, end: string) {
  const days: string[] = [];
  for (
    let date = Date.parse(start + "T00:00:00Z");
    date <= Date.parse(end + "T00:00:00Z") && days.length < 93;
    date += 86400000
  )
    days.push(day(new Date(date)));
  return days;
}
