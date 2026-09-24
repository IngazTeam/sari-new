import type { PoolConnection } from "mysql2/promise";
export const activeRescheduleStates = "('pending','moving','move_unknown')";
export function bookingCalendarProof(link: any) {
  return {
    id: link.id,
    integrationId: link.integration_id,
    calendarId: link.calendar_id,
    identityHash: link.identity_hash,
    eventReference: link.event_reference,
    payloadHash: link.payload_hash,
  };
}
export async function readActiveBookingReschedule(
  c: Pick<PoolConnection, "execute">,
  merchantId: number,
  bookingId: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT * FROM booking_calendar_reschedules WHERE merchant_id=? AND booking_reference=? AND state IN ${activeRescheduleStates} ORDER BY id DESC LIMIT 2 FOR UPDATE`,
    [merchantId, bookingId]
  );
  if (rows.length > 1) throw Error("Ambiguous booking reschedule");
  return rows[0] ?? null;
}
/** Includes the prospective period on a different day without counting one booking twice on a day. */
export async function rescheduleDailyHolds(
  c: Pick<PoolConnection, "execute">,
  merchantId: number,
  serviceId: number,
  date: string,
  excludeBookingId?: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT COUNT(*) AS used FROM booking_calendar_reschedules r
    WHERE r.merchant_id=? AND r.service_id=? AND r.booking_date=? AND r.state IN ${activeRescheduleStates}
    AND (? IS NULL OR r.booking_reference<>?)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.merchant_id=r.merchant_id AND b.id=r.booking_reference AND b.service_id=r.service_id AND b.booking_date=r.booking_date AND b.status IN ('pending','confirmed','in_progress'))`,
    [
      merchantId,
      serviceId,
      date,
      excludeBookingId ?? null,
      excludeBookingId ?? null,
    ]
  );
  return Number(rows[0].used);
}
export async function assertCalendarRescheduleCapacity(
  c: PoolConnection,
  merchantId: number,
  target: { id: number; calendarId: string; identity: string },
  date: string,
  start: string,
  end: string,
  excludeBookingId?: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT r.id FROM booking_calendar_reschedules r
    JOIN booking_calendar_links l ON l.merchant_id=r.merchant_id AND l.booking_reference=r.booking_reference
    WHERE r.merchant_id=? AND r.state IN ${activeRescheduleStates} AND r.booking_date=? AND r.start_time<? AND r.end_time>?
    AND l.integration_id=? AND l.calendar_id=? AND l.identity_hash=? AND (? IS NULL OR r.booking_reference<>?) LIMIT 1`,
    [
      merchantId,
      date,
      end,
      start,
      target.id,
      target.calendarId,
      target.identity,
      excludeBookingId ?? null,
      excludeBookingId ?? null,
    ]
  );
  if (rows.length) throw Error("Calendar interval reserved by a reschedule");
}
