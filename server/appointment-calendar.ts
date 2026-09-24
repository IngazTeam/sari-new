import { z } from "zod";
import {
  appointmentCancellationSchema,
  scopedAppointmentCreationSchema,
  type AppointmentCreationInput,
} from "../shared/appointment-creation";
import {
  assertAppointmentSchema,
  calendarIdentity,
  reserveAppointment,
} from "./appointment-booking";
import { withBookingCapacityTransaction } from "./booking-capacity";

export class AppointmentCalendarReviewError extends Error {
  constructor() {
    super(
      "Calendar synchronization requires review; the appointment still occupies its slot"
    );
  }
}
// Persist dispatch before network I/O. Never automatically retry an ambiguous provider response.
export async function bookCalendarAppointment(raw: AppointmentCreationInput) {
  const input = scopedAppointmentCreationSchema.parse(raw);
  const reservation = await reserveAppointment(input, true);
  if (!reservation.target)
    return {
      success: true as const,
      appointmentId: reservation.appointmentId,
      calendarSyncState: "none" as const,
    };
  const { target } = reservation;
  let eventId: string;
  try {
    const provider = await import("./_core/googleCalendar");
    const credentials = await provider.validateAndRefreshCredentials(
      target.credentials
    );
    const event = await provider.createCalendarEvent(
      credentials,
      target.calendarId,
      {
        id: reservation.eventReference!,
        privateProperties: { sariAppointment: reservation.eventReference! },
        summary: `${reservation.service.name} - ${input.customerName || ""}`,
        description: `Customer: ${input.customerName || ""}\nPhone: ${input.customerPhone}\nService: ${reservation.service.name}${input.notes ? `\nNotes: ${input.notes}` : ""}`,
        start: new Date(`${input.appointmentDate}T${input.startTime}:00+03:00`),
        end: new Date(
          `${input.appointmentDate}T${reservation.endTime}:00+03:00`
        ),
      }
    );
    if (typeof event.id !== "string" || event.id !== reservation.eventReference)
      throw Error("CALENDAR_EVENT_ACK_MISSING");
    eventId = event.id;
  } catch {
    await withBookingCapacityTransaction(input.merchantId, async connection => {
      await connection.execute(
        "UPDATE appointments SET calendar_sync_state='create_unknown' WHERE id=? AND merchant_id=? AND calendar_sync_state='creating'",
        [reservation.appointmentId, input.merchantId]
      );
    });
    return {
      success: true as const,
      appointmentId: reservation.appointmentId,
      calendarSyncState: "create_unknown" as const,
    };
  }
  // Lost commit acknowledgement leaves a capacity hold; never issue another POST.
  await withBookingCapacityTransaction(input.merchantId, async connection => {
    const [result] = await connection.execute<any>(
      "UPDATE appointments SET google_event_id=?,calendar_sync_state='synced' WHERE id=? AND merchant_id=? AND status='confirmed' AND calendar_sync_state='creating'",
      [eventId, reservation.appointmentId, input.merchantId]
    );
    if (result.affectedRows !== 1) throw new AppointmentCalendarReviewError();
  });
  return {
    success: true as const,
    appointmentId: reservation.appointmentId,
    calendarSyncState: "synced" as const,
  };
}
export async function cancelCalendarAppointment(
  merchantId: number,
  raw: z.infer<typeof appointmentCancellationSchema>
) {
  z.number().int().positive().safe().parse(merchantId);
  const input = appointmentCancellationSchema.parse(raw);
  await assertAppointmentSchema();
  const target = await withBookingCapacityTransaction(
    merchantId,
    async connection => {
      const [rows] = await connection.execute<any[]>(
        "SELECT * FROM appointments WHERE id=? AND merchant_id=? FOR UPDATE",
        [input.appointmentId, merchantId]
      );
      const appointment = rows[0];
      if (!appointment) throw new AppointmentCalendarReviewError();
      if (appointment.status === "cancelled") return null;
      if (!["pending", "confirmed"].includes(appointment.status))
        throw new AppointmentCalendarReviewError();
      if (
        appointment.calendar_sync_state === "none" &&
        !appointment.google_event_id
      ) {
        await connection.execute(
          "UPDATE appointments SET status='cancelled',cancellation_reason=? WHERE id=? AND merchant_id=?",
          [input.reason ?? null, input.appointmentId, merchantId]
        );
        return null;
      }
      if (
        appointment.calendar_sync_state !== "synced" ||
        !appointment.google_event_id
      )
        throw new AppointmentCalendarReviewError();
      const [integrations] = await connection.execute<any[]>(
        "SELECT * FROM google_integrations WHERE id=? AND merchant_id=? AND integration_type='calendar' AND is_active=1 FOR SHARE",
        [appointment.calendar_integration_id, merchantId]
      );
      const integration = integrations[0];
      if (
        !integration ||
        (integration.calendar_id || "primary") !==
          appointment.calendar_target_id
      )
        throw new AppointmentCalendarReviewError();
      const credentials = JSON.parse(integration.credentials || "{}");
      if (calendarIdentity(credentials) !== appointment.calendar_identity_hash)
        throw new AppointmentCalendarReviewError();
      await connection.execute(
        "UPDATE appointments SET calendar_sync_state='cancelling',cancellation_reason=? WHERE id=? AND merchant_id=?",
        [input.reason ?? null, input.appointmentId, merchantId]
      );
      return {
        credentials,
        calendarId: appointment.calendar_target_id,
        eventId: appointment.google_event_id,
      };
    }
  );
  if (!target) return { success: true as const };
  try {
    const provider = await import("./_core/googleCalendar");
    const credentials = await provider.validateAndRefreshCredentials(
      target.credentials
    );
    await provider.deleteCalendarEvent(
      credentials,
      target.calendarId,
      target.eventId
    );
  } catch {
    await withBookingCapacityTransaction(merchantId, async connection => {
      await connection.execute(
        "UPDATE appointments SET calendar_sync_state='cancel_unknown' WHERE id=? AND merchant_id=? AND calendar_sync_state='cancelling'",
        [input.appointmentId, merchantId]
      );
    });
    throw new AppointmentCalendarReviewError();
  }
  await withBookingCapacityTransaction(merchantId, async connection => {
    const [result] = await connection.execute<any>(
      "UPDATE appointments SET status='cancelled',calendar_sync_state='cancelled' WHERE id=? AND merchant_id=? AND calendar_sync_state='cancelling'",
      [input.appointmentId, merchantId]
    );
    if (result.affectedRows !== 1) throw new AppointmentCalendarReviewError();
  });
  return { success: true as const };
}
