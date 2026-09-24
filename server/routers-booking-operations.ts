import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import {
  updateBookingOperationSchema,
  deleteBookingOperationSchema,
} from "../shared/booking-operations";
import { updateBooking, deleteBooking } from "./db";
import { getBookingOperationHistory } from "./booking-operations";
import { getBookingConsentReview } from "./booking-consent-review";
import {
  bookingCalendarActionSchema,
  bookingCalendarIdSchema,
} from "../shared/booking-calendar";
import {
  readBookingCalendarReview,
  synchronizeBookingCalendar,
} from "./booking-calendar";
import { bookingCancellationActionSchema } from "../shared/booking-cancellation";
import {
  getBookingCancellationReview,
  cancelBookingCalendar,
} from "./booking-cancellation";
import { bookingRescheduleActionSchema } from "../shared/booking-reschedule";
import {
  getBookingRescheduleReview,
  rescheduleBookingCalendar,
} from "./booking-reschedule";

export const bookingOperationProcedures = {
  getRescheduleReview: permissionProcedure("orders.manage")
    .input(bookingCalendarIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getBookingRescheduleReview(
          ctx.merchantId,
          input.bookingId
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking reschedule review unavailable",
        });
      }
    }),
  rescheduleCalendar: permissionProcedure("orders.manage")
    .input(bookingRescheduleActionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rescheduleBookingCalendar(
          ctx.merchantId,
          ctx.user.id,
          input
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking reschedule requires refreshed evidence",
        });
      }
    }),
  getCancellationReview: permissionProcedure("orders.manage")
    .input(bookingCalendarIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getBookingCancellationReview(
          ctx.merchantId,
          input.bookingId
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking cancellation review unavailable",
        });
      }
    }),
  cancelCalendar: permissionProcedure("orders.manage")
    .input(bookingCancellationActionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelBookingCalendar(ctx.merchantId, ctx.user.id, input);
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking cancellation requires refreshed evidence",
        });
      }
    }),
  getCalendarReview: permissionProcedure("orders.manage")
    .input(bookingCalendarIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await readBookingCalendarReview(ctx.merchantId, input.bookingId);
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking calendar review unavailable",
        });
      }
    }),
  synchronizeCalendar: permissionProcedure("orders.manage")
    .input(bookingCalendarActionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await synchronizeBookingCalendar(
          ctx.merchantId,
          ctx.user.id,
          input
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking calendar requires refreshed evidence",
        });
      }
    }),
  getConsentReview: permissionProcedure("orders.manage")
    .input(z.object({ bookingId: z.number().int().positive().safe() }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await getBookingConsentReview(ctx.merchantId, input.bookingId);
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking consent review unavailable",
        });
      }
    }),
  update: permissionProcedure("orders.manage")
    .input(updateBookingOperationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateBooking(
          input.bookingId,
          input,
          ctx.merchantId,
          ctx.user.id
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Booking operation unavailable; refresh the booking and payment records",
        });
      }
    }),
  delete: permissionProcedure("orders.manage")
    .input(deleteBookingOperationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteBooking(
          input.bookingId,
          input,
          ctx.merchantId,
          ctx.user.id
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Booking deletion unavailable; retain bookings with financial or operational history",
        });
      }
    }),
  getOperationHistory: permissionProcedure("orders.manage")
    .input(z.object({ bookingId: z.number().int().positive().safe() }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await getBookingOperationHistory(
          ctx.merchantId,
          input.bookingId
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Booking operation history unavailable",
        });
      }
    }),
};
