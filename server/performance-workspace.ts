import { reviewAggregateQuery, summarizeReviewGroups } from './review-aggregates';
import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  performanceWindows,
  performanceInput,
  performanceShare,
  type PerformanceInput,
  type PerformanceSnapshot,
  type PerformancePeriod,
} from "../shared/performance-workspace";

export async function readPerformanceWorkspace(
  merchantId: number,
  input: PerformanceInput,
  now = new Date()
): Promise<PerformanceSnapshot> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = performanceInput.parse(input),
    windows = performanceWindows(selection, now),
    db = await getDb();
  if (!db) throw Error("Performance unavailable");
  const n = (value: unknown) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0)
      throw Error("Invalid performance aggregate");
    return number;
  };
  return db.transaction(
    async tx => {
      const rows = async (query: ReturnType<typeof sql>) =>
        (await tx.execute(query))[0] as unknown as Record<string, unknown>[];
      const period = async (
        w: typeof windows.current
      ): Promise<PerformancePeriod> => {
        const [messages] =
          await rows(sql`SELECT COUNT(*) total,COALESCE(SUM(m.direction='incoming'),0) incoming,COALESCE(SUM(m.direction='outgoing'),0) outgoing,
        COUNT(DISTINCT c.id) activeConversations,COUNT(DISTINCT BINARY NULLIF(TRIM(c.customerPhone),'')) contactPhones,
        COALESCE(SUM(NULLIF(TRIM(c.customerPhone),'') IS NULL),0) unknownPhoneMessages
        FROM messages m JOIN conversations c ON c.id=m.conversationId
        WHERE c.merchantId=${merchantId} AND m.createdAt>=${w.sqlFrom} AND m.createdAt<=${w.sqlThrough}`);
        const orders =
          await rows(sql`SELECT status,currency,payment_status payment,COUNT(*) total,
        COALESCE(SUM(totalAmount>=0),0) valid,COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) totalMinor
        FROM orders WHERE merchantId=${merchantId} AND createdAt>=${w.sqlFrom} AND createdAt<=${w.sqlThrough}
        GROUP BY status,currency,payment_status`);
        const [phones] =
          await rows(sql`SELECT COUNT(phone) known,COALESCE(SUM(phone IS NOT NULL AND total>=2),0) repeated,
        COALESCE(SUM(CASE WHEN phone IS NULL THEN total ELSE 0 END),0) unknownPhoneOrders
        FROM (SELECT BINARY NULLIF(TRIM(customerPhone),'') phone,COUNT(*) total FROM orders
        WHERE merchantId=${merchantId} AND status!='cancelled' AND createdAt>=${w.sqlFrom} AND createdAt<=${w.sqlThrough}
        GROUP BY BINARY NULLIF(TRIM(customerPhone),'')) groupedPhones`);
        const reviews = summarizeReviewGroups(await rows(reviewAggregateQuery(merchantId, w.sqlFrom, w.sqlThrough)));
        const total = orders.reduce((s, r) => s + n(r.total), 0),
          delivered = orders
            .filter(r => r.status === "delivered")
            .reduce((s, r) => s + n(r.total), 0);
        return {
          from: w.from,
          through: w.through,
          messages: {
            total: n(messages.total),
            incoming: n(messages.incoming),
            outgoing: n(messages.outgoing),
            activeConversations: n(messages.activeConversations),
            contactPhones: n(messages.contactPhones),
            unknownPhoneMessages: n(messages.unknownPhoneMessages),
          },
          orders: {
            total,
            delivered,
            cancelled: orders
              .filter(r => r.status === "cancelled")
              .reduce((s, r) => s + n(r.total), 0),
            deliveredShare: performanceShare(delivered, total),
            values: (["SAR", "USD"] as const).map(currency => {
              const selected = orders.filter(
                r => r.currency === currency && r.status !== "cancelled"
              );
              return {
                currency,
                count: selected.reduce((s, r) => s + n(r.valid), 0),
                totalMinor: n(
                  selected.reduce((s, r) => s + n(r.totalMinor), 0)
                ),
                markedPaidMinor: n(
                  selected
                    .filter(r => r.payment === "paid")
                    .reduce((s, r) => s + n(r.totalMinor), 0)
                ),
                excludedAmounts: selected.reduce(
                  (s, r) => s + n(r.total) - n(r.valid),
                  0
                ),
              };
            }),
          },
          orderPhones: {
            known: n(phones.known),
            repeated: n(phones.repeated),
            unknownPhoneOrders: n(phones.unknownPhoneOrders),
            repeatShare: performanceShare(n(phones.repeated), n(phones.known)),
          },
          reviews: {
            total: reviews.linked, valid: reviews.rated, invalid: reviews.invalidRatings,
            unlinked: reviews.unlinked, positive: reviews.positive, average: reviews.average,
            positiveShare: performanceShare(reviews.positive, reviews.rated),
          },
        };
      };
      return {
        merchantId,
        selection,
        timeZone: "UTC",
        secondsPerPeriod: windows.seconds,
        partialCurrentDay: windows.partialCurrentDay,
        current: await period(windows.current),
        previous: await period(windows.previous),
        unmeasured: {
          salesConversion: null,
          responseSeconds: null,
          customerSatisfaction: null,
          costs: null,
          netProfit: null,
          roi: null,
          salesProficiency: null,
        },
        meanings: {
          messages: "stored_messages_not_delivery",
          phones: "exact_trimmed_phone_not_unique_people",
          orders: "current_status_of_created_orders",
          values: "non_cancelled_stored_minor_not_settlement",
          repeat: "two_non_cancelled_orders_same_phone_within_period",
          reviews: "valid_order_review_records_not_csat",
          comparison: "immediately_preceding_equal_elapsed_seconds",
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
