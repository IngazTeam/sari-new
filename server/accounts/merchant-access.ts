import { getPool } from '../db/connection';
import { ALL_ROLES, type MerchantRole } from '../_core/permissions';

export type MerchantAccess = { merchantId: number; role: MerchantRole; memberId: number | null };

/** Resolves server-owned identity. Read failures never become owner access. */
export async function resolveMerchantAccess(userId: number): Promise<MerchantAccess | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const pool = await getPool();
  if (!pool) throw new Error('Merchant identity source unavailable');
  const [rows] = await pool.execute(
    `SELECT mm.id AS memberId, mm.merchant_id AS merchantId, mm.role
     FROM merchant_members mm INNER JOIN merchants m ON m.id = mm.merchant_id
     WHERE mm.user_id = ? AND mm.is_active = 1 AND m.status <> 'suspended'
     ORDER BY mm.id ASC LIMIT 2`, [userId],
  );
  const memberships = rows as MerchantAccess[];
  // There is currently no authenticated store selector. Never guess between tenants.
  if (memberships.length > 1) throw new Error('Merchant selection required');
  if (memberships.length === 1) {
    const membership = memberships[0];
    if (!ALL_ROLES.includes(membership.role) || !Number.isSafeInteger(membership.merchantId)) return null;
    return membership;
  }
  // Explicit compatibility for owners who have never had a membership for this store.
  // An inactive/revoked membership must not regain access through merchants.userId.
  const [legacyRows] = await pool.execute(
    `SELECT m.id AS merchantId FROM merchants m
     WHERE m.userId = ? AND m.status <> 'suspended'
       AND NOT EXISTS (SELECT 1 FROM merchant_members mm WHERE mm.merchant_id = m.id AND mm.user_id = ?)
     ORDER BY m.id ASC LIMIT 2`, [userId, userId],
  );
  const legacy = legacyRows as Array<{ merchantId: number }>;
  if (legacy.length > 1) throw new Error('Merchant selection required');
  return legacy.length === 1 ? { merchantId: legacy[0].merchantId, role: 'owner', memberId: null } : null;
}
