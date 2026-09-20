import { getPool } from '../db/connection';
import { ALL_ROLES, type MerchantRole } from '../_core/permissions';

export type MerchantAccess = { merchantId: number; role: MerchantRole; memberId: number | null };
export class MerchantSelectionRequiredError extends Error {
  constructor() { super('Merchant selection required'); this.name = 'MerchantSelectionRequiredError'; }
}

/** Resolves server-owned identity. Read failures never become owner access. */
export async function resolveMerchantAccess(userId: number, selectedMerchantId?: number): Promise<MerchantAccess | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (selectedMerchantId !== undefined && (!Number.isSafeInteger(selectedMerchantId) || selectedMerchantId <= 0)) return null;
  const pool = await getPool();
  if (!pool) throw new Error('Merchant identity source unavailable');
  const [rows] = await pool.execute(
    `SELECT mm.id AS memberId, mm.merchant_id AS merchantId, mm.role
     FROM merchant_members mm INNER JOIN merchants m ON m.id = mm.merchant_id
     WHERE mm.user_id = ? AND mm.is_active = 1 AND m.status <> 'suspended'
     ${selectedMerchantId === undefined ? '' : 'AND m.id = ?'}
     UNION ALL
     SELECT NULL AS memberId, m.id AS merchantId, 'owner' AS role FROM merchants m
     WHERE m.userId = ? AND m.status <> 'suspended'
       AND NOT EXISTS (SELECT 1 FROM merchant_members mm WHERE mm.merchant_id = m.id AND mm.user_id = ?)
       ${selectedMerchantId === undefined ? '' : 'AND m.id = ?'}
     ORDER BY merchantId ASC LIMIT 2`, selectedMerchantId === undefined ? [userId, userId, userId] : [userId, selectedMerchantId, userId, userId, selectedMerchantId],
  );
  const memberships = rows as MerchantAccess[];
  // No selection means a unique membership is required. Never guess between tenants.
  if (memberships.length > 1) throw new MerchantSelectionRequiredError();
  if (memberships.length === 1) {
    const membership = memberships[0];
    if (!ALL_ROLES.includes(membership.role) || !Number.isSafeInteger(membership.merchantId)) return null;
    return membership;
  }
  return null;
}

export async function listMerchantAccess(userId: number): Promise<Array<MerchantAccess & { businessName: string }>> {
  const pool = await getPool();
  if (!pool) throw new Error('Merchant identity source unavailable');
  const [rows] = await pool.execute(
    `SELECT m.id AS merchantId, m.businessName, mm.id AS memberId, mm.role
     FROM merchant_members mm JOIN merchants m ON m.id = mm.merchant_id
     WHERE mm.user_id = ? AND mm.is_active = 1 AND m.status <> 'suspended'
     UNION ALL
     SELECT m.id AS merchantId, m.businessName, NULL AS memberId, 'owner' AS role FROM merchants m
     WHERE m.userId = ? AND m.status <> 'suspended'
       AND NOT EXISTS (SELECT 1 FROM merchant_members mm WHERE mm.merchant_id = m.id AND mm.user_id = ?)
     ORDER BY merchantId LIMIT 100`, [userId, userId, userId],
  );
  return (rows as Array<MerchantAccess & { businessName: string }>).filter(row => ALL_ROLES.includes(row.role));
}
