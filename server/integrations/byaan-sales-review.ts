import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { databaseTimeEpoch } from '../db/time';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { hasPermission } from '../_core/permissions';
import { BYAAN_SALES_OPERATION_REQUIREMENTS, byaanSalesTransaction, readByaanSalesHistoricalReceipt } from './byaan-sales-operations';
import { byaanSalesReviewAccess, byaanSalesReviewInput, byaanSalesReviewPage } from '../../shared/byaan-sales-review';

const id = z.number().int().positive().max(2147483647);
const unavailable = (): never => { throw Error('Byaan sales review unavailable'); };
async function authorize(c: PoolConnection, merchantId: number, actorId: number) {
  // Fresh persisted authority, including the owner's account, even for team members.
  // No provider connection is needed to inspect historical local operations.
  const [merchants] = await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
  if (merchants.length !== 1 || merchants[0].status !== 'active') return unavailable();
  const [users] = await c.execute<any[]>('SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE', [actorId, merchants[0].userId]);
  if (!users.some(u => u.id === actorId) || !users.some(u => u.id === merchants[0].userId)
    || users.some(u => u.account_status !== 'active')) return unavailable();
  const [members] = await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
  if (members.length > 1 || (members.length ? !members[0].is_active || !hasPermission(members[0].role, 'orders.manage') : merchants[0].userId !== actorId)) return unavailable();
}
export async function byaanSalesReviewAuthority(merchantId: number, actorId: number) {
  try {
    id.parse(merchantId); id.parse(actorId);
    return await byaanSalesTransaction(async c => {
      await authorize(c, merchantId, actorId);
      return byaanSalesReviewAccess.parse({ merchantId });
    });
  } catch { return unavailable(); }
}
/** Bounded historical read. Never resumes a worker, writes a result, decrypts a
 * connection, calls the provider, publishes a payment link, or sends a message. */
export async function listByaanSalesOperations(merchantId: number, actorId: number, raw: z.infer<typeof byaanSalesReviewInput>) {
  try {
    id.parse(merchantId); id.parse(actorId);
    const input = byaanSalesReviewInput.parse(raw);
    await assertRuntimeSchema('Byaan sales review', BYAAN_SALES_OPERATION_REQUIREMENTS, { cacheSuccess: false });
    return await byaanSalesTransaction(async c => {
      await authorize(c, merchantId, actorId);
      const [rows] = await c.execute<any[]>(`SELECT * FROM byaan_sales_operations WHERE merchant_id=?
        ${input.beforeId ? 'AND id<?' : ''} ORDER BY id DESC LIMIT 21 FOR SHARE`, [merchantId, ...(input.beforeId ? [input.beforeId] : [])]);
      const items = rows.slice(0, 20).map(row => {
        let evidence: 'pending' | 'consistent' | 'invalid' = 'invalid', reference: string | null = null;
        try {
          if (['preparing', 'dispatching'].includes(row.state)) {
            if (row.result_json !== null || row.result_hash !== null) throw Error('Unexpected pending result');
            evidence = 'pending';
          } else {
            const receipt = readByaanSalesHistoricalReceipt(row);
            if (receipt.success) reference = row.operation_kind === 'enrollment' ? receipt.enrollmentId! : receipt.invoiceId!;
            evidence = 'consistent';
          }
        } catch { /* Keep a damaged row visible without exposing its contents. */ }
        return { id: row.id, requestId: row.request_id, kind: row.operation_kind, state: row.state,
          createdAt: new Date(databaseTimeEpoch(row.created_at)).toISOString(), updatedAt: new Date(databaseTimeEpoch(row.updated_at)).toISOString(),
          evidence, reference, providerStatus: 'not_checked', paymentEvidence: 'not_verified' };
      });
      return byaanSalesReviewPage.parse({ merchantId, items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null });
    });
  } catch { return unavailable(); }
}
