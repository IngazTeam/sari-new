import {
  getActivePushSubscriptions,
  createPushNotificationLog,
  updatePushNotificationLogStatus,
} from "../db_push";
import {
  pushEndpoint,
  preparePushRequest,
  dispatchPushRequest,
} from "./push-transport";

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

export async function sendPushNotification(
  merchantId: number,
  payload: PushNotificationPayload,
  beforeSend?: () => Promise<void>
): Promise<{ success: number; failed: number }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { success: 0, failed: 0 };
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0)
    throw Error("push:invalid_scope");
  const subscriptions = await getActivePushSubscriptions(merchantId);
  // Do not fan out without bounds or duplicate a target recorded by a previous release.
  if (subscriptions.length > 63)
    return { success: 0, failed: subscriptions.length };
  const endpoints = subscriptions.map(s => {
    try {
      return pushEndpoint(s.endpoint).href;
    } catch {
      return s.endpoint;
    }
  });
  if (new Set(endpoints).size !== endpoints.length)
    return { success: 0, failed: subscriptions.length };
  const body = JSON.stringify({
    ...payload,
    icon: payload.icon || "/logo.png",
    badge: payload.badge || "/badge.png",
    url: payload.url || "/",
    tag: payload.tag || "sari-notification",
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [],
  });
  let success = 0;
  for (const subscription of subscriptions) {
    let logId: number | undefined,
      started = false,
      accepted = false;
    try {
      const details = preparePushRequest(
        subscription,
        body,
        publicKey,
        privateKey
      );
      const [result] = await createPushNotificationLog({
        merchantId,
        subscriptionId: subscription.id,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        status: "pending",
      });
      if (!Number.isSafeInteger(result.insertId) || result.insertId <= 0)
        throw Error("push:log_unconfirmed");
      logId = result.insertId;
      const current = (await getActivePushSubscriptions(merchantId)).find(
        row => row.id === subscription.id
      );
      if (
        !current ||
        current.endpoint !== subscription.endpoint ||
        current.p256dh !== subscription.p256dh ||
        current.auth !== subscription.auth ||
        process.env.VAPID_PUBLIC_KEY !== publicKey ||
        process.env.VAPID_PRIVATE_KEY !== privateKey
      )
        throw Error("push:subscription_changed");
      await beforeSend?.();
      started = true;
      const outcome = await dispatchPushRequest(details);
      accepted = outcome.state === "accepted";
      if (accepted) success++;
      await updatePushNotificationLogStatus(
        logId,
        accepted ? "accepted" : outcome.state === "rejected" ? "rejected" : "unknown",
        accepted
          ? undefined
          : outcome.state === "rejected"
            ? "push:provider_rejected"
            : "push:acceptance_unknown"
      );
    } catch {
      // A receipt/log outage after acceptance does not invent a provider failure or retry.
      // Provider exceptions may contain endpoint tokens: never store or print them.
      if (logId && !accepted)
        await updatePushNotificationLogStatus(
          logId,
          started ? "unknown" : "blocked",
          started ? "push:acceptance_unknown" : "push:blocked_before_send"
        ).catch(() => {});
    }
  }
  // Legacy failed means "not confirmed accepted", not proof of provider rejection.
  return { success, failed: subscriptions.length - success };
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PRIVATE_KEY
    ? process.env.VAPID_PUBLIC_KEY || ""
    : "";
}
