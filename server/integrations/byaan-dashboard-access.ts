import { getPool } from '../db/connection';
import { hasPermission, type MerchantRole } from '../_core/permissions';
import { bookingReadId } from '../../shared/booking-read';

export class ByaanDashboardFault extends Error {
  constructor(readonly reason: 'unavailable' | 'inactive' | 'forbidden' | 'missing' | 'rate_limited' | 'provider') {
    super(`byaan_dashboard:${reason}`);
  }
}
type Executor = { execute: (sql: string, params?: any[]) => Promise<any> };
async function rows(tx: Executor, sql: string, params: any[]): Promise<any[]> {
  const result = await tx.execute(sql, params);
  if (!Array.isArray(result[0])) throw new ByaanDashboardFault('unavailable');
  return result[0];
}
/** Gate data by the selected merchant. No credentials are read or decrypted. */
export async function requireActiveByaanMerchant(merchantId: number) {
  bookingReadId.parse(merchantId);
  const pool = await getPool();
  if (!pool) throw new ByaanDashboardFault('unavailable');
  const current = await rows(pool, `SELECT m.integration_source AS source,c.is_active AS active,c.verified_at AS verifiedAt
    FROM merchants m LEFT JOIN byaan_connections c ON c.merchant_id=m.id WHERE m.id=?`, [merchantId]);
  if (current.length !== 1 || current[0].source !== 'byaan' || current[0].active !== 1 || !current[0].verifiedAt) {
    throw new ByaanDashboardFault('inactive');
  }
  return { merchant: { id: merchantId } };
}

/** Recheck authority and connection under the same locks as the FAQ update. */
export async function toggleByaanDashboardFaq(actorId: number, merchantId: number, input: { faqId: number; field: 'is_active' | 'use_in_bot'; value: boolean }) {
  bookingReadId.parse(actorId); bookingReadId.parse(merchantId); bookingReadId.parse(input.faqId);
  const pool = await getPool();
  if (!pool) throw new ByaanDashboardFault('unavailable');
  const tx = await pool.getConnection();
  let committing = false, reusable = true;
  try {
    await tx.beginTransaction();
    const merchants = await rows(tx, 'SELECT userId,status,integration_source AS source FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
    const users = await rows(tx, 'SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
    const members = await rows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const merchant = merchants[0];
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : members.length === 0 && merchant?.userId === actorId ? 'owner' : null;
    if (merchants.length !== 1 || merchant.status === 'suspended' || users.length !== 1 || users[0].account_status !== 'active' || !role || !hasPermission(role as MerchantRole, 'bot_settings.manage')) {
      throw new ByaanDashboardFault('forbidden');
    }
    const connections = await rows(tx, 'SELECT is_active AS active,verified_at AS verifiedAt FROM byaan_connections WHERE merchant_id=? FOR UPDATE', [merchantId]);
    if (merchant.source !== 'byaan' || connections.length !== 1 || connections[0].active !== 1 || !connections[0].verifiedAt) throw new ByaanDashboardFault('inactive');
    const faqs = await rows(tx, 'SELECT id FROM byaan_faqs WHERE id=? AND merchant_id=? FOR UPDATE', [input.faqId, merchantId]);
    if (faqs.length !== 1) throw new ByaanDashboardFault('missing');
    // Fixed SQL statements: never use a client-supplied identifier in SQL.
    const statement = input.field === 'is_active'
      ? 'UPDATE byaan_faqs SET is_active=? WHERE id=? AND merchant_id=?'
      : input.field === 'use_in_bot' ? 'UPDATE byaan_faqs SET use_in_bot=? WHERE id=? AND merchant_id=?' : null;
    if (!statement || typeof input.value !== 'boolean') throw new ByaanDashboardFault('unavailable');
    await tx.execute(statement, [input.value ? 1 : 0, input.faqId, merchantId]);
    committing = true; await tx.commit();
    return { success: true as const };
  } catch (error) {
    if (committing) reusable = false;
    else try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof ByaanDashboardFault) throw error;
    throw new ByaanDashboardFault('unavailable');
  } finally { if (reusable) tx.release(); else tx.destroy(); }
}
