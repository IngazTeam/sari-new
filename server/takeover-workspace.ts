import { and, desc, eq, sql } from "drizzle-orm";
import { conversations } from "../drizzle/schema";
import { getDb } from "./db/connection";
import {
  TAKEOVER_DURATION_MS,
  MAX_PERMANENT_TAKEOVER_MS,
} from "./ai/takeover-constants";

export async function readTakeoverWorkspace(merchantId: number, page: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const where = and(
      eq(conversations.merchantId, merchantId),
      eq(conversations.humanTakeover, 1)
    );
    const [count] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(conversations)
      .where(where);
    const rows = await tx
      .select({
        id: conversations.id,
        customerName: conversations.customerName,
        customerPhone: conversations.customerPhone,
        humanTakeoverAt: conversations.humanTakeoverAt,
        humanExpiresAt: conversations.humanExpiresAt,
        agentHistory: conversations.agentHistory,
      })
      .from(conversations)
      .where(where)
      .orderBy(desc(conversations.id))
      .limit(10)
      .offset((page - 1) * 10);
    return {
      rows: rows.map(({ agentHistory, ...row }) => {
        let permanentSilence = false;
        try {
          permanentSilence =
            JSON.parse(agentHistory || "{}")?.permanentSilence === true;
        } catch {
          /* Legacy metadata may be malformed. */
        }
        return { ...row, permanentSilence };
      }),
      total: Number(count.total),
      page,
      pageSize: 10,
      observedAt: new Date().toISOString(),
      directReplyHours: TAKEOVER_DURATION_MS / 3600000,
      manualMaxHours: MAX_PERMANENT_TAKEOVER_MS / 3600000,
    };
  });
}
