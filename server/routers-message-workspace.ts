import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { messageWorkspaceInput } from "../shared/message-workspace";
import { readMessageWorkspace } from "./message-workspace";
export const messageWorkspaceRouter = router({
  read: permissionProcedure("analytics.read")
    .input(messageWorkspaceInput)
    .query(async ({ ctx, input }) => {
      try {
        return await readMessageWorkspace(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Message analytics unavailable",
        });
      }
    }),
});
