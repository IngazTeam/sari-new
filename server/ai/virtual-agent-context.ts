import { and, eq } from "drizzle-orm";
import { virtualAgents } from "../../drizzle/schema";
import { getDb } from "../db/connection";

/** A persisted agent id is a reference, never cross-tenant authority. */
export async function getMerchantVirtualAgent(
  merchantId: number,
  agentId: number
) {
  if (![merchantId, agentId].every(n => Number.isSafeInteger(n) && n > 0))
    return null;
  const db = await getDb();
  if (!db) throw new Error("Virtual agent storage unavailable");
  const [agent] = await db
    .select()
    .from(virtualAgents)
    .where(
      and(
        eq(virtualAgents.merchantId, merchantId),
        eq(virtualAgents.id, agentId)
      )
    )
    .limit(1);
  return agent ?? null;
}

export async function listMerchantVirtualAgents(merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0)
    throw new Error("Invalid merchant");
  const db = await getDb();
  if (!db) throw new Error("Virtual agent storage unavailable");
  return db
    .select()
    .from(virtualAgents)
    .where(eq(virtualAgents.merchantId, merchantId))
    .orderBy(virtualAgents.sortOrder, virtualAgents.id);
}
