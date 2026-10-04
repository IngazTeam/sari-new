import { getDb as _getDb } from "./db";

/** Non-nullable wrapper */
async function getDb() {
  const db = await _getDb();
  if (!db) throw new Error("Database not initialized");
  return db;
}
import { pushSubscriptions, pushNotificationLogs } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// Get active subscriptions for merchant
export async function getActivePushSubscriptions(merchantId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.merchantId, merchantId),
        eq(pushSubscriptions.isActive, true),
        sql`EXISTS (SELECT 1 FROM auth_sessions a JOIN users u ON u.id=a.user_id
          JOIN merchants m ON m.id=${pushSubscriptions.merchantId} JOIN users owner ON owner.id=m.userId
          LEFT JOIN merchant_members mm ON mm.merchant_id=m.id AND mm.user_id=u.id
          WHERE a.user_id=${pushSubscriptions.actorUserId} AND a.token_id_hash=${pushSubscriptions.sessionHash}
          AND a.revoked_at IS NULL AND a.expires_at>UTC_TIMESTAMP() AND u.account_status='active'
          AND owner.account_status='active' AND m.status='active' AND ${pushSubscriptions.endpointHash} IS NOT NULL
          AND ((mm.is_active=1 AND mm.role IN ('owner','manager')) OR (mm.id IS NULL AND m.userId=u.id)))`
      )
    )
    .limit(64);
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
      sentAt: status === "accepted" ? new Date() : undefined,
    })
    .where(eq(pushNotificationLogs.id, id));
}
