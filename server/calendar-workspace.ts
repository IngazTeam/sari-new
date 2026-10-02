import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/connection";
import { bookingReadId } from "../shared/booking-read";
import {
  calendarWorkspaceInput,
  calendarDetailsInput,
  calendarWorkspaceSchema,
  calendarDetailsSchema,
  calendarWorkspaceRow,
  calendarDetailRow,
  calendarStatus,
  calendarSyncState,
  calendarPageSize,
  calendarStatsInput,
} from "../shared/calendar-workspace";
export class CalendarWorkspaceUnavailableError extends Error {
  constructor() {
    super("Calendar data unavailable");
  }
}
export class CalendarWorkspaceMissingError extends Error {
  constructor() {
    super("Appointment or reference not found");
  }
}
type Row = Record<string, any>;
type Read = (query: SQL) => Promise<Row[]>;
const integer = (v: unknown) => {
  const n = Number(v);
  if (v == null || v === "" || !Number.isSafeInteger(n) || n < 0)
    throw new CalendarWorkspaceUnavailableError();
  return n;
};
async function snapshot<T>(
  actorId: number,
  merchantId: number,
  now: Date,
  callback: (
    read: Read,
    scope: {
      actorId: number;
      merchantId: number;
      canManage: boolean;
      canManageIntegration: boolean;
      checkedAt: string;
    }
  ) => Promise<T>
) {
  bookingReadId.parse(actorId);
  bookingReadId.parse(merchantId);
  try {
    const db = await getDb();
    if (!db || !Number.isFinite(now.getTime()))
      throw new CalendarWorkspaceUnavailableError();
    return await db.transaction(
      async tx => {
        const read: Read = async query => {
          const result = await tx.execute(query);
          if (!Array.isArray(result[0]))
            throw new CalendarWorkspaceUnavailableError();
          return result[0] as Row[];
        };
        const merchant = await read(
          sql`SELECT id FROM merchants WHERE id=${merchantId}`
        );
        if (merchant.length !== 1 || integer(merchant[0].id) !== merchantId)
          throw new CalendarWorkspaceUnavailableError();
        return callback(read, {
          actorId,
          merchantId,
          canManage: false,
          canManageIntegration: false,
          checkedAt: now.toISOString(),
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  } catch (error) {
    if (error instanceof CalendarWorkspaceMissingError) throw error;
    throw new CalendarWorkspaceUnavailableError();
  }
}
const joins = sql`LEFT JOIN services s ON s.id=a.service_id AND s.merchant_id=a.merchant_id LEFT JOIN staff_members m ON m.id=a.staff_id AND m.merchant_id=a.merchant_id`;
const columns = sql`a.id,a.merchant_id AS merchantId,a.service_id AS serviceId,s.name AS serviceName,s.is_active AS serviceActive,a.staff_id AS staffId,m.name AS staffName,m.is_active AS staffActive,a.customer_name AS customerName,a.customer_phone AS customerPhone,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,a.start_time AS startTime,a.end_time AS endTime,a.status,a.calendar_sync_state AS sync`;
const statusExpression = sql`CASE WHEN a.status IN ('pending','confirmed','cancelled','completed','no_show') THEN a.status ELSE 'unknown' END`;
const syncExpression = sql`CASE WHEN a.calendar_sync_state IN ('none','creating','create_unknown','synced','cancelling','cancel_unknown','cancelled','legacy') THEN a.calendar_sync_state ELSE 'unknown' END`;
export async function readCalendarStats(
  actorId: number,
  merchantId: number,
  raw: unknown,
  now = new Date()
) {
  const input = calendarStatsInput.parse(raw);
  return snapshot(actorId, merchantId, now, async (read, scope) => {
    const filters = [sql`a.merchant_id=${merchantId}`];
    if (input.startDate)
      filters.push(sql`a.appointment_date>=${input.startDate}`);
    if (input.endDate)
      filters.push(
        sql`a.appointment_date<DATE_ADD(${input.endDate},INTERVAL 1 DAY)`
      );
    const rows = await read(
      sql`SELECT ${statusExpression} AS status,COUNT(*) AS total FROM appointments a WHERE ${sql.join(filters, sql` AND `)} GROUP BY ${statusExpression}`
    );
    const counts = {
        pending: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        noShow: 0,
        unknown: 0,
      },
      seen = new Set<string>();
    for (const row of rows) {
      const status = calendarStatus.parse(row.status);
      if (seen.has(status)) throw new CalendarWorkspaceUnavailableError();
      seen.add(status);
      counts[status === "no_show" ? "noShow" : status] = integer(row.total);
    }
    const total = integer(
      Object.values(counts).reduce((sum, value) => sum + value, 0)
    );
    return { ...scope, selection: input, total, ...counts };
  });
}
function normalize(row: Row, detailed = false) {
  const issues: string[] = [];
  const nullable = (field: string, schema: z.ZodType, value: unknown) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    issues.push(field);
    return null;
  };
  const boolean = (field: string, value: unknown) => {
    if (value === 1) return true;
    if (value === 0) return false;
    issues.push(field);
    return null;
  };
  const ref = (kind: string) => {
    if (row[kind + "Name"] === null) issues.push(kind + "Reference");
    return {
      id: integer(row[kind + "Id"]),
      name: row[kind + "Name"],
      isActive:
        row[kind + "Name"] === null
          ? null
          : boolean(kind + "Active", row[kind + "Active"]),
    };
  };
  const result: Row = {
    id: integer(row.id),
    merchantId: integer(row.merchantId),
    service: ref("service"),
    staff: row.staffId === null ? null : ref("staff"),
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    issues,
  };
  for (const field of ["date", "startTime", "endTime"] as const)
    result[field] = nullable(
      field,
      calendarWorkspaceRow.shape[field].unwrap(),
      row[field]
    );
  result.status = nullable("status", calendarStatus, row.status) ?? "unknown";
  result.sync = nullable("sync", calendarSyncState, row.sync) ?? "unknown";
  if (result.startTime && result.endTime && result.endTime <= result.startTime)
    issues.push("schedule");
  if (!detailed) return calendarWorkspaceRow.parse(result);
  for (const field of [
    "notes",
    "cancellationReason",
    "googleEventId",
    "eventReference",
  ])
    result[field] = row[field];
  result.integrationId =
    row.integrationId === null
      ? null
      : nullable("integrationId", bookingReadId, row.integrationId);
  result.calendarTargetId =
    row.integrationId !== null && row.ownedIntegrationId === null
      ? null
      : row.calendarTargetId;
  if (row.integrationId !== null && row.ownedIntegrationId === null)
    issues.push("integrationReference");
  result.reviewRevision = nullable(
    "reviewRevision",
    calendarDetailRow.shape.reviewRevision.unwrap(),
    row.reviewRevision
  );
  for (const field of ["reminder24hSent", "reminder1hSent"])
    result[field] = boolean(field, row[field]);
  for (const field of ["createdAt", "updatedAt"] as const)
    result[field] =
      row[field] === null
        ? null
        : nullable(field, calendarDetailRow.shape[field].unwrap(), row[field]);
  return calendarDetailRow.parse(result);
}
/** Complete aggregates, day counts, references and one page share a tenant-scoped snapshot. */
export async function readCalendarWorkspace(
  actorId: number,
  merchantId: number,
  input: unknown,
  now = new Date()
) {
  const selection = calendarWorkspaceInput.parse(input);
  return snapshot(actorId, merchantId, now, async (read, scope) => {
    for (const [id, table] of [
      [selection.serviceId, "services"],
      [selection.staffId, "staff_members"],
    ] as const)
      if (
        id !== undefined &&
        !(
          await read(
            sql`SELECT id FROM ${sql.raw(table)} WHERE id=${id} AND merchant_id=${merchantId}`
          )
        ).length
      )
        throw new CalendarWorkspaceMissingError();
    const filters = [
      sql`a.merchant_id=${merchantId}`,
      sql`a.appointment_date>=${selection.startDate}`,
      sql`a.appointment_date<DATE_ADD(${selection.endDate},INTERVAL 1 DAY)`,
    ];
    if (selection.status !== "all")
      filters.push(sql`${statusExpression}=${selection.status}`);
    if (selection.sync !== "all")
      filters.push(sql`${syncExpression}=${selection.sync}`);
    if (selection.serviceId)
      filters.push(sql`a.service_id=${selection.serviceId}`);
    if (selection.staffId) filters.push(sql`a.staff_id=${selection.staffId}`);
    if (selection.search)
      filters.push(
        sql`(LOCATE(LOWER(${selection.search}),LOWER(CONCAT_WS(' ',a.customer_name,a.customer_phone,s.name,m.name)))>0 OR CAST(a.id AS CHAR)=${selection.search})`
      );
    const where = sql.join(filters, sql` AND `),
      counts = {
        pending: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        no_show: 0,
        unknown: 0,
      },
      sync = {
        none: 0,
        creating: 0,
        create_unknown: 0,
        synced: 0,
        cancelling: 0,
        cancel_unknown: 0,
        cancelled: 0,
        legacy: 0,
        unknown: 0,
      };
    const groups = await read(
      sql`SELECT DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,${statusExpression} AS status,${syncExpression} AS sync,COUNT(*) AS total FROM appointments a ${joins} WHERE ${where} GROUP BY DATE_FORMAT(a.appointment_date,'%Y-%m-%d'),${statusExpression},${syncExpression}`
    );
    let total = 0;
    const days = new Map<string, number>();
    for (const row of groups) {
      const n = integer(row.total);
      total += n;
      counts[calendarStatus.parse(row.status)] += n;
      sync[calendarSyncState.parse(row.sync)] += n;
      days.set(row.date, (days.get(row.date) ?? 0) + n);
    }
    const rows = await read(
      sql`SELECT ${columns} FROM appointments a ${joins} WHERE ${where} ORDER BY a.appointment_date,a.start_time,a.id LIMIT ${calendarPageSize} OFFSET ${(selection.page - 1) * calendarPageSize}`
    );
    return calendarWorkspaceSchema.parse({
      ...scope,
      selection,
      summary: { total, counts, sync },
      days: Array.from(days, ([date, total]) => ({ date, total })).sort(
        (a, b) => a.date.localeCompare(b.date)
      ),
      pagination: {
        page: selection.page,
        pageSize: calendarPageSize,
        total,
        pages: Math.ceil(total / calendarPageSize),
      },
      rows: rows.map(row => normalize(row)),
    });
  });
}
export async function readCalendarDetails(
  actorId: number,
  merchantId: number,
  input: unknown,
  now = new Date()
) {
  const selection = calendarDetailsInput.parse(input);
  return snapshot(actorId, merchantId, now, async (read, scope) => {
    const rows = await read(
      sql`SELECT ${columns},a.notes,a.cancellation_reason AS cancellationReason,a.google_event_id AS googleEventId,a.calendar_integration_id AS integrationId,g.id AS ownedIntegrationId,a.calendar_target_id AS calendarTargetId,a.calendar_event_reference AS eventReference,a.calendar_review_revision AS reviewRevision,a.reminder_24h_sent AS reminder24hSent,a.reminder_1h_sent AS reminder1hSent,DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS createdAt,DATE_FORMAT(a.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updatedAt FROM appointments a ${joins} LEFT JOIN google_integrations g ON g.id=a.calendar_integration_id AND g.merchant_id=a.merchant_id AND g.integration_type='calendar' WHERE a.id=${selection.appointmentId} AND a.merchant_id=${merchantId}`
    );
    if (!rows.length) throw new CalendarWorkspaceMissingError();
    return calendarDetailsSchema.parse({
      ...scope,
      selection,
      appointment: normalize(rows[0], true),
    });
  });
}
