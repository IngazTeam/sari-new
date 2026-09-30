import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { reportWorkspaceInput } from "../shared/report-workspace";
import { readReportWorkspace } from "./report-workspace";

async function read(merchantId: number, input: unknown) {
  try {
    return await readReportWorkspace(merchantId, input);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Reports unavailable",
    });
  }
}
export const reportsRouter = router({
  workspace: permissionProcedure("analytics.read")
    .input(reportWorkspaceInput)
    .query(({ ctx, input }) => read(ctx.merchantId, input)),
});
export type ReportsRouter = typeof reportsRouter;
