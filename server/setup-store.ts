import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";

export class SetupConflict extends Error {}
export class SetupForbidden extends Error {}
export class SetupUnavailable extends Error {}
export class SetupReviewRequired extends Error {}
export const setupHash = (value: unknown): string => {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object" && !(v instanceof Date)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map(key => [key, canonical(v[key])])
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
};
export function validSetupScope(merchantId: number, actorId: number) {
  for (const id of [merchantId, actorId])
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new SetupForbidden();
}
export async function setupTransaction<T>(
  writes: boolean,
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema("setup completion", [
    { table: "setup_wizard_progress", columns: ["revision"] },
    {
      table: "setup_completion_receipts",
      columns: ["actor_id", "input_hash", "result"],
      uniqueIndexes: [
        {
          name: "uq_setup_completion_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw new SetupUnavailable();
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query(
      `SET TRANSACTION ISOLATION LEVEL ${writes ? "SERIALIZABLE" : "REPEATABLE READ"}`
    );
    if (!writes) await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    // An uncertain commit is recovered by receipt, never by a blind new request.
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
export async function setupAuthority(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  lock: boolean
) {
  validSetupScope(merchantId, actorId);
  const [rows] = await c.execute<any[]>(
    `SELECT id,userId,status,currency,integration_source,
    businessType,businessName,phone,address,description,workingHoursType,workingHours,
    setupCompleted,setupCompletedAt,onboardingCompleted,onboardingStep,onboardingCompletedAt
    FROM merchants WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  if (rows.length !== 1) throw new SetupForbidden();
  const merchant = rows[0];
  const [users] = await c.execute<any[]>(
    `SELECT account_status FROM users WHERE id=?${lock ? " FOR SHARE" : ""}`,
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    `SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=?${lock ? " FOR SHARE" : ""}`,
    [merchantId, actorId]
  );
  const owner =
    members.length === 1
      ? members[0].role === "owner" && Number(members[0].is_active) === 1
      : members.length === 0 && Number(merchant.userId) === actorId;
  if (
    !owner ||
    merchant.status === "suspended" ||
    users[0]?.account_status !== "active"
  )
    throw new SetupForbidden();
  return merchant;
}
