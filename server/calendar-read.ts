import { z } from "zod";
import { calendarListSchema } from "../shared/appointment-reconciliation";
import { getPool } from "./db/connection";
const day = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export async function readCalendarAppointments(
  merchantId: number,
  raw: z.infer<typeof calendarListSchema>
) {
  z.number().int().positive().safe().parse(merchantId);
  const input = calendarListSchema.parse(raw),
    pool = await getPool();
  if (!pool) throw Error("Calendar unavailable");
  const [rows] = await pool.execute<any[]>(
    `SELECT a.id,a.customer_name,a.customer_phone,a.appointment_date,a.start_time,a.end_time,a.status,a.calendar_sync_state,
    s.name AS service_name,t.name AS staff_name FROM appointments a
    LEFT JOIN services s ON s.id=a.service_id AND s.merchant_id=a.merchant_id
    LEFT JOIN staff_members t ON t.id=a.staff_id AND t.merchant_id=a.merchant_id
    WHERE a.merchant_id=? AND a.appointment_date>=? AND a.appointment_date<DATE_ADD(?,INTERVAL 1 DAY)
    AND (? IS NULL OR a.status=?) ORDER BY a.appointment_date,a.start_time,a.id LIMIT 501`,
    [
      merchantId,
      input.startDate,
      input.endDate,
      input.status ?? null,
      input.status ?? null,
    ]
  );
  const [counts] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total,
    COALESCE(SUM(status='confirmed'),0) AS confirmed,COALESCE(SUM(status='pending'),0) AS pending,
    COALESCE(SUM(status='cancelled'),0) AS cancelled FROM appointments
    WHERE merchant_id=? AND appointment_date>=? AND appointment_date<DATE_ADD(?,INTERVAL 1 DAY)
    AND (? IS NULL OR status=?)`,
    [
      merchantId,
      input.startDate,
      input.endDate,
      input.status ?? null,
      input.status ?? null,
    ]
  );
  return {
    stats: {
      total: Number(counts[0].total),
      confirmed: Number(counts[0].confirmed),
      pending: Number(counts[0].pending),
      cancelled: Number(counts[0].cancelled),
    },
    truncated: rows.length > 500,
    appointments: rows.slice(0, 500).map(row => ({
      id: Number(row.id),
      customerName: row.customer_name as string | null,
      customerPhone: String(row.customer_phone),
      appointmentDate: day(row.appointment_date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      status: z
        .enum(["pending", "confirmed", "cancelled", "completed", "no_show"])
        .parse(row.status),
      calendarSyncState: String(row.calendar_sync_state),
      serviceName: row.service_name as string | null,
      staffName: row.staff_name as string | null,
    })),
  };
}
