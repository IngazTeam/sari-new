import { z } from "zod";
import {
  serviceBookingDate,
  serviceBookingTime,
} from "./service-details-workspace";
import { bookingReadId as id } from "./booking-read";
export const calendarStatuses = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "unknown",
] as const;
export const calendarSyncStates = [
  "none",
  "creating",
  "create_unknown",
  "synced",
  "cancelling",
  "cancel_unknown",
  "cancelled",
  "legacy",
  "unknown",
] as const;
export const calendarStatus = z.enum(calendarStatuses);
export const calendarSyncState = z.enum(calendarSyncStates);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const calendarPageSize = 25;
export const calendarWorkspaceInput = z
  .object({
    startDate: serviceBookingDate,
    endDate: serviceBookingDate,
    search: z.string().trim().max(200).default(""),
    status: z.enum(["all", ...calendarStatuses]).default("all"),
    sync: z.enum(["all", ...calendarSyncStates]).default("all"),
    serviceId: id.optional(),
    staffId: id.optional(),
    page: z.number().int().min(1).max(1_000_000).default(1),
  })
  .strict()
  .refine(v => {
    const span = Date.parse(v.endDate) - Date.parse(v.startDate);
    return span >= 0 && span <= 92 * 86400000;
  }, "Invalid calendar range");
export const calendarDetailsInput = z.object({ appointmentId: id }).strict();
const reference = z
  .object({ id, name: z.string().nullable(), isActive: z.boolean().nullable() })
  .strict();
export const calendarWorkspaceRow = z
  .object({
    id,
    merchantId: id,
    service: reference,
    staff: reference.nullable(),
    customerName: z.string().nullable(),
    customerPhone: z.string().nullable(),
    date: serviceBookingDate.nullable(),
    startTime: serviceBookingTime.nullable(),
    endTime: serviceBookingTime.nullable(),
    status: calendarStatus,
    sync: calendarSyncState,
    issues: z.array(z.string()),
  })
  .strict();
const scope = {
  actorId: id,
  merchantId: id,
  canManage: z.boolean(),
  canManageIntegration: z.boolean(),
  checkedAt: z.string().datetime(),
};
export const calendarWorkspaceSchema = z
  .object({
    ...scope,
    selection: calendarWorkspaceInput,
    summary: z
      .object({
        total: count,
        counts: z
          .object({
            pending: count,
            confirmed: count,
            cancelled: count,
            completed: count,
            no_show: count,
            unknown: count,
          })
          .strict(),
        sync: z
          .object({
            none: count,
            creating: count,
            create_unknown: count,
            synced: count,
            cancelling: count,
            cancel_unknown: count,
            cancelled: count,
            legacy: count,
            unknown: count,
          })
          .strict(),
      })
      .strict(),
    days: z
      .array(
        z.object({ date: serviceBookingDate, total: count.min(1) }).strict()
      )
      .max(93),
    pagination: z
      .object({
        page: count.min(1),
        pageSize: z.literal(calendarPageSize),
        total: count,
        pages: count,
      })
      .strict(),
    rows: z.array(calendarWorkspaceRow).max(calendarPageSize),
  })
  .strict()
  .superRefine((v, ctx) => {
    const s = v.summary,
      p = v.pagination;
    if (
      p.page !== v.selection.page ||
      p.total !== s.total ||
      p.pages !== Math.ceil(s.total / calendarPageSize) ||
      v.rows.length !==
        Math.min(
          calendarPageSize,
          Math.max(0, s.total - (p.page - 1) * calendarPageSize)
        ) ||
      v.rows.some(
        r =>
          r.merchantId !== v.merchantId ||
          !r.date ||
          r.date < v.selection.startDate ||
          r.date > v.selection.endDate ||
          (v.selection.status !== "all" && r.status !== v.selection.status) ||
          (v.selection.sync !== "all" && r.sync !== v.selection.sync) ||
          (v.selection.serviceId !== undefined &&
            r.service.id !== v.selection.serviceId) ||
          (v.selection.staffId !== undefined &&
            r.staff?.id !== v.selection.staffId)
      ) ||
      new Set(v.rows.map(r => r.id)).size !== v.rows.length ||
      Object.values(s.counts).reduce((a, b) => a + b, 0) !== s.total ||
      Object.values(s.sync).reduce((a, b) => a + b, 0) !== s.total ||
      v.days.reduce((a, b) => a + b.total, 0) !== s.total ||
      new Set(v.days.map(d => d.date)).size !== v.days.length ||
      v.days.some(
        (d, i) =>
          d.date < v.selection.startDate ||
          d.date > v.selection.endDate ||
          (i > 0 && d.date <= v.days[i - 1].date)
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent calendar workspace",
      });
  });
export const calendarDetailRow = calendarWorkspaceRow.extend({
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  googleEventId: z.string().nullable(),
  integrationId: id.nullable(),
  calendarTargetId: z.string().nullable(),
  eventReference: z.string().nullable(),
  reviewRevision: count.nullable(),
  reminder24hSent: z.boolean().nullable(),
  reminder1hSent: z.boolean().nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export const calendarDetailsSchema = z
  .object({
    ...scope,
    selection: calendarDetailsInput,
    appointment: calendarDetailRow,
  })
  .strict()
  .refine(
    v =>
      v.appointment.id === v.selection.appointmentId &&
      v.appointment.merchantId === v.merchantId,
    "Inconsistent appointment details"
  );
export type CalendarWorkspace = z.infer<typeof calendarWorkspaceSchema>;
export type CalendarDetails = z.infer<typeof calendarDetailsSchema>;
