/** Account inbox; distinct from push delivery and tenant notification preferences. */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { accountNotificationsWorkspaceRouter } from "./routers-account-notifications-workspace";
const retired = (): never => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "account_notifications:workspace_required",
  });
};
const legacyId = z
  .object({ id: z.number().int().positive().max(2147483647) })
  .strict();
export const userNotificationsRouter = router({
  workspace: accountNotificationsWorkspaceRouter,
  list: protectedProcedure.input(z.void()).query(retired),
  unreadCount: protectedProcedure.input(z.void()).query(retired),
  markAsRead: protectedProcedure.input(legacyId).mutation(retired),
  markAllAsRead: protectedProcedure.input(z.void()).mutation(retired),
  delete: protectedProcedure.input(legacyId).mutation(retired),
});
export type UserNotificationsRouter = typeof userNotificationsRouter;
