import { getPool } from "../db/connection";
import { ALL_ROLES } from "../_core/permissions";
import { merchantWorkspaceIdentity } from "../../shared/merchant-workspace-identity";
export class MerchantWorkspaceIdentityError extends Error {
  constructor(readonly reason: "forbidden" | "unavailable") {
    super("merchant_identity:" + reason);
  }
}
/** One SQL snapshot; returns no profile fields, integration secrets or owner data. */
export async function readMerchantWorkspaceIdentity(
  actorId: number,
  merchantId: number
) {
  if (
    ![actorId, merchantId].every(
      n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647
    )
  )
    throw new MerchantWorkspaceIdentityError("forbidden");
  const pool = await getPool();
  if (!pool) throw new MerchantWorkspaceIdentityError("unavailable");
  const [rows] = await pool.execute(
    `SELECT m.id,actor.id AS actorId FROM merchants m
 INNER JOIN users owner ON owner.id=m.userId AND owner.account_status='active'
 INNER JOIN users actor ON actor.id=? AND actor.account_status='active'
 LEFT JOIN merchant_members mm ON mm.merchant_id=m.id AND mm.user_id=actor.id
 WHERE m.id=? AND m.status IN ('active','pending')
 AND ((mm.id IS NULL AND m.userId=actor.id) OR (mm.is_active=1 AND mm.role IN (${ALL_ROLES.map(() => "?").join(",")})))
 ORDER BY mm.id LIMIT 2`,
    [actorId, merchantId, ...ALL_ROLES]
  );
  if (!Array.isArray(rows) || rows.length !== 1)
    throw new MerchantWorkspaceIdentityError("forbidden");
  const result = merchantWorkspaceIdentity.safeParse(rows[0]);
  if (
    !result.success ||
    result.data.actorId !== actorId ||
    result.data.id !== merchantId
  )
    throw new MerchantWorkspaceIdentityError("unavailable");
  return result.data;
}
