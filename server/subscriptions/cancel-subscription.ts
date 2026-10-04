import type { PoolConnection } from "mysql2/promise";
import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";
import { projectBillingSubscription } from "./billing-workspace";
import { subscriptionTimestamp } from "../../shared/subscription-usage";
import {
  cancellationReview,
  sameCancellationSnapshot,
  subscriptionCancellationInput,
  type SubscriptionCancellationInput,
} from "../../shared/subscription-cancellation";

export class SubscriptionCancellationConflictError extends Error {}
const unavailable = () => new Error("Subscription cancellation unavailable");
async function rows(
  tx: PoolConnection,
  sql: string,
  args: (string | number | null)[] = []
) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw unavailable();
  return result as Record<string, any>[];
}
async function writeOne(
  tx: PoolConnection,
  sql: string,
  args: (string | number | null)[]
) {
  const [result] = await tx.execute(sql, args);
  if (
    !result ||
    Array.isArray(result) ||
    !("affectedRows" in result) ||
    result.affectedRows !== 1
  )
    throw unavailable();
}
/** The merchant lock serializes cancellation with canonical plan activation.
 * Authority, the reviewed period, writes and their receipts share one transaction. */
export async function cancelCurrentSubscription(
  actorId: number,
  merchantId: number,
  raw: SubscriptionCancellationInput
) {
  const input = subscriptionCancellationInput.parse(raw);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    true,
    async (tx, authority) => {
      const [clock] = await rows(tx, "SELECT UTC_TIMESTAMP(3) AS checked_at");
      const timestamp =
        clock?.checked_at instanceof Date
          ? clock.checked_at.getTime()
          : subscriptionTimestamp(clock?.checked_at);
      if (timestamp === null || !Number.isFinite(timestamp))
        throw unavailable();
      const checkedAt = new Date(timestamp).toISOString();
      const selected = await rows(
        tx,
        `SELECT id,plan_id,status,billing_cycle,start_date,end_date,trial_ends_at
      FROM merchant_subscriptions WHERE merchant_id=? AND status IN ('active','trial')
      ORDER BY created_at DESC,id DESC LIMIT 2 FOR UPDATE`,
        [merchantId]
      );
      const view = projectBillingSubscription(
        actorId,
        merchantId,
        authority,
        checkedAt,
        selected
      );
      const current = cancellationReview(view.subscription);
      if (
        !["active", "trial"].includes(view.state) ||
        !current ||
        !sameCancellationSnapshot(current, input.expected)
      )
        throw new SubscriptionCancellationConflictError();
      const [merchant] = await rows(
        tx,
        "SELECT current_subscription_id FROM merchants WHERE id=? FOR UPDATE",
        [merchantId]
      );
      if (merchant?.current_subscription_id !== current.id)
        throw new SubscriptionCancellationConflictError();
      await writeOne(
        tx,
        `UPDATE merchant_subscriptions SET status='cancelled',cancelled_at=UTC_TIMESTAMP(),cancellation_reason=?
      WHERE id=? AND merchant_id=? AND status=?`,
        [input.reason ?? null, current.id, merchantId, current.status]
      );
      await writeOne(
        tx,
        `UPDATE merchants SET current_subscription_id=NULL,subscription_status='expired',max_customers_allowed=0
      WHERE id=? AND current_subscription_id=?`,
        [merchantId, current.id]
      );
      const [saved] = await rows(
        tx,
        `SELECT s.status,s.cancelled_at,s.cancellation_reason,m.current_subscription_id,m.subscription_status,m.max_customers_allowed
      FROM merchant_subscriptions s JOIN merchants m ON m.id=s.merchant_id WHERE s.id=? AND m.id=?`,
        [current.id, merchantId]
      );
      const cancelledAt =
        saved?.cancelled_at instanceof Date
          ? saved.cancelled_at.getTime()
          : subscriptionTimestamp(saved?.cancelled_at);
      if (
        !saved ||
        saved.status !== "cancelled" ||
        cancelledAt === null ||
        !Number.isFinite(cancelledAt) ||
        saved.cancellation_reason !== (input.reason ?? null) ||
        saved.current_subscription_id !== null ||
        saved.subscription_status !== "expired" ||
        saved.max_customers_allowed !== 0
      )
        throw unavailable();
      return { success: true as const, subscriptionId: current.id };
    }
  );
}
