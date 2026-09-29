import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  conversations,
  messages,
  sentimentAnalysis,
  products,
  orders,
} from "../drizzle/schema";
import { getDb } from "./db/connection";
import {
  messageKinds,
  messageSentiments,
  messageWindow,
  messageWorkspaceInput,
  type MessageWorkspaceInput,
} from "../shared/message-workspace";
import { observationArm } from "../shared/insights-workspace";

export async function readMessageWorkspace(
  merchantId: number,
  input: MessageWorkspaceInput,
  now = new Date()
) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = messageWorkspaceInput.parse(input),
    window = messageWindow(selection.period, now);
  const db = await getDb();
  if (!db) throw Error("Message analytics unavailable");
  return db.transaction(
    async tx => {
      const scope = and(
        eq(conversations.merchantId, merchantId),
        gte(messages.createdAt, window.sqlFrom),
        lte(messages.createdAt, window.sqlThrough)
      );
      const counts = await tx
        .select({
          kind: messages.messageType,
          direction: messages.direction,
          total: count(),
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scope)
        .groupBy(messages.messageType, messages.direction);
      const [active] = await tx
        .select({
          total: sql<number>`count(distinct ${messages.conversationId})`,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scope);
      const total = counts.reduce((sum, row) => sum + Number(row.total), 0),
        incoming = counts
          .filter(row => row.direction === "incoming")
          .reduce((sum, row) => sum + Number(row.total), 0);
      const byType = messageKinds.map(kind => ({
        kind,
        count: counts
          .filter(row => row.kind === kind)
          .reduce((sum, row) => sum + Number(row.total), 0),
      }));
      const date = sql<string>`date_format(${messages.createdAt}, '%Y-%m-%d')`,
        hour = sql<number>`hour(${messages.createdAt})`;
      const daily = await tx
        .select({ date, count: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scope)
        .groupBy(date)
        .orderBy(date);
      const hourly = await tx
        .select({ hour, count: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(scope)
        .groupBy(hour)
        .orderBy(hour);
      const ranked = tx
        .select({
          sentiment: sentimentAnalysis.sentiment,
          confidence: sentimentAnalysis.confidence,
          position:
            sql<number>`row_number() over (partition by ${sentimentAnalysis.messageId} order by ${sentimentAnalysis.createdAt} desc,${sentimentAnalysis.id} desc)`.as(
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
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(
          and(
            scope,
            eq(messages.direction, "incoming"),
            gte(sentimentAnalysis.createdAt, window.sqlFrom),
            lte(sentimentAnalysis.createdAt, window.sqlThrough)
          )
        )
        .as("current_sentiment");
      const sentiments = await tx
        .select({
          sentiment: ranked.sentiment,
          count: count(),
          validConfidence: sql<number>`sum(case when ${ranked.confidence} between 0 and 100 then 1 else 0 end)`,
          confidenceSum: sql<number>`sum(case when ${ranked.confidence} between 0 and 100 then ${ranked.confidence} else 0 end)`,
        })
        .from(ranked)
        .where(eq(ranked.position, 1))
        .groupBy(ranked.sentiment);
      const distribution = messageSentiments.map(kind => ({
        kind,
        count: Number(
          sentiments.find(row => row.sentiment === kind)?.count ?? 0
        ),
      }));
      const classified = distribution.reduce((sum, row) => sum + row.count, 0);
      const confidenceCount = sentiments.reduce(
          (sum, row) => sum + Number(row.validConfidence),
          0
        ),
        confidenceSum = sentiments.reduce(
          (sum, row) => sum + Number(row.confidenceSum),
          0
        );
      if (classified > incoming) throw Error("Invalid message sample");
      // Literal substring matching is a catalog-text observation, never purchase intent or a sale.
      const mentions = await tx
        .select({
          productId: products.id,
          productName: products.name,
          price: products.price,
          priceUnit: products.priceUnit,
          currency: products.currency,
          mentionCount: count(),
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(
          products,
          and(
            eq(products.merchantId, merchantId),
            sql`trim(${products.name}) <> ''`,
            sql`locate(lower(trim(${products.name})),lower(${messages.content})) > 0`
          )
        )
        .where(and(scope, eq(messages.direction, "incoming")))
        .groupBy(
          products.id,
          products.name,
          products.price,
          products.priceUnit,
          products.currency
        )
        .orderBy(desc(count()), asc(products.id))
        .limit(10);
      const [links] = await tx
        .select({
          total: sql<number>`count(distinct ${conversations.id})`,
          matched: sql<number>`count(distinct case when ${orders.id} is not null then ${conversations.id} end)`,
        })
        .from(conversations)
        .leftJoin(
          orders,
          and(
            eq(orders.merchantId, conversations.merchantId),
            eq(orders.customerPhone, conversations.customerPhone),
            sql`trim(${conversations.customerPhone}) <> ''`,
            gte(orders.createdAt, window.sqlFrom),
            lte(orders.createdAt, window.sqlThrough)
          )
        )
        .where(
          and(
            eq(conversations.merchantId, merchantId),
            gte(conversations.createdAt, window.sqlFrom),
            lte(conversations.createdAt, window.sqlThrough)
          )
        );
      return {
        merchantId,
        period: selection.period,
        from: window.from,
        through: window.through,
        timeZone: "UTC" as const,
        messages: {
          total,
          incoming,
          outgoing: total - incoming,
          activeConversations: Number(active.total),
          byType: byType.map(row => ({
            ...row,
            share: observationArm(total, row.count).ratio,
          })),
        },
        daily: window.dates.map(date => ({
          date,
          count: Number(daily.find(row => row.date === date)?.count ?? 0),
        })),
        hourly: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: Number(
            hourly.find(row => Number(row.hour) === hour)?.count ?? 0
          ),
        })),
        sentiment: {
          incoming,
          classified,
          unclassified: incoming - classified,
          classificationCoverage: observationArm(incoming, classified).ratio,
          confidence: {
            average: confidenceCount ? confidenceSum / confidenceCount : null,
            validCount: confidenceCount,
            invalidCount: classified - confidenceCount,
            meaning: "model_self_report_not_accuracy" as const,
          },
          distribution: distribution.map(row => ({
            ...row,
            share: observationArm(incoming, row.count).ratio,
          })),
          evidenceKind: "latest_stored_analysis_per_incoming_message" as const,
          measuredSatisfaction: null,
        },
        products: {
          rows: mentions.map(row => ({
            ...row,
            mentionCount: Number(row.mentionCount),
          })),
          limit: 10,
          evidenceKind:
            "literal_current_catalog_name_in_incoming_text" as const,
          priceMeaning: "current_catalog_price" as const,
        },
        orderAssociation: {
          ...observationArm(Number(links.total), Number(links.matched)),
          evidenceKind: "exact_phone_match_to_any_order_in_period" as const,
          includesAllOrderStatuses: true,
          salesConversion: null,
          salesProficiency: null,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
