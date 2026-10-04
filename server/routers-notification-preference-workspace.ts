import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import {
  readNotificationPreferences,
  NotificationPreferenceError,
} from "./notification-preferences-workspace";
export const notificationPreferenceReadProcedures = {
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
