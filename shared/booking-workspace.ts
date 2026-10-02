import { z } from 'zod';
import { bookingReadId, bookingReadIdentity } from './booking-read';
import { serviceBookingDate, serviceBookingTime, serviceBookingStatus } from './service-details-workspace';

export const bookingPageSize = 25;
export const bookingPaymentState = z.enum(['unpaid', 'paid', 'refunded', 'unknown']);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const bookingWorkspaceInput = z.object({
  search: z.string().trim().max(200).default(''),
  status: z.enum(['all', ...serviceBookingStatus.options]).default('all'),
  payment: z.enum(['all', ...bookingPaymentState.options]).default('all'),
  startDate: serviceBookingDate.optional(), endDate: serviceBookingDate.optional(),
  serviceId: bookingReadId.optional(), staffId: bookingReadId.optional(),
  page: z.number().int().min(1).max(1_000_000).default(1),
}).strict().refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, 'Invalid date range');
const reference = z.object({ id: bookingReadId, name: z.string().nullable(), isActive: z.boolean().nullable() }).strict();
export const bookingWorkspaceRow = z.object({
  id: bookingReadId, merchantId: bookingReadId, service: reference, staff: reference.nullable(),
  customerName: z.string().nullable(), customerPhone: z.string().nullable(),
  date: serviceBookingDate.nullable(), startTime: serviceBookingTime.nullable(), endTime: serviceBookingTime.nullable(),
  durationMinutes: z.number().int().min(1).max(1439).nullable(),
  status: serviceBookingStatus, paymentStatus: bookingPaymentState, finalPrice: count.nullable(),
  issues: z.array(z.string()),
}).strict();
const scope = { actorId: bookingReadId, merchantId: bookingReadId, canManage: z.boolean(), checkedAt: z.string().datetime() };
export const bookingWorkspaceSchema = z.object({
  ...scope, selection: bookingWorkspaceInput,
  summary: z.object({
    total: count,
    counts: z.object({ pending: count, confirmed: count, in_progress: count, completed: count, cancelled: count, no_show: count, unknown: count }).strict(),
    payments: z.object({ unpaid: count, paid: count, refunded: count, unknown: count }).strict(),
    paidValue: z.object({ minor: count.nullable(), eligible: count, invalid: count }).strict(),
  }).strict(),
  pagination: z.object({ page: count.min(1), pageSize: z.literal(bookingPageSize), total: count, pages: count }).strict(),
  rows: z.array(bookingWorkspaceRow).max(bookingPageSize),
}).strict().superRefine((value, ctx) => {
  const { summary: s, pagination: p } = value, paid = s.paidValue;
  if (p.page !== value.selection.page || p.total !== s.total || p.pages !== Math.ceil(s.total / bookingPageSize)
    || value.rows.length !== Math.min(bookingPageSize, Math.max(0, s.total - (p.page - 1) * bookingPageSize))
    || value.rows.some(row => row.merchantId !== value.merchantId) || new Set(value.rows.map(row => row.id)).size !== value.rows.length
    || Object.values(s.counts).reduce((a, b) => a + b, 0) !== s.total || Object.values(s.payments).reduce((a, b) => a + b, 0) !== s.total
    || paid.eligible > Math.min(s.counts.completed, s.payments.paid) || paid.invalid > paid.eligible
    || (paid.invalid > 0) !== (paid.minor === null) || paid.eligible === 0 && paid.minor !== 0)
    ctx.addIssue({ code: 'custom', message: 'Inconsistent booking workspace' });
});
export const bookingDetailRow = bookingWorkspaceRow.extend({
  customerEmail: z.string().nullable(), basePrice: count.nullable(), discountAmount: count.nullable(),
  notes: z.string().nullable(), cancellationReason: z.string().nullable(),
  cancelledBy: z.enum(['customer', 'merchant', 'system', 'unknown']).nullable(),
  bookingSource: z.enum(['whatsapp', 'website', 'phone', 'walk_in', 'unknown']),
  customerAgreementId: bookingReadId.nullable(), googleEventId: z.string().nullable(),
  reminder24hSent: z.boolean().nullable(), reminder1hSent: z.boolean().nullable(),
  confirmedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime().nullable(), updatedAt: z.string().datetime().nullable(),
});
export const bookingDetailsSchema = z.object({ ...scope, selection: bookingReadIdentity, booking: bookingDetailRow }).strict()
  .refine(value => value.booking.merchantId === value.merchantId && value.booking.id === value.selection.bookingId, 'Inconsistent booking details');
export type BookingWorkspace = z.infer<typeof bookingWorkspaceSchema>;
export type BookingWorkspaceRow = z.infer<typeof bookingWorkspaceRow>;
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;
