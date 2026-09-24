import { z } from "zod";
import { bookingCalendarActionSchema } from "./booking-calendar";
export const bookingRescheduleActionSchema = bookingCalendarActionSchema
  .extend({ action: z.enum(["move", "verify", "abandon"]) })
  .strict();
export type BookingRescheduleAction = z.infer<
  typeof bookingRescheduleActionSchema
>;
export const bookingNotificationReviewSchema = bookingCalendarActionSchema
  .omit({ action: true })
  .extend({ notificationId: z.number().int().positive().safe() })
  .strict();
export type BookingNotificationReviewInput = z.infer<
  typeof bookingNotificationReviewSchema
>;
export type BookingNoticeReview = {
  id: number;
  kind: "reschedule" | "cancellation";
  evidence: string;
  canReview: boolean;
  state: string;
  delivery: string;
  projected: boolean;
  text: string;
  receipt: string | null;
  issue: string | null;
  dispatchAt: string | null;
  acceptedAt: string | null;
  history: {
    actorUserId: number;
    reason: string;
    state: string;
    delivery: string;
    projected: boolean;
    at: string;
  }[];
};
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
  notification?: BookingNoticeReview | null;
};
