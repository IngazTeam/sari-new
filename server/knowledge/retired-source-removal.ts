import { TRPCError } from "@trpc/server";
/** Old tabs must not bypass the current review, catalog locks or durable receipt. */
export function retiredSourceRemoval(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Refresh the dashboard and review source removal before continuing",
  });
}
