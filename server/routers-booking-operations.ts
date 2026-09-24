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

export const bookingOperationProcedures = {
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
