import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db/connection';
import { bookingReadId, bookingReadIdentity } from '../shared/booking-read';
import { bookingWorkspaceInput, bookingWorkspaceSchema, bookingWorkspaceRow, bookingDetailsSchema, bookingDetailRow, bookingPageSize, bookingPaymentState } from '../shared/booking-workspace';
import { serviceBookingStatus } from '../shared/service-details-workspace';

export class BookingWorkspaceUnavailableError extends Error { constructor() { super('Booking data unavailable'); } }
export class BookingWorkspaceMissingError extends Error { constructor() { super('Booking or reference not found'); } }
type Row = Record<string, any>;
type Read = (query: SQL) => Promise<Row[]>;
const integer = (value: unknown) => {
  const number = Number(value);
  if (value == null || value === '' || !Number.isSafeInteger(number) || number < 0) throw new BookingWorkspaceUnavailableError();
  return number;
};
async function snapshot<T>(actorId: number, merchantId: number, now: Date, callback: (read: Read, scope: { actorId: number; merchantId: number; canManage: boolean; checkedAt: string }) => Promise<T>) {
  bookingReadId.parse(actorId); bookingReadId.parse(merchantId);
  try {
    const db = await getDb(); if (!db || !Number.isFinite(now.getTime())) throw new BookingWorkspaceUnavailableError();
    return await db.transaction(async tx => {
      const read: Read = async query => { const result = await tx.execute(query); if (!Array.isArray(result[0])) throw new BookingWorkspaceUnavailableError(); return result[0] as Row[]; };
      const merchant = await read(sql`SELECT id FROM merchants WHERE id=${merchantId}`);
      if (merchant.length !== 1 || integer(merchant[0].id) !== merchantId) throw new BookingWorkspaceUnavailableError();
      return callback(read, { actorId, merchantId, canManage: false, checkedAt: now.toISOString() });
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  } catch (error) { if (error instanceof BookingWorkspaceMissingError) throw error; throw new BookingWorkspaceUnavailableError(); }
}
const joins = sql`LEFT JOIN services s ON s.id=b.service_id AND s.merchant_id=b.merchant_id LEFT JOIN staff_members m ON m.id=b.staff_id AND m.merchant_id=b.merchant_id`;
const columns = sql`b.id,b.merchant_id AS merchantId,b.service_id AS serviceId,s.name AS serviceName,s.is_active AS serviceActive,b.staff_id AS staffId,m.name AS staffName,m.is_active AS staffActive,b.customer_name AS customerName,b.customer_phone AS customerPhone,DATE_FORMAT(b.booking_date,'%Y-%m-%d') AS date,b.start_time AS startTime,b.end_time AS endTime,b.duration_minutes AS durationMinutes,b.status,b.payment_status AS paymentStatus,b.final_price AS finalPrice`;
const details = sql`b.customer_email AS customerEmail,b.base_price AS basePrice,b.discount_amount AS discountAmount,b.notes,b.cancellation_reason AS cancellationReason,b.cancelled_by AS cancelledBy,b.booking_source AS bookingSource,b.customer_agreement_id AS customerAgreementId,b.google_event_id AS googleEventId,b.reminder_24h_sent AS reminder24hSent,b.reminder_1h_sent AS reminder1hSent,DATE_FORMAT(b.confirmed_at,'%Y-%m-%dT%H:%i:%sZ') AS confirmedAt,DATE_FORMAT(b.completed_at,'%Y-%m-%dT%H:%i:%sZ') AS completedAt,DATE_FORMAT(b.cancelled_at,'%Y-%m-%dT%H:%i:%sZ') AS cancelledAt,DATE_FORMAT(b.created_at,'%Y-%m-%dT%H:%i:%sZ') AS createdAt,DATE_FORMAT(b.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updatedAt`;
const statusExpression = sql`CASE WHEN b.status IN ('pending','confirmed','in_progress','completed','cancelled','no_show') THEN b.status ELSE 'unknown' END`;
const paymentExpression = sql`CASE WHEN b.payment_status IN ('unpaid','paid','refunded') THEN b.payment_status ELSE 'unknown' END`;
function normalize(row: Row, detailed = false) {
  const issues: string[] = [];
  const nullable = (name: string, schema: z.ZodType, value: unknown) => { const parsed = schema.safeParse(value); if (parsed.success) return parsed.data; issues.push(name); return null; };
  const boolean = (name: string, value: unknown) => { if (value === 1) return true; if (value === 0) return false; issues.push(name); return null; };
  const shape = bookingWorkspaceRow.shape;
  const reference = (kind: string) => {
    if (row[kind + 'Name'] === null) issues.push(kind + 'Reference');
    return { id: integer(row[kind + 'Id']), name: row[kind + 'Name'], isActive: row[kind + 'Name'] === null ? null : boolean(kind + 'Active', row[kind + 'Active']) };
  };
  const result: Row = { id: integer(row.id), merchantId: integer(row.merchantId), service: reference('service'), staff: row.staffId === null ? null : reference('staff'), customerName: row.customerName, customerPhone: row.customerPhone, issues };
  for (const field of ['date', 'startTime', 'endTime', 'durationMinutes', 'finalPrice'] as const) result[field] = nullable(field, shape[field].unwrap(), row[field]);
  result.status = nullable('status', serviceBookingStatus, row.status) ?? 'unknown';
  result.paymentStatus = nullable('paymentStatus', bookingPaymentState, row.paymentStatus) ?? 'unknown';
  if (result.startTime && result.endTime && result.durationMinutes) {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (minutes(result.endTime) - minutes(result.startTime) !== result.durationMinutes) issues.push('schedule');
  }
  if (!detailed) return bookingWorkspaceRow.parse(result);
  for (const field of ['customerEmail', 'notes', 'cancellationReason', 'googleEventId']) result[field] = row[field];
  for (const field of ['basePrice', 'discountAmount'] as const) result[field] = nullable(field, bookingDetailRow.shape[field].unwrap(), row[field]);
  for (const field of ['confirmedAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt', 'customerAgreementId'] as const) result[field] = row[field] === null ? null : nullable(field, bookingDetailRow.shape[field].unwrap(), row[field]);
  result.cancelledBy = row.cancelledBy === null ? null : nullable('cancelledBy', bookingDetailRow.shape.cancelledBy.unwrap(), row.cancelledBy) ?? 'unknown';
  result.bookingSource = nullable('bookingSource', bookingDetailRow.shape.bookingSource, row.bookingSource) ?? 'unknown';
  for (const field of ['reminder24hSent', 'reminder1hSent']) result[field] = boolean(field, row[field]);
  if (result.basePrice !== null && result.discountAmount !== null && result.finalPrice !== null && result.basePrice - result.discountAmount !== result.finalPrice) issues.push('price');
  return bookingDetailRow.parse(result);
}
/** Full filtered counts and page rows use one tenant-scoped repeatable-read snapshot. */
export async function readBookingWorkspace(actorId: number, merchantId: number, input: unknown, now = new Date()) {
  const selection = bookingWorkspaceInput.parse(input);
  return snapshot(actorId, merchantId, now, async (read, scope) => {
    for (const [id, table] of [[selection.serviceId, 'services'], [selection.staffId, 'staff_members']] as const) {
      if (id !== undefined && !(await read(sql`SELECT id FROM ${sql.raw(table)} WHERE id=${id} AND merchant_id=${merchantId}`)).length) throw new BookingWorkspaceMissingError();
    }
    const filters = [sql`b.merchant_id=${merchantId}`];
    if (selection.status !== 'all') filters.push(sql`${statusExpression}=${selection.status}`);
    if (selection.payment !== 'all') filters.push(sql`${paymentExpression}=${selection.payment}`);
    if (selection.startDate) filters.push(sql`b.booking_date>=${selection.startDate}`);
    if (selection.endDate) filters.push(sql`b.booking_date<=${selection.endDate}`);
    if (selection.serviceId) filters.push(sql`b.service_id=${selection.serviceId}`);
    if (selection.staffId) filters.push(sql`b.staff_id=${selection.staffId}`);
    if (selection.search) filters.push(sql`(LOCATE(LOWER(${selection.search}),LOWER(CONCAT_WS(' ',b.customer_name,b.customer_phone,b.customer_email,s.name,m.name)))>0 OR CAST(b.id AS CHAR)=${selection.search})`);
    const where = sql.join(filters, sql` AND `);
    const counts = { pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0, unknown: 0 };
    const payments = { unpaid: 0, paid: 0, refunded: 0, unknown: 0 };
    let total = 0, eligible = 0, invalid = 0, amount = 0;
    const groups = await read(sql`SELECT ${statusExpression} AS status,${paymentExpression} AS payment,COUNT(*) AS total,COALESCE(SUM(CASE WHEN b.status='completed' AND b.payment_status='paid' THEN 1 ELSE 0 END),0) AS eligible,COALESCE(SUM(CASE WHEN b.status='completed' AND b.payment_status='paid' AND (b.final_price IS NULL OR b.final_price<0) THEN 1 ELSE 0 END),0) AS invalid,COALESCE(SUM(CASE WHEN b.status='completed' AND b.payment_status='paid' AND b.final_price>=0 THEN b.final_price ELSE 0 END),0) AS amount FROM bookings b ${joins} WHERE ${where} GROUP BY ${statusExpression},${paymentExpression}`);
    for (const group of groups) {
      const n = integer(group.total); total += n; counts[serviceBookingStatus.parse(group.status)] += n; payments[bookingPaymentState.parse(group.payment)] += n;
      eligible += integer(group.eligible); invalid += integer(group.invalid); amount += integer(group.amount);
    }
    const rows = await read(sql`SELECT ${columns} FROM bookings b ${joins} WHERE ${where} ORDER BY b.booking_date DESC,b.start_time DESC,b.id DESC LIMIT ${bookingPageSize} OFFSET ${(selection.page - 1) * bookingPageSize}`);
    return bookingWorkspaceSchema.parse({ ...scope, selection, summary: { total, counts, payments, paidValue: { minor: invalid ? null : amount, eligible, invalid } }, pagination: { page: selection.page, pageSize: bookingPageSize, total, pages: Math.ceil(total / bookingPageSize) }, rows: rows.map(row => normalize(row)) });
  });
}
export async function readBookingDetails(actorId: number, merchantId: number, input: unknown, now = new Date()) {
  const selection = bookingReadIdentity.parse(input);
  return snapshot(actorId, merchantId, now, async (read, scope) => {
    const rows = await read(sql`SELECT ${columns},${details} FROM bookings b ${joins} WHERE b.id=${selection.bookingId} AND b.merchant_id=${merchantId}`);
    if (!rows.length) throw new BookingWorkspaceMissingError();
    return bookingDetailsSchema.parse({ ...scope, selection, booking: normalize(rows[0], true) });
  });
}
