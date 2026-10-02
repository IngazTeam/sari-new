import { z } from 'zod';
import { bookingOperationalPatchSchema, bookingStatusSchema } from './booking-operations';
import { bookingScheduleSchema, createBookingSchema } from './booking-creation';

export const bookingReadId = z.number().int().positive().max(2_147_483_647);
const day = bookingOperationalPatchSchema.shape.bookingDate.unwrap();
const filters = { status: bookingStatusSchema.optional(), startDate: day.optional(), endDate: day.optional() };
const ordered = (value: { startDate?: string; endDate?: string }) =>
  !value.startDate || !value.endDate || value.startDate <= value.endDate;
export const bookingReadIdentity = z.object({ bookingId: bookingReadId }).strict();
export const bookingListInput = z.object({
  ...filters, serviceId: bookingReadId.optional(), staffId: bookingReadId.optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict().refine(ordered, 'Invalid date range');
export const bookingServiceInput = z.object({ ...filters, serviceId: bookingReadId }).strict().refine(ordered, 'Invalid date range');
export const bookingCustomerInput = z.object({ customerPhone: createBookingSchema.shape.customerPhone }).strict();
export const bookingStatsInput = z.object({ startDate: day.optional(), endDate: day.optional(), serviceId: bookingReadId.optional() }).strict().refine(ordered, 'Invalid date range');
export const bookingAvailabilityInput = bookingScheduleSchema.safeExtend({ serviceId: bookingReadId, staffId: bookingReadId.optional() });
export const bookingSlotsInput = z.object({ serviceId: bookingReadId, date: day, staffId: bookingReadId.optional() }).strict();
