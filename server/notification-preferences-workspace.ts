import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import {
  ALL_ROLES,
  hasPermission,
  type MerchantRole,
} from "./_core/permissions";
import {
  defaultNotificationPreferences,
  notificationPreferenceKeys,
  notificationPreferenceStoredFields,
  notificationPreferenceWorkspace,
} from "../shared/notification-preferences-workspace";

export class NotificationPreferenceError extends Error {
  constructor(
    readonly reason:
      | "forbidden"
      | "unavailable"
      | "stale"
      | "duplicate"
      | "unknown"
  ) {
    super("notification_preferences:" + reason);
  }
}
export async function preferenceRows(
  tx: PoolConnection,
  sql: string,
  args: any[] = []
) {
  const [rows] = await tx.execute(sql, args);
  if (!Array.isArray(rows))
    throw new NotificationPreferenceError("unavailable");
  return rows as any[];
}
export async function withPreferenceAuthority<T>(
  actorId: number,
  merchantId: number,
  mode: "read" | "write",
  work: (tx: PoolConnection, canManage: boolean) => Promise<T>
) {
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    if (
      ![actorId, merchantId].every(
        n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647
      )
    )
      throw new NotificationPreferenceError("forbidden");
    const pool = await getPool();
    if (!pool) throw new NotificationPreferenceError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await preferenceRows(
      tx,
      `SELECT id,userId,status FROM merchants WHERE id=? FOR ${mode === "write" ? "UPDATE" : "SHARE"}`,
      [merchantId]
    );
    const users = await preferenceRows(
      tx,
      "SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE",
      [actorId, merchant?.userId || actorId]
    );
    const members = await preferenceRows(
      tx,
      "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
      [merchantId, actorId]
    );
    const role =
      members.length === 1 && members[0].is_active === 1
        ? members[0].role
        : !members.length && merchant?.userId === actorId
          ? "owner"
          : null;
    if (
      !merchant ||
      !["active", "pending"].includes(merchant.status) ||
      users.find(u => u.id === actorId)?.account_status !== "active" ||
      users.find(u => u.id === merchant.userId)?.account_status !== "active" ||
      !ALL_ROLES.includes(role)
    )
      throw new NotificationPreferenceError("forbidden");
    const canManage =
      merchant.status === "active" &&
      hasPermission(role as MerchantRole, "settings.manage");
    if (mode === "write" && !canManage)
      throw new NotificationPreferenceError("forbidden");
    const result = await work(tx, canManage);
    committing = true;
    await tx.commit();
    committing = false;
    return result;
  } catch (error) {
    if (tx) {
      if (committing) {
        reusable = false;
        tx.destroy();
        throw new NotificationPreferenceError("unknown");
      }
      try {
        await tx.rollback();
      } catch {
        reusable = false;
        tx.destroy();
      }
    }
    throw error;
  } finally {
    if (tx && reusable) tx.release();
  }
}
export const preferenceColumns = {
  newOrdersEnabled: "new_orders_enabled",
  newMessagesEnabled: "new_messages_enabled",
  appointmentsEnabled: "appointments_enabled",
  orderStatusEnabled: "order_status_enabled",
  missedMessagesEnabled: "missed_messages_enabled",
  whatsappDisconnectEnabled: "whatsapp_disconnect_enabled",
  preferredMethod: "preferred_method",
  quietHoursEnabled: "quiet_hours_enabled",
  quietHoursStart: "quiet_hours_start",
  quietHoursEnd: "quiet_hours_end",
  instantNotifications: "instant_notifications",
  batchNotifications: "batch_notifications",
  batchInterval: "batch_interval",
} as const;
export async function storedPreferences(
  tx: PoolConnection,
  merchantId: number,
  write = false
) {
  return preferenceRows(
    tx,
    `SELECT id,merchant_id,${Object.values(preferenceColumns).join(",")},created_at,updated_at FROM notification_preferences WHERE merchant_id=? ORDER BY id${write ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
}
export function projectPreferences(
  raw: any[],
  actorId: number,
  merchantId: number,
  canManage: boolean
) {
  const revision = createHash("sha256")
    .update(JSON.stringify([actorId, merchantId, raw]))
    .digest("hex");
  let values: any = null,
    invalidFields: string[] = [],
    status: "default" | "saved" | "invalid" | "duplicate";
  if (raw.length > 1) status = "duplicate";
  else if (!raw.length) {
    status = "default";
    values = {
      ...defaultNotificationPreferences,
      instantNotifications: true,
      batchNotifications: false,
      batchInterval: 30,
    };
  } else {
    status = "saved";
    values = {};
    for (const key of notificationPreferenceKeys.options) {
      const value = raw[0][preferenceColumns[key]],
        isBoolean =
          key.endsWith("Enabled") ||
          key === "instantNotifications" ||
          key === "batchNotifications";
      const parsed = notificationPreferenceStoredFields.shape[key].safeParse(
        isBoolean && [0, 1].includes(value) ? value === 1 : value
      );
      if (parsed.success) values[key] = parsed.data;
      else {
        values[key] = null;
        invalidFields.push(key);
      }
    }
    if (invalidFields.length) status = "invalid";
  }
  return notificationPreferenceWorkspace.parse({
    actorId,
    merchantId,
    canManage,
    revision,
    status,
    storedRecords: raw.length,
    values,
    invalidFields,
    quietHoursTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    quietHoursBehavior: "suppressed_not_queued",
    quietHoursBypass: "whatsapp_disconnect",
    batchingAvailable: false,
    instantToggleApplied: false,
  });
}
export async function readNotificationPreferences(
  actorId: number,
  merchantId: number
) {
  return withPreferenceAuthority(
    actorId,
    merchantId,
    "read",
    async (tx, canManage) =>
      projectPreferences(
        await storedPreferences(tx, merchantId),
        actorId,
        merchantId,
        canManage
      )
  );
}
