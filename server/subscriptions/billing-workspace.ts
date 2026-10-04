import type { PoolConnection } from "mysql2/promise";
import {
  withMerchantOwnerSettings,
  MerchantSettingsAuthorityError,
} from "../accounts/merchant-settings-authority";
import {
  billingHistoryInput,
  billingHistorySchema,
  subscriptionBillingSchema,
  billingStates,
  billingTypes,
} from "../../shared/subscription-billing-workspace";
import { usageQuota } from "../../shared/usage-workspace";
import {
  TRIAL_USAGE_LIMITS,
  subscriptionTimestamp,
} from "../../shared/subscription-usage";
import { planPriceMinor } from "../../shared/plan-catalog-workspace";
const stamp = (v: unknown) => {
  const n = v instanceof Date ? v.getTime() : subscriptionTimestamp(v);
  return n !== null && Number.isFinite(n) ? new Date(n).toISOString() : null;
};
const label = (v: unknown) =>
  typeof v === "string" && v.trim() && v.length <= 255 ? v : null;
async function rows(tx: PoolConnection, sql: string, args: any[] = []) {
  const [value] = await tx.execute(sql, args);
  if (!Array.isArray(value)) throw Error("billing_workspace:unavailable");
  return value as Record<string, any>[];
}
async function clock(tx: PoolConnection) {
  const now = stamp(
    (await rows(tx, "SELECT UTC_TIMESTAMP(3) AS checked_at"))[0]?.checked_at
  );
  if (!now) throw Error("billing_workspace:unavailable");
  return now;
}
export function projectBillingSubscription(
  actorId: number,
  merchantId: number,
  authority: { canManage: boolean; isOwner: boolean },
  checkedAt: string,
  selected: Record<string, any>[],
  plan?: Record<string, any>
) {
  const row = selected.length === 1 ? selected[0] : null;
  const start = stamp(row?.start_date),
    recordedEnd = stamp(row?.end_date),
    trialEnd = stamp(row?.trial_ends_at);
  const end =
    row?.status === "trial"
      ? recordedEnd && trialEnd
        ? recordedEnd < trialEnd
          ? recordedEnd
          : trialEnd
        : null
      : recordedEnd;
  const status = [
    "pending",
    "trial",
    "active",
    "expired",
    "cancelled",
  ].includes(row?.status)
    ? row!.status
    : "unknown";
  const state =
    selected.length > 1
      ? "ambiguous"
      : !row
        ? "none"
        : ["active", "trial"].includes(status)
          ? !start || !end || end <= start || start > checkedAt
            ? "unknown"
            : end <= checkedAt
              ? "expired"
              : status
          : status;
  const validPlan = plan && plan.id === row?.plan_id ? plan : undefined;
  const trial = status === "trial" && row?.plan_id === null;
  const limits = validPlan
    ? [
        validPlan.conversation_limit,
        validPlan.message_limit,
        validPlan.voice_message_limit,
      ]
    : trial
      ? [
          TRIAL_USAGE_LIMITS.maxConversations,
          TRIAL_USAGE_LIMITS.maxMessages,
          TRIAL_USAGE_LIMITS.maxVoiceMessages,
        ]
      : [];
  return subscriptionBillingSchema.parse({
    actorId,
    merchantId,
    canManage: authority.canManage,
    canReadPayments: authority.isOwner,
    checkedAt,
    timezone: "UTC",
    state,
    subscription: row
      ? {
          id: row.id,
          planId: row.plan_id ?? null,
          nameAr: label(validPlan?.name),
          nameEn: label(validPlan?.name_en),
          recordedStatus: status,
          billingCycle: ["monthly", "yearly"].includes(row.billing_cycle)
            ? row.billing_cycle
            : null,
          startDate: start,
          endDate: end,
          lastResetAt: stamp(row.last_reset_at),
          cancelledAt: stamp(row.cancelled_at),
          daysRemaining:
            ["active", "trial", "expired"].includes(state) &&
            start &&
            end &&
            end > start &&
            start <= checkedAt
              ? Math.max(
                  0,
                  Math.ceil(
                    (Date.parse(end) - Date.parse(checkedAt)) / 86400000
                  )
                )
              : null,
          limitsSource: validPlan ? "plan" : trial ? "trial" : "unknown",
          quotas: {
            conversations: usageQuota(row.conversations_used, limits[0]),
            messages: usageQuota(row.messages_used, limits[1]),
            voiceMessages: usageQuota(row.voice_messages_used, limits[2]),
          },
          resources: {
            customers: usageQuota(null, validPlan?.max_customers, true),
            whatsappNumbers: usageQuota(
              null,
              validPlan?.max_whatsapp_numbers,
              true
            ),
          },
        }
      : null,
  });
}
/** Minimal, bounded, read-only snapshot. Never expires or renews a record on read. */
export async function readSubscriptionBilling(
  actorId: number,
  merchantId: number
) {
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, authority) => {
      const checkedAt = await clock(tx);
      const columns =
        "id,plan_id,status,billing_cycle,start_date,end_date,trial_ends_at,last_reset_at,cancelled_at,conversations_used,messages_used,voice_messages_used";
      let selected = await rows(
        tx,
        `SELECT ${columns} FROM merchant_subscriptions WHERE merchant_id=? AND status IN ('active','trial') ORDER BY created_at DESC,id DESC LIMIT 2`,
        [merchantId]
      );
      if (!selected.length)
        selected = await rows(
          tx,
          `SELECT ${columns} FROM merchant_subscriptions WHERE merchant_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,
          [merchantId]
        );
      const [plan] =
        selected.length === 1 && selected[0].plan_id
          ? await rows(
              tx,
              `SELECT id,name,name_en,conversation_limit,message_limit,voice_message_limit,max_customers,max_whatsapp_numbers FROM subscription_plans WHERE id=?`,
              [selected[0].plan_id]
            )
          : [];
      return projectBillingSubscription(
        actorId,
        merchantId,
        authority,
        checkedAt,
        selected,
        plan
      );
    }
  );
}
export function projectBillingPayment(row: Record<string, any>) {
  const normalized =
    typeof row.currency === "string" ? row.currency.trim().toUpperCase() : null;
  const currency =
    normalized === "SAR" || normalized === "USD" ? normalized : null;
  return {
    id: row.id,
    type: (billingTypes as readonly string[]).includes(row.type)
      ? row.type
      : "unknown",
    status: (billingStates as readonly string[]).includes(row.status)
      ? row.status
      : "unknown",
    amountMinor: currency ? planPriceMinor(row.amount) : null,
    currency,
    createdAt: stamp(row.created_at),
    paidAt: stamp(row.paid_at),
    refundedAt: stamp(row.refunded_at),
  };
}
/** Subscription payment records are owner-only; no provider payload, token or checkout URL is selected. */
export async function readBillingHistory(
  actorId: number,
  merchantId: number,
  rawInput: unknown
) {
  const input = billingHistoryInput.parse(rawInput);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, authority) => {
      if (!authority.isOwner)
        throw new MerchantSettingsAuthorityError("forbidden");
      const checkedAt = await clock(tx),
        clauses = ["merchant_id=?"],
        args: any[] = [merchantId];
      if (input.beforeId !== null) {
        clauses.push("id<?");
        args.push(input.beforeId);
      }
      if (input.status !== "all") {
        clauses.push("status=?");
        args.push(input.status);
      }
      if (input.type !== "all") {
        clauses.push("type=?");
        args.push(input.type);
      }
      const found = await rows(
        tx,
        `SELECT id,type,status,amount,currency,created_at,paid_at,refunded_at FROM payment_transactions WHERE ${clauses.join(" AND ")} ORDER BY id DESC LIMIT ${input.pageSize + 1}`,
        args
      );
      if (found.length > input.pageSize + 1)
        throw Error("billing_workspace:unavailable");
      const visible = found.slice(0, input.pageSize).map(projectBillingPayment);
      return billingHistorySchema.parse({
        actorId,
        merchantId,
        checkedAt,
        timezone: "UTC",
        input,
        rows: visible,
        nextBeforeId:
          found.length > input.pageSize ? visible[visible.length - 1].id : null,
      });
    }
  );
}
