import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import {
  reportWorkspaceInput,
  reportPeriodInput,
  reportSalesInput,
  salesReportSchema,
  customersReportSchema,
  conversationsReportSchema,
} from "../shared/report-workspace";
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
  // Existing consumers share the same source and permission boundary during migration.
  getSalesReport: permissionProcedure("analytics.read")
    .input(reportSalesInput)
    .query(async ({ ctx, input }) =>
      salesReportSchema.parse(
        await read(ctx.merchantId, { ...input, kind: "sales" })
      )
    ),
  getCustomersReport: permissionProcedure("analytics.read")
    .input(reportPeriodInput)
    .query(async ({ ctx, input }) =>
      customersReportSchema.parse(
        await read(ctx.merchantId, { ...input, kind: "customers" })
      )
    ),
  getConversationsReport: permissionProcedure("analytics.read")
    .input(reportPeriodInput)
    .query(async ({ ctx, input }) =>
      conversationsReportSchema.parse(
        await read(ctx.merchantId, { ...input, kind: "conversations" })
      )
    ),
});
export type ReportsRouter = typeof reportsRouter;
