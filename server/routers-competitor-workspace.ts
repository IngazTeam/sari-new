import {
  settleCompetitorAnalysisJobs,
  CompetitorJobError,
} from "./competitor-analysis-jobs";
import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import {
  competitorSelection,
  competitorDetailSelection,
  competitorDeleteInput,
} from "../shared/competitor-workspace";
import {
  readCompetitorWorkspace,
  readCompetitorDetail,
  CompetitorWorkspaceError,
  deleteReviewedCompetitor,
} from "./competitor-workspace";
function mapped(error: unknown): never {
  throw new TRPCError({
    code:
      (error instanceof CompetitorWorkspaceError ||
        error instanceof CompetitorJobError) &&
      error.reason === "forbidden"
        ? "FORBIDDEN"
        : error instanceof CompetitorWorkspaceError &&
            error.reason === "missing"
          ? "NOT_FOUND"
          : "INTERNAL_SERVER_ERROR",
    message: "competitor_workspace:unavailable",
  });
}
export const competitorReadProcedures = {
  deleteReviewedCompetitor: permissionProcedure("bot_settings.manage")
    .input(competitorDeleteInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteReviewedCompetitor(
          ctx.user.id,
          ctx.merchantId,
          input
        );
      } catch (error) {
        throw new TRPCError({
          code:
            error instanceof CompetitorWorkspaceError
              ? error.reason === "forbidden"
                ? "FORBIDDEN"
                : error.reason === "missing"
                  ? "NOT_FOUND"
                  : error.reason === "stale"
                    ? "CONFLICT"
                    : ["reference", "running"].includes(error.reason)
                      ? "PRECONDITION_FAILED"
                      : "INTERNAL_SERVER_ERROR"
              : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof CompetitorWorkspaceError
              ? error.message
              : "competitor_workspace:unavailable",
        });
      }
    }),
  competitorWorkspace: permissionProcedure("analytics.read")
    .input(competitorSelection)
    .query(async ({ ctx, input }) => {
      try {
        await settleCompetitorAnalysisJobs(ctx.user.id, ctx.merchantId);
        return await readCompetitorWorkspace(
          ctx.user.id,
          ctx.merchantId,
          input
        );
      } catch (error) {
        return mapped(error);
      }
    }),
  competitorDetail: permissionProcedure("analytics.read")
    .input(competitorDetailSelection)
    .query(async ({ ctx, input }) => {
      try {
        await settleCompetitorAnalysisJobs(ctx.user.id, ctx.merchantId);
        return await readCompetitorDetail(ctx.user.id, ctx.merchantId, input);
      } catch (error) {
        return mapped(error);
      }
    }),
};
