import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import { createBookingSchema } from "../shared/booking-creation";
import { createBooking } from "./db";

export const bookingCreationProcedure = permissionProcedure("orders.manage")
  .input(createBookingSchema)
  .mutation(async ({ ctx, input }) => {
    try {
      return {
        success: true,
        bookingId: await createBooking({
          ...input,
          merchantId: ctx.merchantId,
        }),
      };
    } catch {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Booking unavailable; verify the service, staff, duration and current availability",
      });
    }
  });
