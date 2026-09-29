import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import {
  readWeeklyReportRecords,
  readWeeklyReportRecord,
} from "./weekly-reports-store";

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Weekly reports unavailable",
    });
  }
}
const read = permissionProcedure("analytics.read");
export const weeklyReportsRouter = router({
  list: read
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(52).default(10),
          page: z.number().int().min(1).max(100000).default(1),
        })
        .strict()
    )
    .query(({ ctx, input }) =>
      guarded(() =>
        readWeeklyReportRecords(ctx.merchantId, input.limit, input.page)
      )
    ),
  getById: read
    .input(
      z
        .object({ reportId: z.number().int().positive().max(2147483647) })
        .strict()
    )
    .query(async ({ ctx, input }) => {
      const row = await guarded(() =>
        readWeeklyReportRecord(ctx.merchantId, input.reportId)
      );
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report unavailable",
        });
      return row;
    }),
  // Generates a stored current-week snapshot; does not send email or claim provider-quality evidence.
  generateTest: permissionProcedure("bot_settings.manage")
    .input(z.void())
    .mutation(({ ctx }) =>
      guarded(async () => {
        const { generateWeeklyReport } =
          await import("./reports/sentiment-weekly");
        const reportId = await generateWeeklyReport(ctx.merchantId);
        return { reportId, success: true };
      })
    ),
});
export type WeeklyReportsRouter = typeof weeklyReportsRouter;
