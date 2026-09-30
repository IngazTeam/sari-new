import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { authenticateSessionRequest } from "./_core/auth";
import { completeSheetsOAuth, SheetsOAuthError } from "./sheets-oauth";
export async function guardSheetsOAuth<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const reason =
      error instanceof SheetsOAuthError ? error.reason : "unavailable";
    throw new TRPCError({
      code:
        reason === "forbidden" || reason === "invalid_state"
          ? "FORBIDDEN"
          : reason === "rate_limit"
            ? "TOO_MANY_REQUESTS"
            : reason === "configuration" || reason === "changed"
              ? "PRECONDITION_FAILED"
              : "INTERNAL_SERVER_ERROR",
      message: `sheets_oauth:${reason}`,
    });
  }
}
/** No code, provider text, tenant identifier or credential is reflected in a redirect. */
export async function sheetsOAuthCallback(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const done = (result: string) =>
    res.redirect(`/merchant/sheets/settings?oauth=${result}`);
  const { state, code, error } = req.query;
  if (
    typeof state !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    (error !== undefined && error !== "access_denied") ||
    (error === undefined && typeof code !== "string")
  )
    return done("invalid");
  let authentication;
  try {
    authentication = await authenticateSessionRequest(req);
  } catch {
    return done("session");
  }
  try {
    const result = await completeSheetsOAuth({
      userId: authentication.user.id,
      sessionId: authentication.session.sessionId,
      state,
      code: typeof code === "string" ? code : undefined,
      denied: error === "access_denied",
    });
    return done(result.cancelled ? "cancelled" : "connected");
  } catch {
    return done("failed");
  }
}
