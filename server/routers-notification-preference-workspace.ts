import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import { notificationPreferenceSave } from "../shared/notification-preferences-workspace";
import {
  readNotificationPreferences,
  saveNotificationPreferences,
  NotificationPreferenceError,
} from "./notification-preferences-workspace";
export const notificationPreferenceReadProcedures = {
  saveReviewed: merchantProcedure
    .input(notificationPreferenceSave)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveNotificationPreferences(
          ctx.user.id,
          ctx.merchantId,
          input
        );
      } catch (error) {
        const reason =
          error instanceof NotificationPreferenceError
            ? error.reason
            : "unavailable";
        throw new TRPCError({
          code:
            reason === "forbidden"
              ? "FORBIDDEN"
              : ["stale", "duplicate"].includes(reason)
                ? "CONFLICT"
                : "INTERNAL_SERVER_ERROR",
          message: "notification_preferences:" + reason,
        });
      }
    }),
  workspace: merchantProcedure.query(async ({ ctx }) => {
    try {
      return await readNotificationPreferences(ctx.user.id, ctx.merchantId);
    } catch (error) {
      throw new TRPCError({
        code:
          error instanceof NotificationPreferenceError &&
          error.reason === "forbidden"
            ? "FORBIDDEN"
            : "INTERNAL_SERVER_ERROR",
        message: "notification_preferences:unavailable",
      });
    }
  }),
};
