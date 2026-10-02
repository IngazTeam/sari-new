import { calendarConnectionProcedures } from "./routers-calendar-connection";
import { calendarReconciliationProcedures } from "./routers-calendar-reconciliation";
import { calendarAppointmentProcedures } from "./routers-calendar-appointments";
/**
 * Calendar Router Module
 * Handles Google Calendar integration
 *
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getAppointmentStats, getMerchantByUserId } from "./db";

export const calendarRouter = router({
  ...calendarConnectionProcedures,

  ...calendarAppointmentProcedures,

  ...calendarReconciliationProcedures,

  // Get appointment statistics
  getStats: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Merchant not found",
        });

      return await getAppointmentStats(
        merchant.id,
        input.startDate,
        input.endDate
      );
    }),
});

export type CalendarRouter = typeof calendarRouter;
