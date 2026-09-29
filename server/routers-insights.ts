import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import * as dbInsights from "./db-insights";
import { readInsightWorkspace } from "./insights-workspace";
import {
  insightPeriod,
  insightWorkspaceInput,
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
  getActiveABTests: read.query(({ ctx }) =>
    guarded(() => dbInsights.getActiveABTests(ctx.merchantId))
  ),
});
