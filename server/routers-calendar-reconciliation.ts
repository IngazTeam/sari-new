import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  appointmentIdSchema,
  calendarListSchema,
  reconcileAppointmentSchema,
} from "../shared/appointment-reconciliation";
import {
  readAppointmentReview,
  reconcileAppointment,
} from "./appointment-reconciliation";
import { readCalendarAppointments } from "./calendar-read";
import { getGoogleIntegration } from "./db";
const failure = () =>
  new TRPCError({
    code: "CONFLICT",
    message:
      "Calendar evidence changed or is unavailable; refresh before reviewing again",
  });
export const calendarReconciliationProcedures = {
  listAppointments: merchantProcedure
    .input(calendarListSchema)
    .query(async ({ ctx, input }) => ({
      ...(await readCalendarAppointments(ctx.merchantId, input)),
      canManage: hasPermission(ctx.merchantRole, "orders.manage"),
      canManageIntegration: hasPermission(
        ctx.merchantRole,
        "integrations.manage"
      ),
    })),
  getStatus: merchantProcedure.query(async ({ ctx }) => {
    const integration = await getGoogleIntegration(ctx.merchantId, "calendar");
    return {
      connected: integration?.isActive === 1,
      calendarId: integration?.calendarId,
      lastSync: integration?.lastSync,
    };
  }),
  getSyncReview: permissionProcedure("orders.manage")
    .input(appointmentIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await readAppointmentReview(ctx.merchantId, input.appointmentId)),
          canBind: hasPermission(ctx.merchantRole, "integrations.manage"),
        };
      } catch {
        throw failure();
      }
    }),
  reconcileSync: permissionProcedure("orders.manage")
    .input(reconcileAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (
        input.bindingReviewed &&
        !hasPermission(ctx.merchantRole, "integrations.manage")
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Legacy binding requires integration management permission",
        });
      try {
        return await reconcileAppointment(ctx.merchantId, ctx.user.id, input);
      } catch {
        throw failure();
      }
    }),
};
