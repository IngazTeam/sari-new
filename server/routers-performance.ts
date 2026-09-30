import { permissionProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  performanceInput,
  performanceWindows,
  type PerformanceInput,
} from "../shared/performance-workspace";
import { readPerformanceWorkspace } from "./performance-workspace";
import { legacyPerformanceResult } from "./performance-legacy";
async function read(merchantId: number, input: PerformanceInput) {
  try {
    performanceWindows(input);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose up to 90 UTC dates ending no later than today",
    });
  }
  try {
    return await readPerformanceWorkspace(merchantId, input);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Performance unavailable",
    });
  }
}
export const performanceRouter = router({
  workspace: permissionProcedure("analytics.read")
    .input(performanceInput)
    .query(({ ctx, input }) => read(ctx.merchantId, input)),
  getPerformanceMetrics: permissionProcedure("analytics.read")
    .input(
      z
        .object({
          merchantId: z.number().int().positive().optional(),
          startDate: z.string().date(),
          endDate: z.string().date(),
        })
        .strict()
    )
    .query(async ({ ctx, input }) => {
      if (input.merchantId !== undefined && input.merchantId !== ctx.merchantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      return legacyPerformanceResult(
        await read(ctx.merchantId, {
          startDate: input.startDate,
          endDate: input.endDate,
        })
      );
    }),
});
