import { TRPCError } from "@trpc/server";
import { SheetsSetupError } from "./sheets-setup-attempts";
import { SheetsOAuthError } from "./sheets-oauth";
export async function guardSheetsSetup<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const reason =
      error instanceof SheetsSetupError || error instanceof SheetsOAuthError
        ? error.reason
        : "unavailable";
    throw new TRPCError({
      code:
        reason === "forbidden"
          ? "FORBIDDEN"
          : reason === "missing"
            ? "NOT_FOUND"
            : reason === "rate_limit"
              ? "TOO_MANY_REQUESTS"
              : ["pending", "changed", "configuration"].includes(reason)
                ? "PRECONDITION_FAILED"
                : "INTERNAL_SERVER_ERROR",
      message: `sheets_setup:${reason}`,
    });
  }
}
