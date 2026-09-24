/** Calendar evidence is untrusted: Date.parse alone accepts rolled dates and local times. */
const unavailable = () => Error("CALENDAR_AVAILABILITY_INCOMPLETE");
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function dateEpoch(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return NaN;
  const epoch = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(epoch) &&
    new Date(epoch).toISOString().slice(0, 10) === value
    ? epoch
    : NaN;
}
export function calendarTimestamp(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const parts =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value
    );
  return parts && Number.isFinite(dateEpoch(parts[1]))
    ? Date.parse(value)
    : NaN;
}
function formatter(zone: unknown) {
  if (typeof zone !== "string" || !zone || zone.length > 100)
    throw unavailable();
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw unavailable();
  }
}
/** All-day boundaries belong to the response/event zone, not the server timezone.
 * A missing midnight (DST transition) fails closed; an ambiguous one occupies
 * both possibilities. This is deliberately conservative for a busy interval.
 */
function midnight(value: unknown, zone: unknown, boundary: "start" | "end") {
  const target = dateEpoch(value);
  if (!Number.isFinite(target)) throw unavailable();
  const format = formatter(zone);
  const local = (epoch: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(epoch).map(p => [p.type, p.value])
    );
    return Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`
    );
  };
  const candidates = new Set<number>();
  // Sample both sides of timezone transitions instead of guessing one UTC offset.
  for (let hours = -36; hours <= 36; hours += 12) {
    const sample = target + hours * 3600000;
    const candidate = target - (local(sample) - sample);
    if (Number.isFinite(candidate) && local(candidate) === target)
      candidates.add(candidate);
  }
  if (!candidates.size) throw unavailable();
  return boundary === "start"
    ? Math.min(...Array.from(candidates))
    : Math.max(...Array.from(candidates));
}
export function calendarBusyInterval(event: unknown, responseZone: string) {
  if (!record(event)) throw unavailable();
  if (event.status === "cancelled" || event.transparency === "transparent")
    return null;
  if (
    (event.status != null &&
      !["confirmed", "tentative"].includes(event.status)) ||
    (event.transparency != null && event.transparency !== "opaque") ||
    !record(event.start) ||
    !record(event.end)
  )
    throw unavailable();
  const { start, end } = event;
  let from: number, to: number;
  if (start.dateTime != null || end.dateTime != null) {
    if (start.date != null || end.date != null) throw unavailable();
    from = calendarTimestamp(start.dateTime);
    to = calendarTimestamp(end.dateTime);
  } else {
    const zone = start.timeZone ?? end.timeZone ?? responseZone;
    if (
      start.timeZone != null &&
      end.timeZone != null &&
      start.timeZone !== end.timeZone
    )
      throw unavailable();
    from = midnight(start.date, zone, "start");
    to = midnight(end.date, zone, "end");
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
    throw unavailable();
  return { start: from, end: to };
}
export function calendarEventPage(data: unknown) {
  if (
    !record(data) ||
    data.error ||
    !Array.isArray(data.items) ||
    data.items.length > 2500
  )
    throw unavailable();
  const token = data.nextPageToken;
  if (
    token != null &&
    (typeof token !== "string" ||
      !token ||
      token.length > 2048 ||
      /[\u0000-\u0020\u007f]/.test(token))
  )
    throw unavailable();
  if (data.timeZone != null) formatter(data.timeZone);
  return {
    items: data.items as unknown[],
    token: token as string | undefined,
    zone: data.timeZone ?? "Asia/Riyadh",
  };
}
