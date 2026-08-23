import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';

export class WooCommerceMerchantLockError extends Error {
  constructor(readonly code: 'invalid_merchant' | 'database_unavailable' | 'merchant_lock_timeout' | 'operation_capacity') {
    super(code);
    this.name = 'WooCommerceMerchantLockError';
  }
}

export const WOOCOMMERCE_MAX_CONCURRENT_LOCKS = 8;
export const WOOCOMMERCE_MAX_QUEUED_LOCKS = 64;
export const WOOCOMMERCE_ADMISSION_WAIT_MS = 5_000;

type AdmissionWaiter = {
  resolve: (release: () => void) => void;
  reject: (error: WooCommerceMerchantLockError) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class WooCommerceAdmissionGate {
  private active = 0;
  private readonly waiters: AdmissionWaiter[] = [];

  constructor(
    readonly maxActive: number,
    readonly maxQueue: number,
    readonly waitMs: number,
  ) {
    if (!Number.isSafeInteger(maxActive) || maxActive <= 0) throw new TypeError('invalid_max_active');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 0) throw new TypeError('invalid_max_queue');
    if (!Number.isSafeInteger(waitMs) || waitMs <= 0) throw new TypeError('invalid_wait_ms');
  }

  acquire(): Promise<() => void> {
    if (this.active < this.maxActive) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }
    if (this.waiters.length >= this.maxQueue) {
      return Promise.reject(new WooCommerceMerchantLockError('operation_capacity'));
    }

    return new Promise((resolve, reject) => {
      const waiter: AdmissionWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new WooCommerceMerchantLockError('operation_capacity'));
        }, this.waitMs),
      };
      waiter.timer.unref?.();
      this.waiters.push(waiter);
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(this.createRelease());
      } else {
        this.active -= 1;
      }
    };
  }
}

const wooCommerceAdmissionGate = new WooCommerceAdmissionGate(
  WOOCOMMERCE_MAX_CONCURRENT_LOCKS,
  WOOCOMMERCE_MAX_QUEUED_LOCKS,
  WOOCOMMERCE_ADMISSION_WAIT_MS,
);

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
  const releaseAdmission = await wooCommerceAdmissionGate.acquire();
  try {
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
  } finally {
    releaseAdmission();
  }
}
