import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { selfProfileRename } from "../shared/self-profile-workspace";
import {
  readSelfProfile,
  renameSelfProfile,
  SelfProfileError,
} from "./accounts/self-profile-workspace";
function failure(error: unknown): never {
  const reason =
    error instanceof SelfProfileError ? error.reason : "unavailable";
  throw new TRPCError({
    code:
      reason === "forbidden"
        ? "FORBIDDEN"
        : reason === "stale"
          ? "CONFLICT"
          : "INTERNAL_SERVER_ERROR",
    message: "self_profile:" + reason,
  });
}
export const selfProfileProcedures = {
  selfProfileWorkspace: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await readSelfProfile(ctx.user.id);
    } catch (error) {
      return failure(error);
    }
  }),
  renameReviewed: protectedProcedure
    .input(selfProfileRename)
    .mutation(async ({ ctx, input }) => {
      try {
        return await renameSelfProfile(ctx.user.id, input);
      } catch (error) {
        return failure(error);
      }
    }),
};
