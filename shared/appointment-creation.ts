import { z } from "zod";
import { bookingScheduleSchema, createBookingSchema } from "./booking-creation";

export const appointmentAvailabilitySchema = z
  .object({
    serviceId: bookingScheduleSchema.shape.serviceId,
    staffId: bookingScheduleSchema.shape.staffId,
    date: bookingScheduleSchema.shape.bookingDate,
  })
  .strict();
export const appointmentCreationSchema = z
  .object({
    serviceId: bookingScheduleSchema.shape.serviceId,
    staffId: bookingScheduleSchema.shape.staffId,
    appointmentDate: bookingScheduleSchema.shape.bookingDate,
    startTime: bookingScheduleSchema.shape.startTime,
    customerPhone: createBookingSchema.shape.customerPhone,
    customerName: createBookingSchema.shape.customerName,
    notes: createBookingSchema.shape.notes,
  })
  .strict();
export const scopedAppointmentCreationSchema = appointmentCreationSchema.extend(
  {
    merchantId: z.number().int().positive().safe(),
  }
);
export const appointmentCancellationSchema = z
  .object({
    appointmentId: z.number().int().positive().safe(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();
export type AppointmentCreationInput = z.infer<
  typeof scopedAppointmentCreationSchema
>;
