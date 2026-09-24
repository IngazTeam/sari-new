import { z } from "zod";
import { appointmentCreationSchema } from "./appointment-creation";
export const appointmentIdSchema = z
  .object({ appointmentId: z.number().int().positive().safe() })
  .strict();
export const reconcileAppointmentSchema = appointmentIdSchema
  .extend({
    requestId: z.string().uuid(),
    evidence: z.string().regex(/^[a-f0-9]{64}$/),
    eventId: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{5,255}$/),
    action: z.enum(["restore_sync", "confirm_cancellation"]),
    reviewed: z.literal(true),
    bindingReviewed: z.boolean().default(false),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type ReconcileAppointmentInput = z.infer<
  typeof reconcileAppointmentSchema
>;
export const calendarListSchema = z
  .object({
    startDate: appointmentCreationSchema.shape.appointmentDate,
    endDate: appointmentCreationSchema.shape.appointmentDate,
    status: z
      .enum(["pending", "confirmed", "cancelled", "completed", "no_show"])
      .optional(),
  })
  .strict()
  .refine(value => {
    const span = Date.parse(value.endDate) - Date.parse(value.startDate);
    return span >= 0 && span <= 92 * 86400000;
  });
