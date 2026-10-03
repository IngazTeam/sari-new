import { reviewAggregateQuery, summarizeReviewGroups } from './review-aggregates';
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import {
  abandonedCarts,
  orders,
  referralCodes,
  referrals,
} from "../drizzle/schema";
import { getDb } from "./db/connection";
import { readOrderAssociation } from "./order-association";
import { messageWindow } from "../shared/message-workspace";
import { observationArm } from "../shared/insights-workspace";
import {
  overviewWorkspaceInput,
  overviewOrderStatuses,
  overviewPaymentStatuses,
  overviewCurrencies,
  type OverviewSnapshot,
  type OverviewWorkspaceInput,
} from "../shared/overview-workspace";
function safeCount(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw Error("Invalid overview count");
  return result;
}
export async function readOverviewWorkspace(
  merchantId: number,
  input: OverviewWorkspaceInput,
  now = new Date()
): Promise<OverviewSnapshot> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = overviewWorkspaceInput.parse(input),
    window = messageWindow(selection.period, now),
    db = await getDb();
  if (!db) throw Error("Overview unavailable");
  return db.transaction(
    async tx => {
      const orderRows = await tx
        .select({
          status: orders.status,
          payment: orders.paymentStatus,
          currency: orders.currency,
          count: count(),
          valid: sql<number>`sum(case when ${orders.totalAmount} >= 0 then 1 else 0 end)`,
          totalMinor: sql<string>`coalesce(sum(case when ${orders.totalAmount} >= 0 then ${orders.totalAmount} else 0 end),0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.merchantId, merchantId),
            gte(orders.createdAt, window.sqlFrom),
            lte(orders.createdAt, window.sqlThrough)
          )
        )
        .groupBy(orders.status, orders.paymentStatus, orders.currency);
      const total = orderRows.reduce((n, r) => n + safeCount(r.count), 0);
      const values = overviewCurrencies.map(currency => {
        const rows = orderRows.filter(
          r => r.currency === currency && r.status !== "cancelled"
        );
        const size = rows.reduce((n, r) => n + safeCount(r.valid), 0),
          totalMinor = safeCount(
            rows.reduce((n, r) => n + safeCount(r.totalMinor), 0)
          );
        const paid = rows.filter(r => r.payment === "paid");
        return {
          currency,
          count: size,
          totalMinor,
          averageMinor: size ? totalMinor / size : null,
          markedPaidCount: paid.reduce((n, r) => n + safeCount(r.valid), 0),
          markedPaidMinor: safeCount(
            paid.reduce((n, r) => n + safeCount(r.totalMinor), 0)
          ),
          excludedAmounts: rows.reduce(
            (n, r) => n + safeCount(r.count) - safeCount(r.valid),
            0
          ),
        };
      });
      const reviewGroups = (await tx.execute(reviewAggregateQuery(merchantId, window.sqlFrom, window.sqlThrough)))[0];
      const reviews = summarizeReviewGroups(reviewGroups);
      const cartRows = await tx
        .select({ flag: abandonedCarts.recovered, count: count() })
        .from(abandonedCarts)
        .where(
          and(
            eq(abandonedCarts.merchantId, merchantId),
            gte(abandonedCarts.createdAt, window.sqlFrom),
            lte(abandonedCarts.createdAt, window.sqlThrough)
          )
        )
        .groupBy(abandonedCarts.recovered);
      const referralRows = await tx
        .select({ flag: referrals.orderCompleted, count: count() })
        .from(referrals)
        .innerJoin(
          referralCodes,
          eq(referralCodes.id, referrals.referralCodeId)
        )
        .where(
          and(
            eq(referralCodes.merchantId, merchantId),
            gte(referrals.createdAt, window.sqlFrom),
            lte(referrals.createdAt, window.sqlThrough)
          )
        )
        .groupBy(referrals.orderCompleted);
      const flags = (rows: { flag: number; count: number }[]) => {
        const total = rows.reduce((n, r) => n + safeCount(r.count), 0),
          positive = rows.reduce(
            (n, r) => n + (r.flag === 1 ? safeCount(r.count) : 0),
            0
          ),
          negative = rows.reduce(
            (n, r) => n + (r.flag === 0 ? safeCount(r.count) : 0),
            0
          );
        return {
          total,
          positive,
          negative,
          invalid: total - positive - negative,
          share: observationArm(total, positive).ratio,
        };
      };
      const carts = flags(cartRows),
        referral = flags(referralRows);
      return {
        merchantId,
        period: selection.period,
        from: window.from,
        through: window.through,
        timeZone: "UTC",
        orders: {
          total,
          statuses: overviewOrderStatuses.map(status => ({
            status,
            count: orderRows
              .filter(r => r.status === status)
              .reduce((n, r) => n + safeCount(r.count), 0),
          })),
          payments: overviewPaymentStatuses.map(status => ({
            status,
            count: orderRows
              .filter(r => r.payment === status)
              .reduce((n, r) => n + safeCount(r.count), 0),
          })),
          values,
          valueMeaning: "stored_minor_non_cancelled_not_settlement",
        },
        reviews: {
          total: reviews.linked, valid: reviews.rated, invalid: reviews.invalidRatings,
          unlinked: reviews.unlinked, average: reviews.average,
          distribution: [5, 4, 3, 2, 1].map(stars => ({ stars, count: reviews.distribution[stars],
            share: observationArm(reviews.rated, reviews.distribution[stars]).ratio })),
          meaning: "stored_review_records_not_unique_customers",
        },
        carts: {
          total: carts.total,
          markedRecovered: carts.positive,
          other: carts.negative,
          invalidFlags: carts.invalid,
          share: carts.share,
          meaning: "current_saved_recovery_flag_not_attribution",
        },
        referrals: {
          total: referral.total,
          markedCompleted: referral.positive,
          pending: referral.negative,
          invalidFlags: referral.invalid,
          share: referral.share,
          meaning: "current_saved_completion_flag_not_payment",
        },
        association: await readOrderAssociation(tx, merchantId, window),
        salesProficiency: null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
