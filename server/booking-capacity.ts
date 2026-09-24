import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  bookingScheduleSchema,
  createScopedBookingSchema,
  type BookingSchedule,
  type CreateScopedBookingInput,
} from "../shared/booking-creation";

const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
export class BookingCapacityUnavailableError extends Error {
  constructor() {
    super("Booking capacity unavailable");
  }
}
const unavailable = () => new BookingCapacityUnavailableError();
type QueryConnection = Pick<PoolConnection, "execute">;

/** Cross-process serialization for both appointment ledgers. No network work inside. */
export async function withBookingCapacityTransaction<T>(
  merchantId: number,
  run: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  positive(merchantId);
  await assertRuntimeSchema(
    "booking capacity",
    [
      {
        table: "booking_capacity_locks",
        columns: ["merchant_id"],
        uniqueIndexes: [{ name: "PRIMARY", columns: ["merchant_id"] }],
      },
    ],
    { cacheSuccess: false }
  );
  const pool = await getPool();
  if (!pool) throw unavailable();
  const connection = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await connection.beginTransaction();
    // This is the first application lock in every booking create/edit/delete transaction.
    // The row is separate from merchants so unrelated merchant configuration isn't serialized.
    await connection.execute(
      "INSERT INTO booking_capacity_locks (merchant_id) VALUES (?) ON DUPLICATE KEY UPDATE merchant_id=VALUES(merchant_id)",
      [merchantId]
    );
    await connection.execute(
      "SELECT merchant_id FROM booking_capacity_locks WHERE merchant_id=? FOR UPDATE",
      [merchantId]
    );
    const result = await run(connection);
    committing = true;
    await connection.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}

export async function validateBookingStaff(
  connection: QueryConnection,
  merchantId: number,
  service: any,
  staffId?: number | null
) {
  if (staffId == null) return;
  positive(staffId);
  const [staff] = await connection.execute<any[]>(
    "SELECT id FROM staff_members WHERE id=? AND merchant_id=? AND is_active=1 FOR SHARE",
    [staffId, merchantId]
  );
  if (staff.length !== 1) throw unavailable();
  if (service.staff_ids) {
    let assigned: unknown;
    try {
      assigned = JSON.parse(service.staff_ids);
    } catch {
      throw unavailable();
    }
    if (
      !Array.isArray(assigned) ||
      assigned.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      (assigned.length && !assigned.includes(staffId))
    )
      throw unavailable();
  }
}

/** Advisory on reads; authoritative only while holding the merchant capacity transaction. */
export async function hasBookingConflict(
  connection: QueryConnection,
  merchantId: number,
  raw: BookingSchedule,
  excludeBookingId?: number,
  excludeAppointmentId?: number
) {
  positive(merchantId);
  if (excludeBookingId !== undefined) positive(excludeBookingId);
  if (excludeAppointmentId !== undefined) positive(excludeAppointmentId);
  const input = bookingScheduleSchema.parse(raw);
  const [rows] = await connection.execute<any[]>(
    `SELECT id FROM bookings WHERE merchant_id=? AND booking_date=?
    AND status IN ('pending','confirmed','in_progress') AND start_time<? AND end_time>?
    AND ((? IS NOT NULL AND staff_id=?) OR (service_id=? AND (? IS NULL OR staff_id IS NULL)))
    AND (? IS NULL OR id<>?) LIMIT 1`,
    [
      merchantId,
      input.bookingDate,
      input.endTime,
      input.startTime,
      input.staffId ?? null,
      input.staffId ?? null,
      input.serviceId,
      input.staffId ?? null,
      excludeBookingId ?? null,
      excludeBookingId ?? null,
    ]
  );
  if (rows.length > 0) return true;
  // IDs belong to different ledgers. Never apply a booking exclusion to appointments.
  const [appointments] = await connection.execute<any[]>(
    `SELECT id FROM appointments WHERE merchant_id=?
    AND appointment_date>=? AND appointment_date<DATE_ADD(?, INTERVAL 1 DAY)
    AND status IN ('pending','confirmed') AND start_time<? AND end_time>?
    AND ((? IS NOT NULL AND staff_id=?) OR (service_id=? AND (? IS NULL OR staff_id IS NULL)))
    AND (? IS NULL OR id<>?) LIMIT 1`,
    [
      merchantId,
      input.bookingDate,
      input.bookingDate,
      input.endTime,
      input.startTime,
      input.staffId ?? null,
      input.staffId ?? null,
      input.serviceId,
      input.staffId ?? null,
      excludeAppointmentId ?? null,
      excludeAppointmentId ?? null,
    ]
  );
  return appointments.length > 0;
}

export async function createAtomicBooking(
  raw: CreateScopedBookingInput
): Promise<number> {
  const input = createScopedBookingSchema.parse(raw);
  return withBookingCapacityTransaction(input.merchantId, connection =>
    createBookingInCapacityTransaction(connection, input)
  );
}
/** Internal: caller owns the merchant capacity transaction. */
export async function createBookingInCapacityTransaction(
  connection: PoolConnection,
  raw: CreateScopedBookingInput
): Promise<number> {
  const input = createScopedBookingSchema.parse(raw);
  const [services] = await connection.execute<any[]>(
    "SELECT * FROM services WHERE id=? AND merchant_id=? AND is_active=1 FOR UPDATE",
    [input.serviceId, input.merchantId]
  );
  if (services.length !== 1) throw unavailable();
  await validateBookingStaff(
    connection,
    input.merchantId,
    services[0],
    input.staffId
  );
  const schedule = {
    serviceId: input.serviceId,
    staffId: input.staffId,
    bookingDate: input.bookingDate,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  if (await hasBookingConflict(connection, input.merchantId, schedule))
    throw unavailable();
  const [result] = await connection.execute<any>(
    `INSERT INTO bookings
      (merchant_id,service_id,customer_phone,customer_name,customer_email,staff_id,booking_date,start_time,end_time,duration_minutes,status,payment_status,base_price,discount_amount,final_price,notes,booking_source)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending','unpaid',?,?,?,?,?)`,
    [
      input.merchantId,
      input.serviceId,
      input.customerPhone,
      input.customerName ?? null,
      input.customerEmail ?? null,
      input.staffId ?? null,
      input.bookingDate,
      input.startTime,
      input.endTime,
      input.durationMinutes,
      input.basePrice,
      input.discountAmount ?? 0,
      input.finalPrice,
      input.notes ?? null,
      input.bookingSource ?? "whatsapp",
    ]
  );
  const id = Number(result.insertId);
  positive(id);
  return id;
}

export async function checkBookingCapacity(
  raw: BookingSchedule,
  excludeBookingId?: number
) {
  const input = bookingScheduleSchema.parse(raw),
    pool = await getPool();
  if (!pool) throw unavailable();
  const [services] = await pool.execute<any[]>(
    "SELECT * FROM services WHERE id=? AND is_active=1",
    [input.serviceId]
  );
  if (services.length !== 1) throw unavailable();
  await validateBookingStaff(
    pool,
    services[0].merchant_id,
    services[0],
    input.staffId
  );
  return hasBookingConflict(
    pool,
    services[0].merchant_id,
    input,
    excludeBookingId
  );
}
