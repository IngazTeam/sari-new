import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import { pipelineInput } from "../shared/pipeline-workspace";
import {
  readPipelineWorkspace,
  readPipelineBundle,
} from "./pipeline-workspace";
import {
  legacyPipelineCounts,
  legacyPipelineKPIs,
  legacyPipelineLosses,
  readLegacyPipelineSummary,
} from "./pipeline-legacy";
const readProcedure = permissionProcedure("conversations.read").use(
  ({ ctx, next }) => {
    if (!hasPermission(ctx.merchantRole, "analytics.read"))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Pipeline analytics permission required",
      });
    return next({ ctx });
  }
);
async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pipeline unavailable",
    });
  }
}
const defaultSelection = { queue: "ready" as const, page: 1, pageSize: 20 };
export const salesPipelineRouter = router({
  workspace: readProcedure
    .input(pipelineInput)
    .query(({ ctx, input }) =>
      guarded(() => readPipelineWorkspace(ctx.merchantId, input))
    ),
  getPipeline: readProcedure.query(({ ctx }) =>
    guarded(() => readLegacyPipelineSummary(ctx.merchantId))
  ),
  getActionCounts: readProcedure.query(({ ctx }) =>
    guarded(async () =>
      legacyPipelineCounts(
        await readPipelineWorkspace(ctx.merchantId, defaultSelection)
      )
    )
  ),
  getKPIs: readProcedure.query(({ ctx }) =>
    guarded(async () =>
      legacyPipelineKPIs(
        await readPipelineWorkspace(ctx.merchantId, defaultSelection)
      )
    )
  ),
  getLossBreakdown: readProcedure
    .input(
      z.object({ days: z.number().int().min(1).max(365).default(30) }).strict()
    )
    .query(({ ctx, input }) =>
      guarded(async () =>
        legacyPipelineLosses(
          (
            await readPipelineBundle(
              ctx.merchantId,
              defaultSelection,
              new Date(),
              { days: input.days }
            )
          ).snapshot
        )
      )
    ),
});
export type SalesPipelineRouter = typeof salesPipelineRouter;
