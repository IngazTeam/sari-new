import { getPool } from './db';

export class AppointmentConflictError extends Error {
  constructor() {
    super('APPOINTMENT_TIME_CONFLICT');
    this.name = 'AppointmentConflictError';
  }
}

export class AppointmentOwnershipError extends Error {
  constructor(resource: 'service' | 'staff') {
    super(`APPOINTMENT_${resource.toUpperCase()}_NOT_AVAILABLE`);
    this.name = 'AppointmentOwnershipError';
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

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_APPOINTMENT_DATE');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('INVALID_APPOINTMENT_DATE');
  }
}

export function calculateAppointmentEndTime(startTime: string, durationMinutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!match) throw new Error('INVALID_APPOINTMENT_TIME');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59 || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error('INVALID_APPOINTMENT_TIME');
  }

  const endMinutes = hours * 60 + minutes + durationMinutes;
  if (endMinutes > 24 * 60) throw new Error('APPOINTMENT_CROSSES_MIDNIGHT');
  const endHours = Math.floor(endMinutes / 60);
  const endRemainder = endMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endRemainder).padStart(2, '0')}`;
}

export function formatServicePrice(basePrice: number | null | undefined): string {
  if (basePrice === null || basePrice === undefined) return 'حسب الطلب';
  return `${new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: basePrice % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(basePrice / 100)} ريال`;
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
  assertPositiveInteger(input.merchantId, 'merchant_id');
  assertPositiveInteger(input.serviceId, 'service_id');
  if (input.staffId !== undefined) assertPositiveInteger(input.staffId, 'staff_id');
  assertDate(input.date);
  if (!input.customerPhone.trim()) throw new Error('INVALID_CUSTOMER_PHONE');

  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  const lockName = `appointment:${input.merchantId}:${input.date}`;
  let lockAcquired = false;

  try {
    const [lockRows] = await connection.execute(
      'SELECT GET_LOCK(?, 5) AS acquired',
      [lockName],
    );
    lockAcquired = Number((lockRows as any[])?.[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error('APPOINTMENT_LOCK_TIMEOUT');

    await connection.beginTransaction();

    const [merchantRows] = await connection.execute(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE',
      [input.merchantId],
    );
    if (!(merchantRows as any[])?.[0]) throw new Error('MERCHANT_NOT_FOUND');

    const [serviceRows] = await connection.execute(
      `SELECT id, merchant_id AS merchantId, name, duration_minutes AS durationMinutes,
              base_price AS basePrice, staff_ids AS staffIds
       FROM services
       WHERE id = ? AND merchant_id = ? AND is_active = 1
       LIMIT 1 FOR UPDATE`,
      [input.serviceId, input.merchantId],
    );
    const service = (serviceRows as any[])?.[0];
    if (!service) throw new AppointmentOwnershipError('service');

    let staff: { id: number; merchantId: number; name: string } | null = null;
    if (input.staffId !== undefined) {
      const [staffRows] = await connection.execute(
        `SELECT id, merchant_id AS merchantId, name
         FROM staff_members
         WHERE id = ? AND merchant_id = ? AND is_active = 1
         LIMIT 1 FOR UPDATE`,
        [input.staffId, input.merchantId],
      );
      staff = (staffRows as any[])?.[0] || null;
      if (!staff) throw new AppointmentOwnershipError('staff');

      if (service.staffIds) {
        let allowedStaff: number[] = [];
        try {
          const parsed = JSON.parse(service.staffIds);
          if (Array.isArray(parsed)) allowedStaff = parsed.map(Number).filter(Number.isSafeInteger);
        } catch {
          throw new AppointmentOwnershipError('staff');
        }
        if (allowedStaff.length > 0 && !allowedStaff.includes(input.staffId)) {
          throw new AppointmentOwnershipError('staff');
        }
      }
    }

    const durationMinutes = Number(service.durationMinutes);
    const endTime = calculateAppointmentEndTime(input.startTime, durationMinutes);
    const conflictSql = input.staffId === undefined
      ? `SELECT id FROM appointments
         WHERE merchant_id = ? AND DATE(appointment_date) = ? AND status <> 'cancelled'
           AND start_time < ? AND end_time > ?
         LIMIT 1 FOR UPDATE`
      : `SELECT id FROM appointments
         WHERE merchant_id = ? AND DATE(appointment_date) = ? AND staff_id = ?
           AND status <> 'cancelled' AND start_time < ? AND end_time > ?
         LIMIT 1 FOR UPDATE`;
    const conflictParams = input.staffId === undefined
      ? [input.merchantId, input.date, endTime, input.startTime]
      : [input.merchantId, input.date, input.staffId, endTime, input.startTime];
    const [conflicts] = await connection.execute(conflictSql, conflictParams);
    if ((conflicts as any[])?.length > 0) throw new AppointmentConflictError();

    const [insertResult] = await connection.execute(
      `INSERT INTO appointments
        (merchant_id, customer_phone, customer_name, service_id, staff_id,
         appointment_date, start_time, end_time, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
      [
        input.merchantId,
        input.customerPhone.trim(),
        input.customerName.trim() || null,
        input.serviceId,
        input.staffId || null,
        `${input.date} 00:00:00`,
        input.startTime,
        endTime,
        'تم الحجز عبر WhatsApp Bot',
      ],
    );
    const appointmentId = Number((insertResult as any)?.insertId || 0);
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0) {
      throw new Error('APPOINTMENT_INSERT_FAILED');
    }

    await connection.commit();
    return {
      appointmentId,
      endTime,
      service: {
        id: Number(service.id),
        merchantId: Number(service.merchantId),
        name: String(service.name),
        durationMinutes,
        basePrice: service.basePrice === null ? null : Number(service.basePrice),
      },
      staff,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original booking failure.
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch {
        // MySQL also releases advisory locks when the connection closes.
      }
    }
    connection.release();
  }
}
