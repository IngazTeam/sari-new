import { z } from "zod";
import { bookingCalendarActionSchema } from "./booking-calendar";
export const bookingRescheduleActionSchema = bookingCalendarActionSchema
  .extend({ action: z.enum(["move", "verify", "abandon"]) })
  .strict();
export type BookingRescheduleAction = z.infer<
  typeof bookingRescheduleActionSchema
>;
export type BookingRescheduleReview = {
  state: string;
  evidence: string;
  canMove: boolean;
  canVerify: boolean;
  canAbandon: boolean;
  blocker: string | null;
  before: { date: string; startTime: string; endTime: string };
  after: { date: string; startTime: string; endTime: string };
  offerText: string;
  consent: { id: number; text: string; at: string } | null;
  history: { action: string; outcome: string; reason: string; at: string }[];
  notification?: {
    state: string;
    delivery: string;
    projected: boolean;
    text: string;
    acceptedAt: string | null;
  } | null;
};
