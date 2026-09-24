import { z } from "zod";
export const bookingCalendarIdSchema = z
  .object({ bookingId: z.number().int().positive().safe() })
  .strict();
export const bookingCalendarActionSchema = bookingCalendarIdSchema
  .extend({
    requestId: z.string().uuid(),
    evidence: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["create", "verify"]),
    reviewed: z.literal(true),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type BookingCalendarAction = z.infer<typeof bookingCalendarActionSchema>;
export type BookingCalendarReview = {
  state: string;
  eventId: string | null;
  calendarId: string | null;
  evidence: string;
  canCreate: boolean;
  canVerify: boolean;
  canRelease: boolean;
  blocked: string | null;
  checkedAt: string | null;
  history: {
    action: string;
    outcome: string;
    failureCode: string | null;
    reason: string;
    actorUserId: number;
    at: string;
  }[];
};
