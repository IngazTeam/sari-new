import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { testMetricsInput } from "../shared/test-metrics-workspace";
import { readTestMetricsWorkspace } from "./test-metrics-workspace";
export const testMetricsWorkspaceRouter = router({
  read: permissionProcedure("analytics.read")
    .input(testMetricsInput)
    .query(async ({ ctx, input }) => {
      try {
        return await readTestMetricsWorkspace(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Test metrics unavailable",
        });
      }
    }),
});
