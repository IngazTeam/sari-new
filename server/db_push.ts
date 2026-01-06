import { getDb } from "./db";
import { pushSubscriptions, pushNotificationLogs } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// Create push subscription
export async function createPushSubscription(data: {
  merchantId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const db = await getDb();
  // Check if subscription already exists
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.merchantId, data.merchantId),
        eq(pushSubscriptions.endpoint, data.endpoint)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing subscription
    return await db
      .update(pushSubscriptions)
      .set({
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing[0].id));
  }

  // Create new subscription
  return await db.insert(pushSubscriptions).values(data);
}

// Get active subscriptions for merchant
export async function getActivePushSubscriptions(merchantId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.merchantId, merchantId),
        eq(pushSubscriptions.isActive, true)
      )
    );
}

// Deactivate subscription
export async function deactivatePushSubscription(id: number) {
  const db = await getDb();
  return await db
    .update(pushSubscriptions)
    .set({ isActive: false })
    .where(eq(pushSubscriptions.id, id));
}

// Delete subscription
export async function deletePushSubscription(id: number) {
  const db = await getDb();
  return await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

// Create notification log
export async function createPushNotificationLog(data: {
  merchantId: number;
  subscriptionId?: number;
  title: string;
  body: string;
  url?: string;
  status?: string;
  error?: string;
}) {
  const db = await getDb();
  return await db.insert(pushNotificationLogs).values({
    merchantId: data.merchantId,
    subscriptionId: data.subscriptionId,
    title: data.title,
    body: data.body,
    url: data.url,
    status: data.status || "pending",
    error: data.error,
  });
}

// Update notification log status
export async function updatePushNotificationLogStatus(
  id: number,
  status: string,
  error?: string
) {
  const db = await getDb();
  return await db
    .update(pushNotificationLogs)
    .set({
      status,
      error,
      sentAt: status === "sent" ? new Date() : undefined,
    })
    .where(eq(pushNotificationLogs.id, id));
}

// Get notification logs
export async function getPushNotificationLogs(merchantId: number, limit: number = 50) {
  const db = await getDb();
  return await db
    .select()
    .from(pushNotificationLogs)
    .where(eq(pushNotificationLogs.merchantId, merchantId))
    .orderBy(desc(pushNotificationLogs.createdAt))
    .limit(limit);
}

// Get notification stats
export async function getPushNotificationStats(merchantId: number) {
  const db = await getDb();
  const logs = await db
    .select()
    .from(pushNotificationLogs)
    .where(eq(pushNotificationLogs.merchantId, merchantId));

  return {
    totalNotifications: logs.length,
    sentNotifications: logs.filter((log) => log.status === "sent").length,
    failedNotifications: logs.filter((log) => log.status === "failed").length,
    pendingNotifications: logs.filter((log) => log.status === "pending").length,
  };
}
