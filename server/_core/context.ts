import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { MerchantRole } from "./permissions";
import { authenticateSessionRequest, type SessionPayload } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  session?: SessionPayload | null;
  /** Populated by merchantProcedure middleware */
  merchantId?: number;
  /** Populated by merchantProcedure middleware */
  merchantRole?: MerchantRole;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let session: SessionPayload | null = null;

  try {
    const authentication = await authenticateSessionRequest(opts.req);
    user = authentication.user;
    session = authentication.session;
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    session,
  };
}
