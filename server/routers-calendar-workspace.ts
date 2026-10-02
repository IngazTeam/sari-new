import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  calendarWorkspaceInput,
  calendarDetailsInput,
  calendarStatsInput,
} from "../shared/calendar-workspace";
import {
  readCalendarWorkspace,
  readCalendarDetails,
  CalendarWorkspaceMissingError,
  readCalendarStats,
} from "./calendar-workspace";
const failure = (error: unknown) =>
  new TRPCError({
    code:
      error instanceof CalendarWorkspaceMissingError
        ? "NOT_FOUND"
        : "INTERNAL_SERVER_ERROR",
    message:
      error instanceof CalendarWorkspaceMissingError
        ? "Appointment or reference not found"
        : "Calendar data unavailable",
  });
export const calendarWorkspaceProcedures = {
  getStats: merchantProcedure
    .input(calendarStatsInput)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await readCalendarStats(ctx.user.id, ctx.merchantId, input)),
          canManage: hasPermission(ctx.merchantRole, "orders.manage"),
          canManageIntegration: hasPermission(
            ctx.merchantRole,
            "integrations.manage"
          ),
        };
      } catch (error) {
        throw failure(error);
      }
    }),
  workspace: merchantProcedure
    .input(calendarWorkspaceInput)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await readCalendarWorkspace(ctx.user.id, ctx.merchantId, input)),
          canManage: hasPermission(ctx.merchantRole, "orders.manage"),
          canManageIntegration: hasPermission(
            ctx.merchantRole,
            "integrations.manage"
          ),
        };
      } catch (error) {
        throw failure(error);
      }
    }),
  details: merchantProcedure
    .input(calendarDetailsInput)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await readCalendarDetails(ctx.user.id, ctx.merchantId, input)),
          canManage: hasPermission(ctx.merchantRole, "orders.manage"),
          canManageIntegration: hasPermission(
            ctx.merchantRole,
            "integrations.manage"
          ),
        };
      } catch (error) {
        throw failure(error);
      }
    }),
};
