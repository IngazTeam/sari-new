import { AsyncLocalStorage } from 'node:async_hooks';
import { TRPCError } from '@trpc/server';
import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from '../../drizzle/schema';
import { ZodError } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { getDb } from '../db';
import {
  hasPermission,
  type Permission,
  type MerchantRole,
} from '../_core/permissions';
import { assertTeamSession } from '../accounts/team-session';

export type LoyaltyScope = {
  merchantId: number;
  actorId: number;
  sessionId: string;
  permission: Permission;
};
const current = new AsyncLocalStorage<{
  merchantId: number;
  tx: PoolConnection;
  db: MySql2Database<typeof schema>;
}>();
export const loyaltyContext = () => current.getStore();
export async function loyaltyDatabase() {
  const db = current.getStore()?.db ?? (await getDb());
  if (!db)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'loyalty:unavailable',
    });
  return db;
}
/** Every balance writer, including workers, locks the same merchant before any child row. */
export async function withLoyaltyTransaction<T>(
  merchantId: number,
  work: () => Promise<T>,
  scope?: LoyaltyScope
): Promise<T> {
  const nested = current.getStore();
  if (nested) {
    if (nested.merchantId !== merchantId || scope)
      throw new TRPCError({ code: 'FORBIDDEN' });
    return work();
  }
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw new TRPCError({ code: 'BAD_REQUEST' });
  const pool = await getPool();
  if (!pool)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'loyalty:unavailable',
    });
  const tx = await pool.getConnection();
  let committing = false,
    reusable = true;
  try {
    await tx.beginTransaction();
    const [stores] = await tx.execute<any[]>(
      "SELECT id,userId FROM merchants WHERE id=? AND status IN ('active','pending') FOR UPDATE",
      [merchantId]
    );
    if (stores.length !== 1) throw new TRPCError({ code: 'FORBIDDEN' });
    const actorId = scope?.actorId ?? stores[0].userId;
    const [users] = await tx.execute<any[]>(
      'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE',
      [stores[0].userId, actorId]
    );
    if (
      [stores[0].userId, actorId].some(
        id => users.find(u => u.id === id)?.account_status !== 'active'
      )
    )
      throw new TRPCError({ code: 'FORBIDDEN' });
    if (scope) {
      if (scope.merchantId !== merchantId)
        throw new TRPCError({ code: 'FORBIDDEN' });
      const [members] = await tx.execute<any[]>(
        'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',
        [merchantId, actorId]
      );
      const role =
        members.length === 1 && members[0].is_active === 1
          ? members[0].role
          : members.length === 0 && stores[0].userId === actorId
            ? 'owner'
            : null;
      if (!role || !hasPermission(role as MerchantRole, scope.permission))
        throw new TRPCError({ code: 'FORBIDDEN' });
      await assertTeamSession(tx, actorId, scope.sessionId);
    }
    const value = await current.run(
      {
        merchantId,
        tx,
        db: drizzle(tx),
      },
      work
    );
    committing = true;
    await tx.commit();
    return value;
  } catch (error) {
    if (committing) {
      reusable = false;
      tx.destroy();
    } else
      try {
        await tx.rollback();
      } catch {
        reusable = false;
        tx.destroy();
      }
    if (error instanceof TRPCError) throw error;
    if (error instanceof ZodError)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'loyalty:invalid_fields',
      });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: committing ? 'loyalty:unknown' : 'loyalty:unavailable',
    });
  } finally {
    if (reusable) tx.release();
  }
}
