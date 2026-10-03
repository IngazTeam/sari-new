import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import {
  competitorSelection,
  competitorDetailSelection,
} from "../shared/competitor-workspace";
import {
  readCompetitorWorkspace,
  readCompetitorDetail,
  CompetitorWorkspaceError,
} from "./competitor-workspace";
function mapped(error: unknown): never {
  throw new TRPCError({
    code:
      error instanceof CompetitorWorkspaceError && error.reason === "forbidden"
        ? "FORBIDDEN"
        : error instanceof CompetitorWorkspaceError &&
            error.reason === "missing"
          ? "NOT_FOUND"
          : "INTERNAL_SERVER_ERROR",
    message: "competitor_workspace:unavailable",
  });
}
export const competitorReadProcedures = {
  competitorWorkspace: permissionProcedure("analytics.read")
    .input(competitorSelection)
    .query(async ({ ctx, input }) => {
      try {
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
        return await readCompetitorDetail(ctx.user.id, ctx.merchantId, input);
      } catch (error) {
        return mapped(error);
      }
    }),
};
