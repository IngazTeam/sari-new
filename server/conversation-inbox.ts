import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { conversations, sariEscalationQueue } from "../drizzle/schema";
import {
  conversationInboxInput,
  type ConversationInboxInput,
} from "../shared/conversation-inbox";
import { getDb, formatDateForDB } from "./db/connection";

/** A single tenant snapshot backs both the total and the visible inbox page. */
export async function readConversationInbox(
  merchantId: number,
  input: ConversationInboxInput = {},
  now = new Date()
) {
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isFinite(now.getTime())
  )
    throw Error("Invalid inbox context");
  const selection = conversationInboxInput.parse(input);
  const db = await getDb();
  if (!db) throw Error("Conversation data is temporarily unavailable");
  const through = formatDateForDB(now),
    cutoff = formatDateForDB(new Date(now.getTime() - 48 * 60 * 60 * 1000));
  return db.transaction(
    async tx => {
      const conditions = [eq(conversations.merchantId, merchantId)];
      if (selection.search)
        conditions.push(
          or(
            sql`locate(${selection.search}, ${conversations.customerName}) > 0`,
            sql`locate(${selection.search}, ${conversations.customerPhone}) > 0`
          )!
        );
      if (selection.stage === "stalled")
        conditions.push(
          inArray(conversations.dealStage, ["interested", "qualified"]),
          lt(conversations.lastMessageAt, cutoff),
          isNull(conversations.lossReason)
        );
      else if (selection.stage === "ready")
        conditions.push(
          eq(conversations.dealStage, "ready"),
          gt(conversations.lastMessageAt, cutoff),
          lte(conversations.lastMessageAt, through)
        );
      else if (selection.stage)
        conditions.push(eq(conversations.dealStage, selection.stage));
      if (selection.needsHuman)
        conditions.push(
          exists(
            tx
              .select({ id: sariEscalationQueue.id })
              .from(sariEscalationQueue)
              .where(
                and(
                  eq(sariEscalationQueue.conversationId, conversations.id),
                  eq(sariEscalationQueue.merchantId, merchantId),
                  inArray(sariEscalationQueue.status, ["pending", "notified"])
                )
              )
          )
        );
      const scope = and(...conditions);
      const [summary] = await tx
        .select({ total: count() })
        .from(conversations)
        .where(scope);
      const total = Number(summary.total);
      const items = await tx
        .select()
        .from(conversations)
        .where(scope)
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(selection.pageSize)
        .offset((selection.page - 1) * selection.pageSize);
      return {
        merchantId,
        items,
        total,
        page: selection.page,
        pageSize: selection.pageSize,
        totalPages: Math.ceil(total / selection.pageSize),
        checkedAt: now.toISOString(),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
