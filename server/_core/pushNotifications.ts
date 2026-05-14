import webpush from "web-push";
import {
  getActivePushSubscriptions,
  createPushNotificationLog,
  updatePushNotificationLogStatus,
  deactivatePushSubscription,
} from "../db_push";

// VAPID keys - MUST be set via environment variables
// Generate with: npx web-push generate-vapid-keys
let pushEnabled = false;
let _vapidInitialized = false;

function ensureVapid() {
  if (_vapidInitialized) return;
  _vapidInitialized = true;

  const pubKey = process.env.VAPID_PUBLIC_KEY || "";
  const privKey = process.env.VAPID_PRIVATE_KEY || "";

  if (!pubKey || !privKey) {
    console.warn("[Push] ⚠️VAPID keys not set. Push notifications will not work. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
    return;
  }

  try {
    webpush.setVapidDetails("mailto:support@sari.app", pubKey, privKey);
    pushEnabled = true;
    console.log("[Push] ✅ VAPID keys configured successfully");
  } catch (error) {
    console.error("[Push] ❌ Failed to set VAPID details:", error);
  }
}

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
  ensureVapid();
  if (!pushEnabled) {
    return { success: 0, failed: 0 };
  }

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
  ensureVapid();
  return process.env.VAPID_PUBLIC_KEY || "";
}
