import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { overviewWorkspaceInput } from "../shared/overview-workspace";
import { readOverviewWorkspace } from "./overview-workspace";
export const overviewWorkspaceRouter = router({
  read: permissionProcedure("analytics.read")
    .input(overviewWorkspaceInput)
    .query(async ({ ctx, input }) => {
      try {
        return await readOverviewWorkspace(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Overview unavailable",
        });
      }
    }),
});
