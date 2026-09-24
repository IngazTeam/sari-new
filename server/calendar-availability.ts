import { appointmentAvailabilitySchema } from "../shared/appointment-creation";
import { calculateAppointmentEndTime } from "./appointment-booking";
import {
  getAvailableTimeSlots,
  getGoogleIntegration,
  getServiceById,
} from "./db";
import { getPool } from "./db/connection";
import { hasBookingConflict, validateBookingStaff } from "./booking-capacity";
import { z } from "zod";
import { calendarBusyInterval, calendarEventPage } from "./calendar-evidence";

/** Read-only suggestion: configured local slots intersected with Google busy events. */
export async function getCalendarAvailability(
  merchantId: number,
  raw: z.infer<typeof appointmentAvailabilitySchema>
) {
  z.number().int().positive().safe().parse(merchantId);
  const input = appointmentAvailabilitySchema.parse(raw);
  const service = await getServiceById(input.serviceId);
  if (
    !service ||
    service.merchantId !== merchantId ||
    service.isActive !== 1 ||
    !Number.isSafeInteger(service.durationMinutes) ||
    service.durationMinutes < 1 ||
    service.durationMinutes >= 1440 ||
    (service.bufferTimeMinutes != null &&
      (!Number.isSafeInteger(service.bufferTimeMinutes) ||
        service.bufferTimeMinutes < 0 ||
        service.bufferTimeMinutes >= 1440))
  )
    throw Error("CALENDAR_UNAVAILABLE");
  const pool = await getPool();
  if (!pool) throw Error("CALENDAR_UNAVAILABLE");
  await validateBookingStaff(
    pool,
    merchantId,
    { staff_ids: service.staffIds },
    input.staffId
  );
  const integration = await getGoogleIntegration(merchantId, "calendar");
  const candidates = await getAvailableTimeSlots(
    input.serviceId,
    input.date,
    input.staffId
  );
  // The atomic writer reserves service duration, so never suggest a shorter configured interval.
  const proposed = Array.from(
    new Set(
      candidates
        .filter(slot => {
          try {
            return (
              calculateAppointmentEndTime(
                slot.startTime,
                service.durationMinutes
              ) === slot.endTime
            );
          } catch {
            return false;
          }
        })
        .map(slot => slot.startTime)
    )
  );
  const slots: string[] = [];
  for (const startTime of proposed) {
    if (
      !(await hasBookingConflict(pool, merchantId, {
        serviceId: input.serviceId,
        staffId: input.staffId,
        bookingDate: input.date,
        startTime,
        endTime: calculateAppointmentEndTime(
          startTime,
          service.durationMinutes
        ),
      }))
    )
      slots.push(startTime);
  }
  if (!integration?.isActive || !slots.length) return { slots };
  const provider = await import("./_core/googleCalendar");
  const credentials = await provider.validateAndRefreshCredentials(
    JSON.parse(integration.credentials || "{}")
  );
  const calendar = await provider.createCalendarClient(credentials);
  const dayStart = new Date(`${input.date}T00:00:00+03:00`),
    dayEnd = new Date(dayStart.getTime() + 86400000);
  const busy: { start: number; end: number }[] = [];
  const seen = new Set<string>();
  const eventIds = new Set<string>();
  const deadline = Date.now() + 30000;
  let pages = 0;
  let pageToken: string | undefined;
  do {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || ++pages > 10)
      throw Error("CALENDAR_AVAILABILITY_INCOMPLETE");
    const response = await calendar.events.list(
      {
        calendarId: integration.calendarId || "primary",
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        timeZone: "Asia/Riyadh",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
        pageToken,
      },
      { timeout: Math.min(15000, remaining), retry: false }
    );
    if (Date.now() >= deadline) throw Error("CALENDAR_AVAILABILITY_INCOMPLETE");
    const page = calendarEventPage(response.data);
    for (const event of page.items) {
      if (event && typeof event === "object" && "id" in event) {
        if (typeof event.id !== "string" || !event.id || eventIds.has(event.id))
          throw Error("CALENDAR_AVAILABILITY_INCOMPLETE");
        eventIds.add(event.id);
      }
      const interval = calendarBusyInterval(event, page.zone);
      if (interval) busy.push(interval);
    }
    pageToken = page.token;
    if (pageToken && seen.has(pageToken))
      throw Error("CALENDAR_AVAILABILITY_INCOMPLETE");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return {
    slots: slots.filter(time => {
      const start = Date.parse(`${input.date}T${time}:00+03:00`);
      const end =
        start +
        (service.durationMinutes +
          Math.max(0, service.bufferTimeMinutes || 0)) *
          60000;
      return !busy.some(event => start < event.end && end > event.start);
    }),
  };
}
