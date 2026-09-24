import { z } from "zod";
import { bookingConsentAttestationSchema } from "./booking-consent-review";

export const bookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export const bookingTransitions: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};
const id = z.number().int().positive().safe();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const identity = {
  bookingId: id,
  operationId: z
    .string()
    .uuid()
    .transform(value => value.toLowerCase()),
  expectedStatus: bookingStatusSchema,
};
export const bookingOperationalPatchSchema = z
  .object({
    status: bookingStatusSchema.optional(),
    staffId: id.optional(),
    bookingDate: day.optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    notes: z.string().max(2000).optional(),
    cancellationReason: z.string().trim().max(2000).optional(),
  })
  .strict();
export const updateBookingOperationSchema = z
  .object({
    ...identity,
    ...bookingOperationalPatchSchema.shape,
    consentReview: bookingConsentAttestationSchema.optional(),
  })
  .strict()
  .refine(value =>
    Object.keys(bookingOperationalPatchSchema.shape).some(
      key => (value as any)[key] !== undefined
    )
  );
export const deleteBookingOperationSchema = z.object(identity).strict();
export type BookingOperationalPatch = z.infer<
  typeof bookingOperationalPatchSchema
>;
export type UpdateBookingOperationInput = z.infer<
  typeof updateBookingOperationSchema
>;
export type DeleteBookingOperationInput = z.infer<
  typeof deleteBookingOperationSchema
>;
