import webpush from "web-push";
import {
  getActivePushSubscriptions,
  createPushNotificationLog,
  updatePushNotificationLogStatus,
  deactivatePushSubscription,
} from "../db_push";

// VAPID keys (should be in env in production)
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh4U";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";

webpush.setVapidDetails(
  "mailto:support@sari.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

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
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  const subscriptions = await getActivePushSubscriptions(merchantId);

  if (subscriptions.length === 0) {
    console.log("[Push] No active subscriptions for merchant:", merchantId);
    return { success: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      // Create log entry
      const [logResult] = await createPushNotificationLog({
        merchantId,
        subscriptionId: subscription.id,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        status: "pending",
      });

      const logId = logResult.insertId;

      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || "/logo.png",
            badge: payload.badge || "/badge.png",
            url: payload.url || "/",
            tag: payload.tag || "sari-notification",
            requireInteraction: payload.requireInteraction || false,
            actions: payload.actions || [],
          })
        );

        await updatePushNotificationLogStatus(logId, "sent");
        return { success: true };
      } catch (error: any) {
        console.error("[Push] Failed to send notification:", error);

        // If subscription is invalid (410 Gone), deactivate it
        if (error.statusCode === 410) {
          await deactivatePushSubscription(subscription.id);
        }

        await updatePushNotificationLogStatus(
          logId,
          "failed",
          error.message || "Unknown error"
        );
        return { success: false };
      }
    })
  );

  const success = results.filter(
    (r) => r.status === "fulfilled" && r.value.success
  ).length;
  const failed = results.length - success;

  return { success, failed };
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
