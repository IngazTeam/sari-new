import { z } from "zod";
import { bookingOperationalPatchSchema } from "./booking-operations";

const id = z.number().int().positive().safe();
const money = z.number().int().min(0).max(2_147_483_647);
export const bookingScheduleSchema = z
  .object({
    serviceId: id,
    staffId: id.optional(),
    bookingDate: bookingOperationalPatchSchema.shape.bookingDate.unwrap(),
    startTime: bookingOperationalPatchSchema.shape.startTime.unwrap(),
    endTime: bookingOperationalPatchSchema.shape.endTime.unwrap(),
  })
  .strict()
  .refine(value => value.startTime < value.endTime);
// Authorized staff retain manual duration/price entry; creation does not mark payment paid.
export const createBookingSchema = z
  .object({
    ...bookingScheduleSchema.shape,
    customerPhone: z
      .string()
      .trim()
      .min(8)
      .max(20)
      .regex(/^\+?\d+$/),
    customerName: z.string().trim().max(255).optional(),
    customerEmail: z.string().email().max(255).optional(),
    durationMinutes: z.number().int().min(1).max(1439),
    basePrice: money,
    discountAmount: money.optional(),
    finalPrice: money,
    notes: z.string().max(2000).optional(),
    bookingSource: z
      .enum(["whatsapp", "website", "phone", "walk_in"])
      .optional(),
  })
  .strict()
  .refine(value => {
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return (
      minutes(value.endTime) - minutes(value.startTime) ===
      value.durationMinutes
    );
  });
export const createScopedBookingSchema = createBookingSchema.safeExtend({
  merchantId: id,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateScopedBookingInput = z.infer<
  typeof createScopedBookingSchema
>;
export type BookingSchedule = z.infer<typeof bookingScheduleSchema>;
