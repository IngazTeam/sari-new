import { eq, sql } from 'drizzle-orm';
import { merchants, sariResponseCache, sessionContexts } from '../../drizzle/schema';
import { getDb, type SariDb } from '../db/connection';
import { destroyMerchantSessions } from '../ai/session-context';

export type KnowledgeTransaction = Parameters<Parameters<SariDb['transaction']>[0]>[0];

function isDeadlock(error: unknown): boolean {
  for (let depth = 0; error && typeof error === 'object' && depth < 5; depth++) {
    if ((error as { code?: string }).code === 'ER_LOCK_DEADLOCK') return true;
    error = (error as { cause?: unknown }).cause;
  }
  return false;
}

/** DB-only callback: a rolled-back deadlock may retry. No network or external effects here. */
export async function withKnowledgeTransaction<T>(merchantId: number, write: (tx: KnowledgeTransaction) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error('Invalid merchant');
  const database = await getDb();
  if (!database) throw new Error('Database unavailable');
  const transact = () => database.transaction(async tx => {
    const merchant = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
    if (!merchant.length) throw new Error('Merchant not found');
    const value = await write(tx);
    // Remove the cached answer text as well as its eligibility for use.
    await tx.delete(sariResponseCache).where(eq(sariResponseCache.merchantId, merchantId));
    // Keep the tombstone so rebuilds supplying an old session version fail their CAS check.
    await tx.update(sessionContexts).set({ contextJson: 'null', expiresAt: sql`UTC_TIMESTAMP()`, version: sql`${sessionContexts.version} + 1` })
      .where(eq(sessionContexts.merchantId, merchantId));
    return value;
  });
  for (let attempt = 0; ; attempt++) {
    let result: T;
    try { result = await transact(); }
    catch (error) {
      // MySQL has rolled back this transaction. Never retry unknown commit outcomes.
      if (!isDeadlock(error) || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      continue;
    }
    // Each worker reads the durable version on the next message; evict this process immediately.
    destroyMerchantSessions(merchantId);
    return result;
  }
}
