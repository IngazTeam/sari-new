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
export const WOOCOMMERCE_MAX_QUEUED_LOCKS_PER_MERCHANT = 2;
export const WOOCOMMERCE_ADMISSION_WAIT_MS = 5_000;

type AdmissionWaiter = {
  key: string;
  resolve: (release: () => void) => void;
  reject: (error: WooCommerceMerchantLockError) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type WooCommerceAdmissionSnapshot = Readonly<{
  active: number;
  queued: number;
  peakActive: number;
  peakQueued: number;
  admittedTotal: number;
  rejectedGlobalLimit: number;
  rejectedMerchantLimit: number;
  rejectedInvalidIdentity: number;
  timedOut: number;
  activeLimit: number;
  queueLimit: number;
  merchantQueueLimit: number;
  waitMs: number;
}>;

export class WooCommerceAdmissionGate {
  private active = 0;
  private readonly activeKeys = new Set<string>();
  private readonly waiters: AdmissionWaiter[] = [];
  private readonly queuedByKey = new Map<string, number>();
  private peakActive = 0;
  private peakQueued = 0;
  private admittedTotal = 0;
  private rejectedGlobalLimit = 0;
  private rejectedMerchantLimit = 0;
  private rejectedInvalidIdentity = 0;
  private timedOut = 0;

  constructor(
    readonly maxActive: number,
    readonly maxQueue: number,
    readonly waitMs: number,
    readonly maxQueuePerKey = maxQueue,
  ) {
    if (!Number.isSafeInteger(maxActive) || maxActive <= 0) throw new TypeError('invalid_max_active');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 0) throw new TypeError('invalid_max_queue');
    if (!Number.isSafeInteger(waitMs) || waitMs <= 0) throw new TypeError('invalid_wait_ms');
    if (!Number.isSafeInteger(maxQueuePerKey) || maxQueuePerKey < 0 || maxQueuePerKey > maxQueue) {
      throw new TypeError('invalid_max_queue_per_key');
    }
  }

  acquire(key: string): Promise<() => void> {
    if (typeof key !== 'string' || key.length === 0 || key.length > 128) {
      this.rejectedInvalidIdentity += 1;
      return Promise.reject(new WooCommerceMerchantLockError('operation_capacity'));
    }
    if (this.active < this.maxActive && !this.activeKeys.has(key)) {
      this.active += 1;
      this.activeKeys.add(key);
      this.recordAdmission();
      return Promise.resolve(this.createRelease(key));
    }
    const queuedForKey = this.queuedByKey.get(key) ?? 0;
    if (this.waiters.length >= this.maxQueue) {
      this.rejectedGlobalLimit += 1;
      return Promise.reject(new WooCommerceMerchantLockError('operation_capacity'));
    }
    if (queuedForKey >= this.maxQueuePerKey) {
      this.rejectedMerchantLimit += 1;
      return Promise.reject(new WooCommerceMerchantLockError('operation_capacity'));
    }

    return new Promise((resolve, reject) => {
      const waiter: AdmissionWaiter = {
        key,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
            this.decrementQueued(key);
            this.timedOut += 1;
          }
          reject(new WooCommerceMerchantLockError('operation_capacity'));
        }, this.waitMs),
      };
      waiter.timer.unref?.();
      this.waiters.push(waiter);
      this.queuedByKey.set(key, queuedForKey + 1);
      this.peakQueued = Math.max(this.peakQueued, this.waiters.length);
    });
  }

  snapshot(): WooCommerceAdmissionSnapshot {
    return {
      active: this.active,
      queued: this.waiters.length,
      peakActive: this.peakActive,
      peakQueued: this.peakQueued,
      admittedTotal: this.admittedTotal,
      rejectedGlobalLimit: this.rejectedGlobalLimit,
      rejectedMerchantLimit: this.rejectedMerchantLimit,
      rejectedInvalidIdentity: this.rejectedInvalidIdentity,
      timedOut: this.timedOut,
      activeLimit: this.maxActive,
      queueLimit: this.maxQueue,
      merchantQueueLimit: this.maxQueuePerKey,
      waitMs: this.waitMs,
    };
  }

  private recordAdmission(): void {
    this.admittedTotal += 1;
    this.peakActive = Math.max(this.peakActive, this.active);
  }

  private decrementQueued(key: string): void {
    const remaining = (this.queuedByKey.get(key) ?? 1) - 1;
    if (remaining > 0) this.queuedByKey.set(key, remaining);
    else this.queuedByKey.delete(key);
  }

  private drain(): void {
    while (this.active < this.maxActive) {
      const index = this.waiters.findIndex(waiter => !this.activeKeys.has(waiter.key));
      if (index < 0) return;
      const [waiter] = this.waiters.splice(index, 1);
      this.decrementQueued(waiter.key);
      clearTimeout(waiter.timer);
      this.active += 1;
      this.activeKeys.add(waiter.key);
      this.recordAdmission();
      waiter.resolve(this.createRelease(waiter.key));
    }
  }

  private createRelease(key: string): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.activeKeys.delete(key);
      this.drain();
    };
  }
}

const wooCommerceAdmissionGate = new WooCommerceAdmissionGate(
  WOOCOMMERCE_MAX_CONCURRENT_LOCKS,
  WOOCOMMERCE_MAX_QUEUED_LOCKS,
  WOOCOMMERCE_ADMISSION_WAIT_MS,
  WOOCOMMERCE_MAX_QUEUED_LOCKS_PER_MERCHANT,
);

export function getWooCommerceAdmissionSnapshot(): WooCommerceAdmissionSnapshot {
  return wooCommerceAdmissionGate.snapshot();
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
  const releaseAdmission = await wooCommerceAdmissionGate.acquire(String(merchantId));
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
