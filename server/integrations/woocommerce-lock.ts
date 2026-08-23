import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';

export class WooCommerceMerchantLockError extends Error {
  constructor(readonly code: 'invalid_merchant' | 'database_unavailable' | 'merchant_lock_timeout') {
    super(code);
    this.name = 'WooCommerceMerchantLockError';
  }
}

export async function finalizeWooCommerceMerchantLockConnection(
  connection: PoolConnection,
  lockName: string | null,
  reusable = true,
): Promise<void> {
  let safeToReuse = reusable;
  if (lockName && safeToReuse) {
    try {
      const [rows] = await connection.query<RowDataPacket[]>('SELECT RELEASE_LOCK(?) AS released', [lockName]);
      safeToReuse = Number(rows[0]?.released) === 1;
    } catch {
      safeToReuse = false;
    }
  }
  if (safeToReuse) connection.release();
  else connection.destroy();
}

export async function withWooCommerceMerchantLock<T>(
  merchantId: number,
  action: () => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new WooCommerceMerchantLockError('invalid_merchant');
  }
  const pool = await getPool();
  if (!pool) throw new WooCommerceMerchantLockError('database_unavailable');
  const connection = await pool.getConnection();
  const lockName = `sari:woocommerce:${merchantId}`;
  let acquired = false;
  let reusable = true;
  try {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 20) AS acquired', [lockName]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) throw new WooCommerceMerchantLockError('merchant_lock_timeout');
    return await action();
  } catch (error) {
    if (!(error instanceof WooCommerceMerchantLockError) && !acquired) reusable = false;
    throw error;
  } finally {
    await finalizeWooCommerceMerchantLockConnection(connection, acquired ? lockName : null, reusable);
  }
}
