import { z } from "zod";
import { bookingCalendarActionSchema } from "./booking-calendar";

export const bookingCancellationActionSchema =
  bookingCalendarActionSchema.extend({
    action: z.enum(["cancel", "verify"]),
  });
export type BookingCancellationAction = z.infer<
  typeof bookingCancellationActionSchema
>;
export type BookingCancellationReview = {
  state: string;
  evidence: string;
  canCancel: boolean;
  canVerify: boolean;
  blocker: string | null;
  appointment: {
    serviceName: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  request: { id: number; text: string; at: string } | null;
  originalRequest: { id: number; text: string; at: string } | null;
  history: { action: string; outcome: string; reason: string; at: string }[];
};
