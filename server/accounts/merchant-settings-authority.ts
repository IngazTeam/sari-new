import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db/connection";
import { ALL_ROLES } from "../_core/permissions";
export class MerchantSettingsAuthorityError extends Error {
  constructor(
    readonly reason: "forbidden" | "unavailable" | "stale" | "unknown"
  ) {
    super("merchant_settings:" + reason);
  }
}
async function rows(tx: PoolConnection, sql: string, args: any[]) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result))
    throw new MerchantSettingsAuthorityError("unavailable");
  return result as any[];
}
export async function withMerchantOwnerSettings<T>(
  actorId: number,
  merchantId: number,
  write: boolean,
  work: (
    tx: PoolConnection,
    authority: { canManage: boolean; isOwner: boolean }
  ) => Promise<T>
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
      throw new MerchantSettingsAuthorityError("forbidden");
    const pool = await getPool();
    if (!pool) throw new MerchantSettingsAuthorityError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await rows(
      tx,
      `SELECT id,userId,status FROM merchants WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
      [merchantId]
    );
    const users = await rows(
      tx,
      "SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE",
      [actorId, merchant?.userId || actorId]
    );
    const members = await rows(
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
      throw new MerchantSettingsAuthorityError("forbidden");
    // Only an active owner can change merchant settings.
    const canManage = merchant.status === "active" && role === "owner";
    if (write && !canManage)
      throw new MerchantSettingsAuthorityError("forbidden");
    const result = await work(tx, { canManage, isOwner: role === "owner" });
    committing = true;
    await tx.commit();
    committing = false;
    return result;
  } catch (error) {
    if (tx) {
      if (committing) {
        reusable = false;
        tx.destroy();
        throw new MerchantSettingsAuthorityError("unknown");
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
