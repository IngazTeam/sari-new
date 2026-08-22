import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { ZidProductSyncError } from './zid-product-normalization';

type LockRow = RowDataPacket & { acquired: number | null };

/** Serialize manual Zid syncs for one merchant across all application nodes. */
export async function withZidSyncLock<T>(merchantId: number, task: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new ZidProductSyncError('busy');
  const pool = await getPool();
  if (!pool) throw new Error('Database not initialized');
  const connection = await pool.getConnection();
  const lockName = `sari:zid:sync:${merchantId}`;
  let acquired = false;
  try {
    const [rows] = await connection.execute<LockRow[]>('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) throw new ZidProductSyncError('busy');
    return await task();
  } finally {
    if (acquired) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
    }
    connection.release();
  }
}
