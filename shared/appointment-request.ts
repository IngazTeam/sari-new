import { z } from "zod";
import { appointmentCreationSchema } from "./appointment-creation";

const requestId = z
  .string()
  .uuid()
  .transform(value => value.toLowerCase());
export const appointmentRequestLookupSchema = z.object({ requestId }).strict();
export const appointmentCommandSchema = appointmentCreationSchema
  .extend({ requestId })
  .strict();
export const appointmentRequestIdentitySchema = appointmentRequestLookupSchema
  .extend({
    actorUserId: z.number().int().positive().safe(),
  })
  .strict();
export type AppointmentRequestIdentity = z.infer<
  typeof appointmentRequestIdentitySchema
>;
