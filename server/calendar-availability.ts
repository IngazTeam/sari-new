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

/** Read-only suggestion: configured local slots intersected with Google busy events. */
export async function getCalendarAvailability(
  merchantId: number,
  raw: z.infer<typeof appointmentAvailabilitySchema>
) {
  z.number().int().positive().safe().parse(merchantId);
  const input = appointmentAvailabilitySchema.parse(raw);
  const service = await getServiceById(input.serviceId);
  if (!service || service.merchantId !== merchantId || service.isActive !== 1)
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
  const events: any[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const response = await calendar.events.list({
      calendarId: integration.calendarId || "primary",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: "Asia/Riyadh",
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
    });
    events.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken || undefined;
    if (pageToken && (seen.has(pageToken) || seen.size >= 100))
      throw Error("CALENDAR_AVAILABILITY_INCOMPLETE");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  const busy = events
    .filter(
      event =>
        event.status !== "cancelled" && event.transparency !== "transparent"
    )
    .map(event => {
      const start = Date.parse(
        event.start?.dateTime || `${event.start?.date}T00:00:00+03:00`
      );
      const end = Date.parse(
        event.end?.dateTime || `${event.end?.date}T00:00:00+03:00`
      );
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
        throw Error("CALENDAR_EVENT_TIME_INVALID");
      return { start, end };
    });
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
