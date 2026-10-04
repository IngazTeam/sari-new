import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import {
  accountNotificationsInput,
  accountNotificationDetailInput,
  accountNotificationAction,
  accountNotificationsReadAllInput,
} from "../shared/account-notifications-workspace";
import {
  AccountNotificationError,
  readAccountNotifications,
  readAccountNotification,
  applyAccountNotificationAction,
  markAccountNotificationsRead,
} from "./accounts/notification-workspace";
async function guard<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    const reason =
      error instanceof AccountNotificationError ? error.reason : "unavailable";
    throw new TRPCError({
      code:
        reason === "forbidden"
          ? "FORBIDDEN"
          : reason === "missing"
            ? "NOT_FOUND"
            : reason === "stale"
              ? "CONFLICT"
              : "INTERNAL_SERVER_ERROR",
      message: "account_notifications:" + reason,
    });
  }
}
export const accountNotificationsWorkspaceRouter = router({
  list: protectedProcedure
    .input(accountNotificationsInput)
    .query(({ ctx, input }) =>
      guard(() => readAccountNotifications(ctx.user.id, input))
    ),
  detail: protectedProcedure
    .input(accountNotificationDetailInput)
    .query(({ ctx, input }) =>
      guard(() => readAccountNotification(ctx.user.id, input))
    ),
  applyReviewed: protectedProcedure
    .input(accountNotificationAction)
    .mutation(({ ctx, input }) =>
      guard(() => applyAccountNotificationAction(ctx.user.id, input))
    ),
  readAllReviewed: protectedProcedure
    .input(accountNotificationsReadAllInput)
    .mutation(({ ctx, input }) =>
      guard(() => markAccountNotificationsRead(ctx.user.id, input))
    ),
});
