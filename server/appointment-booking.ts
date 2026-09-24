import { createHash } from "node:crypto";
import {
  scopedAppointmentCreationSchema,
  type AppointmentCreationInput,
} from "../shared/appointment-creation";
import {
  hasBookingConflict,
  validateBookingStaff,
  withBookingCapacityTransaction,
} from "./booking-capacity";
import { assertRuntimeSchema } from "./db/schema-readiness";

export class AppointmentConflictError extends Error {
  constructor() {
    super("APPOINTMENT_TIME_CONFLICT");
    this.name = "AppointmentConflictError";
  }
}
export class AppointmentOwnershipError extends Error {
  constructor(resource: "service" | "staff") {
    super(`APPOINTMENT_${resource.toUpperCase()}_NOT_AVAILABLE`);
    this.name = "AppointmentOwnershipError";
  }
}
export interface ConfirmedAppointment {
  appointmentId: number;
  endTime: string;
  service: {
    id: number;
    merchantId: number;
    name: string;
    durationMinutes: number;
    basePrice: number | null;
  };
  staff: { id: number; merchantId: number; name: string } | null;
}
export function calculateAppointmentEndTime(
  startTime: string,
  durationMinutes: number
): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!match || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0)
    throw Error("INVALID_APPOINTMENT_TIME");
  const end = Number(match[1]) * 60 + Number(match[2]) + durationMinutes;
  // Both ledgers use same-day HH:mm intervals. Never wrap midnight into the same date.
  if (end >= 1440) throw Error("APPOINTMENT_CROSSES_MIDNIGHT");
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
export function formatServicePrice(
  basePrice: number | null | undefined
): string {
  if (basePrice == null) return "حسب الطلب";
  return `${new Intl.NumberFormat("ar-SA", { minimumFractionDigits: basePrice % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(basePrice / 100)} ريال`;
}
export async function assertAppointmentSchema() {
  await assertRuntimeSchema(
    "appointment calendar sync",
    [
      {
        table: "appointments",
        columns: [
          "calendar_sync_state",
          "calendar_integration_id",
          "calendar_target_id",
          "calendar_identity_hash",
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
// Bind cancellation to the original authorization, not a newly connected Google account.
export function calendarIdentity(credentials: any): string {
  const token = credentials?.refresh_token || credentials?.access_token;
  if (typeof token !== "string" || !token)
    throw Error("CALENDAR_CREDENTIALS_UNAVAILABLE");
  return createHash("sha256").update(token).digest("hex");
}
export async function reserveAppointment(
  raw: AppointmentCreationInput,
  synchronizeCalendar = false
) {
  const input = scopedAppointmentCreationSchema.parse(raw);
  await assertAppointmentSchema();
  return withBookingCapacityTransaction(input.merchantId, async connection => {
    const [services] = await connection.execute<any[]>(
      "SELECT * FROM services WHERE id=? AND merchant_id=? AND is_active=1 FOR UPDATE",
      [input.serviceId, input.merchantId]
    );
    const service = services[0];
    if (!service) throw new AppointmentOwnershipError("service");
    try {
      await validateBookingStaff(
        connection,
        input.merchantId,
        service,
        input.staffId
      );
    } catch {
      throw new AppointmentOwnershipError("staff");
    }
    const endTime = calculateAppointmentEndTime(
      input.startTime,
      Number(service.duration_minutes)
    );
    if (
      await hasBookingConflict(connection, input.merchantId, {
        serviceId: input.serviceId,
        staffId: input.staffId,
        bookingDate: input.appointmentDate,
        startTime: input.startTime,
        endTime,
      })
    )
      throw new AppointmentConflictError();
    let staff: ConfirmedAppointment["staff"] = null;
    if (input.staffId) {
      const [rows] = await connection.execute<any[]>(
        "SELECT id,merchant_id AS merchantId,name FROM staff_members WHERE id=? AND merchant_id=?",
        [input.staffId, input.merchantId]
      );
      staff = rows[0];
    }
    let target: {
      integrationId: number;
      calendarId: string;
      identity: string;
      credentials: any;
    } | null = null;
    if (synchronizeCalendar) {
      const [integrations] = await connection.execute<any[]>(
        "SELECT * FROM google_integrations WHERE merchant_id=? AND integration_type='calendar' AND is_active=1 FOR SHARE",
        [input.merchantId]
      );
      if (integrations.length > 1) throw Error("CALENDAR_TARGET_AMBIGUOUS");
      if (integrations.length === 1) {
        const integration = integrations[0],
          credentials = JSON.parse(integration.credentials || "{}");
        target = {
          integrationId: integration.id,
          calendarId: integration.calendar_id || "primary",
          identity: calendarIdentity(credentials),
          credentials,
        };
      }
    }
    const [insert] = await connection.execute<any>(
      `INSERT INTO appointments (merchant_id,customer_phone,customer_name,service_id,staff_id,appointment_date,start_time,end_time,status,notes,
        calendar_sync_state,calendar_integration_id,calendar_target_id,calendar_identity_hash)
       VALUES (?,?,?,?,?,?,?,?,'confirmed',?,?,?,?,?)`,
      [
        input.merchantId,
        input.customerPhone,
        input.customerName || null,
        input.serviceId,
        input.staffId ?? null,
        `${input.appointmentDate} 00:00:00`,
        input.startTime,
        endTime,
        input.notes ?? null,
        target ? "creating" : "none",
        target?.integrationId ?? null,
        target?.calendarId ?? null,
        target?.identity ?? null,
      ]
    );
    const appointmentId = Number(insert.insertId);
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0)
      throw Error("APPOINTMENT_INSERT_FAILED");
    return {
      appointmentId,
      endTime,
      staff,
      target,
      service: {
        id: Number(service.id),
        merchantId: Number(service.merchant_id),
        name: String(service.name),
        durationMinutes: Number(service.duration_minutes),
        basePrice:
          service.base_price == null ? null : Number(service.base_price),
      },
    };
  });
}
export async function createConfirmedAppointment(input: {
  merchantId: number;
  customerPhone: string;
  customerName: string;
  serviceId: number;
  date: string;
  startTime: string;
  staffId?: number;
}): Promise<ConfirmedAppointment> {
  const { date, ...fields } = input;
  const { target: _target, ...appointment } = await reserveAppointment({
    ...fields,
    appointmentDate: date,
    notes: "تم الحجز عبر WhatsApp Bot",
  });
  return appointment;
}
