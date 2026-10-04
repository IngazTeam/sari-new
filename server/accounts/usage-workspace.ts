import type { PoolConnection } from "mysql2/promise";
import { withMerchantOwnerSettings } from "./merchant-settings-authority";
import { usageWorkspaceSchema, usageQuota } from "../../shared/usage-workspace";
import {
  TRIAL_USAGE_LIMITS,
  subscriptionTimestamp,
} from "../../shared/subscription-usage";
import { catalogVisibleSql } from "../integrations/catalog-scope";
import { normalizeZidPhone } from "../integrations/zid-commerce-normalization";

async function rows(tx: PoolConnection, sql: string, args: any[] = []) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw Error("usage_workspace:unavailable");
  return result as any[];
}
const stamp = (value: unknown) => {
  const time =
    value instanceof Date ? value.getTime() : subscriptionTimestamp(value);
  return time !== null && Number.isFinite(time)
    ? new Date(time).toISOString()
    : null;
};
const count = (value: unknown) => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("usage_workspace:unavailable");
  return n;
};
const mysqlDate = (date: Date) =>
  date.toISOString().slice(0, 23).replace("T", " ");

/** A read-only consistent snapshot. This never expires, renews or resets a subscription. */
export async function readUsageWorkspace(actorId: number, merchantId: number) {
  return withMerchantOwnerSettings(actorId, merchantId, false, async tx => {
    const checkedAt = stamp(
      (await rows(tx, "SELECT UTC_TIMESTAMP(3) AS now"))[0]?.now
    );
    if (!checkedAt) throw Error("usage_workspace:unavailable");
    const now = new Date(checkedAt);
    const months = Array.from(
      { length: 6 },
      (_, i) =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
    );
    const subscriptions = await rows(
      tx,
      `SELECT id,plan_id,status,billing_cycle,start_date,end_date,trial_ends_at,
      conversations_used,messages_used,voice_messages_used,last_reset_at FROM merchant_subscriptions
      WHERE merchant_id=? AND status IN ('active','trial') ORDER BY created_at DESC,id DESC LIMIT 2`,
      [merchantId]
    );
    const subscription = subscriptions.length === 1 ? subscriptions[0] : null;
    const startDate = stamp(subscription?.start_date),
      end = stamp(subscription?.end_date),
      trialEnd = stamp(subscription?.trial_ends_at);
    const endDate =
      subscription?.status === "trial"
        ? end && trialEnd
          ? end < trialEnd
            ? end
            : trialEnd
          : null
        : end;
    const state =
      subscriptions.length > 1
        ? "ambiguous"
        : !subscription
          ? "none"
          : !startDate || !endDate
            ? "unknown"
            : endDate <= checkedAt
              ? "expired"
              : startDate > checkedAt
                ? "unknown"
                : subscription.status;
    const [plan] = subscription?.plan_id
      ? await rows(
          tx,
          `SELECT id,name,name_en,max_customers,max_whatsapp_numbers,conversation_limit,message_limit,voice_message_limit
      FROM subscription_plans WHERE id=?`,
          [subscription.plan_id]
        )
      : [];
    const trial =
      subscription?.status === "trial" && subscription.plan_id == null;
    const limitsSource = plan ? "plan" : trial ? "trial" : "unknown";
    const limits = plan
      ? [plan.conversation_limit, plan.message_limit, plan.voice_message_limit]
      : trial
        ? [
            TRIAL_USAGE_LIMITS.maxConversations,
            TRIAL_USAGE_LIMITS.maxMessages,
            TRIAL_USAGE_LIMITS.maxVoiceMessages,
          ]
        : [];

    // Use the same phone normalization as quota enforcement, without returning any phone.
    const phones = await rows(
      tx,
      `SELECT customerPhone AS phone FROM conversations WHERE merchantId=? GROUP BY customerPhone
      UNION ALL SELECT phone FROM zid_customers WHERE merchant_id=? AND is_active=1 AND phone IS NOT NULL`,
      [merchantId, merchantId]
    );
    const customerCount = new Set(
      phones
        .filter(row => typeof row.phone === "string" && row.phone.trim())
        .map(row => normalizeZidPhone(row.phone) || row.phone)
    ).size;
    const instanceCount = count(
      (
        await rows(
          tx,
          "SELECT COUNT(*) AS n FROM whatsapp_instances WHERE merchant_id=?",
          [merchantId]
        )
      )[0]?.n
    );
    const productCount = count(
      (
        await rows(
          tx,
          `SELECT COUNT(*) AS n FROM products WHERE merchantId=? AND ${catalogVisibleSql()}`,
          [merchantId]
        )
      )[0]?.n
    );
    const from = mysqlDate(months[0]),
      until = mysqlDate(now);
    const campaigns = await rows(
      tx,
      `SELECT DATE_FORMAT(createdAt,'%Y-%m') AS month,COUNT(*) AS n FROM campaigns
      WHERE merchantId=? AND createdAt>=? AND createdAt<? GROUP BY month`,
      [merchantId, from, until]
    );
    const messages = await rows(
      tx,
      `SELECT DATE_FORMAT(m.createdAt,'%Y-%m') AS month,COUNT(*) AS n FROM messages m
      JOIN conversations c ON c.id=m.conversationId WHERE c.merchantId=? AND m.direction='outgoing'
      AND m.createdAt>=? AND m.createdAt<? GROUP BY month`,
      [merchantId, from, until]
    );
    const history = months.map(date => {
      const month = date.toISOString().slice(0, 7);
      return {
        month,
        campaigns: count(campaigns.find(row => row.month === month)?.n ?? 0),
        outgoingMessages: count(
          messages.find(row => row.month === month)?.n ?? 0
        ),
      };
    });
    return usageWorkspaceSchema.parse({
      actorId,
      merchantId,
      checkedAt,
      timezone: "UTC",
      subscription: {
        state,
        id: subscription?.id ?? null,
        planId: subscription?.plan_id ?? null,
        nameAr: plan?.name ?? null,
        nameEn: plan?.name_en ?? null,
        billingCycle: ["monthly", "yearly"].includes(
          subscription?.billing_cycle
        )
          ? subscription.billing_cycle
          : null,
        startDate,
        endDate,
        lastResetAt: stamp(subscription?.last_reset_at),
        limitsSource,
      },
      quotas: {
        conversations: usageQuota(subscription?.conversations_used, limits[0]),
        messages: usageQuota(subscription?.messages_used, limits[1]),
        voiceMessages: usageQuota(subscription?.voice_messages_used, limits[2]),
      },
      resources: {
        customers: usageQuota(customerCount, plan?.max_customers, true),
        whatsappNumbers: usageQuota(
          instanceCount,
          plan?.max_whatsapp_numbers,
          true
        ),
        products: usageQuota(productCount, null),
      },
      activity: { ...history[5], from: months[5].toISOString(), to: checkedAt },
      history,
    });
  });
}
