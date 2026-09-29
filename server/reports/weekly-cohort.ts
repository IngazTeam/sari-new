import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  conversations,
  messages,
  sentimentAnalysis,
  keywordAnalysis,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { sentimentObservation } from "../../shared/insights-workspace";

/** Current Sunday-based UTC week, ending at the captured second, never in the future. */
export function currentReportWindow(now = new Date()) {
  const end = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  start.setUTCHours(0, 0, 0, 0);
  return {
    start,
    end,
    sqlStart: start.toISOString().slice(0, 19).replace("T", " "),
    sqlEnd: end.toISOString().slice(0, 19).replace("T", " "),
  };
}

/** One stored incoming-message classification per conversation created in the same UTC window.
 * This is a descriptive sample, not a satisfaction survey or evidence of sales conversion.
 */
export async function readWeeklyCohort(
  merchantId: number,
  window = currentReportWindow()
) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const db = await getDb();
  if (!db) throw Error("Report data unavailable");
  return db.transaction(
    async tx => {
      const ranked = tx
        .select({
          conversationId: sentimentAnalysis.conversationId,
          sentiment: sentimentAnalysis.sentiment,
          position:
            sql<number>`row_number() over (partition by ${sentimentAnalysis.conversationId} order by ${messages.createdAt} desc, ${messages.id} desc, ${sentimentAnalysis.createdAt} desc, ${sentimentAnalysis.id} desc)`.as(
              "position"
            ),
        })
        .from(sentimentAnalysis)
        .innerJoin(
          messages,
          and(
            eq(messages.id, sentimentAnalysis.messageId),
            eq(messages.conversationId, sentimentAnalysis.conversationId)
          )
        )
        .innerJoin(
          conversations,
          eq(conversations.id, sentimentAnalysis.conversationId)
        )
        .where(
          and(
            eq(conversations.merchantId, merchantId),
            gte(conversations.createdAt, window.sqlStart),
            lte(conversations.createdAt, window.sqlEnd),
            eq(messages.direction, "incoming"),
            gte(messages.createdAt, window.sqlStart),
            lte(messages.createdAt, window.sqlEnd),
            gte(sentimentAnalysis.createdAt, window.sqlStart),
            lte(sentimentAnalysis.createdAt, window.sqlEnd)
          )
        )
        .as("ranked_sentiment");
      const [counts] = await tx
        .select({
          totalConversations: sql<number>`count(*)`,
          positiveCount: sql<number>`coalesce(sum(case when ${ranked.sentiment} in ('positive','happy') then 1 else 0 end),0)`,
          negativeCount: sql<number>`coalesce(sum(case when ${ranked.sentiment} in ('negative','angry','sad','frustrated') then 1 else 0 end),0)`,
          neutralCount: sql<number>`coalesce(sum(case when ${ranked.sentiment} = 'neutral' then 1 else 0 end),0)`,
        })
        .from(conversations)
        .leftJoin(
          ranked,
          and(
            eq(conversations.id, ranked.conversationId),
            eq(ranked.position, 1)
          )
        )
        .where(
          and(
            eq(conversations.merchantId, merchantId),
            gte(conversations.createdAt, window.sqlStart),
            lte(conversations.createdAt, window.sqlEnd)
          )
        );
      const sample = {
        totalConversations: Number(counts.totalConversations),
        positiveCount: Number(counts.positiveCount),
        negativeCount: Number(counts.negativeCount),
        neutralCount: Number(counts.neutralCount),
      };
      const observation = sentimentObservation(sample);
      if (!observation.valid) throw Error("Invalid report sample");
      // These are lifetime keyword counters whose last observation is inside the window.
      const keywordWhere = and(
        eq(keywordAnalysis.merchantId, merchantId),
        gte(keywordAnalysis.lastSeenAt, window.sqlStart),
        lte(keywordAnalysis.lastSeenAt, window.sqlEnd),
        gte(keywordAnalysis.frequency, 2)
      );
      const topKeywords = await tx
        .select({ keyword: keywordAnalysis.keyword })
        .from(keywordAnalysis)
        .where(keywordWhere)
        .orderBy(desc(keywordAnalysis.frequency), asc(keywordAnalysis.id))
        .limit(5);
      const topComplaints = await tx
        .select({ keyword: keywordAnalysis.keyword })
        .from(keywordAnalysis)
        .where(and(keywordWhere, eq(keywordAnalysis.category, "complaint")))
        .orderBy(desc(keywordAnalysis.frequency), asc(keywordAnalysis.id))
        .limit(5);
      return {
        ...sample,
        unclassified: observation.unclassified!,
        topKeywords: topKeywords.map(k => k.keyword),
        topComplaints: topComplaints.map(k => k.keyword),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
