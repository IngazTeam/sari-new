import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import * as dbInsights from "./db-insights";
import { readInsightWorkspace, readInsightReport } from "./insights-workspace";
import {
  insightPeriod,
  insightWorkspaceInput,
  legacyInsightTestSelection,
} from "../shared/insights-workspace";
const read = permissionProcedure("analytics.read");
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Insights unavailable",
    });
  }
}
export const insightsRouter = router({
  report: read
    .input(
      z
        .object({ reportId: z.number().int().positive().max(2147483647) })
        .strict()
    )
    .query(async ({ ctx, input }) => {
      const result = await guarded(() =>
        readInsightReport(ctx.merchantId, input.reportId)
      );
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report unavailable",
        });
      return result;
    }),
  workspace: read
    .input(insightWorkspaceInput)
    .query(({ ctx, input }) =>
      guarded(() => readInsightWorkspace(ctx.merchantId, input))
    ),
  getKeywordStats: read
    .input(z.object({ period: insightPeriod.default("30d") }).strict())
    .query(({ ctx, input }) =>
      guarded(() => dbInsights.getKeywordInsights(ctx.merchantId, input.period))
    ),
  getWeeklyReports: read
    .input(
      z.object({ limit: z.number().int().min(1).max(52).default(4) }).strict()
    )
    .query(({ ctx, input }) =>
      guarded(() =>
        dbInsights.getWeeklyReportsList(ctx.merchantId, input.limit)
      )
    ),
  getActiveABTests: read
    .input(legacyInsightTestSelection.optional())
    .query(({ ctx, input }) =>
      guarded(() => dbInsights.getActiveABTests(ctx.merchantId, input))
    ),
});
